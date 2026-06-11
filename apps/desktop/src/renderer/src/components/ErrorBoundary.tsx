import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('BeatBax Desktop renderer error:', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="desktop-fatal">
          <h1>BeatBax Desktop failed to start</h1>
          <pre>{this.state.error.message}</pre>
          <p>Use View → Toggle Developer Tools for the full stack trace.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
