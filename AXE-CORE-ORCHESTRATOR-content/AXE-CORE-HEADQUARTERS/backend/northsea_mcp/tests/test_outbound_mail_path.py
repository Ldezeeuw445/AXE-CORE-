"""Eén outbound-architectuur: canonieke resendPayload, geen CrewAI/SMTP-sender."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]  # AXE-CORE-HEADQUARTERS
FUNCTIONS = ROOT / "supabase" / "northsea" / "functions"
MCP = ROOT / "backend" / "northsea_mcp" / "northsea_mcp"

GOVERNED_SENDERS = {
    "resend-inbound/index.ts",
    "send-approved-reply/index.ts",
    "commodity-intake/index.ts",  # website-ack, zelfde resendPayload, beleid-gated
}


def test_resend_send_posts_only_from_governed_functions():
    senders: set[str] = set()
    for p in FUNCTIONS.rglob("*.ts"):
        text = p.read_text()
        normalized = text.replace(" ", "").replace('"', "'")
        if "api.resend.com/emails" in text and ("method:'POST'" in normalized or 'method:"POST"' in text.replace(" ", "")):
            senders.add(p.relative_to(FUNCTIONS).as_posix())
        elif 'fetch("https://api.resend.com/emails"' in text or "fetch('https://api.resend.com/emails'" in text:
            senders.add(p.relative_to(FUNCTIONS).as_posix())
    assert senders == GOVERNED_SENDERS
    for rel in GOVERNED_SENDERS:
        tekst = (FUNCTIONS / rel).read_text()
        assert "resendPayload" in tekst
        assert "renderNorthSeaMail" in tekst


def test_crew_and_mcp_never_call_resend_or_smtp():
    verboden = ("api.resend.com/emails", "smtplib", "nodemailer")
    hits = []
    for p in MCP.rglob("*.py"):
        tekst = p.read_text(errors="ignore")
        for v in verboden:
            if v in tekst:
                hits.append((str(p.relative_to(MCP)), v))
    assert hits == []


def test_corporate_mail_renderer_is_the_html_source_for_send():
    mail = (FUNCTIONS / "_shared" / "mail.ts").read_text()
    assert "Managing Director" in mail
    assert "Luka de Zeeuw" in mail
    assert "trade@northseacommodity.com" in mail
    footer = mail[mail.index("LEGAL_FOOTER") : mail.index("export type MailMode")]
    assert "KvK" not in footer
    assert "Chamber of Commerce" not in footer
    send = (FUNCTIONS / "send-approved-reply" / "index.ts").read_text()
    assert "renderNorthSeaMail" in send
    assert "mailReferenceFromKnown" in send
    assert "brandedHtml(d.body)" not in send
    assert "In-Reply-To" in send
    assert "References" in send


def test_hq_and_edge_mail_share_identity_and_splitters():
    hq = (ROOT / "src" / "domain" / "northsea" / "mail.ts").read_text()
    edge = (FUNCTIONS / "_shared" / "mail.ts").read_text()
    for needle in ("mailReferenceFromKnown", "splitHtmlQuotedHistory", "NORTHSEA_IDENTITY", "LEGAL_FOOTER", "renderNorthSeaMail"):
        assert needle in hq and needle in edge
