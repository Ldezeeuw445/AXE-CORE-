"""24 nov live: commit 821420c5 kwam als compleet door terwijl de agent schreef dat
pytest niet draaide ("No module named pytest"). Klaar vraagt tests die echt liepen."""
import device_actions as da

BASIS = ('{"result":"## Samenvatting\\nTest toegevoegd.\\n## Tests\\n%s\\n## Risico\'s\\ngeen"}'
         "\n\n## Oplevering (Mac)\nbranch: axe/20261124-9lg844\ncommits:\n821420c5 test\nniet gecommit:\n(no output)\ndiff:\n x | 40 +\n")


def test_echte_testrun_is_compleet():
    assert da.oplevering(BASIS % "uvx --with-requirements requirements.txt --with pytest pytest -q test_push_meldingen.py: 21 passed")["compleet"]


def test_tests_die_niet_draaiden_zijn_niet_compleet():
    for zin in ("`python3 -m pytest test_push_meldingen.py -v` liep op deze machine niet door: `No module named pytest`.",
                "Ik kon de tests niet draaien: pip install requires approval.",
                "Tests not run (pytest missing)."):
        op = da.oplevering(BASIS % zin)
        assert not op["compleet"], zin
        assert "tests die echt draaiden" in da.oplevering_weigering(op)


def test_werkbon_noemt_het_testcommando_dat_op_de_macs_werkt():
    w = da.werkbon("voeg een test toe")
    assert "uvx --with-requirements requirements.txt --with pytest pytest -q" in w
    assert "npx vitest run" in w
