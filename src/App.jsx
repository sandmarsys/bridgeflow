import React, { useState, useEffect, useRef, useCallback } from "react";

const STORAGE_KEY   = "bf-contacts-v3";
const FOLLOWUP_KEY  = "bf-followups-v3";
const CAL_LINKS_KEY = "bf-cal-links-v1";

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyukMZkIN9kJLNX3Gg2L-xYZpudEFHEgvvCQK_RNQnn9yBdRZr1CCIyKfdOvncA00YjRg/exec";

const STAGES = ["Connection","Conversation","Commitment","Client","Continuation"];
const STAGE_META = {
  Connection:   { bg:"#0D1F3C", text:"#60A5FA", dot:"#3B82F6", icon:"🔗", desc:"Outreach & prospecting" },
  Conversation: { bg:"#1A1040", text:"#A78BFA", dot:"#8B5CF6", icon:"💬", desc:"Meeting booked" },
  Commitment:   { bg:"#0D2210", text:"#86EFAC", dot:"#22C55E", icon:"📋", desc:"Proposal presented" },
  Client:       { bg:"#1A1200", text:"#FDE68A", dot:"#F59E0B", icon:"💰", desc:"Enrolled & active" },
  Continuation: { bg:"#1A0A1A", text:"#F0ABFC", dot:"#D946EF", icon:"♾️", desc:"Referrals & renewals" },
};

const CADENCE_DAYS   = [2,5,10,20];
const CADENCE_LABELS = ["Follow-up 1","Follow-up 2","Follow-up 3","Follow-up 4"];
const COLD_MONTHS    = 3;

const D = {
  bg:"#080C14", surface:"#0D1220", card:"#111827",
  border:"#1E2D42", borderHi:"#2E4060",
  text:"#E8EEF7", textSub:"#6B82A0", textMuted:"#3A4F68",
  accent:"#3B82F6", green:"#22C55E", red:"#EF4444", yellow:"#F59E0B",
  coldBorder:"#2A3A50", coldText:"#7A9BB5",
};

const S = {
  btn1:  {background:D.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px 18px",fontSize:14,fontFamily:"inherit",cursor:"pointer",fontWeight:500},
  btn2:  {background:"transparent",color:D.textSub,border:`1.5px solid ${D.border}`,borderRadius:8,padding:"8px 18px",fontSize:14,fontFamily:"inherit",cursor:"pointer"},
  btnSm: {background:D.surface,color:D.textSub,border:`1px solid ${D.border}`,borderRadius:6,padding:"6px 12px",fontSize:13,fontFamily:"inherit",cursor:"pointer"},
  lbl:   {display:"block",fontSize:11,color:D.textSub,fontWeight:600,marginBottom:6,textTransform:"uppercase",letterSpacing:0.6},
  inp:   {width:"100%",padding:"9px 12px",borderRadius:8,border:`1.5px solid ${D.border}`,fontSize:14,fontFamily:"inherit",boxSizing:"border-box",outline:"none",background:D.surface,color:D.text},
  card:  {background:D.card,border:`1.5px solid ${D.border}`,borderRadius:12,padding:18,marginBottom:18},
  secH:  {margin:"0 0 14px",fontSize:15,fontWeight:600,color:D.text},
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
function todayStr()  { return new Date().toISOString().split("T")[0]; }
function addDays(dateStr, days) {
  try {
    const clean = (dateStr||todayStr()).split("T")[0];
    const d = new Date(clean+"T00:00:00");
    if (isNaN(d)) return todayStr();
    d.setDate(d.getDate()+days); return d.toISOString().split("T")[0];
  } catch { return todayStr(); }
}
function addMonths(dateStr, months) {
  const d = new Date(dateStr+"T00:00:00"); d.setMonth(d.getMonth()+months); return d.toISOString().split("T")[0];
}
function daysBetween(dateStr) {
  const today = new Date(new Date().toDateString());
  const due   = new Date(dateStr+"T00:00:00");
  return Math.round((due-today)/(1000*60*60*24));
}
function formatDate(d) {
  if (!d) return "";
  return new Date(d+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
}
function isOverdue(d){ return d ? new Date(d+"T00:00:00")<new Date(new Date().toDateString()) : false; }
function isToday(d)  { return d ? d===todayStr() : false; }
function stringToColor(str){
  const c=["#3B82F6","#8B5CF6","#EC4899","#14B8A6","#F59E0B","#10B981","#6366F1","#EF4444"];
  let h=0; for(let i=0;i<str.length;i++) h=str.charCodeAt(i)+((h<<5)-h);
  return c[Math.abs(h)%c.length];
}
function getCadenceDates(stageEnteredAt) {
  if (!stageEnteredAt) return [];
  return CADENCE_DAYS.map((d,i)=>({ label:CADENCE_LABELS[i], date:addDays(stageEnteredAt,d), day:d }));
}
function getNextCadence(contact) {
  if (!contact.stageEnteredAt||contact.cold) return null;
  const cadence=getCadenceDates(contact.stageEnteredAt);
  const completed=contact.cadenceCompleted||[];
  return cadence.find(c=>!completed.includes(c.date))||null;
}
function getUrgency(contact) {
  if (contact.cold) {
    if (!contact.coldFollowUpDate) return null;
    const diff=daysBetween(contact.coldFollowUpDate);
    if (diff<0)  return{level:"overdue",color:D.coldText,label:`${Math.abs(diff)}d overdue`,diff};
    if (diff===0) return{level:"today", color:"#7AB8D4",label:"Due today",diff};
    return        {level:"upcoming",   color:D.coldText,label:`in ${diff}d`,diff};
  }
  const next=getNextCadence(contact); if(!next) return null;
  const diff=daysBetween(next.date);
  if (diff<0)  return{level:"overdue",color:D.red,   label:`${Math.abs(diff)}d overdue`,diff};
  if (diff===0) return{level:"today", color:"#F97316",label:"Due today",diff};
  if (diff<=2)  return{level:"soon",  color:D.yellow, label:`Due in ${diff}d`,diff};
  return        {level:"upcoming",   color:D.textSub, label:`Due in ${diff}d`,diff};
}
function getDateUrgency(dateStr) {
  const diff=daysBetween(dateStr);
  if (diff<0)  return{level:"overdue",color:D.red,   label:`${Math.abs(diff)}d overdue`,diff};
  if (diff===0) return{level:"today", color:"#F97316",label:"Due today",diff};
  if (diff<=2)  return{level:"soon",  color:D.yellow, label:`Due in ${diff}d`,diff};
  return        {level:"upcoming",   color:D.textSub, label:`Due in ${diff}d`,diff};
}

const emptyContact={name:"",company:"",email:"",phone:"",whatsapp:"",linkedin:"",stage:"Connection",notes:""};

function normalizeContact(c) {
  const str=v=>(v===null||v===undefined)?"":String(v);
  const safe=v=>{ try{const d=new Date(v);return isNaN(d)?todayStr():v;}catch{return todayStr();}};
  const safeEnteredAt=str(c.stageEnteredAt)||(c.createdAt?str(c.createdAt).split("T")[0]:todayStr());
  return{
    ...c,
    name:str(c.name),company:str(c.company),email:str(c.email),phone:str(c.phone),
    whatsapp:str(c.whatsapp),linkedin:str(c.linkedin),notes:str(c.notes),
    stage:str(c.stage)||"Connection",
    createdAt:str(c.createdAt)||new Date().toISOString(),
    stageEnteredAt:safe(safeEnteredAt).split("T")[0],
    coldSince:str(c.coldSince),coldFollowUpDate:str(c.coldFollowUpDate),
    conversations:Array.isArray(c.conversations)?c.conversations.map(cv=>({...cv,date:cv.date||new Date().toISOString(),text:str(cv.text)})):[],
    cadenceCompleted:Array.isArray(c.cadenceCompleted)?c.cadenceCompleted:[],
    cold:c.cold===true||c.cold==="TRUE",
  };
}

// ── SHEETS SYNC ───────────────────────────────────────────────────────────────
function contactsToRows(contacts){
  return[
    ["id","name","company","email","phone","whatsapp","linkedin","stage","notes","createdAt","conversations","stageEnteredAt","cadenceCompleted","cold","coldSince","coldFollowUpDate"],
    ...contacts.map(c=>[c.id,c.name,c.company||"",c.email||"",c.phone||"",c.whatsapp||"",c.linkedin||"",c.stage,c.notes||"",c.createdAt,JSON.stringify(c.conversations||[]),c.stageEnteredAt||"",JSON.stringify(c.cadenceCompleted||[]),c.cold?"TRUE":"FALSE",c.coldSince||"",c.coldFollowUpDate||""])
  ];
}
function followupsToRows(followups){
  return[["id","contactId","date","note","done"],...followups.map(f=>[f.id,f.contactId,f.date,f.note||"",f.done?"TRUE":"FALSE"])];
}
function rowsToContacts(rows){
  if(!rows||rows.length<2) return[];
  const[h,...data]=rows;
  return data.filter(r=>r[0]).map(r=>{
    const o={};h.forEach((k,i)=>{const v=r[i];o[k]=(v===null||v===undefined)?"":String(v);});
    try{o.conversations=JSON.parse(o.conversations||"[]");}catch{o.conversations=[];}
    try{o.cadenceCompleted=JSON.parse(o.cadenceCompleted||"[]");}catch{o.cadenceCompleted=[];}
    o.cold=o.cold==="TRUE";return o;
  });
}
function rowsToFollowups(rows){
  if(!rows||rows.length<2) return[];
  const[h,...data]=rows;
  return data.filter(r=>r[0]).map(r=>{const o={};h.forEach((k,i)=>o[k]=r[i]||"");o.done=o.done==="TRUE";return o;});
}
async function pushToScript(contacts,followups){
  const res=await fetch(APPS_SCRIPT_URL,{method:"POST",body:JSON.stringify({action:"sync",contacts:contactsToRows(contacts),followups:followupsToRows(followups)})});
  const json=await res.json();if(!json.ok) throw new Error(json.error||"Sync failed");
}
async function pullFromScript(){
  const res=await fetch(APPS_SCRIPT_URL);const json=await res.json();
  if(!json.ok) throw new Error(json.error||"Load failed");
  return{contacts:rowsToContacts(json.contacts),followups:rowsToFollowups(json.followups)};
}

// ── SHARED COMPONENTS ─────────────────────────────────────────────────────────
function StageBadge({stage,showDesc}){
  const m=STAGE_META[stage]||STAGE_META.Connection;
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,background:m.bg,color:m.text,fontSize:12,fontWeight:600}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:m.dot,display:"inline-block"}}/>
      {stage}{showDesc&&<span style={{fontWeight:400,opacity:0.75,marginLeft:2}}>· {m.desc}</span>}
    </span>
  );
}
function ColdBadge(){
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,background:"#141C28",color:D.coldText,fontSize:12,fontWeight:600,border:`1px solid ${D.coldBorder}`}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:D.coldText,display:"inline-block"}}/>Cold
    </span>
  );
}
function RawUrgencyBadge({u}){
  if(!u) return null;
  return(
    <span style={{fontSize:11,fontWeight:600,color:u.color,background:u.color+"22",padding:"2px 8px",borderRadius:20,whiteSpace:"nowrap"}}>
      {u.level==="overdue"?"🔴":u.level==="today"?"🟠":u.level==="soon"?"🟡":"🔵"} {u.label}
    </span>
  );
}
function UrgencyBadge({contact}){return <RawUrgencyBadge u={getUrgency(contact)}/>;}
function InfoRow({label,value,link}){
  return(
    <div>
      <div style={{fontSize:11,color:"#3A4F68",fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:3}}>{label}</div>
      {link?<a href={link} target="_blank" rel="noreferrer" style={{fontSize:14,color:"#60A5FA",textDecoration:"none"}}>{value}</a>
           :<div style={{fontSize:14,color:"#E8EEF7"}}>{value}</div>}
    </div>
  );
}

