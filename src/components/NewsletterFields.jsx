import { Input, Textarea, Field } from "@/components/app-ui";
import { Link } from "react-router-dom";

export const blankNewsletter = {
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
export default function NewsletterFields({ values, setValues, full = false }) {
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
          hint={
            <>
              Use an enabled sending domain.{" "}
              <Link className="text-link" to="/domains">
                Manage domains
              </Link>
            </>
          }
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
