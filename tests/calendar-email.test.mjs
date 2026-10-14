import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const source=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/calendar-idea-email/index.ts',import.meta.url),'utf8'));
const id='00000000-0000-0000-0000-000000000010';
const makeItem=()=>({id,status:'pending',attempts:0,client:'livencommunities',direction:'admin',idea_date:'2026-10-14',description:'<script>test</script>',notes:'Notes',author_label:'A & B',event_type:'INSERT'});
async function run({item=makeItem(),fail=false,secret='test-secret',config=true}={}){
 let handler;const emails=[],writes=[];
 const env={WEBHOOK_SECRET:'test-secret',SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service',RESEND_API_KEY:config?'test-resend':undefined,FROM_EMAIL:'studio@example.com',NOTIFY_TO_EMAIL:'admin@example.com'};
 const fetch=async(url,options={})=>{
  if(url.includes('api.resend.com')){emails.push({payload:JSON.parse(options.body),headers:options.headers});return Response.json({id:'sent'}, {status:fail?500:200});}
  if(url.includes('/auth/'))return Response.json({users:[{email:'client@example.com',app_metadata:{role:'client',client:'livencommunities'}},{email:'wrong@example.com',app_metadata:{role:'client',client:'pocky'},user_metadata:{client:'livencommunities'}}]});
  if(options.method==='PATCH'){writes.push(JSON.parse(options.body));return Response.json([{...item,...writes.at(-1)}]);}
  return Response.json([item]);
 };
 vm.runInNewContext(source,{Deno:{env:{get:n=>env[n]},serve:h=>handler=h},fetch,Response,console:{error(){}},Date,Set});
 const response=await handler(new Request('https://test/email',{method:'POST',headers:{'x-webhook-secret':secret,'Content-Type':'application/json'},body:JSON.stringify({notification_id:id})}));
 return {status:response.status,emails,writes};
}
let r=await run();assert.equal(r.status,200);assert.deepEqual(r.emails[0].payload.to,['admin@example.com']);assert.match(r.emails[0].payload.html,/&lt;script&gt;/);assert.equal(r.emails[0].headers['Idempotency-Key'],`calendar-${id}`);assert.equal(r.writes.at(-1).status,'sent');
r=await run({secret:'wrong'});assert.equal(r.status,401);assert.equal(r.emails.length,0);
r=await run({config:false});assert.equal(r.status,503);
r=await run({item:{...makeItem(),status:'sent'}});assert.equal(r.emails.length,0);
r=await run({fail:true});assert.equal(r.status,500);assert.equal(r.writes.at(-1).status,'failed');
r=await run({item:{...makeItem(),direction:'client'}});assert.deepEqual(r.emails[0].payload.to,['client@example.com']);
console.log('PASS: email authentication, protected recipients, HTML escaping, idempotency, sent-job skip and failure retention.');
