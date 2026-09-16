// commodity-intake v5 (P0.9 S4 + P0.5/P0.6/P0.8): herkomstcontrole, niet-spoofbare limieten, geen testdata of
// geblokkeerde partijen in matching, ontvangstbevestiging alleen volgens beleid en met canonieke herkomst.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { outboundProvenance, resendPayload } from '../_shared/canonical.ts'
import { audit, outboundBlockReason, readPolicy } from '../_shared/db.ts'
import { constantTimeEqual } from '../_shared/auth.ts'
import { CANONICAL_REPLY_TO } from '../_shared/canonical.ts'

const allowedOrigins = new Set([
  'https://northseacommodity.com',
  'https://www.northseacommodity.com',
  'https://northsea-commodity-partners.lukadezeeuw1994.chatgpt.site'
])
const HOURLY_GLOBAL_LIMIT = 30
const DAILY_PER_EMAIL_LIMIT = 3
const HOURLY_PER_IP_LIMIT = 5

function cors(origin: string | null) {
  const allow = origin && allowedOrigins.has(origin) ? origin : 'https://northseacommodity.com'
  return { 'Access-Control-Allow-Origin': allow, 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Content-Type': 'application/json' }
}
const clean = (v: unknown, max=500) => typeof v === 'string' ? v.trim().slice(0,max) : ''
const num = (v: unknown) => { if(v===''||v==null) return null; const n=Number(v); return Number.isFinite(n)?n:null }
const norm = (v: unknown) => clean(v,300).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
const hasLC = (v: unknown) => /\b(l\s*\/?\s*c|letter\s+of\s+credit|mt\s*700|documentary\s+credit)\b/i.test(clean(v,500))
async function sha256(s:string){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')}
function matchScore(b:any,s:any){
  let x=0
  const bc=norm(b.commodity), sc=norm(s.commodity), bp=norm(b.product), sp=norm(s.product), bg=norm(b.grade), sg=norm(s.grade)
  if(bc&&sc&&(bc===sc||bc.includes(sc)||sc.includes(bc))) x+=30
  if(bp&&sp&&(bp===sp||bp.includes(sp)||sp.includes(bp)||(bp.includes('copper')&&sp.includes('copper')&&bp.includes('cathod')&&sp.includes('cathod')))) x+=20
  if(bg&&sg&&(bg.includes(sg)||sg.includes(bg)||(bg.includes('grade a')&&sg.includes('grade a')))) x+=10
  const bpur=Number(b.purity), spur=Number(s.purity); if(Number.isFinite(bpur)&&Number.isFinite(spur)&&spur>=bpur-0.02) x+=10
  const bq=Number(b.quantity_mt), sq=Number(s.quantity_mt||s.monthly_capacity_mt); if(Number.isFinite(bq)&&Number.isFinite(sq)&&sq>=bq) x+=10
  if(norm(b.incoterm)&&norm(s.incoterm)&&norm(b.incoterm)===norm(s.incoterm)) x+=10
  if(hasLC(b.payment_terms)&&hasLC(s.payment_terms)) x+=10
  return Math.min(100,x)
}

Deno.serve(async(req)=>{
  const origin=req.headers.get('origin'); const headers=cors(origin)
  if(req.method==='OPTIONS') return new Response('ok',{headers})
  if(req.method!=='POST') return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers})
  if(origin){
    if(!allowedOrigins.has(origin)) return new Response(JSON.stringify({error:'Origin not allowed'}),{status:403,headers})
  }else{
    // Zonder Origin (server-naar-server) alleen met een gedeelde sleutel; alleen de hash staat in de omgeving.
    const want=(Deno.env.get('NORTHSEA_INTAKE_SERVER_KEY_SHA256')||'').trim().toLowerCase()
    const got=req.headers.get('x-northsea-intake-key')||''
    if(!want||!got||!constantTimeEqual(await sha256(got.trim()),want)) return new Response(JSON.stringify({error:'Origin or server credential required'}),{status:403,headers})
  }
  const len=Number(req.headers.get('content-length')||0); if(len>32768) return new Response(JSON.stringify({error:'Request too large'}),{status:413,headers})
  try{
    const body=await req.json()
    if(clean(body.website_confirm,100)) return new Response(JSON.stringify({ok:true}),{status:200,headers})
    const type=clean(body.type,20), companyName=clean(body.companyName,180), country=clean(body.country,100), contactName=clean(body.contactName,180), email=clean(body.email,254).toLowerCase(), commodity=clean(body.commodity,120), product=clean(body.product,180)
    if(!['buyer','supplier'].includes(type)||!companyName||!country||!contactName||!commodity||!product||!/^\S+@\S+\.\S+$/.test(email)) return new Response(JSON.stringify({error:'Please complete all required fields.'}),{status:400,headers})
    const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}'); const secretKey=secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); if(!secretKey) throw new Error('Server configuration error')
    const supabase=createClient(Deno.env.get('SUPABASE_URL')!,secretKey,{auth:{persistSession:false,autoRefreshToken:false}})

    // Rate limits op sleutels die een client niet kan kiezen: cf-connecting-ip (gezet door de edge), het e-mailadres en een globaal plafond.
    const ip=(req.headers.get('cf-connecting-ip')||'unknown').trim()
    const buckets:[string,number,number][]=[[`ip:${await sha256(ip)}`,3600000,HOURLY_PER_IP_LIMIT],[`email:${await sha256(email)}`,86400000,DAILY_PER_EMAIL_LIMIT],['global',3600000,HOURLY_GLOBAL_LIMIT]]
    const now=Date.now()
    for(const [bucket,window,limit] of buckets){
      const {data:rl,error:rle}=await supabase.from('intake_rate_limits').select('*').eq('ip_hash',bucket).maybeSingle()
      if(rle) throw rle
      const fresh=!rl||now-new Date(rl.window_start).getTime()>=window
      if(!fresh&&rl.request_count>=limit) return new Response(JSON.stringify({error:'Too many submissions. Please try again later.'}),{status:429,headers})
      const {error:we}=fresh
        ? await supabase.from('intake_rate_limits').upsert({ip_hash:bucket,window_start:new Date().toISOString(),request_count:1,updated_at:new Date().toISOString()})
        : await supabase.from('intake_rate_limits').update({request_count:rl.request_count+1,updated_at:new Date().toISOString()}).eq('ip_hash',bucket)
      if(we) throw we
    }

    let companyId:string|null=null, contactId:string|null=null
    const {data:existingContact}=await supabase.from('contacts').select('id,company_id').eq('email',email).limit(1).maybeSingle()
    if(existingContact){ companyId=existingContact.company_id; contactId=existingContact.id }
    if(!companyId){
      const {data:company,error}=await supabase.from('companies').insert({company_name:companyName,country,website:clean(body.website,300)||null,company_type:type,commodity_focus:[commodity],source_url:'https://northseacommodity.com',source_type:'northseacommodity.com intake',trade_activity:clean(body.notes,2000)||null,verification_status:'unverified',verification_score:0,notes:'Submitted through NorthSea Commodity Partners public commercial intake.'}).select('id').single(); if(error) throw error; companyId=company.id
      const {data:contact,error:ce}=await supabase.from('contacts').insert({company_id:companyId,full_name:contactName,email,phone:clean(body.phone,80)||null,is_primary:true,verification_status:'unverified',notes:'Public website intake contact.'}).select('id').single(); if(ce) throw ce; contactId=contact.id
    }

    let record:any=null
    if(type==='buyer'){
      const {data,error}=await supabase.from('buyer_requirements').insert({company_id:companyId,commodity,product,grade:clean(body.grade,180)||null,purity:num(body.purity),quantity_mt:num(body.quantityMt),frequency:clean(body.frequency,120)||null,contract_duration:clean(body.contractDuration,120)||null,origin_preference:clean(body.originPreference,180)||null,destination:clean(body.destination,180)||null,incoterm:clean(body.incoterm,80)||null,payment_terms:clean(body.paymentTerms,300)||null,target_price:num(body.targetPrice),target_price_currency:clean(body.targetPriceCurrency,12)||'USD',evidence:clean(body.notes,3000)||null,status:'draft'}).select('*').single(); if(error) throw error; record=data
    }else{
      const {data,error}=await supabase.from('supplier_offers').insert({company_id:companyId,commodity,product,grade:clean(body.grade,180)||null,purity:num(body.purity),origin:clean(body.origin,180)||null,quantity_mt:num(body.quantityMt),monthly_capacity_mt:num(body.monthlyCapacityMt),loading_port:clean(body.loadingPort,180)||null,incoterm:clean(body.incoterm,80)||null,payment_terms:clean(body.paymentTerms,300)||null,price_basis:clean(body.priceBasis,300)||null,price:num(body.price),price_currency:clean(body.priceCurrency,12)||'USD',mandate_status:clean(body.mandateStatus,180)||null,documentation:{notes:clean(body.notes,3000)},verification_score:0,status:'draft'}).select('*').single(); if(error) throw error; record=data
    }

    await supabase.from('communications').insert({company_id:companyId,contact_id:contactId,direction:'inbound',channel:'other',subject:`Website ${type} intake: ${commodity} / ${product}`,body:clean(body.notes,3000)||'Public website commercial intake submitted.',occurred_at:new Date().toISOString()})

    const candidates:any[]=[]
    if(type==='buyer'){
      const {data:sups}=await supabase.from('supplier_offers').select('*').eq('is_synthetic',false).in('status',['draft','active','paused','matched']).limit(100)
      for(const s of sups||[]){const score=matchScore(record,s); if(score>=60)candidates.push({score,buyer_requirement_id:record.id,supplier_offer_id:s.id})}
    }else{
      const {data:buyers}=await supabase.from('buyer_requirements').select('*').eq('is_synthetic',false).in('status',['draft','active','paused','matched']).limit(100)
      for(const b of buyers||[]){const score=matchScore(b,record); if(score>=60)candidates.push({score,buyer_requirement_id:b.id,supplier_offer_id:record.id})}
    }
    candidates.sort((a,b)=>b.score-a.score)
    let matches=0
    for(const c of candidates.slice(0,3)){
      const {data:blok}=await supabase.rpc('northsea_pair_block_reason',{p_requirement_id:c.buyer_requirement_id,p_offer_id:c.supplier_offer_id})
      if(blok) continue
      const {data:exists}=await supabase.from('opportunities').select('id').eq('buyer_requirement_id',c.buyer_requirement_id).eq('supplier_offer_id',c.supplier_offer_id).limit(1).maybeSingle()
      if(!exists){const {error}=await supabase.from('opportunities').insert({...c,match_score:c.score,stage:'identified',next_action:'Qualify both counterparties and verify commercial terms before any identity disclosure.',notes:'Auto-identified by NorthSea website intake matcher; not independently verified.'}); if(!error)matches++}
    }

    // Ontvangstbevestiging is een automatisch antwoord: alleen als het beleid niet-bindende
    // automatische antwoorden toestaat, de mailbox canoniek is en er geen contactbeleid geldt.
    const resendKey=Deno.env.get('RESEND_API_KEY')
    const policy=await readPolicy(supabase)
    const blok=await outboundBlockReason(supabase,{companyId,contactId,email})
    const ackAllowed=!!resendKey&&policy.ok&&policy.policy.auto_reply_nonbinding===true&&(policy.policy.operational_mailbox||'').trim().toLowerCase()===CANONICAL_REPLY_TO&&!blok
    let acknowledged=false
    if(ackAllowed){
      const ack=`Dear ${contactName},\n\nThank you for contacting NorthSea Commodity Partners. We have received your ${type==='buyer'?'buying requirement':'supply submission'} for ${product}.\n\nOur process is qualification-first: submitted information is reviewed before any counterparty introduction or commercial commitment. We may contact you for company, product, payment, logistics or compliance information where required.\n\nReference: ${record.id}\n\nKind regards,\nNorthSea Commodity Partners\nIndependent Commodity Sourcing & Commercial Intermediation`
      const onderwerp=`NorthSea — ${type==='buyer'?'Requirement':'Supply Submission'} Received`
      const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json','Idempotency-Key':`northsea-intake-${record.id}`},body:JSON.stringify({...resendPayload(email,onderwerp,ack,ack.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>'))})})
      if(r.ok){const sent=await r.json(); acknowledged=true; await supabase.from('communications').insert({company_id:companyId,contact_id:contactId,direction:'outbound',channel:'email',subject:onderwerp,body:ack,occurred_at:new Date().toISOString(),...outboundProvenance({providerMessageId:sent.id,actor:'commodity-intake',actorType:'automation',approvalBasis:'system_acknowledgement'})})}
      else console.error('Acknowledgement send failed',r.status)
    }
    await audit(supabase,{actor_type:'automation',actor:'commodity-intake',action:'intake_acknowledgement_decision',company_id:companyId,contact_id:contactId,
      policy_decision:{allowed:ackAllowed,reasons:[!resendKey&&'resend_not_configured',!policy.ok&&`policy_unavailable:${(policy as {error:string}).error}`,policy.ok&&policy.policy.auto_reply_nonbinding!==true&&'auto_reply_nonbinding_disabled',policy.ok&&(policy.policy.operational_mailbox||'').trim().toLowerCase()!==CANONICAL_REPLY_TO&&'operational_mailbox_not_canonical',blok&&`contact_policy:${blok}`].filter(Boolean)},
      details:{record_id:record.id,type,acknowledged,matches_identified:matches}})
    return new Response(JSON.stringify({ok:true,message:'Submission received.',reference:record.id,matches_identified:matches}),{status:201,headers})
  }catch(error){console.error(error);return new Response(JSON.stringify({error:'We could not process the submission. Please contact trade@northseacommodity.com.'}),{status:500,headers})}
})
