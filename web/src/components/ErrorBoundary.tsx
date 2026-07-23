"use client";

import { Component, type ReactNode } from "react";
import { logError } from "@/lib/analytics";

type Props = { children: ReactNode };
type State = { error: Error | null };

// Top-level boundary so an unexpected render error shows a recoverable screen
// instead of a blank page, and reports itself to the monitoring endpoint.
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    logError(error, { componentStack: info.componentStack, boundary: "app" });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/15 text-2xl">
            ⚠️
          </div>
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-slate-400">
            The issue has been logged. You can reload to get back on track.
          </p>
          <button
            className="btn-primary"
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
          >
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
