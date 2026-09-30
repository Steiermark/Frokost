import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'SUF · Fredagsfrokost',description:'Tilmeld dig fredagsfrokost med kollegerne. Frist onsdag kl. 12.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="da"><body>{children}</body></html>;}
