import {database,user,sameOrigin} from '../../../lib/server';
import {fridays,availableFridays,isClosed} from '../../../lib/lunch';


export async function GET(request:Request) {
 try {
  const current=await user(request);
  if(!current)return Response.json({error:'Log ind for at se frokosten.'},{status:401});
  const date=new URL(request.url).searchParams.get('date')||fridays()[0];
  if(!availableFridays().includes(date))return Response.json({error:'Vælg en kommende fredag.'},{status:400});
  const menu=await database().prepare('SELECT id,name,vegetarian,CASE WHEN length(photo)>0 THEN 1 ELSE 0 END AS hasPhoto,photo_version AS photoVersion FROM dishes WHERE date=? AND active=1 ORDER BY rowid').bind(date).all();
  const savedMenu=await database().prepare('SELECT source FROM menus WHERE date=?').bind(date).first<{source:string}>();
  // Preserve a single previously recorded supplier until the shared field is saved.
  const legacy=await database().prepare("SELECT DISTINCT trim(source) AS source FROM dishes WHERE date=? AND active=1 AND trim(source)<>''").bind(date).all<{source:string}>();
  const menuSource=savedMenu?savedMenu.source:legacy.results.length===1?legacy.results[0].source:'';
  const rows=await database().prepare("SELECT r.id,r.name,r.meal,d.name AS dish,d.vegetarian FROM registrations r LEFT JOIN dishes d ON d.id=r.meal WHERE r.date=? AND r.status='attending' ORDER BY r.name COLLATE NOCASE").bind(date).all();
  const mine=await database().prepare('SELECT name,meal,status FROM registrations WHERE date=? AND normalized_name=?').bind(date,current.email).first();
  const declined=current.admin?await database().prepare("SELECT id,name FROM registrations WHERE date=? AND status='declined' ORDER BY name COLLATE NOCASE").bind(date).all():null;
  return Response.json({registrations:rows.results,menu:menu.results,menuSource,mine,declined:declined?.results||[],closed:isClosed(date)},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Frokosten kunne ikke hentes. Prøv igen.'},{status:503});}
}
export async function POST(request:Request) {
 if(!sameOrigin(request))return Response.json({error:'Ugyldig forespørgsel.'},{status:403});
 try {
  const current=await user(request);
  if(!current)return Response.json({error:'Log ind først.'},{status:401});
  const body=await request.json() as Record<string,unknown>;
  const {date,meal,action}=body;
  const name=typeof body.name==='string'?body.name.trim().replace(/\s+/g,' '):'';

  if(typeof date!=='string'||!availableFridays().includes(date)||!['join','decline'].includes(String(action)))return Response.json({error:'Vælg en kommende fredag og et svar.'},{status:400});
  if(isClosed(date))return Response.json({error:'Fristen var onsdag kl. 12. Tilmeldingen er lukket.'},{status:409});
  if(!name||name.length>80)return Response.json({error:'Udfyld dit fulde navn.'},{status:400});
  if(action==='join'&&typeof meal!=='string')return Response.json({error:'Vælg en ret.'},{status:400});
  const status=action==='join'?'attending':'declined';
  const chosenMeal=action==='join'?meal as string:'';
  // Validate the dish within the upsert. D1 commits the answer and profile atomically.
  const result=await database().batch([
   database().prepare("INSERT INTO registrations(id,date,name,normalized_name,meal,status) SELECT ?,?,?,?,?,? WHERE ?='declined' OR EXISTS(SELECT 1 FROM dishes WHERE id=? AND date=? AND active=1) ON CONFLICT(date,normalized_name) DO UPDATE SET name=excluded.name,meal=excluded.meal,status=excluded.status").bind(crypto.randomUUID(),date,name,current.email,chosenMeal,status,status,chosenMeal,date),
   database().prepare('UPDATE accounts SET name=? WHERE email=? AND changes()>0').bind(name,current.email)
  ]);
  if(!result[0].meta.changes)return Response.json({error:'Retten kan ikke længere vælges. Hent menuen igen.'},{status:409});
  return Response.json({success:true,status});
 }catch{return Response.json({error:'Ændringen kunne ikke gemmes. Prøv igen.'},{status:503});}
}




