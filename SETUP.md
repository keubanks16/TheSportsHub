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
| `APPLE_*` settings | | Paid plans, see [APP_STORE.md](APP_STORE.md) |

Also add an **R2 bucket** binding named `PHOTOS` (chat photos) and a **Cron Trigger** every minute (`* * * * *`). The Worker finds every team on its own; you don't list them.

Coaches are recognized by their sign-in, so they never need the access code.

## 5. Try it

1. Open your app, **Create Account**, **Create a team**.
2. Team tab → **Team settings & branding**: upload a logo, pick colors, **Save**.
3. On another phone (or a private window), create an account and **Join a team** with the code. Approve it on the first phone.
4. Create a second team and switch between them with the **Teams** button.

## Paid plans (Apple in-app purchases)

Each team has its own plan. New teams start on **Free**; the owner upgrades in the iPhone app from **Team → Plan → See plans**, and pays with Apple in-app purchase. The Worker checks the purchase with Apple and turns the plan on within seconds; Apple tells the Worker about renewals, cancellations and refunds. On the website, owners see the plans and are pointed to the iPhone app.

| | Free | Pro ($15/mo or $120/yr) | Elite ($35/mo or $300/yr) |
| --- | --- | --- | --- |
| Scoring, box scores, stats, roster, schedule, practices | ✓ | ✓ | ✓ |
| Team chat and announcements | ✓ (no photos) | ✓ | ✓ |
| Coaches | 1 head + 2 assistants | Unlimited | Unlimited |
| Logo and team colors | | ✓ | ✓ |
| Tournament fees, phone notifications, chat photos, watch links | | ✓ | ✓ |
| Spray charts and scouting, AI roster scanning, AI scouting reports, Swing AI, built-in live video, YouTube uploads | | | ✓ |

Setup (App Store Connect subscriptions, the Worker's `APPLE_*` settings, notifications for Apple) is in **[APP_STORE.md](APP_STORE.md)**.

### Good to know about plans

- **Your own teams:** list them in `COMP_TEAMS` on the Worker **and** give them the plan in the app by opening Firestore → `teams` → your team → add field `plan` (string) = `elite`. Teams can't set this field themselves.
- **Prices:** the iPhone app shows Apple's prices. The website shows `prices` from `HUB_CONFIG` (`index.html`); keep them matching what you set in App Store Connect.
- **No plans at all:** set `billing: false` in `HUB_CONFIG` and `PLANS` = `off` on the Worker; every team gets everything.
- **Downgrades:** nothing is deleted. Locked features hide until the team upgrades again; past photos, fees and spray data come back.
- **Where it's enforced:** the app hides locked features, and the Worker refuses Pro/Elite work (photos, notifications, fee reminders, AI, live video) for teams without the plan. The plan itself can only be changed by the Worker, after checking with Apple.

## Good to know

- **Team codes** are visible to anyone the coach shares them with. Joining only sends a request; a coach must approve every account. If a coach sets "Anyone with the link" under Who can watch, people who have the code can follow games without approval.
- **Data isolation:** every read and write is limited to one team by `firestore.rules`. Test it once after publishing: sign in as a family on Team A and open `?team=<team-b-code>`; you should see "Ask to join", never Team B's games.
- **Home-screen icon:** the installed app uses your icon. The team's logo shows inside the app, and iPhone suggests the team's name when adding to the home screen.
