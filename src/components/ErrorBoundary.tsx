import React from 'react';
import { signOut } from 'firebase/auth';
import { AlertTriangle, LogOut, RotateCcw } from 'lucide-react';
import { auth } from '../lib/firebase';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  signingOut: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '', signingOut: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      message: error.message || 'An unexpected application error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary:', error, info);
  }

  handleSignOutAndReload = async (): Promise<void> => {
    this.setState({ signingOut: true });
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Error signing out during recovery:', err);
    } finally {
      window.location.reload();
    }
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      let readableMessage = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed && typeof parsed.error === 'string') {
          readableMessage = `${parsed.error} (${parsed.operationType} on ${parsed.path || 'database'})`;
        }
      } catch {
        // Keep original message
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-8">
            <div className="flex items-center gap-3 text-red-700 mb-4">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h1 className="text-lg font-semibold text-slate-900">
                System Error Encountered
              </h1>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-6 break-words">
              {readableMessage}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                disabled={this.state.signingOut}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-4 h-4" />
                Reload Application
              </button>
              <button
                type="button"
                onClick={this.handleSignOutAndReload}
                disabled={this.state.signingOut}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <LogOut className="w-4 h-4 text-slate-500" />
                {this.state.signingOut
                  ? 'Signing Out...'
                  : 'Sign Out & Return to Login'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
