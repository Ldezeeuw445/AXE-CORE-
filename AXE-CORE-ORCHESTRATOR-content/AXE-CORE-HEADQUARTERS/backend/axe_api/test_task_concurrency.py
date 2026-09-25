"""De worker draait taken echt naast elkaar, en stopt netjes bij annuleren.

Drie dingen worden hier bewezen:
  1. K slots claimen en draaien tegelijk (en elke taak precies één keer).
  2. Een stille bak wordt daar niet K keer zo duur van in claim-aanroepen.
  3. Een geannuleerde taak wordt niet alsnog naar verifying/retrying geduwd.
"""
from __future__ import annotations

import asyncio
import threading
import time
from types import SimpleNamespace
from typing import Any

import agent_loop
import task_worker as tw
from task_worker import TaskWorker, WorkSignal, run_slot, run_slots

# task_worker vangt precies dit symbool op; zolang agent_loop het contract nog
# niet levert is het zijn eigen vangnetklasse, en daarna de echte. Zo test dit
# bestand altijd wat de worker werkelijk opvangt.
TaskCancelled = tw.TaskCancelled

LEASE = "11111111-1111-4111-8111-111111111111"


def maak_taak(nummer: int, capability: str = "test") -> dict[str, Any]:
    return {
        "id": f"taak-{nummer}",
        "capability": capability,
        "lease_token": LEASE,
        "worker_id": "test:slot-0",
        "attempt": 1,
        "max_attempts": 3,
        "checkpoint": {},
        "payload": {"request": "doe iets"},
        "goal": "doe iets",
        "title": "doe iets",
    }


class NepRepo:
    """Net genoeg van TaskRepository om een echte slot-lus te laten draaien."""

    def __init__(self, taken: list[dict[str, Any]] | None = None, fout_bij_overgang=None):
        self._wachtrij = list(taken or [])
        self._slot = threading.Lock()
        self.claim_aanroepen = 0
        self.claims: list[tuple[str, str]] = []
        self.overgangen: list[tuple[str, str]] = []
        self.stappen: list[tuple[str, str]] = []
        self.events: list[str] = []
        self._fout_bij_overgang = fout_bij_overgang

    # -- lezen/claimen ---------------------------------------------------
    def claim(self, worker_id: str, lease_seconds: int) -> dict[str, Any] | None:
        with self._slot:
            self.claim_aanroepen += 1
            if not self._wachtrij:
                return None
            taak = dict(self._wachtrij.pop(0))
            taak["worker_id"] = worker_id
            self.claims.append((taak["id"], worker_id))
            return taak

    def leeg(self) -> bool:
        with self._slot:
            return not self._wachtrij

    # -- schrijven -------------------------------------------------------
    def transition(self, task_id: str, status: str, **kw: Any) -> dict[str, Any]:
        self.overgangen.append((task_id, status))
        if self._fout_bij_overgang is not None:
            fout = self._fout_bij_overgang(status)
            if fout is not None:
                raise fout
        return {
            "id": task_id,
            "status": status,
            "lease_token": LEASE,
            "worker_id": kw.get("worker_id"),
            "checkpoint": kw.get("checkpoint") or {},
        }

    def heartbeat(self, task_id, worker_id, lease_token, lease_seconds, checkpoint):
        return {"id": task_id, "worker_id": worker_id, "lease_token": lease_token,
                "checkpoint": checkpoint or {}}

    def append_event(self, task_id, event_type, **kw):
        self.events.append(event_type)
        return {"id": "event"}

    def create_step(self, task_id, step_key, title, **kw):
        return {"id": f"stap-{task_id}", "task_id": task_id, "step_key": step_key}

    def update_step(self, step_id, status, **kw):
        self.stappen.append((step_id, status))
        return {"id": step_id, "status": status}

    def get(self, task_id, after_sequence: int = 0):
        return {"task": {"id": task_id}, "steps": [], "approvals": [], "events": []}


class NepKlok:
    """Virtuele tijd: slapen kost geen echte seconden, maar telt wel."""

    def __init__(self):
        self.tijd = 0.0
        self.slaapjes: list[float] = []

    async def sleep(self, seconds: float) -> None:
        self.tijd += seconds
        self.slaapjes.append(seconds)
        await asyncio.sleep(0)


