import {database,hash,secret,user,sameOrigin,mailReady,sendMail,origin,setting} from '../../../lib/server';
import {passwordError,passwordHash,passwordMatches,emailValue,validEmail,allowedAttempt,sessionCookie} from '../../../lib/passwords';
const noStore={'Cache-Control':'no-store'};
const genericReset='Hvis adressen har adgang, får du en mail med et link til at vælge en ny adgangskode.';
export async function GET(request:Request){try{const admins=await database().prepare("SELECT name,email FROM accounts WHERE role='admin' AND enabled=1 AND password_hash<>'' AND name<>'' ORDER BY name COLLATE NOCASE LIMIT 2").all<{name:string;email:string}>();return Response.json({user:await user(request),mailReady:mailReady(),supportAdmins:admins.results},{headers:noStore});}catch{return Response.json({error:'Login kunne ikke hentes.'},{status:503,headers:noStore});}}
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Ugyldig forespørgsel.'},{status:403});
 try{
 const raw=await request.text();if(raw.length>4096)return Response.json({error:'Forespørgslen er for stor.'},{status:413});
 const body=JSON.parse(raw) as Record<string,unknown>;
 if(body.action==='logout'){
  const token=request.headers.get('cookie')?.match(/(?:^|;\s*)suf_password_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(token)await database().prepare('DELETE FROM sessions WHERE hash=?').bind(await hash(token)).run();
  return Response.json({success:true},{headers:{...noStore,'Set-Cookie':sessionCookie(request,'',0)}});
 }
 if(body.action==='setup'){
  const email=emailValue(body.email),code=typeof body.code==='string'?body.code.trim().toUpperCase():'';
  const problem=passwordError(body.password);
  if(!validEmail(email)||!/^[A-F0-9]{12}$/.test(code)||problem)return Response.json({error:problem||'E-mail eller engangskode er ugyldig.'},{status:400});
  if(!await allowedAttempt('setup',email,request))return Response.json({error:'For mange forsøg. Vent 15 minutter og prøv igen.'},{status:429});
  const codeHash=await hash(code),newHash=await passwordHash(body.password as string),session=secret(),now=Date.now();
  const result=await database().batch([
   database().prepare("UPDATE accounts SET password_hash=? WHERE email=? AND enabled=1 AND password_hash='' AND EXISTS(SELECT 1 FROM login_tokens WHERE hash=? AND email=? AND expires>?)").bind(newHash,email,codeHash,email,now),
   database().prepare("INSERT INTO sessions(hash,email,expires,auth_method) SELECT ?,?,?, 'password' WHERE changes()>0").bind(await hash(session),email,now+8*3600000),
   database().prepare('DELETE FROM login_tokens WHERE email=? AND EXISTS(SELECT 1 FROM accounts WHERE email=? AND password_hash=?)').bind(email,email,newHash)
  ]);
  if(!result[0].meta.changes)return Response.json({error:'Engangskoden er forkert, udløbet eller allerede brugt.'},{status:400});
  return Response.json({success:true},{headers:{...noStore,'Set-Cookie':sessionCookie(request,session)}});
 }
 if(body.action==='login'){
  const email=emailValue(body.email);
  if(!validEmail(email)||typeof body.password!=='string'||body.password.length>200)return Response.json({error:'E-mail eller adgangskode er forkert.'},{status:401});
  if(!await allowedAttempt('login',email,request))return Response.json({error:'For mange forsøg. Vent 15 minutter og prøv igen.'},{status:429});
  // Optional one-time hosted bootstrap. Never overwrites a configured account.
  if(email===setting('INITIAL_ADMIN_EMAIL')&&setting('INITIAL_ADMIN_PASSWORD_HASH'))await database().prepare("INSERT INTO accounts(email,name,role,password_hash,enabled,reminders) VALUES(?,'Martin Johansen','admin',?,1,0) ON CONFLICT(email) DO UPDATE SET role='admin',password_hash=excluded.password_hash WHERE accounts.password_hash='' AND accounts.enabled=1").bind(email,setting('INITIAL_ADMIN_PASSWORD_HASH')).run();
  const account=await database().prepare('SELECT password_hash,enabled FROM accounts WHERE email=?').bind(email).first<{password_hash:string;enabled:number}>();
  // A fixed dummy hash gives unknown accounts the same expensive comparison.
  const valid=await passwordMatches(body.password,account?.password_hash||'$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW');
  if(!valid||!account?.enabled||!account.password_hash||new TextEncoder().encode(body.password).length>72)return Response.json({error:'E-mail eller adgangskode er forkert.'},{status:401});
  const session=secret();
  const result=await database().prepare("INSERT INTO sessions(hash,email,expires,auth_method) SELECT ?,?,?, 'password' WHERE EXISTS(SELECT 1 FROM accounts WHERE email=? AND password_hash=? AND enabled=1)").bind(await hash(session),email,Date.now()+8*3600000,email,account.password_hash).run();
  if(!result.meta.changes)return Response.json({error:'Login er ændret. Prøv igen.'},{status:401});
  return Response.json({success:true},{headers:{...noStore,'Set-Cookie':sessionCookie(request,session)}});
 }
 if(body.action==='forgot'){
  const email=emailValue(body.email);
  if(!validEmail(email))return Response.json({error:'Skriv en gyldig e-mailadresse.'},{status:400});
  if(!mailReady())return Response.json({error:'Mailtjenesten er ikke tilsluttet endnu. Kontakt administratoren.'},{status:503});
  if(!await allowedAttempt('reset',email,request))return Response.json({message:genericReset},{headers:noStore});
  const account=await database().prepare('SELECT email FROM accounts WHERE email=? AND enabled=1').bind(email).first();
  if(account){
   const token=secret(),hashed=await hash(token);
   await database().prepare('INSERT INTO password_resets(hash,email,expires) VALUES(?,?,?)').bind(hashed,email,Date.now()+30*60000).run();
   const base=new URL(setting('APP_URL')||origin).origin;
   try{await sendMail(email,'Ny adgangskode til SUF Fredagsfrokost','Vælg en ny adgangskode via dette link. Det kan bruges én gang og udløber efter 30 minutter.\n\n'+base+'/#reset='+token+'\n\nHvis du ikke bad om en ny kode, kan du ignorere mailen.','password-reset-'+hashed);}
   catch{await database().prepare('DELETE FROM password_resets WHERE hash=?').bind(hashed).run();}
  }
  return Response.json({message:genericReset},{headers:noStore});
 }
 if(body.action==='reset'){
  const problem=passwordError(body.password);if(problem)return Response.json({error:problem},{status:400});
  if(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))return Response.json({error:'Linket er ugyldigt eller udløbet.'},{status:400});
  const tokenHash=await hash(body.token);
  if(!await allowedAttempt('reset-token',tokenHash,request))return Response.json({error:'For mange forsøg. Prøv igen senere.'},{status:429});
  const row=await database().prepare('SELECT r.email FROM password_resets r JOIN accounts a ON a.email=r.email WHERE r.hash=? AND r.expires>? AND a.enabled=1').bind(tokenHash,Date.now()).first<{email:string}>();
  if(!row)return Response.json({error:'Linket er ugyldigt eller udløbet. Bestil et nyt.'},{status:400});
  const newHash=await passwordHash(body.password as string),now=Date.now();
  const result=await database().batch([
   database().prepare('UPDATE accounts SET password_hash=? WHERE email=? AND enabled=1 AND EXISTS(SELECT 1 FROM password_resets WHERE hash=? AND email=? AND expires>?)').bind(newHash,row.email,tokenHash,row.email,now),
   database().prepare('DELETE FROM sessions WHERE email=? AND EXISTS(SELECT 1 FROM password_resets WHERE hash=? AND expires>?)').bind(row.email,tokenHash,now),
   database().prepare('DELETE FROM password_resets WHERE email=? AND EXISTS(SELECT 1 FROM password_resets WHERE hash=? AND expires>?)').bind(row.email,tokenHash,now)
  ]);
  if(!result[0].meta.changes)return Response.json({error:'Linket er allerede brugt eller udløbet.'},{status:400});
  return Response.json({success:true},{headers:{...noStore,'Set-Cookie':sessionCookie(request,'',0)}});
 }
 return Response.json({error:'Ukendt handling.'},{status:400});
 }catch{return Response.json({error:'Handlingen kunne ikke gennemføres. Prøv igen.'},{status:503});}
}
