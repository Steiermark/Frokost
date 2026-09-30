// Reminders are postponed; old callers cannot accidentally send messages.
export async function POST() {
 return Response.json({error:'Påmindelser er slået fra.'},{status:410});
}
