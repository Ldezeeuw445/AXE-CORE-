// northsea-desk v4 (P0.4, P0.5, P0.9): zelfde acties en handtekening als v3; menselijke goedkeuring met herkomst,
// contactbeleid-fouten als 409, audit naar northsea_audit_events in plaats van communications.
const PUBLIC_KEY = {"crv":"P-256","ext":true,"key_ops":["verify"],"kty":"EC","x":"g8DnoZEwTohxagetI22vT8-b_OTjwJ486T7Us8H5cuY","y":"sbxBdrLtOVsoX31JIxduCt4_Mtmb1Z7EUg1bMvw2nxE"};
const TABLES = ["companies","contacts","buyer_requirements","supplier_offers","opportunities","communications","verification_checks","deal_documents","commissions","email_intelligence","reply_drafts","call_intelligence","action_queue","sourcing_campaigns"];
const STAGES = ["identified","verifying","qualified","contacted","engaged","matching","introduced","negotiating","contracting","shipment","commission_due","won","lost"];
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"no-store"}});
const bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function rest(path:string,method="GET",body?:unknown){
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const r=await fetch(Deno.env.get("SUPABASE_URL")+"/rest/v1/"+path,{method,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation"},body:body===undefined?undefined:JSON.stringify(body)});
 if(!r.ok){const t=await r.text().catch(()=>"");const g=t.match(/NS_(CONTACT_POLICY|APPROVAL_INTEGRITY|OUTBOUND_PROVENANCE|SYNTHETIC)/);throw Error(g?g[0]:"Database operation failed");}
 return r.status===204?[]:await r.json();
}
async function all(table:string){
 const rows:unknown[]=[];
 for(let offset=0;offset<20000;offset+=500){
  const page=await rest(table+"?select=*&order=id&limit=500&offset="+offset);
  rows.push(...page.map((row:Record<string,unknown>)=>{if(table==="call_intelligence"){const {raw_event,...safe}=row;return safe;}if(table==="action_queue"){const {metadata,...safe}=row;return safe;}return row;}));if(page.length<500)return rows;
 }
 throw Error("Dataset exceeds snapshot limit; narrow the query before displaying totals.");
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const raw=await req.text();if(raw.length>32000)return json({error:"Request too large"},413);
  const key=await crypto.subtle.importKey("jwk",PUBLIC_KEY,{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
  const sig=req.headers.get("x-desk-signature")||"";
  if(!sig||!await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},key,bytes(sig),new TextEncoder().encode(raw)))return json({error:"Unauthorized"},401);
  const p=JSON.parse(raw);
  if(!p.actor||!Number.isFinite(p.expires)||p.expires<Date.now()||p.expires>Date.now()+60000)return json({error:"Expired request"},401);
  if(typeof p.actor!=="string"||!p.actor.trim()||p.actor.length>120)return json({error:"Invalid actor"},400);
  if(p.action==="snapshot"){
   const entries=await Promise.all(TABLES.map(async t=>[t,await all(t)]));
   return json({tables:Object.fromEntries(entries),fetchedAt:new Date().toISOString()});
  }
  if(!/^[0-9a-f-]{36}$/i.test(p.id||""))return json({error:"Invalid record"},400);
  const editing=p.action==='edit_draft'||p.action==='create_reply';
  if(editing&&(typeof p.to_email!=='string'||p.to_email.length>254||! /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(p.to_email)||typeof p.subject!=='string'||!p.subject.trim()||p.subject.length>300||/[\r\n]/.test(p.subject)||typeof p.body!=='string'||!p.body.trim()||p.body.length>10000||typeof p.sensitive_action!=='boolean'))return json({error:'Enter one valid recipient, a subject and a message (maximum 10,000 characters).'},400);
  if(p.action==='create_reply'){
   if(!/^[0-9a-f-]{36}$/i.test(p.communication_id||''))return json({error:'Original email required.'},400);
   const original=(await rest('communications?id=eq.'+p.communication_id+'&select=*'))[0];
   if(!original||original.channel!=='email')return json({error:'Original email not found.'},404);
   const existing=(await rest('reply_drafts?id=eq.'+p.id+'&select=*'))[0];
   if(existing)return json({ok:true,record:existing,message:'Existing draft opened. Review before sending.'});
   const record=(await rest('reply_drafts','POST',{id:p.id,communication_id:original.id,company_id:original.company_id,contact_id:original.contact_id,opportunity_id:original.opportunity_id,to_email:p.to_email,subject:p.subject.trim(),body:p.body.trim(),purpose:'Manual reply from Deal Desk',approval_status:'pending',lifecycle_state:'approval_required',sensitive_action:p.sensitive_action,generated_by:'human'}))[0];
   return json({ok:true,record,message:'Draft saved. Review and approve before sending.'});
  }
  const draftAction=["approve_draft","reject_draft","send_draft","edit_draft"].includes(p.action);
  const table=draftAction?"reply_drafts":"opportunities";
  if(!draftAction&&p.action!=="update_deal")return json({error:"Unknown action"},400);
  const rows=await rest(table+"?id=eq."+p.id+"&select=*");const row=rows[0];
  if(!row)return json({error:"Record not found"},404);
  if(row.updated_at!==p.updated_at)return json({error:"This record changed. Refresh and review it again."},409);
  if(draftAction&&(row.sent_at||row.resend_email_id))return json({error:"This draft has already been sent."},409);
  const now=new Date().toISOString();let patch:Record<string,unknown>={updated_at:now};
  if(draftAction){
   if(p.action==="approve_draft"&&row.approval_status!=="pending")return json({error:"Only pending drafts can be approved."},409);
   if(!['reject_draft','edit_draft'].includes(p.action)&&row.sensitive_action){
    if(!row.opportunity_id)return json({error:"Link this sensitive reply to a protected deal before approval."},409);
    const deals=await rest("opportunities?id=eq."+row.opportunity_id+"&select=commission_agreement_status");
    if(deals[0]?.commission_agreement_status!=="signed")return json({error:"Signed commission protection required for sensitive replies."},409);
   }
   if(p.action==="send_draft"){
    if(row.approval_status!=="approved"||p.confirm!==true)return json({error:"Review and confirm an approved reply before sending."},409);
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const response=await fetch(Deno.env.get("SUPABASE_URL")+"/functions/v1/send-approved-reply",{method:"POST",headers:{Authorization:"Bearer "+service,"Content-Type":"application/json"},body:JSON.stringify({draft_id:row.id,requested_by:p.actor})});
    const result=await response.json();if(result?.error==="contact_policy_blocked")return json({error:"Contact policy blocks sending to this counterparty."},409);if(result?.error==="human_approval_provenance_missing")return json({error:"This draft has no recorded human approval. Reject and re-approve it before sending."},409);if(!response.ok||!result.ok)return json({error:"Sending could not be confirmed. Refresh the draft before retrying."},502);
    return json({ok:true,message:"Email submitted to provider. Delivery is not yet confirmed."});
   }
   if(p.action==='edit_draft'){
    if(!['pending','rejected'].includes(row.approval_status))return json({error:'Reject the approved draft before editing it.'},409);
    patch={...patch,to_email:p.to_email,subject:p.subject.trim(),body:p.body.trim(),sensitive_action:!!row.sensitive_action||p.sensitive_action,approval_status:'pending',approved_at:null,approved_by:null,approval_actor_type:null,approval_channel:null,lifecycle_state:'approval_required'};
   }else patch=p.action==="approve_draft"?{...patch,approval_status:"approved",approved_at:now,approved_by:p.actor.trim(),approval_actor_type:"human",approval_channel:"deal_desk",lifecycle_state:"human_approved"}:{...patch,approval_status:"rejected",approved_at:null,approved_by:null,approval_actor_type:null,approval_channel:null,lifecycle_state:"rejected"};
  } else {
   if(typeof p.next_action!=="string"||p.next_action.length>3000||!STAGES.includes(p.stage))return json({error:"Invalid next action or stage"},400);
   if(["introduced","negotiating","contracting","shipment","commission_due","won"].includes(p.stage)&&row.commission_agreement_status!=="signed")return json({error:"Signed commission protection is required before introduction or later stages."},409);
   patch={...patch,next_action:p.next_action.trim()||null,stage:p.stage};
  }
  const changed=await rest(table+"?id=eq."+p.id+"&updated_at=eq."+encodeURIComponent(row.updated_at),"PATCH",patch);
  if(!changed.length)return json({error:"Record changed. Refresh before retrying."},409);
  let auditWarning=false;
  try{await rest("northsea_audit_events","POST",{actor_type:"human",actor:p.actor.trim(),action:"deal_desk_"+p.action,approval_identity:p.action==="approve_draft"?p.actor.trim():null,company_id:row.company_id||null,opportunity_id:draftAction?row.opportunity_id:row.id,draft_id:draftAction?row.id:null,communication_id:draftAction?row.communication_id:null,details:{record_id:row.id,before:draftAction?{approval_status:row.approval_status}:{stage:row.stage,next_action:row.next_action},after:patch}});}catch{auditWarning=true;}
  return json({ok:true,record:draftAction?changed[0]:undefined,message:auditWarning?"Saved, but audit entry could not be written.":"Saved to AXE Commodities.",auditWarning});
 }catch(e){const m=String((e as Error)?.message??"");if(m==="NS_CONTACT_POLICY")return json({error:"Contact policy (do-not-contact or test data) blocks this action."},409);if(m==="NS_APPROVAL_INTEGRITY")return json({error:"Approval integrity check failed; no approval was recorded."},409);return json({error:"Unable to complete the request. No successful result has been confirmed."},500);}
});
