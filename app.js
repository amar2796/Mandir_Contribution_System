let selectedYear;
let _cbId = 0;

// ── Utility: HTML escape
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ── Utility: Indian-locale number formatting
function fmt(n) {
  return Number(n || 0).toLocaleString("en-IN");
}

// ── Toast notification (replaces all alert() calls)
function toast(msg, type) {
  // Remove any existing toast
  let old = document.getElementById("_toast");
  if (old) old.remove();

  let t = document.createElement("div");
  t.id = "_toast";
  let bg = type === "error" ? "#e74c3c" : type === "warn" ? "#f39c12" : "#27ae60";
  t.style.cssText = [
    "position:fixed",
    "top:20px",
    "right:20px",
    "background:" + bg,
    "color:#fff",
    "padding:12px 20px",
    "border-radius:8px",
    "font-family:Poppins,sans-serif",
    "font-size:14px",
    "font-weight:600",
    "z-index:99999",
    "box-shadow:0 4px 15px rgba(0,0,0,0.2)",
    "animation:_toastIn 0.3s ease",
    "max-width:320px",
    "line-height:1.4"
  ].join(";");
  t.innerText = msg;

  // Inject keyframe once
  if (!document.getElementById("_toastStyle")) {
    let s = document.createElement("style");
    s.id = "_toastStyle";
    s.textContent = "@keyframes _toastIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}";
    document.head.appendChild(s);
  }

  document.body.appendChild(t);
  setTimeout(() => { if (t.parentNode) t.remove(); }, 3500);
}

// ── Client-side SHA-256 (matches Apps Script hashPassword)
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── JSONP GET (for read operations)
function getData(action) {
  return new Promise((resolve, reject) => {
    _cbId++;
    const cb = "cb_" + _cbId + "_" + Date.now();
    const script = document.createElement("script");
    let done = false;

    window[cb] = function (data) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      delete window[cb];
      script.remove();
      resolve(data);
    };

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      delete window[cb];
      script.remove();
      reject(new Error("Request timed out. Please check your connection."));
    }, 20000);

    script.onerror = function () {
      if (done) return;
      done = true;
      clearTimeout(timer);
      delete window[cb];
      script.remove();
      reject(new Error("Network error. Please try again."));
    };

    script.src = API_URL + "?action=" + action + "&callback=" + cb;
    document.body.appendChild(script);
  });
}

// ── JSONP POST (for write operations) — with full timeout & cleanup
function postData(data) {
  return new Promise((resolve, reject) => {
    _cbId++;
    const cb = "cb_post_" + _cbId + "_" + Date.now();
    const script = document.createElement("script");
    let done = false;

    window[cb] = function (res) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      delete window[cb];
      script.remove();
      resolve(res);
    };

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      delete window[cb];
      script.remove();
      reject(new Error("Request timed out. Please try again."));
    }, 20000);

    script.onerror = function () {
      if (done) return;
      done = true;
      clearTimeout(timer);
      delete window[cb];
      script.remove();
      reject(new Error("Network error. Please try again."));
    };

    script.src = API_URL + "?" + new URLSearchParams(data).toString() + "&callback=" + cb;
    document.body.appendChild(script);
  });
}

// ── Session check (used by all pages)
function checkSession() {
  let s = JSON.parse(localStorage.getItem("session"));
  if (!s || Date.now() > s.expiry) {
    localStorage.clear();
    toast("Session expired. Please login again.", "error");
    setTimeout(() => location.replace("login.html"), 1500);
    return false;
  }
  return true;
}

// ── Local data update (avoids full reload after edit)
function updateLocalData(category, id, newData) {
  if (category === "contributions") {
    let index = data.findIndex(x => String(x.Id) === String(id));
    if (index !== -1) data[index] = { ...data[index], ...newData };
  } else if (category === "expenses") {
    let index = expenses.findIndex(x => String(x.Id) === String(id));
    if (index !== -1) expenses[index] = { ...expenses[index], ...newData };
  }
  render();
  if (typeof renderExpenses === "function") renderExpenses();
  loadSummary();
}

// ── Year dropdown builder (used by dashboard.html)
function loadYearDropdown() {
  const yearSelect = document.getElementById("yearSelect");
  if (!yearSelect) return;

  let years = new Set();
  if (typeof contributions !== "undefined") contributions.forEach(c => years.add(Number(c.Year)));
  if (typeof expenses !== "undefined") expenses.forEach(e => years.add(Number(e.Year)));
  years.add(new Date().getFullYear());

  let sorted = Array.from(years).filter(y => !isNaN(y)).sort((a, b) => b - a);
  yearSelect.innerHTML = sorted.map(y => `<option value="${y}">${y}</option>`).join("");
  selectedYear = Number(yearSelect.value);

  yearSelect.onchange = function () {
    selectedYear = Number(this.value);
    if (typeof applyFilter === "function") applyFilter();
  };
}