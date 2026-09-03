import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.114.0";

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

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isValidDeviceId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 32 && value.length <= 200;
}

function isValidSubscription(value: unknown): value is {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
} {
  if (!value || typeof value !== "object") return false;
  const subscription = value as Record<string, unknown>;
  const keys = subscription.keys as Record<string, unknown> | undefined;
  try {
    const endpoint = new URL(String(subscription.endpoint ?? ""));
    return endpoint.protocol === "https:" &&
      endpoint.href.length <= 2048 &&
      typeof keys?.p256dh === "string" && keys.p256dh.length >= 20 && keys.p256dh.length <= 500 &&
      typeof keys?.auth === "string" && keys.auth.length >= 10 && keys.auth.length <= 500;
  } catch (_error) {
    return false;
  }
}

async function unreadCount(admin: ReturnType<typeof createClient>, subscriptionId: string) {
  const [{ data: news, error: newsError }, { data: reads, error: readsError }] = await Promise.all([
    admin.from("app_news").select("id").eq("active", true),
    admin.from("push_news_reads").select("news_id").eq("subscription_id", subscriptionId),
  ]);
  if (newsError || readsError) throw newsError ?? readsError;
  const readIds = new Set((reads ?? []).map((row) => row.news_id));
  return (news ?? []).filter((item) => !readIds.has(item.id)).length;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "METHOD_NOT_ALLOWED" }, 405);

  const origin = req.headers.get("Origin") ?? "";
  if (origin && !allowedOrigins.has(origin)) return json(req, { error: "ORIGIN_NOT_ALLOWED" }, 403);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json(req, { error: "SERVER_CONFIGURATION" }, 500);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    const deviceId = body?.deviceId;
    if (!isValidDeviceId(deviceId)) return json(req, { error: "INVALID_DEVICE" }, 400);

    const deviceKeyHash = await sha256(deviceId);
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (action === "subscribe") {
      if (!isValidSubscription(body?.subscription)) {
        return json(req, { error: "INVALID_SUBSCRIPTION" }, 400);
      }
      const subscription = body.subscription;
      const subscriptionValues = {
        device_key_hash: deviceKeyHash,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        expiration_time: Number.isFinite(subscription.expirationTime) ? subscription.expirationTime : null,
        active: true,
        failure_count: 0,
        last_error: null,
        updated_at: new Date().toISOString(),
      };
      const [{ data: deviceRow }, { data: endpointRow }] = await Promise.all([
        admin.from("push_subscriptions").select("id").eq("device_key_hash", deviceKeyHash).maybeSingle(),
        admin.from("push_subscriptions").select("id").eq("endpoint", subscription.endpoint).maybeSingle(),
      ]);
      if (deviceRow?.id && endpointRow?.id && deviceRow.id !== endpointRow.id) {
        await admin.from("push_subscriptions").delete().eq("id", endpointRow.id);
      }
      const targetId = deviceRow?.id ?? endpointRow?.id;
      const saveQuery = targetId
        ? admin.from("push_subscriptions").update(subscriptionValues).eq("id", targetId)
        : admin.from("push_subscriptions").insert(subscriptionValues);
      const { data, error } = await saveQuery.select("id").single();

      if (error || !data) return json(req, { error: "SUBSCRIPTION_SAVE_FAILED" }, 500);
      const readNewsIds = Array.isArray(body?.readNewsIds)
        ? [...new Set(body.readNewsIds.filter((id: unknown) => typeof id === "string" && id.length <= 120))].slice(0, 100)
        : [];
      if (readNewsIds.length) {
        const { error: readError } = await admin.from("push_news_reads").upsert(
          readNewsIds.map((newsId) => ({ subscription_id: data.id, news_id: newsId })),
          { onConflict: "subscription_id,news_id", ignoreDuplicates: true },
        );
        if (readError) return json(req, { error: "READ_SYNC_FAILED" }, 500);
      }
      return json(req, { subscribed: true, unreadCount: await unreadCount(admin, data.id) });
    }

    const { data: saved, error: lookupError } = await admin
      .from("push_subscriptions")
      .select("id, active")
      .eq("device_key_hash", deviceKeyHash)
      .maybeSingle();
    if (lookupError) return json(req, { error: "SUBSCRIPTION_LOOKUP_FAILED" }, 500);

    if (action === "read") {
      const newsIds = Array.isArray(body?.newsIds)
        ? [...new Set(body.newsIds.filter((id: unknown) => typeof id === "string" && id.length <= 120))]
        : [];
      if (!saved?.id || newsIds.length === 0 || newsIds.length > 100) {
        return json(req, { synced: false, unreadCount: 0 });
      }
      const rows = newsIds.map((newsId) => ({ subscription_id: saved.id, news_id: newsId }));
      const { error } = await admin.from("push_news_reads").upsert(rows, {
        onConflict: "subscription_id,news_id",
        ignoreDuplicates: false,
      });
      if (error) return json(req, { error: "READ_SYNC_FAILED" }, 500);
      return json(req, { synced: true, unreadCount: await unreadCount(admin, saved.id) });
    }

    if (action === "status") {
      return json(req, {
        subscribed: Boolean(saved?.active),
        unreadCount: saved?.id ? await unreadCount(admin, saved.id) : 0,
      });
    }

    if (action === "unsubscribe") {
      if (saved?.id) {
        const { error } = await admin.from("push_subscriptions")
          .update({ active: false, updated_at: new Date().toISOString() })
          .eq("id", saved.id);
        if (error) return json(req, { error: "UNSUBSCRIBE_FAILED" }, 500);
      }
      return json(req, { unsubscribed: true });
    }

    return json(req, { error: "INVALID_ACTION" }, 400);
  } catch (error) {
    console.error("Unexpected push-subscription error", error);
    return json(req, { error: "UNEXPECTED_ERROR" }, 500);
  }
});
