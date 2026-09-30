import {database,user} from '../../../lib/server';
export async function GET(request:Request){
 try{
  if(!await user(request))return new Response(null,{status:401});
  const id=new URL(request.url).searchParams.get('id');
  if(!id||id.length>100)return new Response(null,{status:400});
  const dish=await database().prepare("SELECT photo FROM dishes WHERE id=? AND active=1 AND photo<>''").bind(id).first<{photo:string}>();
  if(!dish)return new Response(null,{status:404});
  const binary=atob(dish.photo.split(',')[1]);const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  return new Response(bytes,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response(null,{status:503});}
}
