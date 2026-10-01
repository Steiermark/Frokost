import type { Metadata } from 'next';
import './globals.css';
import StartupScreen from '../components/startup-screen';
export const metadata:Metadata={title:'SUF · Fredagsfrokost',description:'Tilmeld dig fredagsfrokost med kollegerne. Frist onsdag kl. 12.',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,title:'SUF Frokost',statusBarStyle:'default'},icons:{icon:'/favicon.png',apple:'/apple-touch-icon.png'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="da"><body><StartupScreen>{children}</StartupScreen></body></html>;}
