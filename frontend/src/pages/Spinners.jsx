import React, { useState } from "react";
import { Link } from "react-router-dom";
import { SPINNER_VARIANTS, Spinner } from "../components/axe/Spinner";
import { Search, ArrowLeft } from "lucide-react";

const CATEGORIES = [
  { key: "all",     label: "All",       prefix: null },
  { key: "braille", label: "Braille",   prefix: "dots" },
  { key: "ascii",   label: "ASCII",     prefix: "ascii" },
  { key: "arrows",  label: "Arrows",    prefix: "arrow" },
  { key: "geo",     label: "Geometric", prefix: "circle" },
];

function inCategory(name, cat) {
  if (cat.key === "all") return true;
  if (cat.key === "braille") return name.startsWith("dots") || ["sand","bounce","wave","scan","rain","pulse","snake","sparkle","cascade","dots_circle"].includes(name);
  if (cat.key === "ascii") return name.startsWith("ascii") || name === "rolling_line";
  if (cat.key === "arrows") return name.startsWith("arrow") || name === "triangle" || name === "triangle2" || name === "double_arrow";
  if (cat.key === "geo") return ["block","block2","hbar","vbar","circle","circle_halves","circle_quarters","toggle","square_corners","point","balloon","arc","noise","wave_block","grow_horizontal","grow_vertical","binary","helix","checkerboard","fillsweep","diagswipe","scanv"].includes(name);
  return false;
}

export default function Spinners() {
  const [cat, setCat] = useState(CATEGORIES[0]);
  const [q, setQ] = useState("");
  const list = SPINNER_VARIANTS.filter((n) => inCategory(n, cat) && (!q || n.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="min-h-screen bg-black text-[#EAF2F7]" data-testid="spinners-page">
      <header className="axe-topbar px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-[#6F8193] hover:text-[#66E6FF] inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.10em]">
            <ArrowLeft size={14}/> TERMINAL
          </Link>
          <span className="text-[#6F8193]">/</span>
          <span className="text-[12px] font-semibold tracking-[0.16em]">AGENT SPINNERS — {SPINNER_VARIANTS.length} spinners</span>
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6F8193]"/>
          <input className="axe-input pl-8 w-[220px]" placeholder="Filter…" value={q} onChange={(e)=>setQ(e.target.value)} data-testid="spinner-search" />
        </div>
      </header>

      <div className="px-4 py-3 flex items-center gap-2 border-b border-white/5 bg-[#050505]">
        {CATEGORIES.map((c) => (
          <button key={c.key} onClick={() => setCat(c)}
            className={`text-[11px] tracking-[0.06em] uppercase px-3 py-1.5 rounded-full ${cat.key === c.key ? "bg-[#00D4FF] text-black font-semibold" : "bg-white/3 border border-white/8 text-[#9FB0C0] hover:text-[#66E6FF]"}`}
            data-testid={`spinner-cat-${c.key}`}>
            {c.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-[#6F8193]">{list.length} shown</span>
      </div>

      <main className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {list.map((name) => (
            <div key={name} className="axe-panel p-4 flex flex-col items-center justify-center gap-2 min-h-[120px]" data-testid={`spinner-card-${name}`}>
              <div className="text-[10px] tracking-[0.10em] uppercase text-[#66E6FF]">{name}</div>
              <div className="text-[28px] leading-none flex items-center justify-center mt-1">
                <Spinner variant={name} interval={120} colorClassName="text-[#EAF2F7]"/>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
