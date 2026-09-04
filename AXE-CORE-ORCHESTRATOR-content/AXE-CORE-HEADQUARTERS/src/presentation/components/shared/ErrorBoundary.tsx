import { Component, type ReactNode } from 'react';
import { toast } from '@/presentation/components/shared/toast';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
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
    toast.error('AXE ran into an unexpected problem. You can try again or reload.');
  }

  private retry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
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

/**
 * De reden van een afgewezen belofte, in woorden.
 *
 * Dit gaf alleen "Something unexpected went wrong." zodra de reden geen echte
 * Error was -- en dat is precies het normale geval. Een mislukte fetch levert
 * een Response op, Supabase geeft een object met `message`, onze eigen gateways
 * gooien `{ error }` of `{ detail }`. Al die gevallen vielen door naar de
 * algemene zin, dus stond er in de app een rode balk die niets zei terwijl de
 * oorzaak wél bekend was.
 *
 * Een foutmelding die de fout verzwijgt is erger dan geen foutmelding: je weet
 * dat er iets stuk is en je kunt er niets mee.
 */
function getSafeErrorMessage(reason: unknown): string {
  if (typeof reason === 'string' && reason.trim()) return reason;
  if (reason instanceof Error && reason.message) return reason.message;

  if (reason && typeof reason === 'object') {
    const o = reason as Record<string, unknown>;
    for (const sleutel of ['message', 'error', 'detail', 'statusText'] as const) {
      const waarde = o[sleutel];
      if (typeof waarde === 'string' && waarde.trim()) return waarde;
      // Supabase nest de echte fout soms een niveau dieper.
      if (waarde && typeof waarde === 'object') {
        const binnen = (waarde as Record<string, unknown>).message;
        if (typeof binnen === 'string' && binnen.trim()) return binnen;
      }
    }
    const status = o.status;
    if (typeof status === 'number') return `HTTP ${status}`;
  }

  return 'Something unexpected went wrong.';
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.error('[AXE Global Error]', event.error ?? event.message);
    toast.error('Something went wrong. Please try again.');
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[AXE Unhandled Rejection]', event.reason);
    toast.error(`Request failed: ${getSafeErrorMessage(event.reason)}`);
  });
}
