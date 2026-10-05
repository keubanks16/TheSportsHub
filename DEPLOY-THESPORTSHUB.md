# The Hub — first deployment

This build is multi-team. New customer data is stored under `teams/{teamId}/...`.

## Important

The included `firestore.rules` intentionally contains **both** the original GS Baseball root rules and the new `teams/{teamId}` rules. Publishing it will not force the existing Stingerz app to move immediately.

The web app still points at the existing Firebase project from the source copy. For production, create a dedicated Firebase project for The Hub and replace `window.GS_FIREBASE` in `index.html` plus the Firebase config in `firebase-messaging-sw.js`. This is recommended before onboarding paying teams.

## Test a team

Open the site with a team slug:

`?team=gs-baseball`

or

`?team=test-bombers-9u`

The selection is remembered on that device. The **Switch team** button changes it.

For a brand-new team, open its slug, create/sign in to an account, and claim the team admin when prompted. Then edit Team settings to set team name, logo URL, primary color and secondary color.

## Firestore layout

Examples:

- `teams/gs-baseball/config/setup`
- `teams/gs-baseball/members/{uid}`
- `teams/gs-baseball/team/main`
- `teams/gs-baseball/games/{gameId}`
- `teams/gs-baseball/messages/{messageId}`
- `teams/test-bombers-9u/...`

## Cloudflare Worker

The browser sends `x-team-id` on Worker requests. The Worker scopes Firestore access to that team.

For scheduled notifications, add a Worker text variable named `TEAM_IDS` containing comma-separated team IDs, for example:

`gs-baseball,test-bombers-9u`

For production, `ALLOWED_ORIGIN` should be the final The Hub site origin.

## Before selling subscriptions

1. Move The Hub to its own Firebase project.
2. Add a proper team directory/onboarding screen instead of relying primarily on team slugs.
3. Add subscription status to team metadata and enforce it server-side.
4. Add logo file upload rather than URL-only branding.
5. Run emulator/security tests proving one team cannot read another team's documents.
6. Move Worker access from one shared `ACCESS_CODE` to per-team server-side configuration.
