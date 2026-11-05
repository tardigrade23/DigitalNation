'use strict';

/* =========================================================
 * Digital Nation — idle nation simulator (prototype)
 * ========================================================= */

const SAVE_KEY = 'digitalnation_save_v1';
const COST_GROWTH = 1.15;
const MILESTONES = [25, 50, 100, 200, 300, 400];
const OFFLINE_MAX_SEC = 8 * 3600;
const OFFLINE_EFFICIENCY = 0.5;
const PRESTIGE_DIVISOR = 1e9;      // influence = floor(25 * log10(runEarned / 1e9)): grows with every order of magnitude
const INFLUENCE_BONUS = 0.05;      // +5% income per influence point
const BOOST_DURATION = 120e3;
const BOOST_COOLDOWN = 300e3;
const ATTACK_WINDOW = 12e3;
const DEBUFF_DURATION = 30e3;
const SEC_MAX = 7;
const DEFAULT_NATION = 'Digital Nation';
const DEFAULT_PLAYER = { name: 'Leader', avatar: 'ai', tone: 'gold', flag: 0 };
const DEFAULT_SETTINGS = { sound: true, vibration: true, analytics: null }; // analytics: null until the player answers
const DEFAULT_DAILY = { streak: 0, last: '', best: 0 };
const DEFAULT_POLICIES = { tax: 1, net: 1, edu: 1, trade: 1 };
const START_GEMS = 25;
const SAVE_VERSION = 2; // 2: 24 sectors, 42 research, 7 eras, encyclopedia

// c1/c2: icon tile gradient
// era: the era in which the sector becomes available (see ERAS).
const SECTORS = [
  // Era I · Connected
  { id: 'isp',      era: 0, name: 'Internet Provider',    base: 15,     inc: 0.5,   c1: '#5AB8FF', c2: '#2563C9' },
  { id: 'egov',     era: 0, name: 'E-Government',         base: 120,    inc: 2.8,     c1: '#7FD1C7', c2: '#1F8A7E' },
  { id: 'mbank',    era: 0, name: 'Mobile Banking',       base: 960,   inc: 15,    c1: '#FFB86B', c2: '#D9681C' },
  { id: 'fiber',    era: 0, name: 'Fiber Backbone',       base: 7700,   inc: 83,    c1: '#9BE7FF', c2: '#1B8DB8' },
  { id: 'fintech',  era: 0, name: 'Fintech Hub',          base: 61000,   inc: 460,   c1: '#6EE29C', c2: '#1E9A5A' },
  { id: 'dc',       era: 0, name: 'Data Center',          base: 4.9e5,  inc: 2500,   c1: '#8FA3FF', c2: '#3B4FCF' },
  // Era II · Information
  { id: 'digid',    era: 1, name: 'Digital ID',           base: 3.9e6,    inc: 14000,  c1: '#FFD27A', c2: '#B9770E' },
  { id: 'g5',       era: 1, name: '5G Network',           base: 3.1e7,  inc: 76000,  c1: '#FF8FAB', c2: '#C23A63' },
  { id: 'opendata', era: 1, name: 'Open Data Portal',     base: 2.5e8,    inc: 4.2e5,  c1: '#A7F3D0', c2: '#0F8F6B' },
  // Era III · Platform
  { id: 'cloud',    era: 2, name: 'Cloud Platform',       base: 2e9,  inc: 2.3e6,  c1: '#BAE6FD', c2: '#3A7BD5' },
  { id: 'pay',      era: 2, name: 'Instant Payments',     base: 1.6e10,    inc: 1.3e7,  c1: '#FDE68A', c2: '#D97706' },
  { id: 'ehealth',  era: 2, name: 'E-Health',             base: 1.3e11,  inc: 7e7,  c1: '#FFA8B8', c2: '#D23B5E' },
  // Era IV · Smart
  { id: 'iot',      era: 3, name: 'IoT Network',          base: 1e12,  inc: 3.8e8,   c1: '#99F6E4', c2: '#0E9384' },
  { id: 'smart',    era: 3, name: 'Smart City',           base: 8.2e12,    inc: 2.1e9, c1: '#F7C75B', c2: '#C7800F' },
  { id: 'edu',      era: 3, name: 'E-Education',          base: 6.6e13,  inc: 1.2e10,   c1: '#C4B5FD', c2: '#6D4AD6' },
  // Era V · AI
  { id: 'ai',       era: 4, name: 'AI Lab',               base: 5.3e14,    inc: 6.4e10, c1: '#C29BFF', c2: '#6A3FD6' },
  { id: 'robotics', era: 4, name: 'Robotics',             base: 4.2e15,   inc: 3.5e11, c1: '#CBD5E1', c2: '#566683' },
  { id: 'auto',     era: 4, name: 'Autonomous Transport', base: 3.4e16,   inc: 1.9e12, c1: '#93C5FD', c2: '#2457C5' },
  // Era VI · Quantum
  { id: 'chip',     era: 5, name: 'Semiconductor Fab',    base: 2.7e17, inc: 1.1e13, c1: '#FCD34D', c2: '#8A6A12' },
  { id: 'quantum',  era: 5, name: 'Quantum Computing',    base: 2.2e18, inc: 5.8e13, c1: '#5EF0E0', c2: '#138A9C' },
  { id: 'biotech',  era: 5, name: 'Biotech Lab',          base: 1.7e19, inc: 3.2e14, c1: '#86EFAC', c2: '#1F8A4C' },
  // Era VII · Space
  { id: 'space',    era: 6, name: 'Satellite Internet',   base: 1.4e20,   inc: 1.8e15, c1: '#B5C3D9', c2: '#4A5A75' },
  { id: 'fusion',   era: 6, name: 'Fusion Power',         base: 1.1e21, inc: 9.7e15,   c1: '#FDBA74', c2: '#C2410C' },
  { id: 'agency',   era: 6, name: 'Space Agency',         base: 8.9e21,   inc: 5.3e16,   c1: '#A5B4FC', c2: '#3730A3' },
];

const UPGRADES = [];
(function buildUpgrades() {
  const tiers = [
    { req: 25,  costMul: 200, mult: 2, label: 'Optimization' },
    { req: 75,  costMul: 2e4, mult: 2, label: 'Automation' },
    { req: 150, costMul: 2e6, mult: 3, label: 'AI Integration' },
  ];
  for (const s of SECTORS) {
    tiers.forEach((t, i) => UPGRADES.push({
      id: `${s.id}_${i}`, kind: 'sector', sector: s.id, mult: t.mult,
      icon: s.id, c1: s.c1, c2: s.c2, tag: 'Sector',
      name: `${s.name} ${t.label}`,
      desc: `${s.name} income ×${t.mult}`,
      cost: s.base * t.costMul,
      unlocked: () => owned(s.id) >= t.req,
    }));
  }
  const ai = [
    ['AI Assistant',                 1.5, 1e6,  1e5],
    ['Government AI',                2,   1e10, 1e9],
    ['Neural Cloud',                 2,   1e14, 1e13],
    ['National Language Model',      3,   1e18, 1e17],
    ['Artificial General Intelligence', 5, 1e22, 1e21],
  ];
  ai.forEach(([name, mult, cost, need], i) => UPGRADES.push({
    id: `ai_${i}`, kind: 'global', mult, cost, name, icon: 'ai', c1: '#C29BFF', c2: '#6A3FD6', tag: 'AI',
    desc: `All income ×${mult}`,
    unlocked: () => state.runEarned >= need,
  }));
  UPGRADES.push(
    { id: 'click_0', kind: 'click', mult: 3,  cost: 200, name: 'Online Tax System',        desc: 'Tap power ×3',  icon: 'coin', c1: '#F7C75B', c2: '#C7800F', tag: 'Tax', unlocked: () => state.clicks >= 10 },
    { id: 'click_1', kind: 'click', mult: 5,  cost: 2e5, name: 'Blockchain Tax Registry',  desc: 'Tap power ×5',  icon: 'coin', c1: '#F7C75B', c2: '#C7800F', tag: 'Tax', unlocked: () => state.runEarned >= 5e4 },
    { id: 'click_2', kind: 'click', mult: 10, cost: 2e9, name: 'Digital Citizen ID',       desc: 'Tap power ×10', icon: 'coin', c1: '#F7C75B', c2: '#C7800F', tag: 'Tax', unlocked: () => state.runEarned >= 5e8 },
  );
  UPGRADES.sort((a, b) => a.cost - b.cost);
})();

/* ---------------- State ---------------- */

function defaultState() {
  const now = Date.now();
  return {
    nation: DEFAULT_NATION,
    gdp: 0, runEarned: 0, lifeEarned: 0,
    sectors: {}, upgrades: {},
    pop: 1e6, secLevel: 0,
    influence: 0, prestiges: 0,
    clicks: 0, attacksRepelled: 0, attacksLost: 0,
    boostUntil: 0, boostReadyAt: 0, debuffUntil: 0,
    attack: null, nextAttack: now + 90e3,
    startedAt: now, lastSave: now,
    player: { ...DEFAULT_PLAYER }, achievements: {},
    settings: { ...DEFAULT_SETTINGS }, daily: { ...DEFAULT_DAILY }, coach: {},
    rp: 0, research: {}, policies: { ...DEFAULT_POLICIES }, policyChangedAt: {}, era: 0,
    policyChanges: 0, gamesWon: 0,
    gems: START_GEMS, vipUntil: 0, shieldUntil: 0, owned: { golden: false, flags: [], tones: [] }, adGems: { day: '', n: 0 },
    v: SAVE_VERSION, library: {}, quiz: {}, warps: { day: '', n: 0 }, simBuys: { day: '', n: 0 },
  };
}

let state = loadGame();
let buyAmt = 1;
let screen = 'nation';

function owned(id) { return state.sectors[id] || 0; }
function totalOwned() { return SECTORS.reduce((a, s) => a + owned(s.id), 0); }

/* ---------------- Economy ---------------- */

function sectorMult(s) {
  let m = 1;
  const n = owned(s.id);
  for (const ms of MILESTONES) if (n >= ms) m *= 2;
  for (const u of UPGRADES) if (u.kind === 'sector' && u.sector === s.id && state.upgrades[u.id]) m *= u.mult;
  return m;
}

function welfare() {
  const score = totalOwned() + owned('smart') * 5 + owned('egov') * 0.5;
  const w = 100 * (1 - Math.exp(-score / 200)) + mods().welfare;
  return Math.max(0, Math.min(100, w));
}

function popTarget() { return 1e6 * (1 + totalOwned() * 0.015) * (1 + welfare() / 100); }

function globalMult(withTemp) {
  let m = 1;
  for (const u of UPGRADES) if (u.kind === 'global' && state.upgrades[u.id]) m *= u.mult;
  m *= 1 + welfare() / 100;
  m *= Math.pow(state.pop / 1e6, 0.35);
  m *= 1 + state.influence * INFLUENCE_BONUS;
  m *= mods().income * ERAS[currentEra()].mult;
  if (state.owned.golden) m *= 2;
  if (withTemp) {
    const now = Date.now();
    if (now < state.boostUntil) m *= 2;
    if (now < state.debuffUntil) m *= 0.5;
  }
  return m;
}

function sectorIncome(s) { return owned(s.id) * s.inc * sectorMult(s) * globalMult(true); }

function incomePerSec(withTemp = true) {
  let base = 0;
  for (const s of SECTORS) base += owned(s.id) * s.inc * sectorMult(s);
  return base * globalMult(withTemp);
}

function clickValue() {
  let m = 1;
  for (const u of UPGRADES) if (u.kind === 'click' && state.upgrades[u.id]) m *= u.mult;
  return m * mods().tap + incomePerSec() * 0.05;
}

function earn(x) { state.gdp += x; state.runEarned += x; state.lifeEarned += x; }

function costFor(s, n) {
  const r = COST_GROWTH;
  return s.base * mods().cost * Math.pow(r, owned(s.id)) * (Math.pow(r, n) - 1) / (r - 1);
}

function maxAffordable(s) {
  const r = COST_GROWTH;
  const c0 = s.base * mods().cost * Math.pow(r, owned(s.id));
  return Math.max(0, Math.floor(Math.log(state.gdp * (r - 1) / c0 + 1) / Math.log(r)));
}

function purchaseCount(s) { return buyAmt === 'max' ? Math.max(1, maxAffordable(s)) : buyAmt; }

function eraAllows(s) { return (s.era || 0) <= currentEra(); }
function isUnlocked(i) { return owned(SECTORS[i].id) > 0 || (eraAllows(SECTORS[i]) && (i === 0 || owned(SECTORS[i - 1].id) > 0)); }

function buySector(id) {
  const i = SECTORS.findIndex(s => s.id === id);
  const s = SECTORS[i];
  if (!s || !isUnlocked(i)) return;
  const n = purchaseCount(s);
  const cost = costFor(s, n);
  if (state.gdp < cost) return;
  const before = owned(id);
  state.gdp -= cost;
  state.sectors[id] = before + n;
  discover(id);
  Sound.play('buy'); buzz(12);
  if (before === 0) track('sector_first', { id, min: minutesPlayed() });
  if (before === 0) toast(`${s.name} is online · new encyclopedia entry`, s.id, s);
  const hit = MILESTONES.filter(m => before < m && before + n >= m).pop();
  if (hit) toast(`${s.name} reached ${hit}: income ×2`, s.id, s);
}

function buyUpgrade(id) {
  const u = UPGRADES.find(x => x.id === id);
  if (!u || state.upgrades[id] || !u.unlocked() || state.gdp < u.cost) return;
  state.gdp -= u.cost;
  state.upgrades[id] = true;
  Sound.play('upgrade'); buzz([12, 40, 12]);
  toast(`${u.name} activated`, u.icon, u);
}

/* ---------------- Cybersecurity ---------------- */

function secCost() { return 2000 * Math.pow(10, state.secLevel); }
function secChance() { return Math.max(0.05, Math.min(0.95, 0.25 + state.secLevel * 0.1 + mods().defense)); }
function attackWindow() { return ATTACK_WINDOW + mods().window * 1000; }

function buySecurity() {
  if (state.secLevel >= SEC_MAX || state.gdp < secCost()) return;
  state.gdp -= secCost();
  state.secLevel++;
  Sound.play('upgrade'); buzz([12, 40, 12]);
  toast(`Defense upgraded to level ${state.secLevel}`, 'shield-check', 'green');
}

function scheduleAttack(now) { state.nextAttack = now + (90 + Math.random() * 60) * 1000; }

function repelAttack() {
  if (!state.attack) return;
  const reward = Math.max(80, incomePerSec(false) * 30);
  earn(reward);
  state.attack = null;
  state.attacksRepelled++;
  scheduleAttack(Date.now());
  track('attack', { result: 'defended' });
  Sound.play('defend'); buzz(20);
  toast(`Attack stopped. Reward: ${money(reward)}`, 'shield-check', 'green');
}

function resolveAttack(now) {
  state.attack = null;
  const tried = !!game;
  if (game) closeGame();
  if (Math.random() < secChance()) {
    track('attack', { result: 'auto_blocked', tried });
    state.attacksRepelled++;
    Sound.play('defend');
    toast('Auto-defense blocked the attack', 'shield-check', 'green');
  } else {
    const stolen = state.gdp * 0.1 * mods().breach;
    state.gdp -= stolen;
    state.debuffUntil = now + DEBUFF_DURATION;
    state.attacksLost++;
    track('attack', { result: 'breach', tried });
    Sound.play('breach'); buzz(300);
    toast(`Breach! Hackers stole ${money(stolen)}`, 'alert', 'bad');
  }
  scheduleAttack(now);
}

function updateAttack(now) {
  if (!state.attack && now < state.shieldUntil) { if (now >= state.nextAttack) scheduleAttack(now); return; }
  if (state.attack) {
    if (now >= state.attack.endsAt) resolveAttack(now);
  } else if (now >= state.nextAttack) {
    if (incomePerSec(false) >= 5) { state.attack = { endsAt: now + attackWindow(), len: attackWindow() }; Sound.play('alarm'); buzz([180, 80, 180]); }
    else scheduleAttack(now);
  }
}

/* ---------------- Boost (rewarded ad placeholder) ---------------- */

function activateBoost() {
  const now = Date.now();
  if (now < state.boostReadyAt) return;
  state.boostUntil = now + BOOST_DURATION;
  state.boostReadyAt = now + BOOST_COOLDOWN;
  Sound.play('buy');
  toast('2× income for 2 minutes', 'bolt', 'gold');
}

/* ---------------- Prestige: technology export ---------------- */

function claimableInfluence() { return state.runEarned < PRESTIGE_DIVISOR ? 0 : Math.floor(25 * Math.log10(state.runEarned / PRESTIGE_DIVISOR) * mods().influence); }

function doPrestige() {
  const gain = claimableInfluence();
  if (gain < 1) return;
  showModal('Export technology?',
    `You will gain ${gain} Influence.\nGDP, sectors, upgrades and defense will reset.`,
    { icon: 'globe', tone: 'violet', okText: 'Export', onOk: performPrestige });
}

function performPrestige() {
  const gain = claimableInfluence();
  if (gain < 1) return;
  track('export', { gain, era: currentEra(), hours: Math.round(minutesPlayed() / 60) });
  const keep = {
    nation: state.nation, lifeEarned: state.lifeEarned,
    influence: state.influence + gain, prestiges: state.prestiges + 1,
    clicks: state.clicks, attacksRepelled: state.attacksRepelled, attacksLost: state.attacksLost,
    startedAt: state.startedAt, player: state.player, achievements: state.achievements,
    settings: state.settings, daily: state.daily, coach: state.coach,
    research: state.research, policies: state.policies, era: state.era,
    policyChanges: state.policyChanges, gamesWon: state.gamesWon,
    gems: state.gems, vipUntil: state.vipUntil, shieldUntil: state.shieldUntil, owned: state.owned, adGems: state.adGems,
    v: state.v, library: state.library, quiz: state.quiz, warps: state.warps, simBuys: state.simBuys, pendingEarns: state.pendingEarns,
    researching: state.researching,
  };
  state = Object.assign(defaultState(), keep);
  sectorSig = ''; upgSig = '';
  saveGame();
  Sound.play('reward');
  showModal('Technology exported', `+${gain} Influence. All income is now +${Math.round(state.influence * INFLUENCE_BONUS * 100)}%.`, { icon: 'globe', tone: 'violet' });
}

