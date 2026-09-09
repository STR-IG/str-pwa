import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "payroll-documents";
const allowedOrigins = new Set(["https://str-ig.github.io", "http://localhost:8000"]);
const receiptPattern = /^receipt-\d{13}-[0-9a-f-]{36}$/;

function headers(req: Request, contentType = "application/json") {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://str-ig.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

const cleanEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();

async function targetFor(admin: ReturnType<typeof createClient>, email: string) {
  const { data: affiliate, error } = await admin
    .from("private_access_allowlist")
    .select("email, display_name, employee_number, active")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error("AFFILIATE_LOOKUP_FAILED");
  if (!affiliate) throw new Error("AFFILIATE_NOT_FOUND");

  for (let page = 1; page <= 20; page += 1) {
    const { data, error: usersError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (usersError) throw new Error("USER_LOOKUP_FAILED");
    const user = data.users.find((item) => cleanEmail(item.email) === email);
    if (user) return { user, affiliate };
    if (data.users.length < 1000) break;
  }
  throw new Error("AFFILIATE_ACCOUNT_NOT_FOUND");
}

function isAllowedFolder(path: string, userId: string) {
  const parts = path.split("/");
  if (parts[0] !== userId || parts.some((part) => !part || part === "." || part === "..")) return false;
  if (parts.length === 1) return true;
  if (!/^\d{4}$/.test(parts[1])) return false;
  if (parts.length === 2) return true;
  if (!/^(0[1-9]|1[0-2])$/.test(parts[2])) return false;
  if (parts.length === 3) return true;
  return parts.length === 4 && (receiptPattern.test(parts[3]) || parts[3] === "month-summary");
}

function isAllowedFile(path: string, userId: string) {
  const parts = path.split("/");
  const name = parts.at(-1);
  if (!["timesheet", "payroll", "review"].includes(name ?? "")) return false;
  const folderParts = parts.slice(0, -1);
  if (folderParts.length !== 3 && folderParts.length !== 4) return false;
  return isAllowedFolder(folderParts.join("/"), userId);
}

async function listAll(bucket: any, path: string) {
  const items = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await bucket.list(path, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error("STORAGE_LIST_FAILED");
    items.push(...(data ?? []));
    if (!data || data.length < 100) return items;
  }
}

async function summary(bucket: any, userId: string) {
  const years = (await listAll(bucket, userId)).filter((item) => !item.id && /^\d{4}$/.test(item.name));
  const periods = [];
  for (const year of years) {
    const months = (await listAll(bucket, `${userId}/${year.name}`)).filter((item) => !item.id && /^(0[1-9]|1[0-2])$/.test(item.name));
    for (const month of months) {
      const folder = `${userId}/${year.name}/${month.name}`;
      const top = await listAll(bucket, folder);
      const receiptFolders = top.filter((item) => !item.id && receiptPattern.test(item.name));
      const receipts = [];
      if (top.some((item) => item.id && ["timesheet", "payroll", "review"].includes(item.name))) {
        receipts.push({ id: "", files: top });
      }
      for (const item of receiptFolders) receipts.push({ id: item.name, files: await listAll(bucket, `${folder}/${item.name}`) });
      const closureFiles = top.some((item) => !item.id && item.name === "month-summary")
        ? await listAll(bucket, `${folder}/month-summary`) : [];
      let receiptsComplete = receipts.length > 0;
      for (const receipt of receipts) {
        if (!receipt.files.some((file) => file.id && file.name === "review")) { receiptsComplete = false; continue; }
        const { data: reviewBlob, error: reviewError } = await bucket.download(`${folder}${receipt.id ? `/${receipt.id}` : ""}/review`);
        if (reviewError || !reviewBlob) { receiptsComplete = false; continue; }
        try { if (JSON.parse(await reviewBlob.text())?.status !== "complete") receiptsComplete = false; }
        catch { receiptsComplete = false; }
      }
      periods.push({
        year: Number(year.name),
        month: Number(month.name),
        timesheet: receipts.some((receipt) => receipt.files.some((file) => file.id && file.name === "timesheet")),
        payrollCount: receipts.filter((receipt) => receipt.files.some((file) => file.id && file.name === "payroll")).length,
        closure: closureFiles.some((file) => file.id && file.name === "review") && receiptsComplete,
        receipts: receipts.map((receipt, index) => ({
          id: receipt.id,
          number: index + 1,
          timesheet: receipt.files.some((file) => file.id && file.name === "timesheet"),
          payroll: receipt.files.some((file) => file.id && file.name === "payroll"),
          review: receipt.files.some((file) => file.id && file.name === "review"),
        })),
      });
    }
  }
  return periods.sort((a, b) => (b.year - a.year) || (b.month - a.month));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  if (req.method !== "POST") return json(req, { error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json(req, { error: "UNAUTHORIZED" }, 401);
    const url = Deno.env.get("SUPABASE_URL");
    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !secret) return json(req, { error: "SERVER_CONFIGURATION" }, 500);
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user?.email) return json(req, { error: "UNAUTHORIZED" }, 401);
    const { data: role, error: roleError } = await admin.from("committee_admins").select("email")
      .eq("email", cleanEmail(authData.user.email)).eq("active", true).maybeSingle();
    if (roleError) return json(req, { error: "AUTHORIZATION_CHECK_FAILED" }, 500);
    if (!role) return json(req, { error: "FORBIDDEN" }, 403);

    const contentType = req.headers.get("content-type") ?? "";
    const input = contentType.includes("multipart/form-data") ? await req.formData() : await req.json().catch(() => ({}));
    const value = (key: string) => input instanceof FormData ? input.get(key) : (input as Record<string, unknown>)[key];
    const action = String(value("action") ?? "");
    const email = cleanEmail(value("email"));
    if (!email) return json(req, { error: "INVALID_AFFILIATE" }, 400);
    const { user, affiliate } = await targetFor(admin, email);
    const bucket = admin.storage.from(BUCKET);

    if (action === "resolve") return json(req, { userId: user.id, affiliate });
    if (action === "summary") return json(req, { periods: await summary(bucket, user.id) });

    const path = String(value("path") ?? "");
    if (action === "list") {
      if (!isAllowedFolder(path, user.id)) return json(req, { error: "INVALID_PATH" }, 400);
      return json(req, { data: await listAll(bucket, path) });
    }
    if (action === "download") {
      if (!isAllowedFile(path, user.id)) return json(req, { error: "INVALID_PATH" }, 400);
      const { data, error } = await bucket.download(path);
      if (error || !data) return json(req, { error: "DOWNLOAD_FAILED" }, 404);
      return new Response(data, { status: 200, headers: headers(req, data.type || "application/octet-stream") });
    }
    if (action === "upload") {
      if (!(input instanceof FormData) || !isAllowedFile(path, user.id)) return json(req, { error: "INVALID_UPLOAD" }, 400);
      const file = input.get("file");
      if (!(file instanceof File) || file.size > 15 * 1024 * 1024) return json(req, { error: "INVALID_FILE" }, 400);
      const { error } = await bucket.upload(path, file, {
        contentType: file.type || "application/octet-stream", cacheControl: "0", upsert: String(value("upsert")) === "true",
      });
      if (error) return json(req, { error: "UPLOAD_FAILED" }, 409);
      return json(req, { saved: true, path });
    }
    if (action === "remove") {
      const paths = Array.isArray(value("paths")) ? value("paths") : [];
      if (!paths.length || paths.length > 50 || paths.some((item) => !isAllowedFile(String(item), user.id))) {
        return json(req, { error: "INVALID_PATH" }, 400);
      }
      const { error } = await bucket.remove(paths.map(String));
      if (error) return json(req, { error: "DELETE_FAILED" }, 500);
      return json(req, { deleted: paths.length });
    }
    return json(req, { error: "INVALID_ACTION" }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNEXPECTED_ERROR";
    const status = code === "AFFILIATE_NOT_FOUND" || code === "AFFILIATE_ACCOUNT_NOT_FOUND" ? 404 : 500;
    console.error("admin-payroll-documents", code);
    return json(req, { error: code }, status);
  }
});
