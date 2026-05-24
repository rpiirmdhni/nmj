"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <div className="rounded-xl border bg-card p-8 max-w-md">
            <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Refresh the page or go back to the dashboard.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                Try Again
              </button>
              <a
                href="/chat"
                className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Go to Chat
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
