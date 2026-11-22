"""Kijken vraagt geen ok (22 nov, gemeten in 72 uur goedkeuringen van Luka)."""
from __future__ import annotations

import pytest

import beslis_beleid as bb

VRIJ = [
    "crontab -l", "crontab -l -u northsea-mcp", "crontab -l | grep corporateJets",
    "df -h /var/lib/docker",
    "docker compose -f /opt/axe-core/docker-compose.yml ps", "docker-compose -f /opt/axe-core/docker-compose.yml ps",
    "docker-compose -v", "docker network inspect root_default",
    "supabase functions list --project-ref axe-companion",
    "systemctl status supabase-intel-proxy.service || echo none",
    "ssh -o ConnectTimeout=30 -T strato-dax 'docker logs dax-browser-01 --tail 50'",
    "ssh -o ConnectTimeout=30 -T -- strato-dax docker system info",
]
GEVRAAGD = [
    "crontab -r", "docker container prune -f", "systemctl restart northsea-mcp",
    "ssh strato-dax 'docker restart dax-browser-01'", "ssh evil.com 'docker ps'",
    "docker compose -f x.yml up -d", "docker inspect dax-northsea-01",
    "crontab -l; crontab -r", "docker-compose -f x.yml down",
    "ssh strato-dax 'docker ps; docker rm -f x'",
]


@pytest.mark.parametrize("cmd", VRIJ)
def test_kijken_is_vrij(cmd):
    assert bb.shell_auto_reden(cmd) == "in-plan: read-only inspection"


@pytest.mark.parametrize("cmd", GEVRAAGD)
def test_veranderen_blijft_gevraagd(cmd):
    assert bb.shell_auto_reden(cmd) is None


def test_beslist_deal_wordt_7_dagen_niet_opnieuw_gevraagd():
    from datetime import datetime, timezone

    class Q:
        def __init__(self, rijen): self.rijen = rijen
        def select(self, *_a): return self
        def in_(self, *_a): return self
        def eq(self, *_a): return self
        def gte(self, *_a): return self
        def order(self, *_a, **_k): return self
        def limit(self, *_a): return self
        def execute(self): return type("R", (), {"data": self.rijen})()

    rij = {"status": "approved", "decided_at": datetime.now(timezone.utc).isoformat(),
           "metadata": {"deal_id": "75fcab46", "deal_code": "75fcab46"}}
    db = type("DB", (), {"table": lambda self, n: Q([rij])})()
    assert bb.recent_beslist_deal(db, deal_id="75fcab46")
    assert bb.recent_beslist_deal(db, deal_id="anders") is None
    assert bb.recent_beslist_deal(db) is None
