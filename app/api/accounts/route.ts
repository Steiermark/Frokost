import {database,user,sameOrigin,hash,secret} from '../../../lib/server';
import {emailValue,validEmail} from '../../../lib/passwords';
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
  if(body.action==='activation-code'){
   if(!validEmail(email))return Response.json({error:'Vælg en gyldig konto.'},{status:400});
   const code=secret().slice(0,12).toUpperCase(),codeHash=await hash(code),now=Date.now();
   const result=await database().batch([
    database().prepare("DELETE FROM login_tokens WHERE email=? AND EXISTS(SELECT 1 FROM accounts WHERE email=? AND enabled=1 AND password_hash='')").bind(email,email),
    database().prepare("INSERT INTO login_tokens(hash,email,created,expires) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM accounts WHERE email=? AND enabled=1 AND password_hash='')").bind(codeHash,email,now,now+30*86400000,email)
   ]);
   if(!result[1].meta.changes)return Response.json({error:'Kontoen findes ikke eller har allerede en adgangskode.'},{status:409});
   return Response.json({success:true,activationCode:code});
  }
  if(body.action==='reset-access'){
   if(!validEmail(email))return Response.json({error:'Vælg en gyldig konto.'},{status:400});
   const cleared=await database().prepare("UPDATE accounts SET password_hash='' WHERE email=? AND enabled=1 AND password_hash<>'' AND (role<>'admin' OR EXISTS(SELECT 1 FROM accounts other WHERE other.email<>? AND other.role='admin' AND other.enabled=1 AND other.password_hash<>''))").bind(email,email).run();
   if(!cleared.meta.changes)return Response.json({error:'Kontoen findes ikke, afventer allerede første login eller er den sidste aktive administrator.'},{status:409});
   const code=secret().slice(0,12).toUpperCase(),codeHash=await hash(code),now=Date.now();
   await database().batch([
    database().prepare('DELETE FROM sessions WHERE email=?').bind(email),
    database().prepare('DELETE FROM login_tokens WHERE email=?').bind(email),
    database().prepare('DELETE FROM password_resets WHERE email=?').bind(email),
    database().prepare('INSERT INTO login_tokens(hash,email,created,expires) VALUES(?,?,?,?)').bind(codeHash,email,now,now+30*86400000)
   ]);
   return Response.json({success:true,activationCode:code});
  }
  const name=typeof body.name==='string'?body.name.trim():'';
  if(body.action!=='create')return Response.json({error:'Ukendt handling.'},{status:400});
  if(!validEmail(email)||!name||name.length>80||!['admin','employee'].includes(String(body.role)))return Response.json({error:'Udfyld navn, e-mail og en gyldig adgangstype.'},{status:400});
  const code=secret().slice(0,12).toUpperCase(),codeHash=await hash(code),now=Date.now();
  const result=await database().batch([
   database().prepare("INSERT INTO accounts(email,name,role,password_hash,reminders,enabled) VALUES(?,?,?,'',0,1) ON CONFLICT(email) DO NOTHING").bind(email,name,body.role),
   database().prepare('INSERT INTO login_tokens(hash,email,created,expires) SELECT ?,?,?,? WHERE changes()>0').bind(codeHash,email,now,now+30*86400000)
  ]);
  if(!result[0].meta.changes)return Response.json({error:'Kontoen findes allerede.'},{status:409});
  return Response.json({success:true,activationCode:code});
 }catch{return Response.json({error:'Adgangen kunne ikke gemmes.'},{status:503});}
}
