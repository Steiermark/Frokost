import {database,user,sameOrigin,hash,setting} from '../../../lib/server';
import {pushReady,validEndpoint} from '../../../lib/push';
export async function GET(request:Request){
 if(!await user(request))return Response.json({error:'Log ind først.'},{status:401});
 return Response.json({ready:pushReady(),publicKey:setting('VAPID_PUBLIC_KEY')},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Ugyldig forespørgsel.'},{status:403});
 const current=await user(request);if(!current)return Response.json({error:'Log ind først.'},{status:401});
 try{
  const raw=await request.text();if(raw.length>4096)return Response.json({error:'For stor forespørgsel.'},{status:413});
  const body=JSON.parse(raw),sub=body.subscription;
  if(body.action==='remove'){
   if(typeof body.endpoint!=='string')return Response.json({error:'Ugyldig enhed.'},{status:400});
   await database().prepare('DELETE FROM push_subscriptions WHERE email=? AND endpoint=?').bind(current.email,body.endpoint).run();return Response.json({success:true});
  }
  if(body.action!=='subscribe'||!pushReady())return Response.json({error:'Påmindelser er ikke klar endnu.'},{status:503});
  if(!validEndpoint(sub?.endpoint)||!/^B[A-Za-z0-9_-]{86}$/.test(sub?.keys?.p256dh||'')||! /^[A-Za-z0-9_-]{22}$/.test(sub?.keys?.auth||''))return Response.json({error:'Ugyldig notifikationstilmelding.'},{status:400});
  // Endpoints belong to one account at a time, also on a shared device.
  await database().prepare('INSERT INTO push_subscriptions(id,email,endpoint,p256dh,auth,created) VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET email=excluded.email,p256dh=excluded.p256dh,auth=excluded.auth').bind(await hash(sub.endpoint),current.email,sub.endpoint,sub.keys.p256dh,sub.keys.auth,Date.now()).run();
  return Response.json({success:true});
 }catch{return Response.json({error:'Påmindelsen kunne ikke gemmes.'},{status:503});}
}
