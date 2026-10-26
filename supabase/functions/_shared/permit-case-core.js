// Case collection has been retired. Old clients cannot submit or retrieve personal cases.
export function permitCaseHandler() {
  return async req => {
    const headers={'Access-Control-Allow-Origin':'https://str-ig.github.io','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
    if(req.method==='OPTIONS')return new Response('ok',{headers});
    return Response.json({error:'CASE_COLLECTION_DISABLED'}, {status:410,headers});
  };
}
