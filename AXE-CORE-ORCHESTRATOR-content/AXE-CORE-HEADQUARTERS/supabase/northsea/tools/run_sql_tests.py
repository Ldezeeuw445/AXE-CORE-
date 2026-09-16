"""Draait P0-migraties + SQL-tests in één transactie tegen AXE Commodities en rolt ALTIJD terug.

Het testblok eindigt met RAISE 'NS_TESTS_PASSED: n'; die fout breekt de transactie af,
dus geen migratie en geen testrij blijft staan. Een echte fout geeft NS_TEST_FAILED of
een SQL-fout. Gebruik: SUPABASE_ACCESS_TOKEN=… python run_sql_tests.py [--with-migrations]
"""
import json, pathlib, re, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from supa_mcp import call

ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATIES = sorted((ROOT / "migrations").glob("20260916150*_p0_*.sql"))
TEST = ROOT / "tests" / "sql" / "p0_guards_test.sql"

def main() -> int:
    delen = [p.read_text() for p in MIGRATIES] if "--with-migrations" in sys.argv else []
    sql = "\n".join(delen + [TEST.read_text()])
    t = call("execute_sql", {"query": sql})
    tekst = t if isinstance(t, str) else json.dumps(t)
    m = re.search(r"NS_TESTS_PASSED: (\d+)", tekst)
    if m:
        print(f"SQL guard tests passed: {m.group(1)} assertions (transaction rolled back)")
        return 0
    fout = re.search(r"(NS_TEST_FAILED[^\"\\]*|ERROR:[^\"\\]*)", tekst)
    print("SQL guard tests FAILED:", fout.group(1) if fout else tekst[:800])
    return 1

if __name__ == "__main__":
    raise SystemExit(main())
