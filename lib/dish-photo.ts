export const MAX_PHOTO_LENGTH = 280000;
export function validDishPhoto(value: unknown): value is string {
 if(typeof value!=='string'||value.length>MAX_PHOTO_LENGTH)return false;
 if(value==='')return true;
 if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return false;
 try{const bytes=atob(value.split(',')[1]);return bytes.length>4&&bytes.charCodeAt(0)===255&&bytes.charCodeAt(1)===216&&bytes.charCodeAt(2)===255&&bytes.charCodeAt(bytes.length-2)===255&&bytes.charCodeAt(bytes.length-1)===217;}catch{return false;}
}

// Convert locally: only the small JPEG is uploaded; original metadata is omitted.
export async function prepareDishPhoto(file:File):Promise<string>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Vælg et JPG-, PNG- eller WebP-foto.');
 if(file.size>12*1024*1024)throw Error('Fotoet må højst fylde 12 MB.');
 const url=URL.createObjectURL(file);
 try{
  const picture=new Image();
  await new Promise<void>((resolve,reject)=>{picture.onload=()=>resolve();picture.onerror=()=>reject(Error('Fotoet kunne ikke åbnes. Vælg et andet.'));picture.src=url;});
  if(!picture.naturalWidth||!picture.naturalHeight)throw Error('Fotoet er tomt.');
  const canvas=document.createElement('canvas');const context=canvas.getContext('2d');
  if(!context)throw Error('Browseren kunne ikke behandle fotoet.');
  for(const size of [960,720,480,320]){
   const scale=Math.min(1,size/Math.max(picture.naturalWidth,picture.naturalHeight));
   canvas.width=Math.max(1,Math.round(picture.naturalWidth*scale));canvas.height=Math.max(1,Math.round(picture.naturalHeight*scale));
   context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(picture,0,0,canvas.width,canvas.height);
   const result=canvas.toDataURL('image/jpeg',0.8);if(validDishPhoto(result))return result;
  }
  throw Error('Fotoet er for stort. Vælg et mindre foto.');
 }finally{URL.revokeObjectURL(url);}
}
