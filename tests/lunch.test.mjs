import {createHash} from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import * as webpush from '@block65/webcrypto-web-push';
import assert from 'node:assert/strict';
import {test,beforeEach} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

let now='2026-09-29T10:00:00Z';
class Clock extends Date { constructor(...args){super(...(args.length?args:[now]));} static now(){return new Date(now).getTime();} }
let sqlite;let fakeFetch=()=>{throw Error("Network is forbidden in tests");};
const env={ADMIN_EMAILS:'mjo@din-energi.dk',DB:{
 prepare(sql){let values=[];return {
  bind(...args){values=args;return this;},
  async first(){return sqlite.prepare(sql).get(...values)||null;},
  async all(){return {results:sqlite.prepare(sql).all(...values)};},
  async run(){const result=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}};}
 };},
 async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}
}};
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);
 const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,require:(name)=>name==='cloudflare:workers'?{env}:name==='bcryptjs'?bcrypt:name==='@block65/webcrypto-web-push'?webpush:load(path.resolve(path.dirname(file),name+'.ts')),Date:Clock,Intl,Response,Request,URL,crypto,TextEncoder,Uint8Array,atob,AbortSignal,console,fetch:(...args)=>fakeFetch(...args)});
 return exports;
}
const lunch=load('app/api/lunch/route.ts');const menu=load('app/api/menu/route.ts');const server=load('lib/server.ts');const dates=load('lib/lunch.ts');const reminders=load('app/api/reminders/route.ts');
function request(body,email='employee@example.com',origin='https://lunch.test'){
 const headers={'content-type':'application/json',origin};
 if(email){
 const token=createHash('sha256').update('test-session-'+email).digest('hex');
 const accountName=email==='employee@example.com'?'Test Person':email==='mjo@din-energi.dk'?'Martin Johansen':email.split('@')[0];
 sqlite.prepare("INSERT INTO accounts(email,name,role,password_hash,reminders) VALUES(?,?,?,'test-hash',0) ON CONFLICT(email) DO NOTHING").run(email,accountName,email==='mjo@din-energi.dk'?'admin':'employee');
 sqlite.prepare("INSERT INTO sessions(hash,email,expires,auth_method) VALUES(?,?,?,'password') ON CONFLICT(hash) DO UPDATE SET expires=excluded.expires").run(createHash('sha256').update(token).digest('hex'),email,Date.now()+86400000*500);
 headers.cookie='suf_password_session='+token;
}
 return new Request('https://lunch.test/api/lunch?date=2026-10-02',{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})});
}
const answer={date:'2026-10-02',name:'Test Person',phone:'12 34 56 78',meal:'meal-1',action:'join'};
beforeEach(()=>{fakeFetch=()=>{throw Error('Network is forbidden in tests');};delete env.REMINDER_SERVICE_TOKEN_HASH;sqlite?.close();sqlite=new DatabaseSync(':memory:');now='2026-09-29T10:00:00Z';for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+f,'utf8'));sqlite.prepare('INSERT INTO dishes(id,date,name,vegetarian,active) VALUES(?,?,?,?,?)').run('meal-1','2026-10-02','Testret',1,1);sqlite.prepare("INSERT INTO menus(date,source,released) VALUES('2026-10-02','',1)").run();});


