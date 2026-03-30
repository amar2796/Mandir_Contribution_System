let selectedYear;
let _cbId = 0;

function escapeHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function fmt(n) { return Number(n||0).toLocaleString("en-IN"); }

/* ═══ ANIMATED BOTTOM-UP TOAST ═══ */
function toast(msg, type) {
  if (!document.getElementById("_toastCSS")) {
    let s = document.createElement("style"); s.id = "_toastCSS";
    s.textContent = `
      #_tw{position:fixed;bottom:24px;right:24px;z-index:999999;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:340px;}
      .ti{display:flex;align-items:center;gap:10px;padding:13px 18px;border-radius:10px;font-family:Poppins,sans-serif;font-size:13.5px;font-weight:600;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,0.18);min-width:220px;pointer-events:all;animation:tUp .35s cubic-bezier(.21,1.02,.73,1) both;position:relative;overflow:hidden;line-height:1.4;}
      .tb{position:absolute;bottom:0;left:0;height:3px;background:rgba(255,255,255,0.4);animation:tBar 3.5s linear forwards;}
      @keyframes tUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
      @keyframes tBar{from{width:100%}to{width:0%}}
      .to{animation:tDn .3s ease forwards!important;}
      @keyframes tDn{to{opacity:0;transform:translateY(12px)}}
    `;
    document.head.appendChild(s);
  }
  let wrap = document.getElementById("_tw");
  if (!wrap) { wrap = document.createElement("div"); wrap.id = "_tw"; document.body.appendChild(wrap); }
  const bg   = type==="error"?"#e74c3c":type==="warn"?"#e67e22":"#27ae60";
  const icon = type==="error"?"✕":type==="warn"?"⚠":"✓";
  let item = document.createElement("div"); item.className = "ti"; item.style.background = bg;
  let iconSpan = document.createElement("span"); iconSpan.style.fontSize = "16px"; iconSpan.textContent = icon;
  let msgSpan = document.createElement("span"); msgSpan.style.flex = "1"; msgSpan.textContent = msg;
  let bar = document.createElement("div"); bar.className = "tb";
  item.appendChild(iconSpan); item.appendChild(msgSpan); item.appendChild(bar);
  wrap.appendChild(item);
  setTimeout(()=>{ item.classList.add("to"); setTimeout(()=>item.remove(),320); },3500);
}

/* ═══ SHA-256 ═══ */
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

/* ═══ JSONP GET ═══ */
function getData(action) {
  return new Promise((resolve,reject)=>{
    _cbId++; const cb="cb_"+_cbId+"_"+Date.now(); const script=document.createElement("script"); let done=false;
    window[cb]=function(data){if(done)return;done=true;clearTimeout(timer);delete window[cb];script.remove();resolve(data);};
    const timer=setTimeout(()=>{if(done)return;done=true;delete window[cb];script.remove();reject(new Error("Request timed out."));},20000);
    script.onerror=function(){if(done)return;done=true;clearTimeout(timer);delete window[cb];script.remove();reject(new Error("Network error."));};
    script.src=API_URL+"?action="+action+"&callback="+cb; document.body.appendChild(script);
  });
}

/* ═══ JSONP POST ═══ */
function postData(data) {
  return new Promise((resolve,reject)=>{
    _cbId++; const cb="cb_post_"+_cbId+"_"+Date.now(); const script=document.createElement("script"); let done=false;
    window[cb]=function(res){if(done)return;done=true;clearTimeout(timer);delete window[cb];script.remove();resolve(res);};
    const timer=setTimeout(()=>{if(done)return;done=true;delete window[cb];script.remove();reject(new Error("Request timed out."));},20000);
    script.onerror=function(){if(done)return;done=true;clearTimeout(timer);delete window[cb];script.remove();reject(new Error("Network error."));};
    script.src=API_URL+"?"+new URLSearchParams(data).toString()+"&callback="+cb; document.body.appendChild(script);
  });
}

/* ═══════════════════════════════════════════════════════════
   ONE SESSION PER USER — Cross-device single session system
   ═══════════════════════════════════════════════════════════
   HOW IT WORKS:
   1. On login: a random sessionToken is generated, saved to
      localStorage AND written to the USERS sheet (setSessionToken).
   2. Every 90 seconds: checkSession polls the sheet. If the token
      stored on sheet no longer matches localStorage (because another
      device logged in and overwrote it), this tab is logged out.
   3. BroadcastChannel still handles same-browser/same-device tabs
      instantly without waiting for the 90s poll.
   ═══════════════════════════════════════════════════════════ */