/* ---------------- Rank ---------------- */

// Tech Index: the world ranking weighs the whole nation, not just money.
const TECH_INDEX_TOP = 720; // score needed for #1
function techIndex() {
  const parts = [
    { label: 'Economy', detail: `${money(state.lifeEarned)} lifetime GDP`, pts: 10 * Math.log10(Math.max(1, state.lifeEarned)), max: 200 },
    { label: 'Research', detail: `${researchCount()} of ${RESEARCH.length} projects`, pts: 5 * researchCount(), max: 5 * RESEARCH.length },
    { label: 'Era', detail: ERAS[currentEra()].name, pts: 25 * currentEra(), max: 25 * (ERAS.length - 1) },
    { label: 'Welfare', detail: `${Math.round(welfare())}%`, pts: 0.4 * welfare(), max: 40 },
    { label: 'Security', detail: `Defense level ${state.secLevel}`, pts: 4 * state.secLevel, max: 4 * SEC_MAX },
    { label: 'Influence', detail: `${state.influence} points`, pts: 25 * Math.log10(1 + state.influence), max: 100 },
  ];
  parts.forEach(p => { p.pts = Math.min(p.max, p.pts); });
  return { parts, score: parts.reduce((a, p) => a + p.pts, 0) };
}
function techRank() {
  const r = 195 - Math.floor((techIndex().score / TECH_INDEX_TOP) * 194);
  return Math.max(1, Math.min(195, r));
}
function showTechIndex() {
  const { parts, score } = techIndex();
  const lines = parts.map(p => `${p.label}: ${Math.round(p.pts)} / ${p.max} · ${p.detail}`).join('\n');
  showModal(`Tech Index ${Math.round(score)} · #${techRank()}`, `The world ranking looks at your whole nation:\n\n${lines}\n\n${Math.round(TECH_INDEX_TOP)} points takes you to #1.\n\nSee how you compare with real players in Govern → Leaders.`, { icon: 'trophy', tone: 'gold' });
}

function rankTitle(r) {
  if (r === 1) return "World's most advanced digital nation";
  if (r <= 10) return 'Digital superpower';
  if (r <= 40) return 'Global tech leader';
  if (r <= 90) return 'Regional tech hub';
  if (r <= 150) return 'Digitizing state';
  return 'Analog state';
}

function nextGoal() {
  for (const s of SECTORS) {
    if (owned(s.id)) continue;
    if (!eraAllows(s)) break;
    return { text: `Unlock ${s.name}`, cost: s.base * mods().cost };
  }
  let best = null;
  for (const s of SECTORS) {
    const m = MILESTONES.find(x => owned(s.id) < x);
    if (!m) continue;
    const cost = costFor(s, m - owned(s.id));
    if (!best || cost < best.cost) best = { text: `${m} ${s.name} for ×2 income`, cost };
  }
  return best || { text: 'Every milestone reached', cost: 0 };
}

/* ---------------- Formatting ---------------- */

const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
function fmt(n) {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) return n < 100 && n % 1 !== 0 ? n.toFixed(1) : String(Math.floor(n));
  const i = Math.floor(Math.log10(n) / 3);
  if (i >= SUFFIX.length) return n.toExponential(2);
  return (n / Math.pow(1000, i)).toFixed(2) + SUFFIX[i];
}
function money(n) { return '$' + fmt(n); }
function dur(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/* ---------------- Save / load ---------------- */

function saveGame() {
  state.lastSave = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
}

function loadGame() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { saved = null; }
  return normalizeSave(saved);
}

// Fills in fields that older saves (local or cloud) do not have yet.
function normalizeSave(saved) {
  const s = saved && typeof saved === 'object' ? Object.assign(defaultState(), saved) : defaultState();
  if (s.nation === 'Rəqəmsal Respublika' || s.nation === 'Digital Republic') s.nation = DEFAULT_NATION; // older defaults
  s.player = Object.assign({ ...DEFAULT_PLAYER }, saved && saved.player);
  if (!s.achievements || typeof s.achievements !== 'object') s.achievements = {};
  s.settings = Object.assign({ ...DEFAULT_SETTINGS }, saved && saved.settings);
  s.daily = Object.assign({ ...DEFAULT_DAILY }, saved && saved.daily);
  s.policies = Object.assign({ ...DEFAULT_POLICIES }, saved && saved.policies);
  if (!s.research || typeof s.research !== 'object') s.research = {};
  s.owned = Object.assign({ golden: false, flags: [], tones: [] }, saved && saved.owned);
  // Saves from before gems existed get gems for the achievements they already earned.
  if (saved && saved.gems === undefined) s.gems = START_GEMS + 10 * Object.keys(s.achievements).length;
  for (const k of ['library', 'quiz']) if (!s[k] || typeof s[k] !== 'object') s[k] = {};
  if (!Array.isArray(s.pendingEarns)) s.pendingEarns = [];
  if (!s.researching || typeof s.researching !== 'object') s.researching = null;
  if (saved && !saved.v) s.v = 1;
  // Players from before the tutorial existed skip it.
  if (!saved || typeof saved.coach !== 'object' || !saved.coach) s.coach = saved ? { t1: 1, t2: 1, t3: 1, t4: 1 } : {};
  return s;
}

function applyOffline() {
  const now = Date.now();
  const elapsed = Math.min(isVip() ? 24 * 3600 : OFFLINE_MAX_SEC, (now - state.lastSave) / 1000);
  state.attack = null;
  state.nextAttack = Math.max(state.nextAttack, now + 60e3);
  if (elapsed < 30) return;
  const target = popTarget();
  state.pop = target - (target - state.pop) * Math.exp(-elapsed * 0.05);
  if (researchUnlocked()) state.rp += rpRate() * elapsed * OFFLINE_EFFICIENCY;
  progressResearch(Math.max(0, (now - state.lastSave) / 1000)); // projects run at full speed offline
  const gain = incomePerSec(false) * elapsed * (isVip() ? 1 : OFFLINE_EFFICIENCY + mods().offline);
  if (gain <= 0) return;
  earn(gain);
  showModal('Welcome back', `Your nation earned ${money(gain)} while you were away for ${dur(elapsed * 1000)}.`, { icon: 'moon', tone: 'cyan' });
}

/* ---------------- UI helpers ---------------- */

