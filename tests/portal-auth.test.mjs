import test from 'node:test';
import assert from 'node:assert/strict';
import {CLIENT_AUTH_KEY,LEGACY_AUTH_KEY,portalAuthOptions,migrateClientSession,requireHighlightAdminSession} from '../assets/js/portal-auth.js';
function storage(entries={}) { const values=new Map(Object.entries(entries));return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}; }
const session=role=>JSON.stringify({user:{app_metadata:{role}},access_token:'test-only'});
test('client login and portal share a separate key; Admin and portfolio retain their key',()=>{
 for(const path of ['/login','/login/','/client/login/','/client/portal/']) assert.equal(portalAuthOptions(path).auth.storageKey,CLIENT_AUTH_KEY);
 for(const path of ['/admin/login/','/admin/portal/','/admin/portfolio/','/']) assert.deepEqual(portalAuthOptions(path),{});
});
test('migrate only a legacy client session, preserving both existing accounts',()=>{
 const client=storage({[LEGACY_AUTH_KEY]:session('client')});migrateClientSession(client,'/login/');assert.equal(client.getItem(CLIENT_AUTH_KEY),session('client'));assert.equal(client.getItem(LEGACY_AUTH_KEY),session('client'));
 const admin=storage({[LEGACY_AUTH_KEY]:session('admin')});migrateClientSession(admin,'/client/portal/');assert.equal(admin.getItem(CLIENT_AUTH_KEY),null);
 const both=storage({[LEGACY_AUTH_KEY]:session('admin'),[CLIENT_AUTH_KEY]:session('client')});migrateClientSession(both,'/client/portal/');assert.equal(both.getItem(LEGACY_AUTH_KEY),session('admin'));assert.equal(both.getItem(CLIENT_AUTH_KEY),session('client'));
 const malformed=storage({[LEGACY_AUTH_KEY]:'invalid'});assert.doesNotThrow(()=>migrateClientSession(malformed,'/login/'));
});
test('save verifies current Admin identity before any media or metadata writes',async()=>{
 const initial={id:'admin-1',app_metadata:{role:'admin'}};
 const api=user=>({auth:{getUser:async()=>({data:{user},error:null})}});
 await requireHighlightAdminSession(api(initial),initial);
 for(const current of [null,{id:'client-1',app_metadata:{role:'client'}},{id:'other-admin',app_metadata:{role:'admin'}}]) await assert.rejects(requireHighlightAdminSession(api(current),initial),e=>e.code==='HIGHLIGHT_AUTH');
});
