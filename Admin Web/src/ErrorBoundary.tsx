import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { failed: boolean };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('The application could not render.', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="fatal-error" role="alert">
      <img src="/logo.png" alt="X-TRIM FIT GYM" />
      <h1>Something went wrong</h1>
      <p>Your saved records were not changed. Reload the page to reconnect and try again.</p>
      <button type="button" onClick={() => window.location.reload()}>Reload application</button>
    </main>;
  }
}
