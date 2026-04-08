/* ═══════════════════════════════════════════════════════════════
   MANDIR SYSTEM — CENTRAL CONSTANTS
   Edit this file to update project name, address, branding, etc.
   Used by: app.js, admin.html, login.html, user.html, dashboard.html

   ── SYNC CHECKLIST ── (these fields must match CFG in appscript.txt exactly)
   ✔ name              → CFG.name
   ✔ location / address→ CFG.location / CFG.address
   ✔ receiptPrefix     → CFG.receiptPrefix
   ✔ emailDailyLimit   → CFG.emailDailyLimit
   ✔ signatory         → CFG.signatory
   ✔ designation       → CFG.designation
   ✔ tagline           → CFG.tagline
   ✔ thankYouMsg       → CFG.thankYouMsg
   ✔ version           → CFG.version
   Whenever you change any of the above here, update appscript.txt CFG too.
   ═══════════════════════════════════════════════════════════════ */

const APP = {
  /* ── Version (shown in admin sidebar footer + login page) ── */
  version:       "2.1.0",        // SYNC with CFG.version in appscript.txt

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
  phone:         "+918127991402",
  email:         "hanumanmandirpaliya@gmail.com",
  website:       "https://amar2796.github.io/Mandir_Contribution_System/",

  /* ── Receipt / Finance ── */
  receiptPrefix: "MNR",   // Receipt IDs: MNR-2025-00001 (5 digits)
  currency:      "₹",
  currencyCode:  "INR",

  /* ── Bank / UPI Details (used in Donate modal) ── */
  upiId:         "8765890641@upi",
  accountName:   "Ram Shank Vishwakarma",
  accountNo:     "1234 5678 1234",
  ifscCode:      "BKID0008XXX",
  bankName:      "State Bank of India",
  bankBranch:    "Katka Khanpur Branch",
  accountType:   "Savings",

  /* ── Authorized Signatory (shown on PDF receipts) ── */
  signatory:     "Temple Trust",
  designation:   "Authorized Signatory",

  /* ── Branding / Messages ── */
  tagline:       "Jai Shree Ram 🙏",
  thankYouMsg:   "Thank you for your generous contribution",
  footerNote:    "This is a system-generated receipt.",
  symbol:        "🕉️",

  /* ── Email Quota (Gmail free tier = 100/day; keep buffer) ── */
  emailDailyLimit: 90,    // SYNC with CFG.emailDailyLimit in appscript.txt

  /* ── Google Drive Photo Folder IDs ── */
  // Create 3 sub-folders in your Drive upload folder, paste IDs here.
  // These must match CFG.folderProfile/Expense/Gallery in appscript.txt.
  folderMain:    "1fw9No8nevduhe1yeILZUrbJHdDH_Lt9f",
  // Sub-folders — create these in Drive, paste folder IDs below:
  folderProfile: "1z9vb3mPu8DVB7htuB_vku0cC2dTc7Pa7",   // Drive > ProfilePhotos/
  folderExpense: "1YY55xNxs5_LNCNjYYkq0oeEzoZBg5qKv", // Drive > ExpenseReceipts/
  folderGallery: "1ecYdcFZrSF2mKX15mDYh8vi4Oat9jF2n",   // Drive > GalleryPhotos/
  folderSlip:    "1c60FzCP3ECU_XBckWfBVkcWyNb-ikNIk",   // Drive > PaymentSlips/ 
};
