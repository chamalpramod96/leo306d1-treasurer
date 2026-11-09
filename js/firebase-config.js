/* =========================================================
   firebase-config.js — connects the portal to the district's Firebase project
   ---------------------------------------------------------
   apiKey empty  → the portal keeps everything in this browser only.
   Filled in     → officers sign in with email + password and all data is shared
                   online through Cloud Firestore. See FIREBASE-SETUP.md.

   Copy the values from Firebase console → Project settings (⚙) → General →
   "Your apps" → the web app → "SDK setup and configuration" → Config.
   They are not secret (every Firebase web app sends them to the browser):
   the data is protected by the officer logins and by firestore.rules.
   ========================================================= */
window.LEO_FIREBASE = {
  apiKey: 'AIzaSyBQmQLeueKDK61wBhzmBMGgZ5DJQsddn-w',
  authDomain: 'leo306d1-treasury.firebaseapp.com',
  projectId: 'leo306d1-treasury',
  storageBucket: 'leo306d1-treasury.firebasestorage.app',
  messagingSenderId: '586155902508',
  appId: '1:586155902508:web:b47e94b22f8e2ab3507389',
};
