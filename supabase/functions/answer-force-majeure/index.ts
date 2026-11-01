import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { servePermit } from "../_shared/permit-quota.ts";

const allowedOrigins = new Set(["https://str-ig.github.io","http://localhost:8000"]);
const people = new Set(["Cónyuge","Pareja de hecho","Padre","Madre","Hijo","Hija","Otro familiar","Persona conviviente"]);
const reasons = new Set(["Enfermedad","Accidente"]);
const presenceValues = new Set(["Sí","No"]);
const absenceTypes = new Set(["full","partial"]);

function isAllowedOrigin(origin:string){if(allowedOrigins.has(origin))return true;try{const u=new URL(origin);return(u.hostname==="localhost"||u.hostname==="127.0.0.1")&&u.protocol==="http:"}catch{return false}}
function corsHeaders(req:Request){const origin=req.headers.get("Origin")??"";return{"Access-Control-Allow-Origin":isAllowedOrigin(origin)?origin:"https://str-ig.github.io","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Vary":"Origin"}}
function json(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:corsHeaders(req)})}
function cleanEmail(v:unknown){return String(v??"").trim().toLowerCase()}
function isIsoDate(v:unknown){const t=String(v??"");const m=t.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return false;const d=new Date(+m[1],+m[2]-1,+m[3],12);return d.getFullYear()===+m[1]&&d.getMonth()===+m[2]-1&&d.getDate()===+m[3]}
function secretKey(){const modern=Deno.env.get("SUPABASE_SECRET_KEYS");if(modern){try{const p=JSON.parse(modern);if(p?.default)return String(p.default)}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??""}
