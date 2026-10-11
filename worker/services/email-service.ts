import {
  renderEmail,
  escapeHtml,
  hasContent,
} from "../../shared/render-email.js";
import { type Bindings, type Row } from "../types";
import { appUrl } from "../lib/config";
import { fail } from "../lib/http";
import { signLink } from "../auth";

export function renderDraft(draft: Row, list: Row) {
  return renderEmail({
    format: draft.format,
    html: draft.body,
    markdown: draft.body,
    subject: draft.subject,
    previewText: draft.preview_text,
    newsletter: { name: list.name, postalAddress: list.postal_address },
  });
}
export function validateContent(draft: Row, list: Row) {
  if (!draft.subject?.trim()) fail("Add a subject before sending");
  if (!hasContent(draft.body)) fail("Add email content before sending");
  if (!list.postal_address?.trim())
    fail("Add your postal address in newsletter settings");
  const rendered = renderDraft(draft, list);
  if (rendered.bytes > 98000)
    fail(
      "Email is too large. Keep it below 98 KB to leave room for tracking links.",
    );
  return rendered;
}
export async function prepareEmail(
  env: Bindings,
  delivery: Row,
  draft: Row,
  list: Row,
) {
  const base = appUrl(env);
  const token = await signLink(env, "unsubscribe", {
    contact: delivery.contact_id || "test",
  });
  const unsubscribeUrl = `${base}/public/unsubscribe?token=${token}`;
  const rendered = renderDraft(draft, list);
  let html = rendered.html;
  if (delivery.kind === "campaign") {
    const pattern = /(<a\b[^>]*?\shref\s*=\s*)(["'])(https?:\/\/[^"'\s]+)\2/gi;
    const matches = [...html.matchAll(pattern)];
    for (const match of matches.reverse()) {
      const url = match[3].replaceAll("&amp;", "&");
      if (url.length > 1800) continue;
      const click = await signLink(env, "click", {
        delivery: delivery.id,
        url,
      });
      html =
        html.slice(0, match.index) +
        `${match[1]}${match[2]}${base}/public/click?token=${click}${match[2]}` +
        html.slice(match.index! + match[0].length);
    }
    const open = await signLink(env, "open", { delivery: delivery.id });
    const pixel = `<img alt="" width="1" height="1" src="${base}/public/open?token=${open}" />`;
    html = html.includes("</body>")
      ? html.replace("</body>", `${pixel}</body>`)
      : html + pixel;
  }
  html = html.replaceAll("{{unsubscribe_url}}", escapeHtml(unsubscribeUrl));
  const text = rendered.text.replaceAll("{{unsubscribe_url}}", unsubscribeUrl);
  if (new TextEncoder().encode(html).byteLength > 100000)
    fail("Rendered email with tracking exceeds 100 KB");
  return {
    from: { email: list.from_email, name: list.from_name || list.name },
    to: delivery.email,
    replyTo: list.reply_to || undefined,
    subject: draft.subject,
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "X-Mailcheap-Delivery": delivery.id,
    },
  };
}
