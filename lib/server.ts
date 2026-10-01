import {env} from 'cloudflare:workers';
export function database(){if(!env.DB)throw Error('Databasen er ikke tilgængelig.');return env.DB;}
export function setting(name:string){return (env as unknown as Record<string,string|undefined>)[name]||'';}
export async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
export function secret(){return Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function user(request:Request){
 const cookie=request.headers.get('cookie')?.match(/(?:^|;\s*)suf_password_session=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!cookie)return null;
 const row=await database().prepare("SELECT a.email,a.name,a.reminders,a.role FROM sessions s JOIN accounts a ON a.email=s.email WHERE s.hash=? AND s.expires>? AND s.auth_method='password' AND a.enabled=1 AND a.password_hash<>''").bind(await hash(cookie),Date.now()).first<{email:string;name:string;reminders:number;role:string}>();
 return row?{...row,admin:row.role==='admin',authMode:'password' as const}:null;
}
export function sameOrigin(request:Request){return request.headers.get('origin')===new URL(request.url).origin;}
export function mailReady(){return !!setting('RESEND_API_KEY')&&!!setting('MAIL_FROM');}
export async function sendMail(to:string,subject:string,text:string,key:string){if(!mailReady())throw Error('Mailudsendelse er ikke konfigureret endnu.');const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+setting('RESEND_API_KEY'),'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:setting('MAIL_FROM'),to:[to],subject,text})});if(!r.ok)throw Error('Mailen kunne ikke sendes. Prøv igen senere.');}
export const origin='https://suf-fredagsfrokost.din-energi.chatgpt.site';


