import {hash as bcryptHash,compare} from 'bcryptjs';
import {database,hash} from './server';
export function passwordError(value:unknown){
 if(typeof value!=='string'||value.length<6)return 'Brug en adgangskode på mindst 6 tegn.';
 if(new TextEncoder().encode(value).length>72)return 'Adgangskoden er for lang (højst 72 UTF-8-bytes).';
 return '';
}
export function passwordHash(password:string){return bcryptHash(password,12);}
export function passwordMatches(password:string,hashed:string){return compare(password,hashed);}
export function emailValue(value:unknown){return typeof value==='string'?value.trim().toLowerCase():'';}
export function validEmail(email:string){return email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);}
export async function allowedAttempt(kind:string,email:string,request:Request){
 const now=Date.now(),window=15*60000;
 const ip=request.headers.get('cf-connecting-ip')||'shared';
 for(const [key,limit] of [[kind+':account:'+await hash(email),kind==='login'?10:3],[kind+':ip:'+await hash(ip),kind==='login'?100:20]] as const){
  const row=await database().prepare('INSERT INTO auth_limits(key,started,hits) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET started=CASE WHEN started<=? THEN excluded.started ELSE started END,hits=CASE WHEN started<=? THEN 1 ELSE hits+1 END RETURNING hits').bind(key,now,now-window,now-window).first<{hits:number}>();
  if(!row||row.hits>limit)return false;
 }
 await database().prepare('DELETE FROM auth_limits WHERE started<?').bind(now-86400000).run();
 return true;
}
export function sessionCookie(request:Request,value:string,maxAge=28800){
 const url=new URL(request.url);
 const local=url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 return 'suf_password_session='+value+'; HttpOnly; '+(local?'':'Secure; ')+'SameSite=Lax; Path=/; Max-Age='+maxAge;
}
