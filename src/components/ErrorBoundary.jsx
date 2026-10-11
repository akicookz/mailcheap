import { Component } from "react";
import { Button } from "@/components/ui/button";

export default class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="login-page">
        <div className="login-panel">
          <h1>This page could not load.</h1>
          <p>Reload to try again.</p>
          <Button onClick={() => window.location.reload()}>Reload page</Button>
        </div>
      </main>
    );
  }
}
