import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set(["https://str-ig.github.io","http://localhost:8000"]);
const caseTypes = new Set(["own","child","occupational"]);
const regions = new Set(["inside","outside"]);
const doctorTypes = new Set(["social","primary","private"]);
const shifts = new Set(["morning","afternoon","night-start","night-previous","split","other"]);

function isAllowedOrigin(origin:string){if(allowedOrigins.has(origin))return true;try{const u=new URL(origin);return (u.hostname==="localhost"||u.hostname==="127.0.0.1")&&u.protocol==="http:"}catch{return false}}
function headers(req:Request){const o=req.headers.get("Origin")??"";return{"Access-Control-Allow-Origin":isAllowedOrigin(o)?o:"https://str-ig.github.io","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Vary":"Origin"}}
function json(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:headers(req)})}
function cleanEmail(v:unknown){return String(v??"").trim().toLowerCase()}
function isDate(v:unknown){const s=String(v??"");const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return false;const d=new Date(+m[1],+m[2]-1,+m[3],12);return d.getFullYear()===+m[1]&&d.getMonth()===+m[2]-1&&d.getDate()===+m[3]}
function isTime(v:unknown){return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v??""))}
function secretKey(){const keys=Deno.env.get("SUPABASE_SECRET_KEYS");if(keys){try{const p=JSON.parse(keys);if(p?.default)return String(p.default)}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??""}
async function safetyIdentifier(id:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(id));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("").slice(0,64)}
function outputText(data:any){if(typeof data?.output_text==="string")return data.output_text;for(const item of data?.output??[])for(const c of item?.content??[])if(c?.type==="output_text"&&typeof c.text==="string")return c.text;return ""}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:headers(req)});
  if(req.method!=="POST")return json(req,{error:"METHOD_NOT_ALLOWED"},405);
  try{
    const auth=req.headers.get("Authorization")??"";const token=auth.startsWith("Bearer ")?auth.slice(7):"";if(!token)return json(req,{error:"UNAUTHORIZED"},401);
    const url=Deno.env.get("SUPABASE_URL")??"",adminKey=secretKey(),openAiKey=Deno.env.get("OPENAI_API_KEY")??"";if(!url||!adminKey||!openAiKey)return json(req,{error:"SERVER_CONFIGURATION"},500);
    const admin=createClient(url,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});const{data:userData,error:userError}=await admin.auth.getUser(token);const user=userData.user;if(userError||!user?.id||!user.email)return json(req,{error:"UNAUTHORIZED"},401);
    const{data:access,error:accessError}=await admin.from("private_access_allowlist").select("email").eq("email",cleanEmail(user.email)).eq("active",true).maybeSingle();if(accessError)return json(req,{error:"AUTHORIZATION_CHECK_FAILED"},500);if(!access)return json(req,{error:"FORBIDDEN"},403);
    const b=await req.json().catch(()=>({}));const caseType=String(b?.caseType??""),duringWork=String(b?.duringWork??""),region=b?.region==null?null:String(b.region),doctorType=b?.doctorType==null?null:String(b.doctorType),visitDate=String(b?.visitDate??""),visitTime=String(b?.visitTime??""),workShift=String(b?.workShift??"");
    const occupational=caseType==="occupational";const valid=caseTypes.has(caseType)&&duringWork==="yes"&&isDate(visitDate)&&isTime(visitTime)&&shifts.has(workShift)&&(occupational||(regions.has(String(region))&&doctorTypes.has(String(doctorType))));if(!valid)return json(req,{error:"INVALID_QUESTIONNAIRE"},400);
    const facts={caseType,duringWork,region,doctorType,visitDate,visitTime,workShift};
    const ai=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${openAiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-5.4-mini",store:false,reasoning:{effort:"low"},max_output_tokens:850,safety_identifier:await safetyIdentifier(user.id),instructions:`Eres un asistente informativo de STR-IG. Analiza exclusivamente datos estructurados sobre permiso retribuido de visita médica. Usa como reglas internas de esta ficha: visita médica propia que coincide con jornada: 4 horas dentro de la comarca y 6 horas fuera; incluye Seguridad Social, médico de cabecera o especialista y médico particular. El permiso es de 4 o 6 horas, no se limita a la duración de la consulta y no se exige justificar el desplazamiento. Debe presentarse justificante de asistencia y, según la ficha, no pueden exigir la hora de entrada y salida de la consulta. Para accidente de trabajo o enfermedad profesional corresponde el tiempo necesario. Para acompañamiento de hijos/as menores de 16 años: 4 salidas al año; cada salida será de 4 horas dentro de la comarca o 6 horas fuera. Referencias de la ficha: Pacto Adicional de 29/07/1993 (art. 18), Acuerdo de 19/09/2002 y STSJ de Cataluña 3419/2025, de 16 de junio. No inventes normas, diagnóstico ni hechos. Si el turno nocturno u otro horario genera duda sobre la coincidencia, usa revision. Da una orientación breve, prudente y clara, no una garantía jurídica. Responde en español.`,input:JSON.stringify(facts),text:{verbosity:"low",format:{type:"json_schema",name:"medical_visit_guidance",strict:true,schema:{type:"object",properties:{status:{type:"string",enum:["compatible","revision","not_compatible"]},title:{type:"string"},summary:{type:"string"},reasons:{type:"array",items:{type:"string"}},recommendations:{type:"array",items:{type:"string"}}},required:["status","title","summary","reasons","recommendations"],additionalProperties:false}}}})});
    const data=await ai.json().catch(()=>({}));if(!ai.ok)return json(req,{error:"AI_UNAVAILABLE"},502);const text=outputText(data);if(!text)return json(req,{error:"AI_EMPTY_RESPONSE"},502);return json(req,{guidance:JSON.parse(text)});
  }catch(e){console.error("answer-medical-visit",e instanceof Error?e.message:"unknown");return json(req,{error:"UNEXPECTED_ERROR"},500)}
});
