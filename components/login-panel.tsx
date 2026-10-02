'use client';
import {useState} from 'react';
export default function LoginPanel({onLogin,resetToken='',onResetDone}:{onLogin:()=>Promise<void>;resetToken?:string;onResetDone?:()=>void}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[code,setCode]=useState('');
 const [forgot,setForgot]=useState(false),[setup,setSetup]=useState(false),[supportAdmins,setSupportAdmins]=useState<{name:string;email:string}[]>([]),[reminders,setReminders]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function showForgot(){setForgot(true);setSetup(false);setError('');setMessage('');setPassword('');try{const response=await fetch('/api/auth');const data=await response.json() as {supportAdmins?:{name:string;email:string}[]};setSupportAdmins(data.supportAdmins||[]);}catch{setSupportAdmins([]);}}
 async function submit(e:React.FormEvent){
  e.preventDefault();setError('');setMessage('');
  if((resetToken||setup)&&password!==repeat){setError('De to adgangskoder skal være ens.');return;}
  setBusy(true);
  try{
   let notificationGranted=false;
   if(!resetToken&&!forgot&&reminders&&'Notification'in window&&'serviceWorker'in navigator&&window.isSecureContext){
    notificationGranted=await Notification.requestPermission()==='granted';
   }
   const body=resetToken?{action:'reset',token:resetToken,password}:forgot?{action:'forgot',email}:setup?{action:'setup',email,code,password}:{action:'login',email,password};
   const response=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const result=await response.json() as {error?:string;message?:string};if(!response.ok)throw Error(result.error||'Prøv igen.');
   setPassword('');setRepeat('');
   if(resetToken){onResetDone?.();setMessage('Adgangskoden er gemt. Log ind med din e-mail og nye kode.');}
   else if(forgot)setMessage(result.message||'Tjek din indbakke.');
   else {localStorage.setItem('suf-reminders-default',reminders&&notificationGranted?'on':'off');await onLogin();}
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="login"><p className="eyebrow">SUF FREDAGSFROKOST</p><h1>{resetToken||setup?'Vælg din adgangskode':forgot?'Glemt adgangskode?':'Log ind til frokost'}</h1><p>{resetToken?'Brug mindst 6 tegn.':setup?'Indtast engangskoden fra administratoren, og vælg din egen adgangskode.':forgot?'En administrator skal nulstille din adgangskode.':'Brug din e-mail og adgangskode. Din konto bestemmer, om du har administrator- eller brugeradgang.'}</p>{forgot?<div className="setup-note forgot-help" role="status"><strong>Kontakt en administrator</strong><p>Bed en af administratorerne om at nulstille din adgangskode:</p>{supportAdmins.length?<ul>{supportAdmins.map(admin=><li key={admin.email}><strong>{admin.name}</strong><span>{admin.email}</span></li>)}</ul>:<p>Kontakt en administrator i SUF.</p>}<p>Du får derefter en engangskode, som bruges under “Første login?”.</p></div>:<form onSubmit={submit}>
 {!resetToken&&<><label htmlFor="login-email">E-mail</label><input id="login-email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254} disabled={busy}/></>}
 {setup&&<><label htmlFor="setup-code" className="phone-label">Engangskode</label><input id="setup-code" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} required minLength={12} maxLength={12} disabled={busy}/></>}
 {(!forgot||resetToken)&&<><label htmlFor="login-password" className="phone-label">{resetToken||setup?'Ny adgangskode':'Adgangskode'}</label><input id="login-password" type="password" autoComplete={resetToken||setup?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} required minLength={resetToken||setup?6:undefined} maxLength={72} disabled={busy}/></>}
 {(resetToken||setup)&&<><label htmlFor="password-repeat" className="phone-label">Gentag adgangskode</label><input id="password-repeat" type="password" autoComplete="new-password" value={repeat} onChange={e=>setRepeat(e.target.value)} required minLength={6} maxLength={72} disabled={busy}/></>}
 {!resetToken&&<label className="checkbox login-reminders"><input type="checkbox" checked={reminders} onChange={e=>setReminders(e.target.checked)} disabled={busy}/> Modtag påmindelser og besked, når næste menu frigives</label>}
 <button className="primary" disabled={busy}>{busy?'Vent et øjeblik…':resetToken||setup?'Gem adgangskode og log ind':'Log ind'}</button></form>}
 {!resetToken&&<div className="login-actions">{forgot||setup?<button className="text-button" disabled={busy} onClick={()=>{setSetup(false);setForgot(false);setError('');setMessage('');setPassword('');setRepeat('');setCode('');}}>Tilbage til login</button>:<><button className="text-button" disabled={busy} onClick={()=>{setSetup(true);setError('');setMessage('');setPassword('');setRepeat('');setCode('');}}>Første login?</button><button className="text-button" disabled={busy} onClick={()=>void showForgot()}>Glemt adgangskode?</button></>}</div>}
 {error&&<p className="error" role="alert">{error}</p>}{message&&<p className="success" role="status">{message}</p>}
 </section>;
}

