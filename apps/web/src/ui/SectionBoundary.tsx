import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { Component } from 'react';
import type { ReactNode } from 'react';
import { ErrorState } from './ErrorState';

interface Props {
  children: ReactNode;
  /** What the error state says; defaults to the primitives' own "could not be loaded". */
  title?: string | undefined;
  onReset: () => void;
}

class Boundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
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
 * and the rest keeps working. Retry draws the section again and asks its failed queries (those
 * that throw to a boundary) again.
 */
export function SectionBoundary({ children, title }: { children: ReactNode; title?: string }) {
  const { reset } = useQueryErrorResetBoundary();
  return (
    <Boundary title={title} onReset={reset}>
      {children}
    </Boundary>
  );
}