test('deadline is Wednesday noon in both Danish winter and summer time',()=>{
 for(const [friday,before,closed] of [['2026-10-02','2026-09-30T09:59:59Z','2026-09-30T10:00:00Z'],['2026-10-30','2026-10-28T10:59:59Z','2026-10-28T11:00:00Z'],['2026-04-03','2026-04-01T09:59:59Z','2026-04-01T10:00:00Z']]){
 assert.equal(dates.isClosed(friday,new Date(before)),false);assert.equal(dates.isClosed(friday,new Date(closed)),true);}
});
test('anonymous writes and cross-origin writes are rejected',async()=>{
 assert.equal((await lunch.POST(request(answer,null))).status,401);assert.equal((await lunch.POST(request(answer,'employee@example.com','https://other.test'))).status,403);
});
test('join persists without collecting a phone number',async()=>{
 assert.equal((await lunch.POST(request({...answer,name:'Navn fra formular må ikke bruges'}))).status,200);
 
 const data=await (await lunch.GET(request())).json();assert.equal(data.registrations.length,1);assert.equal(data.registrations[0].name,'Test Person');assert.equal(data.mine.status,'attending');assert.equal(JSON.stringify(data).includes('+4512345678'),false);
});
test('decline replaces a join without duplicates and can change back',async()=>{
 await lunch.POST(request(answer));await lunch.POST(request({...answer,action:'decline'}));await lunch.POST(request({...answer,action:'decline'}));
 let data=await (await lunch.GET(request())).json();assert.equal(data.registrations.length,0);assert.equal(data.mine.status,'declined');assert.equal(data.declined.length,0);
 data=await (await lunch.GET(request(null,'mjo@din-energi.dk'))).json();assert.equal(data.declined.length,1);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM registrations').get().n,1);
 await lunch.POST(request(answer));data=await (await lunch.GET(request())).json();assert.equal(data.registrations.length,1);assert.equal(data.mine.status,'attending');
});
test('decline works without a menu, join requires an active dish for that Friday',async()=>{
 sqlite.exec('DELETE FROM dishes');assert.equal((await lunch.POST(request(answer))).status,409);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM registrations').get().n,0);
 assert.equal((await lunch.POST(request({...answer,action:'decline',meal:''}))).status,200);
});
test('failed dish validation does not change the existing profile or answer',async()=>{

 await lunch.POST(request(answer));assert.equal((await lunch.POST(request({...answer,name:'Changed',phone:'87654321',meal:'missing'}))).status,409);
 assert.equal(sqlite.prepare('SELECT meal FROM registrations').get().meal,'meal-1');
});
test('server enforces deadline on join and decline',async()=>{
 now='2026-09-30T10:00:00Z';for(const action of ['join','decline'])assert.equal((await lunch.POST(request({...answer,action}))).status,409);
});
test('only configured admin can edit dishes; registered dishes are protected',async()=>{
 const dish={date:'2026-10-02',name:'Ny ret',vegetarian:false,action:'save'};
 assert.equal((await menu.POST(request(dish))).status,403);assert.equal((await menu.POST(request(dish,'mjo@din-energi.dk'))).status,200);
 await lunch.POST(request(answer));assert.equal((await menu.POST(request({...dish,id:'meal-1',action:'remove'},'mjo@din-energi.dk'))).status,409);
});
test('account defaults never grant admin and reminders cannot send',async()=>{
 assert.equal((await server.user(request())).admin,false);assert.equal((await server.user(request(null,'mjo@din-energi.dk'))).admin,true);assert.equal((await reminders.POST()).status,410);
});

test('platform headers alone cannot bypass password login',async()=>{
 const req=new Request('https://lunch.test/api/lunch',{headers:{'oai-authenticated-user-id':'local_seedy','oai-authenticated-user-email':'mjo@din-energi.dk'}});
 assert.equal(await server.user(req),null);assert.equal((await lunch.GET(req)).status,401);
});
test('another employee cannot overwrite an existing answer',async()=>{
 await lunch.POST(request(answer));await lunch.POST(request({...answer,name:'Other Person',action:'decline'},'other@example.com'));
 const data=await (await lunch.GET(request())).json();assert.equal(data.mine.status,'attending');assert.equal(data.mine.name,'Test Person');assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM registrations').get().n,2);
});
test('lunch accepts a choice without a phone number',async()=>{

 const {phone:ignored,...withoutPhone}=answer;assert.equal((await lunch.POST(request(withoutPhone))).status,200);
 assert.equal((await lunch.POST(request({...answer,phone:'87654321'}))).status,200);
 
});

