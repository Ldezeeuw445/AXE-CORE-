"""20 nov: leescommando's op northsea-mcp werden een goedkeuringsvraag ("cp" in "mcp")."""
import agent_loop as al


def test_leescommandos_met_mcp_of_form_in_de_naam_zijn_vrij():
    for c in ("journalctl -u northsea-mcp --since '10 minutes ago' --no-pager | tail -40",
              "find /opt/northsea-mcp -name '*.log' -print",
              "grep -r 'form ' src | head", "cat /etc/hosts 2>/dev/null"):
        assert al.schrijft_in_leestaak(c.lower()) is None, c


def test_echte_schrijvers_blijven_gevangen():
    for c, w in (("rm -rf /tmp/x", "rm"), ("ls; cp a b", "cp"), ("cat x | tee y", "tee"),
                 ("curl -s -x post http://x -d '{}'", "curl write"), ("curl -s http://x --data a=1", "curl write"),
                 ("echo hi > f", ">"), ("python -c 'import requests; requests.post(u)'", "requests.post")):
        assert al.schrijft_in_leestaak(c) == w, c


def test_approval_reason_in_een_leestaak():
    assert al.approval_reason("journalctl -u northsea-mcp --no-pager | tail -5", None, read_only=True) is None
    assert "read-only" in (al.approval_reason("curl -s -X POST http://127.0.0.1:8040/mcp -d '{}'", None, read_only=True) or "")
