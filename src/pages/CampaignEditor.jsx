import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router-dom";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import {
  ArrowLeft,
  Send,
  FlaskConical,
  Calendar,
  Monitor,
  Smartphone,
  Check,
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  Link2,
  ImagePlus,
  Undo,
  Redo,
  Copy,
  Pause,
  Play,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { useResource } from "@/hooks/use-resource";
import {
  Button,
  Input,
  Textarea,
  Field,
  Select,
  Loading,
  ErrorState,
  Modal,
  Badge,
  Stats,
  AsyncButton,
  number,
  date,
} from "@/components/app-ui";
import { renderEmail, hasContent } from "../../shared/render-email";
import { useAutosave } from "@/hooks/use-autosave";

function RichEditor({ content, onChange }) {
  const imageInput = useRef();
  const [linkOpen, setLinkOpen] = useState(false),
    [url, setUrl] = useState("");
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, defaultProtocol: "https" },
      }),
      Image,
      Placeholder.configure({ placeholder: "Write something worth opening…" }),
    ],
    content,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose-editor",
        "aria-label": "Email content",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });
  if (!editor) return <Loading />;
  const tools = [
    ["Bold", Bold, () => editor.chain().focus().toggleBold().run()],
    ["Italic", Italic, () => editor.chain().focus().toggleItalic().run()],
    [
      "Heading",
      Heading2,
      () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    ],
    [
      "Bullet list",
      List,
      () => editor.chain().focus().toggleBulletList().run(),
    ],
    [
      "Numbered list",
      ListOrdered,
      () => editor.chain().focus().toggleOrderedList().run(),
    ],
    [
      "Add link",
      Link2,
      () => {
        setUrl(editor.getAttributes("link").href || "");
        setLinkOpen(true);
      },
    ],
    ["Upload image", ImagePlus, () => imageInput.current.click()],
    ["Undo", Undo, () => editor.chain().focus().undo().run()],
    ["Redo", Redo, () => editor.chain().focus().redo().run()],
  ];
  return (
    <>
      <div className="editor-toolbar">
        {tools.map(([label, Icon, action]) => (
          <Button
            key={label}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={label}
            title={label}
            onClick={action}
          >
            <Icon size={17} />
          </Button>
        ))}
        <input
          ref={imageInput}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
              toast.error("Images must be smaller than 5 MB");
              return;
            }
            const uploading = toast.loading("Uploading image…");
            try {
              const response = await fetch("/api/admin/uploads", {
                method: "POST",
                headers: { "Content-Type": file.type },
                body: file,
              });
              const result = await response.json();
              if (!response.ok) throw new Error(result.error);
              editor
                .chain()
                .focus()
                .setImage({
                  src: result.url,
                  alt: file.name.replace(/\.[^.]+$/, ""),
                })
                .run();
              toast.success("Image uploaded", { id: uploading });
            } catch (e) {
              toast.error(e.message, { id: uploading });
            }
            e.target.value = "";
          }}
        />
      </div>
      <EditorContent editor={editor} />
      <Modal
        open={linkOpen}
        onOpenChange={setLinkOpen}
        title="Add a link"
        description="Link the selected text to a page."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const parsed = new URL(url);
              if (!["http:", "https:", "mailto:"].includes(parsed.protocol))
                throw new Error("Use an http, https, or mailto link");
              editor
                .chain()
                .focus()
                .extendMarkRange("link")
                .setLink({ href: url })
                .run();
              setLinkOpen(false);
            } catch (e) {
              toast.error("Enter a valid URL");
            }
          }}
        >
          <Field label="URL">
            <Input
              type="url"
              autoFocus
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
            />
          </Field>
          <Button type="submit">Save link</Button>
        </form>
      </Modal>
    </>
  );
}
export default function CampaignEditor() {
  const { id } = useParams();
  const resource = useResource(`admin/campaigns/${id}`, { freshOnMount: true });
  if (resource.loading) return <Loading />;
  if (resource.error)
    return <ErrorState error={resource.error} retry={resource.refresh} />;
  return (
    <DraftEditor
      key={`${id}-${resource.data.campaign.status}`}
      initial={resource.data}
      refresh={resource.refresh}
    />
  );
}
function DraftEditor({ initial, refresh }) {
  const { campaign, newsletter, stats, deliveries, audience } = initial;
  const { status } = useOutletContext();
  const navigate = useNavigate();
  const [values, setValues] = useState({
    subject: campaign.subject,
    preview_text: campaign.preview_text,
    format: campaign.format,
    body: campaign.body,
    archive_enabled: !!campaign.archive_enabled,
  });
  const [view, setView] = useState("write");
  const [device, setDevice] = useState("desktop"),
    [dialog, setDialog] = useState(null),
    [schedule, setSchedule] = useState(""),
    [limit, setLimit] = useState(""),
    [formatPrompt, setFormatPrompt] = useState(null);
  const editable = campaign.status === "draft";
  const save = useCallback(
    async (data) => {
      if (!editable) return;
      await api(`admin/campaigns/${campaign.id}`, {
        method: "PUT",
        body: data,
      });
      const queryKey = ["api", `admin/campaigns/${campaign.id}`];
      await queryClient.cancelQueries({ queryKey, exact: true });
      queryClient.setQueryData(queryKey, (cached) =>
        cached
          ? {
              ...cached,
              campaign: {
                ...cached.campaign,
                ...data,
                archive_enabled: Number(data.archive_enabled),
              },
            }
          : cached,
      );
    },
    [campaign.id, editable],
  );
  const autosave = useAutosave(values, save);
  useEffect(() => {
    const warn = (e) => {
      if (autosave.isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [autosave.isDirty]);
  useEffect(() => {
    if (
      !["sending", "paused"].includes(campaign.status) &&
      !deliveries.some((d) => ["queued", "sending"].includes(d.status))
    )
      return;
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [campaign.status, refresh, deliveries]);
  const rendered = useMemo(
    () =>
      renderEmail({
        format: values.format,
        html: values.body,
        markdown: values.body,
        subject: values.subject,
        previewText: values.preview_text,
        newsletter: {
          name: newsletter.name,
          postalAddress: newsletter.postal_address,
        },
      }),
    [values, newsletter],
  );
  async function action(name, body = {}) {
    try {
      if (editable && !(await autosave.flush()))
        throw new Error("Save your changes before continuing");
      const result = await api(`admin/campaigns/${campaign.id}/${name}`, {
        method: "POST",
        body,
      });
      if (name === "test") toast.success(`Test queued for ${result.recipient}`);
      else if (name === "duplicate") {
        navigate(`/campaigns/${result.id}`);
        return;
      } else toast.success("Campaign updated");
      setDialog(null);
      await refresh();
    } catch (e) {
      toast.error(e.message);
    }
  }
  const update = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  const checks = [
    ["Subject", !!values.subject.trim()],
    ["Content", hasContent(values.body)],
    ["Postal address", !!newsletter.postal_address],
    ["Email under 98 KB", rendered.bytes <= 98000],
    ["Sending enabled", !!status?.sending_enabled],
  ];
  return (
    <div className="campaign-editor">
      <header className="editor-header">
        <div className="editor-heading">
          <Link
            className="editor-back"
            aria-label="All campaigns"
            title="All campaigns"
            to="/campaigns"
            onClick={async (e) => {
              if (autosave.isDirty) {
                e.preventDefault();
                if (await autosave.flush()) navigate("/campaigns");
              }
            }}
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="editor-title">
            <h1>{values.subject || "Untitled issue"}</h1>
            <span>{newsletter.name}</span>
          </div>
          <Badge status={campaign.status} />
        </div>
        <div className="editor-actions">
          <AsyncButton variant="secondary" onClick={() => action("duplicate")}>
            <Copy size={15} /> Duplicate
          </AsyncButton>
          {editable ? (
            <>
              <AsyncButton
                variant="secondary"
                onClick={async () => {
                  if (await autosave.flush()) toast.success("Draft saved");
                }}
              >
                <Save size={15} /> Save
              </AsyncButton>
              <Button onClick={() => setDialog("send")}>
                <Send size={15} /> Review & send
              </Button>
            </>
          ) : campaign.status === "sending" ? (
            <AsyncButton onClick={() => action("pause")}>
              <Pause size={15} /> Pause
            </AsyncButton>
          ) : campaign.status === "paused" ? (
            <AsyncButton onClick={() => action("resume")}>
              <Play size={15} /> Resume
            </AsyncButton>
          ) : campaign.status === "scheduled" ? (
            <AsyncButton onClick={() => action("unschedule")}>
              Move to draft
            </AsyncButton>
          ) : null}
        </div>
      </header>
      <nav className="editor-view-switch" aria-label="Editor view">
        <Button
          variant="ghost"
          aria-pressed={view === "write"}
          onClick={() => setView("write")}
        >
          Write
        </Button>
        <Button
          variant="ghost"
          aria-pressed={view === "preview"}
          onClick={() => setView("preview")}
        >
          Preview
        </Button>
      </nav>
      <div className="editor-content">
        {campaign.pause_reason && (
          <div className="notice">{campaign.pause_reason}</div>
        )}
        {campaign.scheduled_at && campaign.status === "scheduled" && (
          <div className="notice">
            Scheduled for {new Date(campaign.scheduled_at).toLocaleString()}
          </div>
        )}
        {!editable && (
          <Stats
            items={[
              ["Recipients", stats.recipients],
              ["Sent", stats.sent],
              ["Delivered", stats.delivered],
              ["Clicked", stats.clicked],
            ]}
          />
        )}
        <section
          className="writing-panel editor-document"
          aria-label="Write email"
          hidden={view !== "write"}
        >
          <div className="writing-meta">
            <div className="editor-address-row">
              <span>From</span>
              <div>
                {newsletter.from_name || newsletter.name}{" "}
                <span>{newsletter.from_email}</span>
              </div>
            </div>
            <div className="editor-address-row">
              <span>To</span>
              <div>
                {newsletter.name}{" "}
                <span>{number(audience)} active subscribers</span>
              </div>
            </div>
            <Field label="Subject">
              <Input
                disabled={!editable}
                value={values.subject}
                onChange={(e) => update("subject", e.target.value)}
                placeholder="A subject worth opening"
                maxLength={200}
              />
            </Field>
            <Field label="Preview text">
              <Input
                disabled={!editable}
                value={values.preview_text}
                onChange={(e) => update("preview_text", e.target.value)}
                placeholder="A little more reason to read"
                maxLength={300}
              />
            </Field>
            <div className="format-row">
              <Select
                aria-label="Email format"
                disabled={!editable}
                value={values.format}
                onChange={(e) => {
                  if (values.body.trim()) setFormatPrompt(e.target.value);
                  else update("format", e.target.value);
                }}
              >
                <option value="rich">Rich text</option>
                <option value="markdown">Markdown</option>
                <option value="html">HTML</option>
              </Select>
              <span role="status">
                {autosave.error ? (
                  <span className="error-text">Couldn’t save</span>
                ) : autosave.isSaving ? (
                  "Saving…"
                ) : autosave.isDirty ? (
                  "Unsaved changes"
                ) : (
                  <>
                    <Check size={13} /> Saved
                  </>
                )}
              </span>
            </div>
          </div>
          {editable && values.format === "rich" ? (
            <RichEditor
              key={values.format}
              content={values.body}
              onChange={(body) => update("body", body)}
            />
          ) : (
            <Textarea
              aria-label="Email content source"
              className="source-editor"
              disabled={!editable}
              value={values.body}
              onChange={(e) => update("body", e.target.value)}
              placeholder={
                values.format === "markdown"
                  ? "# Your next issue"
                  : "<h1>Your next issue</h1>"
              }
            />
          )}
          <div className="editor-footer">
            <label className="check">
              <input
                type="checkbox"
                checked={values.archive_enabled}
                disabled={!editable}
                onChange={(e) => update("archive_enabled", e.target.checked)}
              />
              <span>Publish to the archive after sending</span>
            </label>
            <small>{Math.ceil(rendered.bytes / 1000)} KB</small>
          </div>
        </section>
        <section
          className="preview-panel editor-document"
          aria-label="Preview email"
          hidden={view !== "preview"}
        >
          <div className="preview-toolbar">
            <span>Email preview</span>
            <div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Desktop preview"
                aria-pressed={device === "desktop"}
                onClick={() => setDevice("desktop")}
              >
                <Monitor size={17} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Mobile preview"
                aria-pressed={device === "mobile"}
                onClick={() => setDevice("mobile")}
              >
                <Smartphone size={17} />
              </Button>
            </div>
          </div>
          <div
            className="preview-message"
            style={{ width: device === "mobile" ? 375 : "100%" }}
          >
            <div className="preview-envelope">
              <strong>{newsletter.from_name || newsletter.name}</strong>
              <small>{newsletter.from_email}</small>
              <p>{values.subject || "No subject"}</p>
              <small>{values.preview_text}</small>
            </div>
            <div className="preview-canvas">
              <iframe title="Email preview" sandbox="" srcDoc={rendered.html} />
            </div>
          </div>
        </section>
        {(!editable || deliveries.length > 0) && (
          <section className="delivery-section">
            <div className="section-heading">
              <h2>Delivery activity</h2>
              <Button variant="secondary" onClick={refresh}>
                Refresh
              </Button>
            </div>
            <p>
              “Accepted” means Cloudflare accepted the message. Delivery is
              confirmed by a provider event.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Status</th>
                    <th>Sent</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d) => (
                    <tr key={d.id}>
                      <td>
                        {d.email}
                        <small>{d.kind}</small>
                      </td>
                      <td>
                        <Badge status={d.status} />
                      </td>
                      <td>{date(d.sent_at)}</td>
                      <td className="delivery-error">{d.error || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!deliveries.length && (
                <p className="subtle-empty">No deliveries yet.</p>
              )}
            </div>
          </section>
        )}
      </div>
      <Modal
        open={dialog === "send"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Ready for your readers?"
        description={`This campaign has ${number(audience)} active subscribers before optional cleanup filters.`}
      >
        <ul className="send-checks">
          {checks.map(([label, ok]) => (
            <li key={label} className={ok ? "ok" : ""}>
              <Check size={15} />
              {label}
            </li>
          ))}
        </ul>
        <Field
          label="Send to a smaller audience first"
          hint="Leave empty to send to all eligible subscribers."
        >
          <Input
            type="number"
            min="1"
            max={audience || 1}
            placeholder="All active subscribers"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </Field>
        <div className="modal-actions">
          <AsyncButton
            variant="secondary"
            disabled={!status?.sending_enabled}
            onClick={() => action("test")}
          >
            <FlaskConical size={15} /> Send test
          </AsyncButton>
          <Button variant="secondary" onClick={() => setDialog("schedule")}>
            <Calendar size={15} /> Schedule
          </Button>
          <AsyncButton
            disabled={!checks.every(([, ok]) => ok) || !audience}
            onClick={() =>
              action("send", limit ? { audience_limit: Number(limit) } : {})
            }
          >
            <Send size={15} /> Send now
          </AsyncButton>
        </div>
        <p className="helper">
          Test emails go only to {status?.email || "your admin address"}.
        </p>
      </Modal>
      <Modal
        open={dialog === "schedule"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Schedule your issue"
        description="Choose a time in your current time zone."
      >
        <Field label="Send date and time">
          <Input
            type="datetime-local"
            required
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
          />
        </Field>
        <AsyncButton
          disabled={!schedule}
          onClick={() =>
            action("schedule", {
              scheduled_at: new Date(schedule).toISOString(),
              ...(limit ? { audience_limit: Number(limit) } : {}),
            })
          }
        >
          <Calendar size={15} /> Schedule campaign
        </AsyncButton>
      </Modal>
      <Modal
        open={!!formatPrompt}
        onOpenChange={(open) => !open && setFormatPrompt(null)}
        title="Change email format?"
        description="Changing format starts with an empty message. Your subject and preview text stay."
      >
        <Button
          onClick={() => {
            setValues((v) => ({ ...v, format: formatPrompt, body: "" }));
            setFormatPrompt(null);
          }}
        >
          Change format and clear message
        </Button>
      </Modal>
    </div>
  );
}
