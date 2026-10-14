import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const template=stripTypeScriptTypes(read('../supabase/functions/feedback-receipt-email/template.ts'));
const {renderReceipt}=await import(`data:text/javascript;base64,${Buffer.from(template).toString('base64')}`);
const sample={id:'00000000-0000-0000-0000-000000000011',status:'pending',attempts:0,post_id:'00000000-0000-0000-0000-000000000012',slot:3,client:'livencommunities',platform:'instagram',caption:'Full post caption\nSecond paragraph',feedback:'Please change <this> & add photos.',reviewer_name:'Cristina',recipient_email:'cristina@example.com',submitted_at:'2026-10-14T03:00:00Z',media_urls:['https://tgvtmwdmwnzwqjzqxbkj.supabase.co/storage/v1/object/public/social-media/test.jpg','javascript:alert(1)']};
const rendered=renderReceipt(sample);assert.equal(rendered.subject,'Receipt for feedback on Post 003');assert.match(rendered.text,/Cristina/);assert.match(rendered.text,/1:00 pm/);assert.match(rendered.text,/Brisbane time, AEST/);assert.match(rendered.html,/&lt;this&gt; &amp;/);assert.ok(!rendered.html.includes('javascript:'));assert.match(rendered.text,/Second paragraph/);assert.match(rendered.html,/post=00000000/);
const source=stripTypeScriptTypes(read('../supabase/functions/feedback-receipt-email/index.ts')).replace(/^import .*?;\n/,'');
async function run({item=sample,secret='test',fail=false}={}){
 let handler;const emails=[],writes=[];
 const fetch=async(url,options={})=>{
  if(url.includes('api.resend.com')){emails.push({body:JSON.parse(options.body),headers:options.headers});return Response.json({id:'email'},{status:fail?500:200});}
  if(options.method==='PATCH'){writes.push(JSON.parse(options.body));return Response.json([{...item,...writes.at(-1)}]);}
  return Response.json([item]);
 };
 const env={WEBHOOK_SECRET:'test',SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test',RESEND_API_KEY:'test',FROM_EMAIL:'studio@example.com'};
 vm.runInNewContext(source,{Deno:{env:{get:n=>env[n]},serve:h=>handler=h},renderReceipt,fetch,Response,Date,console:{error(){}}});
 const response=await handler(new Request('https://test',{method:'POST',headers:{'x-webhook-secret':secret},body:JSON.stringify({notification_id:sample.id})}));
 return {response,emails,writes};
}
let r=await run();assert.equal(r.response.status,200);assert.deepEqual(r.emails[0].body.to,['cristina@example.com']);assert.equal(r.emails[0].body.reply_to,'nicholasgoodridge@hotmail.com');assert.equal(r.emails[0].body.subject,'Receipt for feedback on Post 003');assert.equal(r.writes.at(-1).status,'sent');
r=await run({secret:'wrong'});assert.equal(r.response.status,401);assert.equal(r.emails.length,0);
r=await run({item:{...sample,status:'sent'}});assert.equal(r.emails.length,0);
r=await run({fail:true});assert.equal(r.response.status,500);assert.equal(r.writes.at(-1).status,'failed');
const adminSource=stripTypeScriptTypes(read('../supabase/functions/post-review-email/index.ts'));
let handler,calls=0;vm.runInNewContext(adminSource,{Deno:{env:{get:n=>({WEBHOOK_SECRET:'test',RESEND_API_KEY:'test',FROM_EMAIL:'studio@example.com',NOTIFY_TO_EMAIL:'admin@example.com'})[n]},serve:h=>handler=h},Response,console,fetch:async()=>{calls++;return Response.json({id:'email'});}});
const old={review_status:'changes_requested',review_feedback:'Original',reviewed_at:'2026-10-14T03:00:00Z',slot:3};
await handler(new Request('https://test',{method:'POST',headers:{'x-webhook-secret':'test'},body:JSON.stringify({type:'UPDATE',record:{...old,review_feedback:'Updated',reviewed_at:'2026-10-14T03:01:00Z'},old_record:old})}));assert.equal(calls,1);
await handler(new Request('https://test',{method:'POST',headers:{'x-webhook-secret':'test'},body:JSON.stringify({type:'UPDATE',record:old,old_record:old})}));assert.equal(calls,1);
console.log('PASS: subject, connected receipt copy, saved feedback/post/name/AEST time, safe media links, submitter-only recipient, Hotmail Reply-To, authentication, retries and updated-feedback admin notices.');