window._myTabToken = Math.random().toString(36).slice(2) + Date.now();

/* ── Same-browser tab kick (instant) ── */
(function(){
  if(typeof BroadcastChannel !== "undefined"){
    window._sessionBC = new BroadcastChannel("mandir_session");
    window._sessionBC.onmessage = function(e){
      if(e.data && e.data.type === "SESSION_REVOKED"){
        const s = JSON.parse(localStorage.getItem("session") || "null");
        if(s && String(s.userId) === String(e.data.userId) &&
           e.data.newTabToken !== window._myTabToken){
          _forceLogout("⚠️ Logged in from another tab. This session has ended.");
        }
      }
    };
  }
})();

function broadcastSessionRevoke(userId){
  if(typeof BroadcastChannel !== "undefined" && window._sessionBC){
    window._sessionBC.postMessage({
      type:"SESSION_REVOKED",
      userId: String(userId),
      newTabToken: window._myTabToken
    });
  }
}

/* ── Write session token to sheet after login ── */
function setSessionTokenOnServer(userId, token){
  // Best-effort — fire and forget via JSONP
  const cb = "cb_sst_" + Date.now();
  const script = document.createElement("script");
  window[cb] = function(){ delete window[cb]; script.remove(); };
  script.src = API_URL + "?action=setSessionToken&userId=" +
    encodeURIComponent(userId) + "&token=" + encodeURIComponent(token) +
    "&callback=" + cb;
  script.onerror = function(){ delete window[cb]; script.remove(); };
  document.body.appendChild(script);
}

/* ── Cross-device poll: verify token against sheet every 90s ── */
(function(){
  const POLL_MS = 90000; // 90 seconds
  const PROTECTED = ["admin.html","user.html","dashboard.html"];
  const isProtected = PROTECTED.some(p => window.location.pathname.includes(p.replace(".html","")));
  if(!isProtected) return;

  function _poll(){
    const s = JSON.parse(localStorage.getItem("session") || "null");
    if(!s || !s.sessionToken || !s.userId) return;
    if(Date.now() > s.expiry){
      _forceLogout("⏰ Session expired. Please login again.");
      return;
    }
    // Poll sheet for token match
    const cb = "cb_cs_" + Date.now();
    const script = document.createElement("script");
    let done = false;
    window[cb] = function(res){
      if(done) return; done = true;
      delete window[cb]; script.remove();
      if(res && res.valid === false){
        _forceLogout("⚠️ Your account was logged in from another device. This session has ended.");
      }
    };
    const timer = setTimeout(()=>{
      if(done) return; done = true;
      delete window[cb]; script.remove();
      // Timeout — don't log out, just skip this poll
    }, 15000);
    script.onerror = function(){
      if(done) return; done = true;
      clearTimeout(timer); delete window[cb]; script.remove();
    };
    script.src = API_URL + "?action=checkSession&userId=" +
      encodeURIComponent(s.userId) + "&token=" +
      encodeURIComponent(s.sessionToken) + "&callback=" + cb;
    document.body.appendChild(script);
  }

  // Start polling after 10s (let page load finish), then every 90s
  setTimeout(function(){
    _poll();
    setInterval(_poll, POLL_MS);
  }, 10000);
})();

/* ── Shared forced-logout helper ── */
function _forceLogout(message){
  const s = JSON.parse(localStorage.getItem("session") || "null");
  try {
    if(s && s.userId){
      // Log the forced logout in audit
      postData({ action:"logout", userId:s.userId, userName:s.name||"User" }).catch(()=>{});
    }
  } catch(e){}
  localStorage.clear();
  sessionStorage.clear();
  toast(message || "Session ended. Please login again.", "warn");
  setTimeout(()=>location.replace("login.html"), 2200);
}


function checkSession() {
  let s=JSON.parse(localStorage.getItem("session"));
  if(!s||Date.now()>s.expiry){
    _forceLogout("Session expired. Please login again.");
    return false;
  }
  // Refresh sliding expiry window on activity
  s.expiry=Date.now()+30*60*1000;
  localStorage.setItem("session",JSON.stringify(s));
  return true;
}

