import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useResource } from "@/hooks/use-resource";
import { api } from "@/lib/api";
import { Badge, Button, ErrorState, Loading, Modal } from "@/components/app-ui";
import { CopyValue, ExternalLink } from "@/components/domain-ui";

export default function CloudflareConnection() {
  const connection = useResource("admin/cloudflare", { freshOnMount: true });
  const client = useQueryClient();
  const [setup, setSetup] = useState(false);
  const [disconnect, setDisconnect] = useState(false);
  const [busy, setBusy] = useState(false);
  const data = connection.data;
  async function connect() {
    if (!data?.oauth_ready) {
      setSetup(true);
      return;
    }
    setBusy(true);
    try {
      const { url } = await api("admin/cloudflare/connect", { method: "POST" });
      window.location.assign(url);
    } catch (error) {
      toast.error(error.message);
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel domain-connection">
        <div>
          <div className="section-heading">
            <h2>Cloudflare connection</h2>
            {data && (
              <Badge status={data.configured ? "active" : "paused"}>
                {data.configured
                  ? "Connected"
                  : data.status === "reconnect"
                    ? "Reconnect needed"
                    : "Not connected"}
              </Badge>
            )}
          </div>
          <p>
            {data?.configured
              ? "Manage sending domains in the Cloudflare account that runs Mailcheap."
              : "Connect once to find your zones, enable Email Sending, and configure its DNS records."}
          </p>
          {data?.configured && data.method === "api_token" && (
            <p>
              Connected with a Worker API token. Set up OAuth to use the Connect
              button.
            </p>
          )}
          {data?.local_preview && (
            <p>
              Local preview can check the connection. Domain changes remain
              disabled.
            </p>
          )}
          {connection.error && (
            <ErrorState error={connection.error} retry={connection.refresh} />
          )}
        </div>
        {connection.loading ? (
          <Loading />
        ) : data ? (
          <div className="actions">
            <Button onClick={connect} disabled={busy}>
              {busy
                ? "Connecting…"
                : data.configured
                  ? "Reconnect"
                  : "Connect Cloudflare"}
              <ArrowUpRight size={16} />
            </Button>
            {data.configured && data.method === "oauth" && (
              <Button
                variant="ghost"
                onClick={() => setDisconnect(true)}
                disabled={busy}
              >
                Disconnect
              </Button>
            )}
          </div>
        ) : null}
      </section>
      <Modal
        open={setup}
        onOpenChange={setSetup}
        title="Set up Cloudflare OAuth"
        description="Register Mailcheap once. After that, connect through Cloudflare without copying an API token."
        wide
      >
        <ol className="domain-steps">
          <li>
            <strong>Create a private OAuth client</strong>
            <p>
              In the account that runs this Worker, go to Manage Account → OAuth
              clients. Name it Mailcheap and keep it private.
            </p>
            <ExternalLink href="https://dash.cloudflare.com/?to=/:account/oauth-clients">
              Open OAuth clients
            </ExternalLink>
          </li>
          <li>
            <strong>Configure the authorization flow</strong>
            <p>
              Choose response type Code, grant types Authorization code and
              Refresh token, and token authentication method Client secret post.
            </p>
            <CopyValue
              value={data?.callback_url || ""}
              label="OAuth callback URL"
            />
          </li>
          <li>
            <strong>Allow domain and email access</strong>
            <p>
              Add Zone Read and Email Sending Write as required permissions.
              Refresh access lets Mailcheap keep the connection working.
            </p>
          </li>
          <li>
            <strong>Save the client credentials on the Worker</strong>
            <p>
              Add these in Workers &amp; Pages → Mailcheap → Settings →
              Variables and Secrets. Save the client secret as a secret.
            </p>
            <CopyValue
              value="CLOUDFLARE_OAUTH_CLIENT_ID"
              label="client ID variable name"
            />
            <CopyValue
              value="CLOUDFLARE_OAUTH_CLIENT_SECRET"
              label="client secret variable name"
            />
            <p>
              The OAuth database migration must be applied before connecting.
              Your Cloudflare account ID must match this Worker’s account.
            </p>
          </li>
        </ol>
        <Button
          variant="secondary"
          onClick={async () => {
            await connection.refresh();
            setSetup(false);
          }}
        >
          <RefreshCw size={16} />
          Check setup
        </Button>
      </Modal>
      <Modal
        open={disconnect}
        onOpenChange={setDisconnect}
        title="Disconnect Cloudflare?"
        description="Mailcheap will remove the saved access and request token revocation. Existing domains, DNS records, and the Worker’s email sending setting stay as they are."
      >
        <p>
          To stop email delivery, turn off the app’s sending setting separately.
        </p>
        <div className="actions">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setDisconnect(false)}
          >
            Keep connected
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await api("admin/cloudflare/disconnect", {
                  method: "POST",
                });
                setDisconnect(false);
                await client.invalidateQueries({ queryKey: ["api"] });
                toast.success(
                  result.revoked
                    ? "Cloudflare disconnected"
                    : "Connection removed. Revoke Mailcheap in Cloudflare’s authorized apps to finish removing access.",
                );
              } catch (error) {
                toast.error(error.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Disconnecting…" : "Disconnect"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