class TestParallel:
    def test_drie_taken_overlappen_en_worden_elk_een_keer_geclaimd(self):
        repo = NepRepo([maak_taak(n) for n in range(3)])

        async def trage_handler(task, context):
            await asyncio.sleep(0.5)
            return {"summary": f"klaar: {task['id']}"}

        async def scenario() -> float:
            start = time.monotonic()
            await run_slots(
                repo, {"test": trage_handler},
                concurrency=3, lease_seconds=60,
                stop=repo.leeg,
            )
            return time.monotonic() - start

        duur = asyncio.run(scenario())

        # Achter elkaar zou 3 x 0,5s = 1,5s kosten. Onder 1,2s kan alleen als ze
        # elkaar overlappen.
        assert duur < 1.2, f"taken liepen niet parallel: {duur:.2f}s"
        assert duur >= 0.5
        geclaimd = [taak for taak, _ in repo.claims]
        assert sorted(geclaimd) == ["taak-0", "taak-1", "taak-2"]
        assert len(set(geclaimd)) == 3, "een taak is meer dan één keer geclaimd"
        # Elk slot is een eigen worker met een eigen id, anders kloppen lease en
        # heartbeat per taak niet meer.
        werkers = {werker for _, werker in repo.claims}
        assert len(werkers) == 3
        assert all(":slot-" in werker for werker in werkers)
        voltooid = [taak for taak, status in repo.overgangen if status == "completed"]
        assert sorted(voltooid) == ["taak-0", "taak-1", "taak-2"]


class TestStilleBak:
    BUDGET = 600.0  # virtuele seconden

    def _tel_claims(self, aantal_slots: int) -> int:
        repo = NepRepo([])

        async def scenario() -> None:
            signal = WorkSignal(aantal_slots)
            lussen = []
            for n in range(aantal_slots):
                klok = NepKlok()
                worker = TaskWorker(repo, {}, worker_id=f"test:slot-{n}", lease_seconds=60)
                lussen.append(run_slot(
                    worker, scout=(n == 0), signal=signal, index=n,
                    stop=(lambda k=klok: k.tijd >= self.BUDGET), sleep=klok.sleep,
                ))
            await asyncio.gather(*lussen)

        asyncio.run(scenario())
        return repo.claim_aanroepen

    def test_meer_slots_kosten_niet_k_keer_zoveel_claim_aanroepen(self):
        alleen = self._tel_claims(1)
        samen = self._tel_claims(3)
        assert alleen > 0
        # De harde eis: drie slots mogen geen drie keer zoveel rowlocks op
        # claim_next_core_task leggen als één slot deed.
        assert samen < 3 * alleen, f"stille bak pollt te vaak: {samen} vs {alleen}"
        # En het moet niet nét eronder zitten: de slapers tikken hoogstens af en
        # toe aan, ze pollen niet mee op het snelle tempo.
        assert samen < 2 * alleen, f"slapende slots pollen te vaak: {samen} vs {alleen}"
        assert samen > alleen, "de slapers pollen helemaal niet meer"

    def test_een_slaper_pollt_snel_zodra_hij_zelf_iets_claimde(self):
        repo = NepRepo([maak_taak(0)])
        klok = NepKlok()

        async def snelle_handler(task, context):
            return {"summary": "klaar"}

        async def scenario() -> None:
            worker = TaskWorker(repo, {"test": snelle_handler}, worker_id="test:slot-1", lease_seconds=60)
            await run_slot(
                worker, scout=False, signal=WorkSignal(2), index=1,
                stop=lambda: klok.tijd >= 100, sleep=klok.sleep,
            )

        asyncio.run(scenario())
        # Eerst een taak gedraaid, dus de eerstvolgende wachttijd is de korte
        # (IDLE_MIN), niet het lange slaap-interval.
        assert klok.slaapjes[0] == tw.IDLE_MIN
        assert klok.slaapjes[:4] == [2, 4, 8, 16]

    def test_een_slaper_wordt_wakker_van_een_seintje(self):
        repo = NepRepo([])
        signal = WorkSignal(2)

        async def scenario() -> int:
            async def slaap_oneindig(seconds: float) -> None:
                # Alleen het seintje kan hem hier weghalen -- tot het tweede
                # pollen geweest is, dan mag de lus netjes aflopen.
                if repo.claim_aanroepen >= 2:
                    return
                await asyncio.Event().wait()

            worker = TaskWorker(repo, {}, worker_id="test:slot-1", lease_seconds=60)
            lus = asyncio.ensure_future(run_slot(
                worker, scout=False, signal=signal, index=1,
                stop=lambda: repo.claim_aanroepen >= 2, sleep=slaap_oneindig,
            ))
            for _ in range(20):  # laat hem één keer pollen en gaan liggen
                await asyncio.sleep(0)
            eerste = repo.claim_aanroepen
            signal.wake_others(0)  # slot 0 vond werk
            await asyncio.wait_for(lus, timeout=2)
            return eerste

        eerste = asyncio.run(scenario())
        assert eerste == 1, "de slaper had één keer moeten pollen en dan wachten"
        assert repo.claim_aanroepen == 2, "het seintje maakte de slaper niet wakker"