/* ── Auto 30-min session expiry — activity-based sliding window ── */
(function(){
  function _touchSession(){
    let s=JSON.parse(localStorage.getItem("session")||"null");
    if(!s) return;
    s.expiry=Date.now()+30*60*1000;
    localStorage.setItem("session",JSON.stringify(s));
  }
  ["click","keydown","touchstart","scroll"].forEach(evt=>{
    document.addEventListener(evt, _touchSession, {passive:true});
  });
  // Poll every 60s — if expired on a protected page, force logout
  setInterval(function(){
    let s=JSON.parse(localStorage.getItem("session")||"null");
    if(s && Date.now()>s.expiry){
      const isProtected = window.location.pathname.includes("admin") ||
                          window.location.pathname.includes("user");
      if(isProtected){
        _forceLogout("⏰ Session expired after 30 minutes of inactivity.");
      }
    }
  }, 60000);
})();

/* ═══ LOCAL UPDATE ═══ */
function updateLocalData(category,id,newData){
  if(category==="contributions"){let i=data.findIndex(x=>String(x.Id)===String(id));if(i!==-1)data[i]={...data[i],...newData};}
  else if(category==="expenses"){let i=expenses.findIndex(x=>String(x.Id)===String(id));if(i!==-1)expenses[i]={...expenses[i],...newData};}
  render();if(typeof renderExpenses==="function")renderExpenses();loadSummary();
}

/* ═══ YEAR DROPDOWN ═══ */
function loadYearDropdown(){
  const yearSelect=document.getElementById("yearSelect"); if(!yearSelect)return;
  let years=new Set();
  if(typeof contributions!=="undefined")contributions.forEach(c=>{let y=Number(c.Year);if(!isNaN(y)&&y>2000)years.add(y);});
  if(typeof expenses!=="undefined")expenses.forEach(e=>{let y=Number(e.Year);if(!isNaN(y)&&y>2000)years.add(y);});
  let curY=new Date().getFullYear();
  for(let y=2023;y<=curY+1;y++) years.add(y);
  let sorted=Array.from(years).filter(y=>!isNaN(y)).sort((a,b)=>b-a);
  yearSelect.innerHTML=sorted.map(y=>`<option value="${y}"${y===curY?" selected":""}>${y}</option>`).join("");
  yearSelect.value=curY;
  selectedYear=curY;
  yearSelect.onchange=function(){selectedYear=Number(this.value);if(typeof applyFilter==="function")applyFilter();};
}

/* ═══ UNIVERSAL MODAL SYSTEM ═══ */
function _ensureModalCSS(){
  if(document.getElementById("_mCSS"))return;
  let st=document.createElement("style");st.id="_mCSS";
  st.textContent=`
    @keyframes _mF{from{opacity:0}to{opacity:1}}
    @keyframes _mS{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
    #_uniModal{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.55);z-index:88888;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;animation:_mF .2s ease;}
    ._mbox{background:#fff;border-radius:16px;width:100%;max-height:92vh;overflow-y:auto;animation:_mS .3s cubic-bezier(.21,1.02,.73,1);box-shadow:0 20px 60px rgba(0,0,0,0.25);}
    ._mbox::-webkit-scrollbar{width:5px}._mbox::-webkit-scrollbar-thumb{background:#ddd;border-radius:3px;}
    ._mhdr{background:#334155;color:#fff;padding:16px 22px;border-radius:16px 16px 0 0;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:2;}
    ._mhdr h3{margin:0;font-size:1.05rem;font-weight:700;color:#f7a01a;display:flex;align-items:center;gap:8px;}
    ._mcls{background:none!important;border:none!important;color:#fff!important;font-size:24px;cursor:pointer;padding:0!important;box-shadow:none!important;line-height:1;transform:none!important;width:auto!important;}
    ._mbdy{padding:22px;}
    ._mft{padding:14px 22px;border-top:1px solid #eee;display:flex;gap:10px;justify-content:flex-end;background:#fafafa;border-radius:0 0 16px 16px;flex-wrap:wrap;}
    ._row{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #f4f4f4;align-items:center;gap:8px;}
    ._row:last-child{border-bottom:none;}
    ._rl{color:#888;font-size:12.5px;flex-shrink:0;}
    ._rv{font-size:13px;font-weight:600;color:#334155;text-align:right;}
    ._fi{width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-family:Poppins,sans-serif;font-size:13px;outline:none;transition:border-color .2s;box-sizing:border-box;margin-bottom:14px;}
    ._fi:focus{border-color:#f7a01a;}
    ._fl{display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:5px;}
    ._mbtn{padding:9px 20px;border:none;border-radius:8px;cursor:pointer;font-family:Poppins,sans-serif;font-size:13px;font-weight:600;color:#fff;transition:all .2s;}
    ._mbtn:hover{filter:brightness(1.1);transform:translateY(-1px);}
    @media(max-width:520px){#_uniModal{padding:8px;}._mbdy{padding:16px;}._mft{padding:12px 16px;}}
    /* CROP MODAL */
    #_cropWrap{position:relative;overflow:hidden;background:#111;width:100%;height:300px;cursor:grab;user-select:none;touch-action:none;}
    #_cropWrap:active{cursor:grabbing;}
    #_cropImg{position:absolute;top:0;left:0;transform-origin:top left;transition:none;}
    #_cropBox{position:absolute;border:2.5px solid #f7a01a;box-shadow:0 0 0 9999px rgba(0,0,0,0.55);pointer-events:none;border-radius:2px;}
    #_zoomSlider{width:100%;accent-color:#f7a01a;cursor:pointer;}
    #_zoomLabel{font-size:11px;color:#888;text-align:center;display:block;margin:2px 0 8px;}
  `;
  document.head.appendChild(st);
}

