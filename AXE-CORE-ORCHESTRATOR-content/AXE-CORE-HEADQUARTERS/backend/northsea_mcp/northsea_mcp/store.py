"""Lokale, duurzame staat van de MCP-server: OAuth, tokens, idempotentie, limieten.

## Waarom SQLite op de box en geen nieuwe Supabase-tabellen

Tokens en OAuth-codes zijn staat van DEZE server, geen NorthSea-bedrijfsdata. Ze
in AXE Commodities zetten zou een schemawijziging op de productie-database van
een draaiend bedrijf vragen voor iets wat daar niet hoort. Eén bestand naast de
service (WAL, één proces) is duurzaam over herstarts en heeft geen extra
afhankelijkheid.

## Tokens worden nooit bewaard, alleen hun hash

Een gelekte kopie van dit bestand geeft geen bruikbare tokens: opgeslagen is
SHA-256 van het token. Het token zelf ziet alleen de client, één keer.
"""
from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass

SCHEMA = """
create table if not exists oauth_clients (
  client_id text primary key,
  client_name text,
  redirect_uris text not null,          -- json array
  token_endpoint_auth_method text not null default 'none',
  client_secret_hash text,
  metadata text not null default '{}',
  created_at integer not null
);
create table if not exists auth_codes (
  code_hash text primary key,
  client_id text not null,
  redirect_uri text not null,
  code_challenge text not null,
  scopes text not null,
  resource text not null,
  subject text not null,
  expires_at integer not null,
  used integer not null default 0
);
create table if not exists tokens (
  token_hash text primary key,
  kind text not null,                   -- access | refresh | service
  client_id text not null,
  subject text not null,
  scopes text not null,
  resource text not null,
  label text,
  expires_at integer,                   -- null = verloopt niet (alleen service)
  revoked integer not null default 0,
  family text not null,                 -- refresh-rotatie: hergebruik trekt de hele familie in
  created_at integer not null
);
create index if not exists tokens_family on tokens(family);
create table if not exists idempotency (
  principal text not null,
  tool text not null,
  key text not null,
  args_hash text not null,
  result text,
  status text not null,                 -- running | done
  created_at integer not null,
  primary key (principal, tool, key)
);
create table if not exists rate_events (
  bucket text not null,
  at real not null
);
create index if not exists rate_bucket on rate_events(bucket, at);
create table if not exists audit_fallback (
  id integer primary key autoincrement,
  row text not null,
  created_at integer not null
);
"""


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_token(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(32)}"


@dataclass(frozen=True)
class TokenRecord:
    kind: str
    client_id: str
    subject: str
    scopes: tuple[str, ...]
    resource: str
    expires_at: int | None
    family: str
    label: str | None


