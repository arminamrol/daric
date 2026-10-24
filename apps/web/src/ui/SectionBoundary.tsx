import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { Component } from 'react';
import type { ReactNode } from 'react';
import { ErrorState } from './ErrorState';

interface Props {
  children: ReactNode;
  /** What the error state says; defaults to the primitives' own "could not be loaded". */
  title?: string | undefined;
  /** When it changes (a new route or Period), a failed section tries again by itself. */
  resetKey?: unknown;
  onReset: () => void;
}

class Boundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidUpdate(previous: Props) {
    if (this.state.failed && !Object.is(previous.resetKey, this.props.resetKey)) this.retry();
  }

  retry = () => {
    this.props.onReset();
    this.setState({ failed: false });
  };

  override render() {
    if (this.state.failed) return <ErrorState title={this.props.title} onRetry={this.retry} />;
    return this.props.children;
  }
}

/**
 * Keeps a failure in one section of a screen to that section: it shows an error state with retry
 * and the rest keeps working. Retry draws the section again and asks its own failed queries (those
 * that throw to a boundary) again, leaving other sections' alone.
 */
export function SectionBoundary({
  children,
  title,
  resetKey,
}: {
  children: ReactNode;
  title?: string;
  resetKey?: unknown;
}) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <Boundary title={title} resetKey={resetKey} onReset={reset}>
          {children}
        </Boundary>
      )}
    </QueryErrorResetBoundary>
  );
}
