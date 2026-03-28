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
  item.innerHTML = `<span style="font-size:16px;">${icon}</span><span style="flex:1;">${msg}</span><div class="tb"></div>`;
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

/* ═══ SESSION CHECK ═══ */
function checkSession() {
  let s=JSON.parse(localStorage.getItem("session"));
  if(!s||Date.now()>s.expiry){localStorage.clear();toast("Session expired. Please login again.","error");setTimeout(()=>location.replace("login.html"),1500);return false;}
  return true;
}

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
  years.add(new Date().getFullYear());
  let sorted=Array.from(years).filter(y=>!isNaN(y)).sort((a,b)=>b-a);
  yearSelect.innerHTML=sorted.map(y=>`<option value="${y}">${y}</option>`).join("");
  selectedYear=Number(yearSelect.value);
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
    #_cropWrap{position:relative;overflow:hidden;background:#111;width:100%;height:300px;cursor:crosshair;user-select:none;}
    #_cropImg{position:absolute;top:0;left:0;transform-origin:top left;}
    #_cropBox{position:absolute;border:2px solid #f7a01a;box-shadow:0 0 0 9999px rgba(0,0,0,0.5);pointer-events:none;}
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
        <p style="font-size:11px;color:#999;margin:8px 0 0;text-align:center;">Drag to reposition · Square crop applied automatically</p>
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
  const wW=wrap.clientWidth, wH=wrap.clientHeight;
  const iW=imgEl.naturalWidth, iH=imgEl.naturalHeight;
  const scale=Math.min(wW/iW, wH/iH);
  const dW=iW*scale, dH=iH*scale;
  const oX=(wW-dW)/2, oY=(wH-dH)/2;
  imgEl.style.width=dW+"px"; imgEl.style.height=dH+"px";
  imgEl.style.left=oX+"px"; imgEl.style.top=oY+"px";

  const side=Math.min(dW,dH)*0.85;
  let cx=(dW-side)/2+oX, cy=(dH-side)/2+oY;
  let dragging=false, dragSX, dragSY, startCX, startCY;

  function drawBox(){
    cropBox.style.left=cx+"px"; cropBox.style.top=cy+"px";
    cropBox.style.width=side+"px"; cropBox.style.height=side+"px";
  }
  drawBox();

  wrap.addEventListener("mousedown",e=>{dragging=true;dragSX=e.clientX;dragSY=e.clientY;startCX=cx;startCY=cy;});
  wrap.addEventListener("touchstart",e=>{dragging=true;dragSX=e.touches[0].clientX;dragSY=e.touches[0].clientY;startCX=cx;startCY=cy;},{passive:true});
  function onMove(ex,ey){
    if(!dragging)return;
    cx=Math.max(oX,Math.min(oX+dW-side,startCX+(ex-dragSX)));
    cy=Math.max(oY,Math.min(oY+dH-side,startCY+(ey-dragSY)));
    drawBox();
  }
  wrap.addEventListener("mousemove",e=>onMove(e.clientX,e.clientY));
  wrap.addEventListener("touchmove",e=>onMove(e.touches[0].clientX,e.touches[0].clientY),{passive:true});
  window.addEventListener("mouseup",()=>{dragging=false;});
  window.addEventListener("touchend",()=>{dragging=false;});

  window._doCrop=function(){
    const sx=(cx-oX)/scale, sy=(cy-oY)/scale, ss=side/scale;
    const out=400;
    const canvas=document.createElement("canvas"); canvas.width=out; canvas.height=out;
    const ctx=canvas.getContext("2d");
    const temp=new Image(); temp.src=origSrc;
    temp.onload=function(){
      ctx.drawImage(temp,sx,sy,ss,ss,0,0,out,out);
      const b64=canvas.toDataURL("image/jpeg",0.75);
      closeModal();
      onDone(b64);
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

/* ═══ RECEIPT POPUP ═══ */
function showReceipt(c, userName, typeName, occasionName){
  const rid = _storeReceipt(c, userName, typeName, occasionName);
  let html=`
    <div class="_mhdr"><h3><i class="fa-solid fa-receipt"></i> Contribution Receipt</h3><button class="_mcls" onclick="closeModal()">×</button></div>
    <div class="_mbdy">
      <div style="text-align:center;padding:10px 0 18px;">
        <div style="font-size:2.2rem;margin-bottom:6px;">🕉️</div>
        <div style="font-size:1.25rem;font-weight:700;color:#946c44;">Shree Hanuman Mandir</div>
        <div style="font-size:0.8rem;color:#999;margin-bottom:10px;">Paliya, Sultanpur</div>
        <span style="background:#eafaf1;color:#1D9E75;border-radius:20px;padding:4px 14px;font-size:11px;font-weight:700;">✓ OFFICIAL RECEIPT</span>
      </div>
      <div style="border:1.5px dashed #e0e0e0;border-radius:12px;padding:4px 16px;margin-bottom:14px;">
        <div class="_row"><span class="_rl">Receipt ID</span><span class="_rv" style="color:#f7a01a;">${escapeHtml(c.ReceiptID||"—")}</span></div>
        <div class="_row"><span class="_rl">Donor Name</span><span class="_rv">${escapeHtml(userName)}</span></div>
        <div class="_row"><span class="_rl">Amount</span><span class="_rv" style="font-size:1.2rem;color:#27ae60;">₹ ${fmt(c.Amount)}</span></div>
        <div class="_row"><span class="_rl">For Month</span><span class="_rv">${escapeHtml(c.ForMonth||"—")}</span></div>
        <div class="_row"><span class="_rl">Year</span><span class="_rv">${escapeHtml(String(c.Year||"—"))}</span></div>
        <div class="_row"><span class="_rl">Type</span><span class="_rv">${escapeHtml(typeName||"Contribution")}</span></div>
        <div class="_row"><span class="_rl">Occasion</span><span class="_rv">${escapeHtml(occasionName||"—")}</span></div>
        <div class="_row"><span class="_rl">Note</span><span class="_rv">${escapeHtml(c.Note||"—")}</span></div>
        <div class="_row"><span class="_rl">Date Recorded</span><span class="_rv">${escapeHtml(c.PaymentDate||"—")}</span></div>
      </div>
      <div style="text-align:center;font-size:11px;color:#bbb;">Thank you for your generous contribution 🙏</div>
    </div>
    <div class="_mft">
      <button class="_mbtn" style="background:#999;" onclick="closeModal()"><i class="fa-solid fa-xmark"></i> Close</button>
      <button class="_mbtn" style="background:#27ae60;" onclick="exportReceiptPDF('${rid}')"><i class="fa-solid fa-file-pdf"></i> Export PDF</button>
    </div>`;
  openModal(html,"500px");
}

function exportReceiptPDF(rid){
  const stored = window._rcptStore[rid];
  if(!stored){toast("Receipt data not found.","error");return;}
  const {c,userName,typeName,occasionName} = stored;
  if(typeof window.jspdf==="undefined"){toast("PDF library not loaded.","error");return;}
  const {jsPDF}=window.jspdf;
  let doc=new jsPDF({format:"a5",unit:"mm"});
  let w=doc.internal.pageSize.getWidth();
  doc.setFillColor(51,65,85); doc.rect(0,0,w,30,"F");
  doc.setTextColor(247,160,26); doc.setFontSize(15); doc.setFont(undefined,"bold");
  doc.text("Shree Hanuman Mandir",w/2,12,{align:"center"});
  doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont(undefined,"normal");
  doc.text("Paliya, Sultanpur  |  Contribution Receipt",w/2,20,{align:"center"});
  doc.text("OFFICIAL RECEIPT",w/2,27,{align:"center"});
  doc.autoTable({
    body:[
      ["Receipt ID", c.ReceiptID||"—"],["Donor Name",userName||"—"],
      ["Amount (Rs.)", "Rs. "+Number(c.Amount||0).toLocaleString("en-IN")],
      ["For Month",c.ForMonth||"—"],["Year",String(c.Year||"—")],
      ["Type",typeName||"—"],["Occasion",occasionName||"—"],
      ["Note",c.Note||"—"],["Date Recorded",c.PaymentDate||"—"]
    ],
    startY:36, theme:"grid",
    columnStyles:{0:{fontStyle:"bold",cellWidth:45,fillColor:[250,238,218],textColor:[99,56,6]},1:{cellWidth:w-73}},
    styles:{fontSize:9,cellPadding:3}
  });
  let fy=doc.lastAutoTable.finalY+8;
  doc.setFontSize(8);doc.setTextColor(160,160,160);
  doc.text("Thank you for your generous contribution. Generated: "+new Date().toLocaleDateString("en-IN"),w/2,fy,{align:"center"});
  doc.save("Receipt_"+(c.ReceiptID||"Mandir")+".pdf");
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