import React, { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
  useNavigate,
  Outlet,
} from "react-router-dom";
import {
  Mail,
  LayoutDashboard,
  Send,
  Users,
  BookOpen,
  Settings,
  LogOut,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { api, useResource } from "./api";
import { Button, Input, Field, Loading } from "./ui";
import {
  Overview,
  CampaignList,
  NewsletterList,
  NewsletterSettings,
  Contacts,
  SettingsPage,
} from "./pages";
const CampaignEditor = lazy(() => import("./editor"));
import "./style.css";

function Login({ onLogin }) {
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
function Shell({ onLogout }) {
  const status = useResource("admin/status");
  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink to="/" className="logo">
          <Mail size={22} /> Mailcheap
        </NavLink>
        <nav aria-label="Main navigation">
          {[
            ["/", "Overview", LayoutDashboard],
            ["/campaigns", "Campaigns", Send],
            ["/contacts", "Contacts", Users],
            ["/newsletters", "Newsletters", BookOpen],
            ["/settings", "Settings", Settings],
          ].map(([path, label, Icon]) => (
            <NavLink key={path} to={path} end={path === "/"}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span
            className={`connection ${status.data?.sending_enabled ? "enabled" : ""}`}
          >
            <i />
            {status.data?.local_preview
              ? "Local preview"
              : status.data?.sending_enabled
                ? "Sending enabled"
                : "Sending is off"}
          </span>
          <button
            onClick={async () => {
              try {
                await api("logout", { method: "POST" });
                onLogout();
              } catch (e) {
                toast.error(e.message);
              }
            }}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <main className="workspace">
        <Outlet context={{ status: status.data }} />
      </main>
    </div>
  );
}
function App() {
  const [signedIn, setSignedIn] = useState(null);
  useEffect(() => {
    api("session")
      .then((data) => setSignedIn(data.authenticated))
      .catch(() => setSignedIn(false));
  }, []);
  if (signedIn === null) return <Loading />;
  if (!signedIn) return <Login onLogin={() => setSignedIn(true)} />;
  return (
    <Routes>
      <Route element={<Shell onLogout={() => setSignedIn(false)} />}>
        <Route index element={<Overview />} />
        <Route path="campaigns" element={<CampaignList />} />
        <Route
          path="campaigns/:id"
          element={
            <Suspense fallback={<Loading />}>
              <CampaignEditor />
            </Suspense>
          }
        />
        <Route path="contacts" element={<Contacts />} />
        <Route path="newsletters" element={<NewsletterList />} />
        <Route path="newsletters/:id" element={<NewsletterSettings />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
    <Toaster position="bottom-right" richColors />
  </BrowserRouter>,
);
