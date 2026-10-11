import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowUpRight, Copy } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useResource } from "@/hooks/use-resource";
import {
  Button,
  Input,
  Textarea,
  Field,
  Heading,
  Loading,
  ErrorState,
  AsyncButton,
  number,
} from "@/components/app-ui";

import NewsletterFields from "@/components/NewsletterFields";

export default function NewsletterSettings() {
  const { id } = useParams();
  const resource = useResource("admin/newsletters", { freshOnMount: true });
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
