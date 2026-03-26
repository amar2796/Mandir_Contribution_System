// JSONP GET — with timeout, error handling, and script cleanup
let selectedYear;

function getData(action){
  return new Promise((resolve, reject) => {
    let cb = "cb_" + Date.now();
    let script = document.createElement("script");
    let done = false;

    let timer = setTimeout(() => {
      if(done) return;
      done = true;
      delete window[cb];
      script.remove();
      reject(new Error("Request timed out. Please check your connection."));
    }, 15000);

    window[cb] = function(data){
      if(done) return;
      done = true;
      clearTimeout(timer);
      delete window[cb];
      script.remove();
      resolve(data);
    };

    script.onerror = function(){
      if(done) return;
      done = true;
      clearTimeout(timer);
      delete window[cb];
      script.remove();
      reject(new Error("Network error. Could not reach server."));
    };

    script.src = `${API_URL}?action=${action}&callback=${cb}`;
    document.body.appendChild(script);
  });
}

// POST — with timeout, error handling, and script cleanup
function postData(data){
  let query = new URLSearchParams(data).toString();

  return new Promise((resolve, reject) => {
    let cb = "cb_" + Date.now();
    let script = document.createElement("script");
    let done = false;

    let timer = setTimeout(() => {
      if(done) return;
      done = true;
      delete window[cb];
      script.remove();
      reject(new Error("Request timed out. Please check your connection."));
    }, 15000);

    window[cb] = function(res){
      if(done) return;
      done = true;
      clearTimeout(timer);
      delete window[cb];
      script.remove();
      resolve(res);
    };

    script.onerror = function(){
      if(done) return;
      done = true;
      clearTimeout(timer);
      delete window[cb];
      script.remove();
      reject(new Error("Network error. Could not reach server."));
    };

    script.src = `${API_URL}?${query}&callback=${cb}`;
    document.body.appendChild(script);
  });
}

// Year dropdown (used by dashboard.html)
function loadYearDropdown(){
  let years = new Set();

  yearConfig.forEach(y => years.add(Number(y.Year)));
  contributions.forEach(c => years.add(Number(c.Year)));
  expenses.forEach(e => years.add(Number(e.Year)));

  let sorted = Array.from(years).sort((a,b) => a - b);

  yearSelect.innerHTML = sorted.map(y =>
    `<option value="${y}">${y}</option>`
  ).join("");

  selectedYear = new Date().getFullYear();

  if(sorted.includes(selectedYear)){
    yearSelect.value = selectedYear;
  } else {
    selectedYear = sorted[sorted.length - 1];
    yearSelect.value = selectedYear;
  }

  yearSelect.onchange = function(){
    selectedYear = Number(this.value);
    applyFilter();
  };
}