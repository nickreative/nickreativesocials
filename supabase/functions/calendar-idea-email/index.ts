const headers = {'Content-Type':'application/json'};
const json = (body:unknown,status=200) => new Response(JSON.stringify(body),{status,headers});
const escapeHtml=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

Deno.serve(async(req:Request)=>{
 const webhookSecret=Deno.env.get('WEBHOOK_SECRET');
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 if(!webhookSecret||req.headers.get('x-webhook-secret')!==webhookSecret)return json({error:'Unauthorized'},401);
 const base=Deno.env.get('SUPABASE_URL');
 let serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 try{const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');serviceKey=keys.default||serviceKey;}catch{}
 const resendKey=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('FROM_EMAIL'),adminTo=Deno.env.get('NOTIFY_TO_EMAIL');
 if(!base||!serviceKey||!resendKey||!from||!adminTo)return json({error:'Email configuration unavailable'},503);
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
  const items=await db(`/rest/v1/calendar_notifications?id=eq.${input.notification_id}&select=*`);item=items[0];
  if(!item)return json({error:'Notification not found'},404);
  if(item.status==='sent')return json({ok:true,skipped:true});
  if(item.attempts>=5)return json({ok:true,skipped:true,reason:'Retry limit reached'});
  if(item.status==='sending'&&Date.now()-new Date(item.last_attempt_at).getTime()<600000)return json({ok:true,skipped:true});
  const claimed=await db(`/rest/v1/calendar_notifications?id=eq.${item.id}&status=eq.${item.status}&attempts=eq.${item.attempts}`,'PATCH',{status:'sending',attempts:item.attempts+1,last_attempt_at:new Date().toISOString(),last_error:null});
  if(!claimed.length)return json({ok:true,skipped:true});
  let recipients:string[]=[];
  if(item.direction==='admin')recipients=[adminTo];
  else{
   // Read protected assignments from Auth, never from user-editable metadata.
   for(let page=1;page<=20;page++){
    const result=await db(`/auth/v1/admin/users?page=${page}&per_page=100`);
    const users=result.users||[];
    recipients.push(...users.filter((u:any)=>u.app_metadata?.role==='client'&&u.app_metadata?.client===item.client&&!u.banned_until&&u.email).map((u:any)=>u.email));
    if(users.length<100)break;
   }
   recipients=[...new Set(recipients)];
  }
  if(!recipients.length)throw new Error('No assigned client email recipients');
  const label=item.client==='livencommunities'?'Liven Communities':item.client==='belmo'?'Belmo Group':item.client.replace(/[_-]/g,' ');
  const date=new Date(`${item.idea_date}T12:00:00Z`).toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  const link=`https://nickreativesocials.vercel.app/${item.direction==='admin'?'admin':'client'}/portal/${item.direction==='admin'?`?calendar_client=${encodeURIComponent(item.client)}`:''}#calendar`;
  const subject=`${label} — ${item.event_type==='INSERT'?'new':'updated'} calendar idea for ${date}`;
  const text=`${item.author_label} ${item.event_type==='INSERT'?'added':'updated'} an idea for ${label}.\n\nDate: ${date}\nIdea: ${item.description}\nNotes: ${item.notes||'No additional notes'}\n\nOpen the calendar: ${link}`;
  const html=`<div style="font-family:Helvetica,Arial,sans-serif;line-height:1.6;color:#542832;background:#f8f3ec;padding:28px;max-width:600px"><h1 style="font-family:Georgia,serif;font-weight:400">Nickreative</h1><h2>Content calendar idea</h2><p>${escapeHtml(item.author_label)} ${item.event_type==='INSERT'?'added':'updated'} an idea for ${escapeHtml(label)}.</p><p><strong>Date:</strong> ${escapeHtml(date)}</p><p><strong>Idea:</strong> ${escapeHtml(item.description)}</p><p><strong>Notes:</strong><br>${escapeHtml(item.notes||'No additional notes').replaceAll('\n','<br>')}</p><p><a style="color:#703a45" href="${link}">Open the shared calendar →</a></p></div>`;
  const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json','Idempotency-Key':`calendar-${item.id}`},body:JSON.stringify({from,to:recipients.length===1?recipients:[from],...(recipients.length>1?{bcc:recipients}:{}),subject,text,html})});
  if(!sent.ok)throw new Error(`Email provider rejected delivery (${sent.status})`);
  await db(`/rest/v1/calendar_notifications?id=eq.${item.id}`,'PATCH',{status:'sent',sent_at:new Date().toISOString(),last_error:null});
  return json({ok:true});
 }catch(error){
  const detail=error instanceof Error?error.message:'Email delivery failed';
  if(item){try{await db(`/rest/v1/calendar_notifications?id=eq.${item.id}&status=eq.sending`,'PATCH',{status:'failed',last_error:detail});}catch{}}
  console.error('Calendar email failed',detail);
  return json({error:detail},500);
 }
});
