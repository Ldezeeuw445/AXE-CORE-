"""Tests for the deliverable kits.

These are the products a buyer pays for, so the bar is different from the rest
of the engine: a wrong number here is a refund and a bad review, not a
mis-ranked cluster. The unit-consistency tests exist because the first working
version of the journal reported +309R for a normal Monday — price-unit risk
divided into currency P&L.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from revenue.kits import journal, propfirm

SAMPLE = Path(__file__).with_name("sample_trades.csv")


# ── journal ───────────────────────────────────────────────────────────────────

def test_sample_file_parses():
    trades, notes = journal.parse_trades(SAMPLE.read_text())
    assert len(trades) == 160
    assert all(t.symbol for t in trades)
    assert not [n for n in notes if "skipped" in n]


def test_column_mapping_survives_broker_naming():
    headers = ["Ticket", "Symbol", "Type", "Volume", "Open Price", "S/L",
               "Close Price", "Open Time", "Close Time", "Commission", "Profit"]
    cols = journal.map_columns(headers)
    assert cols["pnl"] == "Profit"
    assert cols["stop_price"] == "S/L"
    assert cols["entry_price"] == "Open Price"
    assert cols["opened_at"] == "Open Time"


def test_missing_pnl_column_is_a_clear_error():
    with pytest.raises(journal.JournalError, match="no profit/loss column"):
        journal.parse_trades("symbol,volume\nEURUSD,1.0\n")


def test_number_parsing_handles_broker_formats():
    assert journal._to_float("1,234.56") == 1234.56
    assert journal._to_float("1234,56") == 1234.56      # EU decimal comma
    assert journal._to_float("($250.00)") == -250.0     # parenthesised negative
    assert journal._to_float("€1 200,50") == 1200.50
    assert journal._to_float("") is None


def test_point_values_are_derived_per_symbol():
    """A journal mixing FX and an index has point values five orders of
    magnitude apart; one global median would make every FX R meaningless."""
    trades, _ = journal.parse_trades(SAMPLE.read_text())
    values = journal.implied_point_values(trades)
    assert values["EURUSD"] == pytest.approx(100_000, rel=0.01)
    assert values["XAUUSD"] == pytest.approx(10, rel=0.01)
    assert values["NAS100"] == pytest.approx(1, rel=0.01)


def test_r_multiples_are_plausible():
    """The regression that started this file: R must be in single digits per
    trade, not hundreds."""
    trades, _ = journal.parse_trades(SAMPLE.read_text())
    stats = journal.analyse(trades)
    assert abs(stats["expectancy_r"]) < 5
    for bucket in stats["by_weekday"].values():
        assert bucket["r_per_trade"] is None or abs(bucket["r_per_trade"]) < 10


def test_risk_unit_falls_back_and_says_so():
    """No stop column → the proxy is used and labelled as one."""
    csv_text = "symbol,profit\nEURUSD,100\nEURUSD,-50\nEURUSD,-70\nEURUSD,30\n"
    trades, _ = journal.parse_trades(csv_text)
    unit, basis = journal.risk_unit(trades)
    assert unit == pytest.approx(60.0)
    assert "PROXY" in basis


def test_report_describes_and_never_advises():
    text = journal.report_from_csv(SAMPLE.read_text())
    lowered = text.lower()
    for phrase in ("you should", "we recommend", "stop trading", "buy ", "avoid trading"):
        assert phrase not in lowered
    assert "none of it is a prediction or a recommendation" in lowered


def test_report_carries_sample_sizes():
    """Every slice must show its trade count — a -0.9R bucket over 4 trades is
    noise, and hiding n is how these reports mislead."""
    text = journal.report_from_csv(SAMPLE.read_text())
    assert "| trades |" in text
    assert "sample sizes are in the" in text


def test_weekday_slice_finds_a_real_pattern():
    trades, _ = journal.parse_trades(SAMPLE.read_text())
    weekday = journal.analyse(trades)["by_weekday"]
    assert weekday["Friday"]["win_rate"] < weekday["Tuesday"]["win_rate"]


# ── propfirm ──────────────────────────────────────────────────────────────────

def test_daily_and_overall_floors():
    rules = propfirm.Rules.from_preset("generic_2step", 100_000)
    state = propfirm.AccountState(equity=97_800, day_start_equity=99_500)
    result = propfirm.assess(rules, state)
    assert result["daily"]["floor"] == 94_500      # 99,500 − 5% of 100k
    assert result["overall"]["floor"] == 90_000    # 100k − 10%
    assert result["daily"]["remaining"] == 3_300
    assert result["binding_limit"] == "daily"


def test_trailing_drawdown_follows_the_peak():
    rules = propfirm.Rules(
        starting_balance=100_000, daily_loss_pct=0.05, max_loss_pct=0.06, trailing=True
    )
    state = propfirm.AccountState(equity=104_000, day_start_equity=104_000, peak_equity=108_000)
    result = propfirm.assess(rules, state)
    assert result["overall"]["floor"] == pytest.approx(101_520)  # 108k − 6%
    assert any("does not move back down" in w for w in result["warnings"])


def test_breach_is_reported_not_hidden():
    rules = propfirm.Rules.from_preset("generic_2step", 100_000)
    state = propfirm.AccountState(equity=94_000, day_start_equity=99_500)
    result = propfirm.assess(rules, state)
    assert any("DAILY LIMIT ALREADY BREACHED" in w for w in result["warnings"])
    assert result["headroom"] == 0.0


def test_position_size_cannot_breach_the_binding_limit():
    rules = propfirm.Rules.from_preset("generic_2step", 100_000)
    state = propfirm.AccountState(equity=97_800, day_start_equity=99_500)
    result = propfirm.max_position(rules, state, stop_distance=0.0025, value_per_point=100_000)
    # A full stop-out at max size lands exactly on the floor, never through it.
    loss = result["max_size"] * result["risk_per_unit"]
    assert loss == pytest.approx(result["headroom"], rel=1e-6)
    assert state.equity - loss >= result["daily"]["floor"] - 1e-6


def test_sizing_ladder_shows_survivable_fractions():
    rules = propfirm.Rules.from_preset("generic_2step", 100_000)
    state = propfirm.AccountState(equity=99_000, day_start_equity=100_000)
    ladder = propfirm.max_position(rules, state, 10, 1)["sizing_ladder"]
    assert ladder["100% of headroom"]["stop_outs_before_limit"] == 1
    assert ladder["25% of headroom"]["stop_outs_before_limit"] == 4
    sizes = [row["size"] for row in ladder.values()]
    assert sizes == sorted(sizes, reverse=True)


def test_no_stop_means_no_size():
    rules = propfirm.Rules.from_preset("generic_2step", 100_000)
    state = propfirm.AccountState(equity=100_000, day_start_equity=100_000)
    with pytest.raises(propfirm.RuleError, match="no stop, no size"):
        propfirm.max_position(rules, state, stop_distance=0, value_per_point=1)


def test_unknown_preset_lists_the_known_ones():
    with pytest.raises(propfirm.RuleError, match="generic_2step"):
        propfirm.Rules.from_preset("not_a_firm", 100_000)


def test_report_points_at_the_firms_rulebook():
    rules = propfirm.Rules.from_preset("generic_2step", 100_000)
    state = propfirm.AccountState(equity=98_000, day_start_equity=100_000)
    text = propfirm.report(propfirm.assess(rules, state))
    assert "Not trading advice" in text
    assert "rulebook" in text


# ── the free web wedge ────────────────────────────────────────────────────────

def test_page_is_self_contained():
    """A strict-CSP host and the privacy claim both depend on this: the page
    must make no external request of any kind."""
    from revenue.kits import web

    html = web.render_page(offer_url="https://example.com/kit", offer_label="Full version")
    for forbidden in ("http://", "src=", "fetch(", "XMLHttpRequest", "WebSocket",
                      "navigator.sendBeacon", "import(", "cdn."):
        assert forbidden not in html.replace('href="https://example.com/kit"', ""), forbidden
    assert html.count("<script>") == 1
    assert "never leaves this page" in html


def test_page_puts_the_offer_after_the_value():
    from revenue.kits import web

    html = web.render_page(offer_url="https://example.com/kit", offer_label="Full version")
    assert html.index("Choose or drop your CSV") < html.index("Full version")
    assert "Not trading advice" in html


def test_page_without_an_offer_has_no_link():
    from revenue.kits import web

    html = web.render_page()
    assert "<a href" not in html


def _node() -> str | None:
    import shutil
    return shutil.which("node")


@pytest.mark.skipif(not _node(), reason="node not installed")
def test_web_and_python_agree(tmp_path):
    """The browser tool and journal.py implement the same maths twice — once
    for the free wedge, once for the paid report. If they drift, two buyers get
    two different answers from the same file, which is worse than either being
    wrong on its own."""
    import json
    import subprocess

    from revenue.kits import web

    page = tmp_path / "tool.html"
    page.write_text(web.render_page(), encoding="utf-8")
    harness = Path(__file__).with_name("js_parity.cjs")
    proc = subprocess.run(
        [_node(), str(harness), str(page), str(SAMPLE)],
        capture_output=True, text=True, timeout=60,
    )
    assert proc.returncode == 0, proc.stderr
    js = json.loads(proc.stdout)

    trades, _ = journal.parse_trades(SAMPLE.read_text())
    py = journal.analyse(trades)

    assert js["trades"] == py["overall"]["trades"]
    assert js["net"] == pytest.approx(py["overall"]["net"], abs=0.01)
    assert js["win_rate"] == pytest.approx(py["overall"]["win_rate"], abs=0.001)
    assert js["profit_factor"] == pytest.approx(py["overall"]["profit_factor"], abs=0.01)
    assert js["expectancy"] == pytest.approx(py["overall"]["expectancy_per_trade"], abs=0.01)
    assert js["expectancy_r"] == pytest.approx(py["expectancy_r"], abs=0.005)
    assert js["longest_losing_streak"] == py["overall"]["longest_losing_streak"]

    for symbol, value in journal.implied_point_values(trades).items():
        assert js["point_values"][symbol] == pytest.approx(value, rel=0.001)
    for day, bucket in py["by_weekday"].items():
        assert js["by_weekday"][day]["trades"] == bucket["trades"]
        assert js["by_weekday"][day]["net"] == pytest.approx(bucket["net"], abs=0.01)
