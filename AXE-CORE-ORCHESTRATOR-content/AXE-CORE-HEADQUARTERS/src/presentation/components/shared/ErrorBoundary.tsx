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

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, error: err.message || 'Unknown error' };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error('[AXE ErrorBoundary]', err, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center" style={{ backgroundColor: '#000000' }}>
            <div className="text-center p-8 max-w-md">
              <div className="text-4xl mb-4" style={{ color: 'var(--accent-cyan)' }}>◆</div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: '#FFFFFF' }}>AXE Encountered an Error</h2>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                {this.state.error}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ backgroundColor: 'var(--bg-active)', border: '1px solid var(--border-active)', color: 'var(--accent-cyan)' }}
              >
                Reload AXE Command Center
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

// Global error handler — these fire for errors OUTSIDE React's render cycle
// (a plain JS error, a rejected promise nobody awaited), which ErrorBoundary
// never sees. Before this they only reached the console, invisible unless
// someone had devtools open; now they surface the same way any other
// failure does — a real toast, not a silent gap.
if (typeof window !== 'undefined') {
  window.onerror = (msg, _url, _line, _col, err) => {
    console.error('[AXE Global Error]', msg, err);
    toast.error(typeof msg === 'string' ? msg : 'Er ging iets mis (zie console).');
    return false;
  };
  window.onunhandledrejection = (e) => {
    console.error('[AXE Unhandled Rejection]', e.reason);
    const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
    toast.error(`Onverwerkte fout: ${reason}`);
  };
}