class Store:
    def __init__(self, path: str):
        self.path = path
        self._lock = threading.RLock()
        self._db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._db.execute("pragma journal_mode=wal")
        self._db.execute("pragma busy_timeout=5000")
        self._db.executescript(SCHEMA)

    @contextmanager
    def tx(self):
        with self._lock:
            self._db.execute("begin immediate")
            try:
                yield self._db
                self._db.execute("commit")
            except Exception:
                self._db.execute("rollback")
                raise

    def ping(self) -> bool:
        with self._lock:
            return self._db.execute("select 1").fetchone() == (1,)

    # ── OAuth-clients ──────────────────────────────────────────────────────────
    def save_client(self, client_id: str, client_name: str | None, redirect_uris: list[str],
                    auth_method: str = "none", client_secret: str | None = None, metadata: dict | None = None) -> None:
        with self.tx() as db:
            db.execute(
                "insert or replace into oauth_clients values (?,?,?,?,?,?,?)",
                (client_id, client_name, json.dumps(redirect_uris), auth_method,
                 token_hash(client_secret) if client_secret else None, json.dumps(metadata or {}), int(time.time())),
            )

    def get_client(self, client_id: str) -> dict | None:
        with self._lock:
            r = self._db.execute(
                "select client_id, client_name, redirect_uris, token_endpoint_auth_method, client_secret_hash, metadata "
                "from oauth_clients where client_id=?", (client_id,)).fetchone()
        if not r:
            return None
        return {"client_id": r[0], "client_name": r[1], "redirect_uris": json.loads(r[2]),
                "token_endpoint_auth_method": r[3], "client_secret_hash": r[4], "metadata": json.loads(r[5])}

    # ── Autorisatiecodes ───────────────────────────────────────────────────────
    def save_code(self, code: str, *, client_id: str, redirect_uri: str, code_challenge: str,
                  scopes: list[str], resource: str, subject: str, ttl_s: int) -> None:
        with self.tx() as db:
            db.execute("insert into auth_codes values (?,?,?,?,?,?,?,?,0)",
                       (token_hash(code), client_id, redirect_uri, code_challenge, " ".join(scopes),
                        resource, subject, int(time.time()) + ttl_s))

    def consume_code(self, code: str) -> dict | None:
        """Eénmalig: een tweede inwisseling van dezelfde code faalt (RFC 6749 §4.1.2)."""
        with self.tx() as db:
            r = db.execute("select client_id, redirect_uri, code_challenge, scopes, resource, subject, expires_at, used "
                           "from auth_codes where code_hash=?", (token_hash(code),)).fetchone()
            if not r:
                return None
            db.execute("update auth_codes set used=1 where code_hash=?", (token_hash(code),))
        if r[7] or r[6] < time.time():
            return None
        return {"client_id": r[0], "redirect_uri": r[1], "code_challenge": r[2], "scopes": r[3].split(),
                "resource": r[4], "subject": r[5]}

    # ── Tokens ─────────────────────────────────────────────────────────────────
    def issue(self, *, kind: str, client_id: str, subject: str, scopes: list[str] | tuple[str, ...], resource: str,
              ttl_s: int | None, family: str | None = None, label: str | None = None) -> str:
        prefix = {"access": "nsat", "refresh": "nsrt", "service": "nsst"}[kind]
        token = new_token(prefix)
        with self.tx() as db:
            db.execute("insert into tokens values (?,?,?,?,?,?,?,?,0,?,?)",
                       (token_hash(token), kind, client_id, subject, " ".join(scopes), resource, label,
                        int(time.time()) + ttl_s if ttl_s else None, family or secrets.token_hex(8), int(time.time())))
        return token

    def lookup(self, token: str, kind: str | tuple[str, ...]) -> TokenRecord | None:
        kinds = (kind,) if isinstance(kind, str) else kind
        with self._lock:
            r = self._db.execute("select kind, client_id, subject, scopes, resource, expires_at, revoked, family, label "
                                 "from tokens where token_hash=?", (token_hash(token),)).fetchone()
        if not r or r[0] not in kinds or r[6]:
            return None
        if r[5] is not None and r[5] < time.time():
            return None
        return TokenRecord(r[0], r[1], r[2], tuple(r[3].split()), r[4], r[5], r[7], r[8])

    def rotate_refresh(self, token: str) -> TokenRecord | None:
        """Wisselt een refresh-token in. Hergebruik van een al gebruikt token trekt
        de hele familie in (OAuth 2.1 refresh token rotation)."""
        h = token_hash(token)
        with self.tx() as db:
            r = db.execute("select kind, client_id, subject, scopes, resource, expires_at, revoked, family, label "
                           "from tokens where token_hash=?", (h,)).fetchone()
            if not r or r[0] != "refresh":
                return None
            if r[6]:
                db.execute("update tokens set revoked=1 where family=?", (r[7],))
                return None
            if r[5] is not None and r[5] < time.time():
                return None
            db.execute("update tokens set revoked=1 where token_hash=?", (h,))
        return TokenRecord(r[0], r[1], r[2], tuple(r[3].split()), r[4], r[5], r[7], r[8])

    def revoke(self, token: str) -> bool:
        with self.tx() as db:
            r = db.execute("select family from tokens where token_hash=?", (token_hash(token),)).fetchone()
            if not r:
                return False
            db.execute("update tokens set revoked=1 where family=?", (r[0],))
            return True

    def revoke_label(self, label: str) -> int:
        with self.tx() as db:
            return db.execute("update tokens set revoked=1 where label=? and revoked=0", (label,)).rowcount

    def revoke_client(self, client_id: str) -> int:
        with self.tx() as db:
            return db.execute("update tokens set revoked=1 where client_id=? and revoked=0", (client_id,)).rowcount

    def list_tokens(self) -> list[dict]:
        with self._lock:
            rows = self._db.execute("select kind, client_id, subject, scopes, label, expires_at, revoked, created_at "
                                    "from tokens where kind in ('service','refresh') order by created_at desc").fetchall()
        return [dict(zip(("kind", "client_id", "subject", "scopes", "label", "expires_at", "revoked", "created_at"), r))
                for r in rows]

    # ── Idempotentie ───────────────────────────────────────────────────────────
    def idem_begin(self, principal: str, tool: str, key: str, args_hash: str, *, now: float | None = None) -> tuple[str, dict | None]:
        """('new', None) | ('done', result) | ('running', None) | ('conflict', None)."""
        with self.tx() as db:
            r = db.execute("select args_hash, result, status from idempotency where principal=? and tool=? and key=?",
                           (principal, tool, key)).fetchone()
            if r is None:
                db.execute("insert into idempotency values (?,?,?,?,null,'running',?)",
                           (principal, tool, key, args_hash, int(now if now is not None else time.time())))
                return "new", None
        if r[0] != args_hash:
            return "conflict", None
        if r[2] == "done":
            return "done", json.loads(r[1])
        return "running", None

    def idem_finish(self, principal: str, tool: str, key: str, result: dict) -> None:
        with self.tx() as db:
            db.execute("update idempotency set result=?, status='done' where principal=? and tool=? and key=?",
                       (json.dumps(result, default=str), principal, tool, key))

    def idem_abort(self, principal: str, tool: str, key: str) -> None:
        """Een mislukte poging mag opnieuw -- maar alleen als er niets is gebeurd."""
        with self.tx() as db:
            db.execute("delete from idempotency where principal=? and tool=? and key=? and status='running'",
                       (principal, tool, key))

    def list_stuck(self, older_than_s: float = 300.0, now: float | None = None) -> list[dict]:
        """'running' rijen ouder dan older_than_s: het proces stierf tussen idem_begin en
        idem_finish/idem_abort in (bv. een crash midden in een tool-call). Alleen lezen --
        gebruikt voor zichtbaarheid (northsea_get_engine_status/health), sweep_stuck() ruimt op."""
        grens = (now if now is not None else time.time()) - older_than_s
        with self._lock:
            rows = self._db.execute(
                "select principal, tool, key, created_at from idempotency where status='running' and created_at < ? "
                "order by created_at asc", (int(grens),)).fetchall()
        return [dict(zip(("principal", "tool", "key", "created_at"), r)) for r in rows]

    def sweep_stuck(self, older_than_s: float = 300.0, now: float | None = None) -> int:
        """Ruimt 'running' rijen ouder dan older_than_s op (de aanroeper crashte kennelijk
        vóór idem_finish/idem_abort). Verwijderen, niet op 'failed' zetten: dat laat een
        latere, legitieme poging met dezelfde idempotency_key gewoon opnieuw beginnen in
        plaats van voor altijd 'in_progress' te blijven. Geeft het aantal opgeruimde rijen
        terug zodat de aanroeper het kan loggen/auditen."""
        grens = (now if now is not None else time.time()) - older_than_s
        with self.tx() as db:
            cur = db.execute("delete from idempotency where status='running' and created_at < ?", (int(grens),))
            return cur.rowcount if cur.rowcount is not None and cur.rowcount >= 0 else 0

    # ── Limieten (glijdend venster) ───────────────────────────────────────────
    def hit(self, bucket: str, window_s: float, limit: int, now: float | None = None) -> tuple[bool, int, float]:
        """Telt één aanroep. Geeft (toegestaan, resterend, seconden_tot_vrij)."""
        now = time.time() if now is None else now
        with self.tx() as db:
            db.execute("delete from rate_events where bucket=? and at<?", (bucket, now - window_s))
            rows = db.execute("select at from rate_events where bucket=? order by at", (bucket,)).fetchall()
            if len(rows) >= limit:
                return False, 0, max(0.0, rows[0][0] + window_s - now)
            db.execute("insert into rate_events values (?,?)", (bucket, now))
            return True, limit - len(rows) - 1, 0.0

    # ── Audit-vangnet ─────────────────────────────────────────────────────────
    def audit_fallback(self, row: dict) -> None:
        with self.tx() as db:
            db.execute("insert into audit_fallback(row, created_at) values (?,?)",
                       (json.dumps(row, default=str), int(time.time())))

    def pending_audit(self, limit: int = 100) -> list[tuple[int, dict]]:
        with self._lock:
            rows = self._db.execute("select id, row from audit_fallback order by id limit ?", (limit,)).fetchall()
        return [(r[0], json.loads(r[1])) for r in rows]

    def drop_audit(self, ids: list[int]) -> None:
        if not ids:
            return
        with self.tx() as db:
            db.executemany("delete from audit_fallback where id=?", [(i,) for i in ids])
