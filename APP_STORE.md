# The Hub on the App Store

This repo now builds The Hub as an iPhone app (Capacitor) and sells Pro and Elite with **Apple in-app purchases**. Stripe is gone.

How it fits together:

- **The app** is the same `index.html`, bundled into a native iPhone app. Inside the app it uses native phone notifications (Apple → Firebase) and StoreKit purchases.
- **Plans** are bought by the team owner in the iPhone app. Each team gets its own private purchase token, so Apple's renewals, upgrades, cancellations and refunds always land on the right team. The Worker checks every purchase with Apple's App Store Server API before it changes a team's plan.
- **The website** still works for everyone. Paid features work on the web for any team that has a plan; owners just upgrade from the iPhone app.
- **Builds** run on a GitHub-hosted Mac (`.github/workflows/ios-testflight.yml`) and upload straight to TestFlight, so you don't need a Mac.

Bundle ID used everywhere below: **`com.kollinmeubanks.thesportshub`** (change it in `capacitor.config.json` before the first build if you want a different one; it can't change after the app is created).

---

## 1. Apple Developer account

1. Enroll at [developer.apple.com/programs](https://developer.apple.com/programs/) ($99/year). Approval can take a day or two.
2. Note your **Team ID**: developer.apple.com → Account → Membership details.
3. **Certificates, Identifiers & Profiles → Identifiers → +** → App IDs → App:
   - Bundle ID (explicit): `com.kollinmeubanks.thesportshub`
   - Capabilities: tick **Push Notifications** (In-App Purchase is on by default).
4. **Keys → +**: name it "APNs", tick **Apple Push Notifications service (APNs)**, download the `.p8` and note its Key ID. (Firebase needs this in step 3.)
5. **Devices → +**: register one iPhone (yours) by its UDID. Xcode's automatic signing needs at least one device on the team before it will sign a build, even for the App Store. To find the UDID: on a Mac, plug the iPhone in and click its serial number in Finder; or on the iPhone, open udid.tech in Safari and follow its steps.
6. App Store Connect → **Business**: sign the Paid Apps agreement and add banking and tax info. Purchases don't work, even in testing, until this is active.

## 2. App Store Connect app record

[appstoreconnect.apple.com](https://appstoreconnect.apple.com) → Apps → **+ New App**: iOS, name "The Hub" (or another name if that's taken), primary language English, bundle ID from step 1, SKU `thesportshub`.

### Subscriptions

Your app → **Monetization → Subscriptions**:

1. Create a subscription group named **Team plans**.
2. Add four subscriptions in that group, using exactly these product IDs:

| Reference name | Product ID | Duration | Price |
| --- | --- | --- | --- |
| Elite Yearly | `com.kollinmeubanks.thesportshub.elite.yearly` | 1 year | $300 |
| Elite Monthly | `com.kollinmeubanks.thesportshub.elite.monthly` | 1 month | $34.99 |
| Pro Yearly | `com.kollinmeubanks.thesportshub.pro.yearly` | 1 year | $119.99 |
| Pro Monthly | `com.kollinmeubanks.thesportshub.pro.monthly` | 1 month | $14.99 |

   Apple keeps 15–30% of each sale (15% if you join the App Store Small Business Program, which you should). If you pick other prices, also update `prices` in `HUB_CONFIG` in `index.html` (only the website shows those numbers; the app shows Apple's).
3. **Order the levels**: drag Elite (both) above Pro (both) in the group so Apple treats Pro → Elite as an upgrade.
4. For each one, add a display name and description (localization), and a review screenshot (a screenshot of the Plans screen is fine).
5. In the group's settings, turn on **Billing Grace Period** (recommended): teams keep their plan while Apple retries a failed card.

### More teams per Apple ID (team slots)

Apple lets one Apple ID hold one subscription per group, so each extra team a coach pays for needs its own group. The app uses the first group that Apple ID isn't already paying in; a team's upgrades and switches stay in its own group.

For team 2, create a group named **Team plans 2** with the same four plans, same prices and same level order, using these product IDs (for team 3, 4 and 5 change `team2` to `team3`, `team4`, `team5`):

| Reference name | Product ID |
| --- | --- |
| Team 2 Elite Yearly | `com.kollinmeubanks.thesportshub.team2.elite.yearly` |
| Team 2 Elite Monthly | `com.kollinmeubanks.thesportshub.team2.elite.monthly` |
| Team 2 Pro Yearly | `com.kollinmeubanks.thesportshub.team2.pro.yearly` |
| Team 2 Pro Monthly | `com.kollinmeubanks.thesportshub.team2.pro.monthly` |

Use display names like "Pro (Yearly) – second team" so coaches can tell them apart in their Apple subscriptions. Groups you haven't created yet are simply skipped, and the Worker covers 5 teams per Apple ID unless you set `APPLE_TEAM_SLOTS` (up to 10). Each new group needs metadata and a review screenshot, and goes to App Review with an app version like the first one.

### Keys for the Worker and the build

App Store Connect → **Users and Access → Integrations**:

- **In-App Purchase** keys → **+** → download the `.p8`, note the **Key ID** and the **Issuer ID** at the top. The Worker uses this to check purchases.
- **App Store Connect API** (Team Keys) → **+** → access **Admin** → download the `.p8`, note the **Key ID** and **Issuer ID**. The GitHub build uses this to sign and upload. (Admin is needed so Xcode can manage the signing certificate in the cloud.)

### Server notifications

Your app → **App Information → App Store Server Notifications**: for both **Production** and **Sandbox** enter
`https://thesportshub.kollinmeubanks.workers.dev/apple-notifications` and choose **Version 2**.

## 3. Firebase (phone notifications in the app)

Firebase console → project **the-sports-hub-57584**:

1. **Project settings → General → Add app → iOS**. Bundle ID `com.kollinmeubanks.thesportshub`. Download **GoogleService-Info.plist**. (Skip the "add SDK" steps; the build does that.)
2. **Project settings → Cloud Messaging → Apple app configuration → APNs Authentication Key → Upload** the APNs `.p8` from step 1.4, with its Key ID and your Team ID.
3. **Firestore → Rules**: paste the latest `firestore.rules` and **Publish** (it now allows the app's notification tokens).

## 4. Worker (Cloudflare)

Paste the latest `worker.js` and **Deploy**, then in **Settings → Variables and Secrets**:

| Name | Type | Value |
| --- | --- | --- |
| `APPLE_BUNDLE_ID` | Text | `com.kollinmeubanks.thesportshub` |
| `APPLE_ISSUER_ID` | Text | Issuer ID of the **In-App Purchase** key |
| `APPLE_KEY_ID` | Text | Key ID of the **In-App Purchase** key |
| `APPLE_PRIVATE_KEY` | Secret | the whole In-App Purchase `.p8` file, including the BEGIN/END lines |
| `ALLOWED_ORIGIN` | Text | add `capacitor://localhost` to what's there, comma separated (that's the iPhone app's address) |

Delete the old `STRIPE_*` variables. Optional: `APPLE_SANDBOX` = `off` once you're live if you don't want TestFlight purchases to turn plans on (keep it on until App Review approves the app; reviewers buy in sandbox).

## 5. App settings in `index.html`

In the `HUB_CONFIG` block:

- `siteUrl`: the website address where The Hub is hosted (e.g. `https://app.yourdomain.com`). Join links and watch links shared from the iPhone app point here.
- `iosAppUrl`: after the app is live, its App Store link, so the website can point owners to it.
- `privacy.html` and `terms.html`: replace `support@example.com` with your support email, read them over, and make sure they're hosted on the website (they deploy with everything else). Their web addresses go into App Store Connect.

## 6. GitHub secrets and the first build

GitHub → TheSportsHub → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
| --- | --- |
| `APPLE_TEAM_ID` | your Team ID |
| `ASC_KEY_ID` | Key ID of the **App Store Connect API** key |
| `ASC_ISSUER_ID` | its Issuer ID |
| `ASC_KEY_P8` | open that `.p8` file in a text editor (Notepad, TextEdit) and paste all of it, BEGIN and END lines included |
| `GOOGLE_SERVICE_INFO_PLIST` | open `GoogleService-Info.plist` in a text editor and paste all of it |

Then start a build: push the code you want to ship to the `ios-release` branch, or, once this workflow is on the main branch, **Actions → "iOS: build and upload to TestFlight" → Run workflow**. It takes about 15–25 minutes. The build shows up in App Store Connect → TestFlight shortly after.

Each run uploads a new build number automatically. Bump `version` in `package.json` (or type a version when you run the workflow) for each App Store release.

## 7. Test on your iPhone (TestFlight)

1. App Store Connect → TestFlight → add yourself as an internal tester; install **TestFlight** on your iPhone and accept the invite.
2. Purchases in TestFlight builds are free test purchases on your normal Apple ID, and subscriptions renew fast (a month lasts a few minutes, a year about an hour), so you can watch renewals and cancellations happen.
3. In the app: sign in, open a team you own → **Team → Plan → See plans** → buy Pro. The plan badge should change within a few seconds. Try **Restore purchases**, **Manage subscription**, upgrading to Elite, and turning notifications on.

## 8. Submit for review

Your app → the version page (1.0):

- **Screenshots**: 6.9" iPhone (1320 × 2868) — at least 3. Record them from the Stingerz 8U demo team. The app is set to iPhone only, so iPad screenshots aren't needed.
- **Description, keywords, support URL, privacy policy URL** (your hosted `privacy.html`). Suggested listing text is below.
- **In-App Purchases and Subscriptions**: attach all four subscriptions to this version (they're reviewed with the first version).
- **App Privacy**: Contact info (email, name), User content (messages, photos, other content), Identifiers (user ID, device ID for notifications), Purchases. Used for app functionality; linked to the user; not used for tracking.
- **Age rating**: answer the questionnaire; the chat with user content makes it 12+ or so depending on answers.
- **App Review information**: a demo account (email + password) that's the **owner** of a demo team with sample games, so the reviewer can see the plans screen. Use the notes below.
- **Build**: pick the TestFlight build → **Add for Review → Submit**.

Review usually takes 1–3 days.

### Suggested App Review notes

> The Hub is a team app for youth baseball and softball: live scoring, stats, schedules, team chat and coaching tools. Demo account (team owner): [email] / [password]. Open Team → Plan to see the subscriptions. Plans are per team and bought only with in-app purchase; Free covers scoring, stats, roster and chat. Accounts can be deleted from Teams → Delete account. Tournament fee tracking records payments families make to their own team (Venmo/Cash App) for real-world tournament entry; no digital goods are sold that way.

### Suggested listing

**Subtitle:** Scores, stats and team chat

**Description:**
> The Hub is your baseball or softball team's own app. Score games pitch by pitch, and every family follows along live. Box scores and season stats build themselves. Keep the roster, schedule, practices and team chat in one place.
>
> FREE: pitch-by-pitch scoring and live scores, box scores and season stats, roster, schedule and practices, team chat and announcements, Instincts and Defense Drills.
>
> PRO: your logo and team colors, unlimited coaches, phone notifications for scores and chat, photos in chat, tournament fee tracking, watch links for grandparents.
>
> ELITE: Swing AI that breaks down every swing frame by frame, spray charts and opponent scouting, AI roster scanning and scouting reports, built-in live video.
>
> Plans are per team, monthly or yearly, and cover everyone on the team.

**Keywords:** baseball,softball,scorebook,stats,team,youth,coach,live score,little league,travel ball

---

## Good to know

- **One plan per Apple ID.** Apple only lets one Apple ID hold one subscription from a group at a time. A coach who owns two teams can pay for one with their Apple ID; the second needs a different Apple ID (for example an assistant's), or ask and the plan can be changed to cover every team its owner runs.
- **Your own teams:** `COMP_TEAMS` on the Worker still gives listed teams Elite for free.
- **Android:** this doesn't build an Android app. Google Play would need its own billing (Google Play Billing) added later.
- **YouTube uploads** are set up and run from the website; Google doesn't allow its sign-in inside apps.
- **Updating the app:** website-only changes (anything in `index.html`) go live on the web right away, but the iPhone app only gets them when you run the workflow and submit a new version.
- **Building on a Mac instead:** `npm run ios:setup` (with `native/ios/GoogleService-Info.plist` in place), then `npx cap open ios` and use Xcode's Product → Archive.
