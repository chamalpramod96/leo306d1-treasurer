# Connecting the portal to Firebase

Without Firebase, the portal keeps all data in the browser it runs in, so each phone or computer has its own copy. Once it is connected to a Firebase project:

- every officer signs in with their **email and password**, on any device;
- clubs, reports, payments, receipts, notes and notices are kept in one shared **Cloud Firestore** database and appear on every device within a second or two;
- receipt numbers come from one shared counter, so the DT and the DATs never issue the same number;
- the portal keeps working with a weak or no connection: changes wait on the device and upload when it is back online.

The whole connection is one file, `js/firebase-config.js`. If its `apiKey` is empty, the portal works on its own as before.

---

## 1. In the Firebase console (once)

1. Go to <https://console.firebase.google.com> → **Add project**. Google Analytics is not needed.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable** (leave "Email link" off) → **Save**.
3. **Build → Firestore Database → Create database**. Pick a location close to Sri Lanka (for example `asia-south1`, Mumbai) and **Start in production mode**. The location cannot be changed later.
4. **Project settings (⚙) → General → Your apps → Web (`</>`)**. Give it a name such as "Treasury Portal". Firebase Hosting is optional. Firebase then shows a `firebaseConfig` block. Keep that page open for step 2.
5. **Authentication → Settings → Authorized domains → Add domain** and add the address the portal is published at, for example `chamalpramod96.github.io`. `localhost` is already on the list.

## 2. Paste the config into the portal

Open `js/firebase-config.js` and copy each value from the `firebaseConfig` block:

```js
window.LEO_FIREBASE = {
  apiKey: 'AIza…',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project',
  storageBucket: 'your-project.firebasestorage.app',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abc123',
};
```

These values are **not secret**. Every Firebase web app sends them to the browser, so it is fine to commit them to GitHub. The data is protected by the officer logins and by the security rules in the next step.

## 3. Publish the security rules

The rules decide who may read and change what. Without them, the production-mode database refuses everything and the portal shows "access refused".

**Firestore Database → Rules**, delete what is there, paste the whole of `firestore.rules`, then **Publish**.

The rules match the portal's roles:

| Role | Can change |
|---|---|
| Super Admin | everything, and the officer logins |
| District Treasurer | everything except the officer logins |
| Assistant District Treasurer | payments, e-receipts, treasurer reports, exemptions, their own notes and notices |
| President, Vice President | their own notes and notices (they can view everything) |

Only signed-in officers whose login is active can read anything. Someone who creates a Firebase account without being added by the Super Admin sees nothing.

Whenever `firestore.rules` changes in a later update, publish it again the same way.

<details>
<summary>Publishing the rules from the command line instead</summary>

```bash
npx firebase-tools login
```

```bash
npx firebase-tools deploy --only firestore:rules --project your-project
```

</details>

## 4. First sign-in: create the Super Admin

Publish the site (or run it locally, see the README) and open it. Because the shared database is new, the portal asks you to **create the Super Admin**: full name, email and password. This can only happen once per project. After that, everyone gets the normal sign-in page.

There is no recovery key in online mode. Anyone who forgets their password, the Super Admin included, uses **Forgot your password? → Email me a reset link** on the sign-in page. The email comes from `noreply@your-project.firebaseapp.com` and may land in spam the first time. You can change its wording and sender name under **Authentication → Templates**.

## 5. Bring in the data you already have

If you already used the portal before connecting it, that data is still in the browser where you entered it.

- **Same browser, same address:** after you sign in as Super Admin, the portal offers **Upload this browser's data?** It shows how many clubs and payments it found. You can also do this later from **Settings & Backup → Online database → Upload this browser's data…**
- **Another browser or another address:** in the old portal, **Settings & Backup → Download backup** *before* connecting it. Then, signed in to the connected portal, use **Restore from backup**. It uploads the backup to the shared database.

Uploading or restoring replaces everything in the shared database for every officer, so do it once, at the start. Backups made in online mode hold the district data but not the logins; the logins live in Firebase.

Receipt numbers carry on from the highest number in the uploaded data.

## 6. Add the other officers

**Users & Access → + Create login** under the role you want, then the officer's name and email. The portal creates the login and shows a temporary password once. Give it to the officer; the first time they sign in they must choose their own password. You stay signed in as the Super Admin while doing this.

- **Send reset email** sends a reset link to an officer instead of a temporary password.
- **Disable** stops an officer from signing in or seeing any data, straight away, on every device. **Enable** lets them back in.
- **Delete** removes the officer from the list. If you add the same email again later, their login comes back and they get a reset email.

There is no need to touch **Authentication → Users** in the Firebase console. The portal manages the logins.

## How it behaves day to day

- The small pill in the header shows **Synced**, **Saving…**, **Offline** or **Not saved**. On phones it is hidden while everything is synced.
- **Offline:** the portal opens from the device's copy and you can keep working. Changes upload by themselves when the connection is back. A payment recorded while offline is saved **without an e-receipt**, because the receipt number has to come from the shared counter. Once online, issue it with the 🧾 **Issue** button on the payment, or with **Issue them now** in **Payments → Receipts**.
- Officers are signed out after 30 minutes without activity, and after 12 hours in any case.
- **Settings & Backup** still has **Download backup**. Download one now and then and keep it somewhere safe.

## Free plan limits

The free **Spark** plan is enough for one district. Cloud Firestore allows about 50,000 document reads, 20,000 writes and 20,000 deletes per day, and 1 GiB of stored data. Opening the portal reads the district's records once, and after that only what changed. A day of normal use by seven officers stays far below these limits. Only **Upload / Restore / Load sample data / Clear all data** use many writes at once. You can see the numbers under **Firestore Database → Usage**.

## Optional: restrict the API key

The `apiKey` only identifies the project, but you can stop other sites from using it. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), choose the project, open **Browser key (auto created by Firebase)**, and under **Application restrictions** pick **Websites** and add:

- `https://chamalpramod96.github.io/*`
- `http://localhost/*` and `http://localhost:5180/*` (for testing on your computer)
- `https://your-project.firebaseapp.com/*` (needed for password-reset links)

Save. It can take a few minutes to apply.

## Switching back to browser-only

Empty the values in `js/firebase-config.js` (keep `apiKey: ''`). The portal goes back to keeping data in each browser, with username logins. The shared data stays in Firebase; download a backup first if you want to bring it back with you.

## Testing on your computer without touching the real data

`firebase.json` sets up the Firebase emulators (Authentication on port 9099, Firestore on port 8080). They need Java 11 or newer. Start them with a demo project, which never touches anything online:

```bash
npx firebase-tools emulators:start --only auth,firestore --project demo-leo306d1
```

Then, only on your computer, change `js/firebase-config.js` to:

```js
window.LEO_FIREBASE = { apiKey: 'demo-key', authDomain: 'demo-leo306d1.firebaseapp.com', projectId: 'demo-leo306d1', useEmulators: true };
```

and open the portal from `localhost`. `useEmulators` is ignored on any other address. Put the real values back before publishing.