// ── PIPELINE BAR ──────────────────────────────────────────────────────────────
function PipelineBar({stageCounts,filterStage,setFilterStage,totalContacts,urgentCount,coldCount,coldDueCount,onTabClick}){
  return(
    <div style={{...S.card}}>
      <p style={{margin:"0 0 12px",fontSize:11,color:D.textSub,fontWeight:600,textTransform:"uppercase",letterSpacing:0.6}}>Pipeline Overview</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:12}}>
        <button onClick={()=>onTabClick("contacts")} style={{background:"#0D1828",border:`1.5px solid #2E4060`,borderRadius:8,padding:"10px 8px",cursor:"pointer",textAlign:"center"}}>
          <div style={{fontSize:18,marginBottom:4}}>👥</div>
          <div style={{fontSize:10,fontWeight:600,color:D.textSub}}>Contacts</div>
          <div style={{fontSize:22,fontWeight:700,color:D.text,lineHeight:1.3,marginTop:2}}>{totalContacts}</div>
        </button>
        <button onClick={()=>onTabClick("dashboard")} style={{background:urgentCount>0?"#1A0D00":"#0D1828",border:`1.5px solid ${urgentCount>0?D.red+"66":"#2E4060"}`,borderRadius:8,padding:"10px 8px",cursor:"pointer",textAlign:"center"}}>
          <div style={{fontSize:18,marginBottom:4}}>📅</div>
          <div style={{fontSize:10,fontWeight:600,color:urgentCount>0?D.red:D.textSub}}>Follow-ups</div>
          <div style={{fontSize:22,fontWeight:700,color:urgentCount>0?D.red:D.text,lineHeight:1.3,marginTop:2}}>{urgentCount}</div>
          {urgentCount>0&&<div style={{fontSize:9,color:D.red,marginTop:1}}>urgent</div>}
        </button>
        <button onClick={()=>onTabClick("cold")} style={{background:coldDueCount>0?"#0A1018":"#0D1828",border:`1.5px solid ${coldDueCount>0?"#2A5A78":"#2E4060"}`,borderRadius:8,padding:"10px 8px",cursor:"pointer",textAlign:"center"}}>
          <div style={{fontSize:18,marginBottom:4}}>❄️</div>
          <div style={{fontSize:10,fontWeight:600,color:coldDueCount>0?"#7AB8D4":D.textSub}}>Cold</div>
          <div style={{fontSize:22,fontWeight:700,color:coldDueCount>0?"#7AB8D4":D.text,lineHeight:1.3,marginTop:2}}>{coldCount}</div>
          {coldDueCount>0&&<div style={{fontSize:9,color:"#7AB8D4",marginTop:1}}>{coldDueCount} due</div>}
        </button>
      </div>
      <div style={{height:1,background:D.border,marginBottom:12}}/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
        {STAGES.map((st,i)=>{
          const m=STAGE_META[st];const active=filterStage===st;
          return(
            <button key={st} onClick={()=>setFilterStage(active?"All":st)}
              style={{position:"relative",background:active?m.bg:"transparent",border:`1.5px solid ${active?m.dot:D.border}`,borderRadius:8,padding:"10px 6px",cursor:"pointer",textAlign:"center"}}>
              {i<STAGES.length-1&&<div style={{position:"absolute",right:-7,top:"50%",transform:"translateY(-50%)",color:D.textMuted,fontSize:14,zIndex:1,pointerEvents:"none"}}>›</div>}
              <div style={{fontSize:18,marginBottom:4}}>{m.icon}</div>
              <div style={{fontSize:10,fontWeight:600,color:active?m.text:D.textSub,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{st}</div>
              <div style={{fontSize:22,fontWeight:700,color:active?m.text:D.text,lineHeight:1.3,marginTop:2}}>{stageCounts[st]}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BackHome({ switchTab }) {
  return(
    <button onClick={()=>switchTab("home")}
      style={{background:"none",border:"none",color:D.textSub,cursor:"pointer",padding:"0 0 18px",fontSize:13,display:"flex",alignItems:"center",gap:5}}>
      ← Home
    </button>
  );
}
function AddEditView({form,setForm,editMode,saveContact,setView}){
  return(
    <div>
      <button onClick={()=>setView(editMode?"detail":"contacts")} style={{background:"none",border:"none",color:D.textSub,cursor:"pointer",padding:"0 0 18px",fontSize:14,display:"flex",alignItems:"center",gap:6}}>← Back</button>
      <h2 style={{margin:"0 0 22px",fontSize:24,fontWeight:700,color:D.text}}>{editMode?"Edit Contact":"New Contact"}</h2>
      <div style={{display:"flex",flexDirection:"column",gap:16,background:D.card,border:`1.5px solid ${D.border}`,borderRadius:12,padding:24}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div><label style={S.lbl}>Name *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={S.inp} placeholder="Full name"/></div>
          <div><label style={S.lbl}>Company</label><input value={form.company} onChange={e=>setForm(f=>({...f,company:e.target.value}))} style={S.inp} placeholder="Company name"/></div>
          <div><label style={S.lbl}>Email</label><input value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} style={S.inp} placeholder="email@example.com"/></div>
          <div><label style={S.lbl}>Phone</label><input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} style={S.inp} placeholder="+1 (555) 000-0000"/></div>
          <div><label style={S.lbl}>WhatsApp</label><input value={form.whatsapp} onChange={e=>setForm(f=>({...f,whatsapp:e.target.value}))} style={S.inp} placeholder="+1 (555) 000-0000"/></div>
          <div><label style={S.lbl}>LinkedIn URL</label><input value={form.linkedin} onChange={e=>setForm(f=>({...f,linkedin:e.target.value}))} style={S.inp} placeholder="linkedin.com/in/username"/></div>
        </div>
        <div>
          <label style={S.lbl}>Pipeline Stage</label>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {STAGES.map(st=>{const m=STAGE_META[st];const sel=form.stage===st;
              return(<button key={st} onClick={()=>setForm(f=>({...f,stage:st}))}
                style={{padding:"8px 14px",borderRadius:20,border:`1.5px solid ${sel?m.dot:D.border}`,background:sel?m.bg:"transparent",color:sel?m.text:D.textSub,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:sel?600:400,display:"flex",alignItems:"center",gap:5}}>
                <span>{m.icon}</span>{st}
              </button>);
            })}
          </div>
          <p style={{margin:"6px 0 0",fontSize:12,color:D.textMuted}}>{STAGE_META[form.stage]?.desc}</p>
        </div>
        <div><label style={S.lbl}>Notes</label><textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={{...S.inp,height:80,resize:"none"}} placeholder="Any important context…"/></div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={saveContact} style={S.btn1}>{editMode?"Save Changes":"Add Contact"}</button>
          <button onClick={()=>setView(editMode?"detail":"contacts")} style={S.btn2}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── SETTINGS MODAL ────────────────────────────────────────────────────────────
function SettingsModal({syncState,syncMsg,exportBackup,importBackup,onClose}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:D.card,border:`1.5px solid ${D.border}`,borderRadius:16,padding:28,width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
          <h2 style={{margin:0,fontSize:20,fontWeight:700,color:D.text}}>Settings</h2>
          <button onClick={onClose} style={{background:"none",border:"none",color:D.textSub,cursor:"pointer",fontSize:24,lineHeight:1}}>×</button>
        </div>
        <div style={{...S.card,marginBottom:18}}>
          <p style={S.secH}>🔄 Google Sheets Sync</p>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:8,background:D.surface,border:`1px solid ${D.border}`}}>
            <span style={{width:10,height:10,borderRadius:"50%",background:syncState==="err"?D.red:D.green,flexShrink:0,display:"inline-block"}}/>
            <div>
              <p style={{margin:0,fontSize:14,color:D.text,fontWeight:500}}>{syncState==="err"?"Sync error":"Connected & syncing automatically"}</p>
              <p style={{margin:"2px 0 0",fontSize:12,color:D.textSub}}>{syncState==="err"?syncMsg:"Every change saves to your Google Sheet within a few seconds"}</p>
            </div>
          </div>
        </div>
        <div style={{...S.card}}>
          <p style={S.secH}>📦 Manual Backup</p>
          <p style={{margin:"0 0 14px",fontSize:13,color:D.textSub,lineHeight:1.6}}>Download all your data as a file for an extra safety net.</p>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <button onClick={exportBackup} style={S.btn1}>⬇ Export Backup</button>
            <label style={{...S.btn2,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6}}>
              ⬆ Import Backup<input type="file" accept=".json" onChange={importBackup} style={{display:"none"}}/>
            </label>
          </div>
        </div>
        <button onClick={onClose} style={{...S.btn1,width:"100%"}}>Done</button>
      </div>
    </div>
  );
}

// ── CADENCE TRACKER ───────────────────────────────────────────────────────────
function CadenceTracker({contact,onComplete,onMoveToCold}){
  if(!contact.stageEnteredAt||contact.cold) return null;
  const cadence=getCadenceDates(contact.stageEnteredAt);
  const completed=contact.cadenceCompleted||[];
  const allDone=cadence.every(c=>completed.includes(c.date));
  const m=STAGE_META[contact.stage]||STAGE_META.Connection;
  return(
    <div style={{...S.card}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <p style={{...S.secH,margin:0}}>Follow-up Cadence</p>
        <span style={{fontSize:12,color:D.textSub}}>{completed.length}/{cadence.length} completed</span>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {cadence.map((step,i)=>{
          const done=completed.includes(step.date);
          const over=!done&&isOverdue(step.date);
          const now=!done&&isToday(step.date);
          const isCurr=!done&&cadence.findIndex(s=>!completed.includes(s.date))===i;
          const diff=daysBetween(step.date);
          return(
            <div key={step.date} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,
              background:done?"transparent":over?"#1A0800":now?"#1A1000":isCurr?"#0D1A2E":"transparent",
              border:`1px solid ${done?D.border:over?"#5C2800":now?"#7C3800":isCurr?m.dot:D.border}`,opacity:done?0.5:1}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:done?D.green:over?D.red:now?"#F97316":isCurr?m.dot:D.border,
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:12,fontWeight:700,color:"#fff"}}>
                {done?"✓":i+1}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:done?D.textMuted:over?D.red:now?"#F97316":isCurr?D.text:D.textSub,textDecoration:done?"line-through":"none"}}>
                  {step.label}{isCurr&&!done&&<span style={{marginLeft:8,fontSize:11,background:m.dot+"33",color:m.text,padding:"1px 6px",borderRadius:10,fontWeight:400}}>Next up</span>}
                </div>
                <div style={{fontSize:12,color:D.textMuted,marginTop:1}}>
                  {formatDate(step.date)}
                  {!done&&<span style={{marginLeft:8,color:over?D.red:now?"#F97316":D.textMuted}}>{over?`${Math.abs(diff)}d overdue`:now?"Today":`in ${diff}d`}</span>}
                </div>
              </div>
              {!done&&<button onClick={()=>onComplete(step.date)} style={{background:m.bg,border:`1px solid ${m.dot}`,borderRadius:6,padding:"4px 10px",fontSize:12,color:m.text,cursor:"pointer",fontFamily:"inherit",fontWeight:500,whiteSpace:"nowrap"}}>Mark done</button>}
            </div>
          );
        })}
      </div>
      {allDone&&(
        <div style={{marginTop:14,padding:"14px 16px",borderRadius:10,background:"#0E1520",border:`1px solid ${D.coldBorder}`}}>
          <p style={{margin:"0 0 4px",fontSize:13,fontWeight:600,color:D.coldText}}>All follow-ups completed with no response</p>
          <p style={{margin:"0 0 12px",fontSize:12,color:D.textMuted,lineHeight:1.6}}>Move this contact to the Cold list. You'll get a reminder to check in again in 3 months.</p>
          <button onClick={onMoveToCold} style={{background:"#141C28",border:`1px solid ${D.coldBorder}`,borderRadius:7,padding:"7px 14px",fontSize:13,color:D.coldText,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>❄️ Move to Cold List</button>
        </div>
      )}
    </div>
  );
}

// ── COLD STATUS CARD ──────────────────────────────────────────────────────────
function ColdStatusCard({contact,onRevive}){
  if(!contact.cold) return null;
  const diff=contact.coldFollowUpDate?daysBetween(contact.coldFollowUpDate):null;
  const isdue=diff!==null&&diff<=0;
  return(
    <div style={{background:"#0A1018",border:`1.5px solid ${isdue?"#4A7A9B":D.coldBorder}`,borderRadius:12,padding:18,marginBottom:18}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <span style={{fontSize:22}}>❄️</span>
        <div>
          <p style={{margin:0,fontSize:15,fontWeight:600,color:D.coldText}}>Cold Contact</p>
          <p style={{margin:"2px 0 0",fontSize:12,color:D.textMuted}}>Added {formatDate(contact.coldSince)} · 3-month check-in {contact.coldFollowUpDate?formatDate(contact.coldFollowUpDate):"—"}</p>
        </div>
        {isdue&&<span style={{marginLeft:"auto",fontSize:12,fontWeight:600,color:"#7AB8D4",background:"#0D1E2E",padding:"3px 10px",borderRadius:20,border:"1px solid #2A4A60"}}>🔵 Check-in due{diff===0?" today":`${Math.abs(diff)}d ago`}</span>}
      </div>
      <div style={{background:"#0D1520",borderRadius:8,padding:"12px 14px",marginBottom:14,fontSize:13,color:D.textMuted,lineHeight:1.7}}>
        Ready to re-engage? Change the stage back to <strong style={{color:D.coldText}}>Connection</strong> to restart the full follow-up cadence.
      </div>
      <button onClick={onRevive} style={{background:D.accent,border:"none",borderRadius:7,padding:"8px 16px",fontSize:13,color:"#fff",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>🔗 Revive — Move back to Connection</button>
    </div>
  );
}

// ── CALENDAR VIEW ─────────────────────────────────────────────────────────────
const HOURS=Array.from({length:24},(_,i)=>i);
const CAL_COLORS=["#3B82F6","#8B5CF6","#EC4899","#14B8A6","#F59E0B","#10B981","#EF4444","#6366F1"];
function calColor(str){let h=0;for(let i=0;i<str.length;i++)h=str.charCodeAt(i)+((h<<5)-h);return CAL_COLORS[Math.abs(h)%CAL_COLORS.length];}

const emptyNewEv=()=>({title:"",date:"",startTime:"09:00",endTime:"10:00",invitees:"",link:""});

function CalendarView({contacts,switchTab,calLinks,setCalLinks}){
  const todayDate=new Date();todayDate.setHours(0,0,0,0);

  const getWeekStart=d=>{
    const dt=new Date(d);dt.setHours(0,0,0,0);
    const day=dt.getDay();dt.setDate(dt.getDate()+(day===0?-6:1-day));return dt;
  };

  const [weekStart,  setWeekStart]  = useState(()=>getWeekStart(new Date()));
  const [monthBase,  setMonthBase]  = useState(()=>{const d=new Date();d.setDate(1);d.setHours(0,0,0,0);return d;});
  const [events,     setEvents]     = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [selectedEv, setSelectedEv] = useState(null);
  const [showNew,    setShowNew]    = useState(false);
  const [newEv,      setNewEv]      = useState(emptyNewEv());
  const [saving,     setSaving]     = useState(false);
  const [evErr,      setEvErr]      = useState("");
  const [linkSearch, setLinkSearch] = useState("");
  const [showLink,   setShowLink]   = useState(false);
  const gridRef=useRef(null);

  useEffect(()=>{if(gridRef.current)gridRef.current.scrollTop=8*56;},[]);

  const weekDays=Array.from({length:7},(_,i)=>{const d=new Date(weekStart);d.setDate(d.getDate()+i);return d;});

  const fetchEvents=useCallback(async()=>{
    setLoading(true);
    try{
      const end=new Date(weekStart);end.setDate(end.getDate()+7);
      const fmt=d=>d.toISOString().split(".")[0];
      const res=await fetch(APPS_SCRIPT_URL+"?action=getEvents&timeMin="+encodeURIComponent(fmt(weekStart))+"&timeMax="+encodeURIComponent(fmt(end)));
      const json=await res.json();
      if(json.ok&&Array.isArray(json.events)){setEvents(json.events);}
      else{setEvents([]);}
    }catch{setEvents([]);}
    setLoading(false);
  },[weekStart]);

  useEffect(()=>{fetchEvents();},[fetchEvents]);

  // Create event via API
  // Creates event silently via Apps Script — no new tab needed
  const createEvent=async(local)=>{
    if(!local.title.trim()||!local.date||!local.startTime){setEvErr("Title, date and start time are required.");return;}
    setSaving(true);setEvErr("");
    try{
      const inviteesArr=local.invitees?local.invitees.split(",").map(s=>s.trim()).filter(Boolean):[];
      const res=await fetch(APPS_SCRIPT_URL,{
        method:"POST",
        body:JSON.stringify({
          action:"createEvent",
          event:{
            title:local.title,
            date:local.date,
            startTime:local.startTime,
            endTime:local.endTime||"",
            invitees:inviteesArr,
            location:local.link||"",
            description:"",
          }
        })
      });
      const json=await res.json();
      if(!json.ok) throw new Error(json.error||"Failed to create event");
      setShowNew(false);setNewEv(emptyNewEv());
      setTimeout(()=>fetchEvents(),2000);
    }catch(e){
      setEvErr("Could not create event: "+e.message);
    }
    setSaving(false);
  };

  const openNew=(date="",startTime="")=>{
    // Calculate end time as start + 1 hour properly
    const endTime = startTime ? (()=>{
      const [hh,mm] = startTime.split(":");
      const endHour = (parseInt(hh)+1)%24;
      return String(endHour).padStart(2,"0")+":"+mm;
    })() : "10:00";
    setNewEv({...emptyNewEv(),date,startTime,endTime});
    setEvErr("");setShowNew(true);
  };

  const prevWeek=()=>{const d=new Date(weekStart);d.setDate(d.getDate()-7);setWeekStart(d);};
  const nextWeek=()=>{const d=new Date(weekStart);d.setDate(d.getDate()+7);setWeekStart(d);};
  const goToday =()=>{setWeekStart(getWeekStart(new Date()));const d=new Date();d.setDate(1);d.setHours(0,0,0,0);setMonthBase(d);};

  const eventsForDay=day=>{
    const ds=day.toISOString().split("T")[0];
    return events.filter(ev=>{
      const raw=ev.start?.dateTime||ev.start?.date||"";
      const evDate=new Date(raw);
      const evDs=evDate.toLocaleDateString("en-CA",{timeZone:"America/New_York"}); // YYYY-MM-DD in ET
      return evDs===ds;
    });
  };
  const evStyle=ev=>{
    const s=new Date(ev.start?.dateTime||ev.start?.date);
    const e=new Date(ev.end?.dateTime||ev.end?.date);
    // Convert to local ET hours for positioning
    const sET=new Date(s.toLocaleString("en-US",{timeZone:"America/New_York"}));
    const eET=new Date(e.toLocaleString("en-US",{timeZone:"America/New_York"}));
    const sm=sET.getHours()*60+sET.getMinutes();
    const em=eET.getHours()*60+eET.getMinutes();
    return{top:(sm/60)*56,height:Math.max(((em-sm)/60)*56,22),color:calColor(ev.summary||"event")};
  };
  const fmtHour=h=>{const p=h<12?"AM":"PM";const hr=h===0?12:h>12?h-12:h;return`${hr} ${p}`;};
  const fmtTime=dt=>{if(!dt)return"";return new Date(dt).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true});};
  const weekLabel=`${weekStart.toLocaleDateString("en-US",{month:"short",day:"numeric"})} – ${weekDays[6].toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`;

  // ── Month mini ──────────────────────────────────────────────────────────────
  const MonthMini=()=>{
    const yr=monthBase.getFullYear();const mo=monthBase.getMonth();
    const firstDay=new Date(yr,mo,1).getDay();
    const dim=new Date(yr,mo+1,0).getDate();
    const cells=Array.from({length:firstDay+dim},(_,i)=>i<firstDay?null:i-firstDay+1);
    while(cells.length%7!==0)cells.push(null);
    const inWeek=d=>{if(!d)return false;const dt=new Date(yr,mo,d);dt.setHours(0,0,0,0);return dt>=weekStart&&dt<new Date(weekStart.getTime()+7*86400000);};
    const isTd=d=>{if(!d)return false;const dt=new Date(yr,mo,d);dt.setHours(0,0,0,0);return dt.getTime()===todayDate.getTime();};
    return(
      <div style={{width:200,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <button onClick={()=>{const d=new Date(monthBase);d.setMonth(d.getMonth()-1);setMonthBase(d);}} style={{background:"none",border:"none",color:D.textSub,cursor:"pointer",fontSize:16,padding:"2px 6px"}}>‹</button>
          <span style={{fontSize:13,fontWeight:600,color:D.text}}>{monthBase.toLocaleDateString("en-US",{month:"long",year:"numeric"})}</span>
          <button onClick={()=>{const d=new Date(monthBase);d.setMonth(d.getMonth()+1);setMonthBase(d);}} style={{background:"none",border:"none",color:D.textSub,cursor:"pointer",fontSize:16,padding:"2px 6px"}}>›</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:4}}>
          {["S","M","T","W","T","F","S"].map((d,i)=><div key={i} style={{textAlign:"center",fontSize:10,fontWeight:600,color:D.textMuted,padding:"2px 0"}}>{d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1}}>
          {cells.map((d,i)=>(
            <div key={i} onClick={()=>{if(!d)return;setWeekStart(getWeekStart(new Date(yr,mo,d)));}}
              style={{textAlign:"center",fontSize:11,padding:"3px 0",borderRadius:4,cursor:d?"pointer":"default",
                background:inWeek(d)?"#1A2D4A":"transparent",color:isTd(d)?D.accent:d?D.text:D.textMuted,
                fontWeight:isTd(d)?700:400,outline:isTd(d)?`1.5px solid ${D.accent}`:"none"}}>
              {d||""}
            </div>
          ))}
        </div>
        <div style={{marginTop:20}}>
          <p style={{margin:"0 0 8px",fontSize:11,fontWeight:600,color:D.textMuted,textTransform:"uppercase",letterSpacing:0.6}}>This Week</p>
          {loading&&<p style={{fontSize:12,color:D.textMuted,margin:0,animation:"pulse 1s infinite"}}>Loading…</p>}
          {!loading&&events.length===0&&<p style={{fontSize:12,color:D.textMuted,margin:0}}>No events</p>}
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {events.slice(0,8).map(ev=>{
              const color=calColor(ev.summary||"event");
              return(
                <div key={ev.id} onClick={()=>setSelectedEv(ev)} style={{display:"flex",gap:7,alignItems:"flex-start",cursor:"pointer",padding:"3px 0"}}>
                  <div style={{width:3,borderRadius:2,background:color,flexShrink:0,marginTop:3,height:30}}/>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:600,color:D.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160}}>{ev.summary||"(No title)"}</div>
                    <div style={{fontSize:10,color:D.textMuted}}>{fmtTime(ev.start?.dateTime)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ── Event popup ─────────────────────────────────────────────────────────────
  const EventPopup=()=>{
    if(!selectedEv) return null;
    const ev=selectedEv;
    const linkedId=calLinks[ev.id];
    const linked=linkedId?contacts.find(c=>c.id===linkedId):null;
    const color=calColor(ev.summary||"event");
    return(
      <div style={{position:"fixed",bottom:24,right:24,width:300,background:D.card,border:`1.5px solid ${color}55`,borderRadius:14,padding:18,zIndex:50,boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
          <div style={{flex:1,paddingRight:8}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:color,flexShrink:0}}/>
              <span style={{fontWeight:700,fontSize:14,color:D.text}}>{ev.summary||"(No title)"}</span>
            </div>
            <div style={{fontSize:12,color:D.textSub}}>{fmtTime(ev.start?.dateTime)} – {fmtTime(ev.end?.dateTime)}</div>
            {ev.location&&<div style={{fontSize:12,color:D.textMuted,marginTop:3}}>📍 {ev.location}</div>}
            {ev.numAttendees>0&&<div style={{fontSize:12,color:D.textMuted,marginTop:2}}>👥 {ev.numAttendees} attendees</div>}
          </div>
          <button onClick={()=>{setSelectedEv(null);setShowLink(false);}} style={{background:"none",border:"none",color:D.textMuted,cursor:"pointer",fontSize:20,lineHeight:1,padding:0}}>×</button>
        </div>
        {linked?(
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:8,background:"#0D1828",border:`1px solid ${D.border}`,marginBottom:10}}>
            <div style={{width:22,height:22,borderRadius:"50%",background:stringToColor(linked.name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff"}}>{linked.name.charAt(0).toUpperCase()}</div>
            <span style={{fontSize:12,fontWeight:600,color:D.text,flex:1}}>{linked.name}</span>
            <button onClick={()=>setCalLinks(p=>{const n={...p};delete n[ev.id];return n;})} style={{background:"none",border:"none",cursor:"pointer",color:D.textMuted,fontSize:14,padding:0}}>×</button>
          </div>
        ):(
          <button onClick={()=>setShowLink(v=>!v)} style={{...S.btnSm,fontSize:12,color:D.accent,borderColor:D.accent+"66",width:"100%",marginBottom:10}}>🔗 Link to Contact</button>
        )}
        {showLink&&(
          <div style={{background:D.surface,borderRadius:8,border:`1px solid ${D.border}`,overflow:"hidden",marginBottom:8}}>
            <input autoFocus value={linkSearch} onChange={e=>setLinkSearch(e.target.value)} placeholder="Search contacts…"
              style={{...S.inp,padding:"6px 10px",fontSize:12,borderRadius:0,border:"none",borderBottom:`1px solid ${D.border}`}}/>
            <div style={{maxHeight:150,overflowY:"auto"}}>
              {contacts.filter(c=>!c.cold&&(c.name.toLowerCase().includes(linkSearch.toLowerCase())||(c.company||"").toLowerCase().includes(linkSearch.toLowerCase()))).map(c=>(
                <div key={c.id} onClick={()=>{setCalLinks(p=>({...p,[ev.id]:c.id}));setShowLink(false);setLinkSearch("");}}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",cursor:"pointer",borderBottom:`1px solid ${D.border}`}}
                  onMouseEnter={e=>e.currentTarget.style.background="#1A2535"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div style={{width:22,height:22,borderRadius:"50%",background:stringToColor(c.name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",flexShrink:0}}>{c.name.charAt(0).toUpperCase()}</div>
                  <span style={{fontSize:12,color:D.text}}>{c.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {ev.htmlLink&&<a href={ev.htmlLink} target="_blank" rel="noreferrer" style={{fontSize:12,color:D.accent,textDecoration:"none"}}>Open in Google Calendar ↗</a>}
      </div>
    );
  };

  // ── New Event Modal ──────────────────────────────────────────────────────────
  const NewEventModal=()=>{
    if(!showNew) return null;
    // Local state so typing is completely isolated — no re-renders from parent
    const [local, setLocal] = useState(newEv);
    const update=k=>e=>setLocal(p=>({...p,[k]:e.target.value}));
    const handleCreate=()=>{
      setNewEv(local);
      createEvent(local);
    };
    return(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:60,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
        onClick={e=>{if(e.target===e.currentTarget){setShowNew(false);setEvErr("");}}}>
        <div style={{background:D.card,border:`1.5px solid ${D.border}`,borderRadius:16,padding:24,width:"100%",maxWidth:420}} onClick={e=>e.stopPropagation()}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
            <h3 style={{margin:0,fontSize:17,fontWeight:700,color:D.text}}>New Event</h3>
            <button onClick={()=>{setShowNew(false);setEvErr("");}} style={{background:"none",border:"none",color:D.textSub,cursor:"pointer",fontSize:22,lineHeight:1}}>×</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div>
              <label style={S.lbl}>Title *</label>
              <input value={local.title} onChange={update("title")} placeholder="Meeting title" style={S.inp} autoFocus/>
            </div>
            <div>
              <label style={S.lbl}>Date *</label>
              <input type="date" value={local.date} onChange={update("date")} style={{...S.inp,colorScheme:"dark"}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <label style={S.lbl}>Start Time *</label>
                <input type="time" value={local.startTime} onChange={update("startTime")} style={{...S.inp,colorScheme:"dark"}}/>
              </div>
              <div>
                <label style={S.lbl}>End Time</label>
                <input type="time" value={local.endTime} onChange={update("endTime")} style={{...S.inp,colorScheme:"dark"}}/>
              </div>
            </div>
            <div>
              <label style={S.lbl}>Invitees <span style={{color:D.textMuted,fontWeight:400,textTransform:"none",letterSpacing:0}}>(optional)</span></label>
              <input
                value={local.invitees}
                onChange={update("invitees")}
                placeholder="email1@example.com, email2@example.com"
                style={S.inp}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
            <div>
              <label style={S.lbl}>Meeting Link <span style={{color:D.textMuted,fontWeight:400,textTransform:"none",letterSpacing:0}}>(optional)</span></label>
              <input value={local.link} onChange={update("link")} placeholder="https://meet.google.com/… or leave blank" style={S.inp}/>
            </div>
            {evErr&&<p style={{fontSize:12,color:D.red,margin:0}}>{evErr}</p>}
            <div style={{display:"flex",gap:10,marginTop:4}}>
              <button onClick={handleCreate} disabled={saving} style={{...S.btn1,flex:1}}>{saving?"Creating…":"Create Event"}</button>
              <button onClick={()=>{setShowNew(false);setEvErr("");}} style={S.btn2}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 120px)",minHeight:600}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <BackHome switchTab={switchTab}/>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <h1 style={{margin:0,fontSize:22,fontWeight:700,color:D.text,letterSpacing:"-0.5px"}}>📅 {weekLabel}</h1>
            {loading&&<span style={{fontSize:12,color:D.textMuted,animation:"pulse 1s infinite"}}>Syncing…</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>openNew(todayStr(),"09:00")} style={{...S.btn1,fontSize:12,padding:"6px 14px"}}>+ New Event</button>
          <button onClick={goToday}  style={{...S.btnSm,fontSize:12}}>Today</button>
          <button onClick={prevWeek} style={{...S.btnSm,fontSize:14,padding:"5px 10px"}}>‹</button>
          <button onClick={nextWeek} style={{...S.btnSm,fontSize:14,padding:"5px 10px"}}>›</button>
          <button onClick={fetchEvents} style={{...S.btnSm,fontSize:12}} disabled={loading}>⟳</button>
        </div>
      </div>

      <div style={{display:"flex",gap:20,flex:1,minHeight:0}}>
        <MonthMini/>
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
          {/* Day headers */}
          <div style={{display:"grid",gridTemplateColumns:"44px repeat(7,1fr)",borderBottom:`1px solid ${D.border}`,flexShrink:0}}>
            <div/>
            {weekDays.map((d,i)=>{
              const isTd=d.getTime()===todayDate.getTime();
              return(
                <div key={i} style={{textAlign:"center",padding:"6px 4px",borderLeft:`1px solid ${D.border}`}}>
                  <div style={{fontSize:11,color:D.textMuted,fontWeight:500}}>{d.toLocaleDateString("en-US",{weekday:"short"}).toUpperCase()}</div>
                  <div style={{width:26,height:26,borderRadius:"50%",background:isTd?D.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",margin:"2px auto 0",fontSize:13,fontWeight:isTd?700:400,color:isTd?"#fff":D.text}}>{d.getDate()}</div>
                </div>
              );
            })}
          </div>
          {/* Time grid */}
          <div ref={gridRef} style={{flex:1,overflowY:"auto"}}>
            <div style={{display:"grid",gridTemplateColumns:"44px repeat(7,1fr)"}}>
              {HOURS.map(h=>(
                <React.Fragment key={h}>
                  <div style={{height:56,display:"flex",alignItems:"flex-start",justifyContent:"flex-end",paddingRight:8,paddingTop:2,fontSize:10,color:D.textMuted,flexShrink:0}}>{h>0?fmtHour(h):""}</div>
                  {weekDays.map((d,di)=>{
                    const isTd=d.getTime()===todayDate.getTime();
                    const ds=d.toISOString().split("T")[0];
                    const hStr=String(h).padStart(2,"0");
                    return(
                      <div key={di}
                        style={{height:56,borderLeft:`1px solid ${D.border}`,borderTop:`1px solid ${h===0?"transparent":D.border+"44"}`,position:"relative",background:isTd?"#0D1828":"transparent",cursor:"pointer"}}
                        onDoubleClick={()=>openNew(ds,`${hStr}:00`)}
                      >
                        {eventsForDay(d).filter(ev=>new Date(ev.start?.dateTime||ev.start?.date).getHours()===h).map(ev=>{
                          const{top,height,color}=evStyle(ev);
                          const linked=calLinks[ev.id]?contacts.find(c=>c.id===calLinks[ev.id]):null;
                          return(
                            <div key={ev.id}
                              onClick={e=>{e.stopPropagation();setSelectedEv(ev===selectedEv?null:ev);}}
                              style={{position:"absolute",left:2,right:2,top:top-(h*56),height,background:color+"33",border:`1.5px solid ${color}`,borderRadius:5,overflow:"hidden",cursor:"pointer",zIndex:2,padding:"2px 5px"}}>
                              <div style={{fontSize:10,fontWeight:700,color,lineHeight:1.3,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{ev.summary||"(No title)"}</div>
                              {height>30&&<div style={{fontSize:9,color:color+"cc"}}>{fmtTime(ev.start?.dateTime)}</div>}
                              {linked&&<div style={{fontSize:9,color:color+"bb",marginTop:1}}>🔗 {linked.name}</div>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
      <NewEventModal/>
      <EventPopup/>
    </div>
  );
}

// ── HOME VIEW ─────────────────────────────────────────────────────────────────
function HomeView({ contacts, followups, switchTab, setFilterStage, onAddContact }) {
  const activeContacts = contacts.filter(c=>!c.cold);
  const coldContacts   = contacts.filter(c=>c.cold);
  const [upcomingEvs,  setUpcomingEvs]  = useState([]);
  const [loadingEvs,   setLoadingEvs]   = useState(true);

  const urgentCount = activeContacts.filter(c=>{ const u=getUrgency(c); return u&&(u.level==="overdue"||u.level==="today"); }).length
    + followups.filter(f=>{ if(f.done||!f.date) return false; const u=getDateUrgency(f.date); return u.level==="overdue"||u.level==="today"; }).length;
  const coldDueCount = coldContacts.filter(c=>c.coldFollowUpDate&&daysBetween(c.coldFollowUpDate)<=0).length;
  const stageCounts  = STAGES.reduce((a,s)=>({...a,[s]:activeContacts.filter(c=>c.stage===s).length}),{});

  // Fetch next 7 days of events via Apps Script
  useEffect(()=>{
    const load=async()=>{
      setLoadingEvs(true);
      try{
        const now=new Date();
        const end=new Date();end.setDate(end.getDate()+7);
        const fmt=d=>d.toISOString().split(".")[0];
        const res=await fetch(APPS_SCRIPT_URL+"?action=getEvents&timeMin="+encodeURIComponent(fmt(now))+"&timeMax="+encodeURIComponent(fmt(end)));
        const json=await res.json();
        if(json.ok&&Array.isArray(json.events)) setUpcomingEvs(json.events.slice(0,4));
        else setUpcomingEvs([]);
      }catch{ setUpcomingEvs([]); }
      setLoadingEvs(false);
    };
    load();
  },[]);

  const fmtEvTime=dt=>{
    if(!dt) return"";
    return new Date(dt).toLocaleString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:true,timeZone:"America/New_York"});
  };

  return(
    <div>
      {/* Greeting */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24}}>
        <div>
          <h1 style={{margin:0,fontSize:28,fontWeight:700,color:D.text,letterSpacing:"-0.5px"}}>👋 Welcome back</h1>
          <p style={{margin:"3px 0 0",color:D.textSub,fontSize:13}}>
            {urgentCount>0?`You have ${urgentCount} urgent follow-up${urgentCount>1?"s":""} today`:"You're all caught up today 🎉"}
          </p>
        </div>
        <button onClick={()=>onAddContact()} style={S.btn1}>+ Add Contact</button>
      </div>

      {/* Stat boxes */}
      <div style={{...S.card}}>
        <p style={{margin:"0 0 12px",fontSize:11,color:D.textSub,fontWeight:600,textTransform:"uppercase",letterSpacing:0.6}}>Your Pipeline</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:12}}>
          <button onClick={()=>switchTab("contacts")} style={{background:"#0D1828",border:`1.5px solid #2E4060`,borderRadius:8,padding:"12px 8px",cursor:"pointer",textAlign:"center"}}>
            <div style={{fontSize:20,marginBottom:4}}>👥</div>
            <div style={{fontSize:10,fontWeight:600,color:D.textSub}}>Contacts</div>
            <div style={{fontSize:26,fontWeight:700,color:D.text,lineHeight:1.3,marginTop:2}}>{activeContacts.length}</div>
          </button>
          <button onClick={()=>switchTab("dashboard")} style={{background:urgentCount>0?"#1A0D00":"#0D1828",border:`1.5px solid ${urgentCount>0?D.red+"66":"#2E4060"}`,borderRadius:8,padding:"12px 8px",cursor:"pointer",textAlign:"center"}}>
            <div style={{fontSize:20,marginBottom:4}}>📅</div>
            <div style={{fontSize:10,fontWeight:600,color:urgentCount>0?D.red:D.textSub}}>Follow-ups</div>
            <div style={{fontSize:26,fontWeight:700,color:urgentCount>0?D.red:D.text,lineHeight:1.3,marginTop:2}}>{urgentCount}</div>
            {urgentCount>0&&<div style={{fontSize:9,color:D.red,marginTop:1}}>urgent</div>}
          </button>
          <button onClick={()=>switchTab("cold")} style={{background:coldDueCount>0?"#0A1018":"#0D1828",border:`1.5px solid ${coldDueCount>0?"#2A5A78":"#2E4060"}`,borderRadius:8,padding:"12px 8px",cursor:"pointer",textAlign:"center"}}>
            <div style={{fontSize:20,marginBottom:4}}>❄️</div>
            <div style={{fontSize:10,fontWeight:600,color:coldDueCount>0?"#7AB8D4":D.textSub}}>Cold</div>
            <div style={{fontSize:26,fontWeight:700,color:coldDueCount>0?"#7AB8D4":D.text,lineHeight:1.3,marginTop:2}}>{coldContacts.length}</div>
            {coldDueCount>0&&<div style={{fontSize:9,color:"#7AB8D4",marginTop:1}}>{coldDueCount} due</div>}
          </button>
        </div>

        {/* Divider */}
        <div style={{height:1,background:D.border,marginBottom:12}}/>

        {/* Pipeline stages */}
        <p style={{margin:"0 0 10px",fontSize:11,color:D.textSub,fontWeight:600,textTransform:"uppercase",letterSpacing:0.6}}>Stages</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
          {STAGES.map((st,i)=>{
            const m=STAGE_META[st];
            return(
              <button key={st} onClick={()=>{ setFilterStage(st); switchTab("contacts"); }}
                style={{position:"relative",background:"transparent",border:`1.5px solid ${D.border}`,borderRadius:8,padding:"10px 6px",cursor:"pointer",textAlign:"center",transition:"all .15s"}}
                onMouseEnter={e=>{e.currentTarget.style.background=m.bg;e.currentTarget.style.borderColor=m.dot;}}
                onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor=D.border;}}>
                {i<STAGES.length-1&&<div style={{position:"absolute",right:-7,top:"50%",transform:"translateY(-50%)",color:D.textMuted,fontSize:14,zIndex:1,pointerEvents:"none"}}>›</div>}
                <div style={{fontSize:18,marginBottom:4}}>{m.icon}</div>
                <div style={{fontSize:10,fontWeight:600,color:D.textSub,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{st}</div>
                <div style={{fontSize:22,fontWeight:700,color:D.text,lineHeight:1.3,marginTop:2}}>{stageCounts[st]}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Upcoming calendar events */}
      <div style={{...S.card}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <p style={{margin:0,fontSize:11,color:D.textSub,fontWeight:600,textTransform:"uppercase",letterSpacing:0.6}}>Upcoming Events</p>
          <button onClick={()=>switchTab("calendar")} style={{...S.btnSm,fontSize:11,padding:"3px 10px"}}>View Calendar →</button>
        </div>
        {loadingEvs&&<p style={{fontSize:13,color:D.textMuted,margin:0,animation:"pulse 1s infinite"}}>Loading…</p>}
        {!loadingEvs&&upcomingEvs.length===0&&(
          <p style={{fontSize:13,color:D.textMuted,margin:0}}>No upcoming events in the next 7 days.</p>
        )}
        {!loadingEvs&&upcomingEvs.length>0&&(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {upcomingEvs.map(ev=>{
              const color=["#3B82F6","#8B5CF6","#EC4899","#14B8A6","#F59E0B","#10B981","#EF4444","#6366F1"][Math.abs(ev.summary?.split("").reduce((h,c)=>c.charCodeAt(0)+((h<<5)-h),0)||0)%8];
              return(
                <div key={ev.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderRadius:10,background:D.surface,border:`1px solid ${D.border}`}}>
                  <div style={{width:3,height:36,borderRadius:2,background:color,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:D.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.summary||"(No title)"}</div>
                    <div style={{fontSize:11,color:D.textMuted,marginTop:2}}>{fmtEvTime(ev.start?.dateTime)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── COLD VIEW ─────────────────────────────────────────────────────────────────
function ColdView({contacts,setSelected,setView,switchTab}){
  const cold=contacts.filter(c=>c.cold);
  const due=cold.filter(c=>c.coldFollowUpDate&&daysBetween(c.coldFollowUpDate)<=0).sort((a,b)=>daysBetween(a.coldFollowUpDate)-daysBetween(b.coldFollowUpDate));
  const upcoming=cold.filter(c=>c.coldFollowUpDate&&daysBetween(c.coldFollowUpDate)>0).sort((a,b)=>daysBetween(a.coldFollowUpDate)-daysBetween(b.coldFollowUpDate));
  const noDate=cold.filter(c=>!c.coldFollowUpDate);
  const ColdCard=({c})=>{
    const diff=c.coldFollowUpDate?daysBetween(c.coldFollowUpDate):null;
    const isdue=diff!==null&&diff<=0;
    return(
      <div onClick={()=>{setSelected(c);setView("detail");}}
        style={{background:"#0A1018",border:`1.5px solid ${isdue?"#2A5A78":D.coldBorder}`,borderRadius:12,padding:"13px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:13,marginBottom:6}}>
        <div style={{width:40,height:40,borderRadius:"50%",background:stringToColor(c.name),display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:16,fontWeight:700,color:"#fff",opacity:0.7}}>{c.name.charAt(0).toUpperCase()}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontWeight:600,fontSize:14,color:D.coldText}}>{c.name}</span><ColdBadge/>
          </div>
          <div style={{fontSize:12,color:D.textMuted,marginTop:3}}>{c.company&&<span>{c.company} · </span>}Cold since {formatDate(c.coldSince)}</div>
        </div>
        {c.coldFollowUpDate&&(
          <span style={{fontSize:11,fontWeight:600,color:isdue?"#7AB8D4":D.textMuted,background:isdue?"#0D1E2E":"transparent",padding:"2px 8px",borderRadius:20,whiteSpace:"nowrap",border:isdue?"1px solid #1A3A50":"none"}}>
            {isdue?(diff===0?"Check-in today":`Check-in ${Math.abs(diff)}d ago`):`Check-in in ${diff}d`}
          </span>
        )}
      </div>
    );
  };
  return(
    <div>
      <BackHome switchTab={switchTab}/>
      <div style={{marginBottom:24}}>
        <h1 style={{margin:0,fontSize:28,fontWeight:700,color:D.coldText,letterSpacing:"-0.5px"}}>❄️ Cold Check-ins</h1>
        <p style={{margin:"3px 0 0",color:D.textSub,fontSize:13}}>{due.length} due now · {upcoming.length} upcoming · {cold.length} total</p>
      </div>
      {cold.length===0?(
        <div style={{textAlign:"center",padding:"60px 20px",color:D.textMuted}}>
          <div style={{fontSize:40,marginBottom:10}}>❄️</div>
          <p style={{fontSize:14}}>No cold contacts yet.</p>
        </div>
      ):(
        <>
          {due.length>0&&<div style={{marginBottom:24}}><p style={{margin:"0 0 10px",fontSize:12,fontWeight:700,color:"#7AB8D4",textTransform:"uppercase",letterSpacing:0.8}}>Due for Check-in · {due.length}</p>{due.map(c=><ColdCard key={c.id} c={c}/>)}</div>}
          {upcoming.length>0&&<div style={{marginBottom:24}}><p style={{margin:"0 0 10px",fontSize:12,fontWeight:700,color:D.textSub,textTransform:"uppercase",letterSpacing:0.8}}>Upcoming · {upcoming.length}</p>{upcoming.map(c=><ColdCard key={c.id} c={c}/>)}</div>}
          {noDate.length>0&&<div style={{marginBottom:24}}><p style={{margin:"0 0 10px",fontSize:12,fontWeight:700,color:D.textMuted,textTransform:"uppercase",letterSpacing:0.8}}>No date set · {noDate.length}</p>{noDate.map(c=><ColdCard key={c.id} c={c}/>)}</div>}
        </>
      )}
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({contacts,followups,setSelected,setView,onAddContact,switchTab}){
  const active=contacts.filter(c=>!c.cold);
  const withCadence=active.map(c=>({c,u:getUrgency(c),next:getNextCadence(c),type:"cadence"})).filter(x=>x.next);
  const manualItems=followups.filter(f=>!f.done&&f.date).map(f=>{
    const contact=contacts.find(c=>c.id===f.contactId);if(!contact)return null;
    return{c:contact,fu:f,u:getDateUrgency(f.date),type:"manual"};
  }).filter(Boolean);
  const allItems=[...withCadence,...manualItems].sort((a,b)=>(a.u?a.u.diff:999)-(b.u?b.u.diff:999));
  const overdue=allItems.filter(x=>x.u&&x.u.level==="overdue");
  const today=allItems.filter(x=>x.u&&x.u.level==="today");
  const soon=allItems.filter(x=>x.u&&x.u.level==="soon");
  const upcoming=allItems.filter(x=>x.u&&!["overdue","today","soon"].includes(x.u.level));
  const Section=({title,color,items})=>{
    if(!items.length)return null;
    return(
      <div style={{marginBottom:22}}>
        <p style={{margin:"0 0 10px",fontSize:12,fontWeight:700,color,textTransform:"uppercase",letterSpacing:0.8}}>{title} · {items.length}</p>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {items.map((item,idx)=>{
            const{c,u,type}=item;const isManual=type==="manual";const fu=item.fu;
            return(
              <div key={isManual?`m-${fu.id}`:`ca-${c.id}-${idx}`} onClick={()=>{setSelected(c);setView("detail");}}
                style={{background:D.card,border:`1.5px solid ${u?u.color+"44":D.border}`,borderRadius:12,padding:"13px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:13}}>
                <div style={{width:38,height:38,borderRadius:"50%",background:stringToColor(c.name),display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:15,fontWeight:700,color:"#fff"}}>{c.name.charAt(0).toUpperCase()}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <span style={{fontWeight:600,fontSize:14,color:D.text}}>{c.name}</span>
                    <StageBadge stage={c.stage}/>
                    {isManual&&<span style={{fontSize:11,fontWeight:600,color:"#A78BFA",background:"#1A1040",padding:"2px 8px",borderRadius:20,border:"1px solid #3B2A7A"}}>📅 Manual</span>}
                  </div>
                  <div style={{fontSize:12,color:D.textSub,marginTop:3}}>
                    {isManual?<>{fu.note||"Follow-up scheduled"} · {formatDate(fu.date)}{c.company&&<span style={{marginLeft:6,color:D.textMuted}}>· {c.company}</span>}</>
                             :<>{item.next.label} · {formatDate(item.next.date)}{c.company&&<span style={{marginLeft:6,color:D.textMuted}}>· {c.company}</span>}</>}
                  </div>
                </div>
                <RawUrgencyBadge u={u}/>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  return(
    <div>
      <BackHome switchTab={switchTab}/>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24}}>
        <div>
          <h1 style={{margin:0,fontSize:28,fontWeight:700,color:D.text,letterSpacing:"-0.5px"}}>Follow-up Dashboard</h1>
          <p style={{margin:"3px 0 0",color:D.textSub,fontSize:13}}>{overdue.length+today.length} urgent · {soon.length} this week · {upcoming.length} upcoming</p>
        </div>
        <button onClick={onAddContact} style={S.btn1}>+ Add Contact</button>
      </div>
      {!allItems.length?(
        <div style={{textAlign:"center",padding:"60px 20px",color:D.textMuted}}>
          <div style={{fontSize:40,marginBottom:10}}>✅</div>
          <p style={{fontSize:14}}>No follow-ups yet.</p>
        </div>
      ):(
        <>
          <Section title="Overdue"   color={D.red}     items={overdue}/>
          <Section title="Due Today" color="#F97316"   items={today}/>
          <Section title="Due Soon"  color={D.yellow}  items={soon}/>
          <Section title="Upcoming"  color={D.textSub} items={upcoming}/>
        </>
      )}
    </div>
  );
}

// ── MEETING HISTORY ───────────────────────────────────────────────────────────
function MeetingHistory({ contactId, calLinks }) {
  const [meetings, setMeetings] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(()=>{
    const load=async()=>{
      setLoading(true);
      try{
        // Fetch last 90 days + next 30 days
        const start=new Date(); start.setDate(start.getDate()-90);
        const end=new Date();   end.setDate(end.getDate()+30);
        const fmt=d=>d.toISOString().split(".")[0];
        const res=await fetch(APPS_SCRIPT_URL+"?action=getEvents&timeMin="+encodeURIComponent(fmt(start))+"&timeMax="+encodeURIComponent(fmt(end)));
        const json=await res.json();
        if(json.ok&&Array.isArray(json.events)){
          // Filter to only events linked to this contact
          const linked=json.events.filter(ev=>calLinks[ev.id]===contactId);
          // Sort newest first
          linked.sort((a,b)=>new Date(b.start?.dateTime||b.start?.date)-new Date(a.start?.dateTime||a.start?.date));
          setMeetings(linked);
        }
      }catch{ setMeetings([]); }
      setLoading(false);
    };
    load();
  },[contactId,calLinks]);

  const fmtMeetingTime=ev=>{
    const s=ev.start?.dateTime||ev.start?.date;
    if(!s) return"";
    return new Date(s).toLocaleString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",hour12:true,timeZone:"America/New_York"});
  };

  const getMeetingDuration=ev=>{
    const s=new Date(ev.start?.dateTime||ev.start?.date);
    const e=new Date(ev.end?.dateTime||ev.end?.date);
    const mins=Math.round((e-s)/60000);
    if(mins<60) return`${mins}m`;
    const h=Math.floor(mins/60); const m=mins%60;
    return m>0?`${h}h ${m}m`:`${h}h`;
  };

  const isPast=ev=>new Date(ev.start?.dateTime||ev.start?.date)<new Date();

  if(loading) return<p style={{fontSize:13,color:D.textMuted,margin:0,animation:"pulse 1s infinite"}}>Loading meetings…</p>;
  if(!meetings.length) return<p style={{fontSize:13,color:D.textMuted,margin:0}}>No linked meetings yet. Link events from the Calendar tab.</p>;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {meetings.map(ev=>{
        const past=isPast(ev);
        const color=past?D.textMuted:D.accent;
        return(
          <div key={ev.id} style={{display:"flex",gap:12,padding:"10px 14px",borderRadius:10,background:D.surface,border:`1px solid ${past?D.border:D.accent+"44"}`}}>
            <div style={{width:3,borderRadius:2,background:past?D.border:D.accent,flexShrink:0,alignSelf:"stretch"}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:3}}>
                <span style={{fontSize:13,fontWeight:600,color:past?D.textSub:D.text}}>{ev.summary||"(No title)"}</span>
                <span style={{fontSize:10,fontWeight:600,color:past?"#3A5A3A":"#1A3A5A",background:past?"#0D1A0D":"#0D1A2E",padding:"1px 7px",borderRadius:20,border:`1px solid ${past?"#1A3A1A":"#1A3A5A"}`}}>
                  {past?"Past":"Upcoming"}
                </span>
              </div>
              <div style={{fontSize:12,color:D.textMuted}}>
                📅 {fmtMeetingTime(ev)}
                <span style={{marginLeft:10}}>⏱ {getMeetingDuration(ev)}</span>
                {ev.location&&<span style={{marginLeft:10}}>📍 {ev.location}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── DETAIL VIEW ───────────────────────────────────────────────────────────────
function DetailView({selected,contacts,followups,setFollowups,setContacts,setView,setForm,setEditMode,deleteContact,addLog,newLog,setNewLog,addFollowup,newFU,setNewFU,showFU,setShowFU,logRef,onCompleteCadence,onMoveToCold,onRevive,switchTab,calLinks}){
  if(!selected)return null;
  const contact=contacts.find(c=>c.id===selected.id)||selected;
  const cFU=followups.filter(f=>f.contactId===contact.id).sort((a,b)=>a.date.localeCompare(b.date));
  const stageIdx=STAGES.indexOf(contact.stage);
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:4}}>
        <BackHome switchTab={switchTab}/>
        <button onClick={()=>setView("contacts")} style={{background:"none",border:"none",color:D.textSub,cursor:"pointer",padding:"0 0 18px",fontSize:13,display:"flex",alignItems:"center",gap:5}}>← Contacts</button>
      </div>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:22}}>
        <div style={{display:"flex",gap:14,alignItems:"center"}}>
          <div style={{width:54,height:54,borderRadius:"50%",background:stringToColor(contact.name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:700,color:"#fff",flexShrink:0,opacity:contact.cold?0.6:1}}>{contact.name.charAt(0).toUpperCase()}</div>
          <div>
            <h2 style={{margin:0,fontSize:24,fontWeight:700,color:contact.cold?D.coldText:D.text,letterSpacing:"-0.3px"}}>{contact.name}</h2>
            {contact.company&&<p style={{margin:"2px 0 6px",color:D.textSub,fontSize:14}}>{contact.company}</p>}
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              {contact.cold?<ColdBadge/>:<StageBadge stage={contact.stage} showDesc/>}
              {!contact.cold&&<UrgencyBadge contact={contact}/>}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          {!contact.cold&&<button onClick={()=>{setForm({name:contact.name,company:contact.company||"",email:contact.email||"",phone:contact.phone||"",whatsapp:contact.whatsapp||"",linkedin:contact.linkedin||"",stage:contact.stage,notes:contact.notes||""});setEditMode(true);setView("add");}} style={S.btn2}>Edit</button>}
          <button onClick={()=>{if(window.confirm("Delete this contact?"))deleteContact(contact.id);}} style={{...S.btn2,color:"#F87171",borderColor:"#3D1515"}}>Delete</button>
        </div>
      </div>
      <ColdStatusCard contact={contact} onRevive={()=>onRevive(contact.id)}/>
      {!contact.cold&&(
        <div style={{...S.card}}>
          <p style={{...S.secH,marginBottom:14}}>Pipeline Progress</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:4}}>
            {STAGES.map(st=>{const m=STAGE_META[st];const isA=contact.stage===st;const isP=stageIdx>STAGES.indexOf(st);
              return(<div key={st} style={{textAlign:"center"}}>
                <div style={{height:4,borderRadius:2,background:isA||isP?m.dot:D.border,marginBottom:7}}/>
                <div style={{fontSize:16,marginBottom:3}}>{m.icon}</div>
                <div style={{fontSize:10,fontWeight:600,color:isA?m.text:isP?D.textSub:D.textMuted}}>{st}</div>
              </div>);
            })}
          </div>
        </div>
      )}
      <CadenceTracker contact={contact} onComplete={date=>onCompleteCadence(contact.id,date)} onMoveToCold={()=>onMoveToCold(contact.id)}/>
      <div style={{...S.card}}>
        <p style={S.secH}>Contact Info</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px 20px"}}>
          {contact.email    &&<InfoRow label="Email"    value={contact.email} link={`mailto:${contact.email}`}/>}
          {contact.phone    &&<InfoRow label="Phone"    value={contact.phone}/>}
          {contact.whatsapp &&<InfoRow label="WhatsApp" value={contact.whatsapp} link={`https://wa.me/${contact.whatsapp.replace(/\D/g,"")}`}/>}
          {contact.linkedin &&<InfoRow label="LinkedIn" value="View Profile" link={contact.linkedin.startsWith("http")?contact.linkedin:`https://${contact.linkedin}`}/>}
          {contact.notes    &&<div style={{gridColumn:"1/-1"}}><InfoRow label="Notes" value={contact.notes}/></div>}
        </div>
      </div>
      {!contact.cold&&(
        <div style={{...S.card}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <p style={{...S.secH,margin:0}}>Manual Follow-ups</p>
            <button onClick={()=>setShowFU(!showFU)} style={S.btnSm}>+ Schedule</button>
          </div>
          {showFU&&(
            <div style={{background:D.surface,borderRadius:8,padding:14,marginBottom:14,display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div><label style={S.lbl}>Date</label><input type="date" value={newFU.date} onChange={e=>setNewFU(f=>({...f,date:e.target.value}))} style={{...S.inp,width:"auto",colorScheme:"dark"}}/></div>
              <div style={{flex:1,minWidth:150}}><label style={S.lbl}>Note (optional)</label><input placeholder="What to discuss…" value={newFU.note} onChange={e=>setNewFU(f=>({...f,note:e.target.value}))} style={S.inp}/></div>
              <button onClick={()=>addFollowup(contact.id)} style={S.btn1}>Add</button>
              <button onClick={()=>setShowFU(false)} style={S.btn2}>Cancel</button>
            </div>
          )}
          {cFU.length===0
            ?<p style={{fontSize:14,color:D.textMuted,margin:0}}>No manual follow-ups scheduled</p>
            :<div style={{display:"flex",flexDirection:"column",gap:7}}>
              {cFU.map(fu=>{
                const u=!fu.done?getDateUrgency(fu.date):null;
                return(
                  <div key={fu.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,background:isOverdue(fu.date)&&!fu.done?"#120800":D.surface,border:`1px solid ${isOverdue(fu.date)&&!fu.done?"#4A2E00":D.border}`}}>
                    <input type="checkbox" checked={fu.done} onChange={()=>setFollowups(fs=>fs.map(f=>f.id===fu.id?{...f,done:!f.done}:f))} style={{width:15,height:15,cursor:"pointer",accentColor:D.accent}}/>
                    <div style={{flex:1}}>
                      <span style={{fontSize:13,fontWeight:600,color:fu.done?D.textMuted:isOverdue(fu.date)?"#FCD34D":D.text,textDecoration:fu.done?"line-through":"none"}}>{isToday(fu.date)?"Today":formatDate(fu.date)}</span>
                      {fu.note&&<p style={{margin:"2px 0 0",fontSize:13,color:fu.done?D.textMuted:D.textSub}}>{fu.note}</p>}
                    </div>
                    {!fu.done&&u&&<RawUrgencyBadge u={u}/>}
                    <button onClick={()=>setFollowups(fs=>fs.filter(f=>f.id!==fu.id))} style={{background:"none",border:"none",cursor:"pointer",color:D.textMuted,fontSize:18,padding:0,lineHeight:1}}>×</button>
                  </div>
                );
              })}
            </div>
          }
        </div>
      )}
      <div style={{...S.card}}>
        <p style={S.secH}>Conversation Log</p>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          <textarea ref={logRef} value={newLog} onChange={e=>setNewLog(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();addLog(contact.id);}}}
            placeholder="Log a note or conversation… (Enter to save)"
            style={{flex:1,padding:"10px 14px",borderRadius:8,border:`1.5px solid ${D.border}`,fontSize:14,fontFamily:"inherit",resize:"none",height:70,outline:"none",background:D.surface,color:D.text}}/>
          <button onClick={()=>addLog(contact.id)} style={{...S.btn1,alignSelf:"flex-end"}}>Save</button>
        </div>
        {(!contact.conversations||!contact.conversations.length)
          ?<p style={{fontSize:14,color:D.textMuted,margin:0}}>No conversations logged yet</p>
          :<div>
            {contact.conversations.map((cv,i)=>(
              <div key={cv.id} style={{display:"flex",gap:12,paddingBottom:13,marginBottom:i<contact.conversations.length-1?13:0,borderBottom:i<contact.conversations.length-1?`1px solid ${D.border}`:"none"}}>
                <div style={{width:2,background:D.borderHi,borderRadius:2,flexShrink:0,marginTop:4}}/>
                <div style={{flex:1}}>
                  <p style={{margin:"0 0 4px",fontSize:14,color:D.text,lineHeight:1.6}}>{cv.text}</p>
                  <span style={{fontSize:12,color:D.textMuted}}>{new Date(cv.date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"})}</span>
                </div>
              </div>
            ))}
          </div>
        }
      </div>
    </div>
  );
}

// ── ERROR BOUNDARIES ──────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={error:null};}
  static getDerivedStateFromError(e){return{error:e};}
  render(){
    if(this.state.error)return(
      <div style={{padding:30,color:"#F87171"}}>
        <p style={{fontWeight:700,fontSize:16,marginBottom:8}}>Something went wrong.</p>
        <pre style={{fontSize:11,color:"#6B82A0",whiteSpace:"pre-wrap",wordBreak:"break-all",background:"#111827",padding:14,borderRadius:8}}>{this.state.error?.message}</pre>
        <button onClick={()=>this.props.onBack()} style={{marginTop:14,background:"#3B82F6",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>← Go Back</button>
      </div>
    );
    return this.props.children;
  }
}
function SafeDetailView(props){return<ErrorBoundary onBack={()=>props.setView("contacts")}><DetailView {...props}/></ErrorBoundary>;}

class RootErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={error:null};}
  static getDerivedStateFromError(e){return{error:e};}
  render(){
    if(this.state.error)return(
      <div style={{minHeight:"100vh",background:"#080C14",display:"flex",alignItems:"center",justifyContent:"center",padding:30,fontFamily:"'DM Sans',sans-serif"}}>
        <div style={{maxWidth:540,width:"100%"}}>
          <p style={{color:"#F87171",fontWeight:700,fontSize:18,marginBottom:10}}>BridgeFlow ran into a problem</p>
          <pre style={{fontSize:11,color:"#6B82A0",whiteSpace:"pre-wrap",wordBreak:"break-all",background:"#111827",padding:14,borderRadius:8,marginBottom:16}}>{this.state.error?.message}</pre>
          <button onClick={()=>{localStorage.removeItem("bf-contacts-v3");localStorage.removeItem("bf-followups-v3");window.location.reload();}} style={{background:"#EF4444",color:"#fff",border:"none",borderRadius:8,padding:"9px 18px",fontSize:14,cursor:"pointer",fontFamily:"inherit",marginRight:10}}>Clear local data &amp; reload</button>
          <button onClick={()=>window.location.reload()} style={{background:"#3B82F6",color:"#fff",border:"none",borderRadius:8,padding:"9px 18px",fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Reload</button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
function App(){
  const[contacts,    setContacts]    = useState([]);
  const[followups,   setFollowups]   = useState([]);
  const[calLinks,    setCalLinks]    = useState(()=>{try{return JSON.parse(localStorage.getItem(CAL_LINKS_KEY)||"{}");}catch{return{};}});
  const[view,        setView]        = useState("home");
  const[tab,         setTab]         = useState("home");
  const[selected,    setSelected]    = useState(null);
  const[search,      setSearch]      = useState("");
  const[filterStage, setFilterStage] = useState("All");
  const[form,        setForm]        = useState(emptyContact);
  const[editMode,    setEditMode]    = useState(false);
  const[newLog,      setNewLog]      = useState("");
  const[newFU,       setNewFU]       = useState({date:"",note:""});
  const[showFU,      setShowFU]      = useState(false);
  const[showSettings,setShowSettings]= useState(false);
  const[syncState,   setSyncState]   = useState("idle");
  const[syncMsg,     setSyncMsg]     = useState("");
  const[toast,       setToast]       = useState(null);
  const[loadingInit, setLoadingInit] = useState(true);
  const syncTimer=useRef(null);
  const logRef=useRef(null);
  const initialized=useRef(false);

  const activeContacts=contacts.filter(c=>!c.cold);
  const coldContacts=contacts.filter(c=>c.cold);
  const urgentCount=activeContacts.filter(c=>{const u=getUrgency(c);return u&&(u.level==="overdue"||u.level==="today");}).length
    +followups.filter(f=>{if(f.done||!f.date)return false;const u=getDateUrgency(f.date);return u.level==="overdue"||u.level==="today";}).length;
  const coldDueCount=coldContacts.filter(c=>c.coldFollowUpDate&&daysBetween(c.coldFollowUpDate)<=0).length;

  useEffect(()=>{
    const lc=localStorage.getItem(STORAGE_KEY);const lf=localStorage.getItem(FOLLOWUP_KEY);
    if(lc)setContacts(JSON.parse(lc).map(normalizeContact));
    if(lf)setFollowups(JSON.parse(lf));
    pullFromScript().then(({contacts:c,followups:f})=>{
      const nc=c.map(normalizeContact);
      if(nc.length>0||f.length>0){setContacts(nc);setFollowups(f);localStorage.setItem(STORAGE_KEY,JSON.stringify(nc));localStorage.setItem(FOLLOWUP_KEY,JSON.stringify(f));}
      setSyncState("ok");setSyncMsg("Synced with Google Sheets");setTimeout(()=>setSyncState("idle"),3000);
    }).catch(()=>{}).finally(()=>setLoadingInit(false));
  },[]);

  useEffect(()=>{localStorage.setItem(STORAGE_KEY,JSON.stringify(contacts));},[contacts]);
  useEffect(()=>{localStorage.setItem(FOLLOWUP_KEY,JSON.stringify(followups));},[followups]);
  useEffect(()=>{localStorage.setItem(CAL_LINKS_KEY,JSON.stringify(calLinks));},[calLinks]);

  const scheduleSync=useCallback((c,f)=>{
    clearTimeout(syncTimer.current);setSyncState("syncing");
    syncTimer.current=setTimeout(async()=>{
      try{await pushToScript(c,f);setSyncState("ok");setSyncMsg("Synced · "+new Date().toLocaleTimeString());setTimeout(()=>setSyncState("idle"),4000);}
      catch(e){setSyncState("err");setSyncMsg("Sync failed: "+e.message);}
    },2500);
  },[]);

  useEffect(()=>{
    if(loadingInit)return;
    if(!initialized.current){initialized.current=true;return;}
    scheduleSync(contacts,followups);
  },[contacts,followups,loadingInit]);

  const showToast=(msg,type="ok")=>{setToast({msg,type});setTimeout(()=>setToast(null),3500);};
  const exportBackup=()=>{
    const blob=new Blob([JSON.stringify({contacts,followups,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`bridgeflow-${todayStr()}.json`;a.click();
    showToast("Backup downloaded!");
  };
  const importBackup=e=>{
    const file=e.target.files[0];if(!file)return;
    const r=new FileReader();
    r.onload=ev=>{try{const d=JSON.parse(ev.target.result);if(!Array.isArray(d.contacts))throw new Error();setContacts(d.contacts);setFollowups(d.followups||[]);showToast(`Restored ${d.contacts.length} contacts!`);}catch{showToast("Invalid backup file","err");}};
    r.readAsText(file);e.target.value="";
  };

  const saveContact=()=>{
    if(!form.name.trim())return;
    if(editMode&&selected){
      const existing=contacts.find(c=>c.id===selected.id);
      const stageChanged=existing&&existing.stage!==form.stage;
      const stageEnteredAt=stageChanged?todayStr():(existing?.stageEnteredAt||todayStr());
      const cadenceCompleted=stageChanged?[]:(existing?.cadenceCompleted||[]);
      const next=contacts.map(c=>c.id===selected.id?normalizeContact({...c,...form,stageEnteredAt,cadenceCompleted}):c);
      setContacts(next);setSelected(prev=>normalizeContact({...prev,...form,stageEnteredAt,cadenceCompleted}));
    }else{
      setContacts([normalizeContact({...form,id:Date.now().toString(),createdAt:new Date().toISOString(),conversations:[],stageEnteredAt:todayStr(),cadenceCompleted:[],cold:false}),...contacts]);
    }
    setEditMode(false);setView(editMode?"detail":"contacts");
  };

  const deleteContact=id=>{setContacts(c=>c.filter(x=>x.id!==id));setFollowups(f=>f.filter(x=>x.contactId!==id));setView("contacts");};
  const addLog=contactId=>{
    if(!newLog.trim())return;
    const entry={id:Date.now().toString(),text:newLog,date:new Date().toISOString()};
    setContacts(prev=>{const u=prev.map(c=>c.id===contactId?{...c,conversations:[entry,...(c.conversations||[])]}:c);setSelected(u.find(c=>c.id===contactId));return u;});
    setNewLog("");
  };
  const addFollowup=contactId=>{
    if(!newFU.date)return;
    setFollowups(f=>[...f,{id:Date.now().toString(),contactId,...newFU,done:false}]);
    setNewFU({date:"",note:""});setShowFU(false);
  };
  const onCompleteCadence=(contactId,date)=>{
    setContacts(prev=>{const u=prev.map(c=>{if(c.id!==contactId)return c;const already=c.cadenceCompleted||[];if(already.includes(date))return c;return{...c,cadenceCompleted:[...already,date]};});setSelected(u.find(c=>c.id===contactId));return u;});
    showToast("Follow-up marked complete!");
  };
  const onMoveToCold=contactId=>{
    const coldSince=todayStr();const coldFollowUpDate=addMonths(coldSince,COLD_MONTHS);
    setContacts(prev=>{const u=prev.map(c=>c.id===contactId?{...c,cold:true,coldSince,coldFollowUpDate}:c);setSelected(u.find(c=>c.id===contactId));return u;});
    showToast("Contact moved to Cold list. Check-in set for 3 months.");
  };
  const onRevive=contactId=>{
    setContacts(prev=>{const u=prev.map(c=>c.id===contactId?{...c,cold:false,coldSince:"",coldFollowUpDate:"",stage:"Connection",stageEnteredAt:todayStr(),cadenceCompleted:[]}:c);setSelected(u.find(c=>c.id===contactId));return u;});
    showToast("Contact revived! Cadence restarted from Connection.");
  };

  const filtered=activeContacts.filter(c=>{
    const q=search.toLowerCase();
    return(!q||c.name.toLowerCase().includes(q)||(c.company||"").toLowerCase().includes(q)||(c.email||"").toLowerCase().includes(q))
      &&(filterStage==="All"||c.stage===filterStage);
  });
  const stageCounts=STAGES.reduce((a,s)=>({...a,[s]:activeContacts.filter(c=>c.stage===s).length}),{});
  const switchTab=t=>{setTab(t);setView(t);};

  const SyncDot=()=>{
    const color=syncState==="err"?D.red:syncState==="ok"?D.green:syncState==="syncing"?D.yellow:D.textMuted;
    const label=syncState==="syncing"?"Syncing…":syncState==="err"?syncMsg:syncState==="ok"?syncMsg:"Sheets connected";
    return(<span style={{fontSize:12,color,display:"flex",alignItems:"center",gap:5}}><span style={{width:7,height:7,borderRadius:"50%",background:color,display:"inline-block",animation:syncState==="syncing"?"pulse 1s infinite":""}}/>{label}</span>);
  };

  return(
    <div style={{minHeight:"100vh",background:D.bg,fontFamily:"'DM Sans',sans-serif",color:D.text}}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
      <div style={{background:D.surface,borderBottom:`1px solid ${D.border}`,padding:"0 20px",display:"flex",alignItems:"center",height:52,gap:12}}>
        <span style={{fontSize:18,fontWeight:700,color:D.text,letterSpacing:"-0.3px"}}>BridgeFlow</span>
        <div style={{display:"flex",gap:2,background:D.card,borderRadius:8,padding:3,marginLeft:8}}>
          {[["home","🏠 Home",0],["contacts","👥 Contacts",0],["dashboard","📅 Follow-ups",urgentCount],["cold","❄️ Cold",coldDueCount],["calendar","📅 Calendar",0]].map(([t,label,badge])=>(
            <button key={t} onClick={()=>switchTab(t)}
              style={{padding:"4px 12px",borderRadius:6,fontSize:13,fontFamily:"inherit",cursor:"pointer",fontWeight:tab===t?600:400,background:tab===t?D.accent:"transparent",color:tab===t?"#fff":D.textSub,border:"none",display:"flex",alignItems:"center",gap:5}}>
              {label}
              {badge>0&&<span style={{background:t==="cold"?"#1A3A50":D.red,color:t==="cold"?"#7AB8D4":"#fff",borderRadius:20,fontSize:11,fontWeight:700,padding:"0 5px",lineHeight:"16px"}}>{badge}</span>}
            </button>
          ))}
        </div>
        <div style={{flex:1}}/>
        <SyncDot/>
        <button onClick={()=>setShowSettings(true)} style={{background:D.card,border:`1px solid ${D.border}`,borderRadius:7,padding:"5px 12px",fontSize:13,color:D.textSub,cursor:"pointer",fontFamily:"inherit"}}>⚙ Settings</button>
      </div>

      <div style={{maxWidth:view==="calendar"?"100%":740,margin:"0 auto",padding:"30px 20px"}}>
        {view==="home"     &&<HomeView contacts={contacts} followups={followups} switchTab={switchTab} setFilterStage={setFilterStage} onAddContact={()=>{setForm(emptyContact);setEditMode(false);setView("add");}}/>}
        {view==="contacts"&&(
          <div>
            <BackHome switchTab={switchTab}/>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
              <div>
                <h1 style={{margin:0,fontSize:28,fontWeight:700,color:D.text,letterSpacing:"-0.5px"}}>Contacts</h1>
                <p style={{margin:"3px 0 0",color:D.textSub,fontSize:13}}>{activeContacts.length} active · {coldContacts.length} cold</p>
              </div>
              <button onClick={()=>{setForm(emptyContact);setEditMode(false);setView("add");}} style={S.btn1}>+ Add Contact</button>
            </div>
            <div style={{display:"flex",gap:10,marginBottom:18}}>
              <input placeholder="Search contacts…" value={search} onChange={e=>setSearch(e.target.value)}
                style={{flex:1,padding:"9px 14px",borderRadius:8,border:`1.5px solid ${D.border}`,fontSize:14,fontFamily:"inherit",outline:"none",background:D.surface,color:D.text}}/>
              {filterStage!=="All"&&<button onClick={()=>setFilterStage("All")} style={{...S.btnSm,color:D.textMuted}}>Clear ×</button>}
            </div>
            {filterStage!=="All"&&(
              <div style={{marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,color:D.textSub}}>Filtered by:</span>
                <StageBadge stage={filterStage}/>
              </div>
            )}
            {filtered.length===0?(
              <div style={{textAlign:"center",padding:"60px 20px",color:D.textMuted}}>
                <div style={{fontSize:40,marginBottom:10}}>👥</div>
                <p style={{fontSize:14}}>{search?"No contacts found":"Add your first contact to get started"}</p>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {filtered.map(c=>{const u=getUrgency(c);return(
                  <div key={c.id} onClick={()=>{setSelected(c);setView("detail");}}
                    style={{background:D.card,border:`1.5px solid ${u&&u.level==="overdue"?D.red+"55":u&&u.level==="today"?"#F9731655":D.border}`,borderRadius:12,padding:"13px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:13}}>
                    <div style={{width:40,height:40,borderRadius:"50%",background:stringToColor(c.name),display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:16,fontWeight:700,color:"#fff"}}>{c.name.charAt(0).toUpperCase()}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontWeight:600,fontSize:15,color:D.text}}>{c.name}</span><StageBadge stage={c.stage}/>
                      </div>
                      <div style={{fontSize:13,color:D.textSub,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{[c.company,c.email].filter(Boolean).join(" · ")}</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      {u&&<UrgencyBadge contact={c}/>}
                      {(c.conversations?.length||0)>0&&<div style={{fontSize:12,color:D.textMuted,marginTop:4}}>{c.conversations.length} note{c.conversations.length>1?"s":""}</div>}
                    </div>
                  </div>
                );})}
              </div>
            )}
          </div>
        )}
        {view==="dashboard"&&<Dashboard contacts={contacts} followups={followups} setSelected={setSelected} setView={setView} onAddContact={()=>{setForm(emptyContact);setEditMode(false);setView("add");}} switchTab={switchTab}/>}
        {view==="cold"     &&<ColdView  contacts={contacts} setSelected={setSelected} setView={setView} switchTab={switchTab}/>}
        {view==="calendar" &&<CalendarView contacts={contacts} switchTab={switchTab} calLinks={calLinks} setCalLinks={setCalLinks}/>}
        {view==="detail"   &&<SafeDetailView selected={selected} contacts={contacts} followups={followups} setFollowups={setFollowups} setContacts={setContacts} setView={setView} setForm={setForm} setEditMode={setEditMode} deleteContact={deleteContact} addLog={addLog} newLog={newLog} setNewLog={setNewLog} addFollowup={addFollowup} newFU={newFU} setNewFU={setNewFU} showFU={showFU} setShowFU={setShowFU} logRef={logRef} onCompleteCadence={onCompleteCadence} onMoveToCold={onMoveToCold} onRevive={onRevive} switchTab={switchTab} calLinks={calLinks}/>}
        {view==="add"      &&<AddEditView form={form} setForm={setForm} editMode={editMode} saveContact={saveContact} setView={setView} switchTab={switchTab}/>}
      </div>

      {showSettings&&<SettingsModal syncState={syncState} syncMsg={syncMsg} exportBackup={exportBackup} importBackup={importBackup} onClose={()=>setShowSettings(false)}/>}
      {toast&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:toast.type==="err"?"#3D1515":"#0D2210",border:`1px solid ${toast.type==="err"?"#7F1D1D":"#166534"}`,color:toast.type==="err"?"#FCA5A5":"#86EFAC",borderRadius:10,padding:"11px 20px",fontSize:14,fontWeight:500,zIndex:200,whiteSpace:"nowrap",boxShadow:"0 4px 20px rgba(0,0,0,0.4)"}}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

export default function AppWithBoundary(){return<RootErrorBoundary><App/></RootErrorBoundary>;}
