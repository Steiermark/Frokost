import {database,user,sameOrigin} from '../../../lib/server';
import {emailValue,validEmail,passwordError,passwordHash} from '../../../lib/passwords';
export async function GET(request:Request){
 try{
  if(!(await user(request))?.admin)return Response.json({error:'Kun administratorer har adgang.'},{status:403});
  const result=await database().prepare("SELECT email,name,role,enabled,CASE WHEN password_hash<>'' THEN 1 ELSE 0 END AS hasPassword FROM accounts ORDER BY role,name COLLATE NOCASE,email").all();
  return Response.json({accounts:result.results},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Adgangene kunne ikke hentes.'},{status:503});}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Ugyldig forespørgsel.'},{status:403});
 try{
  if(!(await user(request))?.admin)return Response.json({error:'Kun administratorer kan administrere adgange.'},{status:403});
  const raw=await request.text();if(raw.length>4096)return Response.json({error:'Forespørgslen er for stor.'},{status:413});
  const body=JSON.parse(raw) as Record<string,unknown>,email=emailValue(body.email);
  if(body.action==='remove'){
   if(!validEmail(email))return Response.json({error:'Vælg en gyldig konto.'},{status:400});
   // The guard runs inside the delete, so concurrent removals cannot delete the last usable administrator.
   const result=await database().batch([
    database().prepare("DELETE FROM accounts WHERE email=? AND (role<>'admin' OR enabled<>1 OR password_hash='' OR EXISTS(SELECT 1 FROM accounts other WHERE other.email<>? AND other.role='admin' AND other.enabled=1 AND other.password_hash<>''))").bind(email,email),
    database().prepare('DELETE FROM push_subscriptions WHERE email=? AND NOT EXISTS(SELECT 1 FROM accounts WHERE email=?)').bind(email,email),
    database().prepare('DELETE FROM sessions WHERE email=? AND NOT EXISTS(SELECT 1 FROM accounts WHERE email=?)').bind(email,email),
    database().prepare('DELETE FROM password_resets WHERE email=? AND NOT EXISTS(SELECT 1 FROM accounts WHERE email=?)').bind(email,email),
    database().prepare('DELETE FROM login_tokens WHERE email=? AND NOT EXISTS(SELECT 1 FROM accounts WHERE email=?)').bind(email,email)
   ]);
   if(!result[0].meta.changes)return Response.json({error:'Kontoen findes ikke, eller den er den sidste administrator med adgangskode og kan ikke fjernes.'},{status:409});
   return Response.json({success:true});
  }
  const name=typeof body.name==='string'?body.name.trim():'';
  const problem=passwordError(body.password);
  if(!validEmail(email)||!name||name.length>80||!['admin','employee'].includes(String(body.role))||problem)return Response.json({error:problem||'Udfyld navn, e-mail og en gyldig adgangstype.'},{status:400});
  const hashed=await passwordHash(body.password as string);
  const result=body.action==='activate'
   ?await database().prepare("UPDATE accounts SET name=?,role=?,password_hash=? WHERE email=? AND password_hash='' AND enabled=1").bind(name,body.role,hashed,email).run()
   :body.action==='create'?await database().prepare('INSERT INTO accounts(email,name,role,password_hash,reminders,enabled) VALUES(?,?,?,?,0,1) ON CONFLICT(email) DO NOTHING').bind(email,name,body.role,hashed).run():null;
  if(!result)return Response.json({error:'Ukendt handling.'},{status:400});
  if(!result.meta.changes)return Response.json({error:'Kontoen findes allerede eller har allerede en adgangskode.'},{status:409});
  return Response.json({success:true});
 }catch{return Response.json({error:'Adgangen kunne ikke gemmes.'},{status:503});}
}
