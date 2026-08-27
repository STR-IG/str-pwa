import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
async function safetyIdentifier(userId:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(userId));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("").slice(0,64)}
function extractOutputText(data:any){if(typeof data?.output_text==="string")return data.output_text;for(const item of data?.output??[])for(const c of item?.content??[])if(c?.type==="output_text"&&typeof c.text==="string")return c.text;return""}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders(req)});
  if(req.method!=="POST")return json(req,{error:"METHOD_NOT_ALLOWED"},405);
  try{
    const auth=req.headers.get("Authorization")??"",token=auth.startsWith("Bearer ")?auth.slice(7):"";
    if(!token)return json(req,{error:"UNAUTHORIZED"},401);
    const supabaseUrl=Deno.env.get("SUPABASE_URL")??"",adminKey=secretKey(),openAiKey=Deno.env.get("OPENAI_API_KEY")??"";
    if(!supabaseUrl||!adminKey||!openAiKey)return json(req,{error:"SERVER_CONFIGURATION"},500);
    const admin=createClient(supabaseUrl,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const{data:userData,error:userError}=await admin.auth.getUser(token);const user=userData.user;
    if(userError||!user?.id||!user.email)return json(req,{error:"UNAUTHORIZED"},401);
    const{data:accessRow,error:accessError}=await admin.from("private_access_allowlist").select("email").eq("email",cleanEmail(user.email)).eq("active",true).maybeSingle();
    if(accessError)return json(req,{error:"AUTHORIZATION_CHECK_FAILED"},500);if(!accessRow)return json(req,{error:"FORBIDDEN"},403);

    const body=await req.json().catch(()=>({}));
    const person=String(body?.person??"").trim(),reason=String(body?.reason??"").trim(),immediatePresence=String(body?.immediatePresence??"").trim(),eventDate=String(body?.eventDate??"").trim(),absenceType=String(body?.absenceType??"").trim();
    const hours=body?.hours===null||body?.hours===undefined?null:Number(body.hours);
    const valid=people.has(person)&&reasons.has(reason)&&presenceValues.has(immediatePresence)&&isIsoDate(eventDate)&&absenceTypes.has(absenceType)&&(absenceType==="full"||(Number.isFinite(hours)&&hours>0&&hours<=24));
    if(!valid)return json(req,{error:"INVALID_QUESTIONNAIRE"},400);

    const facts={person,reason,immediatePresence,eventDate,absenceType,hours:absenceType==="partial"?hours:null};
    const aiResponse=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${openAiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-5.4-mini",store:false,reasoning:{effort:"low"},max_output_tokens:800,safety_identifier:await safetyIdentifier(user.id),instructions:`Eres un asistente informativo de la sección sindical STR-IG. Analiza exclusivamente datos estructurados de un cuestionario sobre el permiso por fuerza mayor familiar del artículo 37.9 del Estatuto de los Trabajadores en España. La referencia general es: la persona trabajadora puede ausentarse por motivos familiares urgentes relacionados con familiares o personas convivientes, en caso de enfermedad o accidente que hagan indispensable su presencia inmediata; las horas de ausencia por estas causas son retribuidas hasta el equivalente a cuatro días al año, conforme a la regulación aplicable. No presentes esos cuatro días como un permiso nuevo por cada incidencia. No conviertas automáticamente el límite anual a 32 horas ni supongas jornadas de 8 horas: si no se conoce la jornada individual ni las ausencias previas del año, explica que no puede calcularse el saldo restante. Si immediatePresence es "No", señala que falta un requisito esencial y usa normalmente not_compatible o revision según proceda. No inventes diagnósticos, convenio, saldo consumido, jornada, documentación concreta ni hechos no aportados. Puedes indicar de forma prudente que el motivo puede tener que acreditarse. Da orientación clara, breve y no una garantía jurídica. Responde en español y sin datos personales.`,input:JSON.stringify(facts),text:{verbosity:"low",format:{type:"json_schema",name:"force_majeure_guidance",strict:true,schema:{type:"object",properties:{status:{type:"string",enum:["compatible","revision","not_compatible"]},title:{type:"string"},summary:{type:"string"},reasons:{type:"array",items:{type:"string"}},annualLimit:{type:"string"},recommendations:{type:"array",items:{type:"string"}}},required:["status","title","summary","reasons","annualLimit","recommendations"],additionalProperties:false}}}}) });
    const aiData=await aiResponse.json().catch(()=>({}));if(!aiResponse.ok){console.error("OpenAI force majeure guidance failed",aiResponse.status,aiData?.error?.code??"unknown");return json(req,{error:"AI_UNAVAILABLE"},502)}
    const outputText=extractOutputText(aiData);if(!outputText)return json(req,{error:"AI_EMPTY_RESPONSE"},502);
    return json(req,{guidance:JSON.parse(outputText)});
  }catch(error){console.error("Unexpected answer-force-majeure error",error instanceof Error?error.message:"unknown");return json(req,{error:"UNEXPECTED_ERROR"},500)}
});
