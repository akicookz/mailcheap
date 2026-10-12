import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { Plus, ArrowUpRight, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import CloudflareConnection from "@/components/CloudflareConnection";
import { useResource } from "@/hooks/use-resource";
import {
  Button,
  Input,
  Textarea,
  Field,
  Heading,
  ErrorState,
  Loading,
  Modal,
  Badge,
  AsyncButton,
  date,
} from "@/components/app-ui";

export default function SettingsPage() {
  const { status } = useOutletContext();
  const keys = useResource("admin/keys");
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <Heading
        title="Settings"
        description="Your sending connection and integrations."
      />
      <CloudflareConnection />
      <div className="settings-layout">
        <div>
          <section className="panel">
            <div className="section-heading">
              <h2>Email sending</h2>
              <Badge status={status?.sending_enabled ? "active" : "paused"}>
                {!status
                  ? "Loading…"
                  : status.sending_enabled
                    ? "Enabled"
                    : "Sending off"}
              </Badge>
            </div>
            <p>
              Cloudflare Email handles delivery. Campaigns are paced at{" "}
              {status?.send_per_second || 2} messages per second.
            </p>
            <div className="summary-row">
              <span>Admin and test recipient</span>
              <strong>{status?.email || "Loading…"}</strong>
            </div>
            <div className="summary-row">
              <span>Mode</span>
              <strong>
                {status?.local_preview ? "Local simulation" : "Cloudflare"}
              </strong>
            </div>
            {!status?.sending_enabled && (
              <div className="notice">
                Sending is off. Configure a sender in Domains, configure
                delivery events, then enable sending for this app.
              </div>
            )}
            {status?.uncertain > 0 && (
              <div className="notice error">
                {status.uncertain} delivery outcomes need review. Check the
                campaign report and Cloudflare email logs before taking further
                action.
              </div>
            )}
            <div className="actions">
              <Button asChild variant="secondary">
                <Link to="/domains">Manage domains</Link>
              </Button>
              <a
                className="text-link"
                href="https://dash.cloudflare.com/?to=/:account/email/sending"
                target="_blank"
                rel="noreferrer"
              >
                Open Cloudflare <ArrowUpRight size={16} />
              </a>
            </div>
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>API keys</h2>
              <Button
                variant="secondary"
                onClick={() => {
                  setOpen(true);
                  setToken("");
                }}
              >
                <Plus size={15} /> Create key
              </Button>
            </div>
            <p>
              Use a key to collect subscribers or create drafts from another
              app.
            </p>
            {keys.loading ? (
              <Loading />
            ) : keys.error ? (
              <ErrorState error={keys.error} />
            ) : keys.data?.length ? (
              <div>
                {keys.data.map((key) => (
                  <div className="key-row" key={key.id}>
                    <KeyRound size={17} />
                    <div>
                      <strong>{key.name}</strong>
                      <small>
                        {key.prefix}… ·{" "}
                        {key.revoked_at
                          ? "Revoked"
                          : `Created ${date(key.created_at)}`}
                      </small>
                    </div>
                    {!key.revoked_at && (
                      <AsyncButton
                        variant="ghost"
                        onClick={async () => {
                          try {
                            await api(`admin/keys/${key.id}`, {
                              method: "DELETE",
                            });
                            await keys.refresh();
                          } catch (e) {
                            toast.error(e.message);
                          }
                        }}
                      >
                        Revoke
                      </AsyncButton>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="subtle-empty">No API keys yet.</p>
            )}
          </section>
        </div>
        <aside className="panel">
          <h2>Connect your app</h2>
          <p>Add subscribers with your newsletter’s public slug.</p>
          <code>POST /api/v1/contacts</code>
          <p>Authorization: Bearer &lt;key&gt;</p>
          <pre>
            {JSON.stringify(
              { newsletter: "your-slug", email: "reader@example.com" },
              null,
              2,
            )}
          </pre>
          <p>
            Create drafts through <code>/api/v1/campaigns</code>. Sending stays
            a deliberate action in this dashboard.
          </p>
        </aside>
      </div>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={token ? "Save your API key" : "Create an API key"}
        description={
          token
            ? "This key is shown only once. Store it somewhere secure."
            : "Give this integration a name you will recognize."
        }
      >
        {token ? (
          <>
            <Textarea aria-label="New API key" readOnly value={token} />
            <Button
              onClick={() => {
                navigator.clipboard.writeText(token);
                toast.success("Key copied");
              }}
            >
              <Copy size={16} /> Copy key
            </Button>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const result = await api("admin/keys", {
                  method: "POST",
                  body: { name },
                });
                setToken(result.token);
                setName("");
                await keys.refresh();
              } catch (e) {
                toast.error(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Name">
              <Input
                autoFocus
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My website"
              />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create key"}
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}
