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
        <div className="fixed inset-0 z-[99999] flex items-center justify-center" style={{ backgroundColor: '#000000' }}>
          <div className="text-center p-8 max-w-md">
            <div className="text-4xl mb-4" style={{ color: 'var(--accent-cyan)' }}>◆</div>
            <h2 className="text-xl font-semibold mb-2" style={{ color: '#FFFFFF' }}>AXE encountered an error</h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              Something went wrong. Try recovering the screen first; reload AXE if it persists.
            </p>
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

function getSafeErrorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message) return reason.message;
  return 'Something unexpected went wrong.';
}

// React boundaries do not capture errors from asynchronous work or browser
// event handlers. Register listeners instead of assigning window.onerror so
// other integrations retain their own error handling.
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