const $ = id => document.getElementById(id);
const icon = (id, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const TONES = { gold: 'tile-gold', cyan: 'tile-cyan', rose: 'tile-rose', violet: 'tile-violet', green: 'tile-green', bad: 'tile-bad' };
function tile(iconId, tone, extra = '') {
  if (tone && typeof tone === 'object') return `<span class="tile ${extra}" style="--c1:${tone.c1};--c2:${tone.c2}">${icon(iconId)}</span>`;
  return `<span class="tile ${TONES[tone] || ''} ${extra}">${icon(iconId)}</span>`;
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function toast(text, iconId = 'bolt', tone = 'gold') {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${tile(iconId, tone)}<span>${esc(text)}</span>`;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 2600);
  while ($('toasts').children.length > 2) $('toasts').firstChild.remove();
}

// opts: { icon, tone, okText, onOk(value), input: initialValue }. With onOk a Cancel button appears.
let modalOnOk = null;
function showModal(title, text, opts = {}) {
  const mi = $('modalIcon');
  mi.className = `tile tile-lg modal-icon ${TONES[opts.tone || 'gold']}`;
  mi.innerHTML = icon(opts.icon || 'globe');
  $('modalTitle').textContent = title;
  $('modalText').textContent = text;
  const input = $('modalInput');
  input.hidden = opts.input === undefined;
  if (!input.hidden) input.value = opts.input;
  $('modalCancel').hidden = !opts.onOk;
  $('modalCancel').textContent = opts.cancelText || 'Cancel';
  $('modalOk').textContent = opts.okText || 'Continue';
  modalOnOk = opts.onOk || null;
  modalOnCancel = opts.onCancel || null;
  $('modal').hidden = false;
  updateCoach();
  if (!input.hidden) input.focus();
}

let modalOnCancel = null;
function closeModal(confirmed) {
  const fn = confirmed ? modalOnOk : modalOnCancel;
  const value = $('modalInput').value;
  modalOnOk = null;
  modalOnCancel = null;
  $('modal').hidden = true;
  if (fn) fn(value);
  if (!overlayOpen()) nextOverlay();
}

/* ---------------- Skyline (canvas) ---------------- */

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function rng(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SLOTS = 24;
const SLOT_ORDER = (() => {
  const r = rng(42), a = [...Array(SLOTS).keys()];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  // keep the first building near the centre
  const mid = a.indexOf(Math.floor(SLOTS / 2)); [a[0], a[mid]] = [a[mid], a[0]];
  return a;
})();

function drawSkyline() {
  const cv = $('skyline');
  if (!cv || screen !== 'nation') return;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const t = Date.now();
  const total = totalOwned();
  const tier = SECTORS.filter(s => owned(s.id) > 0).length;
  const has = id => owned(id) > 0;

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#071222'); sky.addColorStop(0.7, '#123150'); sky.addColorStop(1, '#1D4466');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  // aurora (quantum)
  if (has('quantum')) {
    const a = ctx.createLinearGradient(0, H * 0.1, W, H * 0.4);
    a.addColorStop(0, 'rgba(94,240,224,0)'); a.addColorStop(0.5, 'rgba(94,240,224,.18)'); a.addColorStop(1, 'rgba(155,140,255,0)');
    ctx.fillStyle = a;
    ctx.beginPath(); ctx.moveTo(0, H * 0.35);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, H * 0.22 + Math.sin(x / 50 + t / 3000) * 12);
    ctx.lineTo(W, H * 0.45); ctx.lineTo(0, H * 0.5); ctx.fill();
  }

  // stars
  const sr = rng(7);
  for (let i = 0; i < 46; i++) {
    const x = sr() * W, y = sr() * H * 0.55, base = 0.25 + sr() * 0.6, ph = sr() * 6.28;
    const a = reduceMotion ? base : base * (0.55 + 0.45 * Math.sin(t / 900 + ph));
    ctx.fillStyle = `rgba(232,238,246,${a.toFixed(2)})`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }

  // moon
  ctx.fillStyle = 'rgba(245,226,170,.9)';
  ctx.beginPath(); ctx.arc(W * 0.86, H * 0.2, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0B1A2E';
  ctx.beginPath(); ctx.arc(W * 0.86 + 5, H * 0.2 - 3, 10, 0, Math.PI * 2); ctx.fill();

  // satellite (space)
  if (has('space')) {
    const sx = (reduceMotion ? 0.3 : ((t / 40000) % 1.2) - 0.1) * W, sy = H * 0.14;
    ctx.fillStyle = '#B5C3D9'; ctx.fillRect(sx - 3, sy - 2, 6, 4);
    ctx.fillStyle = '#4CC9F0'; ctx.fillRect(sx - 12, sy - 1.5, 8, 3); ctx.fillRect(sx + 4, sy - 1.5, 8, 3);
  }

  // far skyline
  const fr = rng(99);
  ctx.fillStyle = '#132A43';
  for (let x = 0; x < W;) {
    const w = 12 + fr() * 22, h = H * (0.14 + fr() * 0.16);
    ctx.fillRect(x, H - h, w - 1, h); x += w;
  }

  // main buildings
  const slotW = W / SLOTS;
  const litP = 0.12 + (welfare() / 100) * 0.6;
  let tallest = null;
  const buildings = [];
  SLOT_ORDER.forEach((slot, k) => {
    const need = Math.floor(k * k * 0.6);
    if (total < need) return;
    const br = rng(1000 + slot);
    const w = slotW * (0.75 + br() * 0.55);
    const x = slot * slotW + (slotW - w) / 2;
    const growth = Math.min(1, (total - need) / 120);
    const h = Math.min(H * 0.8, H * (0.16 + br() * 0.22 + growth * 0.22 + tier * 0.02));
    const shade = 30 + Math.floor(br() * 14);
    buildings.push({ slot, x, w, h, br, shade });
    if (!tallest || h > tallest.h) tallest = { x, w, h };
  });
  buildings.sort((a, b) => a.h - b.h).reverse();
  for (const b of buildings.reverse()) {
    const y = H - b.h;
    ctx.fillStyle = `rgb(${b.shade - 8},${b.shade + 12},${b.shade + 34})`;
    ctx.fillRect(b.x, y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.fillRect(b.x, y, 2, b.h);
    // windows
    const cols = Math.max(1, Math.floor((b.w - 4) / 5)), rows = Math.floor((b.h - 8) / 7);
    const ox = b.x + (b.w - cols * 5 + 2) / 2;
    const cyanWin = has('ai') && b.slot % 3 === 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wr = rng(b.slot * 7919 + r * 131 + c)();
        if (wr > litP) continue;
        ctx.fillStyle = cyanWin ? 'rgba(127,216,245,.85)' : (wr < litP * 0.3 ? 'rgba(255,214,120,.95)' : 'rgba(245,184,65,.6)');
        ctx.fillRect(ox + c * 5, y + 6 + r * 7, 3, 3);
      }
    }
  }

  // 5G mast with blinking light
  if (has('g5') && tallest) {
    const mx = tallest.x + tallest.w / 2, my = H - tallest.h;
    ctx.strokeStyle = '#8C9CB1'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx, my - 18); ctx.stroke();
    const on = reduceMotion || Math.floor(t / 600) % 2 === 0;
    ctx.fillStyle = on ? '#FF5D6E' : 'rgba(255,93,110,.3)';
    ctx.beginPath(); ctx.arc(mx, my - 19, 2.2, 0, Math.PI * 2); ctx.fill();
  }

  // AI dome
  if (has('ai')) {
    const dx = W * 0.18, dr = 16;
    const glow = ctx.createRadialGradient(dx, H, 2, dx, H, dr * 2.2);
    glow.addColorStop(0, 'rgba(194,155,255,.5)'); glow.addColorStop(1, 'rgba(194,155,255,0)');
    ctx.fillStyle = glow; ctx.fillRect(dx - dr * 2.2, H - dr * 2.2, dr * 4.4, dr * 2.2);
    ctx.fillStyle = '#3B2A78';
    ctx.beginPath(); ctx.arc(dx, H - 4, dr, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#C29BFF'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(dx, H - 4, dr, Math.PI, 0); ctx.stroke();
  }

  // ground
  ctx.fillStyle = '#0A1522'; ctx.fillRect(0, H - 5, W, 5);
  ctx.fillStyle = 'rgba(245,184,65,.35)'; ctx.fillRect(0, H - 5, W, 1);
}

/* ---------------- Rendering ---------------- */

let sectorSig = '';
function buildSectors() {
  // Every available or owned sector, plus the first locked one as a teaser.
  const visible = [];
  let teaser = false;
  for (let i = 0; i < SECTORS.length; i++) {
    if (isUnlocked(i)) visible.push(i);
    else if (!teaser) { visible.push(i); teaser = true; }
  }
  const sig = visible.map(i => `${i}:${isUnlocked(i)}`).join(',') + `|${currentEra()}`;
  if (sig === sectorSig) return;
  sectorSig = sig;
  $('sectors').innerHTML = visible.map(i => {
    const s = SECTORS[i];
    if (!isUnlocked(i)) {
      return `<div class="row locked">${tile('lock', null, 'tile-locked')}
        <div class="row-title"><span class="nm">${s.name}</span></div>
        <button class="buy" disabled>Locked<small>${money(s.base)}</small></button>
        <div class="row-sub">${eraAllows(s) ? `Build one ${SECTORS[i - 1].name} to unlock` : `Arrives in the ${ERAS[s.era].name} (Era ${ROMAN[s.era]})`}</div></div>`;
    }
    return `<div class="row" data-id="${s.id}">
      ${tile(s.id, s)}
      <div class="row-title"><span class="nm">${s.name}</span><span class="count" data-f="owned"></span>${infoBtn(s.id)}</div>
      <button class="buy" data-buy="${s.id}"><span data-f="label"></span><small data-f="cost"></small></button>
      <div class="row-sub"><span data-f="meta"></span><span class="meter"><i data-f="prog"></i></span></div>
    </div>`;
  }).join('');
}

function renderSectors() {
  buildSectors();
  for (const row of $('sectors').querySelectorAll('.row[data-id]')) {
    const s = SECTORS.find(x => x.id === row.dataset.id);
    const n = owned(s.id);
    const count = purchaseCount(s);
    const cost = costFor(s, count);
    const f = k => row.querySelector(`[data-f="${k}"]`);
    f('owned').textContent = n;
    f('label').textContent = `Build ×${count}`;
    f('cost').textContent = money(cost);
    const next = MILESTONES.find(m => n < m);
    const prev = [...MILESTONES].reverse().find(m => n >= m) || 0;
    f('meta').textContent = `${money(sectorIncome(s))}/s` + (next ? ` · ×2 at ${next}` : ' · maxed');
    f('prog').style.width = next ? `${((n - prev) / (next - prev)) * 100}%` : '100%';
    const btn = row.querySelector('.buy');
    const can = state.gdp >= cost;
    btn.disabled = !can;
    btn.classList.toggle('can', can);
  }
}

function availableUpgrades() { return UPGRADES.filter(u => !state.upgrades[u.id] && u.unlocked()); }

let upgSig = '';
function renderUpgrades(list) {
  const shown = list.slice(0, 12);
  const sig = shown.map(u => `${u.id}:${state.gdp >= u.cost ? 1 : 0}`).join(',');
  if (sig === upgSig) return;
  upgSig = sig;
  $('upgrades').innerHTML = shown.length ? shown.map(u => {
    const can = state.gdp >= u.cost;
    return `<div class="row">
      ${tile(u.icon, u)}
      <div class="row-title"><span class="nm">${u.name}</span></div>
      <button class="buy ${can ? 'can' : ''}" data-upg="${u.id}" ${can ? '' : 'disabled'}>Buy<small>${money(u.cost)}</small></button>
      <div class="row-sub"><span><span class="kind">${u.tag}</span> · ${u.desc}</span></div>
    </div>`;
  }).join('') : `<div class="empty">${icon('up')}<span>No upgrades yet. Grow your sectors to unlock more.</span></div>`;
}

function renderSecurity(now) {
  $('secLevelBig').textContent = state.secLevel;
  $('secChance').textContent = `${Math.round(secChance() * 100)}%`;
  $('secBar').style.width = `${secChance() * 100}%`;
  $('secLevel').textContent = `${state.secLevel} / ${SEC_MAX}`;
  $('nextAttack').textContent = state.attack ? 'Now!' : (incomePerSec(false) < 5 ? 'Not a target yet' : `in ${dur(state.nextAttack - now)}`);
  $('attacksWon').textContent = state.attacksRepelled;
  $('attacksLost').textContent = state.attacksLost;
  const sb = $('buySec');
  if (state.secLevel >= SEC_MAX) { sb.textContent = 'Maximum defense'; sb.disabled = true; }
  else { sb.textContent = `Upgrade defense · ${money(secCost())}`; sb.disabled = state.gdp < secCost(); }
}

function renderGlobal(now) {
  renderEra();
  for (const b of $('govTabs').children) b.classList.toggle('on', b.dataset.gov === govTab);
  for (const k of ['policies', 'research', 'export', 'leaders']) $(`gov-${k}`).hidden = k !== govTab;
  if (govTab === 'policies') renderPolicies(now);
  if (govTab === 'research') renderResearch();
  if (govTab === 'leaders') renderLeaderboard();
  const claim = claimableInfluence();
  $('runEarned').textContent = money(state.runEarned);
  $('claimable').textContent = `+${claim}`;
  $('inflBonus').textContent = `+${Math.round(state.influence * INFLUENCE_BONUS * 100)}%`;
  $('countries').textContent = Math.min(194, state.influence);
  $('prestige').disabled = claim < 1;
}

function renderStats(now) {
  const rows = [
    ['Lifetime GDP', money(state.lifeEarned)],
    ['Facilities built', totalOwned()],
    ['Income multiplier', `×${fmt(globalMult(true))}`],
    ['Taxes collected (taps)', state.clicks],
    ['Technology exports', state.prestiges],
    ['Research completed', `${researchCount()} / ${RESEARCH.length}`],
    ['Current era', ERAS[currentEra()].name],
    ['Cyber mini-games won', state.gamesWon],
    ['Gems', fmt(state.gems)],
    ['Tech Index', `${Math.round(techIndex().score)} / ${TECH_INDEX_TOP}`],
    ['Encyclopedia', `${discoveredIds().length} / ${libEntries().length} · ${quizCorrect()} quizzes correct`],
    ['Time played', dur(now - state.startedAt)],
  ];
  $('statsList').innerHTML = rows.map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('');
}

function render() {
  const now = Date.now();
  const ips = incomePerSec();
  $('nationName').textContent = state.nation;
  $('gdp').textContent = money(state.gdp);
  $('ips').textContent = `+${money(ips)}/s`;
  const r = techRank();
  $('rank').textContent = `#${r}`;
  $('title').textContent = rankTitle(r);
  renderIdentity();
  $('gems').textContent = fmt(state.gems);
  $('profileBtn').classList.toggle('vip', isVip());

  // effects + attack (visible on every screen)
  const fx = [];
  if (now < state.boostUntil) fx.push(`<span class="chip good">${icon('bolt', 'ic-xs')}2× income · ${dur(state.boostUntil - now)}</span>`);
  if (now < state.shieldUntil) fx.push(`<span class="chip good">${icon('shield-check', 'ic-xs')}Cyber Shield · ${dur(state.shieldUntil - now)}</span>`);
  if (now < state.debuffUntil) fx.push(`<span class="chip bad">${icon('alert', 'ic-xs')}Breach −50% · ${dur(state.debuffUntil - now)}</span>`);
  $('effects').innerHTML = fx.join('');
  $('attack').hidden = !state.attack;
  if (state.attack) $('attackBar').style.width = `${Math.max(0, (state.attack.endsAt - now) / (state.attack.len || ATTACK_WINDOW)) * 100}%`;

  // tab badges
  const ups = availableUpgrades();
  const affordable = ups.filter(u => state.gdp >= u.cost).length;
  $('upgBadge').hidden = affordable === 0;
  $('upgBadge').textContent = affordable;
  $('secBadge').hidden = !(state.attack || (state.secLevel < SEC_MAX && state.gdp >= secCost()));
  const resReady = researchUnlocked() && !state.researching && RESEARCH.some(n => researchAvailable(n) && state.rp >= n.cost);
  $('resBadge').hidden = !resReady;
  $('govBadge').hidden = !(resReady || claimableInfluence() >= 1) || screen === 'global';
  const daily = dailyStatus();
  const tutorialDone = COACH.filter(c => c.tut).every(c => state.coach[c.id]);
  $('nationBadge').hidden = !daily.ready || screen === 'nation' || !tutorialDone;

  if (screen === 'nation') {
    $('pop').textContent = fmt(state.pop);
    $('welfare').textContent = `${Math.round(welfare())}%`;
    $('influence').textContent = state.influence;
    $('defStat').textContent = `Lv ${state.secLevel}`;
    $('tapValue').textContent = `+${money(clickValue())} per tap`;
    $('buildingCount').textContent = `${totalOwned()} facilities`;
    $('eraChip').textContent = ERAS[currentEra()].name;
    const found = discoveredIds().length, waiting = pendingQuizzes().length;
    $('libraryCardText').textContent = found ? `${found} of ${libEntries().length} discovered${waiting ? ` · ${waiting} quiz${waiting > 1 ? 'zes' : ''} waiting` : ''}` : 'Discover how digital nations work';
    $('libraryCardDot').hidden = !waiting;
    $('dailyCardDot').hidden = !daily.ready;
    $('dailyCardText').textContent = daily.ready ? `Day ${daily.day} reward is ready` : `Next reward in ${dur(msToMidnight())}`;
    const g = nextGoal();
    $('goalText').textContent = g.cost ? `${g.text} · ${money(g.cost)}` : g.text;
    $('goalBar').style.width = `${g.cost ? Math.min(100, (state.gdp / g.cost) * 100) : 100}%`;
    const boostBtn = $('boost');
    if (now < state.boostUntil) {
      boostBtn.disabled = true; boostBtn.textContent = 'Active';
      $('boostSub').textContent = `2× income for ${dur(state.boostUntil - now)}`;
    } else if (now < state.boostReadyAt) {
      boostBtn.disabled = true; boostBtn.textContent = dur(state.boostReadyAt - now);
      $('boostSub').textContent = 'Next boost is recharging';
    } else {
      boostBtn.disabled = false; boostBtn.textContent = isVip() ? 'Claim' : 'Watch';
      $('boostSub').textContent = isVip() ? 'VIP: 2× income for 2 minutes, no ad' : 'Watch a short ad for 2× income (2 min)';
    }
  } else if (screen === 'sectors') {
    renderSectors();
  } else if (screen === 'upgrades') {
    renderUpgrades(ups);
  } else if (screen === 'security') {
    renderSecurity(now);
  } else if (screen === 'global') {
    renderGlobal(now);
  } else if (screen === 'profile') {
    renderProfile(now, r);
  } else if (screen === 'shop') {
    renderShop(now);
  } else if (screen === 'library') {
    renderLibrary();
  }
  updateCoach();
}

let lastTab = 'nation';
function showScreen(name) {
  screen = name;
  if (!['profile', 'shop', 'library'].includes(name)) lastTab = name;
  if (name === 'shop' || name === 'library') track('screen_open', { name });
  for (const b of document.querySelectorAll('.tabbar button')) b.classList.toggle('on', b.dataset.screen === name);
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== `screen-${name}`;
  sectorSig = ''; upgSig = ''; achSig = '';
  window.scrollTo(0, 0);
  render();
  drawSkyline();
}

/* ---------------- Profile, flags, achievements ---------------- */

const AVATARS = ['ai', 'quantum', 'space', 'globe', 'shield', 'bolt', 'trophy', 'smart'];
const TONE_COLORS = {
  gold: ['#F7C75B', '#D98E1C'], cyan: ['#4CC9F0', '#1F7FB8'], violet: ['#A99BFF', '#5B47D6'],
  rose: ['#FF8FAB', '#D2456B'], green: ['#5EE29A', '#1E9A5A'],
  neon: ['#FF4D9D', '#7C3AED'], platinum: ['#F1F5F9', '#8796AE'], royal: ['#FFD86B', '#6D28D9'],
};
const TONE_PRICES = { neon: 100, platinum: 150, royal: 200 };
// [top band, middle band, bottom band, emblem]
const FLAGS = [
  ['#0F6E8C', '#F5B841', '#1B2839', '#F5B841'],
  ['#1D3A6E', '#E8EEF6', '#C8283E', '#1D3A6E'],
  ['#2A9BD8', '#E2483D', '#3BA55C', '#E8EEF6'],
  ['#5B47D6', '#4CC9F0', '#1B2839', '#4CC9F0'],
  ['#1E9A5A', '#E8EEF6', '#1E9A5A', '#1E9A5A'],
  ['#1B2839', '#F5B841', '#0C1420', '#F5B841'],
  // premium
  ['#5EF0E0', '#9B8CFF', '#1B1050', '#5EF0E0'],
  ['#F5B841', '#0C1420', '#F5B841', '#F5B841'],
  ['#FF7A59', '#FFC94A', '#C2287A', '#C2287A'],
  ['#FF4D9D', '#0C1420', '#22D3EE', '#22D3EE'],
];
const FLAG_PRICES = { 6: 150, 7: 200, 8: 150, 9: 250 };
const FLAG_NAMES = { 6: 'Aurora', 7: 'Royal Gold', 8: 'Sunset', 9: 'Neon' };

function flagSvg(i) {
  const [a, b, c, e] = FLAGS[i] || FLAGS[0];
  return `<svg viewBox="0 0 30 20" aria-hidden="true">
    <rect width="30" height="6.67" fill="${a}"/><rect y="6.67" width="30" height="6.66" fill="${b}"/><rect y="13.33" width="30" height="6.67" fill="${c}"/>
    <circle cx="15" cy="10" r="4.4" fill="#0C1420" stroke="#E8EEF6" stroke-width="1"/>
    <path d="M12.8 10h4.4M15 7.8v4.4" stroke="${e}" stroke-width="1.2" stroke-linecap="round"/></svg>`;
}

function avatarTile(iconId, tone) {
  const [c1, c2] = TONE_COLORS[tone] || TONE_COLORS.gold;
  return tile(iconId, { c1, c2 });
}

const ACHIEVEMENTS = [
  { id: 'first',   icon: 'isp',          name: 'First Steps',          desc: 'Build your first facility',      prog: () => [totalOwned(), 1] },
  { id: 'isp25',   icon: 'isp',          name: 'Connected Nation',     desc: 'Own 25 Internet Providers',      prog: () => [owned('isp'), 25] },
  { id: 'million', icon: 'coin',         name: 'Millionaire State',    desc: 'Earn $1M GDP in total',          prog: () => [state.lifeEarned, 1e6] },
  { id: 'smart',   icon: 'smart',        name: 'Smart Citizens',       desc: 'Build a Smart City',             prog: () => [owned('smart'), 1] },
  { id: 'cyber10', icon: 'shield-check', name: 'Cyber Guardian',       desc: 'Stop 10 cyber attacks',          prog: () => [state.attacksRepelled, 10] },
  { id: 'billion', icon: 'coins',        name: 'Billion-Dollar Nation', desc: 'Earn $1B GDP in total',         prog: () => [state.lifeEarned, 1e9] },
  { id: 'ai',      icon: 'ai',           name: 'AI Pioneer',           desc: 'Open an AI Lab',                 prog: () => [owned('ai'), 1] },
  { id: 'export',  icon: 'globe',        name: 'Tech Exporter',        desc: 'Export technology once',         prog: () => [state.prestiges, 1] },
  { id: 'top50',   icon: 'trophy',       name: 'Top 50',               desc: 'Reach #50 in the tech ranking',  prog: () => [196 - techRank(), 146] },
  { id: 'orbit',   icon: 'space',        name: 'Orbit Reached',        desc: 'Launch Satellite Internet',      prog: () => [owned('space'), 1] },
  { id: 'loyal',   icon: 'gift',         name: 'Loyal Leader',         desc: 'Claim 7 daily rewards in a row', prog: () => [state.daily.best, 7] },
  { id: 'policy',  icon: 'egov',         name: 'Policy Maker',         desc: 'Change a national policy',       prog: () => [state.policyChanges, 1] },
  { id: 'think',   icon: 'flask',        name: 'Think Tank',           desc: 'Complete 6 research projects',   prog: () => [researchCount(), 6] },
  { id: 'hacker',  icon: 'bug',          name: 'Firewall Hero',        desc: 'Win the cyber mini-game 5 times', prog: () => [state.gamesWon, 5] },
  { id: 'quantumEra', icon: 'quantum',   name: 'Quantum Leap',         desc: 'Reach the Quantum Era',          prog: () => [currentEra(), 5] },
  { id: 'spaceAge', icon: 'rocket',      name: 'Space Age',            desc: 'Reach the Space Era',            prog: () => [currentEra(), 6] },
  { id: 'curious', icon: 'book',         name: 'Curious Mind',         desc: 'Answer 10 quiz questions correctly', prog: () => [quizCorrect(), 10] },
  { id: 'scholar', icon: 'book',         name: 'Scholar',              desc: 'Answer 40 quiz questions correctly', prog: () => [quizCorrect(), 40] },
  { id: 'collector', icon: 'star',       name: 'Encyclopedist',        desc: 'Discover 50 encyclopedia entries', prog: () => [discoveredIds().length, 50] },
];

function checkAchievements(silent) {
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id]) continue;
    const [cur, target] = a.prog();
    if (cur >= target) {
      state.achievements[a.id] = Date.now();
      if (!silent) track('achievement', { id: a.id });
      gemEarn('achievement', a.id, ACH_GEMS);
      if (!silent) { toast(`Achievement: ${a.name} · +${ACH_GEMS} gems`, 'star', 'gold'); Sound.play('reward'); buzz([20, 40, 20]); }
    }
  }
}

function buildPickers() {
  const tone = state.player.tone;
  $('avatarIcons').innerHTML = AVATARS.map(id =>
    `<button data-avatar="${id}" aria-label="Avatar ${id}">${avatarTile(id, tone)}</button>`).join('');
  $('avatarTones').innerHTML = Object.entries(TONE_COLORS).map(([k, [c1, c2]]) =>
    `<button data-tone="${k}" aria-label="${k} color" style="--c1:${c1};--c2:${c2}">${toneOwned(k) ? '' : lockBadge(TONE_PRICES[k])}</button>`).join('');
  $('flagPicker').innerHTML = FLAGS.map((_, i) => `<button data-flag="${i}" aria-label="Flag ${i + 1}">${flagSvg(i)}${flagOwned(i) ? '' : lockBadge(FLAG_PRICES[i])}</button>`).join('');
  shopSig = '';
}

let identitySig = '';
function renderIdentity() {
  const p = state.player;
  const sig = `${p.avatar}|${p.tone}|${p.flag}|${p.name}|${state.nation}`;
  if (sig === identitySig) return;
  identitySig = sig;
  $('headerFlag').innerHTML = flagSvg(p.flag);
  $('headerAvatar').innerHTML = avatarTile(p.avatar, p.tone);
  $('profileAvatar').innerHTML = avatarTile(p.avatar, p.tone);
  $('profileName').textContent = p.name;
  $('profileNation').textContent = `Leader of ${state.nation}`;
  $('kvPlayer').textContent = p.name;
  $('kvNation').textContent = state.nation;
  for (const b of $('avatarIcons').children) b.classList.toggle('on', b.dataset.avatar === p.avatar);
  for (const b of $('avatarTones').children) b.classList.toggle('on', b.dataset.tone === p.tone);
  for (const b of $('flagPicker').children) b.classList.toggle('on', Number(b.dataset.flag) === p.flag);
}

let achSig = '';
function renderProfile(now, rank) {
  const done = ACHIEVEMENTS.filter(a => state.achievements[a.id]).length;
  $('profileRank').textContent = `#${rank}`;
  $('profileAch').textContent = `${done} / ${ACHIEVEMENTS.length}`;
  $('vipChip').hidden = !isVip();
  renderAccount();
  const rows = ACHIEVEMENTS.map(a => {
    const got = !!state.achievements[a.id];
    const [cur, target] = a.prog();
    const pct = got ? 100 : Math.floor(Math.min(1, Math.max(0, cur) / target) * 100);
    return { a, got, pct };
  });
  const sig = rows.map(r => `${r.a.id}:${r.got ? 'y' : r.pct}`).join(',');
  if (sig !== achSig) {
    achSig = sig;
    $('achList').innerHTML = rows.map(({ a, got, pct }) => `<div class="row ach ${got ? '' : 'todo'}">
      ${tile(a.icon, 'gold')}
      <div class="row-title"><span class="nm">${a.name}</span></div>
      ${got ? `<span class="ach-state">${icon('check')}</span>` : `<span class="ach-state todo">${pct}%</span>`}
      <div class="row-sub"><span>${a.desc}</span>${got ? '' : `<span class="meter"><i style="width:${pct}%"></i></span>`}</div>
    </div>`).join('');
  }
  renderStats(now);
  for (const [id, key] of [['setSound', 'sound'], ['setVibe', 'vibration'], ['setStats', 'analytics']]) $(id).setAttribute('aria-checked', String(state.settings[key] === true));
}

