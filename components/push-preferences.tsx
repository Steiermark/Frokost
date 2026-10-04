'use client';
import {useEffect,useState} from 'react';
export default function PushPreferences(){
 const [supported,setSupported]=useState(false),[iosInstall,setIosInstall]=useState(false),[ready,setReady]=useState(false),[active,setActive]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function save(subscription:PushSubscription){const r=await fetch('/api/push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'subscribe',subscription:subscription.toJSON()})});if(!r.ok)throw Error((await r.json() as {error:string}).error);}
 useEffect(()=>{let cancelled=false;void(async()=>{
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const install=ios&&!window.matchMedia('(display-mode: standalone)').matches&&!(navigator as Navigator&{standalone?:boolean}).standalone;
  setIosInstall(install);const ok='serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window&&window.isSecureContext;setSupported(ok);if(!ok||install)return;
  const r=await fetch('/api/push');if(!r.ok)return;const config=await r.json() as {ready:boolean};if(cancelled)return;setReady(config.ready);
  const registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});let sub=await registration.pushManager.getSubscription();
  const wanted=localStorage.getItem('suf-reminders-default')!=='off';
  if(!wanted&&sub){await fetch('/api/push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'remove',endpoint:sub.endpoint})});await sub.unsubscribe();sub=null;}
  if(wanted&&Notification.permission==='granted'&&!sub){const raw=atob((await fetch('/api/push').then(r=>r.json()) as {publicKey:string}).publicKey.replace(/-/g,'+').replace(/_/g,'/'));sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(raw,c=>c.charCodeAt(0))});}
  if(sub&&config.ready){await save(sub);if(!cancelled)setActive(true);}
 })().catch(()=>{if(!cancelled)setMessage('Påmindelser kunne ikke hentes. Genindlæs siden og prøv igen.');});return()=>{cancelled=true;};},[]);
 async function toggle(){setBusy(true);setMessage('');try{
  // Permission must be requested directly from a tap, particularly on iPhone.
  if(!active&&await Notification.requestPermission()!=='granted')throw Error('Tillad notifikationer i telefonens eller browserens indstillinger for at få påmindelser.');
  const registration=await navigator.serviceWorker.ready;
  let sub=await registration.pushManager.getSubscription();
  if(active){if(sub){const r=await fetch('/api/push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'remove',endpoint:sub.endpoint})});if(!r.ok)throw Error('Kunne ikke slå påmindelser fra.');await sub.unsubscribe();}localStorage.setItem('suf-reminders-default','off');setActive(false);setMessage('Påmindelser er slået fra på denne enhed.');}
  else{const r=await fetch('/api/push');if(!r.ok)throw Error('Log ind igen.');const config=await r.json() as {publicKey:string;ready:boolean};if(!config.ready)throw Error('Påmindelser er ikke klar endnu.');
   const raw=atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/'));const key=Uint8Array.from(raw,c=>c.charCodeAt(0));
   sub=sub||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});await save(sub);localStorage.setItem('suf-reminders-default','on');setActive(true);setMessage('Du får besked, når menuen frigives, og en påmindelse onsdag kl. 09, hvis du mangler at svare.');}
 }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 return <section className="push-preferences"><h2>Husk fredagsfrokosten</h2><p>Få besked, når næste menu frigives, og onsdag kl. 09, hvis du mangler at svare.</p>{iosInstall?<p className="helper">På iPhone: Åbn siden i Safari, vælg Del → Føj til hjemmeskærm. Åbn derefter appen fra hjemmeskærmen og log ind igen.</p>:!supported?<p className="helper">Åbn appen i en nyere browser på din telefon eller computer for at bruge notifikationer.</p>:!ready?<p className="helper">Automatiske påmindelser er ikke klar på denne adresse endnu.</p>:<button type="button" className="text-button" disabled={busy} onClick={()=>void toggle()}>{busy?'Vent et øjeblik…':active?'Slå påmindelser fra':'Slå påmindelser til'}</button>}{message&&<p role="status" className="helper">{message}</p>}</section>;
}