test('one supplier is saved for the Friday and survives dish edits',async()=>{
 const source={date:'2026-10-02',action:'save-source',source:'  Fælles køkken  '};
 assert.equal((await menu.POST(request(source))).status,403);
 assert.equal((await menu.POST(request(source,'mjo@din-energi.dk'))).status,200);
 const dish={date:source.date,name:'Ny ret',vegetarian:false,action:'save'};
 await menu.POST(request(dish,'mjo@din-energi.dk'));
 await menu.POST(request({...dish,id:'meal-1'},'mjo@din-energi.dk'));
 let data=await (await lunch.GET(request())).json();assert.equal(data.menuSource,'Fælles køkken');assert.equal(data.menu.length,2);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM menus').get().n,1);
 assert.equal((await menu.POST(request({...source,source:'x'.repeat(161)},'mjo@din-energi.dk'))).status,400);
 await menu.POST(request({...source,source:''},'mjo@din-energi.dk'));
 data=await (await lunch.GET(request())).json();assert.equal(data.menuSource,'');
});
test('existing dish supplier is preserved as the shared default',async()=>{
 sqlite.exec('DELETE FROM menus');
 sqlite.prepare('UPDATE dishes SET source=?').run('Tidligere køkken');
 let data=await (await lunch.GET(request(null,'mjo@din-energi.dk'))).json();assert.equal(data.menuSource,'Tidligere køkken');
 await menu.POST(request({date:'2026-10-02',action:'save-source',source:''},'mjo@din-energi.dk'));
 data=await (await lunch.GET(request(null,'mjo@din-energi.dk'))).json();assert.equal(data.menuSource,'');
});

test('dish photo is protected, persisted, kept on name edits and removable',async()=>{
 const photos=load('app/api/dish-photo/route.ts');
 const photo='data:image/jpeg;base64,'+Buffer.from([255,216,255,224,0,2,255,217]).toString('base64');
 const dish={date:'2026-10-02',id:'meal-1',name:'Ret med foto',vegetarian:false,photo,action:'save'};
 assert.equal((await menu.POST(request(dish))).status,403);
 assert.equal((await menu.POST(request(dish,'mjo@din-energi.dk'))).status,200);
 const data=await (await lunch.GET(request())).json();assert.equal(data.menu[0].hasPhoto,1);assert.equal(data.menu[0].photoVersion,1);assert.equal(JSON.stringify(data).includes('base64'),false);
 const imageRequest=(email)=>new Request('https://lunch.test/api/dish-photo?id=meal-1',{headers:request(null,email).headers});
 assert.equal((await photos.GET(imageRequest(null))).status,401);
 const image=await photos.GET(imageRequest('employee@example.com'));assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/jpeg');assert.equal((await image.arrayBuffer()).byteLength,8);
 const {photo:ignored,...nameEdit}=dish;await menu.POST(request({...nameEdit,name:'Nyt navn'},'mjo@din-energi.dk'));
 assert.equal(sqlite.prepare('SELECT photo FROM dishes WHERE id=?').get('meal-1').photo,photo);
 await menu.POST(request({...dish,photo:''},'mjo@din-energi.dk'));
 assert.equal((await photos.GET(imageRequest('employee@example.com'))).status,404);
});
test('invalid and oversized photos are rejected without replacing the dish',async()=>{
 const dish={date:'2026-10-02',id:'meal-1',name:'Ret',vegetarian:false,action:'save'};
 for(const photo of ['data:image/svg+xml,<svg/>','data:image/jpeg;base64,bm90LWEtcGhvdG8=',42,'x'.repeat(280001)]){
 assert.equal((await menu.POST(request({...dish,photo},'mjo@din-energi.dk'))).status,400);
 }
 assert.equal(sqlite.prepare('SELECT name FROM dishes WHERE id=?').get('meal-1').name,'Testret');
});

test('saved choices cannot be changed or declined at or after Wednesday noon',async()=>{
 now='2026-09-30T09:59:59Z';
 assert.equal((await lunch.POST(request(answer))).status,200);
 for(const instant of ['2026-09-30T10:00:00Z','2026-09-30T10:00:01Z','2026-10-01T08:00:00Z']){
  now=instant;
  for(const action of ['join','decline']){
   assert.equal((await lunch.POST(request({...answer,name:'Changed after deadline',action}))).status,409);
  }
  const saved=sqlite.prepare('SELECT name,meal,status FROM registrations').get();
  assert.equal(saved.name,answer.name);assert.equal(saved.meal,answer.meal);assert.equal(saved.status,'attending');
 }
});

