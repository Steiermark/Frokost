import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'SUF · Fredagsfrokost',description:'Tilmeld dig fredagsfrokost med kollegerne. Frist onsdag kl. 12.',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,title:'SUF Frokost',statusBarStyle:'default'},icons:{icon:'/favicon.svg',apple:'/icon-192.png'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="da"><body>{children}</body></html>;}