/* ---------------- Accounts + cloud save (Supabase) ---------------- */

// Public project settings. The anon key is meant to ship in client code:
// row level security on public.saves limits every player to their own row.
const SUPABASE_URL = 'https://dygrvzxnfsozjaxlbcoz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5Z3J2enhuZnNvempheGxiY296Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4MTUyNzUsImV4cCI6MjEwOTM5MTI3NX0.cvmRUhZeNg2jLoRQSaAZZKHQJ-Ilhba6LOL09YkSQ_w';
const CLOUD_META_KEY = 'digitalnation_cloud_v1';
const CLOUD_PUSH_EVERY = 30e3;

// status: off | syncing | synced | error
const cloud = { client: null, user: null, status: 'off', ready: false, busy: false, lastSync: 0, email: '' };

function cloudAvailable() { return !!cloud.client; }
function readCloudMeta() { try { return JSON.parse(localStorage.getItem(CLOUD_META_KEY)) || {}; } catch (e) { return {}; } }
function writeCloudMeta(m) { try { localStorage.setItem(CLOUD_META_KEY, JSON.stringify(m)); } catch (e) { /* storage unavailable */ } }
function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return 'iPhone / iPad';
  if (/android/i.test(ua)) return 'Android';
  return 'Computer';
}
function ago(ts) { const s = Math.max(0, Math.round((Date.now() - ts) / 1000)); return s < 5 ? 'just now' : `${dur(s * 1000)} ago`; }

function initCloud() {
  if (!isPwaBuild() || !window.supabase || !/^https?:$/.test(location.protocol)) { renderAccount(); return; }
  try {
    cloud.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'digitalnation_auth' },
    });
  } catch (e) { cloud.client = null; renderAccount(); return; }
  cloud.client.auth.onAuthStateChange((event, session) => {
    const user = session ? session.user : null;
    const changed = (user && user.id) !== (cloud.user && cloud.user.id);
    cloud.user = user;
    if (!user) { cloud.ready = false; cloud.status = 'off'; cloud.walletReady = false; cloud.wallet = null; }
    // Supabase recommends not awaiting other calls inside this callback.
    if (user && changed) setTimeout(onSignedIn, 0);
    renderAccount();
  });
}

async function pullSave() {
  const { data, error } = await cloud.client.from('saves').select('data, progress, updated_at').eq('user_id', cloud.user.id).maybeSingle();
  if (error) throw error;
  return data;
}

async function pushSave() {
  if (!cloud.user) return;
  saveGame();
  const row = { user_id: cloud.user.id, data: state, progress: state.lifeEarned, device: deviceLabel() };
  const { data, error } = await cloud.client.from('saves').upsert(row).select('updated_at').single();
  if (error) throw error;
  markSynced(data.updated_at);
  pushLeaderboard();
}

// Each device remembers the server timestamp of the last save it wrote or loaded.
// If the server's timestamp differs, another device has saved since then.
function markSynced(serverTs) {
  writeCloudMeta({ uid: cloud.user.id, syncedAt: serverTs });
  cloud.lastSync = Date.now();
  cloud.status = 'synced';
  cloud.ready = true;
}
const remoteChanged = remote => !!remote && remote.updated_at !== readCloudMeta().syncedAt;

function adoptCloudSave(remote, message) {
  state = normalizeSave(remote.data);
  postLoad();
  sectorSig = '';
  sectorSig = ''; upgSig = ''; achSig = ''; identitySig = ''; shopSig = ''; researchSig = ''; coachShown = '';
  policiesBuilt = false;
  markSynced(remote.updated_at);
  if (cloud.wallet) applyWallet(cloud.wallet); // gems and items always come from the server wallet
  buildPickers();
  saveGame();
  applyOffline();
  render();
  drawSkyline();
  if (message) toast(message, 'cloud', 'cyan');
}

const isFreshSave = s => s.lifeEarned < 1000 && !s.prestiges && !s.vipUntil && !(s.owned && s.owned.golden);

async function onSignedIn() {
  track('sign_in', {});
  if (!cloud.user || cloud.busy) return;
  cloud.busy = true; cloud.ready = false; cloud.status = 'syncing'; renderAccount();
  try {
    const remote = await pullSave();
    const sameAccount = readCloudMeta().uid === cloud.user.id;
    if (!remote) {
      await pushSave();
      toast('Your progress is now saved to your account', 'cloud', 'cyan');
    } else if (sameAccount) {
      if (remoteChanged(remote)) adoptCloudSave(remote, 'Loaded your latest progress');
      else await pushSave();
    } else if (isFreshSave(state)) {
      adoptCloudSave(remote, 'Welcome back! Your nation is loaded.');
    } else {
      cloud.busy = false;
      askWhichSave(remote);
      return;
    }
  } catch (e) {
    cloud.status = 'error';
  }
  cloud.busy = false;
  renderAccount();
  connectWallet();
}

function askWhichSave(remote) {
  const local = `This device: ${money(state.lifeEarned)} lifetime GDP, ${totalOwned()} facilities.`;
  const acct = `Your account: ${money(remote.progress)} lifetime GDP, saved ${ago(new Date(remote.updated_at).getTime())}.`;
  queueOverlay(() => showModal('Which nation do you want to keep?', `${local}\n${acct}\n\nThe other one will be replaced.`, {
    icon: 'cloud', tone: 'cyan', okText: 'Use account', cancelText: 'Use this device',
    onOk: () => { adoptCloudSave(remote, 'Loaded your nation from your account'); renderAccount(); connectWallet(); },
    onCancel: async () => {
      try { await pushSave(); connectWallet(); toast('This device\'s nation is now saved to your account', 'cloud', 'cyan'); }
      catch (e) { cloud.status = 'error'; }
      renderAccount();
    },
  }));
}

// One sync step: load the server save if another device changed it, otherwise upload ours.
async function syncCycle(message) {
  const remote = await pullSave();
  if (remoteChanged(remote)) adoptCloudSave(remote, 'Loaded newer progress from another device');
  else { await pushSave(); if (message) toast(message, 'cloud', 'cyan'); }
}

async function runSync(message) {
  if (!cloud.user || cloud.busy) return;
  if (readCloudMeta().uid !== cloud.user.id) { onSignedIn(); return; }
  cloud.busy = true; cloud.status = 'syncing'; renderAccount();
  try { await syncCycle(message); } catch (e) { cloud.status = 'error'; cloud.ready = false; }
  cloud.busy = false;
  renderAccount();
}

// Every 30 s while the game is visible.
function cloudTick() { if (cloud.user && !document.hidden) { runSync(); flushEarns(); } }
// Leaving the app: upload right away so another device can continue.
function cloudPause() {
  if (!cloud.user || !cloud.ready || cloud.busy) return;
  pushSave().catch(() => { cloud.status = 'error'; });
}
// Coming back: check whether another device played meanwhile.
function cloudResume() { return runSync(); }
function syncNow() { return runSync('Synced'); }

// Deletes the account and its cloud data on the server. Progress on this device stays,
// so the player can keep playing as a guest or reset it separately.
function askDeleteAccount() {
  if (!cloud.user) return;
  showModal('Delete your account?', `This permanently deletes ${cloud.user.email} and everything saved to it on our server: your cloud save, gems and purchases. It cannot be undone.\n\nType DELETE to confirm.`, {
    icon: 'trash', tone: 'bad', input: '', okText: 'Delete account',
    onOk: async value => {
      if (String(value).trim().toUpperCase() !== 'DELETE') { toast('Type DELETE to confirm', 'alert', 'bad'); return; }
      try {
        const { error } = await cloud.client.rpc('delete_my_account');
        if (error) throw error;
        await cloud.client.auth.signOut().catch(() => {});
        writeCloudMeta({});
        cloud.user = null; cloud.ready = false; cloud.status = 'off'; cloud.lastSync = 0; cloud.walletReady = false; cloud.wallet = null;
        renderAccount();
        showModal('Account deleted', 'Your account and its cloud data are gone. Your progress on this device is still here; use "Reset progress on this device" if you want to remove it too.', { icon: 'check', tone: 'green' });
      } catch (e) {
        showModal('Could not delete the account', `${friendlyAuthError(e)} Nothing was deleted.`, { icon: 'alert', tone: 'bad' });
      }
    },
  });
}

async function signOut() {
  if (!cloud.client) return;
  if (cloud.ready) { try { await pushSave(); } catch (e) { /* keep local copy */ } }
  await cloud.client.auth.signOut().catch(() => {});
  writeCloudMeta({});
  cloud.user = null; cloud.ready = false; cloud.status = 'off'; cloud.lastSync = 0; cloud.walletReady = false; cloud.wallet = null;
  toast('Signed out. Your progress stays on this device.', 'logout', 'cyan');
  renderAccount();
}

function renderAccount() {
  const title = $('accountTitle'), text = $('accountText'), btn = $('accountBtn'), actions = $('accountActions');
  if (!title) return;
  if (!cloudAvailable()) {
    title.textContent = 'Accounts';
    text.textContent = 'Sign-in works in the web version at tardigrade23.github.io/DigitalNation.';
    btn.hidden = true; actions.hidden = true;
    return;
  }
  $('deleteAccount').hidden = !cloud.user;
  if (!cloud.user) {
    title.textContent = 'Save your progress';
    text.textContent = 'Sign in with your email to keep your nation safe and play on any device.';
    btn.hidden = false; actions.hidden = true;
    return;
  }
  $('deleteAccount').hidden = false;
  title.textContent = cloud.user.email || 'Signed in';
  text.textContent = {
    syncing: 'Syncing…',
    synced: `Synced ${ago(cloud.lastSync)} · ${deviceLabel()}`,
    error: 'Sync paused. Check your connection, then tap Sync now.',
    off: 'Signed in',
  }[cloud.status] || 'Signed in';
  btn.hidden = true; actions.hidden = false;
  $('syncNow').disabled = cloud.busy;
}

/* Sign-in sheet: email -> 6-digit code (or the link in the same email). */
function showAuthStep(step) {
  $('authEmailForm').hidden = step !== 'email';
  $('authCodeForm').hidden = step !== 'code';
  $('authError').hidden = true;
  if (step === 'email') { $('authEmail').value = cloud.email; setTimeout(() => $('authEmail').focus(), 50); }
  if (step === 'code') { $('authCode').value = ''; setTimeout(() => $('authCode').focus(), 50); }
}
function openAuth() {
  if (!cloudAvailable() || overlayOpen()) return;
  $('auth').hidden = false;
  showAuthStep('email');
  updateCoach();
}
function closeAuth() { $('auth').hidden = true; if (!overlayOpen()) nextOverlay(); }
function authError(msg) { $('authError').textContent = msg; $('authError').hidden = false; }
function friendlyAuthError(e) {
  const m = String((e && e.message) || e || '');
  if (/rate|too many|security purposes/i.test(m)) return 'Too many emails were sent. Wait a minute, then try again.';
  if (/expired|invalid|token/i.test(m)) return 'That code is wrong or has expired. Check the latest email, or send a new code.';
  if (/fetch|network|failed/i.test(m)) return 'No connection to the server. Check your internet and try again.';
  return m || 'Something went wrong. Please try again.';
}

async function submitEmail() {
  const email = $('authEmail').value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { authError('Enter a valid email address, like name@example.com.'); return; }
  const btn = $('authSend');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const { error } = await cloud.client.auth.signInWithOtp({
      email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname },
    });
    if (error) throw error;
    cloud.email = email;
    showAuthStep('code');
    $('authSentText').textContent = `We sent an email to ${email}. Enter the code from it, or tap the sign-in link in the email.`;
  } catch (e) {
    authError(friendlyAuthError(e));
  }
  btn.disabled = false; btn.textContent = 'Send sign-in code';
}

let verifying = false;
async function submitCode() {
  const token = $('authCode').value.replace(/\D/g, '');
  if (token.length < 6) { authError('Enter the code from the email.'); return; }
  if (verifying) return;
  verifying = true;
  const btn = $('authVerify');
  btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    const { error } = await cloud.client.auth.verifyOtp({ email: cloud.email, token, type: 'email' });
    if (error) throw error;
    closeAuth();
    Sound.play('reward');
    toast(`Signed in as ${cloud.email}`, 'cloud', 'cyan');
  } catch (e) {
    authError(friendlyAuthError(e));
  }
  verifying = false;
  btn.disabled = false; btn.textContent = 'Sign in';
}

/* ---------------- PWA: install + offline ---------------- */

let deferredInstall = null;
const isPwaBuild = () => !!document.querySelector('link[rel="manifest"]');
const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

function renderInstall() {
  const btn = $('installBtn'), txt = $('installText');
  btn.hidden = true;
  if (isStandalone()) txt.textContent = 'Installed. Digital Nation runs full screen and works offline.';
  else if (!isPwaBuild()) txt.textContent = 'You can install the game from its hosted web address.';
  else if (deferredInstall) { txt.textContent = 'Add it to your home screen. It opens full screen and works offline.'; btn.hidden = false; }
  else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) txt.textContent = 'In Safari, tap Share, then "Add to Home Screen".';
  else txt.textContent = 'Open your browser menu and choose "Install app" or "Add to Home screen".';
}

function registerServiceWorker() {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; renderInstall(); });
  window.addEventListener('appinstalled', () => { deferredInstall = null; toast('Digital Nation installed', 'check', 'green'); renderInstall(); });
  if (!isPwaBuild() || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* unsupported host */ }); });
}

/* ---------------- Tech Encyclopedia + quizzes ---------------- */

const QUIZ_GEMS = 3;
const LIB = typeof LIBRARY === 'object' ? LIBRARY : {};
// Free-licensed pictures from Wikimedia (images/library/credits.js, generated by a workflow).
const LIB_IMG = typeof LIBRARY_IMAGES === 'object' ? LIBRARY_IMAGES : {};

function libEntries() {
  const sectors = SECTORS.map(s => ({ id: s.id, group: 'Sectors', kind: `Sector · ${ERAS[s.era].name}`, name: s.name, icon: s.id, tone: s, how: 'Build it to discover' }));
  const research = RESEARCH.map(n => {
    const b = BRANCHES.find(x => x.id === n.branch);
    return { id: n.id, group: b.name, kind: `Research · ${b.name}`, name: n.name, icon: b.icon, tone: b.tone, how: 'Research it to discover' };
  });
  return [...sectors, ...research].filter(e => LIB[e.id]);
}
const libEntry = id => libEntries().find(e => e.id === id);
const discoveredIds = () => Object.keys(state.library).filter(id => LIB[id]);
const pendingQuizzes = () => discoveredIds().filter(id => state.quiz[id] === undefined);
const quizCorrect = () => Object.values(state.quiz).filter(v => v === 1).length;

function discover(id) {
  if (!LIB[id] || state.library[id]) return;
  state.library[id] = Date.now();
  libSig = '';
}

// Runs after any save is loaded (local or cloud): fills in the encyclopedia and
// moves older saves to the new era system without a "new era" popup.
function postLoad() {
  for (const s of SECTORS) if (owned(s.id) > 0) discover(s.id);
  for (const n of RESEARCH) if (state.research[n.id]) discover(n.id);
  if ((state.v || 1) < SAVE_VERSION) { state.era = currentEra(); state.v = SAVE_VERSION; }
}

// Same shuffled answer order every time for a given entry.
function quizOrder(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const r = rng(h), order = [0, 1, 2];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}

let entryOpen = null;
function openEntry(id) {
  const e = libEntry(id), c = LIB[id];
  if (!e || !c || !state.library[id] || overlayOpen()) return;
  entryOpen = id;
  $('learnTile').innerHTML = tile(e.icon, e.tone);
  $('learnKind').textContent = e.kind;
  $('learnTitle').textContent = e.name;
  $('learnWhat').textContent = c.what;
  $('learnReal').textContent = c.real;
  $('learnFact').textContent = c.fact;
  $('quizQ').textContent = c.q;
  const img = LIB_IMG[id], fig = $('learnFigure'), pic = $('learnImg');
  fig.hidden = !img;
  if (img) {
    pic.onerror = () => { fig.hidden = true; };
    pic.src = img.src;
    pic.alt = `${e.name} (from the Wikipedia article "${img.article}")`;
    const credit = $('learnCredit');
    credit.textContent = `Image: ${img.artist} · ${img.license} · Wikimedia Commons`;
    credit.href = img.source || 'https://commons.wikimedia.org/';
  }
  renderQuiz();
  $('learn').hidden = false;
  $('learn').querySelector('.learn-box').scrollTop = 0;
  updateCoach();
}

function renderQuiz() {
  const id = entryOpen, c = LIB[id], answered = state.quiz[id];
  $('quizLabel').textContent = answered === undefined ? `Quick quiz · +${QUIZ_GEMS} gems` : 'Quick quiz';
  $('quizOpts').innerHTML = quizOrder(id).map(i => {
    const cls = answered === undefined ? '' : (i === c.c ? 'right' : '');
    return `<button data-opt="${i}" class="${cls}" ${answered === undefined ? '' : 'disabled'}>${esc(c.a[i])}</button>`;
  }).join('');
  const res = $('quizResult');
  res.hidden = answered === undefined;
  if (answered === 1) res.textContent = `Correct! +${QUIZ_GEMS} gems`;
  if (answered === 0) res.textContent = `The right answer is: ${c.a[c.c]}`;
  res.style.color = answered === 1 ? 'var(--good)' : 'var(--muted)';
}

