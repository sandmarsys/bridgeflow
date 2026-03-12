import { useState, useEffect, useRef, useCallback } from "react";

const STORAGE_KEY  = "bf-contacts-v3";
const FOLLOWUP_KEY = "bf-followups-v3";

// ── YOUR GOOGLE APPS SCRIPT URL ───────────────────────────────────────────────
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzLG432E6Hd9kyzbKW_g0mPh29ZAOoLLw0uo2XpbTrnUEg0rxzpuPJhDOwd-SaOimXT/exec";

const STAGES = ["Connection","Conversation","Commitment","Client","Continuation"];
const STAGE_META = {
  Connection:   { bg:"#0D1F3C", text:"#60A5FA", dot:"#3B82F6", icon:"🔗", desc:"Outreach & prospecting" },
  Conversation: { bg:"#1A1040", text:"#A78BFA", dot:"#8B5CF6", icon:"💬", desc:"Meeting booked" },
  Commitment:   { bg:"#0D2210", text:"#86EFAC", dot:"#22C55E", icon:"📋", desc:"Proposal presented" },
  Client:       { bg:"#1A1200", text:"#FDE68A", dot:"#F59E0B", icon:"💰", desc:"Enrolled & active" },
  Continuation: { bg:"#1A0A1A", text:"#F0ABFC", dot:"#D946EF", icon:"♾️", desc:"Referrals & renewals" },
};

const D = {
  bg:"#080C14", surface:"#0D1220", card:"#111827",
  border:"#1E2D42", borderHi:"#2E4060",
  text:"#E8EEF7", textSub:"#6B82A0", textMuted:"#3A4F68",
  accent:"#3B82F6", green:"#22C55E", red:"#EF4444",
};

