import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.114.0";
import webpush from "npm:web-push@3.6.7";

const allowedOrigins = new Set([
  "https://str-ig.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://str-ig.github.io",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

function cleanEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function validNews(body: Record<string, unknown>) {
  return typeof body.id === "string" && /^[a-z0-9_-]{1,120}$/.test(body.id) &&
    typeof body.category === "string" && /^[a-z0-9_-]{1,50}$/.test(body.category) &&
    typeof body.url === "string" && body.url.length >= 1 && body.url.length <= 500 &&
    typeof body.published_at === "string" && Number.isFinite(Date.parse(body.published_at));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json(req, { error: "UNAUTHORIZED" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json(req, { error: "SERVER_CONFIGURATION" }, 500);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user?.email) return json(req, { error: "UNAUTHORIZED" }, 401);

    const { data: adminRow, error: adminError } = await admin.from("committee_admins")
      .select("email")
      .eq("email", cleanEmail(userData.user.email))
      .eq("active", true)
      .maybeSingle();
    if (adminError) return json(req, { error: "AUTHORIZATION_CHECK_FAILED" }, 500);
    if (!adminRow) return json(req, { error: "FORBIDDEN" }, 403);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (!validNews(body)) return json(req, { error: "INVALID_NEWS" }, 400);

    const news = {
      id: body.id as string,
      category: body.category as string,
      published_at: new Date(body.published_at as string).toISOString(),
      url: body.url as string,
      active: body.active !== false,
    };
    const { error: newsError } = await admin.from("app_news").upsert(news, { onConflict: "id" });
    if (newsError) return json(req, { error: "NEWS_SAVE_FAILED" }, 500);

    const { data: vapidRows, error: vapidError } = await admin.rpc("get_push_vapid_config");
    const vapid = vapidRows?.[0];
    if (vapidError || !vapid?.public_key || !vapid?.private_key || !vapid?.subject) {
      return json(req, { error: "VAPID_CONFIGURATION_MISSING" }, 500);
    }
    webpush.setVapidDetails(vapid.subject, vapid.public_key, vapid.private_key);

    const { data: subscriptions, error: subscriptionError } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, failure_count")
      .eq("active", true);
    if (subscriptionError) return json(req, { error: "SUBSCRIPTIONS_LOAD_FAILED" }, 500);

    let sent = 0;
    let disabled = 0;
    let failed = 0;
    for (const subscription of subscriptions ?? []) {
      const [{ data: activeNews }, { data: reads }] = await Promise.all([
        admin.from("app_news").select("id").eq("active", true),
        admin.from("push_news_reads").select("news_id").eq("subscription_id", subscription.id),
      ]);
      const readIds = new Set((reads ?? []).map((row) => row.news_id));
      const badge = (activeNews ?? []).filter((item) => !readIds.has(item.id)).length;
      if (badge < 1) continue;

      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, JSON.stringify({ badge, url: "index.html" }), { TTL: 86400, urgency: "normal" });
        sent += 1;
        await admin.from("push_subscriptions").update({
          failure_count: 0,
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq("id", subscription.id);
      } catch (error) {
        const statusCode = Number((error as { statusCode?: number }).statusCode ?? 0);
        if (statusCode === 404 || statusCode === 410) {
          disabled += 1;
          await admin.from("push_subscriptions").update({
            active: false,
            last_error: `push_${statusCode}`,
            updated_at: new Date().toISOString(),
          }).eq("id", subscription.id);
        } else {
          failed += 1;
          await admin.from("push_subscriptions").update({
            failure_count: subscription.failure_count + 1,
            last_error: `push_${statusCode || "unknown"}`,
            updated_at: new Date().toISOString(),
          }).eq("id", subscription.id);
        }
      }
    }

    return json(req, { published: true, newsId: news.id, sent, disabled, failed });
  } catch (error) {
    console.error("Unexpected send-news-push error", error);
    return json(req, { error: "UNEXPECTED_ERROR" }, 500);
  }
});
