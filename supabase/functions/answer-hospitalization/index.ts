import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set(["https://str-ig.github.io","http://localhost:8000"]);
const workShifts = new Set(["morning","afternoon","night-start","night-previous","rest"]);
const medicalStatuses = new Set(["hospitalized","rest","no-rest","unknown"]);
const durations = new Set(["yes","no","unknown"]);
const triState = new Set(["yes","no","unknown"]);
function isAllowedOrigin(origin:string){if(allowedOrigins.has(origin))return true;try{const url=new URL(origin);return(url.hostname==="localhost"||url.hostname==="127.0.0.1")&&url.protocol==="http:"}catch{return false}}
function corsHeaders(req:Request){const origin=req.headers.get("Origin")??"";return{"Access-Control-Allow-Origin":isAllowedOrigin(origin)?origin:"https://str-ig.github.io","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Vary":"Origin"}}
function json(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:corsHeaders(req)})}
function cleanEmail(value:unknown){return String(value??"").trim().toLowerCase()}
function isIsoDate(value:unknown):value is string{const text=String(value??"");const match=text.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!match)return false;const date=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]),12);return date.getFullYear()===Number(match[1])&&date.getMonth()===Number(match[2])-1&&date.getDate()===Number(match[3])}
function isTime(value:unknown):value is string{return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value??""))}
function secretKey(){const modernKeys=Deno.env.get("SUPABASE_SECRET_KEYS");if(modernKeys){try{const parsed=JSON.parse(modernKeys);if(parsed?.default)return String(parsed.default)}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??""}
async function safetyIdentifier(userId:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(userId));return Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,"0")).join("").slice(0,64)}
function extractOutputText(data:any){if(typeof data?.output_text==="string")return data.output_text;for(const item of data?.output??[])for(const content of item?.content??[])if(content?.type==="output_text"&&typeof content.text==="string")return content.text;return""}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders(req)});
  if(req.method!=="POST")return json(req,{error:"METHOD_NOT_ALLOWED"},405);
  try{
    const authHeader=req.headers.get("Authorization")??"",token=authHeader.startsWith("Bearer ")?authHeader.slice(7):"";
    if(!token)return json(req,{error:"UNAUTHORIZED"},401);
    const supabaseUrl=Deno.env.get("SUPABASE_URL")??"",adminKey=secretKey(),openAiKey=Deno.env.get("OPENAI_API_KEY")??"";
    if(!supabaseUrl||!adminKey||!openAiKey)return json(req,{error:"SERVER_CONFIGURATION"},500);
    const admin=createClient(supabaseUrl,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const{data:userData,error:userError}=await admin.auth.getUser(token);const user=userData.user;
    if(userError||!user?.id||!user.email)return json(req,{error:"UNAUTHORIZED"},401);
    const{data:accessRow,error:accessError}=await admin.from("private_access_allowlist").select("email").eq("email",cleanEmail(user.email)).eq("active",true).maybeSingle();
    if(accessError)return json(req,{error:"AUTHORIZATION_CHECK_FAILED"},500);if(!accessRow)return json(req,{error:"FORBIDDEN"},403);

    const body=await req.json().catch(()=>({}));
    const relationship=String(body?.relationship??"").trim().slice(0,80),duration=String(body?.duration??""),admissionDate=String(body?.admissionDate??""),admissionTime=String(body?.admissionTime??""),workShift=String(body?.workShift??""),medicalStatus=String(body?.medicalStatus??""),dischargeDate=String(body?.dischargeDate??""),restUntil=String(body?.restUntil??""),queryType=String(body?.queryType??"hospitalizacion_familiar_primer_grado");
    const leaveDays=Array.isArray(body?.leaveDays)?body.leaveDays.map((value:unknown)=>String(value)):[];
    const documentation=body?.documentation&&typeof body.documentation==="object"?body.documentation:null;
    const doc={hospitalProof:String(documentation?.hospitalProof??""),relationshipRecorded:String(documentation?.relationshipRecorded??""),relationshipProof:String(documentation?.relationshipProof??""),healthData:String(documentation?.healthData??""),thirdPartyData:String(documentation?.thirdPartyData??"")};
    const isFirstGrade=queryType==="hospitalizacion_familiar_primer_grado";
    const validCore=Boolean(relationship)&&durations.has(duration)&&isIsoDate(admissionDate)&&isTime(admissionTime)&&workShifts.has(workShift)&&medicalStatuses.has(medicalStatus);
    const validDays=leaveDays.length>=1&&leaveDays.length<=5&&leaveDays.every(isIsoDate)&&new Set(leaveDays).size===leaveDays.length&&leaveDays.every((day:string,index:number)=>index===0||day>leaveDays[0])&&leaveDays.every((day:string)=>day>=admissionDate);
    const validDischarge=!["rest","no-rest"].includes(medicalStatus)||isIsoDate(dischargeDate);
    const validRest=medicalStatus!=="rest"||(isIsoDate(restUntil)&&restUntil>=dischargeDate);
    const validDocumentation=!isFirstGrade||(triState.has(doc.hospitalProof)&&triState.has(doc.relationshipRecorded)&&triState.has(doc.healthData)&&triState.has(doc.thirdPartyData)&&(doc.relationshipRecorded==="yes"||triState.has(doc.relationshipProof)));
    if(!validCore||!validDays||!validDischarge||!validRest||!validDocumentation)return json(req,{error:"INVALID_QUESTIONNAIRE"},400);

    const facts={relationship,duration,admissionDate,admissionTime,workShift,medicalStatus,dischargeDate:dischargeDate||null,restUntil:restUntil||null,leaveDays,pendingLeaveDays:Math.max(0,5-leaveDays.length),queryType,documentation:isFirstGrade?doc:null};
    const aiResponse=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${openAiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-5.4-mini",store:false,reasoning:{effort:"low"},max_output_tokens:900,safety_identifier:await safetyIdentifier(user.id),instructions:`Eres un asistente informativo de STR-IG. Analiza exclusivamente un permiso por hospitalización familiar. La referencia general es el artículo 37.3.b del Estatuto de los Trabajadores: cinco días por hospitalización para las relaciones incluidas legalmente. Distingue ingreso hospitalario y reposo tras el alta. El usuario puede haber indicado entre uno y cinco días porque todavía no tenga decididos todos los días; analiza solo las fechas facilitadas y no inventes fechas pendientes. No afirmes con certeza que los días discontinuos son válidos si falta respaldo específico; si ese punto es relevante, indícalo para revisión con STR. Para hospitalización familiar de 1.er grado, también recibirás respuestas de documentación. Cosmos solicita justificante de las fechas de hospitalización y acreditación del parentesco cuando este no conste en los sistemas internos. Si hospitalProof es yes, relationshipRecorded es yes o relationshipProof es yes cuando haga falta, healthData es no y thirdPartyData es no, indica expresamente que la documentación parece preparada para tramitar el permiso. Si healthData es yes o unknown, recomienda revisar y ocultar datos de salud que no sean necesarios. Si thirdPartyData es yes o unknown, recomienda ocultar datos personales de terceros que no sean necesarios. Si falta justificante de hospitalización o, cuando proceda, acreditación del parentesco, usa revision y explica qué falta. No pidas ni sugieras subir documentos a Pregúntale a STR: la app no recibe ni almacena justificantes. No inventes diagnóstico médico, documentación adicional, convenio o sentencia. Si los datos esenciales del permiso encajan y la documentación está correcta, usa status compatible y da una conclusión clara, no una respuesta ambigua. Turnos nocturnos o incompatibilidades temporales pueden requerir revision. Responde en español, breve y prudente.`,input:JSON.stringify(facts),text:{verbosity:"low",format:{type:"json_schema",name:"hospitalization_guidance",strict:true,schema:{type:"object",properties:{status:{type:"string",enum:["compatible","revision","not_compatible"]},title:{type:"string"},summary:{type:"string"},reasons:{type:"array",items:{type:"string"}},recommendations:{type:"array",items:{type:"string"}}},required:["status","title","summary","reasons","recommendations"],additionalProperties:false}}}})});
    const aiData=await aiResponse.json().catch(()=>({}));if(!aiResponse.ok)return json(req,{error:"AI_UNAVAILABLE"},502);const outputText=extractOutputText(aiData);if(!outputText)return json(req,{error:"AI_EMPTY_RESPONSE"},502);return json(req,{guidance:JSON.parse(outputText)});
  }catch(error){console.error("Unexpected answer-hospitalization error",error instanceof Error?error.message:"unknown");return json(req,{error:"UNEXPECTED_ERROR"},500)}
});