import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useResource } from "@/hooks/use-resource";
import {
  Badge,
  Button,
  Empty,
  ErrorState,
  Field,
  Heading,
  Input,
  Loading,
  Modal,
} from "@/components/app-ui";

import { CopyValue, ExternalLink } from "@/components/domain-ui";

const cloudflareDashboard = "https://dash.cloudflare.com/";

function ConnectionSetup({ open, onOpenChange }) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Connect Cloudflare"
      description="Set this up once. Then manage your sending domains here."
      wide
    >
      <ol className="domain-steps">
        <li>
          <strong>Use the account that runs Mailcheap</strong>
          <p>
            Copy its account ID from Cloudflare. Email Sending must be available
            on this account.
          </p>
        </li>
        <li>
          <strong>Create a scoped API token</strong>
          <p>
            Give it Email Sending edit access and Zone read access for the
            domains you want to manage.
          </p>
          <ExternalLink href="https://dash.cloudflare.com/profile/api-tokens">
            Create a token
          </ExternalLink>
        </li>
        <li>
          <strong>Add the connection to your Worker</strong>
          <p>
            In Workers &amp; Pages → Mailcheap → Settings → Variables and
            Secrets, add the account ID and save the API token as a secret.
          </p>
          <CopyValue
            value="CLOUDFLARE_ACCOUNT_ID"
            label="account ID variable name"
          />
          <CopyValue
            value="CLOUDFLARE_API_TOKEN"
            label="API token secret name"
          />
          <p>
            Use the same account for the Worker and its sending domains. The
            token stays on the server.
          </p>
        </li>
        <li>
          <strong>Return here and refresh</strong>
          <p>Your existing sending domains will appear automatically.</p>
        </li>
      </ol>
      <Button onClick={() => onOpenChange(false)}>Got it</Button>
    </Modal>
  );
}

function DomainInstructions({
  result,
  localPreview,
  onConfigure,
  onConnect,
  busy,
}) {
  if (!result) return null;
  if (result.mode === "unconnected")
    return (
      <div className="domain-result" role="status">
        <h3>Connect your account first</h3>
        <p>
          Mailcheap needs access to Cloudflare to check where {result.name} is
          managed.
        </p>
        <Button variant="secondary" onClick={onConnect}>
          Set up connection
        </Button>
      </div>
    );
  if (result.mode === "managed")
    return (
      <div className="domain-result" role="status">
        <Badge status="active">Cloudflare zone found</Badge>
        <h3>Ready to configure {result.name}</h3>
        <p>
          Cloudflare will enable Email Sending and create its required DNS
          records in {result.zone}. You can review the records on the next
          screen.
        </p>
        {localPreview ? (
          <p className="notice">
            DNS changes are disabled in local preview. Open the deployed app to
            configure this domain.
          </p>
        ) : (
          <Button onClick={onConfigure} disabled={busy}>
            {busy ? "Configuring…" : "Configure domain"}
            <ArrowRight size={16} />
          </Button>
        )}
      </div>
    );
  return (
    <div className="domain-result" role="status">
      <Badge status="paused">
        {result.mode === "pending"
          ? "Waiting for activation"
          : "Connect domain"}
      </Badge>
      <h3>
        {result.mode === "pending"
          ? `Activate ${result.zone}`
          : "Connect this domain to Cloudflare"}
      </h3>
      <p>
        {result.mode === "pending"
          ? "This zone is in your account, but it is not active yet."
          : "This domain was not found in the connected account. If it is already there, check your API token’s zone access."}{" "}
        Cloudflare Email Sending currently requires Cloudflare DNS.
      </p>
      <ol className="domain-steps compact">
        {result.mode === "external" && (
          <li>
            Add the domain to the same Cloudflare account as Mailcheap. For a
            subdomain, add its parent domain.
          </li>
        )}
        <li>
          Review the imported DNS records, including your website and existing
          mail records.
        </li>
        <li>
          At your registrar, use the nameservers assigned by Cloudflare. Follow
          Cloudflare’s activation steps, including any DNSSEC changes.
        </li>
        <li>
          Once the zone is active, select Check domain again to finish email
          setup.
        </li>
      </ol>
      {result.nameservers?.map((server) => (
        <CopyValue key={server} value={server} label="nameserver" />
      ))}
      <ExternalLink href={cloudflareDashboard}>Open Cloudflare</ExternalLink>
    </div>
  );
}