function answerQuiz(i) {
  const id = entryOpen, c = LIB[id];
  if (!id || state.quiz[id] !== undefined) return;
  const ok = i === c.c;
  state.quiz[id] = ok ? 1 : 0;
  track('quiz_answer', { id, ok });
  if (ok) { gemEarn('quiz', id, QUIZ_GEMS); Sound.play('reward'); buzz([15, 30, 15]); }
  else { Sound.play('breach'); buzz(60); }
  renderQuiz();
  if (!ok) {
    const picked = $('quizOpts').querySelector(`[data-opt="${i}"]`);
    if (picked) picked.classList.add('wrong');
    $('quizResult').textContent = `Not quite. The right answer is: ${c.a[c.c]}`;
  }
  libSig = '';
  saveGame();
  render();
}

function closeEntry() {
  entryOpen = null;
  $('learn').hidden = true;
  if (!overlayOpen()) nextOverlay();
}

const infoBtn = id => (LIB[id] ? `<button class="info-btn" data-learn="${id}" aria-label="Learn about this">${icon('info', 'ic-sm')}</button>` : '');

let libSig = '';
function renderLibrary() {
  const all = libEntries(), found = discoveredIds().length, waiting = pendingQuizzes().length;
  $('libCount').textContent = `${found} of ${all.length} discovered`;
  $('libQuiz').textContent = waiting
    ? `${waiting} quiz${waiting > 1 ? 'zes' : ''} waiting · +${QUIZ_GEMS} gems each · ${quizCorrect()} answered correctly`
    : `Build sectors and finish research to discover entries. ${quizCorrect()} quizzes answered correctly.`;
  $('libBar').style.width = `${(found / all.length) * 100}%`;
  const sig = `${found}|${Object.keys(state.quiz).length}`;
  if (sig === libSig) return;
  libSig = sig;
  const groups = [...new Set(all.map(e => e.group))];
  $('library').innerHTML = groups.map(g => {
    const items = all.filter(e => e.group === g);
    const groupIcon = g === 'Sectors' ? 'grid' : BRANCHES.find(b => b.name === g).icon;
    return `<div class="branch"><div class="branch-head">${icon(groupIcon, 'ic-sm')}${g}</div>${items.map(e => {
      const known = !!state.library[e.id], q = state.quiz[e.id];
      if (!known) {
        return `<div class="row lib-row locked">${tile('lock', null, 'tile-locked')}<div class="row-title"><span class="nm">???</span></div>
          <span></span><div class="row-sub"><span>${e.how}</span></div></div>`;
      }
      const stateTag = q === undefined ? `<span class="lib-state quiz">Quiz +${QUIZ_GEMS}</span>`
        : (q === 1 ? `<span class="lib-state done">${icon('check', 'ic-xs')} Learned</span>` : '<span class="lib-state miss">Read</span>');
      const pic = LIB_IMG[e.id] ? `<span class="thumb"><img src="${LIB_IMG[e.id].src}" alt="" loading="lazy" decoding="async" onerror="this.remove()"></span>` : tile(e.icon, e.tone);
      return `<button class="row lib-row" data-learn="${e.id}">${pic}
        <div class="row-title"><span class="nm">${e.name}</span></div>${stateTag}
        <div class="row-sub"><span>${e.kind}</span></div></button>`;
    }).join('')}</div>`;
  }).join('');
}

/* ---------------- Server wallet (signed-in players) ---------------- */

// Signed in: the server owns gems, VIP and premium items (public.wallets).
// Guests: everything stays on the device, as before.
const walletMode = () => !!(cloud.user && cloud.walletReady);

async function walletRpc(fn, args = {}) {
  const { data, error } = await cloud.client.rpc(fn, args);
  if (error) throw error;
  return data;
}

function applyWallet(w) {
  if (!w) return;
  cloud.wallet = w;
  const day = dayKey();
  state.gems = w.gems;
  state.vipUntil = w.vipUntil ? Date.parse(w.vipUntil) : 0;
  state.shieldUntil = Math.max(state.shieldUntil || 0, w.shieldUntil ? Date.parse(w.shieldUntil) : 0);
  state.owned.golden = !!w.golden;
  state.owned.flags = (w.flags || []).map(Number);
  state.owned.tones = [...(w.tones || [])];
  state.warps = { day, n: w.warpsToday || 0 };
  state.adGems = { day, n: Math.max(adGemsUsed(), w.adsToday || 0) };
  state.simBuys = { day, n: w.buysToday || 0 };
  identitySig = ''; shopSig = '';
}

function walletError(e) {
  const m = String((e && e.message) || e || '');
  const text = /insufficient_gems/.test(m) ? 'You do not have enough gems for this.'
    : /limit_reached/.test(m) ? 'You reached today\'s limit for this. It resets at midnight (UTC).'
    : /already_owned/.test(m) ? 'You already own this.'
    : /fetch|network|failed/i.test(m) ? 'Connect to the internet to use gems while you are signed in.'
    : 'The server could not complete this. Please try again.';
  showModal('Not completed', text, { icon: 'gem', tone: 'violet' });
  refreshWallet();
}

// Free gems: added right away on screen, confirmed by the server.
// Offline earnings wait in state.pendingEarns and are sent later.
function gemEarn(reason, ref, amount) {
  if (!walletMode()) { state.gems += amount; return; }
  state.gems += amount;
  state.pendingEarns = state.pendingEarns || [];
  state.pendingEarns.push({ reason, ref: String(ref || ''), amount });
  flushEarns();
}

let earning = false;
async function flushEarns() {
  if (earning || !walletMode() || !(state.pendingEarns || []).length) return;
  earning = true;
  while (state.pendingEarns.length) {
    const e = state.pendingEarns[0];
    try {
      const w = await walletRpc('wallet_earn', { p_reason: e.reason, p_ref: e.ref, p_amount: e.amount });
      state.pendingEarns.shift();
      if (!state.pendingEarns.length) applyWallet(w);
    } catch (err) {
      const m = String(err && err.message || '');
      if (/fetch|network|failed/i.test(m)) break; // offline: keep it for later
      state.pendingEarns.shift(); // refused (limit or already granted): drop it
      if (!state.pendingEarns.length) await refreshWallet();
    }
  }
  earning = false;
  saveGame();
  render();
}

async function refreshWallet() {
  if (!cloud.user) return;
  try { applyWallet(await walletRpc('wallet_get')); render(); } catch (e) { /* offline */ }
}

// First wallet call on a device: brings over what the device had (the server caps it).
async function connectWallet() {
  try {
    const local = { gems: state.gems, golden: state.owned.golden, flags: state.owned.flags, tones: state.owned.tones, vipUntil: state.vipUntil };
    const w = await walletRpc('wallet_get', { p_local: local });
    cloud.walletReady = true;
    applyWallet(w);
    state.pendingEarns = [];
    saveGame();
    render();
  } catch (e) { cloud.walletReady = false; }
}

/* ---------------- Player leaderboard ---------------- */

// public.leaderboard: everyone can read it; signed-in players write only their own row.
const LB_PUSH_EVERY = 5 * 60e3, LB_CACHE = 60e3, LB_SIZE = 50;
const lb = { rows: null, myRank: null, loadedAt: 0, pushedAt: 0, loading: false, error: '' };

async function pushLeaderboard(force) {
  if (!cloud.user || !cloud.client || (!force && Date.now() - lb.pushedAt < LB_PUSH_EVERY)) return;
  lb.pushedAt = Date.now();
  const row = {
    user_id: cloud.user.id,
    nation: String(state.nation || 'Digital Nation').slice(0, 32),
    leader: String(state.player.name || 'Leader').slice(0, 24),
    flag: Math.min(20, Math.max(0, state.player.flag | 0)),
    score: Math.min(1000, Math.round(techIndex().score * 10) / 10),
    era: currentEra(),
    lifetime_gdp: state.lifeEarned,
  };
  try { const { error } = await cloud.client.from('leaderboard').upsert(row); if (error) throw error; }
  catch (e) { lb.pushedAt = 0; }
}

async function loadLeaderboard(force) {
  if (!cloud.client || lb.loading || (!force && lb.rows && Date.now() - lb.loadedAt < LB_CACHE)) return;
  lb.loading = true; lb.error = ''; renderLeaderboard(true);
  try {
    if (cloud.user) await pushLeaderboard(true);
    const { data, error } = await cloud.client.from('leaderboard')
      .select('user_id, nation, leader, flag, score, era').order('score', { ascending: false }).limit(LB_SIZE);
    if (error) throw error;
    lb.rows = data || [];
    lb.myRank = null;
    if (cloud.user) {
      const r = await cloud.client.rpc('my_leaderboard_rank');
      if (!r.error) lb.myRank = r.data;
    }
    lb.loadedAt = Date.now();
  } catch (e) {
    lb.error = 'Could not load the leaderboard. Check your connection and tap refresh.';
  }
  lb.loading = false;
  renderLeaderboard(true);
}

let lbSig = '';
function renderLeaderboard(force) {
  if (!cloud.client) {
    $('lbMe').textContent = 'The leaderboard works in the web version at tardigrade23.github.io/DigitalNation.';
    $('lbJoin').hidden = true; $('lbList').innerHTML = '';
    return;
  }
  if (!force && !lb.rows && !lb.loading) { loadLeaderboard(); return; }
  if (!force && lb.rows && Date.now() - lb.loadedAt > LB_CACHE) { loadLeaderboard(); return; }
  const me = cloud.user && cloud.user.id;
  $('lbJoin').hidden = !!me;
  $('lbMe').textContent = lb.loading ? 'Loading…'
    : lb.error ? lb.error
    : me ? (lb.myRank ? `You are #${lb.myRank} with a Tech Index of ${Math.round(techIndex().score)}.` : 'Your nation will appear after the next sync.')
    : 'Real players ranked by Tech Index. Sign in to add your nation.';
  const sig = JSON.stringify([lb.rows, lb.myRank, me]);
  if (sig === lbSig) return;
  lbSig = sig;
  if (!lb.rows) { $('lbList').innerHTML = ''; return; }
  if (!lb.rows.length) { $('lbList').innerHTML = '<div class="empty">No nations yet. Sign in and be the first!</div>'; return; }
  const row = (r, pos) => `<div class="lb-row ${r.user_id === me ? 'me' : ''}">
      <span class="lb-pos">${pos}</span><span class="lb-flag">${flagSvg(r.flag)}</span>
      <span class="lb-name"><b>${esc(r.nation)}</b><span>${esc(r.leader)} · ${ERAS[r.era] ? ERAS[r.era].name : ''}</span></span>
      <span class="lb-score">${Math.round(r.score)}</span></div>`;
  let html = lb.rows.map((r, i) => row(r, i + 1)).join('');
  if (me && lb.myRank && lb.myRank > lb.rows.length) {
    html += `<div class="lb-gap">…</div>` + row({ user_id: me, nation: state.nation, leader: state.player.name, flag: state.player.flag, era: currentEra(), score: techIndex().score }, lb.myRank);
  }
  $('lbList').innerHTML = html;
}

/* ---------------- Gems, shop, VIP, ads ---------------- */

const ACH_GEMS = 10;
const AD_GEMS_PER_DAY = 5;
const GEM_PACKS = [
  { id: 'p1', gems: 100,  price: '$0.99' },
  { id: 'p2', gems: 550,  price: '$4.99',  tag: '+10% bonus' },
  { id: 'p3', gems: 1200, price: '$9.99',  tag: 'Popular' },
  { id: 'p4', gems: 2500, price: '$19.99', tag: 'Best value' },
];
const WARPS = [{ h: 1, cost: 40 }, { h: 2, cost: 70 }, { h: 4, cost: 120 }];
const WARPS_PER_DAY = 3;
const SIM_BUYS_PER_DAY = 2; // prototype test mode: keeps the economy testable
const warpsUsed = () => (state.warps && state.warps.day === dayKey() ? state.warps.n : 0);
const simBuysUsed = () => (state.simBuys && state.simBuys.day === dayKey() ? state.simBuys.n : 0);
const SHOP_BOOSTS = [
  { id: 'golden', icon: 'coins', tone: 'gold', name: 'Golden Economy', desc: 'Permanent ×2 income. Kept forever, even after exports.', cost: 1500 },
  { id: 'shield', icon: 'shield-check', tone: 'green', name: 'Cyber Shield', desc: 'No cyber attacks for 24 hours.', cost: 150 },
  { id: 'grant', icon: 'flask', tone: 'cyan', name: 'Research Grant', desc: 'Get 1 hour of research points (at least 200 RP).', cost: 100 },
];

const isVip = () => Date.now() < state.vipUntil;
const gemCost = n => `<span class="gem-cost">${icon('gem')}${fmt(n)}</span>`;
const lockBadge = price => `<span class="lockbadge">${icon('gem')}${price}</span>`;
const flagOwned = i => !FLAG_PRICES[i] || state.owned.flags.includes(i);
const toneOwned = k => !TONE_PRICES[k] || state.owned.tones.includes(k);
const adGemsUsed = () => (state.adGems.day === dayKey() ? state.adGems.n : 0);
const adGemsLeft = () => AD_GEMS_PER_DAY - adGemsUsed();

function addGems(n, reason, serverEarn = null) {
  if (serverEarn) gemEarn(serverEarn.reason, serverEarn.ref, n);
  else state.gems += n;
  Sound.play('reward'); buzz([15, 30, 15]);
  toast(`+${n} gems${reason ? ` · ${reason}` : ''}`, 'gem', 'violet');
  saveGame();
  render();
}

function spendGems(n, label, onDone, item) {
  if (state.gems < n) {
    showModal('Not enough gems', `You need ${fmt(n)} gems for ${label}. You have ${fmt(state.gems)}.`, {
      icon: 'gem', tone: 'violet', okText: 'Get gems', onOk: () => { showScreen('shop'); },
    });
    return;
  }
  showModal(`Buy ${label}?`, `This costs ${fmt(n)} gems. You have ${fmt(state.gems)}.`, {
    icon: 'gem', tone: 'violet', okText: `Spend ${fmt(n)} gems`,
    onOk: async () => {
      if (walletMode()) {
        // The server checks the price, the balance and any limits, then answers with the new wallet.
        try {
          const w = await walletRpc('wallet_spend', { p_item: item });
          onDone();
          applyWallet(w);
        } catch (e) { walletError(e); return; }
      } else {
        state.gems -= n;
        onDone();
      }
      track('gem_spend', { item, cost: n });
      Sound.play('upgrade'); saveGame(); shopSig = ''; render();
    },
  });
}

// Real-money purchases are simulated in the web prototype.
function simulatedPurchase(title, price, onDone, product) {
  if (walletMode()) {
    showModal(title, `Price: ${price}\nPrototype: no money is charged. The store version will use Google Play and App Store billing.`, {
      icon: 'gem', tone: 'violet', okText: 'Buy (simulated)',
      onOk: async () => {
        try {
          const w = await walletRpc('purchase_simulated', { p_product: product });
          applyWallet(w);
          track('purchase_sim', { product });
          Sound.play('reward'); buzz([20, 40, 20]);
          toast(product === 'vip' ? 'VIP active for 30 days' : 'Gems added to your account', product === 'vip' ? 'crown' : 'gem', 'violet');
          saveGame(); identitySig = ''; shopSig = ''; render();
        } catch (e) { walletError(e); }
      },
    });
    return;
  }
  if (simBuysUsed() >= SIM_BUYS_PER_DAY) {
    showModal('Test purchase limit reached', `The prototype allows ${SIM_BUYS_PER_DAY} simulated purchases per day, so the game balance stays realistic. Try again tomorrow.`, { icon: 'gem', tone: 'violet' });
    return;
  }
  const done = onDone;
  onDone = () => { state.simBuys = { day: dayKey(), n: simBuysUsed() + 1 }; done(); };
  showModal(title, `Price: ${price}\nPrototype: no money is charged. The store version will use Google Play and App Store billing.`, {
    icon: 'gem', tone: 'violet', okText: 'Buy (simulated)', onOk: onDone,
  });
}

function buyPack(id) {
  const p = GEM_PACKS.find(x => x.id === id);
  if (p) simulatedPurchase(`Buy ${fmt(p.gems)} gems?`, p.price, () => { track('purchase_sim', { product: p.id }); addGems(p.gems, 'Purchase'); }, p.id);
}

function buyVip() {
  simulatedPurchase(isVip() ? 'Extend VIP by 30 days?' : 'Start VIP membership?', '$4.99 / month', () => {
    state.vipUntil = Math.max(Date.now(), state.vipUntil) + 30 * 86400e3;
    Sound.play('reward'); buzz([20, 40, 20]);
    toast('VIP active for 30 days', 'crown', 'gold');
    saveGame(); identitySig = ''; render();
  }, 'vip');
}

function buyWarp(h) {
  const w = WARPS.find(x => x.h === h);
  if (!w) return;
  if (warpsUsed() >= WARPS_PER_DAY) {
    showModal('Time warps used up', `You can use ${WARPS_PER_DAY} time warps per day. They recharge at midnight.`, { icon: 'clock', tone: 'cyan' });
    return;
  }
  const amount = incomePerSec(false) * h * 3600;
  spendGems(w.cost, `a ${h}-hour time warp (${money(amount)})`, () => {
    earn(amount);
    state.warps = { day: dayKey(), n: warpsUsed() + 1 };
    toast(`Time warp: +${money(amount)}`, 'clock', 'cyan');
  }, `warp_${h}`);
}

function buyShopBoost(id) {
  const b = SHOP_BOOSTS.find(x => x.id === id);
  if (!b || (id === 'golden' && state.owned.golden)) return;
  spendGems(b.cost, b.name, () => {
    if (id === 'golden') state.owned.golden = true;
    if (id === 'shield') { state.shieldUntil = Math.max(Date.now(), state.shieldUntil) + 24 * 3600e3; state.attack = null; }
    if (id === 'grant') state.rp += Math.max(200, rpRate() * 3600);
    toast(`${b.name} activated`, b.icon, b.tone);
  }, id);
}

