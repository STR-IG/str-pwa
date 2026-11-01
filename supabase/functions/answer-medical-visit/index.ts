import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { servePermit } from "../_shared/permit-quota.ts";

const allowedOrigins=new Set(["https://str-ig.github.io","http://localhost:8000"]);
const caseTypes=new Set(["own","child","dependent","occupational"]);
const regions=new Set(["inside","outside"]);
const doctorTypes=new Set(["social","primary","private"]);
const relationships=new Set(["spouse","father","mother","son","daughter"]);
const shifts=new Set(["morning","afternoon","night-start","night-previous","split","other"]);
const yesNo=new Set(["yes","no"]);
function isAllowedOrigin(origin:string){if(allowedOrigins.has(origin))return true;try{const u=new URL(origin);return(u.hostname==="localhost"||u.hostname==="127.0.0.1")&&u.protocol==="http:"}catch{return false}}
function headers(req:Request){const o=req.headers.get("Origin")??"";return{"Access-Control-Allow-Origin":isAllowedOrigin(o)?o:"https://str-ig.github.io","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Vary":"Origin"}}
function json(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:headers(req)})}
function cleanEmail(v:unknown){return String(v??"").trim().toLowerCase()}
function isDate(v:unknown){const s=String(v??"");const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return false;const d=new Date(+m[1],+m[2]-1,+m[3],12);return d.getFullYear()===+m[1]&&d.getMonth()===+m[2]-1&&d.getDate()===+m[3]}
function isTime(v:unknown){return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v??""))}
function minutesBetween(start:string,end:string){const [sh,sm]=start.split(":").map(Number),[eh,em]=end.split(":").map(Number);let a=sh*60+sm,b=eh*60+em;if(b<a)b+=1440;return b-a}
function secretKey(){const keys=Deno.env.get("SUPABASE_SECRET_KEYS");if(keys){try{const p=JSON.parse(keys);if(p?.default)return String(p.default)}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??""}
