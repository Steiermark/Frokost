'use client';
import {useState} from 'react';
export default function LoginPanel({onLogin,resetToken='',onResetDone}:{onLogin:()=>Promise<void>;resetToken?:string;onResetDone?:()=>void}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState('');
 const [forgot,setForgot]=useState(false),[reminders,setReminders]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function submit(e:React.FormEvent){
  e.preventDefault();setError('');setMessage('');
  if(resetToken&&password!==repeat){setError('De to adgangskoder skal være ens.');return;}
  setBusy(true);
  try{
   let notificationGranted=false;
   if(!resetToken&&!forgot&&reminders&&'Notification'in window&&'serviceWorker'in navigator&&window.isSecureContext){
    notificationGranted=await Notification.requestPermission()==='granted';
   }
   const body=resetToken?{action:'reset',token:resetToken,password}:forgot?{action:'forgot',email}:{action:'login',email,password};
   const response=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const result=await response.json() as {error?:string;message?:string};if(!response.ok)throw Error(result.error||'Prøv igen.');
   setPassword('');setRepeat('');
   if(resetToken){onResetDone?.();setMessage('Adgangskoden er gemt. Log ind med din e-mail og nye kode.');}
   else if(forgot)setMessage(result.message||'Tjek din indbakke.');
   else {localStorage.setItem('suf-reminders-default',reminders&&notificationGranted?'on':'off');await onLogin();}
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="login"><p className="eyebrow">SUF FREDAGSFROKOST</p><h1>{resetToken?'Vælg din adgangskode':forgot?'Glemt adgangskode?':'Log ind til frokost'}</h1><p>{resetToken?'Brug mindst 6 tegn.':forgot?'Vi sender et link til din mail, så du kan vælge en ny adgangskode.':'Brug din e-mail og adgangskode. Din konto bestemmer, om du har administrator- eller brugeradgang.'}</p><form onSubmit={submit}>
 {!resetToken&&<><label htmlFor="login-email">E-mail</label><input id="login-email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254} disabled={busy}/></>}
 {(!forgot||resetToken)&&<><label htmlFor="login-password" className="phone-label">{resetToken?'Ny adgangskode':'Adgangskode'}</label><input id="login-password" type="password" autoComplete={resetToken?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} required minLength={resetToken?6:undefined} maxLength={72} disabled={busy}/></>}
 {resetToken&&<><label htmlFor="password-repeat" className="phone-label">Gentag adgangskode</label><input id="password-repeat" type="password" autoComplete="new-password" value={repeat} onChange={e=>setRepeat(e.target.value)} required minLength={6} maxLength={72} disabled={busy}/></>}
 {!resetToken&&!forgot&&<label className="checkbox login-reminders"><input type="checkbox" checked={reminders} onChange={e=>setReminders(e.target.checked)} disabled={busy}/> Modtag påmindelser og besked, når næste menu frigives</label>}
 <button className="primary" disabled={busy}>{busy?'Vent et øjeblik…':resetToken?'Gem adgangskode':forgot?'Send link på mail':'Log ind'}</button></form>
 {!resetToken&&<button className="text-button" disabled={busy} onClick={()=>{setForgot(!forgot);setError('');setMessage('');setPassword('');}}>{forgot?'Tilbage til login':'Glemt adgangskode?'}</button>}
 {error&&<p className="error" role="alert">{error}</p>}{message&&<p className="success" role="status">{message}</p>}
 </section>;
}

