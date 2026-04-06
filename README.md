# 🕉️ Shree Hanuman Mandir — Management System

A complete temple management system built on **Google Apps Script + Google Sheets** as the backend, with a pure HTML/CSS/JS frontend. No server, no database, no hosting cost — everything runs on Google's free infrastructure.

---

## Live System

| Page | Access | Purpose |
|------|--------|---------|
| `index.html` | Public | Temple home page — announcements, gallery, goals, donate info |
| `login.html` | Public | Login + self-registration for members |
| `admin.html` | Admin only | Full management panel |
| `user.html` | Members | Personal contribution history, receipts |
| `dashboard.html` | Admin only | Financial analytics dashboard (loaded inside admin) |

---

## Architecture

```
Browser (HTML/CSS/JS)
    │
    ├── app.js          — shared layer: JSONP, cache, session, modals, receipts
    ├── constants.js    — single source of truth for temple name, address, branding
    ├── config.js       — API_URL (Apps Script deployment URL)
    └── chatbot_widget.js — floating chatbot widget (injected on index.html)
          │
          ▼  JSONP (GET) + fetch (POST)
    Google Apps Script (appscript.txt → deploy as Web App)
          │
          ▼  SpreadsheetApp
    Google Sheets (13 sheets)
```

All read operations use JSONP. File uploads (gallery photos) use `fetch` POST with base64. There is no CORS issue because Apps Script handles both.

---

## Module Guide

### `constants.js`
The single source of truth for all temple identity and branding. Edit this file to change the temple name, address, phone, email, UPI ID, bank details, receipt prefix, or any branding text. Changes here reflect across all pages automatically.

Key fields: `APP.name`, `APP.village`, `APP.phone`, `APP.upiId`, `APP.accountNo`, `APP.receiptPrefix`, `APP.tagline`.

> **Important:** The Apps Script backend has its own mirror constant object `CFG` inside `appscript.txt`. If you change `constants.js`, update `CFG` in the appscript too.

---

### `config.js`
Contains a single line — the Apps Script deployment URL (`API_URL`). After deploying or redeploying the Apps Script, paste the new URL here. All pages load this file so the URL only needs updating in one place.

---

### `app.js`
The shared JavaScript layer loaded by every protected page. Contains:

- **JSONP engine** — `getData(action)` for GET requests, `postData(payload)` for write operations. Both return Promises.
- **Cache layer** — `getCached(action)` wraps `getData` with in-memory TTL cache (5–10 min per action). `postData` automatically busts relevant cache keys on every write.
- **Smart refresh** — `smartRefresh(scope)` re-renders only the affected table after a save, instead of re-rendering everything. Scopes: `"contributions"`, `"expenses"`, `"users"`, `"types"`, `"occasions"`, `"expenseTypes"`, `"goals"`, `"all"`.
- **Session system** — login stores a session token in `localStorage` and writes it to the USERS sheet. Every 60s (admin) or 10min (user), `checkSession` polls the sheet to detect if another device has logged in. Tab visibility changes pause polling to save quota.
- **SHA-256 hashing** — passwords are hashed client-side before being sent over the network.
- **Toast notifications** — `toast(message, type)` shows animated bottom-right toasts. Types: `""` (success), `"error"`, `"warn"`.
- **Modal system** — `openModal(html, width)`, `closeModal()`, `confirmModal(msg, fn)` for all dialogs.
- **Receipt system** — `showReceipt()`, `exportReceiptPDF()`, `sendReceiptEmailDirect()`, `sendReceiptWhatsApp()` for contribution receipts. PDFs generated client-side using `jsPDF`.
- **Crop system** — `openCropModal()` for gallery image cropping before upload.

---

### `admin.html`
The main admin management panel. Requires Admin role. Contains all admin functionality in a single-page sidebar layout with lazy-loaded sections.

**Finance section**
- **Contribution** — add regular and walk-in contributions, edit, delete, bulk insert, filter by month/year/member/type
- **Expense** — add, edit, delete expenses with type and month categorisation
- **Tracker** — filter and search all contributions and expenses in one view
- **Goals** — create fundraising goals with target amounts and progress tracking
- **Year Summary** — year-by-year financial table: opening balance, total collection, total expenses, closing balance, carry-forward chain

**Members section**
- **Users** — add, edit, deactivate members; approve or reject self-registrations with email notification; filter by status (Active / Pending / Rejected)

