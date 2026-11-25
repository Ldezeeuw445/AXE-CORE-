"""25 nov live: een agent gokte `cat /root/.axe_token`, `cat /etc/axe/companion_api_key`, ..."""
import pytest

import agent_loop as al


@pytest.mark.parametrize("cmd", [
    "cat /root/.axe_token", "cat /etc/axe/companion_api_key", "cat /opt/axe-task-workspaces/companionmgr/.env",
    "cat /root/.axe_api_key_companion.txt", "head -5 /opt/axe-core-api/.env", "grep KEY .env",
    "printenv", "env | grep GROQ", "cat /proc/self/environ", "cat ~/.ssh/id_ed25519", "less credentials.json",
])
def test_sleutels_en_omgeving_lezen_wordt_geweigerd(cmd):
    assert al._refuse(cmd), cmd


@pytest.mark.parametrize("cmd", [
    "head -80 /opt/axe-core-api/intel_wereld.py", "grep -rn token backend/axe_api/sleutel_teller.py",
    "cat .env.example", "ls -la /opt/axe-core-api", "env PYTHONPATH=. pytest -q",
    "curl -s http://127.0.0.1:8001/health", "sed -n '1,100p' /opt/axe-core-api/planning.py",
])
def test_gewoon_werk_blijft_kunnen(cmd):
    assert al._refuse(cmd) is None, cmd


def test_read_file_op_een_sleutelbestand_wordt_geweigerd():
    assert "Refused" in al._read("/opt/axe-core-api/.env")["error"]
    assert "Refused" in al._read("/root/.axe_token")["error"]
