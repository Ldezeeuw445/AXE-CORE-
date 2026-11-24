"""24 nov: 'You've hit your session limit' van een stoel gaf 436 claude_code.run's in 2 uur."""
import json

import agent_loop as al


def test_limiet_van_een_stoel_is_een_fout_geen_modeltekst():
    assert al.stoel_limiet_of_fout("You've hit your session limit · resets 2:30am (Europe/Amsterdam)")
    assert al.stoel_limiet_of_fout(json.dumps({"is_error": True, "result": "Not logged in · Please run /login"}))
    assert al.stoel_limiet_of_fout(json.dumps({"type": "result", "result": "You've hit your weekly limit · resets 10pm"}))
    assert al.stoel_limiet_of_fout("Failed to authenticate: OAuth session expired and could not be refreshed")


def test_een_echt_antwoord_blijft_een_antwoord():
    assert al.stoel_limiet_of_fout(json.dumps({"name": "read_file", "args": {"path": "a.py"}})) is None
    lang = "Ik heb de feed bekeken. " * 30 + "De rate limit van de provider is 60 per minuut."
    assert al.stoel_limiet_of_fout(lang) is None


def test_ongeldige_cursor_sleutel_is_een_stoelfout():
    """24 nov: na de Claude-afkoeling viel de lus op Cursor, die dit gaf; 7 echte
    verzoeken van Luka faalden na 3 rondes in plaats van te wachten."""
    uit = ("\x1b[33m⚠ Warning: The provided API key is invalid.\x1b[0m\n"
           "The API key was loaded from the CURSOR_API_KEY environment variable.\nPlease check you have")
    assert al.stoel_limiet_of_fout(uit)
