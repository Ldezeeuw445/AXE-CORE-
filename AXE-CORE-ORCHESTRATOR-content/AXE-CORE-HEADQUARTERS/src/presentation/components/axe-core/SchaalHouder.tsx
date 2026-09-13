import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Schaal een vast viewport in de beschikbare ruimte, van bovenaf gecentreerd. */
export function SchaalHouder({
  breedte, hoogte, children,
}: {
  breedte: number;
  hoogte: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [schaal, setSchaal] = useState(0.35);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const meet = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width < 8 || height < 8) return;
      setSchaal(Math.min(width / breedte, height / hoogte, 1));
    };
    meet();
    const ro = new ResizeObserver(meet);
    ro.observe(el);
    return () => ro.disconnect();
  }, [breedte, hoogte]);

  return (
    <div ref={ref} className="axe-studio-schaal">
      <div style={{ width: breedte * schaal, height: hoogte * schaal, position: 'relative' }}>
        <div style={{
          width: breedte,
          height: hoogte,
          transform: `scale(${schaal})`,
          transformOrigin: 'top left',
          position: 'absolute',
          left: 0,
          top: 0,
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}

