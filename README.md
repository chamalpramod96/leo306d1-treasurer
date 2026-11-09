# District Treasurer Portal — Leo District 306 D1

A web app for the Leo District 306 D1 District Treasurer, themed from the district emblem (maroon and gold).

## What it does

- **Loading screen and header** built around the district emblem, with the motto "Values Lead Purpose".
- **Clubs & Notes**: the club register, split into **Omega** and **Alpha** clubs. **Import from Excel** reads the district's club exco sheet (.xlsx or .csv): each club with its zone, email, president, treasurer and assistant treasurer and their phone numbers. It shows a preview first. Importing a new year's sheet updates the officers of clubs already in the portal instead of adding them twice, and never deletes anything. It has three tabs:
  - **Clubs**: one card per club, with its logo.
  - **Notes & reminders**: every note and reminder in the district.
  - **Notices**: district notices.
- **Club profile** (open any club):
  - **Profile:** the club logo, club email and phone, zone and members. Also the **President**, **Treasurer** and **Assistant Treasurer**, each with a phone number and Call / WhatsApp buttons.
  - **Overview:** reports on file, money paid this year, pending payments and open reminders. It also lists what is pending (overdue reports, unpaid balances, reminders that are due) and the latest notices.
  - **Reports:** every month of the Leo year, with its due date, its status, the **date and time it was received**, who marked it, and any remark.
  - **Payments:** expected, paid and pending amounts. Pending payments come first, then each payment type with its instalments.
  - **Notices & notes:** district notices sent to this club, plus notes and **reminders**. A reminder has a date, appears on the dashboard when that date arrives, and can be ticked off.
  - **Send reminder:** writes a message listing the club's overdue reports and pending payments. You can edit it, then send it by **WhatsApp** to the chosen officer, by **email** to the club, or copy it. The app notes on the club's profile that a reminder was sent.
  - Uploaded logos are shrunk to a few KB automatically. WhatsApp links turn Sri Lankan numbers (07X XXX XXXX) into the international +94 form.
