import { Alert } from "@mantine/core";
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** When this value changes, the boundary resets and tries again. */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
  resetKey?: unknown;
}

/** Shows an error message instead of unmounting the whole page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  render() {
    if (this.state.error) {
      return (
        <Alert color="red" role="alert">
          Could not show the preview: {this.state.error.message}. You can still download the PDFs.
        </Alert>
      );
    }
    return this.props.children;
  }
}
