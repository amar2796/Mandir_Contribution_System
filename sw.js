/* ═══════════════════════════════════════════════════════════════
   SHREE HANUMAN MANDIR — SERVICE WORKER
   Strategy:
   • App shell (HTML/JS/CSS files) → Cache-first with network fallback
   • External CDN (fonts, FA, jsPDF) → Cache-first, long TTL
   • Google Apps Script API calls → Network-only (never cache live data)
   • Everything else → Network-first with cache fallback
   ═══════════════════════════════════════════════════════════════ */

   const CACHE_NAME    = "shm-v1";
   const SHELL_CACHE   = "shm-shell-v1";
   const CDN_CACHE     = "shm-cdn-v1";
   
   /* ── App shell — files served from your own host ── */
   const SHELL_FILES = [
     "./",
     "./index.html",
     "./login.html",
     "./admin.html",
     "./user.html",
     "./dashboard.html",
     "./app.js",
     "./chatbot_widget.js",
     "./constants.js",
     "./config.js",
     "./manifest.json",
     "./icon-192.svg",
     "./icon-512.svg"
   ];
   
   /* ── External CDN files to cache ── */
   const CDN_ORIGINS = [
     "fonts.googleapis.com",
     "fonts.gstatic.com",
     "cdnjs.cloudflare.com"
   ];
   
   /* ── Never cache these — always go to network ── */
   const NETWORK_ONLY_PATTERNS = [
     "script.google.com",
     "macros/s/",
     "googleusercontent.com",
     "drive.google.com"
   ];
   
   
   /* ════════════════════════════════════════════════════════════════
      INSTALL — pre-cache the app shell
      ════════════════════════════════════════════════════════════════ */
   self.addEventListener("install", function(event) {
     event.waitUntil(
       caches.open(SHELL_CACHE).then(function(cache) {
         // Cache shell files — use individual try/catch so one
         // missing file doesn't block the entire install
         return Promise.allSettled(
           SHELL_FILES.map(function(url) {
             return cache.add(url).catch(function(err) {
               console.warn("[SW] Could not cache:", url, err.message);
             });
           })
         );
       }).then(function() {
         // Activate immediately — don't wait for old SW to unload
         return self.skipWaiting();
       })
     );
   });
   
   
   /* ════════════════════════════════════════════════════════════════
      ACTIVATE — clean up old caches
      ════════════════════════════════════════════════════════════════ */
   self.addEventListener("activate", function(event) {
     const validCaches = [SHELL_CACHE, CDN_CACHE];
     event.waitUntil(
       caches.keys().then(function(keys) {
         return Promise.all(
           keys.filter(function(key) {
             return !validCaches.includes(key);
           }).map(function(key) {
             console.log("[SW] Deleting old cache:", key);
             return caches.delete(key);
           })
         );
       }).then(function() {
         // Take control of all open tabs immediately
         return self.clients.claim();
       })
     );
   });
   
   
   /* ════════════════════════════════════════════════════════════════
      FETCH — routing strategy per request type
      ════════════════════════════════════════════════════════════════ */
   self.addEventListener("fetch", function(event) {
     const url = event.request.url;
   
     // 1. NETWORK-ONLY: Google Apps Script API — never cache live data
     if (NETWORK_ONLY_PATTERNS.some(function(p) { return url.includes(p); })) {
       event.respondWith(fetch(event.request));
       return;
     }
   
     // 2. Skip non-GET requests (postData, fetch POST uploads)
     if (event.request.method !== "GET") {
       event.respondWith(fetch(event.request));
       return;
     }
   
     // 3. CDN RESOURCES — cache-first, long TTL
     const isCDN = CDN_ORIGINS.some(function(origin) { return url.includes(origin); });
     if (isCDN) {
       event.respondWith(
         caches.open(CDN_CACHE).then(function(cache) {
           return cache.match(event.request).then(function(cached) {
             if (cached) return cached;
             return fetch(event.request).then(function(response) {
               if (response && response.status === 200) {
                 cache.put(event.request, response.clone());
               }
               return response;
             }).catch(function() {
               // CDN offline — return nothing, browser shows error
               return new Response("", { status: 503 });
             });
           });
         })
       );
       return;
     }
   
     // 4. APP SHELL — cache-first, network fallback
     const isShell = SHELL_FILES.some(function(f) {
       return url.endsWith(f.replace("./", "")) || url.endsWith("/");
     });
   
     if (isShell) {
       event.respondWith(
         caches.open(SHELL_CACHE).then(function(cache) {
           return cache.match(event.request).then(function(cached) {
             // Return cached version immediately
             if (cached) {
               // Background refresh — update cache silently
               fetch(event.request).then(function(response) {
                 if (response && response.status === 200) {
                   cache.put(event.request, response.clone());
                 }
               }).catch(function() {});
               return cached;
             }
             // Not in cache — fetch from network
             return fetch(event.request).then(function(response) {
               if (response && response.status === 200) {
                 cache.put(event.request, response.clone());
               }
               return response;
             }).catch(function() {
               // Offline and not cached — return offline page
               return _offlinePage();
             });
           });
         })
       );
       return;
     }
   
     // 5. EVERYTHING ELSE — network-first, cache fallback
     event.respondWith(
       fetch(event.request).then(function(response) {
         if (response && response.status === 200) {
           caches.open(SHELL_CACHE).then(function(cache) {
             cache.put(event.request, response.clone());
           });
         }
         return response;
       }).catch(function() {
         return caches.match(event.request).then(function(cached) {
           return cached || _offlinePage();
         });
       })
     );
   });
   
   
   /* ── Minimal offline fallback page ── */
   function _offlinePage() {
     const html = `<!DOCTYPE html>
   <html lang="en">
   <head>
     <meta charset="UTF-8"/>
     <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
     <title>Offline — Shree Hanuman Mandir</title>
     <style>
       body{margin:0;font-family:Poppins,sans-serif;background:#1e293b;
         display:flex;align-items:center;justify-content:center;
         min-height:100vh;text-align:center;padding:24px;}
       .card{background:#fff;border-radius:20px;padding:40px 32px;
         max-width:360px;border-top:5px solid #f7a01a;}
       .om{font-size:64px;margin-bottom:8px;}
       h2{color:#334155;font-size:1.4rem;margin:0 0 8px;}
       p{color:#64748b;font-size:14px;line-height:1.6;margin:0 0 24px;}
       button{background:#f7a01a;color:#fff;border:none;padding:12px 28px;
         border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;}
     </style>
   </head>
   <body>
     <div class="card">
       <div class="om">🕉️</div>
       <h2>You are offline</h2>
       <p>Shree Hanuman Mandir system needs internet to load live data.
          Please check your connection and try again.</p>
       <button onclick="location.reload()">Try Again</button>
     </div>
   </body>
   </html>`;
     return new Response(html, {
       headers: { "Content-Type": "text/html;charset=utf-8" }
     });
   }
   
   
   /* ════════════════════════════════════════════════════════════════
      MESSAGE — allow pages to send commands to the SW
      e.g. force cache refresh: navigator.serviceWorker.controller
           .postMessage({ type: "CLEAR_CACHE" })
      ════════════════════════════════════════════════════════════════ */
   self.addEventListener("message", function(event) {
     if (event.data && event.data.type === "CLEAR_CACHE") {
       caches.keys().then(function(keys) {
         return Promise.all(keys.map(function(k) { return caches.delete(k); }));
       }).then(function() {
         event.source.postMessage({ type: "CACHE_CLEARED" });
       });
     }
     if (event.data && event.data.type === "SKIP_WAITING") {
       self.skipWaiting();
     }
   });