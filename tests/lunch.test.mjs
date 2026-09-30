import assert from 'node:assert/strict';
import {test,beforeEach} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

let now='2026-09-29T10:00:00Z';
class Clock extends Date { constructor(...args){super(...(args.length?args:[now]));} static now(){return new Date(now).getTime();} }
let sqlite;
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
 vm.runInNewContext(code,{exports,require:(name)=>name==='cloudflare:workers'?{env}:load(path.resolve(path.dirname(file),name+'.ts')),Date:Clock,Intl,Response,Request,URL,crypto,TextEncoder,Uint8Array,atob,console,fetch:()=>{throw Error('Network is forbidden in tests');}});
 return exports;
}
const lunch=load('app/api/lunch/route.ts');const menu=load('app/api/menu/route.ts');const server=load('lib/server.ts');const dates=load('lib/lunch.ts');const phone=load('lib/phone.ts');const reminders=load('app/api/reminders/route.ts');
function request(body,email='employee@example.com',origin='https://lunch.test'){
 const headers={'content-type':'application/json',origin};
 if(email){headers['oai-authenticated-user-id']='test-'+email;headers['oai-authenticated-user-email']=email;}
 return new Request('https://lunch.test/api/lunch?date=2026-10-02',{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})});
}
const answer={date:'2026-10-02',name:'Test Person',phone:'12 34 56 78',meal:'meal-1',action:'join'};
beforeEach(()=>{sqlite?.close();sqlite=new DatabaseSync(':memory:');now='2026-09-29T10:00:00Z';for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+f,'utf8'));sqlite.prepare('INSERT INTO dishes(id,date,name,vegetarian,active) VALUES(?,?,?,?,?)').run('meal-1','2026-10-02','Testret',1,1);});

test('Danish and international phone numbers are validated',()=>{
 assert.equal(phone.normalizePhone('12 34 56 78'),'+4512345678');assert.equal(phone.normalizePhone('0045 12345678'),'+4512345678');assert.equal(phone.normalizePhone('+49 151 12345678'),'+4915112345678');
 for(const invalid of ['',null,'123','+451234567','abc','+000000000'])assert.equal(phone.normalizePhone(invalid),null);
});
test('deadline is Wednesday noon in both Danish winter and summer time',()=>{
 for(const [friday,before,closed] of [['2026-10-02','2026-09-30T09:59:59Z','2026-09-30T10:00:00Z'],['2026-10-30','2026-10-28T10:59:59Z','2026-10-28T11:00:00Z'],['2026-04-03','2026-04-01T09:59:59Z','2026-04-01T10:00:00Z']]){
 assert.equal(dates.isClosed(friday,new Date(before)),false);assert.equal(dates.isClosed(friday,new Date(closed)),true);}
});
test('anonymous writes and cross-origin writes are rejected',async()=>{
 assert.equal((await lunch.POST(request(answer,null))).status,401);assert.equal((await lunch.POST(request(answer,'employee@example.com','https://other.test'))).status,403);
});
test('join persists a normalized phone and excludes it from shared data',async()=>{
 assert.equal((await lunch.POST(request(answer))).status,200);
 assert.equal(sqlite.prepare('SELECT phone FROM accounts').get().phone,'+4512345678');
 const data=await (await lunch.GET(request())).json();assert.equal(data.registrations.length,1);assert.equal(data.mine.status,'attending');assert.equal(JSON.stringify(data).includes('+4512345678'),false);
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
 assert.equal(sqlite.prepare('SELECT phone FROM accounts').get().phone,'+4512345678');assert.equal(sqlite.prepare('SELECT meal FROM registrations').get().meal,'meal-1');
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

test('a stable platform identity retains its answer after an email change',async()=>{
 await lunch.POST(request(answer));
 const changed=request(null,'renamed@example.com');changed.headers.set('oai-authenticated-user-id','test-employee@example.com');
 const data=await (await lunch.GET(changed)).json();assert.equal(data.mine.status,'attending');assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM accounts').get().n,1);
});
test('another employee cannot overwrite an existing answer',async()=>{
 await lunch.POST(request(answer));await lunch.POST(request({...answer,name:'Other Person',action:'decline'},'other@example.com'));
 const data=await (await lunch.GET(request())).json();assert.equal(data.mine.status,'attending');assert.equal(data.mine.name,'Test Person');assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM registrations').get().n,2);
});
test('invalid phone never saves a response',async()=>{
 assert.equal((await lunch.POST(request({...answer,phone:'123'}))).status,400);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM registrations').get().n,0);
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
 sqlite.prepare('UPDATE dishes SET source=?').run('Tidligere køkken');
 let data=await (await lunch.GET(request())).json();assert.equal(data.menuSource,'Tidligere køkken');
 await menu.POST(request({date:'2026-10-02',action:'save-source',source:''},'mjo@din-energi.dk'));
 data=await (await lunch.GET(request())).json();assert.equal(data.menuSource,'');
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
