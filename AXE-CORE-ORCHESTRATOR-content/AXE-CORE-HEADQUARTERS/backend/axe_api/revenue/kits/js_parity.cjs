/**
 * Parity harness: runs the browser tool's own JavaScript (extracted from the
 * rendered page) over a CSV under node, and prints the headline numbers as
 * JSON so test_kits.py can compare them against journal.py.
 *
 * The web page and the Python module implement the same maths twice — once for
 * the free browser wedge, once for the paid report. This is what stops them
 * drifting apart and quietly telling one buyer something different from another.
 *
 *   node js_parity.cjs <rendered.html> <trades.csv>
 *
 * .cjs, not .js: the HQ package.json sets "type": "module", which would make
 * a .js file here an ES module and break require().
 */
const fs = require("fs");
const html = fs.readFileSync(process.argv[2], "utf8");
const csv = fs.readFileSync(process.argv[3], "utf8");
const js = html.slice(html.lastIndexOf("<script>") + 8, html.lastIndexOf("</script>"));

// Minimal DOM shim — the page wires up listeners at the end of its script.
const stub = () => ({
  addEventListener() {}, classList: { add() {}, remove() {} },
  click() {}, style: {}, scrollIntoView() {},
});
global.document = { getElementById: stub };
global.FileReader = class { readAsText() {} };

const src = js + "\n;module.exports = { readTrades, analyse, pointValues, riskUnit };";
const api = eval(`(function(){ const module = {exports:{}}; ${src.replace("riskUnit };", "riskUnit, pct };")}; return module.exports; })()`);

const { trades } = api.readTrades(csv);
const a = api.analyse(trades);
const round = (n, d) => +n.toFixed(d);
console.log(JSON.stringify({
  trades: a.trades,
  net: round(a.net, 2),
  win_rate: round(a.winRate, 4),
  profit_factor: round(a.profitFactor, 2),
  expectancy: round(a.expectancy, 2),
  expectancy_r: round(a.expectancyR, 3),
  longest_losing_streak: a.worstStreak,
  point_values: Object.fromEntries(
    Object.entries(api.pointValues(trades)).map(([k, v]) => [k, round(v, 2)])
  ),
  by_weekday: Object.fromEntries(
    Object.entries(a.byWeekday).map(([k, v]) => [k, { trades: v.trades, net: round(v.net, 2) }])
  ),
  // Displayed strings, not just values: a 41.2 vs 41.3 split between the free
  // tool and the paid report is the visible half of drifting apart.
  display: {
    win_rate: api.pct(a.winRate),
    weekday_win_rates: Object.fromEntries(
      Object.entries(a.byWeekday).map(([k, v]) => [k, api.pct(v.winRate, 0)])
    ),
  },
}));
