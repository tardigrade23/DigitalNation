// Balance simulation: a bot plays the real game code with simulated time.
//
//   python3 -m http.server 8765 &        (from the repository root)
//   node tools/simulate.mjs [days] [sessionsPerDay] [minutesPerSession]
//
// Needs Playwright. The bot:
//   - plays a few short sessions a day; between them the game pays offline income
//     (50%, at most 8 hours), like a real player who checks in now and then
//   - buys whatever pays back fastest (sectors, upgrades), starts the quickest research
//     project whenever the lab is free (projects take real time, also offline),
//     upgrades defense when it is cheap, claims the daily reward once a day
//   - exports technology when it would add at least half its current influence
// Cyber attacks, policies, quizzes and gem purchases are left out (neutral).
import { createRequire } from 'module';

const { chromium } = createRequire(import.meta.url)('playwright'); // works with a global install too (NODE_PATH)

const DAYS = Number(process.argv[2] || 60);
const SESSIONS = Number(process.argv[3] || 4);
const SESSION_MIN = Number(process.argv[4] || 15);
const URL = process.env.GAME_URL || 'http://localhost:8765/';

const browser = await chromium.launch();
const ctx = await browser.newContext({ serviceWorkers: 'block' });
await ctx.route('**/vendor/supabase.js', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } });
const page = await ctx.newPage();
await page.goto(URL);
await page.waitForTimeout(500);

