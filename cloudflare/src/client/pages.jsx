import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useOutletContext,
} from "react-router-dom";
import {
  Plus,
  ArrowUpRight,
  ArrowRight,
  Upload,
  Search,
  Copy,
  KeyRound,
  Mail,
} from "lucide-react";
import Papa from "papaparse";
import { toast } from "sonner";
import { api, useResource } from "./api";
import {
  Button,
  Input,
  Textarea,
  Field,
  Select,
  Heading,
  Empty,
  Loading,
  ErrorState,
  Modal,
  Badge,
  Stats,
  AsyncButton,
  number,
  date,
} from "./ui";
import { mapColumns, normalizeImportRow } from "../shared/csv-import";

export function Overview() {
  const { data, error, loading, refresh } = useResource("admin/overview");
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} retry={refresh} />;
  return (
    <>
      <Heading title="Overview" description="A clear view of your newsletter.">
        <Link to="/campaigns">
          <Button>
            <Plus size={16} /> Write an issue
          </Button>
        </Link>
      </Heading>
      <Stats
        items={[
          ["Active subscribers", data.contacts.active],
          ["Emails sent", data.mail.sent],
          ["Opened", data.mail.opened, "Opens are estimates"],
          ["Clicked", data.mail.clicked],
        ]}
      />
      <div className="section-heading">
        <h2>Recent campaigns</h2>
        <Link to="/campaigns">
          View all <ArrowRight size={15} />
        </Link>
      </div>
      <CampaignTable rows={data.recent} />
      <section className="split-summary">
        <div className="panel">
          <h2>Subscriber activity</h2>
          <p>New signups over the last 30 days</p>
          {data.activity.length ? (
            <div
              className="activity-chart"
              aria-label="Daily subscriber signups"
            >
              {data.activity.map((d) => (
                <div key={d.day} title={`${d.day}: ${d.count}`}>
                  <span
                    style={{
                      height: Math.max(
                        6,
                        (d.count /
                          Math.max(...data.activity.map((x) => x.count))) *
                          100,
                      ),
                    }}
                  />
                  <small>{d.day.slice(5)}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="subtle-empty">New subscribers will appear here.</p>
          )}
        </div>
        <div className="panel">
          <h2>On your desk</h2>
          <div className="summary-row">
            <span>Drafts in progress</span>
            <strong>{number(data.campaigns.drafts)}</strong>
          </div>
          <div className="summary-row">
            <span>Scheduled issues</span>
            <strong>{number(data.campaigns.scheduled)}</strong>
          </div>
          <div className="summary-row">
            <span>Awaiting confirmation</span>
            <strong>{number(data.contacts.pending)}</strong>
          </div>
        </div>
      </section>
    </>
  );
}
export function CampaignTable({ rows }) {
  if (!rows.length)
    return (
      <div className="panel">
        <Empty
          title="Your next issue starts here"
          description="Write something worth opening. Drafts and sent issues will appear here."
        >
          <Link to="/campaigns">
            <Button variant="secondary">
              Open campaigns <ArrowRight size={16} />
            </Button>
          </Link>
        </Empty>
      </div>
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Status</th>
            <th>Sent</th>
            <th>Created</th>
            <th>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <Link className="table-title" to={`/campaigns/${row.id}`}>
                  {row.subject || "Untitled issue"}
                </Link>
                <small>{row.newsletter_name}</small>
              </td>
              <td>
                <Badge status={row.status} />
              </td>
              <td>{number(row.sent)}</td>
              <td>{date(row.created_at)}</td>
              <td>
                <Link
                  aria-label={`Open ${row.subject || "Untitled issue"}`}
                  to={`/campaigns/${row.id}`}
                >
                  <ArrowUpRight size={17} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function CampaignList() {
  const resource = useResource("admin/campaigns"),
    lists = useResource("admin/newsletters");
  const [open, setOpen] = useState(false),
    [list, setList] = useState(""),
    [subject, setSubject] = useState(""),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <Heading
        title="Campaigns"
        description="From the first draft to the last inbox."
      >
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} /> New campaign
        </Button>
      </Heading>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorState error={resource.error} retry={resource.refresh} />
      ) : (
        <CampaignTable
          rows={resource.data.filter((x) => x.status !== "canceled")}
        />
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Start a new issue"
        description="Choose a newsletter and give your draft a subject."
      >
        {lists.data?.length ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const draft = await api("admin/campaigns", {
                  method: "POST",
                  body: { newsletter_id: list || lists.data[0].id, subject },
                });
                navigate(`/campaigns/${draft.id}`);
              } catch (e) {
                toast.error(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Newsletter">
              <Select
                value={list || lists.data[0].id}
                onChange={(e) => setList(e.target.value)}
              >
                {lists.data.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subject">
              <Input
                autoFocus
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What’s on your mind?"
              />
            </Field>
            <Button type="submit" disabled={busy}>
              Create draft <ArrowRight size={16} />
            </Button>
          </form>
        ) : (
          <Empty
            title="Create a newsletter first"
            description="Give your newsletter a name and a sender address."
          >
            <Link to="/newsletters">
              <Button>Create newsletter</Button>
            </Link>
          </Empty>
        )}
      </Modal>
    </>
  );
}
const blankNewsletter = {
  name: "",
  slug: "",
  from_name: "",
  from_email: "",
  reply_to: "",
  postal_address: "",
  description: "",
  require_confirmation: true,
  welcome_subject: "",
  welcome_body: "",
  cleanup_days: 0,
};
function NewsletterFields({ values, setValues, full = false }) {
  const change = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  return (
    <>
      <div className="form-grid">
        <Field label="Newsletter name">
          <Input
            required
            value={values.name}
            onChange={(e) => change("name", e.target.value)}
            placeholder="The Sunday Letter"
          />
        </Field>
        <Field
          label="Public address"
          hint="Lowercase letters, numbers, and hyphens."
        >
          <Input
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            value={values.slug}
            onChange={(e) => change("slug", e.target.value)}
            placeholder="sunday-letter"
          />
        </Field>
        <Field label="Sender name">
          <Input
            value={values.from_name}
            onChange={(e) => change("from_name", e.target.value)}
            placeholder="Your name"
          />
        </Field>
        <Field
          label="Sender email"
          hint="Use a domain enabled in Cloudflare Email Sending."
        >
          <Input
            required
            type="email"
            value={values.from_email}
            onChange={(e) => change("from_email", e.target.value)}
            placeholder="hello@yourdomain.com"
          />
        </Field>
      </div>
      {full && (
        <Field label="Reply-to email">
          <Input
            type="email"
            value={values.reply_to}
            onChange={(e) => change("reply_to", e.target.value)}
            placeholder="Optional"
          />
        </Field>
      )}
      <Field
        label="Postal address"
        hint="Included in the footer of your emails."
      >
        <Input
          required
          value={values.postal_address}
          onChange={(e) => change("postal_address", e.target.value)}
          placeholder="Your business mailing address"
        />
      </Field>
      {full && (
        <Field label="Description">
          <Textarea
            rows={3}
            value={values.description}
            onChange={(e) => change("description", e.target.value)}
            placeholder="Tell readers what to expect."
          />
        </Field>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={!!values.require_confirmation}
          onChange={(e) => change("require_confirmation", e.target.checked)}
        />
        <span>
          Ask subscribers to confirm their email
          <small>Only confirmed subscribers receive campaigns.</small>
        </span>
      </label>
    </>
  );
}
export function NewsletterList() {
  const resource = useResource("admin/newsletters");
  const [open, setOpen] = useState(false),
    [values, setValues] = useState(blankNewsletter),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <Heading title="Newsletters" description="A home for every conversation.">
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} /> New newsletter
        </Button>
      </Heading>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorState error={resource.error} retry={resource.refresh} />
      ) : resource.data.length ? (
        <div className="newsletter-list">
          {resource.data.map((n) => (
            <Link
              className="newsletter-card"
              key={n.id}
              to={`/newsletters/${n.id}`}
            >
              <div className="newsletter-icon">
                <Mail size={23} />
              </div>
              <div>
                <h2>{n.name}</h2>
                <p>{n.description || n.from_email}</p>
                <small>{number(n.active_count)} active subscribers</small>
              </div>
              <ArrowUpRight size={19} />
            </Link>
          ))}
        </div>
      ) : (
        <div className="panel">
          <Empty
            title="Make room for your readers"
            description="Create your first newsletter. Each one has its own subscribers, sender, and public archive."
          >
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} /> Create newsletter
            </Button>
          </Empty>
        </div>
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        wide
        title="Create a newsletter"
        description="The basics your readers will see."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const result = await api("admin/newsletters", {
                method: "POST",
                body: values,
              });
              navigate(`/newsletters/${result.id}`);
            } catch (e) {
              toast.error(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <NewsletterFields values={values} setValues={setValues} />
          <Button disabled={busy} type="submit">
            Create newsletter
          </Button>
        </form>
      </Modal>
    </>
  );
}
export function NewsletterSettings() {
  const { id } = useParams();
  const resource = useResource("admin/newsletters");
  const [values, setValues] = useState(null),
    [cleanup, setCleanup] = useState(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const list = resource.data?.find((n) => n.id === id);
    if (list)
      setValues({ ...list, require_confirmation: !!list.require_confirmation });
  }, [resource.data, id]);
  if (resource.loading) return <Loading />;
  if (resource.error) return <ErrorState error={resource.error} />;
  if (!values) return <ErrorState error="Newsletter not found" />;
  return (
    <>
      <Heading
        title={values.name}
        description="Sender details, subscriptions, and your public archive."
      >
        <a target="_blank" rel="noreferrer" href={`/public/${values.slug}`}>
          <Button variant="secondary">
            View archive <ArrowUpRight size={16} />
          </Button>
        </a>
      </Heading>
      <div className="settings-layout">
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api(`admin/newsletters/${id}`, {
                method: "PUT",
                body: values,
              });
              toast.success("Newsletter saved");
              await resource.refresh();
            } catch (e) {
              toast.error(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>Newsletter details</h2>
          <NewsletterFields full values={values} setValues={setValues} />
          <h2 className="form-section">Welcome email</h2>
          <p>
            Sent once after a subscriber joins or confirms. Leave the subject
            empty to turn it off.
          </p>
          <Field label="Welcome subject">
            <Input
              value={values.welcome_subject}
              onChange={(e) =>
                setValues({ ...values, welcome_subject: e.target.value })
              }
            />
          </Field>
          <Field label="Welcome message" hint="Markdown is supported.">
            <Textarea
              rows={6}
              value={values.welcome_body}
              onChange={(e) =>
                setValues({ ...values, welcome_body: e.target.value })
              }
            />
          </Field>
          <Field
            label="Exclude inactive subscribers after this many days"
            hint="0 keeps all active subscribers. Use at least 30 days to enable this filter."
          >
            <Input
              type="number"
              min="0"
              max="3650"
              value={values.cleanup_days}
              onChange={(e) =>
                setValues({ ...values, cleanup_days: Number(e.target.value) })
              }
            />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save newsletter"}
          </Button>
        </form>
        <aside>
          <div className="panel">
            <h2>Subscription link</h2>
            <p>Share this page to grow your list.</p>
            <code className="wrap-code">
              {location.origin}/public/{values.slug}
            </code>
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(
                  `${location.origin}/public/${values.slug}`,
                );
                toast.success("Link copied");
              }}
            >
              <Copy size={15} /> Copy link
            </Button>
          </div>
          <div className="panel">
            <h2>List cleanup</h2>
            <p>
              Move inactive readers to dormant. They stay in your list but stop
              receiving campaigns.
            </p>
            <AsyncButton
              variant="secondary"
              onClick={async () => {
                try {
                  setCleanup(
                    await api(`admin/newsletters/${id}/cleanup`, {
                      method: "POST",
                      body: {
                        days:
                          values.cleanup_days >= 30 ? values.cleanup_days : 180,
                        apply: false,
                      },
                    }),
                  );
                } catch (e) {
                  toast.error(e.message);
                }
              }}
            >
              Preview cleanup
            </AsyncButton>
            {cleanup && (
              <div className="notice">
                <p>
                  {number(cleanup.count)} subscribers inactive for{" "}
                  {values.cleanup_days >= 30 ? values.cleanup_days : 180} days.
                </p>
                {cleanup.count > 0 && !cleanup.applied && (
                  <AsyncButton
                    onClick={async () => {
                      try {
                        setCleanup(
                          await api(`admin/newsletters/${id}/cleanup`, {
                            method: "POST",
                            body: {
                              days:
                                values.cleanup_days >= 30
                                  ? values.cleanup_days
                                  : 180,
                              apply: true,
                            },
                          }),
                        );
                        toast.success("List cleaned up");
                      } catch (e) {
                        toast.error(e.message);
                      }
                    }}
                  >
                    Move to dormant
                  </AsyncButton>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
export function Contacts() {
  const lists = useResource("admin/newsletters");
  const [filter, setFilter] = useState(""),
    [status, setStatus] = useState(""),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0);
  const resource = useResource(
    `admin/contacts?${new URLSearchParams({ newsletter_id: filter, status, search, offset: String(offset) })}`,
  );
  const [open, setOpen] = useState(false),
    [importOpen, setImportOpen] = useState(false),
    [email, setEmail] = useState(""),
    [newsletterId, setNewsletterId] = useState(""),
    [consent, setConsent] = useState(false),
    [rows, setRows] = useState([]),
    [busy, setBusy] = useState(false),
    [importResult, setImportResult] = useState(null);
  const currentList = newsletterId || filter || lists.data?.[0]?.id || "";
  const listPicker = (
    <Field label="Newsletter">
      <Select
        required
        value={currentList}
        onChange={(e) => setNewsletterId(e.target.value)}
      >
        {lists.data?.map((n) => (
          <option key={n.id} value={n.id}>
            {n.name}
          </option>
        ))}
      </Select>
    </Field>
  );
  const consentField = (
    <label className="check">
      <input
        type="checkbox"
        checked={consent}
        onChange={(e) => setConsent(e.target.checked)}
      />
      <span>These contacts have agreed to receive this newsletter.</span>
    </label>
  );
  return (
    <>
      <Heading
        title="Contacts"
        description="People who chose to hear from you."
      >
        <Button
          variant="secondary"
          onClick={() => {
            setImportOpen(true);
            setConsent(false);
            setImportResult(null);
          }}
        >
          <Upload size={16} /> Import CSV
        </Button>
        <Button
          onClick={() => {
            setOpen(true);
            setConsent(false);
          }}
        >
          <Plus size={16} /> Add contact
        </Button>
      </Heading>
      <div className="filters">
        <label className="search">
          <Search size={17} />
          <Input
            aria-label="Search contacts"
            placeholder="Search by email"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <Select
          aria-label="Filter by newsletter"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">All newsletters</option>
          {lists.data?.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">All statuses</option>
          {[
            "active",
            "pending",
            "unsubscribed",
            "dormant",
            "bounced",
            "complained",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </div>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorState error={resource.error} retry={resource.refresh} />
      ) : resource.data.rows.length ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Newsletter</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {resource.data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="table-title">{row.email}</span>
                      <small>{row.source}</small>
                    </td>
                    <td>
                      {lists.data?.find((n) => n.id === row.newsletter_id)
                        ?.name || "—"}
                    </td>
                    <td>
                      <Badge status={row.status} />
                    </td>
                    <td>{date(row.created_at)}</td>
                    <td>
                      {["active", "pending", "dormant"].includes(
                        row.status,
                      ) && (
                        <AsyncButton
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              await api(
                                `admin/contacts/${row.id}/unsubscribe`,
                                { method: "POST" },
                              );
                              await resource.refresh();
                              toast.success("Contact unsubscribed");
                            } catch (e) {
                              toast.error(e.message);
                            }
                          }}
                        >
                          Unsubscribe
                        </AsyncButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>{number(resource.data.total)} contacts</span>
            <Button
              variant="secondary"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 100))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={offset + 100 >= resource.data.total}
              onClick={() => setOffset(offset + 100)}
            >
              Next
            </Button>
          </div>
        </>
      ) : (
        <div className="panel">
          <Empty
            title={
              search || filter || status
                ? "No matching contacts"
                : "Your readers will appear here"
            }
            description="Share your subscription page or import a list of people who already subscribed."
          />
        </div>
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Add a contact"
        description="Add an existing subscriber to your newsletter."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const result = await api("admin/contacts", {
                method: "POST",
                body: { newsletter_id: currentList, email, confirmed: consent },
              });
              if (result.suppressed)
                throw new Error(
                  "This address is suppressed and cannot be added.",
                );
              toast.success(
                result.created
                  ? "Contact added"
                  : "Contact already exists; their status was preserved",
              );
              setOpen(false);
              setEmail("");
              await resource.refresh();
            } catch (e) {
              toast.error(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {listPicker}
          <Field label="Email">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {consentField}
          <Button type="submit" disabled={!consent || busy || !currentList}>
            Add contact
          </Button>
        </form>
      </Modal>
      <Modal
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import subscribers"
        description="Upload a CSV with an email column. Existing opt-outs are preserved."
      >
        {listPicker}
        <Field label="CSV file">
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files[0];
              if (!file) return;
              if (file.size > 10 * 1024 * 1024) {
                toast.error("Choose a CSV smaller than 10 MB");
                return;
              }
              Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (result) => {
                  const columns = mapColumns(result.meta.fields || []);
                  if (!columns.email) {
                    toast.error("No email column found");
                    return;
                  }
                  setRows(
                    result.data
                      .map((row) => normalizeImportRow(row, columns))
                      .filter(Boolean),
                  );
                  setImportResult(null);
                },
                error: (e) => toast.error(e.message),
              });
            }}
          />
        </Field>
        {rows.length > 0 && (
          <p>{number(rows.length)} valid rows ready to import.</p>
        )}
        {consentField}
        <Button
          disabled={!consent || !rows.length || busy || !currentList}
          onClick={async () => {
            setBusy(true);
            let created = 0,
              skipped = 0;
            try {
              for (let i = 0; i < rows.length; i += 100) {
                const result = await api("admin/contacts/import", {
                  method: "POST",
                  body: {
                    newsletter_id: currentList,
                    confirmed: true,
                    rows: rows.slice(i, i + 100),
                  },
                });
                created += result.created;
                skipped += result.skipped;
              }
              setImportResult({ created, skipped });
              setRows([]);
              await resource.refresh();
              toast.success("Import complete");
            } catch (e) {
              toast.error(
                `Import stopped: ${e.message}. Completed rows remain saved.`,
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Importing…" : "Import contacts"}
        </Button>
        {importResult && (
          <div className="notice" role="status">
            {importResult.created} added. {importResult.skipped} existing or
            skipped.
          </div>
        )}
      </Modal>
    </>
  );
}
export function SettingsPage() {
  const { status } = useOutletContext();
  const keys = useResource("admin/keys");
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [token, setToken] = useState("");
  return (
    <>
      <Heading
        title="Settings"
        description="Your sending connection and integrations."
      />
      <div className="settings-layout">
        <div>
          <section className="panel">
            <div className="section-heading">
              <h2>Email sending</h2>
              <Badge status={status?.sending_enabled ? "active" : "paused"} />
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
                Sending is off. Enable a sender domain in Cloudflare Email
                Sending, configure delivery events, then enable sending for this
                app.
              </div>
            )}
            {status?.uncertain > 0 && (
              <div className="notice error">
                {status.uncertain} delivery outcomes need review. Check the
                campaign report and Cloudflare email logs before taking further
                action.
              </div>
            )}
            <a
              className="text-link"
              href="https://dash.cloudflare.com/?to=/:account/email/sending"
              target="_blank"
              rel="noreferrer"
            >
              Open Cloudflare <ArrowUpRight size={16} />
            </a>
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
            {keys.error ? (
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
            <Button type="submit">Create key</Button>
          </form>
        )}
      </Modal>
    </>
  );
}