function openModal(html, maxWidth){
  _ensureModalCSS();
  let old=document.getElementById("_uniModal"); if(old)old.remove();
  let overlay=document.createElement("div"); overlay.id="_uniModal";
  overlay.innerHTML=`<div class="_mbox" style="max-width:${maxWidth||"530px"};">${html}</div>`;
  overlay.addEventListener("click",e=>{if(e.target===overlay)closeModal();});
  document.body.appendChild(overlay); document.body.style.overflow="hidden";
}
function closeModal(){
  let m=document.getElementById("_uniModal");
  if(m){m.style.opacity="0";m.style.transition="opacity .2s";setTimeout(()=>{m.remove();document.body.style.overflow="";},200);}
}
/* ═══ CONFIRM MODAL ═══ */
// Usage: confirmModal("Delete this item?", () => { /* confirmed */ });
function confirmModal(message, onConfirm, confirmLabel, confirmColor) {
  let label = confirmLabel || "Delete";
  let color = confirmColor || "#e74c3c";
  let html = `
    <div class="_mhdr"><h3><i class="fa-solid fa-triangle-exclamation" style="color:${color};"></i> Confirm</h3><button class="_mcls" onclick="closeModal()">×</button></div>
    <div class="_mbdy" style="text-align:center;padding:20px 16px 10px;">
      <p style="font-size:15px;color:#333;margin:0 0 20px;">${message}</p>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button class="_mbtn" style="background:#999;min-width:90px;" onclick="closeModal()"><i class="fa-solid fa-xmark"></i> Cancel</button>
        <button class="_mbtn" style="background:${color};min-width:90px;" id="_confirmOkBtn"><i class="fa-solid fa-check"></i> ${label}</button>
      </div>
    </div>`;
  openModal(html, "360px");
  setTimeout(() => {
    let btn = document.getElementById("_confirmOkBtn");
    if (btn) btn.addEventListener("click", () => { closeModal(); onConfirm(); });
  }, 50);
}

