from datetime import datetime, timezone

from fakes import seed
from northsea_mcp.approval_signals import signals_for_draft


def test_pending_draft_heeft_thread_maar_lekt_geen_email():
    data = seed()
    d = data["reply_drafts"][0]
    uit = signals_for_draft(d, companies=data["companies"], contacts=data["contacts"],
                            communications=data["communications"], drafts=data["reply_drafts"],
                            now=datetime.now(timezone.utc))
    assert uit["has_thread"] is True
    assert uit["thread_id"] == d["communication_id"]
    assert uit["message_id"] == d["id"]
    assert "chanda@mopani.com" not in str(uit)
    assert "to_email" not in uit


def test_generieke_qualification_vlag():
    d = {"id": "x", "subject": "Copper Cathode — supply qualification", "body": "Dear Sir or Madam",
         "generated_by": "northsea-mcp", "to_email": "sales@x.com"}
    uit = signals_for_draft(d, companies=[], contacts=[], communications=[], drafts=[d])
    assert uit["generic_template"] is True