function formatDate(d) {
  if (!d) return "";
  return new Date(d+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
}
function isOverdue(d){ return d ? new Date(d+"T00:00:00")<new Date(new Date().toDateString()) : false; }
function isToday(d)  { return d ? d===new Date().toISOString().split("T")[0] : false; }
function stringToColor(str){
  const c=["#3B82F6","#8B5CF6","#EC4899","#14B8A6","#F59E0B","#10B981","#6366F1","#EF4444"];
  let h=0; for(let i=0;i<str.length;i++) h=str.charCodeAt(i)+((h<<5)-h);
  return c[Math.abs(h)%c.length];
}

const emptyContact = { name:"",company:"",email:"",phone:"",whatsapp:"",linkedin:"",stage:"Connection",notes:"" };

// ── APPS SCRIPT SYNC ──────────────────────────────────────────────────────────
function contactsToRows(contacts) {
  return [
    ["id","name","company","email","phone","whatsapp","linkedin","stage","notes","createdAt","conversations"],
    ...contacts.map(c=>[
      c.id, c.name, c.company||"", c.email||"", c.phone||"",
      c.whatsapp||"", c.linkedin||"", c.stage, c.notes||"",
      c.createdAt, JSON.stringify(c.conversations||[])
    ])
  ];
}
function followupsToRows(followups) {
  return [
    ["id","contactId","date","note","done"],
    ...followups.map(f=>[f.id, f.contactId, f.date, f.note||"", f.done?"TRUE":"FALSE"])
  ];
}
function rowsToContacts(rows) {
  if (!rows||rows.length<2) return [];
  const [h,...data] = rows;
  return data.filter(r=>r[0]).map(r=>{
    const o={}; h.forEach((k,i)=>o[k]=r[i]||"");
    try { o.conversations=JSON.parse(o.conversations||"[]"); } catch { o.conversations=[]; }
    return o;
  });
}
function rowsToFollowups(rows) {
  if (!rows||rows.length<2) return [];
  const [h,...data] = rows;
  return data.filter(r=>r[0]).map(r=>{
    const o={}; h.forEach((k,i)=>o[k]=r[i]||"");
    o.done = o.done==="TRUE"; return o;
  });
}

async function pushToScript(contacts, followups) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify({
      action: "sync",
      contacts:  contactsToRows(contacts),
      followups: followupsToRows(followups),
    }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Sync failed");
}

async function pullFromScript() {
  const res  = await fetch(APPS_SCRIPT_URL);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Load failed");
  return {
    contacts:  rowsToContacts(json.contacts),
    followups: rowsToFollowups(json.followups),
  };
}
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [contacts,     setContacts]     = useState([]);
  const [followups,    setFollowups]    = useState([]);
  const [view,         setView]         = useState("contacts");
  const [selected,     setSelected]     = useState(null);
  const [search,       setSearch]       = useState("");
  const [filterStage,  setFilterStage]  = useState("All");
  const [form,         setForm]         = useState(emptyContact);
  const [editMode,     setEditMode]     = useState(false);
  const [newLog,       setNewLog]       = useState("");
  const [newFU,        setNewFU]        = useState({date:"",note:""});
  const [showFU,       setShowFU]       = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [syncState,    setSyncState]    = useState("idle"); // idle|syncing|ok|err
  const [syncMsg,      setSyncMsg]      = useState("");
  const [toast,        setToast]        = useState(null);
  const [loadingInit,  setLoadingInit]  = useState(true);
  const syncTimer = useRef(null);
  const logRef    = useRef(null);

  // ── INIT: load local first, then pull from Sheets ─────────────
  useEffect(()=>{
    const localC = localStorage.getItem(STORAGE_KEY);
    const localF = localStorage.getItem(FOLLOWUP_KEY);
    if (localC) setContacts(JSON.parse(localC));
    if (localF) setFollowups(JSON.parse(localF));

    // Try to pull latest from Google Sheets
    pullFromScript()
      .then(({contacts:c, followups:f})=>{
        if (c.length > 0 || f.length > 0) {
          setContacts(c);
          setFollowups(f);
          localStorage.setItem(STORAGE_KEY,  JSON.stringify(c));
          localStorage.setItem(FOLLOWUP_KEY, JSON.stringify(f));
        }
        setSyncState("ok");
        setSyncMsg("Synced with Google Sheets");
        setTimeout(()=>setSyncState("idle"), 3000);
      })
      .catch(()=>{
        // silently fall back to local data — no error on first load
      })
      .finally(()=> setLoadingInit(false));
  },[]);

  // ── PERSIST LOCALLY ───────────────────────────────────────────
  useEffect(()=>{ localStorage.setItem(STORAGE_KEY,  JSON.stringify(contacts));  },[contacts]);
  useEffect(()=>{ localStorage.setItem(FOLLOWUP_KEY, JSON.stringify(followups)); },[followups]);

  // ── AUTO-SYNC TO SHEETS (debounced 2.5s) ─────────────────────
  const scheduleSync = useCallback((c, f)=>{
    clearTimeout(syncTimer.current);
    setSyncState("syncing");
    syncTimer.current = setTimeout(async()=>{
      try {
        await pushToScript(c, f);
        setSyncState("ok");
        setSyncMsg("Synced · "+new Date().toLocaleTimeString());
        setTimeout(()=>setSyncState("idle"), 4000);
      } catch(e) {
        setSyncState("err");
        setSyncMsg("Sync failed: "+e.message);
      }
    }, 2500);
  },[]);

  const prevContacts  = useRef(null);
  const prevFollowups = useRef(null);
  useEffect(()=>{
    if (loadingInit) return; // don't sync during initial load
    if (prevContacts.current===null) { prevContacts.current=contacts; prevFollowups.current=followups; return; }
    scheduleSync(contacts, followups);
    prevContacts.current  = contacts;
    prevFollowups.current = followups;
  },[contacts, followups, loadingInit]);

  const showToast=(msg,type="ok")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  // ── EXPORT / IMPORT ───────────────────────────────────────────
  const exportBackup=()=>{
    const blob=new Blob([JSON.stringify({contacts,followups,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=`bridgeflow-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    showToast("Backup downloaded!");
  };
  const importBackup=(e)=>{
    const file=e.target.files[0]; if(!file) return;
    const r=new FileReader();
    r.onload=ev=>{
      try {
        const d=JSON.parse(ev.target.result);
        if(!Array.isArray(d.contacts)) throw new Error();
        setContacts(d.contacts); setFollowups(d.followups||[]);
        showToast(`Restored ${d.contacts.length} contacts!`);
      } catch { showToast("Invalid backup file","err"); }
    };
    r.readAsText(file); e.target.value="";
  };

  // ── DATA OPS ──────────────────────────────────────────────────
  const saveContact=()=>{
    if(!form.name.trim()) return;
    let next;
    if(editMode&&selected){
      next=contacts.map(c=>c.id===selected.id?{...c,...form}:c);
      setSelected({...selected,...form});
    } else {
      next=[{...form,id:Date.now().toString(),createdAt:new Date().toISOString(),conversations:[]}, ...contacts];
    }
    setContacts(next); setEditMode(false); setView(editMode?"detail":"contacts");
  };
  const deleteContact=(id)=>{
    setContacts(contacts.filter(c=>c.id!==id));
    setFollowups(followups.filter(f=>f.contactId!==id));
    setView("contacts");
  };
  const addLog=(contactId)=>{
    if(!newLog.trim()) return;
    const entry={id:Date.now().toString(),text:newLog,date:new Date().toISOString()};
    const u=contacts.map(c=>c.id===contactId?{...c,conversations:[entry,...(c.conversations||[])]}:c);
    setContacts(u); setSelected(u.find(c=>c.id===contactId)); setNewLog("");
  };
  const addFollowup=(contactId)=>{
    if(!newFU.date) return;
    setFollowups([...followups,{id:Date.now().toString(),contactId,...newFU,done:false}]);
    setNewFU({date:"",note:""}); setShowFU(false);
  };

  const filtered=contacts.filter(c=>{
    const q=search.toLowerCase();
    return(!q||c.name.toLowerCase().includes(q)||(c.company||"").toLowerCase().includes(q)||(c.email||"").toLowerCase().includes(q))
      &&(filterStage==="All"||c.stage===filterStage);
  });

  const pendingFU  = followups.filter(f=>!f.done&&(isToday(f.date)||isOverdue(f.date)));
  const stageCounts= STAGES.reduce((a,s)=>({...a,[s]:contacts.filter(c=>c.stage===s).length}),{});

  // ── SHARED STYLES ─────────────────────────────────────────────
  const S = {
    btn1:  {background:D.accent,color:"#fff",border:"none",borderRadius:8,padding:"9px 18px",fontSize:14,fontFamily:"inherit",cursor:"pointer",fontWeight:500},
    btn2:  {background:"transparent",color:D.textSub,border:`1.5px solid ${D.border}`,borderRadius:8,padding:"8px 18px",fontSize:14,fontFamily:"inherit",cursor:"pointer"},
    btnSm: {background:D.surface,color:D.textSub,border:`1px solid ${D.border}`,borderRadius:6,padding:"6px 12px",fontSize:13,fontFamily:"inherit",cursor:"pointer"},
    lbl:   {display:"block",fontSize:11,color:D.textSub,fontWeight:600,marginBottom:6,textTransform:"uppercase",letterSpacing:0.6},
    inp:   {width:"100%",padding:"9px 12px",borderRadius:8,border:`1.5px solid ${D.border}`,fontSize:14,fontFamily:"inherit",boxSizing:"border-box",outline:"none",background:D.surface,color:D.text},
    card:  {background:D.card,border:`1.5px solid ${D.border}`,borderRadius:12,padding:18,marginBottom:18},
    secH:  {margin:"0 0 14px",fontSize:15,fontWeight:600,color:D.text},
  };

  // ── SYNC INDICATOR ────────────────────────────────────────────
  const SyncDot=()=>{
    const color = syncState==="err"?D.red : syncState==="ok"?D.green : syncState==="syncing"?"#F59E0B" : D.textMuted;
    const label = syncState==="syncing"?"Syncing…" : syncState==="err"?syncMsg : syncState==="ok"?syncMsg : "Google Sheets connected";
    return(
      <span style={{fontSize:12,color,display:"flex",alignItems:"center",gap:5}}>
        <span style={{width:7,height:7,borderRadius:"50%",background:color,display:"inline-block",animation:syncState==="syncing"?"pulse 1s infinite":""}}/>
        {label}
      </span>
    );
  };

  // ── SETTINGS MODAL ────────────────────────────────────────────
  const SettingsModal=()=>(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:D.card,border:`1.5px solid ${D.border}`,borderRadius:16,padding:28,width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
          <h2 style={{margin:0,fontSize:20,fontWeight:700,color:D.text}}>Settings</h2>
          <button onClick={()=>setShowSettings(false)} style={{background:"none",border:"none",color:D.textSub,cursor:"pointer",fontSize:24,lineHeight:1}}>×</button>
        </div>

        {/* SYNC STATUS */}
        <div style={{...S.card,marginBottom:18}}>
          <p style={S.secH}>🔄 Google Sheets Sync</p>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:8,background:D.surface,border:`1px solid ${D.border}`}}>
            <span style={{width:10,height:10,borderRadius:"50%",background:syncState==="err"?D.red:D.green,flexShrink:0,display:"inline-block"}}/>
            <div>
              <p style={{margin:0,fontSize:14,color:D.text,fontWeight:500}}>
                {syncState==="err" ? "Sync error" : "Connected & syncing automatically"}
              </p>
              <p style={{margin:"2px 0 0",fontSize:12,color:D.textSub}}>
                {syncState==="err" ? syncMsg : "Every change saves to your Google Sheet within a few seconds"}
              </p>
            </div>
          </div>
        </div>

        {/* BACKUP */}
        <div style={{...S.card}}>
          <p style={S.secH}>📦 Manual Backup</p>
          <p style={{margin:"0 0 14px",fontSize:13,color:D.textSub,lineHeight:1.6}}>Download all your data as a file. Useful as an extra safety net alongside Google Sheets sync.</p>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <button onClick={exportBackup} style={S.btn1}>⬇ Export Backup</button>
            <label style={{...S.btn2,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6}}>
              ⬆ Import Backup
              <input type="file" accept=".json" onChange={importBackup} style={{display:"none"}}/>
            </label>
          </div>
        </div>

        <button onClick={()=>setShowSettings(false)} style={{...S.btn1,width:"100%"}}>Done</button>
      </div>
    </div>
  );

  // ── PIPELINE BAR ──────────────────────────────────────────────
  const PipelineBar=()=>(
    <div style={{...S.card}}>
      <p style={{margin:"0 0 12px",fontSize:11,color:D.textSub,fontWeight:600,textTransform:"uppercase",letterSpacing:0.6}}>Pipeline Overview</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
        {STAGES.map((st,i)=>{
          const m=STAGE_META[st]; const active=filterStage===st;
          return(
            <button key={st} onClick={()=>setFilterStage(active?"All":st)}
              style={{position:"relative",background:active?m.bg:"transparent",border:`1.5px solid ${active?m.dot:D.border}`,borderRadius:8,padding:"10px 6px",cursor:"pointer",textAlign:"center"}}>
              {i<STAGES.length-1&&<div style={{position:"absolute",right:-7,top:"50%",transform:"translateY(-50%)",color:D.textMuted,fontSize:14,zIndex:1,pointerEvents:"none"}}>›</div>}
              <div style={{fontSize:18,lineHeight:1,marginBottom:5}}>{m.icon}</div>
              <div style={{fontSize:10,fontWeight:600,color:active?m.text:D.textSub,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{st}</div>
              <div style={{fontSize:22,fontWeight:700,color:active?m.text:D.text,lineHeight:1.3,marginTop:3}}>{stageCounts[st]}</div>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── CONTACT LIST ──────────────────────────────────────────────
  const ContactList=()=>(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
        <div>
          <h1 style={{margin:0,fontSize:28,fontWeight:700,color:D.text,letterSpacing:"-0.5px"}}>Contacts</h1>
          <p style={{margin:"3px 0 0",color:D.textSub,fontSize:13}}>{contacts.length} people tracked</p>
        </div>
        <button onClick={()=>{setForm(emptyContact);setEditMode(false);setView("add");}} style={S.btn1}>+ Add Contact</button>
      </div>

      {pendingFU.length>0&&(
        <div style={{background:"#1C1000",border:"1px solid #4A2E00",borderRadius:10,padding:"11px 16px",marginBottom:18,display:"flex",gap:10,alignItems:"center"}}>
          <span>🔔</span>
          <span style={{fontSize:14,color:"#FCD34D"}}><strong>{pendingFU.length}</strong> follow-up{pendingFU.length>1?"s":""} need attention today</span>
        </div>
      )}

      <PipelineBar/>

      <div style={{display:"flex",gap:10,marginBottom:18}}>
        <input placeholder="Search contacts…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{flex:1,padding:"9px 14px",borderRadius:8,border:`1.5px solid ${D.border}`,fontSize:14,fontFamily:"inherit",outline:"none",background:D.surface,color:D.text}}/>
        {filterStage!=="All"&&<button onClick={()=>setFilterStage("All")} style={{...S.btnSm,color:D.textMuted}}>Clear ×</button>}
      </div>

      {filtered.length===0?(
        <div style={{textAlign:"center",padding:"60px 20px",color:D.textMuted}}>
          <div style={{fontSize:40,marginBottom:10}}>👥</div>
          <p style={{fontSize:14}}>{search?"No contacts found":"Add your first contact to get started"}</p>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {filtered.map(c=>{
            const due=followups.filter(f=>f.contactId===c.id&&!f.done&&(isOverdue(f.date)||isToday(f.date)));
            return(
              <div key={c.id} onClick={()=>{setSelected(c);setView("detail");}}
                style={{background:D.card,border:`1.5px solid ${D.border}`,borderRadius:12,padding:"13px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:13}}>
                <div style={{width:40,height:40,borderRadius:"50%",background:stringToColor(c.name),display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:16,fontWeight:700,color:"#fff"}}>
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <span style={{fontWeight:600,fontSize:15,color:D.text}}>{c.name}</span>
                    <StageBadge stage={c.stage}/>
                  </div>
                  <div style={{fontSize:13,color:D.textSub,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {[c.company,c.email].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  {due.length>0&&<div style={{fontSize:12,background:"#1C1000",color:"#FCD34D",padding:"2px 8px",borderRadius:20,fontWeight:600}}>📅 {due.length} due</div>}
                  {(c.conversations?.length||0)>0&&<div style={{fontSize:12,color:D.textMuted,marginTop:4}}>{c.conversations.length} note{c.conversations.length>1?"s":""}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── DETAIL VIEW ───────────────────────────────────────────────
  const DetailView=()=>{
    if(!selected) return null;
    const contact=contacts.find(c=>c.id===selected.id)||selected;
    const cFU=followups.filter(f=>f.contactId===contact.id).sort((a,b)=>a.date.localeCompare(b.date));
    const stageIdx=STAGES.indexOf(contact.stage);
    return(
      <div>
        <button onClick={()=>setView("contacts")} style={{background:"none",border:"none",color:D.textSub,cursor:"pointer",padding:"0 0 18px",fontSize:14,display:"flex",alignItems:"center",gap:6}}>← Back</button>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:22}}>
          <div style={{display:"flex",gap:14,alignItems:"center"}}>
            <div style={{width:54,height:54,borderRadius:"50%",background:stringToColor(contact.name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:700,color:"#fff",flexShrink:0}}>
              {contact.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 style={{margin:0,fontSize:24,fontWeight:700,color:D.text,letterSpacing:"-0.3px"}}>{contact.name}</h2>
              {contact.company&&<p style={{margin:"2px 0 6px",color:D.textSub,fontSize:14}}>{contact.company}</p>}
              <StageBadge stage={contact.stage} showDesc/>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{setForm({name:contact.name,company:contact.company||"",email:contact.email||"",phone:contact.phone||"",whatsapp:contact.whatsapp||"",linkedin:contact.linkedin||"",stage:contact.stage,notes:contact.notes||""});setEditMode(true);setView("add");}} style={S.btn2}>Edit</button>
            <button onClick={()=>{if(window.confirm("Delete this contact?"))deleteContact(contact.id);}} style={{...S.btn2,color:"#F87171",borderColor:"#3D1515"}}>Delete</button>
          </div>
        </div>

        <div style={{...S.card}}>
          <p style={{...S.secH,marginBottom:14}}>Pipeline Progress</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:4}}>
            {STAGES.map((st,i)=>{
              const m=STAGE_META[st];const isA=contact.stage===st;const isP=stageIdx>i;
              return(<div key={st} style={{textAlign:"center"}}>
                <div style={{height:4,borderRadius:2,background:isA||isP?m.dot:D.border,marginBottom:7}}/>
                <div style={{fontSize:16,marginBottom:3}}>{m.icon}</div>
                <div style={{fontSize:10,fontWeight:600,color:isA?m.text:isP?D.textSub:D.textMuted}}>{st}</div>
              </div>);
            })}
          </div>
        </div>

        <div style={{...S.card}}>
          <p style={S.secH}>Contact Info</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px 20px"}}>
            {contact.email    &&<InfoRow label="Email"    value={contact.email}/>}
            {contact.phone    &&<InfoRow label="Phone"    value={contact.phone}/>}
            {contact.whatsapp &&<InfoRow label="WhatsApp" value={contact.whatsapp} link={`https://wa.me/${contact.whatsapp.replace(/\D/g,"")}`}/>}
            {contact.linkedin &&<InfoRow label="LinkedIn" value="View Profile" link={contact.linkedin.startsWith("http")?contact.linkedin:`https://${contact.linkedin}`}/>}
            {contact.notes    &&<div style={{gridColumn:"1/-1"}}><InfoRow label="Notes" value={contact.notes}/></div>}
          </div>
        </div>

        <div style={{...S.card}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <p style={{...S.secH,margin:0}}>Follow-ups</p>
            <button onClick={()=>setShowFU(!showFU)} style={S.btnSm}>+ Schedule</button>
          </div>
          {showFU&&(
            <div style={{background:D.surface,borderRadius:8,padding:14,marginBottom:14,display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div><label style={S.lbl}>Date</label><input type="date" value={newFU.date} onChange={e=>setNewFU({...newFU,date:e.target.value})} style={{...S.inp,width:"auto",colorScheme:"dark"}}/></div>
              <div style={{flex:1,minWidth:150}}><label style={S.lbl}>Note (optional)</label><input placeholder="What to discuss…" value={newFU.note} onChange={e=>setNewFU({...newFU,note:e.target.value})} style={S.inp}/></div>
              <button onClick={()=>addFollowup(contact.id)} style={S.btn1}>Add</button>
              <button onClick={()=>setShowFU(false)} style={S.btn2}>Cancel</button>
            </div>
          )}
          {cFU.length===0
            ?<p style={{fontSize:14,color:D.textMuted,margin:0}}>No follow-ups scheduled</p>
            :<div style={{display:"flex",flexDirection:"column",gap:7}}>
              {cFU.map(fu=>(
                <div key={fu.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,background:isOverdue(fu.date)&&!fu.done?"#120800":D.surface,border:`1px solid ${isOverdue(fu.date)&&!fu.done?"#4A2E00":D.border}`}}>
                  <input type="checkbox" checked={fu.done} onChange={()=>setFollowups(followups.map(f=>f.id===fu.id?{...f,done:!f.done}:f))} style={{width:15,height:15,cursor:"pointer",accentColor:D.accent}}/>
                  <div style={{flex:1}}>
                    <span style={{fontSize:13,fontWeight:600,color:fu.done?D.textMuted:isOverdue(fu.date)?"#FCD34D":D.text,textDecoration:fu.done?"line-through":"none"}}>
                      {isToday(fu.date)?"Today":formatDate(fu.date)}
                      {isOverdue(fu.date)&&!fu.done&&<span style={{marginLeft:6,fontSize:11,background:"#1C1000",color:"#FCD34D",padding:"1px 6px",borderRadius:10}}>Overdue</span>}
                    </span>
                    {fu.note&&<p style={{margin:"2px 0 0",fontSize:13,color:fu.done?D.textMuted:D.textSub}}>{fu.note}</p>}
                  </div>
                  <button onClick={()=>setFollowups(followups.filter(f=>f.id!==fu.id))} style={{background:"none",border:"none",cursor:"pointer",color:D.textMuted,fontSize:18,padding:0,lineHeight:1}}>×</button>
                </div>
              ))}
            </div>
          }
        </div>

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
  };

  // ── ADD/EDIT VIEW ─────────────────────────────────────────────
  const AddEditView=()=>(
    <div>
      <button onClick={()=>setView(editMode?"detail":"contacts")} style={{background:"none",border:"none",color:D.textSub,cursor:"pointer",padding:"0 0 18px",fontSize:14,display:"flex",alignItems:"center",gap:6}}>← Back</button>
      <h2 style={{margin:"0 0 22px",fontSize:24,fontWeight:700,color:D.text}}>{editMode?"Edit Contact":"New Contact"}</h2>
      <div style={{display:"flex",flexDirection:"column",gap:16,background:D.card,border:`1.5px solid ${D.border}`,borderRadius:12,padding:24}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div><label style={S.lbl}>Name *</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} style={S.inp} placeholder="Full name"/></div>
          <div><label style={S.lbl}>Company</label><input value={form.company} onChange={e=>setForm({...form,company:e.target.value})} style={S.inp} placeholder="Company name"/></div>
          <div><label style={S.lbl}>Email</label><input value={form.email} onChange={e=>setForm({...form,email:e.target.value})} style={S.inp} placeholder="email@example.com"/></div>
          <div><label style={S.lbl}>Phone</label><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} style={S.inp} placeholder="+1 (555) 000-0000"/></div>
          <div><label style={S.lbl}>WhatsApp</label><input value={form.whatsapp} onChange={e=>setForm({...form,whatsapp:e.target.value})} style={S.inp} placeholder="+1 (555) 000-0000"/></div>
          <div><label style={S.lbl}>LinkedIn URL</label><input value={form.linkedin} onChange={e=>setForm({...form,linkedin:e.target.value})} style={S.inp} placeholder="linkedin.com/in/username"/></div>
        </div>
        <div>
          <label style={S.lbl}>Pipeline Stage</label>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {STAGES.map(st=>{
              const m=STAGE_META[st];const sel=form.stage===st;
              return(<button key={st} onClick={()=>setForm({...form,stage:st})}
                style={{padding:"8px 14px",borderRadius:20,border:`1.5px solid ${sel?m.dot:D.border}`,background:sel?m.bg:"transparent",color:sel?m.text:D.textSub,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:sel?600:400,display:"flex",alignItems:"center",gap:5}}>
                <span>{m.icon}</span>{st}
              </button>);
            })}
          </div>
          <p style={{margin:"6px 0 0",fontSize:12,color:D.textMuted}}>{STAGE_META[form.stage]?.desc}</p>
        </div>
        <div><label style={S.lbl}>Notes</label><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} style={{...S.inp,height:80,resize:"none"}} placeholder="Any important context…"/></div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={saveContact} style={S.btn1}>{editMode?"Save Changes":"Add Contact"}</button>
          <button onClick={()=>setView(editMode?"detail":"contacts")} style={S.btn2}>Cancel</button>
        </div>
      </div>
    </div>
  );

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:D.bg,fontFamily:"'DM Sans',sans-serif",color:D.text}}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
      <div style={{background:D.surface,borderBottom:`1px solid ${D.border}`,padding:"0 20px",display:"flex",alignItems:"center",height:52,gap:12}}>
        <span style={{fontSize:18,fontWeight:700,color:D.text,letterSpacing:"-0.3px"}}>BridgeFlow</span>
        <div style={{flex:1}}/>
        <SyncDot/>
        <button onClick={()=>setShowSettings(true)}
          style={{background:D.card,border:`1px solid ${D.border}`,borderRadius:7,padding:"5px 12px",fontSize:13,color:D.textSub,cursor:"pointer",fontFamily:"inherit"}}>
          ⚙ Settings
        </button>
      </div>

      <div style={{maxWidth:740,margin:"0 auto",padding:"30px 20px"}}>
        {view==="contacts"&&<ContactList/>}
        {view==="detail"  &&<DetailView/>}
        {view==="add"     &&<AddEditView/>}
      </div>

      {showSettings&&<SettingsModal/>}

      {toast&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:toast.type==="err"?"#3D1515":"#0D2210",border:`1px solid ${toast.type==="err"?"#7F1D1D":"#166534"}`,color:toast.type==="err"?"#FCA5A5":"#86EFAC",borderRadius:10,padding:"11px 20px",fontSize:14,fontWeight:500,zIndex:200,whiteSpace:"nowrap",boxShadow:"0 4px 20px rgba(0,0,0,0.4)"}}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function StageBadge({stage,showDesc}){
  const m=STAGE_META[stage]||STAGE_META.Connection;
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,background:m.bg,color:m.text,fontSize:12,fontWeight:600}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:m.dot,display:"inline-block"}}/>
      {stage}
      {showDesc&&<span style={{fontWeight:400,opacity:0.75,marginLeft:2}}>· {m.desc}</span>}
    </span>
  );
}

function InfoRow({label,value,link}){
  return(
    <div>
      <div style={{fontSize:11,color:"#3A4F68",fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:3}}>{label}</div>
      {link
        ?<a href={link} target="_blank" rel="noreferrer" style={{fontSize:14,color:"#60A5FA",textDecoration:"none"}}>{value}</a>
        :<div style={{fontSize:14,color:"#E8EEF7"}}>{value}</div>
      }
    </div>
  );
}
