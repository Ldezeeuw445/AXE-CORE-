import React, { useEffect, useMemo, useState } from "react";
import { alerts as alertsApi } from "../../lib/api";
import { useAlerts } from "../../contexts/AlertsContext";
import { Badge } from "../axe/Panel";
import { Spinner } from "../axe/Spinner";
import { Plus, X, Trash2, Sparkles, Zap, ShieldAlert } from "lucide-react";

const LAYER_OPTIONS = ["air", "vessel", "intel", "news", "crypto", "macro", "heatmap", "space"];
const CONDITION_TYPES = [
  { value: "registry_match",  label: "Registry match (e.g. specific jet/vessel airborne)" },
  { value: "field_threshold", label: "Field threshold (e.g. BTC > $80k)" },
  { value: "meta_threshold",  label: "Meta threshold (e.g. tanker_count > 250)" },
  { value: "presence",        label: "Presence (e.g. news title contains 'sanctions')" },
];
const OPS = ["gt", "gte", "lt", "lte", "eq"];

function sevTone(s) {
  if (s === "HIGH" || s === "CRITICAL") return "alert";
  if (s === "MEDIUM") return "amber";
  return "cyan";
}

export function AlertRulesModal({ open, onClose }) {
  const { rules, refreshRules } = useAlerts();
  const [busy, setBusy] = useState(false);
  const [newRule, setNewRule] = useState(null);

  const seedPreset = async (preset) => {
    setBusy(true);
    try {
      await alertsApi.seedPreset(preset);
      await refreshRules();
    } catch (e) { console.error(e); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this rule?")) return;
    try { await alertsApi.deleteRule(id); await refreshRules(); } catch (e) { console.error(e); }
  };

  const toggle = async (rule) => {
    try {
      await alertsApi.updateRule(rule.id, { ...rule, enabled: !rule.enabled });
      await refreshRules();
    } catch (e) { console.error(e); }
  };

  const submitNew = async (data) => {
    setBusy(true);
    try { await alertsApi.createRule(data); await refreshRules(); setNewRule(null); }
    catch (e) { alert("Failed to create: " + (e?.response?.data?.detail || e.message)); }
    finally { setBusy(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" data-testid="alert-rules-modal">
      <div className="axe-panel w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col" style={{ background: "#0B0C0E" }}>
        <header className="axe-panel-header">
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="text-[#66E6FF]"/>
            <span className="axe-panel-title">ALERT RULES — {rules.length} configured</span>
          </div>
          <button onClick={onClose} className="text-[#6F8193] hover:text-[#FF4D6D]" data-testid="alert-rules-close"><X size={14}/></button>
        </header>

        {/* Preset bar */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-white/5">
          <span className="text-[10px] tracking-[0.06em] uppercase text-[#9FB0C0]">QUICK PRESETS:</span>
          {["starter", "trader", "osint"].map((p) => (
            <button key={p} onClick={() => seedPreset(p)} disabled={busy}
              data-testid={`alert-seed-${p}`}
              className="text-[10px] tracking-[0.06em] uppercase px-2 py-1 rounded-md border border-white/10 text-[#C9D6E2] hover:text-[#66E6FF] hover:border-[#00D4FF]/30 inline-flex items-center gap-1">
              <Sparkles size={10}/> {p}
            </button>
          ))}
          <button onClick={() => setNewRule({ name: "", layer: "air", severity: "MEDIUM", throttle_minutes: 15, condition: { type: "registry_match", field: "registration", values: [] } })}
            data-testid="alert-new-rule"
            className="ml-auto text-[10px] tracking-[0.06em] uppercase px-2 py-1 rounded-md bg-[#00D4FF] text-black font-semibold inline-flex items-center gap-1">
            <Plus size={10}/> New rule
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {/* New rule editor */}
          {newRule && <NewRuleEditor data={newRule} onChange={setNewRule} onSubmit={submitNew} onCancel={() => setNewRule(null)} busy={busy} />}

          {/* Rules list */}
          <ul className="space-y-2 mt-3">
            {rules.map((r) => (
              <li key={r.id} className="rounded-md bg-white/2 border border-white/5 p-2.5 flex items-center gap-3" data-testid={`alert-rule-${r.id}`}>
                <button onClick={() => toggle(r)} className={`shrink-0 w-9 h-5 rounded-full transition-colors ${r.enabled ? "bg-[#00D4FF]" : "bg-white/10"}`}
                  aria-label="Toggle" data-testid={`alert-rule-toggle-${r.id}`}>
                  <span className={`block w-4 h-4 rounded-full bg-black mt-0.5 transition-transform ${r.enabled ? "translate-x-4" : "translate-x-0.5"}`}/>
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-[12px] font-medium text-[#EAF2F7]">{r.name}</div>
                    <Badge tone={sevTone(r.severity)}>{r.severity || "MEDIUM"}</Badge>
                    <Badge tone="cyan">{r.layer}</Badge>
                    <span className="text-[10px] text-[#6F8193]">throttle {r.throttle_minutes}m · fired {r.trigger_count || 0}×</span>
                  </div>
                  <div className="text-[10.5px] text-[#9FB0C0] mt-0.5 truncate">
                    {summarizeCondition(r.condition)}
                  </div>
                </div>
                <button onClick={() => remove(r.id)} title="Delete" data-testid={`alert-rule-delete-${r.id}`}
                  className="text-[#6F8193] hover:text-[#FF4D6D] p-1"><Trash2 size={12}/></button>
              </li>
            ))}
            {rules.length === 0 && (
              <li className="text-[11px] text-[#6F8193] text-center py-6">No rules yet. Try a preset above or create one.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function summarizeCondition(c) {
  if (!c) return "";
  if (c.type === "registry_match") return `Field '${c.field}' ∈ [${(c.values || []).join(", ")}]`;
  if (c.type === "field_threshold") return `'${c.field}' ${c.op} ${c.value}${c.item_id ? ` (on ${c.item_id})` : ""}`;
  if (c.type === "meta_threshold") return `meta.'${c.key}' ${c.op} ${c.value}`;
  if (c.type === "presence") return `'${c.field}' ${c.op} '${c.value}'`;
  return JSON.stringify(c);
}

function NewRuleEditor({ data, onChange, onSubmit, onCancel, busy }) {
  const set = (patch) => onChange({ ...data, ...patch });
  const setCond = (patch) => onChange({ ...data, condition: { ...data.condition, ...patch } });
  return (
    <section className="rounded-md bg-white/3 border border-white/8 p-3" data-testid="alert-new-rule-editor">
      <div className="axe-section-label mb-2">NEW RULE</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
        <Field label="Name">
          <input className="axe-input w-full" value={data.name} onChange={(e) => set({ name: e.target.value })}
            data-testid="new-rule-name" placeholder="e.g. Tesla jet airborne"/>
        </Field>
        <Field label="Layer">
          <select className="axe-input w-full" value={data.layer} onChange={(e) => set({ layer: e.target.value })} data-testid="new-rule-layer">
            {LAYER_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
        <Field label="Severity">
          <select className="axe-input w-full" value={data.severity} onChange={(e) => set({ severity: e.target.value })} data-testid="new-rule-severity">
            {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Throttle (min)">
          <input type="number" className="axe-input w-full" value={data.throttle_minutes}
            onChange={(e) => set({ throttle_minutes: parseInt(e.target.value || 0, 10) })} data-testid="new-rule-throttle"/>
        </Field>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 items-end">
        <Field label="Condition">
          <select className="axe-input w-full" value={data.condition.type}
            onChange={(e) => {
              const t = e.target.value;
              const base = { type: t };
              if (t === "registry_match") Object.assign(base, { field: "registration", values: [] });
              if (t === "field_threshold") Object.assign(base, { field: "", op: "gt", value: 0 });
              if (t === "meta_threshold") Object.assign(base, { key: "", op: "gt", value: 0 });
              if (t === "presence") Object.assign(base, { field: "title", op: "contains", value: "" });
              set({ condition: base });
            }} data-testid="new-rule-cond-type">
            {CONDITION_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>

        {data.condition.type === "registry_match" && (
          <>
            <Field label="Field">
              <select className="axe-input w-full" value={data.condition.field || "registration"}
                onChange={(e) => setCond({ field: e.target.value })}>
                <option value="registration">registration (jets)</option>
                <option value="mmsi">mmsi (vessels)</option>
                <option value="icao24">icao24</option>
                <option value="ticker">ticker</option>
                <option value="sector">sector</option>
              </select>
            </Field>
            <Field label="Values (comma-sep)" className="md:col-span-2">
              <input className="axe-input w-full" data-testid="new-rule-values"
                value={(data.condition.values || []).join(", ")}
                onChange={(e) => setCond({ values: e.target.value.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean) })}
                placeholder="e.g. N628TS, N1BG"/>
            </Field>
          </>
        )}

        {data.condition.type === "field_threshold" && (
          <>
            <Field label="Field">
              <input className="axe-input w-full" value={data.condition.field}
                onChange={(e) => setCond({ field: e.target.value })}
                placeholder="e.g. price_usd, magnitude, frp_num"/>
            </Field>
            <Field label="Op">
              <select className="axe-input w-full" value={data.condition.op}
                onChange={(e) => setCond({ op: e.target.value })}>
                {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Value">
              <input className="axe-input w-full" value={data.condition.value}
                onChange={(e) => setCond({ value: parseFloat(e.target.value) || e.target.value })}/>
            </Field>
            <Field label="Item id (optional, e.g. crypto_bitcoin)" className="md:col-span-2">
              <input className="axe-input w-full" value={data.condition.item_id || ""}
                onChange={(e) => setCond({ item_id: e.target.value || undefined })}/>
            </Field>
          </>
        )}

        {data.condition.type === "meta_threshold" && (
          <>
            <Field label="Key">
              <input className="axe-input w-full" value={data.condition.key}
                onChange={(e) => setCond({ key: e.target.value })}
                placeholder="e.g. theaters, tanker_count, night_detections"/>
            </Field>
            <Field label="Op">
              <select className="axe-input w-full" value={data.condition.op}
                onChange={(e) => setCond({ op: e.target.value })}>
                {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Value">
              <input className="axe-input w-full" value={data.condition.value}
                onChange={(e) => setCond({ value: parseFloat(e.target.value) || e.target.value })}/>
            </Field>
          </>
        )}

        {data.condition.type === "presence" && (
          <>
            <Field label="Field">
              <input className="axe-input w-full" value={data.condition.field}
                onChange={(e) => setCond({ field: e.target.value })}
                placeholder="e.g. title"/>
            </Field>
            <Field label="Op">
              <select className="axe-input w-full" value={data.condition.op}
                onChange={(e) => setCond({ op: e.target.value })}>
                <option value="contains">contains</option>
                <option value="equals">equals</option>
              </select>
            </Field>
            <Field label="Value" className="md:col-span-2">
              <input className="axe-input w-full" value={data.condition.value}
                onChange={(e) => setCond({ value: e.target.value })}
                placeholder="e.g. sanctions"/>
            </Field>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button onClick={() => onSubmit(data)} disabled={busy || !data.name}
          data-testid="new-rule-submit"
          className="text-[10px] tracking-[0.06em] uppercase px-3 py-1.5 rounded-md bg-[#00D4FF] text-black font-semibold disabled:opacity-50 inline-flex items-center gap-1">
          {busy ? <Spinner variant="braille" colorClassName="text-black"/> : <Plus size={10}/>} Create
        </button>
        <button onClick={onCancel} className="text-[10px] tracking-[0.06em] uppercase px-3 py-1.5 rounded-md border border-white/10 text-[#9FB0C0]">Cancel</button>
      </div>
    </section>
  );
}

function Field({ label, children, className = "" }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="axe-section-label">{label}</span>
      {children}
    </label>
  );
}