function pickFlag(i) {
  if (flagOwned(i)) { state.player.flag = i; saveGame(); shopSig = ''; render(); return; }
  spendGems(FLAG_PRICES[i], `the ${FLAG_NAMES[i]} flag`, () => {
    if (!state.owned.flags.includes(i)) state.owned.flags.push(i);
    state.player.flag = i;
    buildPickers();
  }, `flag_${i}`);
}

function pickTone(k) {
  if (toneOwned(k)) { state.player.tone = k; saveGame(); buildPickers(); render(); return; }
  spendGems(TONE_PRICES[k], `the ${k} avatar color`, () => {
    if (!state.owned.tones.includes(k)) state.owned.tones.push(k);
    state.player.tone = k;
    buildPickers();
  }, `tone_${k}`);
}

// Rewarded-ad placeholder: VIP players skip it.
let adTimer = null;
function watchAd(onReward) {
  if (isVip()) { onReward(); return; }
  if (overlayOpen()) return;
  const start = Date.now(), len = 3000;
  $('adOverlay').hidden = false;
  updateCoach();
  adTimer = setInterval(() => {
    const left = len - (Date.now() - start);
    $('adBar').style.width = `${Math.min(100, (1 - left / len) * 100)}%`;
    $('adText').textContent = left > 0 ? `Your reward arrives in ${Math.ceil(left / 1000)} seconds` : 'Done!';
    if (left <= 0) {
      clearInterval(adTimer);
      $('adOverlay').hidden = true;
      onReward();
      if (!overlayOpen()) nextOverlay();
    }
  }, 100);
}

let shopSig = '';
function renderShop(now) {
  $('shopGems').textContent = fmt(state.gems);
  $('vipStatus').textContent = isVip() ? `Active · ${Math.ceil((state.vipUntil - now) / 86400e3)} days left` : 'Monthly membership';
  $('vipBtn').textContent = isVip() ? 'Extend VIP · $4.99' : 'Start VIP · $4.99 / month';
  const left = adGemsLeft();
  $('adGemsText').textContent = left > 0 ? `${isVip() ? 'VIP: no ad needed' : 'Watch a short ad'} · +5 gems (${left} of ${AD_GEMS_PER_DAY} left today)` : 'Come back tomorrow for more free gems';
  $('adGemsBtn').disabled = left <= 0;
  $('adGemsBtn').textContent = isVip() ? 'Claim' : 'Watch';

  const ips = incomePerSec(false);
  const sig = [state.gems, warpsUsed(), fmt(ips), state.owned.golden, state.owned.flags.join(), state.owned.tones.join(), state.player.flag, state.player.tone, Math.floor(state.shieldUntil / 60e3), fmt(rpRate())].join('|');
  if (sig === shopSig) return;
  shopSig = sig;
  if (!$('gemPacks').children.length) {
    $('gemPacks').innerHTML = GEM_PACKS.map(p => `<button class="pack" data-pack="${p.id}">
      ${p.tag ? `<span class="tag">${p.tag}</span>` : ''}${icon('gem')}<b>${fmt(p.gems)}</b><span class="price">${p.price}</span></button>`).join('');
  }
  const warpsLeft = WARPS_PER_DAY - warpsUsed();
  $('warpInfo').textContent = `Get hours of income instantly, at the full rate. ${warpsLeft} of ${WARPS_PER_DAY} left today.`;
  $('warps').innerHTML = WARPS.map(w => {
    const can = state.gems >= w.cost && warpsLeft > 0;
    return `<div class="row">${tile('clock', 'cyan')}
      <div class="row-title"><span class="nm">${w.h} hour${w.h > 1 ? 's' : ''} of income</span></div>
      <button class="buy gem ${can ? 'can' : ''}" data-warp="${w.h}">Warp<small>${gemCost(w.cost)}</small></button>
      <div class="row-sub"><span>+${money(ips * w.h * 3600)} instantly</span></div></div>`;
  }).join('');
  $('shopBoosts').innerHTML = SHOP_BOOSTS.map(b => {
    const owned = b.id === 'golden' && state.owned.golden;
    const active = b.id === 'shield' && now < state.shieldUntil;
    const can = state.gems >= b.cost;
    const btn = owned ? `<button class="buy" disabled>${icon('check', 'ic-sm')}<small>Owned</small></button>`
      : `<button class="buy gem ${can ? 'can' : ''}" data-sboost="${b.id}">${active ? 'Extend' : 'Buy'}<small>${gemCost(b.cost)}</small></button>`;
    return `<div class="row">${tile(b.icon, b.tone)}<div class="row-title"><span class="nm">${b.name}</span></div>${btn}
      <div class="row-sub"><span>${b.desc}${active ? ` Active for ${dur(state.shieldUntil - now)}.` : ''}</span></div></div>`;
  }).join('');
  $('shopFlags').innerHTML = Object.keys(FLAG_PRICES).map(Number).map(i =>
    `<button data-flag="${i}" class="${state.player.flag === i ? 'on' : ''}" aria-label="${FLAG_NAMES[i]} flag">${flagSvg(i)}${flagOwned(i) ? '' : lockBadge(FLAG_PRICES[i])}</button>`).join('');
  $('shopTones').innerHTML = Object.keys(TONE_PRICES).map(k => {
    const [c1, c2] = TONE_COLORS[k];
    return `<button data-tone="${k}" class="${state.player.tone === k ? 'on' : ''}"><span class="swatch" style="--c1:${c1};--c2:${c2}"></span>${toneOwned(k) ? k : gemCost(TONE_PRICES[k])}</button>`;
  }).join('');
}

/* ---------------- Policies, research, eras ---------------- */

const POLICY_COOLDOWN = 60e3;
const POLICIES = [
  { id: 'tax', name: 'Tax Rate', icon: 'coin', options: [
    { label: 'Low', mods: { income: 0.85, welfare: 15 } },
    { label: 'Balanced', mods: {} },
    { label: 'High', mods: { income: 1.3, welfare: -20, popGrowth: 0.6 } } ] },
  { id: 'net', name: 'Internet Policy', icon: 'isp', options: [
    { label: 'Open', mods: { income: 1.15, defense: -0.15 } },
    { label: 'Balanced', mods: {} },
    { label: 'Firewall', mods: { defense: 0.2, income: 0.9 } } ] },
  { id: 'edu', name: 'Education', icon: 'book', options: [
    { label: 'Tech', mods: { research: 1.5, welfare: -5 } },
    { label: 'Balanced', mods: {} },
    { label: 'Social', mods: { welfare: 10, research: 0.8 } } ] },
  { id: 'trade', name: 'Trade', icon: 'globe', options: [
    { label: 'Export', mods: { influence: 1.25, offline: 0.2, breach: 1.5 } },
    { label: 'Balanced', mods: {} },
    { label: 'Self-reliant', mods: { breach: 0.5, income: 0.95 } } ] },
];

const RESEARCH = [
  // Economy
  { id: 'e1', branch: 'eco', name: 'Digital Taxes',            cost: 20,     mods: { tap: 2 },                         desc: 'Tap power ×2' },
  { id: 'e2', branch: 'eco', name: 'E-Commerce',               cost: 150,    mods: { income: 1.25 },                   desc: 'All income ×1.25' },
  { id: 'e3', branch: 'eco', name: 'Digital Currency (CBDC)',  cost: 1500,    mods: { income: 1.5 },                    desc: 'All income ×1.5' },
  { id: 'e4', branch: 'eco', name: 'Smart Contracts',          cost: 15000,   mods: { cost: 0.9 },                      desc: 'Sectors cost 10% less' },
  { id: 'e5', branch: 'eco', name: 'Open Banking',             cost: 2e5,   mods: { income: 1.5 },                    desc: 'All income ×1.5' },
  { id: 'e6', branch: 'eco', name: 'Tokenization',             cost: 3e6,   mods: { cost: 0.85 },                     desc: 'Sectors cost 15% less' },
  { id: 'e7', branch: 'eco', name: 'Real-Time Economy',        cost: 4e7,    mods: { income: 2 },                      desc: 'All income ×2' },
  // Society
  { id: 's1', branch: 'soc', name: 'Electronic Health Records', cost: 24,    mods: { welfare: 5 },                     desc: 'Welfare +5' },
  { id: 's2', branch: 'soc', name: 'Online Learning',          cost: 180,    mods: { research: 1.25 },                 desc: 'Research points ×1.25' },
  { id: 's3', branch: 'soc', name: 'e-Signatures',             cost: 1800,    mods: { popGrowth: 1.5, welfare: 5 },     desc: 'Population grows 50% faster · Welfare +5' },
  { id: 's4', branch: 'soc', name: 'Universal Connectivity',   cost: 18000,   mods: { welfare: 10, income: 1.1 },       desc: 'Welfare +10 · All income ×1.1' },
  { id: 's5', branch: 'soc', name: 'Internet Voting',          cost: 2.4e5,   mods: { welfare: 5, influence: 1.15 },    desc: 'Welfare +5 · Export influence ×1.15' },
  { id: 's6', branch: 'soc', name: 'Telemedicine',             cost: 3.6e6,   mods: { welfare: 8, popGrowth: 1.3 },     desc: 'Welfare +8 · Faster population growth' },
  { id: 's7', branch: 'soc', name: 'Digital Literacy',         cost: 4.8e7,   mods: { research: 1.5, defense: 0.05 },   desc: 'Research ×1.5 · Auto-defense +5%' },
  // Security
  { id: 'c1', branch: 'sec', name: 'Firewalls',                cost: 22,     mods: { defense: 0.1 },                   desc: 'Auto-defense +10%' },
  { id: 'c2', branch: 'sec', name: 'Threat Intelligence',      cost: 160,    mods: { window: 5 },                      desc: '+5 seconds to respond to attacks' },
  { id: 'c3', branch: 'sec', name: 'Public Key Infrastructure', cost: 1700,   mods: { defense: 0.1 },                   desc: 'Auto-defense +10%' },
  { id: 'c4', branch: 'sec', name: 'Zero Trust',               cost: 16000,   mods: { defense: 0.1 },                   desc: 'Auto-defense +10%' },
  { id: 'c5', branch: 'sec', name: 'AI Threat Detection',      cost: 2.2e5,   mods: { defense: 0.1, window: 3 },        desc: 'Auto-defense +10% · +3 seconds to respond' },
  { id: 'c6', branch: 'sec', name: 'Post-Quantum Cryptography', cost: 3.3e6,  mods: { breach: 0.5 },                    desc: 'Breaches steal half as much' },
  { id: 'c7', branch: 'sec', name: 'Cyber Resilience',         cost: 4.4e7,    mods: { breach: 0.6, defense: 0.05 },     desc: 'Breach damage ×0.6 · Auto-defense +5%' },
  // Infrastructure
  { id: 'i1', branch: 'inf', name: 'TCP/IP',                   cost: 26,     mods: { income: 1.1 },                    desc: 'All income ×1.1' },
  { id: 'i2', branch: 'inf', name: 'IPv6',                     cost: 190,    mods: { income: 1.15 },                   desc: 'All income ×1.15' },
  { id: 'i3', branch: 'inf', name: 'Virtualization',           cost: 1900,   mods: { cost: 0.95 },                     desc: 'Sectors cost 5% less' },
  { id: 'i4', branch: 'inf', name: 'Internet Exchange Points', cost: 19000,   mods: { income: 1.25 },                   desc: 'All income ×1.25' },
  { id: 'i5', branch: 'inf', name: 'Edge Computing',           cost: 2.6e5,   mods: { income: 1.3 },                    desc: 'All income ×1.3' },
  { id: 'i6', branch: 'inf', name: 'Smart Grid',               cost: 3.9e6,    mods: { income: 1.3, welfare: 3 },        desc: 'All income ×1.3 · Welfare +3' },
  { id: 'i7', branch: 'inf', name: 'Digital Twin',             cost: 5.2e7,   mods: { cost: 0.9 },                      desc: 'Sectors cost 10% less' },
  // Science & AI
  { id: 'a1', branch: 'sci', name: 'Machine Learning',         cost: 30,     mods: { research: 1.2 },                  desc: 'Research points ×1.2' },
  { id: 'a2', branch: 'sci', name: 'Big Data',                 cost: 220,    mods: { income: 1.15 },                   desc: 'All income ×1.15' },
  { id: 'a3', branch: 'sci', name: 'Deep Learning',            cost: 2200,   mods: { research: 1.3 },                  desc: 'Research points ×1.3' },
  { id: 'a4', branch: 'sci', name: 'Transformers (LLMs)',      cost: 22000,   mods: { tap: 3, research: 1.2 },          desc: 'Tap power ×3 · Research ×1.2' },
  { id: 'a5', branch: 'sci', name: 'Quantum Algorithms',       cost: 3e5,   mods: { research: 1.5 },                  desc: 'Research points ×1.5' },
  { id: 'a6', branch: 'sci', name: 'Neuromorphic Chips',       cost: 4.5e6,   mods: { income: 1.5 },                    desc: 'All income ×1.5' },
  { id: 'a7', branch: 'sci', name: 'AI Alignment',             cost: 6e7,   mods: { income: 2, welfare: 5 },          desc: 'All income ×2 · Welfare +5' },
  // Green tech
  { id: 'n1', branch: 'grn', name: 'Efficient Data Centers',   cost: 28,     mods: { income: 1.05, welfare: 2 },       desc: 'All income ×1.05 · Welfare +2' },
  { id: 'n2', branch: 'grn', name: 'Renewable Power',          cost: 210,    mods: { cost: 0.95, welfare: 3 },         desc: 'Sectors cost 5% less · Welfare +3' },
  { id: 'n3', branch: 'grn', name: 'E-Waste Recycling',        cost: 2100,   mods: { cost: 0.97, welfare: 3 },         desc: 'Sectors cost 3% less · Welfare +3' },
  { id: 'n4', branch: 'grn', name: 'Smart Mobility',           cost: 21000,   mods: { popGrowth: 1.2, welfare: 4 },     desc: 'Faster population growth · Welfare +4' },
  { id: 'n5', branch: 'grn', name: 'Carbon Accounting',        cost: 2.8e5,    mods: { influence: 1.15 },                desc: 'Export influence ×1.15' },
  { id: 'n6', branch: 'grn', name: 'Green Hydrogen',           cost: 4.2e6,   mods: { income: 1.3 },                    desc: 'All income ×1.3' },
  { id: 'n7', branch: 'grn', name: 'Energy Storage',           cost: 5.6e7,   mods: { income: 1.5, offline: 0.1 },      desc: 'All income ×1.5 · Offline earnings +10%' },
];
const BRANCHES = [
  { id: 'eco', name: 'Economy', icon: 'coins', tone: 'gold' },
  { id: 'soc', name: 'Society', icon: 'users', tone: 'rose' },
  { id: 'sec', name: 'Security', icon: 'shield', tone: 'bad' },
  { id: 'inf', name: 'Infrastructure', icon: 'iot', tone: 'cyan' },
  { id: 'sci', name: 'Science & AI', icon: 'ai', tone: 'violet' },
  { id: 'grn', name: 'Green Tech', icon: 'leaf', tone: 'green' },
];
// need: research projects completed · sector: must own one (it belongs to the previous era)
const ERAS = [
  { name: 'Connected Era',   need: 0,  mult: 1 },
  { name: 'Information Era', need: 4,  mult: 1.5,  sector: 'dc' },
  { name: 'Platform Era',    need: 10, mult: 2.25, sector: 'opendata' },
  { name: 'Smart Era',       need: 16, mult: 3.5,  sector: 'ehealth' },
  { name: 'AI Era',          need: 22, mult: 5,    sector: 'smart' },
  { name: 'Quantum Era',     need: 30, mult: 8,    sector: 'robotics' },
  { name: 'Space Era',       need: 38, mult: 12,   sector: 'quantum' },
];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

const MULT_KEYS = ['income', 'tap', 'research', 'popGrowth', 'cost', 'breach', 'influence'];
function mods() {
  const m = { income: 1, tap: 1, research: 1, popGrowth: 1, cost: 1, breach: 1, influence: 1, welfare: 0, defense: 0, window: 0, offline: 0 };
  const apply = src => { for (const [k, v] of Object.entries(src)) { if (MULT_KEYS.includes(k)) m[k] *= v; else m[k] += v; } };
  for (const p of POLICIES) apply(p.options[state.policies[p.id] ?? 1].mods);
  for (const n of RESEARCH) if (state.research[n.id]) apply(n.mods);
  return m;
}

function policiesUnlocked() { return owned('egov') >= 5 || state.policyChanges > 0; }
function researchUnlocked() { return owned('mbank') > 0 || researchCount() > 0; }
function researchCount() { return RESEARCH.filter(n => state.research[n.id]).length; }
function researchAvailable(n) {
  if (state.research[n.id]) return false;
  const prev = RESEARCH.filter(x => x.branch === n.branch);
  const i = prev.indexOf(n);
  return i === 0 || !!state.research[prev[i - 1].id];
}
function rpRate() {
  const base = 0.01 * totalOwned() + 0.05 * owned('egov') + 0.2 * owned('dc') + 0.5 * owned('opendata') + 1 * owned('cloud')
    + 2 * owned('edu') + 4 * owned('ai') + 8 * owned('quantum') + 16 * owned('agency');
  return base * mods().research;
}

