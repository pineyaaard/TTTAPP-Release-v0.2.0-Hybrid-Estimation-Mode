import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = "An unexpected error occurred.";
      try {
        if (this.state.error?.message) {
          const parsedError = JSON.parse(this.state.error.message);
          if (parsedError.error) {
            errorMessage = "Permission denied or database error: " + parsedError.error;
          }
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4 font-sans">
          <div className="glass-panel p-8 max-w-md w-full space-y-4 border border-rose-500/20">
            <h2 className="text-xl font-bold text-rose-500">Something went wrong</h2>
            <p className="text-zinc-300 text-sm">{errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-2 px-4 rounded transition-colors mt-4 text-sm"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
