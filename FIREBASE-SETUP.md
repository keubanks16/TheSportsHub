# The Hub Firebase setup

Configured Firebase project: `the-sports-hub-57584`.

## Already configured in this package
- Web Firebase config in `index.html`
- Firebase Messaging service worker config in `firebase-messaging-sw.js`
- The Hub app icons

## Still required in Firebase Console
1. Enable Authentication providers you want to use.
2. Create Firestore and publish `firestore.rules`.
3. Create/enable Cloud Storage and apply appropriate storage rules before accepting uploads.
4. For web push notifications, generate/use the Web Push certificate (VAPID key) for THIS Firebase project and add it to the app config. The old GS Baseball VAPID key was intentionally removed so this app cannot accidentally register push tokens against the old project.
5. Add the deployed GitHub Pages/custom domain to Firebase Authentication > Settings > Authorized domains if needed.

Do not copy the old Stingerz VAPID key into this project.
