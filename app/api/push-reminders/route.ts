import {hash,setting} from '../../../lib/server';
import {sendReminders,pushReady} from '../../../lib/push';
export async function POST(request:Request){
 const token=request.headers.get('X-SUF-Schedule-Token')||'';
 const expected=setting('REMINDER_SERVICE_TOKEN_HASH');
 if(!expected||!token||await hash(token)!==expected)return Response.json({error:'Ingen adgang.'},{status:403});
 try{
  if(new URL(request.url).searchParams.get('check')==='1')return Response.json({ready:pushReady(),schedule:'Wednesday 11:00 Europe/Copenhagen'},{headers:{'Cache-Control':'no-store'}});
  return Response.json(await sendReminders(),{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Påmindelser kunne ikke sendes.'},{status:503});}
}