/* ═══ PHOTO CROP SYSTEM ═══ */
// Opens a square-crop + resize modal. Calls onDone(croppedBase64) when user confirms.
function openCropModal(file, onDone) {
  _ensureModalCSS();
  let old=document.getElementById("_uniModal"); if(old)old.remove();
  let overlay=document.createElement("div"); overlay.id="_uniModal";
  overlay.innerHTML=`
    <div class="_mbox" style="max-width:420px;">
      <div class="_mhdr"><h3><i class="fa-solid fa-crop"></i> Crop Photo</h3></div>
      <div class="_mbdy" style="padding:14px;">
        <div id="_cropWrap">
          <img id="_cropImg" src="" draggable="false"/>
          <div id="_cropBox"></div>
        </div>
        <div style="margin:10px 0 2px;">
          <label id="_zoomLabel">Zoom: 100%</label>
          <input id="_zoomSlider" type="range" min="100" max="400" value="100" step="5"/>
        </div>
        <p style="font-size:11px;color:#999;margin:4px 0 0;text-align:center;">Drag to reposition · Use slider or pinch to zoom · Square crop</p>
      </div>
      <div class="_mft">
        <button class="_mbtn" style="background:#999;" onclick="closeModal()">Cancel</button>
        <button class="_mbtn" style="background:#f7a01a;" onclick="confirmCrop()"><i class="fa-solid fa-check"></i> Use Photo</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow="hidden";

  const reader=new FileReader();
  reader.onload=function(e){
    const img=document.getElementById("_cropImg");
    img.src=e.target.result;
    img.onload=function(){
      initCrop(img, e.target.result, onDone);
    };
  };
  reader.readAsDataURL(file);
}

function initCrop(imgEl, origSrc, onDone) {
  const wrap=document.getElementById("_cropWrap");
  const cropBox=document.getElementById("_cropBox");
  const zoomSlider=document.getElementById("_zoomSlider");
  const zoomLabel=document.getElementById("_zoomLabel");
  const wW=wrap.clientWidth, wH=wrap.clientHeight;
  const iW=imgEl.naturalWidth, iH=imgEl.naturalHeight;

  // Base scale: fit image into wrap
  const baseScale=Math.min(wW/iW, wH/iH);
  let zoom=1; // multiplier on top of baseScale
  let imgX=0, imgY=0;

  // Square crop box = 80% of min(wW,wH), centered
  const side=Math.min(wW,wH)*0.82;
  const boxL=(wW-side)/2, boxT=(wH-side)/2;
  cropBox.style.left=boxL+"px"; cropBox.style.top=boxT+"px";
  cropBox.style.width=side+"px"; cropBox.style.height=side+"px";

  function clampImg() {
    const dW=iW*baseScale*zoom, dH=iH*baseScale*zoom;
    // clamp so crop box is always fully inside image
    const minX=boxL+side-dW, maxX=boxL;
    const minY=boxT+side-dH, maxY=boxT;
    imgX=Math.max(minX,Math.min(maxX,imgX));
    imgY=Math.max(minY,Math.min(maxY,imgY));
  }

  function applyTransform() {
    const dW=iW*baseScale*zoom, dH=iH*baseScale*zoom;
    imgEl.style.width=dW+"px"; imgEl.style.height=dH+"px";
    imgEl.style.left=imgX+"px"; imgEl.style.top=imgY+"px";
  }

  // Init position: center image, crop box inside it
  zoom=1;
  imgX=(wW-iW*baseScale)/2; imgY=(wH-iH*baseScale)/2;
  clampImg(); applyTransform();

  // Zoom slider
  if(zoomSlider){
    zoomSlider.addEventListener("input",function(){
      zoom=Number(this.value)/100;
      zoomLabel.textContent="Zoom: "+this.value+"%";
      clampImg(); applyTransform();
    });
  }

  // Mouse drag
  let dragging=false, lastX, lastY;
  wrap.addEventListener("mousedown",e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;e.preventDefault();});
  window.addEventListener("mousemove",e=>{
    if(!dragging)return;
    imgX+=e.clientX-lastX; imgY+=e.clientY-lastY;
    lastX=e.clientX; lastY=e.clientY;
    clampImg(); applyTransform();
  });
  window.addEventListener("mouseup",()=>{dragging=false;});

  // Touch drag + pinch zoom
  let lastDist=null, lastTX, lastTY;
  wrap.addEventListener("touchstart",e=>{
    if(e.touches.length===1){lastTX=e.touches[0].clientX;lastTY=e.touches[0].clientY;}
    if(e.touches.length===2){lastDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);}
  },{passive:true});
  wrap.addEventListener("touchmove",e=>{
    if(e.touches.length===1){
      imgX+=e.touches[0].clientX-lastTX; imgY+=e.touches[0].clientY-lastTY;
      lastTX=e.touches[0].clientX; lastTY=e.touches[0].clientY;
      clampImg(); applyTransform();
    } else if(e.touches.length===2&&lastDist){
      const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
      const ratio=d/lastDist;
      zoom=Math.max(1,Math.min(4,zoom*ratio));
      if(zoomSlider){zoomSlider.value=Math.round(zoom*100);zoomLabel.textContent="Zoom: "+Math.round(zoom*100)+"%";}
      lastDist=d;
      clampImg(); applyTransform();
    }
  },{passive:true});
  wrap.addEventListener("touchend",e=>{if(e.touches.length<2)lastDist=null;},{passive:true});

  window._doCrop=function(){
    // Convert screen crop box coords back to image natural coords
    const dW=iW*baseScale*zoom;
    const naturalScale=iW/dW; // px per natural pixel
    const cropNatX=(boxL-imgX)*naturalScale;
    const cropNatY=(boxT-imgY)*naturalScale;
    const cropNatS=side*naturalScale;
    const out=400;
    const canvas=document.createElement("canvas"); canvas.width=out; canvas.height=out;
    const ctx=canvas.getContext("2d");
    const temp=new Image(); temp.src=origSrc;
    temp.onload=function(){
      ctx.drawImage(temp,cropNatX,cropNatY,cropNatS,cropNatS,0,0,out,out);
      const b64=canvas.toDataURL("image/jpeg",0.80);
      closeModal(); onDone(b64);
    };
  };
}

function confirmCrop(){
  if(window._doCrop) window._doCrop();
}

/* ═══ RECEIPT DATA REGISTRY (FIX: avoids inline-JSON-in-onclick SyntaxError) ═══ */
window._rcptStore = {};
let _rcptIdx = 0;

function _storeReceipt(c, userName, typeName, occasionName) {
  const id = "r" + (++_rcptIdx);
  window._rcptStore[id] = {c, userName, typeName, occasionName};
  return id;
}

/* ═══ RECEIPT POPUP — PDF for user; all share options for admin ═══ */
function showReceipt(c, userName, typeName, occasionName, isAdmin){
  const rid = _storeReceipt(c, userName, typeName, occasionName);
  const displayRID = (c.ReceiptID||"—").replace(/^TRX-/,"MNR-");
  const shareButtons = isAdmin ? `
      <button class="_mbtn" style="background:#27ae60;" onclick="exportReceiptPDF('${rid}')"><i class="fa-solid fa-file-pdf"></i> Download PDF</button>
      <button class="_mbtn" style="background:#25d366;" onclick="sendReceiptWhatsApp('${rid}')"><i class="fa-brands fa-whatsapp"></i> WhatsApp Text</button>
      <button class="_mbtn" style="background:#128c7e;" onclick="exportReceiptPDFForWhatsApp('${rid}')"><i class="fa-brands fa-whatsapp"></i> WhatsApp PDF</button>
      <button class="_mbtn" style="background:#2980b9;" onclick="sendReceiptEmail('${rid}')"><i class="fa-solid fa-envelope"></i> Email</button>`
    : `<button class="_mbtn" style="background:#27ae60;" onclick="exportReceiptPDF('${rid}')"><i class="fa-solid fa-file-pdf"></i> Download PDF</button>`;
  let html=`
    <div class="_mhdr"><h3><i class="fa-solid fa-receipt"></i> Contribution Receipt</h3><button class="_mcls" onclick="closeModal()">×</button></div>
    <div class="_mbdy">
      <div style="text-align:center;padding:10px 0 14px;">
        <div style="font-size:2.2rem;margin-bottom:6px;">🕉️</div>
        <div style="font-size:1.25rem;font-weight:700;color:#946c44;">Shree Hanuman Mandir</div>
        <div style="font-size:0.8rem;color:#999;margin-bottom:10px;">Paliya, Sultanpur</div>
        <span style="background:#eafaf1;color:#1D9E75;border-radius:20px;padding:4px 14px;font-size:11px;font-weight:700;">✓ OFFICIAL RECEIPT</span>
      </div>
      <div style="border:1.5px dashed #e0e0e0;border-radius:12px;padding:4px 16px;margin-bottom:14px;">
        <div class="_row"><span class="_rl">Tracking ID</span><span class="_rv" style="color:#f7a01a;font-family:monospace;">${escapeHtml(displayRID)}</span></div>
        <div class="_row"><span class="_rl">Donor Name</span><span class="_rv">${escapeHtml(userName)}</span></div>
        <div class="_row"><span class="_rl">Amount</span><span class="_rv" style="font-size:1.2rem;color:#27ae60;">₹ ${fmt(c.Amount)}</span></div>
        <div class="_row"><span class="_rl">For Month</span><span class="_rv">${escapeHtml(c.ForMonth||"—")}</span></div>
        <div class="_row"><span class="_rl">Year</span><span class="_rv">${escapeHtml(String(c.Year||"—"))}</span></div>
        <div class="_row"><span class="_rl">Type</span><span class="_rv">${escapeHtml(typeName||"Contribution")}</span></div>
        <div class="_row"><span class="_rl">Occasion</span><span class="_rv">${escapeHtml(occasionName||"—")}</span></div>
        <div class="_row"><span class="_rl">Note</span><span class="_rv">${escapeHtml(c.Note||"—")}</span></div>
        <div class="_row"><span class="_rl">Date Recorded</span><span class="_rv">${escapeHtml(c.PaymentDate||"—")}</span></div>
      </div>
      <div style="text-align:center;font-size:12px;color:#946c44;font-weight:600;padding:6px 0;border-top:1px dashed #e0e0e0;margin-top:4px;">~ Thank you for your generous contribution ~</div>
    </div>
    <div class="_mft" style="flex-wrap:wrap;gap:8px;">
      <button class="_mbtn" style="background:#999;" onclick="closeModal()"><i class="fa-solid fa-xmark"></i> Close</button>
      ${shareButtons}
    </div>`;
  openModal(html,"520px");
}

function sendReceiptWhatsApp(rid){
  const stored = window._rcptStore[rid];
  if(!stored){toast("Receipt data not found.","error");return;}
  const {c,userName,typeName,occasionName} = stored;
  const displayRID = (c.ReceiptID||"—").replace(/^TRX-/,"MNR-");
  const genDate = new Date().toLocaleDateString("en-IN");
  const msg =
    `🕉️ *SHREE HANUMAN MANDIR*\n` +
    `📍 Paliya, Sultanpur\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ *CONTRIBUTION RECEIPT*\n\n` +
    `🔖 Tracking ID: *${displayRID}*\n` +
    `👤 Donor: *${userName}*\n` +
    `💰 Amount: *₹ ${Number(c.Amount||0).toLocaleString("en-IN")}*\n` +
    `📅 Month: ${c.ForMonth||"—"} ${c.Year||""}\n` +
    `🏷️ Type: ${typeName||"Contribution"}\n` +
    (occasionName && occasionName!=="—" ? `🎉 Occasion: ${occasionName}\n` : "") +
    (c.Note ? `📝 Note: ${c.Note}\n` : "") +
    `📆 Date: ${c.PaymentDate||"—"}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `_🙏 Thank you for your generous contribution_\n` +
    `_System Generated — ${genDate}_`;
  window.open("https://wa.me/?text="+encodeURIComponent(msg),"_blank");
}