test('planning shows four open Fridays after Wednesday noon and across year end',()=>{
 assert.equal(dates.openFridays(new Date('2026-10-01T08:00:00Z')).join(','),'2026-10-09,2026-10-16,2026-10-23,2026-10-30');
 assert.equal(dates.openFridays(new Date('2026-09-30T09:59:59Z'))[0],'2026-10-02');
 assert.equal(dates.openFridays(new Date('2026-12-30T12:00:00Z')).join(','),'2027-01-08,2027-01-15,2027-01-22,2027-01-29');
});
test('fourth open week accepts its own menu and registration without changing another week',async()=>{
 now='2026-10-01T08:00:00Z';
 const date='2026-10-30';const dish={date,name:'Fjerde uges ret',vegetarian:false,action:'save'};
 assert.equal((await menu.POST(request(dish,'mjo@din-energi.dk'))).status,200);
 assert.equal((await menu.POST(request({date,action:'save-source',source:'Uge fire køkken'},'mjo@din-energi.dk'))).status,200);
 const adminRead=new Request('https://lunch.test/api/lunch?date='+date,{headers:request(null,'mjo@din-energi.dk').headers});
 const draft=await (await lunch.GET(adminRead)).json();assert.equal(draft.menu.length,1);assert.equal(draft.released,false);
 assert.equal((await menu.POST(request({date,action:'release'},'mjo@din-energi.dk'))).status,200);
 const read=new Request('https://lunch.test/api/lunch?date='+date,{headers:request().headers});
 const data=await (await lunch.GET(read)).json();assert.equal(data.menu.length,1);assert.equal(data.menu[0].name,dish.name);assert.equal(data.menuSource,'Uge fire køkken');assert.equal(data.released,true);
 assert.equal((await lunch.POST(request({...answer,date,meal:data.menu[0].id}))).status,200);
 assert.equal(sqlite.prepare('SELECT name FROM dishes WHERE id=?').get('meal-1').name,'Testret');
 assert.equal((await menu.POST(request({...dish,date:'2026-11-06'},'mjo@din-energi.dk'))).status,400);
});

