import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
function secretKey(){const keys=Deno.env.get("SUPABASE_SECRET_KEYS");if(keys){try{const p=JSON.parse(keys);if(p?.default)return String(p.default)}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??""}
async function safetyIdentifier(id:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(id));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("").slice(0,64)}
function outputText(data:any){if(typeof data?.output_text==="string")return data.output_text;for(const item of data?.output??[])for(const c of item?.content??[])if(c?.type==="output_text"&&typeof c.text==="string")return c.text;return""}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:headers(req)});
  if(req.method!=="POST")return json(req,{error:"METHOD_NOT_ALLOWED"},405);
  try{
    const auth=req.headers.get("Authorization")??"";
    const token=auth.startsWith("Bearer ")?auth.slice(7):"";
    if(!token)return json(req,{error:"UNAUTHORIZED"},401);
    const url=Deno.env.get("SUPABASE_URL")??"",adminKey=secretKey(),openAiKey=Deno.env.get("OPENAI_API_KEY")??"";
    if(!url||!adminKey||!openAiKey)return json(req,{error:"SERVER_CONFIGURATION"},500);
    const admin=createClient(url,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const{data:userData,error:userError}=await admin.auth.getUser(token);const user=userData.user;
    if(userError||!user?.id||!user.email)return json(req,{error:"UNAUTHORIZED"},401);
    const{data:access,error:accessError}=await admin.from("private_access_allowlist").select("email").eq("email",cleanEmail(user.email)).eq("active",true).maybeSingle();
    if(accessError)return json(req,{error:"AUTHORIZATION_CHECK_FAILED"},500);
    if(!access)return json(req,{error:"FORBIDDEN"},403);

    const b=await req.json().catch(()=>({}));
    const caseType=String(b?.caseType??""),duringWork=String(b?.duringWork??""),region=b?.region==null?null:String(b.region),doctorType=b?.doctorType==null?null:String(b.doctorType),relationship=b?.relationship==null?null:String(b.relationship),needsEscort=b?.needsEscort==null?null:String(b.needsEscort),dependency=b?.dependency==null?null:String(b.dependency),medicalProof=b?.medicalProof==null?null:String(b.medicalProof),visitDate=String(b?.visitDate??""),visitTime=String(b?.visitTime??""),workShift=String(b?.workShift??"");
    const standard=caseType==="own"||caseType==="child",dependent=caseType==="dependent",occupational=caseType==="occupational";
    const common=caseTypes.has(caseType)&&duringWork==="yes"&&isDate(visitDate)&&isTime(visitTime)&&shifts.has(workShift);
    const details=standard?(regions.has(String(region))&&doctorTypes.has(String(doctorType))):dependent?(relationships.has(String(relationship))&&yesNo.has(String(needsEscort))&&yesNo.has(String(dependency))&&yesNo.has(String(medicalProof))):occupational;
    if(!common||!details)return json(req,{error:"INVALID_QUESTIONNAIRE"},400);

    const facts={caseType,duringWork,region,doctorType,relationship,needsEscort,dependency,medicalProof,visitDate,visitTime,workShift};
    const ai=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${openAiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-5.4-mini",store:false,reasoning:{effort:"low"},max_output_tokens:900,safety_identifier:await safetyIdentifier(user.id),instructions:`Eres un asistente informativo de STR-IG. Analiza datos estructurados sobre visita médica y distingue siempre dos fuentes de derecho. PACTO INTERNO: artículo 18 del Pacto adicional de 29/07/1993, vigente según STSJ de Cataluña 3419/2025: visita médica propia durante jornada, máximo retribuido de 4 horas dentro de la comarca de residencia y 6 horas fuera; comprende Seguridad Social, médico de cabecera, especialista y médico particular. Para accidente de trabajo o enfermedad profesional, tiempo necesario. Para acompañar hijos/as menores de 16 años, cuatro salidas al año, cada una de 4 horas dentro de comarca o 6 fuera. Acuerdo de 19/09/2002: no se exige que el justificante incluya horas de entrada y salida. CONVENIO GENERAL DE LA INDUSTRIA QUÍMICA: tiempo indispensable para acompañar a consulta médica al cónyuge o familiar de primer grado que esté a cargo, si coincide con jornada. Para estar a cargo debe existir necesidad real de acompañamiento por edad, accidente o enfermedad que impida acudir solo; convivencia o situación similar de alta dependencia; y acreditación mediante certificación o documento oficial de facultativo. En caso de edad, la dependencia se entiende hasta los 18 años. No incluyas ni menciones el concepto específico de visita médica de familiar de primer grado con diversidad funcional/discapacidad: se gestionará en un permiso separado. Nunca apliques las 4/6 horas del pacto interno al supuesto dependent; ahí corresponde tiempo indispensable si se cumplen los requisitos. Si cualquiera de needsEscort, dependency o medicalProof es no, no afirmes que el derecho general del convenio está consolidado: usa not_compatible o revision según proceda y explica qué requisito falta. No inventes diagnósticos, hechos ni duración concreta del tiempo indispensable. Turnos nocturnos u horarios dudosos pueden requerir revision. Responde en español, claro, prudente y breve.`,input:JSON.stringify(facts),text:{verbosity:"low",format:{type:"json_schema",name:"medical_visit_guidance",strict:true,schema:{type:"object",properties:{status:{type:"string",enum:["compatible","revision","not_compatible"]},title:{type:"string"},summary:{type:"string"},reasons:{type:"array",items:{type:"string"}},recommendations:{type:"array",items:{type:"string"}}},required:["status","title","summary","reasons","recommendations"],additionalProperties:false}}}})});
    const data=await ai.json().catch(()=>({}));
    if(!ai.ok)return json(req,{error:"AI_UNAVAILABLE"},502);
    const text=outputText(data);
    if(!text)return json(req,{error:"AI_EMPTY_RESPONSE"},502);
    return json(req,{guidance:JSON.parse(text)});
  }catch(e){console.error("answer-medical-visit",e instanceof Error?e.message:"unknown");return json(req,{error:"UNEXPECTED_ERROR"},500)}
});