function exportReceiptPDFForWhatsApp(rid){
  // FIX #8: Download PDF AND open WhatsApp simultaneously
  const stored = window._rcptStore[rid];
  if(!stored){toast("Receipt data not found.","error");return;}
  const {c,userName,typeName,occasionName} = stored;
  const displayRID = (c.ReceiptID||"—").replace(/^TRX-/,"MNR-");
  const genDate = new Date().toLocaleDateString("en-IN");
  const msg =
    `🕉️ *SHREE HANUMAN MANDIR*\n` +
    `📍 Paliya, Sultanpur\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ *CONTRIBUTION RECEIPT*\n\n` +
    `🔖 Tracking ID: *${displayRID}*\n` +
    `👤 Donor: *${userName}*\n` +
    `💰 Amount: *₹ ${Number(c.Amount||0).toLocaleString("en-IN")}*\n` +
    `📅 Month: ${c.ForMonth||"—"} ${c.Year||""}\n` +
    `🏷️ Type: ${typeName||"Contribution"}\n` +
    (occasionName && occasionName!=="—" ? `🎉 Occasion: ${occasionName}\n` : "") +
    (c.Note ? `📝 Note: ${c.Note}\n` : "") +
    `📆 Date: ${c.PaymentDate||"—"}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `_🙏 Thank you for your generous contribution_\n` +
    `_PDF Receipt also downloaded — please attach it_\n` +
    `_System Generated — ${genDate}_`;
  // Download PDF first
  exportReceiptPDF(rid);
  // Then immediately open WhatsApp with full receipt text
  setTimeout(()=>{
    toast("📥 PDF downloaded — attach it in WhatsApp along with this message","");
    window.open("https://wa.me/?text="+encodeURIComponent(msg),"_blank");
  }, 600);
}

function sendReceiptEmail(rid){
  const stored = window._rcptStore[rid];
  if(!stored){toast("Receipt data not found.","error");return;}
  const {c,userName,typeName,occasionName} = stored;
  const displayRID = (c.ReceiptID||"—").replace(/^TRX-/,"MNR-");
  const subject = encodeURIComponent(`Contribution Receipt — ${displayRID} — Shree Hanuman Mandir`);
  const body = encodeURIComponent(
    `Dear ${userName},\n\n` +
    `Thank you for your contribution to Shree Hanuman Mandir, Paliya, Sultanpur.\n\n` +
    `CONTRIBUTION RECEIPT\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Tracking ID : ${displayRID}\n` +
    `Donor Name  : ${userName}\n` +
    `Amount      : Rs. ${Number(c.Amount||0).toLocaleString("en-IN")}\n` +
    `For Month   : ${c.ForMonth||"—"} ${c.Year||""}\n` +
    `Type        : ${typeName||"Contribution"}\n` +
    (occasionName && occasionName!=="—" ? `Occasion    : ${occasionName}\n` : "") +
    (c.Note ? `Note        : ${c.Note}\n` : "") +
    `Date Recorded: ${c.PaymentDate||"—"}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `This is a system-generated receipt.\n\n` +
    `Jai Shree Ram 🙏\nShree Hanuman Mandir`
  );
  window.open(`mailto:?subject=${subject}&body=${body}`,"_blank");
}

