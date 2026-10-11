import { useState } from "react";
import { Mail } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Input, Field } from "@/components/app-ui";
export default function Login({ onLogin }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="login-page">
      <div className="login-panel">
        <div className="logo">
          <Mail size={24} /> Mailcheap
        </div>
        <h1>
          A little closer
          <br />
          to your readers.
        </h1>
        <p>Sign in to write your next issue.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api("login", { method: "POST", body: { email, password } });
              onLogin();
            } catch (error) {
              setError(error.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Email">
            <Input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <small>Your newsletter, your list.</small>
      </div>
    </main>
  );
}
