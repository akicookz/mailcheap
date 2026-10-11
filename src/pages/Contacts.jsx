import { useState } from "react";

import { Plus, Upload, Search } from "lucide-react";
import Papa from "papaparse";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useResource } from "@/hooks/use-resource";
import {
  Button,
  Input,
  Field,
  Select,
  Heading,
  Empty,
  Loading,
  ErrorState,
  Modal,
  Badge,
  AsyncButton,
  number,
  date,
} from "@/components/app-ui";
import { mapColumns, normalizeImportRow } from "../../shared/csv-import";

export default function Contacts() {
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
