/* ═══════════════════════════════════════════════════════════════
   MANDIR SYSTEM — CENTRAL CONSTANTS
   Edit this file to update project name, address, branding, etc.
   Used by: app.js, admin.html, appscript (server-side copy needed)
   ═══════════════════════════════════════════════════════════════ */

   const APP = {
    /* ── Identity ── */
    name:          "Shree Hanuman Mandir",
    shortName:     "SHM",
    nameHindi:     "श्री हनुमान मंदिर",
  
    /* ── Location ── */
    village:       "Paliya",
    district:      "Sultanpur",
    state:         "Uttar Pradesh",
    pin:           "",
    get location() { return this.village + ", " + this.district; },
    get address()  { return this.village + ", " + this.district + ", " + this.state; },
  
    /* ── Contact ── */
    phone:         "+918127991402",       // e.g. "+91-XXXXXXXXXX"
    email:         "hanumanmandirpaliya@gmail.com",       // temple contact email
    website:       "www.google.com",       // optional
  
    /* ── Receipt / Finance ── */
    receiptPrefix: "MNR",   // Receipt IDs: MNR-2025-0001, MNR-2025-0002 ...
    currency:      "₹",
    currencyCode:  "INR",
  
    /* ── Authorized Signatory (shown on PDF receipts) ── */
    signatory:     "Temple Trust",
    designation:   "Authorized Signatory",
  
    /* ── Branding / Messages ── */
    tagline:       "Jai Shree Ram 🙏",
    thankYouMsg:   "Thank you for your generous contribution",
    footerNote:    "This is a system-generated receipt.",
    symbol:        "🕉️",
  
    /* ── Email Quota (Gmail free tier = 100/day; keep buffer) ── */
    emailDailyLimit: 90,    // safe limit (leaves buffer of 10 for OTPs etc.)
  };