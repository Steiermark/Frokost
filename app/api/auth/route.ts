import {database,hash,secret,user,sameOrigin,mailReady,sendMail,origin} from '../../../lib/server';
export async function GET(request:Request){try{return Response.json({user:await user(request),mailReady:mailReady()},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Login kunne ikke hentes.'},{status:503});}}
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Ugyldig forespørgsel.'},{status:403});
 try{
 const body=await request.json() as Record<string,unknown>;
 if(body.action==='request'){
 const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return Response.json({error:'Skriv en gyldig e-mailadresse.'},{status:400});
 if(!mailReady())return Response.json({error:'Login via e-mail er ikke aktiveret endnu. Administratoren skal først tilslutte mailudsendelse.'},{status:503});
 const now=Date.now();const token=secret();const hashed=await hash(token);
 const inserted=await database().prepare('INSERT INTO login_tokens(hash,email,created,expires) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM login_tokens WHERE email=? AND created>?)<3 AND (SELECT COUNT(*) FROM login_tokens WHERE created>?)<60').bind(hashed,email,now,now+15*60000,email,now-15*60000,now-3600000).run();
 if(!inserted.meta.changes)return Response.json({error:'Der er sendt flere loginlinks. Vent lidt og prøv igen.'},{status:429});
 await sendMail(email,'Log ind til SUF Fredagsfrokost','Klik på linket for at logge ind. Linket kan bruges én gang og udløber efter 15 minutter.\n\n'+origin+'/#login='+token+'\n\nHvis du ikke har bedt om linket, kan du ignorere denne mail.','login-'+hashed);
 return Response.json({success:true});
 }
 if(body.action==='verify'){
 if(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))return Response.json({error:'Ugyldigt loginlink.'},{status:400});
 const row=await database().prepare('DELETE FROM login_tokens WHERE hash=? AND expires>? RETURNING email').bind(await hash(body.token),Date.now()).first<{email:string}>();
 if(!row)return Response.json({error:'Loginlinket er udløbet eller allerede brugt. Bestil et nyt.'},{status:400});
 const session=secret();await database().batch([database().prepare('INSERT INTO accounts(email,name,reminders) VALUES(?,?,1) ON CONFLICT(email) DO NOTHING').bind(row.email,''),database().prepare('INSERT INTO sessions(hash,email,expires) VALUES(?,?,?)').bind(await hash(session),row.email,Date.now()+30*86400000)]);
 return Response.json({success:true},{headers:{'Set-Cookie':'suf_session='+session+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000'}});
 }
 const current=await user(request);if(!current)return Response.json({error:'Log ind først.'},{status:401});
 if(body.action==='logout'){const token=request.headers.get('cookie')?.match(/(?:^|;\s*)suf_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(token)await database().prepare('DELETE FROM sessions WHERE hash=?').bind(await hash(token)).run();return Response.json({success:true},{headers:{'Set-Cookie':'suf_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'}});}
 if(body.action==='preferences'&&typeof body.reminders==='boolean'){await database().prepare('UPDATE accounts SET reminders=? WHERE email=?').bind(body.reminders?1:0,current.email).run();return Response.json({success:true});}
 return Response.json({error:'Ukendt handling.'},{status:400});
 }catch(e){console.error('Authentication failed');return Response.json({error:e instanceof Error?e.message:'Login kunne ikke gennemføres.'},{status:503});}
}
