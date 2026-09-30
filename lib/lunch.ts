export function copenhagenNow(now = new Date()) {
 return new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Copenhagen',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now).replace(' ', 'T');
}
export function fridays(now = new Date()) {
 const d = new Date(copenhagenNow(now).slice(0,10)+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+(5-d.getUTCDay()+7)%7);
 return Array.from({length:4},(_,i)=>{const n=new Date(d); n.setUTCDate(n.getUTCDate()+i*7);return n.toISOString().slice(0,10);});
}
export function deadline(date:string){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-2);return d.toISOString().slice(0,10)+'T12:00';}
export function isClosed(date:string,now=new Date()){return copenhagenNow(now)>=deadline(date);}
export function dateLabel(date:string,options:Intl.DateTimeFormatOptions={day:'numeric',month:'long'}){return new Intl.DateTimeFormat('da-DK',{timeZone:'UTC',...options}).format(new Date(date+'T12:00:00Z'));}
