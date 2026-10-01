import {buildPushPayload} from '@block65/webcrypto-web-push';
import {database,setting} from './server';
import {copenhagenNow,fridays,deadline} from './lunch';
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
  try{
   const local=copenhagenNow(new Date());const ttl=Math.max(1,(60-Number(local.slice(14,16)))*60);
   const payload=await buildPushPayload({data:JSON.stringify({title:'SUF · Fredagsfrokost',body:'Husk at vælge din ret eller melde afbud inden kl. 12 i dag.',date,tag:'lunch-'+date}),options:{ttl,urgency:'high'}},{endpoint:row.endpoint,expirationTime:null,keys:{p256dh:row.p256dh,auth:row.auth}},{subject:setting('VAPID_SUBJECT'),publicKey:setting('VAPID_PUBLIC_KEY'),privateKey:setting('VAPID_PRIVATE_KEY')});
   const response=await fetch(row.endpoint,{...payload,redirect:'error',signal:AbortSignal.timeout(10000)});
   if(response.status===404||response.status===410)await database().prepare('DELETE FROM push_subscriptions WHERE id=?').bind(row.id).run();
   const status=response.ok?'sent':'failed';if(response.ok)sent++;else failed++;
   await database().prepare('UPDATE push_deliveries SET status=? WHERE date=? AND subscription=?').bind(status,date,row.id).run();
  }catch{failed++;await database().prepare("UPDATE push_deliveries SET status='failed' WHERE date=? AND subscription=?").bind(date,row.id).run();}
 }
 return {sent,failed};
}
