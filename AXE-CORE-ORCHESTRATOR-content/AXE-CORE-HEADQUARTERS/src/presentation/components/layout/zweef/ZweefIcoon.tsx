/**
 * De iconen van de zwevers, met dezelfde paden als in demo/toekomst/toekomst.js
 * zodat de kopbalk en de voet er precies zo uitzien als op de maquette.
 */
const PADEN = {
  telefoon: <><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18h2" /></>,
  herlaad: <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5" />,
  speld: <path d="M12 17v5M8 8l-2 6h12l-2-6M9 3h6l-1 5h-4z" />,
  kruis: <path d="M18 6L6 18M6 6l12 12" />,
  home: <><path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z" /></>,
  bol: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
} as const;

export type ZweefIcoonNaam = keyof typeof PADEN;

export function ZweefIcoon({ naam, className }: { naam: ZweefIcoonNaam; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PADEN[naam]}
    </svg>
  );
}
