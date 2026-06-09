# JN-APP

WhatsApp Order Label Manager — paste customer details, print 4x4 shipping labels.

## Live app

**https://mnafeel.github.io/JN-APP/**

If pincode or phone numbers do not show after an update, hard-refresh the page:

- **Mac:** `Cmd + Shift + R`
- **Windows:** `Ctrl + Shift + R`

## Firebase setup (cloud database)

**`firebase-config.js` is configured** for Firebase project `jn-app-53d59` (`enabled: true`). Push to GitHub Pages to use cloud sync on the live site.

Orders sync to **Firebase Firestore** when configured. Without Firebase, the app still works with **local browser storage**.

### 1. Create a Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/)
2. Create a project (or use an existing one)
3. Add a **Web app** and copy the config values

### 2. Enable Firestore

1. Firebase console → **Build → Firestore Database**
2. Click **Create database**
3. Start in **test mode** for quick setup (change rules later for production)

### 3. Add your config

1. Copy `firebase-config.example.js` to `firebase-config.js` (already exists)
2. Paste your Firebase keys and set `enabled: true`:

```js
window.firebaseConfig = {
  enabled: true,
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
  measurementId: "...", // optional, for Analytics
};
```

### 4. Firestore rules (development)

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

> For production, add Firebase Authentication and restrict read/write to signed-in users.

### 5. Deploy to GitHub Pages

Commit `firebase-config.js` with your keys (Firebase web keys are public) or set them only on your deployed copy, then push to GitHub.

### Data stored in Firestore

| Path | Content |
|------|---------|
| `orders/{orderId}` | Each saved order |
| `settings/fromAddress` | Sender address settings |

Existing local orders are uploaded automatically the first time Firebase connects.

## Local use

Open `index.html` in your browser.