- **Notices**: post a notice to all clubs, to Omega or Alpha clubs only, or to one club. Notices appear on each club's profile and on the dashboard. You can share them to WhatsApp or copy them.
- **Treasurer Reports**: a register from July to June for each Leo year. Click a cell to mark a club's monthly treasurer report as received, with the date, the time and a remark. "Received today" and **Quick mark** fill in the current date and time. A report received after the due day is shown as late. A report not received by the due day is shown as overdue. Quick mark records a report with one click, and you can undo it.
- **Payments**: the district payment types you collect, such as per-member dues, DCM fees, convention registration and project funds. Each type has its own amount, due date and the club types it applies to. A matrix shows every club against every payment type: paid, partial, unpaid, overdue or exempt. You can record several instalments for one payment, each with a method and a reference number. The payment log can be filtered and exported.
- **Payment e-receipts**: recording a payment issues a numbered e-receipt and shows it straight away. The receipt follows the district template: Lions, Leo and district logos, date and receipt number, then Recipient, On Account of, Amount, Amount in words, payment mode (cash or bank), collected by (DT or DAT, with the officer's name) and contact number. It ends with the confirmation note and needs no signature.
  - **Filled in with the payment:** the payment form has an "E-receipt details" section. Recipient, contact number and "on account of" are filled from the club and payment type, and you can change them. "Collected by" starts as your own role. You can switch off the receipt for a payment that already has a paper receipt.
  - **Numbering:** numbers look like `LD306D1/26-27/0001`. They start again each Leo year and are never reused. Editing a payment updates its receipt and keeps the number (marked *Revised*). Deleting a payment keeps its receipt in the register, marked *Cancelled*. In **Settings** you can change the prefix, the second heading, and the next number (for example, to continue after paper receipts).
  - **Per receipt:** download it as a **PDF** or an **image**, **share** it (on phones the PDF goes to WhatsApp, email and so on; elsewhere you get a text version for WhatsApp, email or copying), or **print** it on a computer.
  - **Receipt register** (Payments → Receipts): every receipt with totals for cash, bank and other, DT and DAT. Filter by Leo year, DT/DAT, mode or text, then download the list as a real **Excel (.xlsx)** sheet or a **PDF**. Payments recorded before receipts existed can be given receipts in one step.
- **Dashboard**: headline totals, report progress by month and money collected for each payment type. It also has a "needs attention" list that includes reminders that are due, recent activity, and the latest district notices.
- **Settings & Backup**: Leo year, report due day and treasurer name. You can back up and restore everything as JSON, export CSV files that open in Excel, load sample data and clear all data. The **Online database** card shows whether the portal is connected to Firebase and whether everything is saved.
- **Shared online data (Firebase)**: once connected to a Firebase project, every officer signs in with their email on any device and sees the same data, updated live. See [FIREBASE-SETUP.md](FIREBASE-SETUP.md).

## Logins & roles

The portal opens on a sign-in page that uses the district emblem, with the Leo lions logo as a faint watermark. Only these district officers have logins:

| Role | How many | What they can do |
|---|---|---|
| Super Admin | 1 | Everything, plus creating and managing the officer logins |
| District Treasurer | 1 | Everything except managing logins |
| Assistant District Treasurer | 2 | Record payments and issue e-receipts, mark reports, add notes, export CSV and Excel files |
| District President | 1 | View everything, add notes, export CSV files |
| District Vice President | 1 | View everything, add notes, export CSV files |

- **First run:** the portal asks you to create the **Super Admin** login.
- The Super Admin creates the other logins under **Users & Access**. Each officer gets a temporary password and must choose their own the first time they sign in.
- Officers are signed out after 30 minutes without activity, and after 12 hours in any case.
- Notes, payments and report marks record **who** added them.

How the logins work depends on whether the portal is connected to Firebase:

| | Connected to Firebase | Browser only (no Firebase config) |
|---|---|---|
| Sign in with | email and password | username and password |
| Works on | any device, same logins everywhere | the browser where the logins were created |
| Forgotten password | **Email me a reset link** on the sign-in page, for every officer | the Super Admin resets officers; the Super Admin uses the **recovery key** shown once at setup |
| Passwords kept by | Firebase Authentication | the browser, as PBKDF2-SHA256 hashes; 5 wrong tries pause sign-in |
| What protects the data | the logins plus the security rules in `firestore.rules`, checked by Google's servers | the logins only, on that browser |

**Browser-only limitation:** without a server, logins protect the portal on the computer and browser where the data is kept. They do not secure data across devices. Someone with technical knowledge and access to that computer could still read the browser's storage. Full backups include the logins (as hashes), so restoring a backup on another computer brings the officers' accounts with it. In Firebase mode, backups hold only the district data.

## On phones: install it like an app

The portal adapts to phone screens:

- a compact header with your initials;
- a bottom tab bar (Home, Clubs, Reports, Payments, More);
- a floating **+** button to record a payment;
- forms that slide up from the bottom of the screen;
- phone-sized lists in place of the wide tables. In Reports you pick a month, then tap each club's status. Payments shows one card per club.

The layout was checked on screens from 320 px wide (iPhone SE, small Android phones) up to large phones. It also works with the phone turned sideways, where it keeps clear of the notch. Tablets and computers get the full desktop layout.

It is also a Progressive Web App (PWA), so it can be added to the home screen and opens full-screen like an app:

- **Android (Chrome/Edge):** tap **Install** on the dashboard card, or **More → Install as app**. You can also use the browser menu → *Install app*.
- **iPhone/iPad (Safari):** **More → Install as app** shows the steps. In short, tap Share, then *Add to Home Screen*.
- **Windows/Mac (Chrome/Edge):** use the install icon in the address bar.

The installed app uses its own **"District Treasury" icon** (`assets/icons/app-icon-*.png`), which shows only on the home screen, in the app switcher and on Android's start-up screen. Inside the portal, the district emblem is used everywhere. A phone that installed an earlier version picks up the new icon automatically on Android (it can take a day). On an iPhone, remove the app from the home screen and add it again.

Once it has been opened, the app also opens offline. Installing as an app only works when the site is served over **https** (for example GitHub Pages) or from `localhost`. It does not work when you open `index.html` directly as a file.

**Connected to Firebase**, every phone shows the same data, and receipt numbers come from one shared counter, so two officers never issue the same number. The header shows **Synced**, **Saving…**, **Offline** or **Not saved**. Offline, the app keeps working from the phone's copy and uploads the changes when the connection is back. A payment recorded offline gets its e-receipt once the phone is online again.

**Without Firebase, each phone keeps its own data**, the same as each browser. Use backups to move data between devices. Receipt numbers are also counted per device. If the DT and the DAT both issue receipts on their own phones, give each phone its own receipt prefix in Settings (for example `LD306D1-DT` and `LD306D1-DAT`) so that two receipts never get the same number.

**Publishing an update:** change the `?v=` number in `index.html` and `sw.js`, and the `CACHE` name in `sw.js`. Phones then download the new files instead of keeping the old ones.

## Running it

It is a plain static site with no build step. Open `index.html` in a browser, or serve the folder with any static server:

```bash
npx http-server . -p 5180 -c-1
```

and open http://localhost:5180.

## Where the data lives

`js/firebase-config.js` decides this.

- **Filled in (Firebase):** the data is kept in the district's **Cloud Firestore** database, and the logins in **Firebase Authentication**. Each device also keeps a copy so the portal opens and works offline. Setup, security rules, bringing in existing data and the free-plan limits are in [FIREBASE-SETUP.md](FIREBASE-SETUP.md).
- **Empty (`apiKey: ''`):** all data is saved in the browser's `localStorage` on the device you use. It is not sent anywhere. Clearing the browser's site data erases the records.

Either way, use **Settings & Backup → Download backup** regularly and keep the file somewhere safe. **Restore from backup** brings it back (into the shared database when connected to Firebase).

To host it for others (for example GitHub Pages, Netlify or Firebase Hosting), upload this folder as it is. With Firebase, add the site's address under **Authentication → Settings → Authorized domains** in the Firebase console.

## Files

```
index.html               page shell, loading screen, header, navigation
css/styles.css           theme (maroon/gold), layout, components
js/core.js               data model, storage, dates, money, status rules, sample data
js/ui.js                 dialogs, drawer, toasts, shared fragments
js/views-*.js            Dashboard, Clubs & Notes (with notices), Treasurer Reports, Payments, Settings
js/views-club.js         club profile page, send-reminder and share messages
js/receipts.js           payment e-receipts (screen, PDF, image, share) and the receipt register
js/files.js              builds .xlsx and .pdf files in the browser (no libraries)
js/auth.js               officer accounts, roles, permissions, sessions (browser-only mode)
js/firebase-config.js    the Firebase project's web config; empty = browser-only mode
js/cloud.js              Firebase mode: email logins, live sync with Cloud Firestore,
                         shared receipt counter, sync status, upload of browser data
js/views-auth.js         sign-in, first-time setup, recovery / reset email, forced password change
js/views-users.js        Users & Access (Super Admin), My account
js/pwa.js                install as an app, offline support, phone "More" menu
js/main.js               router, sign-in gate, loading screen, action wiring
manifest.webmanifest     app name, icons and colours for installing
sw.js                    service worker: caches the app so it opens offline
assets/                  district emblem, Leo lions watermark (gold/maroon), favicon,
                         Lions International and Leo logos for the e-receipt
assets/icons/            installed-app icons from the "District Treasury" logo (192, 512, maskable, Apple 180)
firestore.rules          Firestore security rules by role (publish in the Firebase console)
firebase.json            Firebase CLI settings: rules, optional Firebase Hosting, local emulators
FIREBASE-SETUP.md        step-by-step guide to connecting a Firebase project
```
