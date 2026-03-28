let selectedYear;
let _cbId = 0; // Global counter to prevent name collisions

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Fixed getData with unique JSONP callbacks
function getData(action) {
  return new Promise((resolve, reject) => {
    _cbId++;
    const cb = "cb_" + _cbId + "_" + Date.now(); 
    const script = document.createElement("script");
    let done = false;

    window[cb] = function(data) {
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
      reject(new Error("Request timed out."));
    }, 15000);

    script.onerror = function() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      delete window[cb];
      script.remove();
      reject(new Error("Network error."));
    };

    script.src = `${API_URL}?action=${action}&callback=${cb}`;
    document.body.appendChild(script);
  });
}

function fmt(n) {
  return Number(n || 0).toLocaleString("en-IN");
}

function toast(msg) {
  let t = document.createElement("div");
  t.innerText = msg;
  t.style = "position:fixed;top:20px;right:20px;background:#333;color:#fff;padding:10px;border-radius:5px;";
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),3000);
}

function checkSession() {
  let s = JSON.parse(localStorage.getItem("session"));
  if (!s || Date.now() > s.expiry) {
    localStorage.clear();
    alert("Session expired");
    location.replace("login.html");
    return false;
  }
  return true;
}

// POST — with timeout, error handling, and script cleanup
// REPLACED: Optimized POST function with better cleanup
function postData(data) {
  return new Promise((resolve, reject) => {
    _cbId++;
    const cb = "cb_post_" + _cbId + "_" + Date.now();
    const script = document.createElement("script");
    
    window[cb] = (res) => {
      script.remove();
      delete window[cb];
      resolve(res);
    };

    script.src = `${API_URL}?${new URLSearchParams(data).toString()}&callback=${cb}`;
    document.body.appendChild(script);
  });
}



// NEW: Add this at the end of app.js
// This updates the screen instantly without needing to download everything again
function updateLocalData(category, id, newData) {
  if (category === 'contributions') {
    // Find the item in our local 'data' array
    let index = data.findIndex(x => String(x.Id) === String(id));
    if (index !== -1) {
      // Merge the new changes into the existing item
      data[index] = { ...data[index], ...newData };
    }
  } else if (category === 'expenses') {
    // Find the item in our local 'expenses' array
    let index = expenses.findIndex(x => String(x.Id) === String(id));
    if (index !== -1) {
      expenses[index] = { ...expenses[index], ...newData };
    }
  }
  
  // Refresh the tables and the top boxes (Total Users, etc.)
  render(); 
  if (typeof renderExpenses === "function") renderExpenses();
  loadSummary();
}

// Year dropdown (used by dashboard.html)
function loadYearDropdown(){
  const yearSelect = document.getElementById("yearSelect");
  if(!yearSelect) return;

  let years = new Set();
  contributions.forEach(c => years.add(Number(c.Year)));
  expenses.forEach(e => years.add(Number(e.Year)));
  
  // Ensure current year is always an option
  years.add(new Date().getFullYear());

  let sorted = Array.from(years).sort((a,b) => b - a);
  yearSelect.innerHTML = sorted.map(y => `<option value="${y}">${y}</option>`).join("");

  selectedYear = Number(yearSelect.value);

  yearSelect.onchange = function(){
    selectedYear = Number(this.value);
    if (typeof applyFilter === "function") applyFilter();
  };
}