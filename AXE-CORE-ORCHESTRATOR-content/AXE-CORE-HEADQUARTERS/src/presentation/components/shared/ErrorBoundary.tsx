import { Component, type ReactNode } from 'react';
import { describeFailure, maakMeldingsfilter } from '@/domain/globalFailure';
import { toast } from '@/presentation/components/shared/toast';

interface Props {
  children: ReactNode;
  /**
   * Vaste inhoud, of een functie die de foutmelding krijgt.
   *
   * Die functievorm bestaat omdat de vaste vorm hem weggooide: AppShell gaf een
   * eigen scherm mee dat "This page crashed" toonde en verder niets, terwijl de
   * melding hier gewoon in state stond. Een crashscherm zonder oorzaak maakt van
   * een fout van vijf minuten een zoektocht van een uur.
   */
  fallback?: ReactNode | ((fout: string) => ReactNode);
}

interface State {
  hasError: boolean;
  error: string | null;
}

/**
 * Last line of defence for render-time failures. The global event listeners
 * below cover failures React boundaries cannot observe (plain JS and rejected
 * promises). The Toaster is mounted above this component so feedback remains
 * available while the application fallback is displayed.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message || 'Unknown error' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AXE ErrorBoundary]', error, info.componentStack);
    // Was "AXE ran into an unexpected problem. You can try again or reload."
    // -- één zin die bij elke crash hetzelfde zei en dus nooit iets toevoegde.
    // describeFailure kent het verschil tussen een weggevallen server, een
    // verwisselde build en een echte fout in de pagina, en dat verschil bepaalt
    // wat je eraan doet.
    toast.error(describeFailure(error).message);
  }

  private retry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error ?? 'Onbekende fout');
      }
      return this.props.fallback || (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center" style={{ backgroundColor: 'var(--bg-base)' }}>
          <div className="text-center p-8 max-w-md">
            <div className="text-4xl mb-4" style={{ color: 'var(--accent-cyan)' }}>◆</div>
            <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>AXE encountered an error</h2>
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Something went wrong. Try recovering the screen first; reload AXE if it persists.
            </p>
            {this.state.error && (
              <pre className="text-[10px] text-left mb-6 max-h-24 overflow-y-auto rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(248,113,113,0.85)', border: '1px solid rgba(248,113,113,0.2)' }}>
                {this.state.error}
              </pre>
            )}
            <div className="flex justify-center gap-3">
              <button
                onClick={this.retry}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ backgroundColor: 'var(--bg-active)', border: '1px solid var(--border-active)', color: 'var(--accent-cyan)' }}
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ backgroundColor: 'var(--bg-active)', border: '1px solid var(--border-active)', color: 'var(--accent-cyan)' }}
              >
                Reload AXE
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}


if (typeof window !== 'undefined') {
  // Eén storing hoort één melding te geven. Toen de API-host wegviel liepen er
  // twaalf verzoeken tegelijk stuk en kreeg je twaalf keer "Request failed:
  // Load failed" — ruis die de oorzaak eerder verbergt dan toont. Het filter
  // hieronder houdt dezelfde tekst een venster lang tegen; describeFailure
  // vertaalt de motortekst naar wat er werkelijk aan de hand is.
  const magTonen = maakMeldingsfilter();

  const meld = (reason: unknown, herkomst: string) => {
    console.error(herkomst, reason);
    const { message } = describeFailure(reason);
    if (magTonen(message, Date.now())) toast.error(message);
  };

  window.addEventListener('error', (event) => {
    meld(event.error ?? event.message, '[AXE Global Error]');
  });

  window.addEventListener('unhandledrejection', (event) => {
    meld(event.reason, '[AXE Unhandled Rejection]');
  });
}
