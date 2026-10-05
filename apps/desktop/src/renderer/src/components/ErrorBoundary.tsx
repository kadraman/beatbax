import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logDiagnostics } from '../lib/diagnostics-log';
import { FatalErrorScreen } from './FatalErrorScreen';

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
    logDiagnostics('error', 'renderer', `BeatBax Desktop failed to start: ${error.message}`, error);
  }

  render(): ReactNode {
    if (this.state.error) {
      return <FatalErrorScreen error={this.state.error} />;
    }
    return this.props.children;
  }
}