const auth=load('app/api/auth/route.ts');
const accounts=load('app/api/accounts/route.ts');
test('only admins create accounts and first login sets the password with a one-time code',async()=>{
 const body={action:'create',name:'New admin',email:'new@example.com',role:'admin'};
 assert.equal((await accounts.GET(request(null,null))).status,403);
 assert.equal((await accounts.POST(request(body))).status,403);
 const created=await accounts.POST(request(body,'mjo@din-energi.dk'));assert.equal(created.status,200);
 const activationCode=(await created.json()).activationCode;assert.match(activationCode,/^[A-F0-9]{12}$/);
 let row=sqlite.prepare('SELECT * FROM accounts WHERE email=?').get(body.email);
 assert.equal(row.role,'admin');assert.equal(row.password_hash,'');
 const stored=sqlite.prepare('SELECT hash FROM login_tokens WHERE email=?').get(body.email);assert.notEqual(stored.hash,activationCode);assert.equal(stored.hash,await server.hash(activationCode));
 const listed=await (await accounts.GET(request(null,'mjo@din-energi.dk'))).text();assert.ok(!listed.includes(activationCode));
 assert.equal((await accounts.POST(request({...body,role:'employee'},'mjo@din-energi.dk'))).status,409);
 assert.equal(sqlite.prepare('SELECT role FROM accounts WHERE email=?').get(body.email).role,'admin');
 assert.equal((await auth.POST(request({action:'setup',email:body.email,code:'000000000000',password:'Test12'},null))).status,400);
 const setup=await auth.POST(request({action:'setup',email:body.email,code:activationCode.toLowerCase(),password:'Test12'},null));assert.equal(setup.status,200);assert.ok(setup.headers.get('set-cookie').includes('HttpOnly'));
 row=sqlite.prepare('SELECT * FROM accounts WHERE email=?').get(body.email);assert.ok(await bcrypt.compare('Test12',row.password_hash));assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM login_tokens WHERE email=?').get(body.email).n,0);
 assert.equal((await auth.POST(request({action:'setup',email:body.email,code:activationCode,password:'Other12'},null))).status,400);
});
test('password login uses database role and logout revokes session',async()=>{
 const password='Fixture-password-123';
 sqlite.prepare("INSERT INTO accounts(email,name,role,password_hash) VALUES(?,'Login test',?,?)").run('login@example.com','employee',await bcrypt.hash(password,4));
 assert.equal((await auth.POST(request({action:'login',email:'login@example.com',password:'wrong'},null))).status,401);
 const login=await auth.POST(request({action:'login',email:'login@example.com',password,role:'admin'},null));assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie');assert.ok(cookie.includes('HttpOnly'));assert.ok(cookie.includes('Secure'));
 const req=new Request('https://lunch.test/api/auth',{headers:{cookie}});assert.equal((await server.user(req)).admin,false);
 const out=new Request(req.url,{method:'POST',headers:{cookie,origin:'https://lunch.test'},body:JSON.stringify({action:'logout'})});assert.equal((await auth.POST(out)).status,200);assert.equal(await server.user(req),null);
});
test('administrator can reset an employee password and receives a new one-time code',async()=>{
 const email='forgotten@example.com';sqlite.prepare("INSERT INTO accounts(email,name,role,password_hash) VALUES(?,'Forgotten','employee',?)").run(email,await bcrypt.hash('OldPass',4));
 sqlite.prepare("INSERT INTO sessions(hash,email,expires,auth_method) VALUES('old-session',?,?, 'password')").run(email,Clock.now()+60000);
 const reset=await accounts.POST(request({action:'reset-access',email},'mjo@din-energi.dk'));assert.equal(reset.status,200);
 const code=(await reset.json()).activationCode;assert.match(code,/^[A-F0-9]{12}$/);assert.equal(sqlite.prepare('SELECT password_hash FROM accounts WHERE email=?').get(email).password_hash,'');assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sessions WHERE email=?').get(email).n,0);
 assert.equal((await auth.POST(request({action:'setup',email,code,password:'NewPass'},null))).status,200);
 const lastAdmin=await accounts.POST(request({action:'reset-access',email:'mjo@din-energi.dk'},'mjo@din-energi.dk'));assert.equal(lastAdmin.status,409);
});
test('reset tokens expire, are single use and revoke existing sessions',async()=>{
 request(null,'reset@example.com');const token='a'.repeat(64),hashed=await server.hash(token);
 sqlite.prepare('INSERT INTO password_resets(hash,email,expires) VALUES(?,?,?)').run(hashed,'reset@example.com',Clock.now()+60000);
 const body={action:'reset',token,password:'New123'};
 assert.equal((await auth.POST(request({...body,password:'12345'},null))).status,400);
 assert.equal((await auth.POST(request(body,null))).status,200);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sessions WHERE email=?').get('reset@example.com').n,0);
 assert.ok(await bcrypt.compare(body.password,sqlite.prepare('SELECT password_hash FROM accounts WHERE email=?').get('reset@example.com').password_hash));
 assert.equal((await auth.POST(request(body,null))).status,400);
 sqlite.prepare('INSERT INTO password_resets(hash,email,expires) VALUES(?,?,?)').run(hashed,'reset@example.com',Clock.now()-1);
 assert.equal((await auth.POST(request(body,null))).status,400);
});
test('legacy login and missing mail service never bypass authentication',async()=>{
 assert.equal((await auth.POST(request({action:'verify',token:'x'},null))).status,400);
 assert.equal((await auth.POST(request({action:'forgot',email:'mjo@din-energi.dk'},null))).status,503);
 assert.equal(await server.user(new Request('https://lunch.test',{headers:{cookie:'suf_session='+'a'.repeat(64)}})),null);
});


