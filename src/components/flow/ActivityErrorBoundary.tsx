"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Shown when a child throws during render */
  fallback?: ReactNode;
  label?: string;
};

type State = { error: Error | null };

/**
 * Keeps the Builder usable when one activity's corrupt/compacted config throws.
 * Without this, a single bad node white-screens the whole flow editor.
 */
export class ActivityErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[Flowlytics] Activity render failed${this.props.label ? ` (${this.props.label})` : ""}:`,
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="rounded-xl border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
          This activity could not be shown (bad or compacted data). Close and re-run the
          flow, or delete the activity.
        </div>
      );
    }
    return this.props.children;
  }
}
