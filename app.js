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
  // Best-effort fire-and-forget. Wrapped in try/catch so a non-redeployed
  // Apps Script returning an HTML error page never causes a SyntaxError crash.
  try {
    const cb = "cb_sst_" + Date.now();
    const script = document.createElement("script");
    // Swallow any error silently — this call is optional enhancement only
    window[cb] = function(){ try{ delete window[cb]; script.remove(); }catch(e){} };
    script.onerror = function(){ try{ delete window[cb]; script.remove(); }catch(e){} };
    // Wrap JSONP execution in a safe global so HTML-error-page responses don't crash
    script.src = API_URL + "?action=setSessionToken&userId=" +
      encodeURIComponent(userId) + "&token=" + encodeURIComponent(token) +
      "&callback=" + cb;
    document.body.appendChild(script);
    // Safety timeout — clean up if callback never fires (e.g. HTML response)
    setTimeout(function(){
      try{ if(window[cb]){ delete window[cb]; } }catch(e){}
    }, 12000);
  } catch(e){ /* silent — token write is best-effort */ }
}

/* ── Cross-device poll: role-based interval (Admin 60s, User 10min) ── */
/* WHY: 42 active users × 60s = 60,480 reads/day → over free quota (20,000).   */
/* Role-split: Admins polled every 60s (security critical), Users every 10min.  */
/* Result: 2×60s + 40×600s = 2,880 + 5,760 = 8,640 reads/day → 43% of quota.  */
(function(){
  const PROTECTED = ["admin.html","user.html","dashboard.html"];
  const isProtected = PROTECTED.some(p => window.location.pathname.includes(p.replace(".html","")));
  if(!isProtected) return;

  // Read role from session — Admin gets strict 60s, User gets relaxed 10min
  // Role is read once at page load; changes only on re-login
  const _sessionRaw = JSON.parse(localStorage.getItem("session") || "null");
  const _isAdmin    = _sessionRaw && _sessionRaw.role === "Admin";
  const POLL_MS     = _isAdmin ? 60000 : 600000; // 60s for Admin, 10min for User

  function _poll(){
    try {
      const s = JSON.parse(localStorage.getItem("session") || "null");
      // Skip poll entirely if session has no token (old session before redeployment,
      // or Apps Script not yet updated — never log out in this case)
      if(!s || !s.userId) return;
      if(!s.sessionToken) return; // token not set yet — skip silently
      if(Date.now() > s.expiry) return; // expiry timer handles this separately

      const cb = "cb_cs_" + Date.now();
      const script = document.createElement("script");
      let done = false;

      window[cb] = function(res){
        if(done) return; done = true;
        try{ delete window[cb]; script.remove(); }catch(e){}
        // Only force logout on explicit { valid: false } — not on errors or missing fields
        if(res && res.valid === false){
          _forceLogout("⚠️ Your account was logged in from another device. This session has ended.");
        }
        // res.valid === true → do nothing, session is valid
        // res is undefined/error → do nothing, skip this poll safely
      };

      const timer = setTimeout(function(){
        if(done) return; done = true;
        try{ delete window[cb]; script.remove(); }catch(e){}
        // Timeout — network issue, skip this poll, never log out
      }, 15000);

      script.onerror = function(){
        if(done) return; done = true;
        clearTimeout(timer);
        try{ delete window[cb]; script.remove(); }catch(e){}
        // Script load error (e.g. HTML error page) — skip poll, never crash
      };

      script.src = API_URL + "?action=checkSession&userId=" +
        encodeURIComponent(s.userId) + "&token=" +
        encodeURIComponent(s.sessionToken) + "&callback=" + cb;
      document.body.appendChild(script);
    } catch(e){ /* silent — poll is best-effort */ }
  }

  // Start polling after 15s (let page fully load + setSessionToken settle)
  // Interval stored in window._pollInterval so visibilitychange can pause/resume it
  setTimeout(function(){
    _poll();
    window._pollInterval = setInterval(_poll, POLL_MS);

    // ── Pause poll when tab hidden, resume when user returns (~40% extra quota saving)
    // Zero impact on session logic — _poll() fires immediately on tab return
    document.addEventListener("visibilitychange", function(){
      if(document.hidden){
        clearInterval(window._pollInterval);
      } else {
        _poll(); // immediate check when user returns to tab
        window._pollInterval = setInterval(_poll, POLL_MS);
      }
    });
  }, 15000);
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

/* ── Auto-clear token on browser/tab close ── */
/* Eliminates ghost sessions instantly. sendBeacon works even during page unload.*/
/* Only fires on protected pages. No impact on any other logic.                  */
(function(){
  const PROTECTED = ["admin.html","user.html","dashboard.html"];
  const isProtected = PROTECTED.some(p => window.location.pathname.includes(p.replace(".html","")));
  if(!isProtected) return;

  window.addEventListener("beforeunload", function(){
    try {
      const s = JSON.parse(localStorage.getItem("session") || "null");
      if(!s || !s.userId) return;
      // sendBeacon: async fire-and-forget, browser sends even as page tears down
      const params = new URLSearchParams({
        action:   "clearSessionToken",
        userId:   String(s.userId),
        callback: "cb_beacon"
      });
      navigator.sendBeacon(API_URL + "?" + params.toString());
    } catch(e){ /* silent */ }
  });
})();



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

/* ═══ RECEIPT POPUP — Upgraded: PaymentMode, print, better layout ═══ */
function showReceipt(c, userName, typeName, occasionName, isAdmin){
  const rid        = _storeReceipt(c, userName, typeName, occasionName);
  const displayRID = (c.ReceiptID||"—").replace(/^TRX-/,"MNR-");
  const payMode    = c.PaymentMode || "—";
  const shareButtons = isAdmin ? `
      <button class="_mbtn" style="background:#27ae60;" onclick="exportReceiptPDF('${rid}')"><i class="fa-solid fa-file-pdf"></i> PDF</button>
      <button class="_mbtn" style="background:#25d366;" onclick="sendReceiptWhatsApp('${rid}')"><i class="fa-brands fa-whatsapp"></i> WhatsApp</button>
      <button class="_mbtn" style="background:#128c7e;" onclick="exportReceiptPDFForWhatsApp('${rid}')"><i class="fa-brands fa-whatsapp"></i> WA+PDF</button>
      <button class="_mbtn" style="background:#2980b9;" onclick="sendReceiptEmailDirect('${rid}')"><i class="fa-solid fa-envelope"></i> Email</button>
      <button class="_mbtn" style="background:#7c3aed;" onclick="printReceipt('${rid}')"><i class="fa-solid fa-print"></i> Print</button>`
    : `<button class="_mbtn" style="background:#27ae60;" onclick="exportReceiptPDF('${rid}')"><i class="fa-solid fa-file-pdf"></i> Download PDF</button>`;

  let html=`
    <div class="_mhdr"><h3><i class="fa-solid fa-receipt"></i> Contribution Receipt</h3><button class="_mcls" onclick="closeModal()">×</button></div>
    <div class="_mbdy" style="padding:0;">

      <!-- Header Band -->
      <div style="background:#334155;padding:20px 24px;text-align:center;">
        <div style="font-size:2rem;margin-bottom:6px;">🕉️</div>
        <div style="font-size:1.1rem;font-weight:700;color:#f7a01a;letter-spacing:.5px;">${escapeHtml(APP.name.toUpperCase())}</div>
        <div style="font-size:0.75rem;color:#94a3b8;margin-top:2px;">${escapeHtml(APP.location)}</div>
        <div style="margin-top:10px;">
          <span style="background:#22c55e;color:#fff;border-radius:20px;padding:3px 14px;font-size:10.5px;font-weight:700;letter-spacing:.4px;">✓ OFFICIAL RECEIPT</span>
        </div>
      </div>

      <!-- Receipt ID Band -->
      <div style="background:#fef3c7;padding:10px 24px;text-align:center;border-bottom:1px solid #fde68a;">
        <span style="color:#92400e;font-size:12px;font-weight:600;">Receipt No: </span>
        <span style="color:#b45309;font-size:14px;font-weight:700;font-family:monospace;letter-spacing:1px;">${escapeHtml(displayRID)}</span>
      </div>

      <!-- Amount Hero -->
      <div style="padding:18px 24px 12px;text-align:center;border-bottom:1px dashed #e2e8f0;">
        <div style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Amount Received</div>
        <div style="color:#16a34a;font-size:2rem;font-weight:700;margin:4px 0;">₹ ${fmt(c.Amount)}</div>
        <div style="display:inline-flex;align-items:center;gap:6px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:4px 12px;font-size:12px;color:#166534;font-weight:600;">
          <i class="fa-solid fa-${payMode==='Cash'?'money-bill-wave':payMode==='Cheque'?'file-invoice':'mobile-screen-button'}" style="color:#16a34a;"></i>
          ${escapeHtml(payMode)}
        </div>
      </div>

      <!-- Details -->
      <div style="padding:6px 24px 10px;">
        <div class="_row"><span class="_rl">Donor Name</span><span class="_rv">${escapeHtml(userName)}</span></div>
        <div class="_row"><span class="_rl">For Month / Year</span><span class="_rv">${escapeHtml(c.ForMonth||"—")} ${escapeHtml(String(c.Year||""))}</span></div>
        <div class="_row"><span class="_rl">Contribution Type</span><span class="_rv">${escapeHtml(typeName||"Contribution")}</span></div>
        ${occasionName && occasionName!=="—" ? `<div class="_row"><span class="_rl">Occasion</span><span class="_rv">${escapeHtml(occasionName)}</span></div>` : ""}
        ${c.Note ? `<div class="_row"><span class="_rl">Note</span><span class="_rv">${escapeHtml(c.Note)}</span></div>` : ""}
        <div class="_row"><span class="_rl">Date Recorded</span><span class="_rv">${escapeHtml(c.PaymentDate||"—")}</span></div>
      </div>

      <!-- Signature -->
      <div style="display:flex;justify-content:space-between;padding:12px 24px;border-top:1px solid #f1f5f9;background:#f8fafc;font-size:11px;">
        <div>
          <div style="font-weight:700;color:#334155;">${escapeHtml(APP.signatory)}</div>
          <div style="color:#64748b;">${escapeHtml(APP.designation)}</div>
        </div>
        <div style="text-align:right;color:#94a3b8;font-size:10px;">
          <div>System-generated receipt</div>
          <div>No signature required</div>
        </div>
      </div>

      <!-- Thank You -->
      <div style="background:#fef9ee;padding:12px 24px;text-align:center;border-top:1px solid #fde68a;">
        <div style="color:#92400e;font-size:12.5px;font-weight:600;">🙏 ${escapeHtml(APP.thankYouMsg)}</div>
        <div style="color:#a16207;font-size:11px;margin-top:2px;">${escapeHtml(APP.tagline)}</div>
      </div>
    </div>

    <div class="_mft" style="flex-wrap:wrap;gap:8px;">
      <button class="_mbtn" style="background:#999;" onclick="closeModal()"><i class="fa-solid fa-xmark"></i> Close</button>
      ${shareButtons}
    </div>`;
  openModal(html,"540px");
}

function sendReceiptWhatsApp(rid){
  const stored = window._rcptStore[rid];
  if(!stored){toast("Receipt data not found.","error");return;}
  const {c,userName,typeName,occasionName} = stored;
  const displayRID = (c.ReceiptID||"—").replace(/^TRX-/,"MNR-");
  const genDate    = new Date().toLocaleDateString("en-IN");
  const payMode    = c.PaymentMode || "—";
  const msg =
    `${APP.symbol} *${APP.name.toUpperCase()}*\n` +
    `📍 ${APP.location}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ *CONTRIBUTION RECEIPT*\n\n` +
    `🔖 Receipt No: *${displayRID}*\n` +
    `👤 Donor: *${userName}*\n` +
    `💰 Amount: *₹ ${Number(c.Amount||0).toLocaleString("en-IN")}*\n` +
    `💳 Payment: ${payMode}\n` +
    `📅 Month: ${c.ForMonth||"—"} ${c.Year||""}\n` +
    `🏷️ Type: ${typeName||"Contribution"}\n` +
    (occasionName && occasionName!=="—" ? `🎉 Occasion: ${occasionName}\n` : "") +
    (c.Note ? `📝 Note: ${c.Note}\n` : "") +
    `📆 Date: ${c.PaymentDate||"—"}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `_🙏 ${APP.thankYouMsg}_\n` +
    `_${APP.tagline} | System Generated — ${genDate}_`;
  window.open("https://wa.me/?text="+encodeURIComponent(msg),"_blank");
}

function exportReceiptPDFForWhatsApp(rid){
  const stored = window._rcptStore[rid];
  if(!stored){toast("Receipt data not found.","error");return;}
  const {c,userName,typeName,occasionName} = stored;
  const displayRID = (c.ReceiptID||"—").replace(/^TRX-/,"MNR-");
  const genDate    = new Date().toLocaleDateString("en-IN");
  const payMode    = c.PaymentMode || "—";
  const msg =
    `${APP.symbol} *${APP.name.toUpperCase()}*\n` +
    `📍 ${APP.location}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ *CONTRIBUTION RECEIPT*\n\n` +
    `🔖 Receipt No: *${displayRID}*\n` +
    `👤 Donor: *${userName}*\n` +
    `💰 Amount: *₹ ${Number(c.Amount||0).toLocaleString("en-IN")}*\n` +
    `💳 Payment: ${payMode}\n` +
    `📅 Month: ${c.ForMonth||"—"} ${c.Year||""}\n` +
    `🏷️ Type: ${typeName||"Contribution"}\n` +
    (occasionName && occasionName!=="—" ? `🎉 Occasion: ${occasionName}\n` : "") +
    (c.Note ? `📝 Note: ${c.Note}\n` : "") +
    `📆 Date: ${c.PaymentDate||"—"}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `_🙏 ${APP.thankYouMsg}_\n` +
    `_PDF Receipt also downloaded — please attach it_\n` +
    `_${APP.tagline} | System Generated — ${genDate}_`;
  exportReceiptPDF(rid);
  setTimeout(()=>{
    toast("📥 PDF downloaded — attach it in WhatsApp along with this message","");
    window.open("https://wa.me/?text="+encodeURIComponent(msg),"_blank");
  }, 600);
}

/* sendReceiptEmailDirect — calls server-side MailApp (real delivery, quota-guarded) */
async function sendReceiptEmailDirect(rid){
  const stored = window._rcptStore[rid];
  if(!stored){toast("Receipt data not found.","error");return;}
  const {c,userName,typeName,occasionName} = stored;
  const displayRID = (c.ReceiptID||"—").replace(/^TRX-/,"MNR-");
  toast("📧 Sending receipt email...","");
  try {
    const res = await postData({
      action:        "sendContribReceiptEmail",
      receiptId:     c.ReceiptID||displayRID,
      userName:      userName,
      amount:        c.Amount||0,
      forMonth:      c.ForMonth||"",
      year:          c.Year||"",
      typeName:      typeName||"",
      occasionName:  occasionName||"",
      note:          c.Note||"",
      paymentDate:   c.PaymentDate||"",
      paymentMode:   c.PaymentMode||"",
      userId:        c.UserId||""
    });
    if(res && res.status==="sent")     toast("✅ Receipt email sent successfully!","");
    else if(res && res.status==="no_email") toast("⚠️ No email address on record for this donor.","warn");
    else if(res && res.status==="quota")    toast("⚠️ Daily email limit reached. Try again tomorrow.","warn");
    else toast("❌ Email send failed.","error");
  } catch(err){ toast("❌ "+err.message,"error"); }
}

/* Legacy alias kept for backward compatibility */
function sendReceiptEmail(rid){
  sendReceiptEmailDirect(rid);
}

/* printReceipt — opens print dialog for the receipt modal */
function printReceipt(rid){
  const stored = window._rcptStore[rid];
  if(!stored){toast("Receipt data not found.","error");return;}
  const {c,userName,typeName,occasionName} = stored;
  const displayRID = (c.ReceiptID||"—").replace(/^TRX-/,"MNR-");
  const payMode    = c.PaymentMode||"—";
  const win = window.open("","_blank","width=600,height=700");
  win.document.write(`<!DOCTYPE html><html><head><title>Receipt ${displayRID}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#333;}
    .header{background:#334155;color:#fff;padding:20px;text-align:center;border-radius:8px 8px 0 0;}
    .header .om{font-size:2rem;}
    .header h1{margin:4px 0;font-size:1.2rem;color:#f7a01a;}
    .header p{margin:2px 0;font-size:0.8rem;color:#94a3b8;}
    .receipt-badge{margin-top:10px;}
    .receipt-badge span{background:#22c55e;color:#fff;padding:3px 14px;border-radius:20px;font-size:11px;font-weight:700;}
    .rid-band{background:#fef3c7;padding:10px;text-align:center;border-bottom:1px solid #fde68a;}
    .amount-section{padding:16px;text-align:center;border-bottom:1px dashed #e2e8f0;}
    .amount{font-size:2rem;color:#16a34a;font-weight:700;}
    .pay-mode{font-size:12px;color:#555;margin-top:4px;}
    table{width:100%;border-collapse:collapse;margin:10px 0;}
    td{padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;}
    td:first-child{color:#64748b;width:45%;}
    td:last-child{font-weight:600;text-align:right;}
    .sig{display:flex;justify-content:space-between;padding:12px;border-top:1px solid #e2e8f0;font-size:11px;}
    .footer{background:#fef9ee;padding:12px;text-align:center;border-top:1px solid #fde68a;font-size:12px;color:#92400e;}
    @media print{body{padding:0;}}
  </style></head><body>
  <div class="header">
    <div class="om">🕉️</div>
    <h1>${escapeHtml(APP.name.toUpperCase())}</h1>
    <p>${escapeHtml(APP.location)}</p>
    <div class="receipt-badge"><span>✓ OFFICIAL RECEIPT</span></div>
  </div>
  <div class="rid-band"><strong>Receipt No: </strong><code style="font-size:14px;">${escapeHtml(displayRID)}</code></div>
  <div class="amount-section">
    <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Amount Received</div>
    <div class="amount">₹ ${fmt(c.Amount)}</div>
    <div class="pay-mode">Payment Mode: <strong>${escapeHtml(payMode)}</strong></div>
  </div>
  <table>
    <tr><td>Donor Name</td><td>${escapeHtml(userName)}</td></tr>
    <tr><td>For Month / Year</td><td>${escapeHtml(c.ForMonth||"—")} ${escapeHtml(String(c.Year||""))}</td></tr>
    <tr><td>Contribution Type</td><td>${escapeHtml(typeName||"—")}</td></tr>
    ${occasionName&&occasionName!=="—"?`<tr><td>Occasion</td><td>${escapeHtml(occasionName)}</td></tr>`:""}
    ${c.Note?`<tr><td>Note</td><td>${escapeHtml(c.Note)}</td></tr>`:""}
    <tr><td>Date Recorded</td><td>${escapeHtml(c.PaymentDate||"—")}</td></tr>
  </table>
  <div class="sig">
    <div><strong>${escapeHtml(APP.signatory)}</strong><br/>${escapeHtml(APP.designation)}<br/>${escapeHtml(APP.name)}</div>
    <div style="text-align:right;color:#94a3b8;">System-generated receipt<br/>No signature required</div>
  </div>
  <div class="footer">🙏 ${escapeHtml(APP.thankYouMsg)} | ${escapeHtml(APP.tagline)}</div>
  <script>window.print();<\/script></body></html>`);
  win.document.close();
}

function exportReceiptPDF(rid){
  const stored = window._rcptStore[rid];
  if(!stored){toast("Receipt data not found.","error");return;}
  const {c,userName,typeName,occasionName} = stored;
  if(typeof window.jspdf==="undefined"){toast("PDF library not loaded.","error");return;}
  const displayRID = (c.ReceiptID||"—").replace(/^TRX-/,"MNR-");
  const payMode    = c.PaymentMode || "—";
  const {jsPDF}    = window.jspdf;
  let doc = new jsPDF({format:"a5",unit:"mm"});
  const w  = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  // ── Header band
  doc.setFillColor(51,65,85); doc.rect(0,0,w,36,"F");
  doc.setTextColor(247,160,26); doc.setFontSize(15); doc.setFont(undefined,"bold");
  doc.text(APP.name.toUpperCase(), w/2, 11, {align:"center"});
  doc.setTextColor(255,255,255); doc.setFontSize(8.5); doc.setFont(undefined,"normal");
  doc.text(APP.location, w/2, 18, {align:"center"});
  // OFFICIAL RECEIPT badge
  doc.setFillColor(34,197,94); doc.roundedRect(w/2-28,21,56,8,2,2,"F");
  doc.setTextColor(255,255,255); doc.setFontSize(7); doc.setFont(undefined,"bold");
  doc.text("✓  OFFICIAL RECEIPT", w/2, 26.5, {align:"center"});

  // ── Receipt ID band
  doc.setFillColor(254,243,199); doc.rect(0,36,w,10,"F");
  doc.setTextColor(146,64,14); doc.setFontSize(8.5); doc.setFont(undefined,"normal");
  doc.text("Receipt No:", 10, 42.5);
  doc.setFont(undefined,"bold"); doc.setFontSize(9.5);
  doc.text(displayRID, 35, 42.5);

  // ── Amount hero
  doc.setTextColor(22,163,74); doc.setFontSize(20); doc.setFont(undefined,"bold");
  doc.text("Rs. "+Number(c.Amount||0).toLocaleString("en-IN"), w/2, 60, {align:"center"});
  doc.setTextColor(100,116,139); doc.setFontSize(7.5); doc.setFont(undefined,"normal");
  doc.text("Payment Mode: "+payMode, w/2, 66, {align:"center"});

  // ── Details table
  doc.autoTable({
    body:[
      ["Donor Name",    userName||"—"],
      ["For Month/Year",(c.ForMonth||"—")+" "+(c.Year||"")],
      ["Type",          typeName||"—"],
      ["Occasion",      (occasionName&&occasionName!=="—")?occasionName:"—"],
      ["Note",          c.Note||"—"],
      ["Date Recorded", c.PaymentDate||"—"],
      ["Receipt No",    displayRID],
    ],
    startY: 70, theme:"grid",
    columnStyles:{
      0:{fontStyle:"bold",cellWidth:40,fillColor:[250,238,218],textColor:[99,56,6]},
      1:{cellWidth:w-56}
    },
    styles:{fontSize:8.5,cellPadding:3}
  });

  // ── Signature section
  const fy = doc.lastAutoTable.finalY + 6;
  doc.setDrawColor(226,232,240); doc.line(8, fy, w-8, fy);
  doc.setFontSize(8); doc.setFont(undefined,"bold"); doc.setTextColor(51,65,85);
  doc.text(APP.signatory, 10, fy+7);
  doc.setFont(undefined,"normal"); doc.setFontSize(7); doc.setTextColor(100,116,139);
  doc.text(APP.designation, 10, fy+12);
  doc.text(APP.name, 10, fy+17);
  // Right side
  doc.setFontSize(7); doc.setTextColor(148,163,184);
  doc.text("System-generated receipt", w-10, fy+7, {align:"right"});
  doc.text("No signature required", w-10, fy+12, {align:"right"});

  // ── Thank you footer
  doc.setFillColor(254,249,238); doc.rect(0,ph-14,w,14,"F");
  doc.setFontSize(7.5); doc.setTextColor(146,64,14); doc.setFont(undefined,"bold");
  doc.text("🙏 "+APP.thankYouMsg, w/2, ph-7.5, {align:"center"});
  doc.setFont(undefined,"normal"); doc.setFontSize(6.5); doc.setTextColor(161,98,7);
  doc.text(APP.name+" | "+APP.location+" | "+APP.tagline, w/2, ph-3, {align:"center"});

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