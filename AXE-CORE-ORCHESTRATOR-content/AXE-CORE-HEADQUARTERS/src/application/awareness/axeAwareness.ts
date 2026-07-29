import { getSupabase } from '@/infrastructure/supabase/supabaseClient';

export type AwarenessSnapshot={now:string; openTasks:number; overdueTasks:number; followUps:number; alerts:string[]};
export async function getAwarenessSnapshot():Promise<AwarenessSnapshot>{
 const now=new Date(); const sb=getSupabase(); if(!sb)return {now:now.toISOString(),openTasks:0,overdueTasks:0,followUps:0,alerts:[]};
 try{
  const [t,f]=await Promise.all([
   sb.from('core_tasks').select('id,status,due_date,title').neq('status','done').limit(100),
   sb.from('core_follow_ups').select('id,status,title,due_date').neq('status','done').limit(100)
  ]);
  const tasks=(t.data??[]) as Array<Record<string,unknown>>; const fs=(f.data??[]) as Array<Record<string,unknown>>;
  const overdue=tasks.filter(x=>x.due_date && new Date(String(x.due_date))<now).length;
  const alerts:string[]=[]; if(overdue)alerts.push(`${overdue} taak/taken zijn over tijd`); if(fs.length)alerts.push(`${fs.length} follow-up(s) wachten op aandacht`);
  return {now:now.toISOString(),openTasks:tasks.length,overdueTasks:overdue,followUps:fs.length,alerts};
 }catch{return {now:now.toISOString(),openTasks:0,overdueTasks:0,followUps:0,alerts:[]};}
}
export function awarenessPrompt(a:AwarenessSnapshot):string{return `\n\n## Live AXE awareness\nTijd: ${a.now}. Open taken: ${a.openTasks}. Overdue: ${a.overdueTasks}. Follow-ups: ${a.followUps}. Signalen: ${a.alerts.join('; ')||'geen urgente signalen'}. Gebruik dit alleen als relevant; verzin geen details.`;}
