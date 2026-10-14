import { renderReceipt } from './template.ts';
const headers = {'Content-Type':'application/json'};
const json = (body:unknown,status=200) => new Response(JSON.stringify(body),{status,headers});

Deno.serve(async(req:Request)=>{
 const webhookSecret=Deno.env.get('WEBHOOK_SECRET');
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 if(!webhookSecret||req.headers.get('x-webhook-secret')!==webhookSecret)return json({error:'Unauthorized'},401);
 const base=Deno.env.get('SUPABASE_URL');
 let serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 try{const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');serviceKey=keys.default||serviceKey;}catch{}
 const resendKey=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('FROM_EMAIL');
 if(!base||!serviceKey||!resendKey||!from)return json({error:'Email configuration unavailable'},503);
 const dbHeaders:Record<string,string>={apikey:serviceKey,'Content-Type':'application/json'};
 if(!serviceKey.startsWith('sb_secret_'))dbHeaders.Authorization=`Bearer ${serviceKey}`;
 const db=async(path:string,method='GET',body?:unknown)=>{
  const response=await fetch(`${base}${path}`,{method,headers:{...dbHeaders,Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
  if(!response.ok)throw new Error(`Database request failed (${response.status})`);
  return await response.json();
 };
 let item:any;
 try{
  const input=await req.json();
  if(typeof input.notification_id!=='string'||!/^[0-9a-f-]{36}$/i.test(input.notification_id))return json({error:'Invalid notification'},400);
  const items=await db(`/rest/v1/feedback_receipts?id=eq.${input.notification_id}&select=*`);item=items[0];
  if(!item)return json({error:'Notification not found'},404);
  if(item.status==='sent')return json({ok:true,skipped:true});
  if(item.attempts>=5)return json({ok:true,skipped:true,reason:'Retry limit reached'});
  if(item.status==='sending'&&Date.now()-new Date(item.last_attempt_at).getTime()<600000)return json({ok:true,skipped:true});
  const claimed=await db(`/rest/v1/feedback_receipts?id=eq.${item.id}&status=eq.${item.status}&attempts=eq.${item.attempts}`,'PATCH',{status:'sending',attempts:item.attempts+1,last_attempt_at:new Date().toISOString(),last_error:null});
  if(!claimed.length)return json({ok:true,skipped:true});
  if(!item.recipient_email)throw new Error('Receipt recipient unavailable');
  const {subject,text,html}=renderReceipt(item);
  const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json','Idempotency-Key':`feedback-receipt-${item.id}`},body:JSON.stringify({from,to:[item.recipient_email],reply_to:'nicholasgoodridge@hotmail.com',subject,text,html})});
  if(!sent.ok)throw new Error(`Email provider rejected delivery (${sent.status})`);
  await db(`/rest/v1/feedback_receipts?id=eq.${item.id}`,'PATCH',{status:'sent',sent_at:new Date().toISOString(),last_error:null});
  return json({ok:true});
 }catch(error){
  const detail=error instanceof Error?error.message:'Email delivery failed';
  if(item){try{await db(`/rest/v1/feedback_receipts?id=eq.${item.id}&status=eq.sending`,'PATCH',{status:'failed',last_error:detail});}catch{}}
  console.error('Feedback receipt failed',detail);
  return json({error:detail},500);
 }
});