**Master Data section**
- Manage contribution types, expense types, and occasions (Diwali, Navratri etc.)

**Content section**
- **Gallery** — upload, crop, and manage temple photo gallery
- **Announcement** — post live announcements shown on the public home page
- **Broadcast** — send WhatsApp-style messages to all members

**System section**
- **Email Automation** — toggle auto-receipt emails and monthly end-of-month reports; manually trigger reports; view email quota
- **Feedback** — view and manage member feedback submitted from the home page
- **Chatbot** — configure the public-facing chatbot (greeting, menu items, language)
- **Audit Log** — complete history of every admin action with timestamp and device info

---

### `user.html`
The member-facing portal. Requires User role. Shows the member's own contribution history, receipt download, email receipt, WhatsApp share, and personal totals. Members cannot see any other member's data.

---

### `dashboard.html`
A read-only analytics page loaded inside an iframe within admin. Shows:
- Year summary card with opening balance, total contributions, total expenses, closing balance
- Month-wise contribution breakdown table
- Member-wise contribution table (filterable by year and date range)
- Full transaction detail table with search
- PDF export and WhatsApp share of the complete report

---

### `index.html`
The public-facing home page. No login required. Shows:
- Temple hero section with name, location, and tagline
- Live announcements from the admin panel
- Photo gallery
- Active fundraising goals with progress bars
- Donate section with UPI QR code and bank details
- Feedback form
- Floating chatbot widget

---

### `login.html`
Handles three flows: login, self-registration (with admin approval required), and forgot password (email OTP verification). Security features include client-side rate limiting (5 attempts → 5 min lockout) and server-side rate limiting (10 attempts → 15 min lockout via CacheService). Passwords are SHA-256 hashed before transmission.

---

### `chatbot_widget.js`
A self-contained floating chatbot injected into `index.html`. Configuration is fetched from the Apps Script (`getChatbotConfig` action) and editable from the admin Chatbot page. Supports bilingual responses (Hindi/English), custom menu items, UPI QR code display, and contact info. Zero external dependencies.

---

### `appscript.txt` (deploy as Apps Script Web App)
The entire backend. A single `doGet(e)` router handles all actions via the `action` URL parameter and returns JSONP. A `doPost(e)` handles file uploads (gallery photos).

Key systems inside:
- **Authentication** — SHA-256 password comparison, session token write/verify/clear, login rate limiting via `CacheService`
- **Receipt ID generator** — sequential `MNR-YYYY-NNNN` format, counter in `PropertiesService`, resets each year
- **Email quota system** — daily counter in `PropertiesService`, capped at 90/day (Gmail free tier = 100/day)
- **Email automation** — auto-receipt on contribution, monthly end-of-month summary/reminder emails with per-member privacy
- **Server-side cache** — `_cachedSheet()` caches `TYPES`, `OCCASIONS`, `EXPENSE_TYPES` for 10 minutes via `CacheService`, busted on any write
- **Audit logging** — every write action logged to `AUDIT_LOGS` sheet with timestamp, admin name, details, device info
- **Auto backup** — `autoBackupSystem()` can be triggered via a Time-based Apps Script trigger to copy the spreadsheet daily

---

## Google Sheets Schema

| Sheet | Key Columns | Notes |
|-------|------------|-------|
| `USERS` | UserId, Name, Mobile, Role, Password, Email, Status, SessionToken | Password stored as SHA-256 hash |
| `CONTRIBUTIONS` | Id, UserId, Amount, PaymentDate, ForMonth, Year, TypeId, OccasionId, Note, ReceiptID, PaymentMode | Walk-in entries have `UserId` starting with `WALKIN_` |
| `EXPENSES` | Id, Title, Amount, PaymentDate, Year, ExpenseTypeId, ForMonth | |
| `TYPES` | TypeId, TypeName | Contribution types e.g. Monthly, Special |
| `OCCASIONS` | OccasionId, OccasionName | e.g. Diwali, Navratri |
| `EXPENSE_TYPES` | ExpenseTypeId, Name | e.g. Pooja Items, Maintenance |
| `GOALS` | GoalId, Name, Target, Current, Status | |
| `GALLERY` | ImageId, Title, PhotoURL, Priority, Status, CreatedAt | |
| `ANNOUNCEMENT` | AnnId, Message, Badge, Icon, Color, Status, AdminName, CreatedAt | |
| `BROADCAST` | BcId, Type, Priority, Title, Message, Time, AdminName | |
| `AUDIT_LOGS` | Timestamp, UserAdmin, Action, Details, DeviceInfo | Auto-created on first log |
| `SETTINGS` | Key, Value, UpdatedAt | Stores email automation toggles |
| `YEAR_CONFIG` | Year, OpeningBalance | Only needed for the first year; subsequent years carry forward automatically |

