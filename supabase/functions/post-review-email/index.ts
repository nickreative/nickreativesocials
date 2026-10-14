const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
const NOTIFY_TO_EMAIL = Deno.env.get("NOTIFY_TO_EMAIL");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL");

Deno.serve(async (req) => {
  try {
    // Only allow requests carrying our private webhook secret
    const incomingSecret = req.headers.get("x-webhook-secret");

    if (!WEBHOOK_SECRET || incomingSecret !== WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    const post = payload.record;
    const oldPost = payload.old_record;

    // Only care about actual post updates
    if (payload.type !== "UPDATE" || !post) {
      return Response.json({ ok: true, skipped: true });
    }

    const newStatus = post.review_status;
    const oldStatus = oldPost?.review_status;

    // Don't send another email if something unrelated on the row changed
    if (!newStatus || (newStatus === oldStatus && post.review_feedback === oldPost?.review_feedback && post.reviewed_at === oldPost?.reviewed_at)) {
      return Response.json({ ok: true, skipped: true });
    }

    if (!["approved", "changes_requested"].includes(newStatus)) {
      return Response.json({ ok: true, skipped: true });
    }

    const client = post.client || "Client";
    const slot = post.slot ?? "Unknown";
    const platform = post.platform || "";
    const feedback = post.review_feedback || "";
    const caption = post.caption || "";

    const subject =
      newStatus === "approved"
        ? `${client} — Slot ${slot} approved`
        : `${client} — changes requested for Slot ${slot}`;

    const statusText =
      newStatus === "approved"
        ? "APPROVED"
        : "CHANGES REQUESTED";

    const captionPreview =
      caption.length > 250
        ? caption.slice(0, 250) + "…"
        : caption;

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;max-width:600px">
        <h2>${escapeHtml(statusText)}</h2>

        <p>
          <strong>Client:</strong> ${escapeHtml(String(client))}<br>
          <strong>Slot:</strong> ${escapeHtml(String(slot))}<br>
          <strong>Platform:</strong> ${escapeHtml(String(platform))}
        </p>

        ${
          newStatus === "changes_requested"
            ? `<p><strong>Requested changes:</strong><br>${escapeHtml(feedback).replace(/\n/g, "<br>")}</p>`
            : ""
        }

        ${
          captionPreview
            ? `<p><strong>Post:</strong><br>${escapeHtml(captionPreview).replace(/\n/g, "<br>")}</p>`
            : ""
        }
      </div>
    `;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [NOTIFY_TO_EMAIL],
        subject: subject,
        html: html,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Resend error:", result);
      return Response.json(result, { status: 500 });
    }

    return Response.json({
      ok: true,
      email: result,
    });

  } catch (error) {
    console.error(error);

    return Response.json(
      { error: String(error) },
      { status: 500 }
    );
  }
});

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}