function currentEra() {
  const n = researchCount();
  let e = 0;
  ERAS.forEach((era, i) => { if (n >= era.need && (!era.sector || owned(era.sector) > 0)) e = i; });
  return e;
}
function checkEra() {
  const e = currentEra();
  if (e > state.era) {
    state.era = e;
    gemEarn('era', String(e), 25);
    track('era_reached', { era: e, hours: Math.round(minutesPlayed() / 60) });
    Sound.play('reward'); buzz([30, 60, 30]);
    queueOverlay(() => showModal(`Welcome to the ${ERAS[e].name}`, `Your nation entered Era ${ROMAN[e]}. All income is now ×${ERAS[e].mult}, and you received 25 gems.`, { icon: 'flask', tone: 'cyan' }));
  }
}

function fmtMods(m) {
  const parts = [];
  const pct = v => `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`;
  const add = (good, text) => parts.push(`<span class="${good ? 'up' : 'down'}">${text}</span>`);
  if (m.income) add(m.income > 1, `Income ×${m.income}`);
  if (m.welfare) add(m.welfare > 0, `Welfare ${m.welfare > 0 ? '+' : '−'}${Math.abs(m.welfare)}`);
  if (m.popGrowth) add(m.popGrowth > 1, m.popGrowth > 1 ? 'Faster population growth' : 'Slower population growth');
  if (m.defense) add(m.defense > 0, `Auto-defense ${pct(m.defense)}`);
  if (m.research) add(m.research > 1, `Research ×${m.research}`);
  if (m.influence) add(m.influence > 1, `Export influence ×${m.influence}`);
  if (m.offline) add(m.offline > 0, `Offline earnings ${pct(m.offline)}`);
  if (m.breach) add(m.breach < 1, `Breach damage ×${m.breach}`);
  return parts.length ? parts.join(' · ') : '<span class="muted">No bonuses or penalties</span>';
}

function setPolicy(id, opt) {
  const now = Date.now();
  if (!policiesUnlocked() || state.policies[id] === opt) return;
  if (now - (state.policyChangedAt[id] || 0) < POLICY_COOLDOWN) return;
  state.policies[id] = opt;
  state.policyChangedAt[id] = now;
  state.policyChanges++;
  track('policy_change', { id, opt });
  const p = POLICIES.find(x => x.id === id);
  Sound.play('buy'); buzz(15);
  toast(`${p.name}: ${p.options[opt].label}`, 'egov', 'cyan');
  saveGame();
  render();
}

// Research takes time: pay RP to start, one project at a time, progress continues offline.
const RESEARCH_TIME = [10 * 60, 3600, 4 * 3600, 16 * 3600, 48 * 3600, 96 * 3600, 192 * 3600]; // by position in the branch
function researchSeconds(n) {
  const i = RESEARCH.filter(x => x.branch === n.branch).indexOf(n);
  return RESEARCH_TIME[i] / mods().research;
}
function buyResearch(id) {
  const n = RESEARCH.find(x => x.id === id);
  if (!n || !researchUnlocked() || !researchAvailable(n) || state.rp < n.cost || state.researching) return;
  state.rp -= n.cost;
  state.researching = { id, left: researchSeconds(n), total: researchSeconds(n) };
  track('research_start', { id });
  Sound.play('buy'); buzz(12);
  toast(`Research started: ${n.name} (${dur(state.researching.left * 1000)})`, 'flask', 'cyan');
  researchSig = '';
  saveGame();
  render();
}

// Advances the running project by dt seconds and completes it when the time is up.
function progressResearch(dt) {
  const r = state.researching;
  if (!r) return;
  r.left -= dt;
  if (r.left <= 0) completeResearch(r.id);
}

function completeResearch(id) {
  const n = RESEARCH.find(x => x.id === id);
  state.researching = null;
  if (!n || state.research[id]) return;
  state.research[id] = Date.now();
  track('research_done', { id, n: researchCount(), min: minutesPlayed() });
  discover(id);
  Sound.play('upgrade'); buzz([12, 40, 12]);
  toast(`Research complete: ${n.name} · new encyclopedia entry`, 'flask', 'cyan');
  researchSig = '';
  saveGame();
}

let govTab = 'policies';
let policiesBuilt = false;
function renderPolicies(now) {
  const unlocked = policiesUnlocked();
  $('policyLock').hidden = unlocked;
  if (!unlocked) $('policyLockText').textContent = `Build 5 E-Government portals to start making national policy (${owned('egov')} / 5).`;
  if (!policiesBuilt) {
    policiesBuilt = true;
    $('policies').innerHTML = POLICIES.map(p => `<div class="card policy" data-pid="${p.id}">
      <div class="policy-head">${tile(p.icon, 'cyan')}<span><span class="card-title">${p.name}</span><span class="policy-cd" data-f="cd"></span></span></div>
      <div class="policy-opts">${p.options.map((o, i) => `<button data-policy="${p.id}" data-opt="${i}">${o.label}</button>`).join('')}</div>
      <div class="policy-effect" data-f="fx"></div></div>`).join('');
  }
  for (const card of $('policies').children) {
    const p = POLICIES.find(x => x.id === card.dataset.pid);
    const sel = state.policies[p.id] ?? 1;
    const wait = POLICY_COOLDOWN - (now - (state.policyChangedAt[p.id] || 0));
    card.querySelectorAll('button').forEach((b, i) => {
      b.classList.toggle('on', i === sel);
      b.disabled = !unlocked || (wait > 0 && i !== sel);
    });
    card.querySelector('[data-f="fx"]').innerHTML = fmtMods(p.options[sel].mods);
    card.querySelector('[data-f="cd"]').textContent = !unlocked ? 'Locked' : (wait > 0 ? `Can change again in ${dur(wait)}` : 'You can change this now');
  }
}

let researchSig = '';
function renderResearch() {
  const unlocked = researchUnlocked();
  $('researchLock').hidden = unlocked;
  $('researchBody').hidden = !unlocked;
  if (!unlocked) return;
  $('rpValue').textContent = `${fmt(state.rp)} RP`;
  $('rpRate').textContent = `+${fmt(rpRate())}/s`;
  const run = state.researching;
  const runRow = run && $('research').querySelector(`[data-running="${run.id}"]`);
  if (runRow) {
    runRow.querySelector('[data-f="left"]').textContent = dur(Math.max(0, run.left) * 1000);
    runRow.querySelector('[data-f="bar"]').style.width = `${Math.min(100, (1 - run.left / run.total) * 100)}%`;
  }
  const sig = (run ? `R${run.id}|` : '') + RESEARCH.map(n => `${n.id}${state.research[n.id] ? 'd' : researchAvailable(n) ? (state.rp >= n.cost ? 'a' : 'w') : 'l'}`).join('');
  if (sig === researchSig) return;
  researchSig = sig;
  $('research').innerHTML = BRANCHES.map(b => `<div class="branch">
    <div class="branch-head">${icon(b.icon, 'ic-sm')}${b.name}</div>
    ${RESEARCH.filter(n => n.branch === b.id).map(n => {
      const done = !!state.research[n.id], running = run && run.id === n.id;
      const avail = researchAvailable(n) && !running, can = avail && !run && state.rp >= n.cost;
      const cls = done ? 'done' : (avail || running ? '' : 'locked');
      const time = dur(researchSeconds(n) * 1000);
      const btn = done ? `<button class="buy" disabled>${icon('check', 'ic-sm')}<small>Done</small></button>`
        : running ? `<button class="buy" disabled>Running<small data-f="left">${dur(Math.max(0, run.left) * 1000)}</small></button>`
        : `<button class="buy rp ${can ? 'can' : ''}" data-res="${n.id}" ${can ? '' : 'disabled'}>${!avail ? 'Locked' : run ? 'Lab busy' : 'Research'}<small>${fmt(n.cost)} RP · ${time}</small></button>`;
      const sub = running ? `<span>${n.desc}</span><span class="meter"><i data-f="bar" style="width:${Math.min(100, (1 - run.left / run.total) * 100)}%"></i></span>` : `<span>${n.desc}</span>`;
      return `<div class="row node ${cls}" ${running ? `data-running="${n.id}"` : ''}>${tile(done ? 'check' : 'flask', done ? 'green' : b.tone)}
        <div class="row-title"><span class="nm">${n.name}</span>${done ? infoBtn(n.id) : ''}</div>${btn}
        <div class="row-sub">${sub}</div></div>`;
    }).join('')}</div>`).join('');
}

function renderEra() {
  const e = currentEra(), era = ERAS[e], next = ERAS[e + 1];
  $('eraNum').textContent = `Era ${ROMAN[e]}`;
  $('eraName').textContent = era.name;
  $('eraMult').textContent = `×${era.mult}`;
  if (!next) {
    $('eraNext').textContent = 'The final era. Your nation leads the world in technology.';
    $('eraBar').style.width = '100%';
    return;
  }
  const n = researchCount();
  const needSector = next.sector && owned(next.sector) === 0 ? ` and build ${/^[AEIOU]/.test(SECTORS.find(s => s.id === next.sector).name) ? 'an' : 'a'} ${SECTORS.find(s => s.id === next.sector).name}` : '';
  $('eraNext').textContent = `Complete ${next.need} research projects${needSector} to reach the ${next.name} (×${next.mult})`;
  $('eraBar').style.width = `${Math.min(100, (n / next.need) * 100)}%`;
}

/* ---------------- Cyber mini-game ---------------- */

const GAME_HITS = 5;
let game = null;
function startGame() {
  if (!state.attack || game) return;
  game = { hits: 0, cell: -1, moveAt: 0 };
  $('gameGrid').innerHTML = Array.from({ length: 9 }, (_, i) => `<button class="cell" data-cell="${i}" aria-label="Server ${i + 1}">${icon('bug')}</button>`).join('');
  $('gameHits').textContent = `0 / ${GAME_HITS}`;
  $('cyberGame').hidden = false;
  moveBug();
  updateCoach();
}
function moveBug() {
  if (!game) return;
  let c;
  do c = Math.floor(Math.random() * 9); while (c === game.cell);
  game.cell = c;
  game.moveAt = Date.now() + Math.max(650, 1100 - game.hits * 90);
  $('gameGrid').querySelectorAll('.cell').forEach((el, i) => el.classList.toggle('bug', i === c));
}
function hitCell(i, el) {
  if (!game) return;
  if (i !== game.cell) {
    el.classList.remove('miss'); void el.offsetWidth; el.classList.add('miss');
    return;
  }
  game.hits++;
  $('gameHits').textContent = `${game.hits} / ${GAME_HITS}`;
  Sound.play('tap'); buzz(10);
  if (game.hits >= GAME_HITS) {
    closeGame();
    state.gamesWon++;
    gemEarn('minigame', '', 2);
    repelAttack();
    render();
    return;
  }
  moveBug();
}
function closeGame() {
  game = null;
  $('cyberGame').hidden = true;
  if (!overlayOpen()) nextOverlay();
}

/* ---------------- Anonymous statistics (opt-in) ---------------- */

// Sent only when the player agreed. Linked to a random ID, never to the email.
const APP_VERSION = '0.9.0';
const ANON_KEY = 'digitalnation_anon_id';
const SESSION_ID = Math.random().toString(36).slice(2, 12);
const eventQueue = [];

function anonId() {
  let id = null;
  try { id = localStorage.getItem(ANON_KEY); } catch (e) { /* storage unavailable */ }
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem(ANON_KEY, id); } catch (e) { /* storage unavailable */ }
  }
  return id;
}
const minutesPlayed = () => Math.round((Date.now() - state.startedAt) / 60000);

function track(name, props = {}) {
  if (state.settings.analytics !== true) return;
  eventQueue.push({ anon_id: anonId(), name, props, session_id: SESSION_ID, app_version: APP_VERSION });
  if (eventQueue.length > 200) eventQueue.splice(0, eventQueue.length - 200);
  if (eventQueue.length >= 20) flushEvents();
}

let flushing = false;
async function flushEvents() {
  if (flushing || !eventQueue.length || !cloud.client || state.settings.analytics !== true) return;
  flushing = true;
  const batch = eventQueue.splice(0, 50);
  try {
    const { error } = await cloud.client.from('events').insert(batch);
    if (error) throw error;
  } catch (e) {
    eventQueue.unshift(...batch); // try again later
  }
  flushing = false;
}

function setAnalytics(on) {
  state.settings.analytics = !!on;
  if (!on) eventQueue.length = 0;
  saveGame();
  render();
  if (on) track('stats_on', {});
}

// Asked once, after the tutorial, only where statistics can be sent.
let analyticsAsked = false;
function maybeAskAnalytics() {
  if (analyticsAsked || state.settings.analytics !== null || !cloud.client || overlayOpen()) return;
  if (!COACH.filter(c => c.tut).every(c => state.coach[c.id])) return;
  analyticsAsked = true;
  queueOverlay(() => showModal('Help improve Digital Nation?',
    'Share anonymous gameplay statistics, such as when you finish the tutorial or reach a new era. They are linked to a random ID, never to your email, and help us balance the game. You can change this any time in Profile → Settings.', {
      icon: 'chart', tone: 'cyan', okText: 'Share stats', cancelText: 'No thanks',
      onOk: () => setAnalytics(true),
      onCancel: () => setAnalytics(false),
    }));
}

/* ---------------- Sound + haptics ---------------- */

const Sound = (() => {
  let ctx = null, lastTap = 0;
  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { ctx = new C(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  function tone(freq, dur, { type = 'sine', vol = 0.08, delay = 0, slide = 0 } = {}) {
    const a = ac();
    if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
  const SFX = {
    tap: () => {
      const now = performance.now();
      if (now - lastTap < 45) return;
      lastTap = now;
      tone(820 + Math.random() * 120, 0.07, { type: 'triangle', vol: 0.05, slide: 1.35 });
    },
    buy: () => { tone(523, 0.08, { type: 'triangle' }); tone(784, 0.13, { type: 'triangle', delay: 0.07 }); },
    upgrade: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.13, { type: 'triangle', vol: 0.07, delay: i * 0.06 })),
    reward: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.2, { vol: 0.07, delay: i * 0.08 })),
    alarm: () => [0, 0.26, 0.52].forEach(d => { tone(740, 0.12, { type: 'square', vol: 0.03, delay: d }); tone(554, 0.12, { type: 'square', vol: 0.03, delay: d + 0.13 }); }),
    defend: () => { tone(392, 0.1, { type: 'triangle' }); tone(784, 0.22, { type: 'triangle', delay: 0.08 }); },
    breach: () => tone(220, 0.45, { type: 'sawtooth', vol: 0.05, slide: 0.5 }),
  };
  return {
    play(name) { if (!state.settings.sound || !SFX[name]) return; try { SFX[name](); } catch (e) { /* audio unavailable */ } },
    unlock() { if (state.settings.sound) ac(); },
  };
})();

