import {validDishPhoto} from '../../../lib/dish-photo';
import {database,user,sameOrigin} from '../../../lib/server';
import {fridays,availableFridays,isClosed} from '../../../lib/lunch';
import {sendMenuRelease} from '../../../lib/push';
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Ugyldig forespørgsel.'},{status:403});
 try{const current=await user(request);if(!current?.admin)return Response.json({error:'Kun administratorer kan ændre menuen.'},{status:403});
 if(Number(request.headers.get('content-length')||0)>300000)return Response.json({error:'Fotoet er for stort.'},{status:413});
 const raw=await request.text();if(raw.length>300000)return Response.json({error:'Fotoet er for stort.'},{status:413});
 const body=JSON.parse(raw) as Record<string,unknown>;const {date,id}=body;const name=typeof body.name==='string'?body.name.trim():'';
 if(typeof date!=='string'||!availableFridays().includes(date)||isClosed(date))return Response.json({error:'Vælg en fredag, hvor fristen ikke er overskredet.'},{status:400});
 if(body.action==='save-source'){
 const source=typeof body.source==='string'?body.source.trim():null;
 if(source===null||source.length>160)return Response.json({error:'Skriv hvor maden kommer fra (højst 160 tegn).'},{status:400});
 await database().prepare('INSERT INTO menus(date,source,released) VALUES(?,?,0) ON CONFLICT(date) DO UPDATE SET source=excluded.source').bind(date,source).run();
 return Response.json({success:true});
 }
 if(body.action==='release'){
  const dish=await database().prepare('SELECT 1 AS found FROM dishes WHERE date=? AND active=1 LIMIT 1').bind(date).first();
  if(!dish)return Response.json({error:'Tilføj mindst én ret, før menuen frigives.'},{status:409});
  const result=await database().prepare("INSERT INTO menus(date,source,released) VALUES(?,'',1) ON CONFLICT(date) DO UPDATE SET released=1 WHERE menus.released=0").bind(date).run();
  const notifications=await sendMenuRelease(date);
  return Response.json({success:true,released:true,alreadyReleased:!result.meta.changes,notifications});
 }
 if(body.action==='remove'&&typeof id==='string'){
 const count=await database().prepare('SELECT COUNT(*) AS n FROM registrations WHERE date=? AND meal=?').bind(date,id).first<{n:number}>();
 if(count?.n)return Response.json({error:'Retten har tilmeldinger og kan ikke fjernes.'},{status:409});
 await database().prepare('UPDATE dishes SET active=0 WHERE id=? AND date=?').bind(id,date).run();
 }else{


 if(body.photo!==undefined&&!validDishPhoto(body.photo))return Response.json({error:'Fotoet kunne ikke gemmes. Vælg et JPG-, PNG- eller WebP-foto igen.'},{status:400});
 if(!name||name.length>100||typeof body.vegetarian!=='boolean')return Response.json({error:'Skriv rettens navn (højst 100 tegn). '},{status:400});
 if(typeof id==='string')await database().prepare('UPDATE dishes SET name=?,vegetarian=?,photo=COALESCE(?,photo),photo_version=CASE WHEN ? IS NULL THEN photo_version ELSE photo_version+1 END WHERE id=? AND date=? AND active=1').bind(name,body.vegetarian?1:0,body.photo??null,body.photo??null,id,date).run();
 else await database().prepare('INSERT INTO dishes(id,date,name,vegetarian,photo,photo_version,active) VALUES(?,?,?,?,?,1,1)').bind(crypto.randomUUID(),date,name,body.vegetarian?1:0,body.photo??'').run();
 }return Response.json({success:true});
 }catch{return Response.json({error:'Menuen kunne ikke gemmes.'},{status:503});}
}




