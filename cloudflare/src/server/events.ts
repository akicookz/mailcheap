import { type Bindings, type Row, one, run, now } from "./core";
import { suppress } from "./contacts";
import { settle } from "./sending";

export async function consumeEvents(batch: MessageBatch<Row>, env: Bindings) {
  for (const event of batch.messages) {
    const data = event.body;
    const payload = data?.payload;
    if (
      data?.source?.type !== "email.sending" ||
      !payload?.eventId ||
      !payload?.messageId ||
      typeof data.type !== "string"
    ) {
      event.ack();
      continue;
    }
    if (
      await one(env, "SELECT id FROM email_events WHERE id=?", payload.eventId)
    ) {
      event.ack();
      continue;
    }
    const delivery = await one(
      env,
      "SELECT * FROM deliveries WHERE provider_id=?",
      payload.messageId,
    );
    if (!delivery) {
      event.retry({ delaySeconds: 30 });
      continue;
    }
    const type = String(data.type).split(".").at(-1) || "";
    const states: Record<string, { status: string; before: string[] }> = {
      delivered: {
        status: "delivered",
        before: ["sending", "accepted", "uncertain", "failed"],
      },
      bounced: {
        status: "bounced",
        before: ["sending", "accepted", "delivered", "uncertain", "failed"],
      },
      complained: {
        status: "complained",
        before: [
          "sending",
          "accepted",
          "delivered",
          "bounced",
          "failed",
          "uncertain",
        ],
      },
      failed: {
        status: "failed",
        before: ["sending", "accepted", "uncertain"],
      },
      rejected: {
        status:
          payload.rejection?.reason === "suppressed" ? "suppressed" : "failed",
        before: ["sending", "accepted", "uncertain"],
      },
    };
    const state = states[type];
    if (state)
      await run(
        env,
        `UPDATE deliveries SET status=?,error=? WHERE id=? AND status IN (${state.before.map(() => "?").join(",")})`,
        state.status,
        String(
          payload.bounce?.reason ||
            payload.failure?.reason ||
            payload.rejection?.detail ||
            "",
        ).slice(0, 500) || null,
        delivery.id,
        ...state.before,
      );
    // Temporary bounces exhausted by the provider are failures, but do not permanently suppress the address.
    if (type === "complained") await suppress(env, delivery.email, "complaint");
    if (type === "bounced" && payload.bounce?.type === "hard")
      await suppress(env, delivery.email, "bounce");
    if (delivery.campaign_id && delivery.kind === "campaign")
      await settle(env, delivery.campaign_id);
    await run(
      env,
      "INSERT OR IGNORE INTO email_events(id,provider_id,type,received_at,payload) VALUES (?,?,?,?,?)",
      payload.eventId,
      payload.messageId,
      data.type,
      now(),
      JSON.stringify({
        type,
        delivery: payload.delivery,
        bounce: payload.bounce,
        complaint: payload.complaint,
        rejection: payload.rejection,
      }),
    );
    event.ack();
  }
}
