import React, { useEffect, useState } from "react";

// 55-variant Agent Spinners library — Braille / ASCII / Arrows / Geometric / Emoji-ish-mono / Text
// Inspired by the reference: Agent Spinners (55 spinners).
// Each variant is a short array of unicode/ASCII frames.

export const SPINNER_FRAMES = {
  // ---- BRAILLE (14) ----
  dots:           ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"],
  dots2:          ["⣾","⣽","⣻","⢿","⡿","⣟","⣯","⣷"],
  dots3:          ["⠋","⠙","⠚","⠞","⠖","⠦","⠴","⠲","⠳","⠓"],
  dots4:          ["⠄","⠆","⠇","⠋","⠙","⠸","⠰","⠠","⠰","⠸","⠙","⠋","⠇","⠆"],
  dots5:          ["⠈","⠉","⠋","⠓","⠒","⠐","⠐","⠒","⠓","⠋","⠉","⠈"],
  dots6:          ["⠁","⠂","⠄","⡀","⢀","⠠","⠐","⠈"],
  dots7:          ["⠈","⠐","⠠","⢀","⡀","⠄","⠂","⠁"],
  dots8:          ["⠁","⠁","⠉","⠙","⠚","⠒","⠂","⠂","⠒","⠲","⠴","⠤","⠄","⠄","⠤","⠠","⠠","⠤","⠦","⠖","⠒","⠐","⠐","⠒","⠓","⠋","⠉","⠈","⠈"],
  dots9:          ["⢹","⢺","⢼","⣸","⣇","⡧","⡗","⡏"],
  dots10:         ["⢄","⢂","⢁","⡁","⡈","⡐","⡠"],
  dots11:         ["⠁","⠂","⠄","⡀","⢀","⠠","⠐","⠈"],
  dots12:         ["⢀⠀","⡀⠀","⠄⠀","⢂⠀","⡂⠀","⠅⠀","⢃⠀","⡃⠀","⠍⠀","⢋⠀","⡋⠀","⠍⠁","⢋⠁","⡋⠁","⠍⠉","⠋⠉","⠋⠉","⠉⠙","⠉⠙","⠉⠩","⠈⢙","⠈⡙","⢈⠩","⡀⢙","⠄⡙","⢂⠩","⡂⢘","⠅⡘","⢃⠨","⡃⢐","⠍⡐","⢋⠠","⡋⢀","⠍⡁","⢋⠁","⡋⠁","⠍⠉","⠋⠉","⠋⠉","⠉⠙","⠉⠙","⠉⠩","⠈⢙","⠈⡙","⠈⠩","⠀⢙","⠀⡙","⠀⠩","⠀⢘","⠀⡘","⠀⠨","⠀⢐","⠀⡐","⠀⠠","⠀⢀","⠀⡀"],
  dots13:         ["⣼","⣹","⢻","⠿","⡟","⣏","⣧","⣶"],
  dots14:         ["⠉⠉","⠈⠙","⠀⠹","⠀⢸","⠀⣰","⠀⣠","⠀⣀","⢀⣀","⣀⡀","⣄⠀","⣆⠀","⡆⠀","⠆⠀","⠂⠀"],

  // ---- BRAILLE GEOMETRIC ----
  sand:           ["⠁","⠂","⠄","⡀","⡈","⡐","⡠","⣀","⣁","⣂","⣄","⣌","⣔","⣤","⣥","⣦","⣮","⣶","⣷","⣿"],
  bounce:         ["⠁","⠂","⠄","⠂"],
  dots_circle:    ["⢎ ","⠎⠁","⠊⠑","⠈⠱"," ⡱","⢀⡰","⢄⡠","⢆⡀"],
  wave:           ["⠁","⠂","⠄","⡀","⢀","⠠","⠐","⠈"],
  scan:           ["⠁⠂⠄","⠂⠄⡀","⠄⡀⢀","⡀⢀⠠","⢀⠠⠐","⠠⠐⠈"],
  rain:           ["⠁ ⠂","⠂ ⠁","⠁ ⠂","⠂ ⠁"],
  pulse:          ["·","∙","•","●","•","∙","·"],
  snake:          ["⠈","⠐","⠐","⠠","⠠","⠄","⠂","⠂","⠁","⠉","⠉","⠙","⠙","⠸","⠸"],
  sparkle:        ["⠁","⠂","⠄","⠁","⠈","⠐","⠠","⡀"],
  cascade:        ["⠁⠂","⠂⠄","⠄⡀","⡀⢀","⢀⠠","⠠⠐","⠐⠈","⠈⠁"],

  // ---- ASCII ----
  ascii:          [".  ",".. ","...",".  "],
  ascii_pulse:    [".","o","O","o","."],
  ascii_box:      ["[ ]","[.]","[..]","[...]","[..]","[.]"],
  ascii_pipe:     ["|","/","-","\\"],
  ascii_block:    ["▪","▫","▪","▫"],
  ascii_dots:     [". ",".. ","..."," .."],
  ascii_bar:      ["[=   ]","[==  ]","[=== ]","[====]","[ ===]","[  ==]","[   =]"],
  ascii_arrows:   ["←","↖","↑","↗","→","↘","↓","↙"],
  ascii_dqpb:     ["d","q","p","b"],
  rolling_line:   ["-","\\","|","/"],

  // ---- ARROWS ----
  arrows:         ["←","↖","↑","↗","→","↘","↓","↙"],
  arrow:          ["↑","→","↓","←"],
  double_arrow:   ["⇑","⇒","⇓","⇐"],
  triangle:       ["◢","◣","◤","◥"],
  triangle2:      ["◤","◥","◢","◣"],

  // ---- GEOMETRIC ----
  scanv:          ["▁ ","▂ ","▃ ","▄ ","▅ ","▆ ","▇ ","█ ","▇ ","▆ ","▅ ","▄ ","▃ ","▂ "],
  block:          ["▖","▘","▝","▗"],
  block2:         ["▌","▀","▐","▄"],
  hbar:           ["▏","▎","▍","▌","▋","▊","▉","█","▉","▊","▋","▌","▍","▎"],
  vbar:           ["▁","▂","▃","▄","▅","▆","▇","█","▇","▆","▅","▄","▃","▂"],
  circle_halves:  ["◐","◓","◑","◒"],
  circle_quarters:["◴","◷","◶","◵"],
  circle:         ["○","◔","◑","◕","●","◕","◑","◔"],
  toggle:         ["⊶","⊷"],
  square_corners: ["◰","◳","◲","◱"],
  point:          ["∙∙∙","●∙∙","∙●∙","∙∙●","∙∙∙"],
  balloon:        [" ","·","•","○","◯","◯","○","•","·"],
  arc:            ["◜","◠","◝","◞","◡","◟"],
  noise:          ["▒","░","▓","█","▓","░"],

  // ---- WAVE / GROW ----
  wave_block:     ["▁▂▃▄","▂▃▄▅","▃▄▅▆","▄▅▆▇","▅▆▇█","▆▇█▇","▇█▇▆","█▇▆▅"],
  grow_horizontal:["▏","▎","▍","▌","▋","▊","▉","█"],
  grow_vertical:  ["▁","▂","▃","▄","▅","▆","▇","█"],
  binary:         ["01","10","00","11"],
  helix:          ["⋱","⋮","⋰","⋯"],
  checkerboard:   ["▖","▘","▝","▗"],
  fillsweep:      ["▘","▝","▗","▖"],
  diagswipe:      ["◢","◣","◤","◥"],
};

