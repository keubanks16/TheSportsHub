// One-time App Store Connect setup, run by .github/workflows/asc-setup.yml with the same API key
// the TestFlight build uses. Reads scripts/asc-setup.json:
//   { "mode": "inspect" | "apply", "slots": 5, "removeEU": true }
// inspect: only reads and reports. apply: creates "Team plans N" groups (N = 2..slots) copied from
// the first group (same plans, levels, prices, names, descriptions, review screenshots, availability)
// and, if removeEU, turns the app off in the 27 EU countries. Safe to re-run: existing things are reused.
// Writes a report to asc-report.md (the workflow commits it back to the branch).
import crypto from 'node:crypto';
import fs from 'node:fs';

const cfg = JSON.parse(fs.readFileSync(new URL('./asc-setup.json', import.meta.url)));
const BUNDLE = 'com.kollinmeubanks.thesportshub';
const EU = ['AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'FRA', 'DEU', 'GRC', 'HUN', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE'];
const APPLY = cfg.mode === 'apply';
const out = [];
const log = (s) => { console.log(s); out.push(s); };
let calls = 0;

// ---------- API ----------
let JWT = null;
function token() {
  if (JWT && JWT.exp > Date.now() + 60000) return JWT.t;
  const now = Math.floor(Date.now() / 1000);
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b({ alg: 'ES256', kid: process.env.ASC_KEY_ID, typ: 'JWT' });
  const body = b({ iss: process.env.ASC_ISSUER_ID, iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' });
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key: fs.readFileSync(process.env.ASC_KEY_PATH), dsaEncoding: 'ieee-p1363' }).toString('base64url');
  JWT = { t: head + '.' + body + '.' + sig, exp: Date.now() + 1000 * 1000 };
  return JWT.t;
}
async function api(method, path, body) {
  for (let i = 0; ; i++) {
    calls++;
    const r = await fetch('https://api.appstoreconnect.apple.com' + path, { method, headers: { Authorization: 'Bearer ' + token(), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 429 && i < 8) { await new Promise((ok) => setTimeout(ok, 15000 * (i + 1))); continue; }
    // Apple's API sometimes answers 5xx for a moment; reads are safe to repeat.
    if (r.status >= 500 && method === 'GET' && i < 5) { await new Promise((ok) => setTimeout(ok, 5000 * (i + 1))); continue; }
    const text = await r.text();
    const d = text ? JSON.parse(text) : {};
    if (!r.ok) { const e = new Error(method + ' ' + path.split('?')[0] + ' -> ' + r.status + ': ' + (d.errors || []).map((x) => x.detail || x.title).join('; ')); e.status = r.status; throw e; }
    return d;
  }
}
async function all(path) {
  let next = path, data = [], included = [];
  while (next) {
    const d = await api('GET', next);
    data = data.concat(d.data || []); included = included.concat(d.included || []);
    next = d.links && d.links.next ? d.links.next.replace('https://api.appstoreconnect.apple.com', '') : null;
  }
  return { data, included };
}
const rel = (type, id) => ({ data: { type, id } });

// ---------- Read the first group ----------
async function main() {
  log('# App Store Connect setup report\n');
  log('Mode: **' + (APPLY ? 'apply' : 'inspect (nothing changed)') + '**, team slots: ' + cfg.slots + ', remove EU: ' + !!cfg.removeEU + '\n');
  const app = (await api('GET', '/v1/apps?filter[bundleId]=' + BUNDLE)).data[0];
  if (!app) throw new Error('No app with bundle ID ' + BUNDLE);
  log('- App: ' + app.attributes.name + ' (' + app.id + ')');

  const groups = (await all('/v1/apps/' + app.id + '/subscriptionGroups?limit=50')).data;
  const info = [];
  for (const g of groups) {
    const subs = (await all('/v1/subscriptionGroups/' + g.id + '/subscriptions?limit=50')).data;
    info.push({ g, subs });
    log('- Group "' + g.attributes.referenceName + '": ' + subs.map((s) => s.attributes.productId + ' [' + s.attributes.state + ', level ' + s.attributes.groupLevel + ']').join(', '));
  }
  if (cfg.mode === 'verify') {
    log('\n## Every plan');
    log('| Product | State | Sold in | US price | Name | Review screenshot |\n| --- | --- | --- | --- | --- | --- |');
    for (const { subs } of info) for (const s of subs) {
      let where = '?', usd = '-', shot = 'no', name = '-';
      try { const a = await api('GET', '/v1/subscriptions/' + s.id + '/subscriptionAvailability?include=availableTerritories&limit[availableTerritories]=50'); const t = (a.data.relationships.availableTerritories.data || []).map((x) => x.id); where = t.length > 5 ? t.length + ' countries' : t.join(', ') || 'none'; } catch (e) { where = 'not set'; }
      try { const p = await all('/v1/subscriptions/' + s.id + '/prices?filter[territory]=USA&include=subscriptionPricePoint&limit=50'); const pp = p.included.find((x) => x.type === 'subscriptionPricePoints'); if (pp) usd = '$' + pp.attributes.customerPrice; } catch (e) { /* none */ }
      try { if ((await api('GET', '/v1/subscriptions/' + s.id + '/appStoreReviewScreenshot')).data) shot = 'yes'; } catch (e) { /* none */ }
      try { name = (await all('/v1/subscriptions/' + s.id + '/subscriptionLocalizations?limit=50')).data.map((l) => l.attributes.name).join(', ') || '-'; } catch (e) { /* none */ }
      log('| ' + s.attributes.productId + ' | ' + s.attributes.state + ' | ' + where + ' | ' + usd + ' | ' + name + ' | ' + shot + ' |');
    }
    log('\nAPI calls: ' + calls);
    return;
  }
  const first = info.find((x) => x.subs.some((s) => s.attributes.productId === BUNDLE + '.pro.monthly'));
  if (!first) throw new Error('Could not find the first group (with ' + BUNDLE + '.pro.monthly)');

  const groupLocs = (await all('/v1/subscriptionGroups/' + first.g.id + '/subscriptionGroupLocalizations?limit=50')).data;
  log('- First group display names: ' + groupLocs.map((l) => l.attributes.locale + ' "' + l.attributes.name + '"').join(', '));
  const src = [];
  for (const s of first.subs) {
    const locs = (await all('/v1/subscriptions/' + s.id + '/subscriptionLocalizations?limit=50')).data;
    const prices = await all('/v1/subscriptions/' + s.id + '/prices?filter[territory]=USA&include=subscriptionPricePoint&limit=50');
    const pp = prices.included.find((x) => x.type === 'subscriptionPricePoints');
    let shot = null;
    try { shot = (await api('GET', '/v1/subscriptions/' + s.id + '/appStoreReviewScreenshot')).data; } catch (e) { /* none */ }
    const x = { s, locs, usd: pp ? pp.attributes.customerPrice : null, shot };
    src.push(x);
    log('  - ' + s.attributes.productId + ': "' + s.attributes.name + '", ' + s.attributes.subscriptionPeriod + ', US ' + (x.usd ? '$' + x.usd : 'no price') + ', ' + locs.map((l) => l.attributes.locale + ' "' + l.attributes.name + '"').join(', ') + ', review screenshot: ' + (shot ? 'yes' : 'NO'));
  }

  const territories = (await all('/v1/territories?limit=200')).data.map((t) => t.id);
  const sellIn = Array.isArray(cfg.only) ? territories.filter((t) => cfg.only.includes(t)) : territories.filter((t) => !cfg.removeEU || !EU.includes(t));
  // Where a plan is sold (POST replaces the plan's list of countries).
  const setSubAvail = async (sid, label) => {
    try { await api('POST', '/v1/subscriptionAvailabilities', { data: { type: 'subscriptionAvailabilities', attributes: { availableInNewTerritories: false }, relationships: { subscription: rel('subscriptions', sid), availableTerritories: { data: sellIn.map((t) => ({ type: 'territories', id: t })) } } } }); return true; }
    catch (e) { log('  - ' + label + ' availability: ' + e.message); return false; }
  };
  if (APPLY && Array.isArray(cfg.only)) {
    let ok = 0;
    for (const x of src) if (await setSubAvail(x.s.id, x.s.attributes.productId)) ok++;
    log('- first group: ' + ok + ' of ' + src.length + ' plans set to sell only in ' + sellIn.join(', '));
  }
  log('- Territories: ' + territories.length + ' total, plans will be sold in ' + sellIn.length);

  // ---------- Create the other team slots ----------
  for (let n = 2; n <= cfg.slots; n++) {
    log('\n## Team plans ' + n);
    let grp = info.find((x) => x.g.attributes.referenceName === 'Team plans ' + n);
    if (!grp) {
      if (!APPLY) { log('- would create group "Team plans ' + n + '" with ' + src.length + ' plans'); continue; }
      const g = (await api('POST', '/v1/subscriptionGroups', { data: { type: 'subscriptionGroups', attributes: { referenceName: 'Team plans ' + n }, relationships: { app: rel('apps', app.id) } } })).data;
      grp = { g, subs: [] };
      log('- created group ' + g.id);
    } else log('- group exists (' + grp.g.id + ')');
    if (!APPLY) continue;
    const haveGL = (await all('/v1/subscriptionGroups/' + grp.g.id + '/subscriptionGroupLocalizations?limit=50')).data.map((l) => l.attributes.locale);
    for (const l of groupLocs) {
      if (haveGL.includes(l.attributes.locale)) continue;
      await api('POST', '/v1/subscriptionGroupLocalizations', { data: { type: 'subscriptionGroupLocalizations', attributes: { locale: l.attributes.locale, name: (l.attributes.name + ' (team ' + n + ')').slice(0, 75), customAppName: l.attributes.customAppName || undefined }, relationships: { subscriptionGroup: rel('subscriptionGroups', grp.g.id) } } });
    }

    for (const x of src) {
      const a = x.s.attributes;
      const pid = BUNDLE + '.team' + n + a.productId.slice(BUNDLE.length);
      let sub = grp.subs.find((s) => s.attributes.productId === pid);
      if (!sub) {
        sub = (await api('POST', '/v1/subscriptions', { data: { type: 'subscriptions', attributes: { name: ('Team ' + n + ' ' + a.name).slice(0, 64), productId: pid, subscriptionPeriod: a.subscriptionPeriod, groupLevel: a.groupLevel, familySharable: false, reviewNote: a.reviewNote || 'Same plan as ' + a.productId + ', for a coach\'s ' + n + 'th team (one subscription per team).' }, relationships: { group: rel('subscriptionGroups', grp.g.id) } } })).data;
        log('- created ' + pid);
      } else log('- ' + pid + ' exists');
      const sid = sub.id;

      const haveL = (await all('/v1/subscriptions/' + sid + '/subscriptionLocalizations?limit=50')).data.map((l) => l.attributes.locale);
      for (const l of x.locs) {
        if (haveL.includes(l.attributes.locale)) continue;
        await api('POST', '/v1/subscriptionLocalizations', { data: { type: 'subscriptionLocalizations', attributes: { locale: l.attributes.locale, name: (l.attributes.name + ' · Team ' + n).slice(0, 35), description: l.attributes.description || undefined }, relationships: { subscription: rel('subscriptions', sid) } } });
      }

      await setSubAvail(sid, pid);

      if (x.usd) try {
        const pts = (await all('/v1/subscriptions/' + sid + '/pricePoints?filter[territory]=USA&limit=200')).data;
        const usPt = pts.find((p) => Number(p.attributes.customerPrice) === Number(x.usd));
        if (!usPt) log('  - no US price point at $' + x.usd);
        else {
          const have = new Set((await all('/v1/subscriptions/' + sid + '/prices?include=territory&limit=200')).data.map((p) => p.relationships && p.relationships.territory && p.relationships.territory.data && p.relationships.territory.data.id).filter(Boolean));
          const eq = await all('/v1/subscriptionPricePoints/' + usPt.id + '/equalizations?include=territory&limit=200');
          const want = [{ id: usPt.id, t: 'USA' }].concat(eq.data.map((p) => ({ id: p.id, t: p.relationships.territory.data.id })));
          let made = 0, failed = 0;
          for (const w of want) {
            if (have.has(w.t) || !sellIn.includes(w.t)) continue;
            try { await api('POST', '/v1/subscriptionPrices', { data: { type: 'subscriptionPrices', attributes: { preserveCurrentPrice: false }, relationships: { subscription: rel('subscriptions', sid), subscriptionPricePoint: rel('subscriptionPricePoints', w.id), territory: rel('territories', w.t) } } }); made++; }
            catch (e) { failed++; if (failed < 3) log('  - price ' + w.t + ': ' + e.message); }
          }
          log('  - prices: US $' + x.usd + ', ' + made + ' territories added' + (failed ? ', ' + failed + ' failed' : ''));
        }
      } catch (e) { log('  - prices not finished (re-run to retry): ' + e.message); }

      if (x.shot && x.shot.attributes && x.shot.attributes.imageAsset) {
        let has = null;
        try { has = (await api('GET', '/v1/subscriptions/' + sid + '/appStoreReviewScreenshot')).data; } catch (e) { /* none */ }
        if (!has) {
          const ia = x.shot.attributes.imageAsset;
          const url = ia.templateUrl.replace('{w}', ia.width).replace('{h}', ia.height).replace('{f}', 'png');
          const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
          const res = (await api('POST', '/v1/subscriptionAppStoreReviewScreenshots', { data: { type: 'subscriptionAppStoreReviewScreenshots', attributes: { fileName: 'plans-team' + n + '.png', fileSize: bytes.length }, relationships: { subscription: rel('subscriptions', sid) } } })).data;
          for (const op of res.attributes.uploadOperations || []) {
            const h = {}; for (const rh of op.requestHeaders || []) h[rh.name] = rh.value;
            const pr = await fetch(op.url, { method: op.method, headers: h, body: bytes.subarray(op.offset, op.offset + op.length) });
            if (!pr.ok) throw new Error('screenshot upload ' + pr.status);
          }
          await api('PATCH', '/v1/subscriptionAppStoreReviewScreenshots/' + res.id, { data: { type: 'subscriptionAppStoreReviewScreenshots', id: res.id, attributes: { uploaded: true, sourceFileChecksum: crypto.createHash('md5').update(bytes).digest('hex') } } });
          log('  - review screenshot copied');
        }
      } else log('  - no review screenshot to copy (add one by hand)');
    }
  }

  // ---------- Take the app out of the EU ----------
  if (cfg.removeEU || Array.isArray(cfg.only)) {
    log('\n## App availability');
    let av = null;
    // The app's availability record shares the app's id.
    for (const p of ['/v2/appAvailabilities/' + app.id, '/v1/apps/' + app.id + '/appAvailabilityV2']) {
      try { av = (await api('GET', p)).data; break; } catch (e) { log('- ' + e.message); }
    }
    if (av) {
      const ta = await all('/v2/appAvailabilities/' + av.id + '/territoryAvailabilities?include=territory&limit=200');
      const tid = (t) => t.relationships.territory.data.id;
      const keep = (t) => (Array.isArray(cfg.only) ? cfg.only.includes(tid(t)) : !EU.includes(tid(t)));
      const on = ta.data.filter((t) => t.attributes.available && !keep(t));
      const turnOn = ta.data.filter((t) => !t.attributes.available && keep(t));
      log('- countries to turn off: ' + on.length + ', to turn on: ' + (turnOn.map(tid).join(', ') || 'none'));
      if (APPLY) {
        let done = 0;
        for (const t of on) {
          try { await api('PATCH', '/v1/territoryAvailabilities/' + t.id, { data: { type: 'territoryAvailabilities', id: t.id, attributes: { available: false } } }); done++; }
          catch (e) { log('  - ' + tid(t) + ': ' + e.message); }
        }
        for (const t of turnOn) {
          try { await api('PATCH', '/v1/territoryAvailabilities/' + t.id, { data: { type: 'territoryAvailabilities', id: t.id, attributes: { available: true } } }); }
          catch (e) { log('  - ' + tid(t) + ': ' + e.message); }
        }
        log('- turned off in ' + done + ' countries' + (turnOn.length ? ', turned on in ' + turnOn.map(tid).join(', ') : ''));
        const now = (await all('/v2/appAvailabilities/' + av.id + '/territoryAvailabilities?include=territory&limit=200')).data.filter((t) => t.attributes.available).map(tid);
        log('- app is now available in: ' + (now.length > 10 ? now.length + ' countries' : now.join(', ')));
      }
    }
  }
  log('\nAPI calls: ' + calls);
}

main().catch((e) => { log('\n**Stopped with an error:** ' + e.message); process.exitCode = 1; })
  .finally(() => fs.writeFileSync('asc-report.md', out.join('\n') + '\n'));