function exportReceiptPDF(rid){
  const stored = window._rcptStore[rid];
  if(!stored){toast("Receipt data not found.","error");return;}
  const {c,userName,typeName,occasionName} = stored;
  if(typeof window.jspdf==="undefined"){toast("PDF library not loaded.","error");return;}
  const displayRID = (c.ReceiptID||"—").replace(/^TRX-/,"MNR-");
  const {jsPDF}=window.jspdf;
  let doc=new jsPDF({format:"a5",unit:"mm"});
  let w=doc.internal.pageSize.getWidth();
  let ph=doc.internal.pageSize.getHeight();
  doc.setFillColor(51,65,85); doc.rect(0,0,w,32,"F");
  doc.setTextColor(247,160,26); doc.setFontSize(14); doc.setFont(undefined,"bold");
  doc.text("SHREE HANUMAN MANDIR",w/2,12,{align:"center"});
  doc.setTextColor(255,255,255); doc.setFontSize(8.5); doc.setFont(undefined,"normal");
  doc.text("PALIYA, SULTANPUR",w/2,19,{align:"center"});
  doc.text("OFFICIAL CONTRIBUTION RECEIPT",w/2,25,{align:"center"});
  doc.autoTable({
    body:[
      ["Tracking ID", displayRID],["Donor Name",userName||"—"],
      ["Amount (Rs.)", "Rs. "+Number(c.Amount||0).toLocaleString("en-IN")],
      ["For Month",c.ForMonth||"—"],["Year",String(c.Year||"—")],
      ["Type",typeName||"—"],["Occasion",occasionName||"—"],
      ["Note",c.Note||"—"],["Date Recorded",c.PaymentDate||"—"]
    ],
    startY:38, theme:"grid",
    columnStyles:{0:{fontStyle:"bold",cellWidth:42,fillColor:[250,238,218],textColor:[99,56,6]},1:{cellWidth:w-60}},
    styles:{fontSize:9,cellPadding:3}
  });
  let fy=doc.lastAutoTable.finalY+6;
  doc.setFontSize(8); doc.setTextColor(120,80,30); doc.setFont(undefined,"bold");
  doc.text("~ Thank you for your generous contribution ~",w/2,fy,{align:"center"});
  doc.setFont(undefined,"normal"); doc.setFontSize(7); doc.setTextColor(160,160,160);
  doc.text("SHREE HANUMAN MANDIR  |  Paliya, Sultanpur  |  System Generated",w/2,ph-5,{align:"center"});
  doc.save("Receipt_"+displayRID+".pdf");
}

/* ═══ VIEW-ONLY DETAIL POPUP ═══ */
function showDetailPopup(title, rows, editFn){
  let rowsHtml = rows.map(r=>`<div class="_row"><span class="_rl">${r[0]}</span><span class="_rv">${r[1]}</span></div>`).join("");
  let editBtn = editFn ? `<button class="_mbtn" style="background:#f7a01a;" onclick="${editFn}"><i class="fa-solid fa-pen"></i> Edit</button>` : "";
  let html=`
    <div class="_mhdr"><h3><i class="fa-solid fa-eye"></i> ${title}</h3><button class="_mcls" onclick="closeModal()">×</button></div>
    <div class="_mbdy"><div style="border:1px solid #f0f0f0;border-radius:10px;padding:4px 16px;">${rowsHtml}</div></div>
    <div class="_mft">
      <button class="_mbtn" style="background:#999;" onclick="closeModal()"><i class="fa-solid fa-xmark"></i> Close</button>
      ${editBtn}
    </div>`;
  openModal(html,"500px");
}