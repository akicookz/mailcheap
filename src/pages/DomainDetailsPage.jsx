import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useResource } from "@/hooks/use-resource";
import {
  Badge,
  Button,
  Empty,
  ErrorState,
  Heading,
  Loading,
} from "@/components/app-ui";
import { CopyValue, ExternalLink } from "@/components/domain-ui";

export default function DomainDetailsPage() {
  const { name } = useParams();
  const path = `admin/domains/${encodeURIComponent(name)}`;
  const resource = useResource(path, { freshOnMount: true });
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const domain = resource.data;
  const published =
    domain?.records?.filter((record) => record.status === "published").length ||
    0;
  return (
    <>
      <Link className="back-link" to="/domains">
        <ArrowLeft size={15} />
        All domains
      </Link>
      <Heading title={name} description="Email authentication and DNS records.">
        {domain && (
          <Badge status={domain.enabled ? "active" : "paused"}>
            {domain.enabled ? "Sending enabled" : "Sending disabled"}
          </Badge>
        )}
        <Button
          disabled={busy || resource.loading || !domain}
          onClick={async () => {
            setBusy(true);
            setActionError("");
            try {
              client.setQueryData(
                ["api", path],
                await api(`${path}?verify=true`),
              );
            } catch (e) {
              setActionError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <RefreshCw size={16} className={busy ? "spin" : ""} />
          {busy ? "Checking DNS…" : "Check DNS"}
        </Button>
      </Heading>
      {actionError && <ErrorState error={actionError} />}
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorState error={resource.error} retry={resource.refresh} />
      ) : (
        domain && (
          <>
            <div className="domain-layout">
              <section className="panel">
                <h2>
                  {domain.checked_at
                    ? `${published} of ${domain.records.length} records published`
                    : "Check your DNS records"}
                </h2>
                <p>
                  {domain.checked_at
                    ? "This checks public DNS against the records supplied by Cloudflare. Publication is separate from Cloudflare’s sending status."
                    : "Cloudflare manages the sending records below. Check DNS to see which records are visible publicly."}
                </p>
                <div className="summary-row">
                  <span>Cloudflare zone</span>
                  <strong>{domain.zone}</strong>
                </div>
                <div className="summary-row">
                  <span>Last checked</span>
                  <strong>
                    {domain.checked_at
                      ? new Date(domain.checked_at).toLocaleString()
                      : "Not checked yet"}
                  </strong>
                </div>
                <p className="domain-note">
                  DNS changes usually appear in 5–15 minutes, but can take up to
                  24 hours. If a record is still missing, review it in
                  Cloudflare. Keep existing DMARC policies unless you intend to
                  change them.
                </p>
                <ExternalLink href="https://dash.cloudflare.com/?to=/:account/email/sending">
                  Open Email Sending
                </ExternalLink>
              </section>
              <aside className="panel domain-guide">
                <h2>Use this domain</h2>
                <p>
                  Set a newsletter’s sender address to an address ending in{" "}
                  <strong>@{name}</strong>.
                </p>
                <p>
                  Each sending subdomain is configured separately. Replies go to
                  your newsletter’s reply-to address, or to the sender address
                  if left empty.
                </p>
                <Button asChild variant="secondary">
                  <Link to="/newsletters">
                    Open newsletters
                    <ArrowRight size={16} />
                  </Link>
                </Button>
              </aside>
            </div>
            <section className="panel">
              <div className="section-heading">
                <h2>DNS records</h2>
                <span className="domain-count">Provided by Cloudflare</span>
              </div>
              {domain.records.length ? (
                <div className="dns-records">
                  {domain.records.map((record, index) => (
                    <article
                      className="dns-record"
                      key={`${record.type}-${record.name}-${index}`}
                    >
                      <div className="section-heading">
                        <strong>{record.type}</strong>
                        <Badge
                          status={
                            record.status === "published" ? "active" : "paused"
                          }
                        >
                          {
                            {
                              published: "Published",
                              pending: "Not found",
                              unknown: "Check unavailable",
                              unchecked: "Not checked",
                            }[record.status]
                          }
                        </Badge>
                      </div>
                      <div className="dns-label">Name</div>
                      <CopyValue
                        value={record.name}
                        label={`${record.type} record name`}
                      />
                      <div className="dns-label">Value</div>
                      <CopyValue
                        value={record.content}
                        label={`${record.type} record value`}
                      />
                      <div className="dns-meta">
                        {record.priority !== undefined && (
                          <span>Priority: {record.priority}</span>
                        )}
                        <span>
                          TTL:{" "}
                          {!record.ttl || record.ttl === 1
                            ? "Auto"
                            : `${record.ttl} seconds`}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title="No records returned yet"
                  description="Cloudflare has not returned DNS records for this domain. Check DNS again or open Email Sending to review setup."
                />
              )}
            </section>
          </>
        )
      )}
    </>
  );
}