const report = await page.evaluate(({ DAYS, SESSIONS, SESSION_MIN }) => {
  // Stop the game's own timers; the bot drives time.
  for (let i = 1; i < 5000; i++) { clearInterval(i); clearTimeout(i); }
  const G = window.DN.sim;
  // Always read the live state: exporting technology replaces the state object.
  const S = new Proxy({}, { get: (_, k) => window.DN.state[k], set: (_, k, v) => { window.DN.state[k] = v; return true; } });
  const s = S;
  s.coach = { t1: 1, t2: 1, t3: 1, t4: 1 };
  s.settings.sound = false;
  const trace = [];

  const DAY = 86400, STEP = 10;
  let t = 0; // simulated seconds since the start
  const log = [], eras = {}, exports = [];
  const at = () => `day ${(t / DAY).toFixed(1)}`;

  function advance(dt, offline) {
    const m = G.mods();
    let ips = window.DN.incomePerSec(false);
    G.progressResearch(dt); // research runs in real time, also offline
    if (offline) {
      const eff = G.OFFLINE_EFFICIENCY + m.offline;
      dt = Math.min(dt, G.OFFLINE_MAX_SEC);
      G.earn(ips * dt * eff);
      if (G.owned('mbank') > 0 || Object.keys(s.research).length) s.rp += G.rpRate() * dt * eff;
    } else {
      G.earn(ips * dt + G.clickValue() * dt * 0.5); // half a tap per second while playing
      if (G.owned('mbank') > 0 || Object.keys(s.research).length) s.rp += G.rpRate() * dt;
    }
    const target = G.popTarget();
    s.pop = target - (target - s.pop) * Math.exp(-dt * 0.05 * m.popGrowth);
  }

  function shop() {
    for (let guard = 0; guard < 400; guard++) {
      const ips = Math.max(1e-9, window.DN.incomePerSec(false));
      const gm = G.globalMult(false);
      let best = null;
      window.DN.SECTORS.forEach((sec, i) => {
        if (!G.isUnlocked(i)) return;
        const cost = G.costFor(sec, 1);
        const gain = sec.inc * G.sectorMult(sec) * gm;
        const score = cost / gain;
        if (!best || score < best.score) best = { kind: 's', id: sec.id, cost, score };
      });
      for (const u of G.availableUpgrades()) {
        let gain;
        if (u.kind === 'global') gain = ips * (u.mult - 1);
        else if (u.kind === 'sector') { const sec = window.DN.SECTORS.find(x => x.id === u.sector); gain = G.owned(sec.id) * sec.inc * G.sectorMult(sec) * gm * (u.mult - 1); }
        else continue;
        const score = u.cost / Math.max(gain, 1e-9);
        if (!best || score < best.score) best = { kind: 'u', id: u.id, cost: u.cost, score };
      }
      if (!best || best.cost > s.gdp) break;
      if (best.kind === 's') G.buySector(best.id); else G.buyUpgrade(best.id);
    }
    // research: when the lab is free, start the quickest affordable project
    if (!s.researching) {
      const avail = window.DN.RESEARCH.filter(n => G.researchAvailable(n) && s.rp >= n.cost).sort((a, b) => G.researchSeconds(a) - G.researchSeconds(b) || a.cost - b.cost);
      if (avail.length) G.buyResearch(avail[0].id);
    }
    if (s.secLevel < G.SEC_MAX && G.secCost() < window.DN.incomePerSec(false) * 600) G.buySecurity();
    const before = s.era;
    G.checkEra();
    if (s.era > before) { eras[s.era] = (t / DAY).toFixed(1); log.push(`${at()}: reached ${G.ERAS[s.era].name}`); }
  }

  let lastDaily = -1;
  for (let day = 0; day < DAYS; day++) {
    for (let k = 0; k < SESSIONS; k++) {
      const start = day * DAY + (8 + k * (14 / SESSIONS)) * 3600; // sessions spread from 08:00 to 22:00
      if (start > t) { advance(start - t, true); t = start; }
      if (lastDaily !== day) { // daily reward (minutes of income), streak never broken
        const d = (day % 7) + 1;
        G.earn(G.dailyAmount(d));
        lastDaily = day;
      }
      for (let x = 0; x < SESSION_MIN * 60; x += STEP) {
        advance(STEP, false); t += STEP; shop();
        if (day === 0 && k === 0 && x === SESSION_MIN * 60 - STEP) {
          const gm = G.globalMult(false), m = G.mods();
          const ai = window.DN.UPGRADES.filter(u => u.kind === 'global' && s.upgrades[u.id]).reduce((a, u) => a * u.mult, 1);
          trace.push(`  BREAKDOWN global x${gm.toExponential(2)} = AI upgrades x${ai} * welfare x${(1 + G.welfare() / 100).toFixed(2)} * population x${Math.sqrt(s.pop / 1e6).toFixed(2)} * research/policy x${m.income.toFixed(2)} * era x${G.ERAS[G.currentEra()].mult}`);
          for (const sec of window.DN.SECTORS) if (G.owned(sec.id)) trace.push(`    ${sec.id.padEnd(9)} owned ${String(G.owned(sec.id)).padStart(4)}  sectorMult x${G.sectorMult(sec).toExponential(2)}  income/s ${(G.owned(sec.id) * sec.inc * G.sectorMult(sec) * gm).toExponential(2)}`);
        }
        if (day === 0 && k === 0 && x % 60 === 0) trace.push(`  min ${x / 60}: GDP ${s.gdp.toExponential(2)}, GDP/s ${window.DN.incomePerSec(false).toExponential(2)}, facilities ${G.totalOwned()}, RP ${s.rp.toFixed(0)}, RP/s ${G.rpRate().toFixed(2)}, research ${Object.keys(s.research).length}, era ${s.era}`);
      }
      const gain = G.claimableInfluence();
      if (gain >= Math.max(10, s.influence * 0.5)) {
        exports.push(`${at()}: export +${gain} influence (era ${s.era})`);
        log.push(exports[exports.length - 1]);
        G.performPrestige();
        window.DN.state.coach = { t1: 1, t2: 1, t3: 1, t4: 1 };
      }
    }
    if ([0, 1, 2, 4, 6, 9, 13, 20, 29, 44, 59, 89].includes(day)) {
      const cur = window.DN.state;
      log.push(`end of day ${day + 1}: rank #${window.DN.techRank()}, era ${cur.era}, research ${Object.keys(cur.research).length}/42, `
        + `facilities ${G.totalOwned()}, GDP/s ${window.DN.incomePerSec(false).toExponential(2)}, influence ${cur.influence}`);
    }
  }
  return { log, eras, exports: exports.length, trace };
}, { DAYS, SESSIONS, SESSION_MIN });

console.log(`Simulated ${DAYS} days, ${SESSIONS} sessions/day x ${SESSION_MIN} min\n`);
if (process.env.TRACE) console.log('First session, minute by minute:\n' + report.trace.join('\n') + '\n');
console.log(report.log.join('\n'));
console.log('\nEra reached on day:', JSON.stringify(report.eras), '| exports:', report.exports);
await browser.close();