---

## Setup Guide

**1. Create a Google Spreadsheet**
Create a new Google Sheet. Create sheets with the exact names listed in the schema above. Add header rows matching the Key Columns.

**2. Deploy the Apps Script**
Open the spreadsheet → Extensions → Apps Script → paste `appscript.txt` contents → Save → Deploy → New Deployment → Web App → Execute as: Me → Who has access: Anyone → Deploy → copy the URL.

**3. Configure `config.js`**
Paste the deployment URL as the value of `API_URL` in `config.js`.

**4. Configure `constants.js`**
Edit `constants.js` with your temple's name, address, phone, UPI ID, bank details, and receipt prefix. Then update the matching `CFG` object in the Apps Script with the same values.

**5. Create the first Admin user**
Directly in the `USERS` sheet, add a row with `Role = Admin` and `Status = Active`. The password must be the SHA-256 hash of the desired password. You can generate a SHA-256 hash at any online tool or via the browser console: `await crypto.subtle.digest("SHA-256", new TextEncoder().encode("yourpassword"))`.

**6. Set up auto backup (optional)**
In Apps Script → Triggers → Add Trigger → `autoBackupSystem` → Time-driven → Day timer → preferred time.

**7. Host the HTML files**
Upload all HTML, JS files to any static host: GitHub Pages, Netlify, or simply open locally. The `API_URL` in `config.js` handles all data — hosting is stateless.

---

## Features Summary

- Member self-registration with admin approval and email notification
- Contribution recording with auto-generated sequential receipt IDs (`MNR-YYYY-NNNN`)
- PDF receipt generation (client-side, no server needed)
- Receipt sharing via WhatsApp and email
- Walk-in donor contributions (no account required)
- Expense tracking with category breakdown
- Year-by-year financial summary with automatic carry-forward balance chain
- Monthly end-of-month email to each member (personal summary or reminder)
- Auto-receipt email on every contribution (toggle on/off)
- Email quota management (90/day cap with live counter)
- Fundraising goals with progress tracking
- Photo gallery with crop-before-upload
- Live announcements and broadcast messages
- Public-facing chatbot (bilingual, configurable from admin)
- Member feedback system
- Complete audit log of every admin action
- Cross-device single session enforcement (one login at a time)
- Client + server-side login rate limiting
- In-memory + server-side caching (60–70% reduction in Apps Script quota usage)

---

## Security Notes

- Passwords are SHA-256 hashed client-side. The raw password never leaves the browser.
- The Apps Script URL is public by necessity (JSONP requires it) but all write operations validate session context. Sensitive data (passwords) is deleted from responses before returning.
- The `USERS` sheet `Password` column is stripped from all `getAllData` and `getUsers` responses.
- Login is rate-limited at two layers: browser (5 attempts / 5 min) and server (10 attempts / 15 min via CacheService).
- Session tokens are stored in `localStorage` and validated server-side on every poll. A login from a new device invalidates all previous sessions.
- Do not commit `config.js` with a real API URL to a public repository. Add it to `.gitignore` and share it separately.

---

## File Structure

```
├── index.html          — public home page
├── login.html          — login, register, forgot password
├── admin.html          — admin management panel
├── user.html           — member portal
├── dashboard.html      — financial analytics (loaded inside admin)
├── app.js              — shared JS: JSONP, cache, session, receipts, modals
├── chatbot_widget.js   — floating chatbot widget
├── constants.js        — temple identity and branding constants
├── config.js           — API_URL (keep out of public repos)
└── appscript.txt       — full Apps Script backend (deploy via Google)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML, CSS, JavaScript (no framework) |
| Fonts | Poppins (Google Fonts) |
| Icons | Font Awesome 6 |
| PDF generation | jsPDF (client-side) |
| QR codes | qrcode.js |
| Backend | Google Apps Script (Web App deployment) |
| Database | Google Sheets |
| Email | Gmail via MailApp (100/day free tier) |
| File storage | Google Drive (gallery photo URLs) |
| Hosting | Any static host (GitHub Pages, Netlify, local) |

---

*Jai Shree Ram 🙏*