export default function DomainsPage() {
  const resource = useResource("admin/domains", { freshOnMount: true });
  const navigate = useNavigate();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const domains = resource.data?.domains || [];
  const configure = async () => {
    setBusy(true);
    setError("");
    try {
      const domain = await api("admin/domains", {
        method: "POST",
        body: { name: result.name },
      });
      void client.invalidateQueries({ queryKey: ["api", "admin/domains"] });
      toast.success("Domain configured in Cloudflare");
      navigate(`/domains/${encodeURIComponent(domain.name)}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Heading
        title="Domains"
        description="Connect a domain and send from an address of your own."
      >
        <Button
          variant="secondary"
          disabled={refreshing || resource.loading}
          onClick={async () => {
            setRefreshing(true);
            try {
              await resource.refresh();
            } finally {
              setRefreshing(false);
            }
          }}
        >
          <RefreshCw size={16} className={refreshing ? "spin" : ""} />
          Refresh
        </Button>
      </Heading>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorState error={resource.error} retry={resource.refresh} />
      ) : (
        <>
          {!resource.data?.configured && (
            <section className="panel domain-connection">
              <div>
                <h2>Connect your Cloudflare account</h2>
                <p>
                  One connection lets Mailcheap find your zones and configure
                  email records for you.
                </p>
              </div>
              <Button variant="secondary" onClick={() => setSetup(true)}>
                Set up connection
                <ArrowRight size={16} />
              </Button>
            </section>
          )}
          <div className="domain-layout">
            <section className="panel domain-add">
              <h2>Add a sending domain</h2>
              <p>
                Use your domain or a dedicated subdomain, like news.example.com.
              </p>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  setBusy(true);
                  setResult(null);
                  setError("");
                  try {
                    setResult(
                      await api(
                        `admin/domains/lookup?name=${encodeURIComponent(name.trim())}`,
                      ),
                    );
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Field label="Domain">
                  <Input
                    required
                    disabled={busy}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={253}
                    placeholder="news.example.com"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setResult(null);
                      setError("");
                    }}
                  />
                </Field>
                <Button type="submit" disabled={busy}>
                  {busy ? "Working…" : "Check domain"}
                  <ArrowRight size={16} />
                </Button>
              </form>
              {error && <ErrorState error={error} />}
              <DomainInstructions
                result={result}
                localPreview={resource.data?.local_preview}
                onConfigure={configure}
                onConnect={() => setSetup(true)}
                busy={busy}
              />
            </section>
            <aside className="panel domain-guide">
              <h2>From domain to inbox</h2>
              <ol className="domain-steps">
                <li>
                  <strong>Find your zone</strong>
                  <p>
                    We check the connected Cloudflare account for your domain.
                  </p>
                </li>
                <li>
                  <strong>Configure sending</strong>
                  <p>
                    Cloudflare creates the email records for active zones. Other
                    domains get connection instructions.
                  </p>
                </li>
                <li>
                  <strong>Choose your sender</strong>
                  <p>
                    Use an address on the exact domain you configured in your
                    newsletter settings.
                  </p>
                </li>
              </ol>
            </aside>
          </div>
          <section className="panel">
            <div className="section-heading">
              <h2>Sending domains</h2>
              <span className="domain-count">
                {resource.data?.configured
                  ? `${domains.length} ${domains.length === 1 ? "domain" : "domains"}`
                  : "Not connected"}
              </span>
            </div>
            {domains.length ? (
              <div className="domain-list">
                {domains.map((domain) => (
                  <Link
                    className="domain-row"
                    to={`/domains/${encodeURIComponent(domain.name)}`}
                    key={domain.name}
                  >
                    <div>
                      <strong>{domain.name}</strong>
                      <small>Zone: {domain.zone}</small>
                    </div>
                    <Badge status={domain.enabled ? "active" : "paused"}>
                      {domain.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <ArrowRight size={16} />
                  </Link>
                ))}
              </div>
            ) : (
              <Empty
                title={
                  resource.data?.configured
                    ? "No sending domains yet"
                    : "Your domains will appear here"
                }
                description={
                  resource.data?.configured
                    ? "Add a domain above to configure Email Sending."
                    : "Connect Cloudflare to load existing domains and add new ones."
                }
              />
            )}
          </section>
        </>
      )}
      <ConnectionSetup open={setup} onOpenChange={setSetup} />
    </>
  );
}
