// Serves the portfolio and forwards the contact form to Slack.
// The Slack webhook is a Cloudflare secret called SLACK_WEBHOOK_URL. It is never in the repo.

// Sites allowed to post to /api/contact besides this Worker's own address.
const EXTRA_ORIGINS = ["https://harsh-w-s.github.io"];

const clean = (s, max) => String(s ?? "").trim().slice(0, max)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

async function contact(request, env) {
  const self = new URL(request.url).origin;
  const origin = request.headers.get("Origin") || self;
  const allowed = origin === self || EXTRA_ORIGINS.includes(origin);
  const headers = allowed ? corsHeaders(origin) : {};
  const reply = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply(405, { error: "Use POST" });
  if (!allowed) return reply(403, { error: "Not allowed" });
  if (!env.SLACK_WEBHOOK_URL) return reply(500, { error: "SLACK_WEBHOOK_URL secret is not set" });

  let data;
  try { data = await request.json(); } catch { return reply(400, { error: "Invalid JSON" }); }

  const name = clean(data.name, 80);
  const email = clean(data.email, 120);
  const reason = clean(data.reason, 40) || "Message";
  const message = clean(data.message, 2000);

  if (!name || message.length < 10) return reply(400, { error: "Missing name or message" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return reply(400, { error: "Invalid email" });

  const text = `*New message from your portfolio* (${reason})\n*Name:* ${name}\n*Email:* ${email}\n*Message:*\n${message}`;
  const slack = await fetch(env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return slack.ok ? reply(200, { ok: true }) : reply(502, { error: "Slack rejected the message" });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/contact") return contact(request, env);
    return env.ASSETS.fetch(request);   // everything else: the website files
  },
};