class TestAnnuleren:
    def test_een_geannuleerde_lus_wordt_niet_geverifieerd_of_geretryd(self):
        repo = NepRepo([maak_taak(0)])

        async def geannuleerde_handler(task, context):
            raise TaskCancelled("task was cancelled")

        async def scenario() -> bool:
            worker = TaskWorker(repo, {"test": geannuleerde_handler}, worker_id="test:slot-0")
            return await worker.run_once()

        assert asyncio.run(scenario()) is True
        assert repo.overgangen == [], f"er is toch nog getransitioneerd: {repo.overgangen}"

    def test_annuleren_gezien_via_de_repo_leidt_ook_niet_tot_retry(self):
        def fout(status: str):
            # Zoals require_transition het doet: vanuit cancelled mag niets meer.
            return ValueError(f"invalid task transition: cancelled -> {status}")

        repo = NepRepo([maak_taak(0)], fout_bij_overgang=fout)

        async def gewone_handler(task, context):
            return {"summary": "klaar"}

        async def scenario() -> bool:
            worker = TaskWorker(repo, {"test": gewone_handler}, worker_id="test:slot-0")
            return await worker.run_once()

        assert asyncio.run(scenario()) is True
        # Alleen de poging tot verifying; geen retrying, geen queued, geen failed.
        assert repo.overgangen == [("taak-0", "verifying")], repo.overgangen

    def test_herkent_alleen_de_annuleer_overgang(self):
        assert tw.is_cancelled_race(ValueError("invalid task transition: cancelled -> verifying"))
        assert not tw.is_cancelled_race(ValueError("invalid task transition: running -> completed"))
        assert not tw.is_cancelled_race(RuntimeError("iets anders"))


class NepDb:
    """Eén kolom van één rij, zoals de goedkope stop-check hem opvraagt."""

    def __init__(self, status: str):
        self.status = status
        self.aanroepen = 0

    def table(self, naam: str):
        return self

    def select(self, *a):
        return self

    def eq(self, *a):
        return self

    def limit(self, *a):
        return self

    def execute(self):
        self.aanroepen += 1
        return SimpleNamespace(data=[{"status": self.status}])


class TestStopCheck:
    def _draai(self, status: str) -> dict[str, Any]:
        repo = NepRepo([])
        db = NepDb(status)
        repo._db = lambda: db  # type: ignore[method-assign]
        gevangen: dict[str, Any] = {}

        async def nep_loop(request_text, task_id, on_event, approved_commands=(), **kw):
            gevangen["kwargs"] = kw
            should_stop = kw.get("should_stop")
            gevangen["gestopt"] = await should_stop()
            # Tweede keer binnen het cache-venster: geen extra databasevraag.
            gevangen["gestopt_2"] = await should_stop()
            return {"summary": "klaar", "steps_used": 1}

        echte = agent_loop.run_agent_loop
        agent_loop.run_agent_loop = nep_loop
        try:
            taak = maak_taak(0, capability="agentic")
            context = tw.TaskContext(repo, taak, 60)
            asyncio.run(tw.agentic_handler(taak, context))
        finally:
            agent_loop.run_agent_loop = echte
        gevangen["db"] = db
        return gevangen

    def test_geeft_een_should_stop_mee_die_cancelled_ziet(self):
        gevangen = self._draai("cancelled")
        assert callable(gevangen["kwargs"].get("should_stop"))
        assert gevangen["gestopt"] is True

    def test_een_lopende_taak_hoeft_niet_te_stoppen_en_wordt_niet_bevraagd(self):
        gevangen = self._draai("running")
        assert gevangen["gestopt"] is False
        # Goedkoop: twee keer vragen binnen het venster is één databasevraag.
        assert gevangen["db"].aanroepen == 1