function buzz(pattern) {
  if (!state.settings.vibration || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch (e) { /* not supported */ }
}

/* ---------------- Overlays (modal + daily) queue ---------------- */

const overlayQueue = [];
function overlayOpen() { return !$('modal').hidden || !$('daily').hidden || !$('cyberGame').hidden || !$('adOverlay').hidden || !$('auth').hidden || !$('learn').hidden; }
function queueOverlay(fn) { if (overlayOpen()) overlayQueue.push(fn); else fn(); }
function nextOverlay() { const fn = overlayQueue.shift(); if (fn) fn(); updateCoach(); }

/* ---------------- Daily reward ---------------- */

// minutes of current income, with a floor for brand-new nations
const DAILY = [
  { min: 10, base: 100 }, { min: 15, base: 300 }, { min: 20, base: 800, gems: 5 }, { min: 30, base: 2000 },
  { min: 45, base: 5000, gems: 10 }, { min: 60, base: 12000 }, { min: 120, base: 30000, boost: 30, gems: 20 },
];
function dayKey(d = new Date()) { return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
function yesterdayKey() { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); }
function msToMidnight() { const d = new Date(); d.setHours(24, 0, 0, 0); return d - Date.now(); }

function dailyStatus() {
  const d = state.daily;
  if (d.last === dayKey()) return { ready: false, day: d.streak };
  const continues = d.last === yesterdayKey() && d.streak < DAILY.length;
  return { ready: true, day: continues ? d.streak + 1 : 1 };
}
function dailyAmount(day) { const r = DAILY[day - 1]; return Math.max(r.base, incomePerSec(false) * r.min * 60); }

function renderDaily() {
  const st = dailyStatus();
  $('dailyGrid').innerHTML = DAILY.map((r, i) => {
    const day = i + 1;
    const done = st.ready ? day < st.day : day <= st.day;
    const today = st.ready && day === st.day;
    const cls = `day ${day === DAILY.length ? 'big' : ''} ${done ? 'done' : ''} ${today ? 'today' : ''}`;
    const extra = r.boost ? ` + 2× ${r.boost}m` : '';
    const gems = (r.gems || 0) + (isVip() ? 10 : 0);
    const gemTxt = gems ? `<span class="gem-mini">${icon('gem')}+${gems}</span>` : '';
    return `<div class="${cls}">Day ${day}${icon(done ? 'check' : (r.boost ? 'gift' : 'coin'))}<b>${money(dailyAmount(day))}${extra}</b>${gemTxt}</div>`;
  }).join('');
  $('dailyClaim').hidden = !st.ready;
  $('dailyClose').textContent = st.ready ? 'Later' : 'Close';
  $('dailySub').textContent = st.ready
    ? (st.day === 1 ? 'Come back every day. Rewards grow with each day in a row.' : `Day ${st.day} in a row. Keep the streak going!`)
    : `Claimed for today. Next reward in ${dur(msToMidnight())}.`;
}

function showDaily() { renderDaily(); $('daily').hidden = false; updateCoach(); }
function closeDaily() { $('daily').hidden = true; if (!overlayOpen()) nextOverlay(); }

function claimDaily() {
  const st = dailyStatus();
  if (!st.ready) return;
  const amount = dailyAmount(st.day);
  earn(amount);
  const r = DAILY[st.day - 1];
  if (r.boost) state.boostUntil = Math.max(Date.now(), state.boostUntil) + r.boost * 60e3;
  const gems = (r.gems || 0) + (isVip() ? 10 : 0);
  if (r.gems) gemEarn('daily', dayKey(), r.gems);
  if (isVip()) gemEarn('vip_daily', dayKey(), 10);
  state.daily = { streak: st.day, last: dayKey(), best: Math.max(state.daily.best, st.day) };
  track('daily_claim', { day: st.day });
  saveGame();
  Sound.play('reward'); buzz([20, 40, 20]);
  toast(`Day ${st.day} reward: ${money(amount)}${gems ? ` · +${gems} gems` : ''}`, 'gift', 'rose');
  closeDaily();
  render();
}

let dailyAutoShown = '';
function maybeAutoDaily() {
  const tutorialDone = COACH.filter(c => c.tut).every(c => state.coach[c.id]);
  if (!tutorialDone || dailyAutoShown === dayKey() || !dailyStatus().ready) return;
  dailyAutoShown = dayKey();
  queueOverlay(showDaily);
}

/* ---------------- Tutorial + one-time tips (coach marks) ---------------- */

const tabBtn = name => document.querySelector(`.tabbar [data-screen="${name}"]`);
const COACH = [
  { id: 't1', tut: true, screen: 'nation', target: () => $('tap'),
    text: 'Welcome, Leader! Tap <b>Collect Taxes</b> to raise your first $15.', until: () => state.gdp >= 15 || owned('isp') > 0 },
  { id: 't2', tut: true, target: () => tabBtn('sectors'),
    text: 'Well done. Now open <b>Sectors</b> to invest in your country.', until: () => screen === 'sectors' || owned('isp') > 0 },
  { id: 't3', tut: true, screen: 'sectors', target: () => document.querySelector('[data-buy="isp"]'),
    text: 'Build your first <b>Internet Provider</b>. It earns GDP every second.', until: () => owned('isp') > 0 },
  { id: 't4', tut: true, target: () => document.querySelector('.ips-pill'), button: "Let's go",
    text: 'Your nation now earns on its own, even while you are away. Keep building to climb the world ranking!' },
  { id: 'tipSec', when: () => !!state.attack, target: () => $('repel'),
    text: 'Hackers are attacking! Tap <b>Defend</b>, then catch the malware before the timer runs out.', until: () => !state.attack },
  { id: 'tipUpg', when: () => availableUpgrades().some(u => state.gdp >= u.cost), target: () => tabBtn('upgrades'),
    text: 'An <b>upgrade</b> is ready. Upgrades multiply your income.', until: () => screen === 'upgrades' },
  { id: 'tipPolicy', when: () => policiesUnlocked(), target: () => tabBtn('global'),
    text: 'You can now set <b>national policy</b>. Every choice has a benefit and a cost.', until: () => screen === 'global' },
  { id: 'tipResearch', when: () => researchUnlocked() && state.rp >= RESEARCH[0].cost, target: () => tabBtn('global'),
    text: 'Your first <b>research</b> project is ready. Research is permanent.', until: () => screen === 'global' && govTab === 'research' },
  { id: 'tipShop', when: () => state.gems >= 50, target: () => $('gemBtn'),
    text: 'You have <b>gems</b>! Spend them in the shop on time warps, boosts and premium flags.', until: () => screen === 'shop' },
  { id: 'tipAccount', when: () => cloudAvailable() && !cloud.user && state.lifeEarned >= 1e5, target: () => $('profileBtn'),
    text: 'Your nation is growing. <b>Sign in</b> from your profile to keep it safe and play on any device.', until: () => screen === 'profile' || !!cloud.user },
  { id: 'tipLearn', when: () => pendingQuizzes().length > 0, screen: 'nation', target: () => $('libraryCard'),
    text: 'New <b>encyclopedia</b> entries! Learn how real digital nations work and answer quizzes for gems.', until: () => screen === 'library' },
  { id: 'tipExport', when: () => claimableInfluence() >= 1, target: () => tabBtn('global'),
    text: 'You can now <b>export technology</b> for permanent Influence.', until: () => screen === 'global' },
];

function currentCoach() {
  const tutDone = COACH.filter(c => c.tut).every(c => state.coach[c.id]);
  for (const c of COACH) {
    if (state.coach[c.id]) continue;
    if (c.tut) return c;              // tutorial steps run in order
    if (tutDone && c.when()) return c; // tips appear once their moment comes
  }
  return null;
}

let coachShown = '';
function updateCoach() {
  let c = currentCoach();
  while (c && c.until && c.until()) { state.coach[c.id] = 1; if (c.tut) track('tutorial_step', { step: c.id }); c = currentCoach(); }
  const bubble = $('coach'), ring = $('coachRing');
  const target = c && (!c.screen || c.screen === screen) && !overlayOpen() ? c.target() : null;
  if (!target || target.getClientRects().length === 0) { bubble.hidden = true; ring.hidden = true; return; }

  if (coachShown !== c.id) {
    coachShown = c.id;
    const skip = c.tut && c.id !== 't4' ? '<button class="coach-skip" data-coach="skip">Skip tutorial</button>' : '';
    const okLabel = c.button || (c.tut ? '' : 'Got it');
    const ok = okLabel ? `<button class="btn btn-gold" data-coach="ok">${okLabel}</button>` : '';
    bubble.innerHTML = `<div>${c.text}</div><div class="coach-actions">${skip}${ok}</div>`;
  }
  const r = target.getBoundingClientRect();
  const pad = 6;
  ring.hidden = false;
  Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });

  bubble.hidden = false;
  const bw = Math.min(320, window.innerWidth - 32);
  bubble.style.width = `${bw}px`;
  const bh = bubble.offsetHeight;
  const below = r.top + r.height / 2 < window.innerHeight / 2;
  const top = below ? r.bottom + pad + 14 : r.top - pad - 14 - bh;
  const left = Math.max(16, Math.min(window.innerWidth - 16 - bw, r.left + r.width / 2 - bw / 2));
  bubble.dataset.side = below ? 'below' : 'above';
  bubble.style.top = `${top}px`;
  bubble.style.left = `${left}px`;
  bubble.style.setProperty('--ax', `${Math.max(18, Math.min(bw - 18, r.left + r.width / 2 - left))}px`);
}

/* ---------------- Loop ---------------- */

let lastTick = Date.now();
let skyTimer = 0;
let achTimer = 0;
function tick() {
  const now = Date.now();
  const dt = Math.min(1, (now - lastTick) / 1000); // long gaps are handled by applyOffline
  lastTick = now;
  earn(incomePerSec() * dt);
  state.pop += (popTarget() - state.pop) * Math.min(1, dt * 0.05 * mods().popGrowth);
  if (researchUnlocked()) state.rp += rpRate() * dt;
  progressResearch(dt);
  checkEra();
  if (game && now >= game.moveAt) moveBug();
  if (game) $('gameBar').style.width = state.attack ? `${Math.max(0, (state.attack.endsAt - now) / (state.attack.len || ATTACK_WINDOW)) * 100}%` : '0%';
  updateAttack(now);
  if (now - achTimer > 1000) { achTimer = now; checkAchievements(false); maybeAutoDaily(); maybeAskAnalytics(); }
  render();
  if (now - skyTimer > (reduceMotion ? 3000 : 150)) { skyTimer = now; drawSkyline(); }
}

function bindUI() {
  $('tap').addEventListener('click', e => {
    const v = clickValue();
    earn(v);
    state.clicks++;
    Sound.play('tap'); buzz(6);
    const f = document.createElement('span');
    f.className = 'floater';
    f.textContent = '+' + money(v);
    const box = $('tap').getBoundingClientRect();
    const x = e.clientX || box.left + box.width / 2;
    const y = e.clientY || box.top + box.height / 2;
    f.style.left = `${x - 20}px`;
    f.style.top = `${y - 30}px`;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 900);
    render();
  });
  $('boost').addEventListener('click', () => { if (Date.now() >= state.boostReadyAt) watchAd(() => { activateBoost(); render(); }); });
  $('gemBtn').addEventListener('click', () => showScreen('shop'));
  $('rankBtn').addEventListener('click', showTechIndex);
  $('libraryCard').addEventListener('click', () => showScreen('library'));
  $('libraryBack').addEventListener('click', () => showScreen(lastTab));
  $('learnClose').addEventListener('click', closeEntry);
  $('quizOpts').addEventListener('click', e => { const b = e.target.closest('[data-opt]'); if (b) answerQuiz(Number(b.dataset.opt)); });
  // "i" buttons on sector and research rows, and rows in the encyclopedia
  for (const id of ['sectors', 'research', 'library']) {
    $(id).addEventListener('click', e => {
      const b = e.target.closest('[data-learn]');
      if (b) { e.stopPropagation(); openEntry(b.dataset.learn); }
    });
  }
  $('shopBack').addEventListener('click', () => showScreen(lastTab));
  $('vipBtn').addEventListener('click', buyVip);
  $('adGemsBtn').addEventListener('click', () => { if (adGemsLeft() > 0) watchAd(() => { state.adGems = { day: dayKey(), n: adGemsUsed() + 1 }; addGems(5, 'Ad reward', { reason: 'ad', ref: '' }); }); });
  $('gemPacks').addEventListener('click', e => { const b = e.target.closest('[data-pack]'); if (b) buyPack(b.dataset.pack); });
  $('warps').addEventListener('click', e => { const b = e.target.closest('[data-warp]'); if (b) buyWarp(Number(b.dataset.warp)); });
  $('shopBoosts').addEventListener('click', e => { const b = e.target.closest('[data-sboost]'); if (b) buyShopBoost(b.dataset.sboost); });
  $('shopFlags').addEventListener('click', e => { const b = e.target.closest('[data-flag]'); if (b) pickFlag(Number(b.dataset.flag)); });
  $('shopTones').addEventListener('click', e => { const b = e.target.closest('[data-tone]'); if (b) pickTone(b.dataset.tone); });
  $('repel').addEventListener('click', () => { startGame(); render(); });
  $('gameGrid').addEventListener('pointerdown', e => {
    const c = e.target.closest('[data-cell]');
    if (c) { e.preventDefault(); hitCell(Number(c.dataset.cell), c); }
  });
  $('lbRefresh').addEventListener('click', () => loadLeaderboard(true));
  $('lbJoin').addEventListener('click', openAuth);
  $('govTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-gov]');
    if (b) { govTab = b.dataset.gov; researchSig = ''; render(); }
  });
  $('policies').addEventListener('click', e => {
    const b = e.target.closest('[data-policy]');
    if (b) setPolicy(b.dataset.policy, Number(b.dataset.opt));
  });
  $('research').addEventListener('click', e => {
    const b = e.target.closest('[data-res]');
    if (b) buyResearch(b.dataset.res);
  });
  $('buySec').addEventListener('click', () => { buySecurity(); render(); });
  $('prestige').addEventListener('click', doPrestige);
  $('goal').addEventListener('click', () => showScreen('sectors'));
  $('modalOk').addEventListener('click', () => closeModal(true));
  $('modalCancel').addEventListener('click', () => closeModal(false));
  $('accountBtn').addEventListener('click', openAuth);
  $('syncNow').addEventListener('click', () => syncNow());
  $('deleteAccount').addEventListener('click', askDeleteAccount);
  $('signOut').addEventListener('click', () => {
    showModal('Sign out?', 'Your progress stays on this device and in your account. Sign in again any time to keep syncing.', {
      icon: 'logout', tone: 'cyan', okText: 'Sign out', onOk: signOut,
    });
  });
  $('authEmailForm').addEventListener('submit', e => { e.preventDefault(); submitEmail(); });
  $('authCodeForm').addEventListener('submit', e => { e.preventDefault(); submitCode(); });
  $('authCode').addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    if (e.target.value.length === 6) submitCode();
  });
  $('authBack').addEventListener('click', () => showAuthStep('email'));
  $('authClose').addEventListener('click', closeAuth);
  $('modalInput').addEventListener('keydown', e => { if (e.key === 'Enter') closeModal(true); });

  $('sectors').addEventListener('click', e => {
    const b = e.target.closest('[data-buy]');
    if (b) { buySector(b.dataset.buy); render(); }
  });
  $('upgrades').addEventListener('click', e => {
    const b = e.target.closest('[data-upg]');
    if (b) { buyUpgrade(b.dataset.upg); render(); }
  });
  $('buyAmt').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    buyAmt = b.dataset.amt === 'max' ? 'max' : Number(b.dataset.amt);
    for (const x of $('buyAmt').children) x.classList.toggle('on', x === b);
    render();
  });
  document.querySelector('.tabbar').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) showScreen(b.dataset.screen);
  });
  $('nationBtn').addEventListener('click', () => showScreen('profile'));
  $('profileBtn').addEventListener('click', () => showScreen('profile'));
  $('profileBack').addEventListener('click', () => showScreen(lastTab));
  $('editNation').addEventListener('click', () => {
    showModal('Name your nation', 'Choose a name for your digital state.', {
      icon: 'pencil', tone: 'cyan', input: state.nation, okText: 'Save',
      onOk: n => { if (n && n.trim()) { state.nation = n.trim().slice(0, 32); saveGame(); render(); } },
    });
  });
  $('editPlayer').addEventListener('click', () => {
    showModal('Your name', 'How should your citizens address you?', {
      icon: 'users', tone: 'gold', input: state.player.name, okText: 'Save',
      onOk: n => { if (n && n.trim()) { state.player.name = n.trim().slice(0, 24); saveGame(); render(); } },
    });
  });
  $('avatarIcons').addEventListener('click', e => {
    const b = e.target.closest('[data-avatar]');
    if (b) { state.player.avatar = b.dataset.avatar; saveGame(); render(); }
  });
  $('avatarTones').addEventListener('click', e => {
    const b = e.target.closest('[data-tone]');
    if (b) pickTone(b.dataset.tone);
  });
  $('flagPicker').addEventListener('click', e => {
    const b = e.target.closest('[data-flag]');
    if (b) pickFlag(Number(b.dataset.flag));
  });
  $('dailyCard').addEventListener('click', () => queueOverlay(showDaily));
  $('dailyClaim').addEventListener('click', claimDaily);
  $('dailyClose').addEventListener('click', closeDaily);
  $('setSound').addEventListener('click', () => { state.settings.sound = !state.settings.sound; Sound.play('tap'); saveGame(); render(); });
  $('setVibe').addEventListener('click', () => { state.settings.vibration = !state.settings.vibration; buzz(30); saveGame(); render(); });
  $('setStats').addEventListener('click', () => setAnalytics(state.settings.analytics !== true));
  $('replayTut').addEventListener('click', () => { for (const c of COACH) if (c.tut) delete state.coach[c.id]; coachShown = ''; showScreen('nation'); });
  $('coach').addEventListener('click', e => {
    const c = currentCoach();
    if (!c) return;
    if (e.target.closest('[data-coach="skip"]')) { track('tutorial_skip', { at: c.id }); for (const x of COACH) if (x.tut) state.coach[x.id] = 1; saveGame(); }
    else if (e.target.closest('[data-coach="ok"]')) { state.coach[c.id] = 1; if (c.id === 't4') track('tutorial_done', { min: minutesPlayed() }); saveGame(); }
    updateCoach();
  });
  // Browsers only allow audio after a user gesture.
  document.addEventListener('pointerdown', () => Sound.unlock(), { once: true });
  window.addEventListener('scroll', updateCoach, { passive: true });
  $('installBtn').addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    try { await deferredInstall.userChoice; } catch (e) { /* ignore */ }
    deferredInstall = null;
    renderInstall();
  });
  $('reset').addEventListener('click', () => {
    showModal('Reset everything?', 'All progress, including Influence, will be deleted. This cannot be undone.', {
      icon: 'trash', tone: 'bad', okText: 'Reset',
      onOk: () => { state = defaultState(); sectorSig = ''; upgSig = ''; achSig = ''; coachShown = ''; dailyAutoShown = ''; saveGame(); buildPickers(); showScreen('nation'); },
    });
  });

  window.addEventListener('resize', drawSkyline);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { saveGame(); cloudPause(); flushEvents(); }
    else { applyOffline(); lastTick = Date.now(); render(); maybeAutoDaily(); cloudResume(); }
  });
  window.addEventListener('beforeunload', saveGame);
}

postLoad();
bindUI();
buildPickers();
checkAchievements(true);
renderInstall();
registerServiceWorker();
initCloud();
applyOffline();
render();
maybeAutoDaily();
drawSkyline();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawSkyline);
setInterval(tick, 100);
setInterval(saveGame, 5000);
setInterval(cloudTick, CLOUD_PUSH_EVERY);
setInterval(flushEvents, 15e3);
track('session_start', { day: Math.floor((Date.now() - state.startedAt) / 86400e3), era: currentEra(), signedIn: !!readCloudMeta().uid });

// Debug / test hook
// Hooks for automated tests and tools/simulate.mjs (balance simulation).
window.DN = { get state() { return state; }, set state(v) { state = v; },
  sim: { buySector, buyUpgrade, buyResearch, buySecurity, costFor, sectorMult, globalMult, mods, rpRate, popTarget, welfare, totalOwned, owned,
    researchAvailable, claimableInfluence, performPrestige, currentEra, checkEra, secCost, dailyAmount, DAILY, isUnlocked, availableUpgrades,
    clickValue, earn, ERAS, SEC_MAX, OFFLINE_EFFICIENCY, OFFLINE_MAX_SEC, progressResearch, researchSeconds },
  flushEvents, walletMode, flushEarns, techIndex, techRank, openEntry, pendingQuizzes, libEntries, cloud, cloudResume, syncNow, isVip, addGems, incomePerSec, earn, render, showScreen, dailyStatus, mods, rpRate, currentEra, SECTORS, UPGRADES, RESEARCH };
