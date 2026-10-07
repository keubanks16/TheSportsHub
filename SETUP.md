# Setup guide (app owner)

You do this once. After that, coaches create and brand their own teams from inside the app.

## 1. Firebase

Your Firebase project is already filled in (`the-sports-hub-57584`). To use a different one, replace `window.GS_FIREBASE` in `index.html` **and** the `firebase.initializeApp({...})` line at the bottom of `firebase-messaging-sw.js`.

In the [Firebase console](https://console.firebase.google.com):

1. **Authentication → Sign-in method:** turn on **Email/Password** and **Anonymous** (Anonymous is for grandparents' watch links).
2. **Authentication → Settings → Authorized domains:** add your app's domain.
3. **Firestore Database:** create it, then **Rules** → paste all of `firestore.rules` → **Publish**.
4. **Storage:** create it, then **Rules** → paste all of `storage.rules` → **Publish**. (Needed for logo uploads.)
5. **Project settings → Cloud Messaging → Web Push certificates → Generate key pair.** Copy the key into `"vapidKey": ""` in `index.html`. Without it, phone notifications stay off.

> The new rules remove the old single-team (root-level) rules. Every team now lives under `teams/{teamId}`. Teams created with the previous build keep working: the first time their owner or a coach opens the team, the app adds the team's public card (name, logo, colors) automatically.

## 2. App settings

At the top of `index.html`, in the **APP SETTINGS** block:

```js
window.HUB_CONFIG = { appName: 'The Hub', workerUrl: '' };
```

- `appName` — your product name (sign-in screen, header, notifications text).
- `workerUrl` — your Cloudflare Worker address (step 4). Once set, every team gets chat photos, notifications, roster scanning, scouting reports and live video with no setup of their own.

Your own logo and icons: replace `media/the-hub-logo.png` and the files in `icons/`, and edit the name in `manifest.webmanifest` and the `<title>` / `apple-mobile-web-app-title` lines in `index.html`. Teams' logos replace yours inside their team.

## 3. Hosting

Any static host works (GitHub Pages, Cloudflare Pages, Netlify). Upload everything in this folder, use HTTPS, and point your domain at it. Each time you deploy, bump `CACHE` in `firebase-messaging-sw.js` so phones pick up the update.

## 4. Cloudflare Worker (one for all teams)

Create a Worker, paste `worker.js`, deploy, then in **Settings → Variables and Secrets** add:

| Name | Type | |
| --- | --- | --- |
| `ALLOWED_ORIGIN` | Text | **Required.** Your app address, e.g. `https://app.yourdomain.com` |
| `FIREBASE_SERVICE_ACCOUNT` | Secret | Firebase → Project settings → Service accounts → Generate new private key; paste the whole file |
| `ACCESS_CODE` | Secret | Any long random passphrase (used inside the Worker) |
| `ANTHROPIC_API_KEY` | Secret | Roster photo scanning and scouting reports |
| `CF_STREAM_TOKEN`, `CF_ACCOUNT_ID` | Secret / Text | Built-in live video (Cloudflare Stream) |
| `APP_NAME` | Text | Optional, your app's name in notifications |
| `REQUIRE_ACTIVE` | Text | Optional, see Billing below |

Also add an **R2 bucket** binding named `PHOTOS` (chat photos) and a **Cron Trigger** every minute (`* * * * *`). The Worker finds every team on its own; you don't list them.

Coaches are recognized by their sign-in, so they never need the access code.

## 5. Try it

1. Open your app, **Create Account**, **Create a team**.
2. Team tab → **Team settings & branding**: upload a logo, pick colors, **Save**.
3. On another phone (or a private window), create an account and **Join a team** with the code. Approve it on the first phone.
4. Create a second team and switch between them with the **Teams** button.

## Billing (before you charge teams)

The app doesn't take payments itself. A simple way to start:

- Charge teams with a payment link (Stripe, Square, etc.).
- When a team pays, open Firestore in the Firebase console → `teams` → that team's document → add the field `active` (boolean) = `true`. Teams can't change this field themselves.
- Set the Worker variable `REQUIRE_ACTIVE` = `1`. Teams without `active: true` can still score, chat and see stats, but AI roster scanning, scouting reports, live video and chat photos are off for them (these are the features that cost you money to run).

## Good to know

- **Team codes** are visible to anyone the coach shares them with. Joining only sends a request; a coach must approve every account. If a coach sets "Anyone with the link" under Who can watch, people who have the code can follow games without approval.
- **Data isolation:** every read and write is limited to one team by `firestore.rules`. Test it once after publishing: sign in as a family on Team A and open `?team=<team-b-code>`; you should see "Ask to join", never Team B's games.
- **Home-screen icon:** the installed app uses your icon. The team's logo shows inside the app, and iPhone suggests the team's name when adding to the home screen.