test('only admins remove accounts; removal revokes access but retains lunch choices',async()=>{
 await lunch.POST(request(answer));
 const victim=request(null);const body={action:'remove',email:'employee@example.com'};
 sqlite.prepare('INSERT INTO password_resets(hash,email,expires) VALUES(?,?,?)').run('reset-fixture',body.email,Clock.now()+60000);
 assert.equal((await accounts.POST(request(body,null))).status,403);
 assert.equal((await accounts.POST(request(body))).status,403);
 assert.equal((await accounts.POST(request(body,'mjo@din-energi.dk','https://other.test'))).status,403);
 assert.equal((await accounts.POST(request(body,'mjo@din-energi.dk'))).status,200);
 assert.equal(await server.user(victim),null);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM accounts WHERE email=?').get(body.email).n,0);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM password_resets WHERE email=?').get(body.email).n,0);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sessions WHERE email=?').get(body.email).n,0);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM registrations').get().n,1);
});
test('an administrator can be removed but the last usable administrator is protected',async()=>{
 const admin=request(null,'mjo@din-energi.dk');
 const body={action:'remove',email:'mjo@din-energi.dk'};
 assert.equal((await accounts.POST(request(body,body.email))).status,409);
 sqlite.prepare("INSERT INTO accounts(email,name,role,password_hash) VALUES('second@example.com','Second','admin','')").run();
 assert.equal((await accounts.POST(request(body,body.email))).status,409);
 sqlite.prepare("UPDATE accounts SET password_hash='test-hash' WHERE email='second@example.com'").run();
 assert.equal((await accounts.POST(request(body,body.email))).status,200);
 assert.equal(await server.user(admin),null);
 assert.equal((await accounts.POST(request({action:'remove',email:'second@example.com'},'second@example.com'))).status,409);
});
const push=load('lib/push.ts'),pushApi=load('app/api/push/route.ts'),pushJob=load('app/api/push-reminders/route.ts');
const vapid=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const vapidPrivate=await crypto.subtle.exportKey('jwk',vapid.privateKey);
env.VAPID_PUBLIC_KEY=Buffer.from(await crypto.subtle.exportKey('raw',vapid.publicKey)).toString('base64url');env.VAPID_PRIVATE_KEY=vapidPrivate.d;env.VAPID_SUBJECT='mailto:test@example.com';
async function subscription(id){const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);return {endpoint:'https://fcm.googleapis.com/fcm/send/'+id,keys:{p256dh:Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('base64url'),auth:Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url')}};}
test('push subscription requires login and origin; rejects arbitrary outbound endpoints',async()=>{
 const sub=await subscription('test');
 assert.equal((await pushApi.POST(request({action:'subscribe',subscription:sub},null))).status,401);
 assert.equal((await pushApi.POST(request({action:'subscribe',subscription:sub},'employee@example.com','https://other.test'))).status,403);
 for(const endpoint of ['http://fcm.googleapis.com/a','https://127.0.0.1/a','https://fcm.googleapis.com.evil.test/a','https://user@fcm.googleapis.com/a'])assert.equal((await pushApi.POST(request({action:'subscribe',subscription:{...sub,endpoint}}))).status,400);
 assert.equal((await pushApi.POST(request({action:'subscribe',subscription:sub}))).status,200);
 assert.equal((await pushApi.POST(request({action:'remove',endpoint:sub.endpoint},'other@example.com'))).status,200);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n,1);
 assert.equal((await pushApi.POST(request({action:'remove',endpoint:sub.endpoint}))).status,200);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n,0);
});
test('push reminder follows Copenhagen summer/winter time and closes at noon',()=>{
 assert.equal(push.reminderFriday(new Date('2026-10-07T07:00:00Z')),'2026-10-09');
 assert.equal(push.reminderFriday(new Date('2026-10-28T08:00:00Z')),'2026-10-30');
 for(const time of ['2026-10-07T06:59:59Z','2026-10-07T08:00:00Z','2026-10-06T07:00:00Z'])assert.equal(push.reminderFriday(new Date(time)),null);
});
test('reminders only reach subscribed unanswered accounts, send encrypted payload once and expire dead endpoints',async()=>{
 now='2026-09-30T07:00:00Z';
 for(const email of ['waiting@example.com','joined@example.com','declined@example.com','dead@example.com']){
  assert.equal((await pushApi.POST(request({action:'subscribe',subscription:await subscription(email)},email))).status,200);
 }
 await lunch.POST(request(answer,'joined@example.com'));await lunch.POST(request({...answer,action:'decline'},'declined@example.com'));
 const sent=[];fakeFetch=async(url,options)=>{sent.push(url);assert.equal(options.redirect,'manual');assert.ok(options.body);return new Response(null,{status:url.includes('dead@')?410:201});};
 const result=await push.sendReminders();assert.equal(result.sent,1);assert.equal(result.failed,1);assert.equal(sent.length,2);assert.ok(sent.every(u=>!u.includes('joined@')&&!u.includes('declined@')));
 assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE email='dead@example.com'").get().n,0);
 assert.equal((await push.sendReminders()).sent,0);assert.equal(sent.length,2);
});
test('scheduled endpoint rejects unauthenticated jobs and supports a no-send readiness check',async()=>{
 assert.equal((await pushJob.POST(request({},null))).status,403);
 env.REMINDER_SERVICE_TOKEN_HASH=await server.hash('fixture-job-secret');
 const req=new Request('https://lunch.test/api/push-reminders?check=1',{method:'POST',headers:{'X-SUF-Schedule-Token':'fixture-job-secret'}});
 const result=await pushJob.POST(req);assert.equal(result.status,200);assert.equal((await result.json()).ready,true);
});
test('draft menus stay hidden until an admin releases them and release sends one notification per device',async()=>{
 const date='2026-10-09',dishId='release-meal';
 assert.equal((await menu.POST(request({date,name:'Frigivet ret',vegetarian:false,action:'save'},'mjo@din-energi.dk'))).status,200);
 assert.equal((await menu.POST(request({date,source:'Testkøkken',action:'save-source'},'mjo@din-energi.dk'))).status,200);
 for(const email of ['first@example.com','second@example.com'])assert.equal((await pushApi.POST(request({action:'subscribe',subscription:await subscription(email)},email))).status,200);
 const employeeRead=new Request('https://lunch.test/api/lunch?date='+date,{headers:request().headers});
 let data=await (await lunch.GET(employeeRead)).json();assert.equal(data.released,false);assert.equal(data.menu.length,0);assert.equal(data.menuSource,'');
 assert.equal((await lunch.POST(request({...answer,date,meal:dishId}))).status,409);
 const delivered=[];fakeFetch=async(url,options)=>{delivered.push({url,body:options.body});return new Response(null,{status:201});};
 const release=await menu.POST(request({date,action:'release'},'mjo@din-energi.dk'));assert.equal(release.status,200);assert.equal((await release.json()).notifications.sent,2);
 data=await (await lunch.GET(employeeRead)).json();assert.equal(data.released,true);assert.equal(data.menu[0].name,'Frigivet ret');assert.equal(data.menuSource,'Testkøkken');
 const again=await menu.POST(request({date,action:'release'},'mjo@din-energi.dk'));assert.equal((await again.json()).alreadyReleased,true);assert.equal(delivered.length,2);
 const resend=await menu.POST(request({date,action:'resend'},'mjo@din-energi.dk'));assert.equal((await resend.json()).notifications.sent,2);assert.equal(delivered.length,4);
 const recall=await menu.POST(request({date,action:'recall'},'mjo@din-energi.dk'));assert.equal(recall.status,200);assert.equal((await recall.json()).recalled,true);
 data=await (await lunch.GET(employeeRead)).json();assert.equal(data.released,false);assert.equal(data.menu.length,0);
 const rerelease=await menu.POST(request({date,action:'release'},'mjo@din-energi.dk'));assert.equal((await rerelease.json()).notifications.sent,2);assert.equal(delivered.length,6);
 for(const id of ['admin-phone','admin-desktop'])assert.equal((await pushApi.POST(request({action:'subscribe',subscription:await subscription(id)},'mjo@din-energi.dk'))).status,200);
 const testReminder=await menu.POST(request({date,action:'test-reminder'},'mjo@din-energi.dk'));assert.equal((await testReminder.json()).notifications.sent,2);assert.equal(delivered.length,8);
});