export const SPINNER_VARIANTS = Object.keys(SPINNER_FRAMES);

const TIER_COLORS = {
  primary: "text-[#66E6FF]",
  ok: "text-[#2EF2C2]",
  warn: "text-[#FFCC66]",
  danger: "text-[#FF4D6D]",
  muted: "text-[#9FB0C0]",
};

export function Spinner({ variant = "dots", className = "", colorClassName, color = "primary", interval = 100, label, dataTestId }) {
  const frames = SPINNER_FRAMES[variant] || SPINNER_FRAMES.dots;
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % frames.length), interval);
    return () => clearInterval(id);
  }, [frames.length, interval]);
  const colorCls = colorClassName || TIER_COLORS[color] || TIER_COLORS.primary;
  return (
    <span className={`axe-spin inline-flex items-center gap-1 ${colorCls} ${className}`} data-testid={dataTestId || "axe-spinner"}>
      <span className="tabular-nums whitespace-pre">{frames[i]}</span>
      {label && <span className="axe-section-label text-[10px]">{label}</span>}
    </span>
  );
}

// Pull preferred variant from localStorage (per layer)
export function useAdapterSpinner(layer) {
  const [variant, setVariant] = useState(() => {
    try { return localStorage.getItem(`axe_spinner_${layer}`) || "dots"; } catch { return "dots"; }
  });
  useEffect(() => {
    function sync() {
      try {
        const v = localStorage.getItem(`axe_spinner_${layer}`);
        if (v && v !== variant) setVariant(v);
      } catch {}
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [layer, variant]);
  return variant;
}

export function setAdapterSpinner(layer, variant) {
  try { localStorage.setItem(`axe_spinner_${layer}`, variant); } catch {}
  window.dispatchEvent(new Event("storage"));
}
