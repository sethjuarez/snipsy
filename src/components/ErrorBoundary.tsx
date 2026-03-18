import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          className="flex flex-col items-center justify-center h-full gap-4 p-8"
          style={{ color: "var(--color-text-secondary)" }}
          data-testid="error-boundary"
        >
          <div
            className="text-lg font-semibold"
            style={{ color: "var(--color-danger)" }}
          >
            Something went wrong
          </div>
          <p className="text-base text-center max-w-md">
            An unexpected error occurred. Try reloading the app.
          </p>
          {this.state.error && (
            <pre
              className="text-sm font-mono p-3 rounded max-w-lg overflow-auto"
              style={{
                backgroundColor: "var(--color-surface-inset)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 rounded text-md font-medium"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "var(--color-text-on-accent)",
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
