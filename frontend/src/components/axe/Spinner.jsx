import React, { useEffect, useState } from "react";

const FRAMES = {
  braille: ["⡀", "⡄", "⡆", "⡇", "⠇", "⠏", "⠟", "⠿", "⡿", "⣿", "⡿", "⠿", "⠟", "⠏", "⠇", "⡇", "⡆", "⡄"],
  dots: ["⠁", "⠂", "⠄", "⡀", "⢀", "⢠", "⠠", "⠐"],
  arrows: ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙"],
  ascii: [".  ", ".. ", "...", " ..", "  .", "   "],
  scan: ["▖", "▘", "▝", "▗"],
  pulse: ["·", "•", "●", "•", "·"],
  sand: ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█", "▇", "▆", "▅", "▄", "▃", "▂"],
  hbar: ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█", "▉", "▊", "▋", "▌", "▍", "▎"],
  triangle: ["◢", "◣", "◤", "◥"],
  binary: ["01", "10", "00", "11"],
  wave: ["▁▂▃▄", "▂▃▄▅", "▃▄▅▆", "▄▅▆▇", "▅▆▇█", "▆▇█▇", "▇█▇▆", "█▇▆▅"],
  block: ["▖", "▘", "▝", "▗", "▖"],
  circle: ["○", "◔", "◑", "◕", "●", "◕", "◑", "◔"],
  rain: ["▁ ▁ ", " ▁ ▁", "▁ ▁ ", " ▁ ▁"],
  helix: ["⋱", "⋮", "⋰", "⋯"],
  scanv: ["▁ ", "▂ ", "▃ ", "▄ ", "▅ ", "▆ ", "▇ ", "█ ", "▇ ", "▆ ", "▅ ", "▄ ", "▃ ", "▂ "],
};

export function Spinner({ variant = "braille", className = "", colorClassName = "text-[#66E6FF]", interval = 100, label }) {
  const frames = FRAMES[variant] || FRAMES.braille;
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % frames.length), interval);
    return () => clearInterval(id);
  }, [frames.length, interval]);
  return (
    <span className={`axe-spin inline-flex items-center gap-1 ${colorClassName} ${className}`} data-testid="axe-spinner">
      <span className="tabular-nums">{frames[i]}</span>
      {label && <span className="axe-section-label text-[10px]">{label}</span>}
    </span>
  );
}

export const SPINNER_VARIANTS = Object.keys(FRAMES);
