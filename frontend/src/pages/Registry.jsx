import React, { useEffect, useMemo, useState } from "react";
import { getRegistry } from "../lib/projectRegistry";

const riskTone = { read: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10", write: "text-amber-300 border-amber-400/30 bg-amber-400/10", execute: "text-rose-300 border-rose-400/30 bg-rose-400/10" };
const projectTone = { axe_core: "#00d4ff", trading_os: "#8b5cf6", axe_companion: "#22c55e" };

export default function Registry() {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState("axe_core");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { getRegistry().then(setData).catch(e => setError(e?.message || "Registry kon niet worden geladen")).finally(() => setLoading(false)); }, []);
  const project = data?.projects?.find(p => p.id === selected);
  const capabilities = useMemo(() => (data?.capabilities || []).filter(c => c.project_id === selected), [data, selected]);
  return <div className="min-h-screen bg-[#05070a] text-[#EAF2F7] p-5 md:p-8">
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div><div className="text-[10px] tracking-[.35em] text-cyan-300 uppercase">AXE CORE / CONTROL PLANE</div><h1 className="text-3xl md:text-4xl font-semibold mt-2">Project Registry</h1><p className="text-slate-400 mt-2">Jouw centrale overzicht van projecten en toegestane capabilities.</p></div>
        <div className="text-right text-xs text-slate-500">{data ? `${data.projects.length} projecten · ${data.capabilities.length} capabilities` : "Laden..."}</div>
      </div>
      {loading && <div className="text-cyan-300 animate-pulse">Registry laden…</div>}
      {error && <div className="border border-rose-400/30 bg-rose-400/10 text-rose-200 rounded-lg p-4">{error}</div>}
      {data && <>
        <div className="grid md:grid-cols-3 gap-3 mb-6">{data.projects.map(p => <button key={p.id} onClick={() => setSelected(p.id)} className={`text-left rounded-xl border p-4 transition ${selected === p.id ? "border-cyan-300/70 bg-cyan-300/10" : "border-white/10 bg-white/[.03] hover:bg-white/[.06]"}`}><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{background: projectTone[p.id]}} /><span className="font-medium">{p.name}</span></div><p className="text-sm text-slate-400 mt-2">{p.description}</p><div className="text-xs text-slate-500 mt-3">Owner: {p.owner}</div></button>)}</div>
        <section className="rounded-xl border border-white/10 bg-white/[.025] overflow-hidden"><div className="p-5 border-b border-white/10"><div className="text-xs text-slate-500 uppercase tracking-widest">Geselecteerd project</div><h2 className="text-xl mt-1">{project?.name}</h2><p className="text-sm text-slate-400 mt-1">{project?.description}</p></div><div className="divide-y divide-white/10">{capabilities.map(c => <div key={c.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"><div><div className="font-mono text-sm text-cyan-200">{c.id}</div><div className="text-sm text-slate-300 mt-1">{c.description}</div><div className="flex flex-wrap gap-2 mt-3">{(c.tags || []).map(t => <span key={t} className="text-[11px] text-slate-400 border border-white/10 rounded px-2 py-1">#{t}</span>)}</div></div><div className="flex items-center gap-2 shrink-0"><span className={`text-xs border rounded px-2 py-1 ${riskTone[c.risk] || riskTone.read}`}>{c.risk}</span>{c.requires_approval && <span className="text-xs border border-amber-400/30 text-amber-300 rounded px-2 py-1">approval nodig</span>}</div></div>)}{!capabilities.length && <div className="p-8 text-center text-slate-500">Nog geen capabilities geregistreerd.</div>}</div></section>
      </>}
    </div>
  </div>;
}
