import {buildPushPayload} from '@block65/webcrypto-web-push';
import {database,setting} from './server';
import {copenhagenNow,fridays,deadline,dateLabel} from './lunch';
export function pushReady(){return !!setting('VAPID_PUBLIC_KEY')&&!!setting('VAPID_PRIVATE_KEY')&&!!setting('VAPID_SUBJECT');}
export function validEndpoint(endpoint:unknown):endpoint is string{
 if(typeof endpoint!=='string'||endpoint.length>2048)return false;
 try{const u=new URL(endpoint);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&(
 u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname==='web.push.apple.com'||u.hostname.endsWith('.push.apple.com')||u.hostname==='wns.windows.com'||u.hostname.endsWith('.notify.windows.com'));
 }catch{return false;}
}
export function reminderFriday(now=new Date()){
 const local=copenhagenNow(now),date=fridays(now)[0];
 return local.slice(0,10)===deadline(date).slice(0,10)&&local.slice(11,13)==='11'?date:null;
}
type Subscription={id:string;email:string;endpoint:string;p256dh:string;auth:string};
type DeliveryOutcome={ok:boolean;status?:number;reason?:string};
async function deliver(row:Subscription,dateKey:string,data:{title:string;body:string;date:string;tag:string},ttl:number){
 try{
  const payload=await buildPushPayload({data:JSON.stringify(data),options:{ttl,urgency:'high'}},{endpoint:row.endpoint,expirationTime:null,keys:{p256dh:row.p256dh,auth:row.auth}},{subject:setting('VAPID_SUBJECT'),publicKey:setting('VAPID_PUBLIC_KEY'),privateKey:setting('VAPID_PRIVATE_KEY')});
  const headers:Record<string,string>={...payload.headers};delete headers['content-length'];
  const response=await fetch(row.endpoint,{...payload,headers,redirect:'manual',signal:AbortSignal.timeout(10000)});
  if(response.status===404||response.status===410)await database().prepare('DELETE FROM push_subscriptions WHERE id=?').bind(row.id).run();
  const reason=response.ok?'':(await response.text().catch(()=>'')).replace(/\s+/g,' ').slice(0,160);
  const status=response.ok?'sent':'failed:'+response.status;
  await database().prepare('UPDATE push_deliveries SET status=? WHERE date=? AND subscription=?').bind(status,dateKey,row.id).run();
  if(!response.ok)console.error('Web Push rejected',{status:response.status,host:new URL(row.endpoint).hostname,reason});
  return {ok:response.ok,status:response.status,reason} satisfies DeliveryOutcome;
 }catch(error){const reason=error instanceof Error?error.message:'Ukendt leveringsfejl';await database().prepare("UPDATE push_deliveries SET status='failed:error' WHERE date=? AND subscription=?").bind(dateKey,row.id).run();console.error('Web Push failed',{host:new URL(row.endpoint).hostname,reason});return {ok:false,reason} satisfies DeliveryOutcome;}
}

export async function sendMenuRelease(date:string){
 if(!pushReady())return {sent:0,failed:0,skipped:'push-not-configured'};
 const dateKey=date+'#menu';
 const notificationTag='menu-'+date+'-'+Date.now().toString(36);
 const rows=await database().prepare("SELECT s.* FROM push_subscriptions s JOIN accounts a ON a.email=s.email LEFT JOIN push_deliveries d ON d.subscription=s.id AND d.date=? WHERE a.enabled=1 AND a.password_hash<>'' AND (d.id IS NULL OR d.status LIKE 'failed%')").bind(dateKey).all<Subscription>();
 let sent=0,failed=0;const errors:Array<{status?:number;reason?:string}>=[];
 for(const row of rows.results){
  if(!validEndpoint(row.endpoint))continue;
  const claim=await database().prepare("INSERT INTO push_deliveries(id,date,subscription,status,created) VALUES(?,?,?,'claimed',?) ON CONFLICT(date,subscription) DO UPDATE SET status='claimed',created=excluded.created WHERE push_deliveries.status LIKE 'failed%'").bind(crypto.randomUUID(),dateKey,row.id,Date.now()).run();
  if(!claim.meta.changes)continue;
  const outcome=await deliver(row,dateKey,{title:'SUF · Fredagsfrokost',body:'Menuen til fredag den '+dateLabel(date)+' er klar. Åbn appen og vælg din ret.',date,tag:notificationTag},7*24*3600);
  if(outcome.ok)sent++;else{failed++;errors.push({status:outcome.status,reason:outcome.reason});}
 }
 return {sent,failed,errors};
}

export async function sendReminders(now=new Date(),dryRun=false){
 const date=reminderFriday(now);
 if(!date)return {sent:0,failed:0,skipped:'outside-window'};
 if(!pushReady())throw Error('Push er ikke konfigureret.');
 const rows=await database().prepare("SELECT s.* FROM push_subscriptions s JOIN accounts a ON a.email=s.email WHERE a.enabled=1 AND a.password_hash<>'' AND NOT EXISTS(SELECT 1 FROM registrations r WHERE r.normalized_name=a.email AND r.date=?) AND NOT EXISTS(SELECT 1 FROM push_deliveries d WHERE d.subscription=s.id AND d.date=?)").bind(date,date).all<Subscription>();
 if(dryRun)return {sent:0,failed:0,eligible:rows.results.length,dryRun:true};
 let sent=0,failed=0;
 for(const row of rows.results){
  if(reminderFriday(new Date())!==date)break;
  if(!validEndpoint(row.endpoint))continue;
  // Atomic claim checks the current choice again and prevents duplicate sends on overlapping jobs.
  const claim=await database().prepare("INSERT INTO push_deliveries(id,date,subscription,status,created) SELECT ?,?,?,'claimed',? WHERE EXISTS(SELECT 1 FROM push_subscriptions s JOIN accounts a ON a.email=s.email WHERE s.id=? AND a.enabled=1 AND a.password_hash<>'') AND NOT EXISTS(SELECT 1 FROM registrations WHERE normalized_name=? AND date=?) ON CONFLICT(date,subscription) DO NOTHING").bind(crypto.randomUUID(),date,row.id,Date.now(),row.id,row.email,date).run();
  if(!claim.meta.changes)continue;
  const local=copenhagenNow(new Date());const ttl=Math.max(1,(60-Number(local.slice(14,16)))*60);
  const outcome=await deliver(row,date,{title:'SUF · Fredagsfrokost',body:'Husk at vælge din ret eller melde afbud inden kl. 12 i dag.',date,tag:'lunch-'+date},ttl);
  if(outcome.ok)sent++;else failed++;
 }
 return {sent,failed};
}
