import React from "react";

export function Panel({ title, right, children, className = "", flush = false, glow = true, dataTestId }) {
  return (
    <section
      className={`axe-panel relative overflow-hidden ${className}`}
      data-testid={dataTestId}
      style={glow ? undefined : { ['--no-glow']: '1' }}
    >
      {title && (
        <header className="axe-panel-header">
          <h3 className="axe-panel-title">{title}</h3>
          {right && <div className="flex items-center gap-2">{right}</div>}
        </header>
      )}
      <div className={flush ? "axe-panel-flush" : "axe-panel-body"}>{children}</div>
    </section>
  );
}

export function Badge({ tone = "cyan", children, className = "", dataTestId }) {
  const map = {
    cyan: "axe-badge axe-badge-cyan",
    ok: "axe-badge axe-badge-ok",
    stale: "axe-badge axe-badge-stale",
    error: "axe-badge axe-badge-error",
    amber: "axe-badge axe-badge-amber",
    alert: "axe-badge axe-badge-alert",
  };
  return (
    <span className={`${map[tone]} ${className}`} data-testid={dataTestId}>
      {children}
    </span>
  );
}

export function HealthDot({ status }) {
  const color = status === "ok" ? "#2EF2C2" : status === "stale" ? "#FFCC66" : "#FF4D6D";
  return (
    <span
      className="inline-block rounded-full"
      style={{ width: 6, height: 6, background: color, boxShadow: `0 0 8px ${color}` }}
    />
  );
}
