'use client';
import {useEffect,useRef,useState} from 'react';
export default function StartupScreen({children}:{children:React.ReactNode}){
 const [visible,setVisible]=useState(true);
 const logo=useRef<HTMLImageElement>(null);
 useEffect(()=>{
  // Internal page navigation is not a new app launch. Reloads still show the logo.
  const navigation=performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined;
  if(navigation?.type==='navigate'&&document.referrer&&new URL(document.referrer).origin===location.origin){setVisible(false);return;}
  let displayTimer:ReturnType<typeof setTimeout>|undefined;
  const start=()=>{if(displayTimer===undefined)displayTimer=setTimeout(()=>setVisible(false),3000);};
  const img=logo.current;
  if(img?.complete)start();else{img?.addEventListener('load',start);img?.addEventListener('error',start);}
  const fallback=setTimeout(()=>setVisible(false),10000);
  return()=>{clearTimeout(displayTimer);clearTimeout(fallback);img?.removeEventListener('load',start);img?.removeEventListener('error',start);};
 },[]);
 return <>{visible&&<div className="startup-screen" role="status" aria-label="SUF Fredagsfrokost starter"><img ref={logo} src="/startup-logo.png" alt="SUF · Den Sociale Udviklingsfond · Fredagsfrokost" width={1254} height={1254} fetchPriority="high"/></div>}<div className={visible?'startup-content waiting':'startup-content'} inert={visible} aria-hidden={visible||undefined}>{children}</div><noscript><style>{'.startup-screen{display:none!important}.startup-content.waiting{visibility:visible!important}'}</style><p>Slå JavaScript til for at bruge frokostappen.</p></noscript></>;
}
