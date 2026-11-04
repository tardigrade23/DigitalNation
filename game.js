'use strict';

/* =========================================================
 * Digital Nation — idle nation simulator (prototype)
 * ========================================================= */

const SAVE_KEY = 'digitalnation_save_v1';
const COST_GROWTH = 1.15;
const MILESTONES = [25, 50, 100, 200, 300, 400, 500];
const OFFLINE_MAX_SEC = 8 * 3600;
const OFFLINE_EFFICIENCY = 0.5;
const PRESTIGE_DIVISOR = 1e7;      // influence = floor(sqrt(runEarned / 1e7))
const INFLUENCE_BONUS = 0.10;      // +10% income per influence point
const BOOST_DURATION = 120e3;
const BOOST_COOLDOWN = 300e3;
const ATTACK_WINDOW = 12e3;
const DEBUFF_DURATION = 30e3;
const SEC_MAX = 7;
const DEFAULT_NATION = 'Digital Nation';
const DEFAULT_PLAYER = { name: 'Leader', avatar: 'ai', tone: 'gold', flag: 0 };

// c1/c2: icon tile gradient
const SECTORS = [
  { id: 'isp',     name: 'Internet Provider',  base: 15,     inc: 0.5,   c1: '#5AB8FF', c2: '#2563C9' },
  { id: 'egov',    name: 'E-Government',       base: 100,    inc: 4,     c1: '#7FD1C7', c2: '#1F8A7E' },
  { id: 'mbank',   name: 'Mobile Banking',     base: 1100,   inc: 20,    c1: '#FFB86B', c2: '#D9681C' },
  { id: 'fintech', name: 'Fintech Hub',        base: 12e3,   inc: 100,   c1: '#6EE29C', c2: '#1E9A5A' },
  { id: 'dc',      name: 'Data Center',        base: 130e3,  inc: 550,   c1: '#8FA3FF', c2: '#3B4FCF' },
  { id: 'g5',      name: '5G Network',         base: 1.4e6,  inc: 3000,  c1: '#FF8FAB', c2: '#C23A63' },
  { id: 'smart',   name: 'Smart City',         base: 2e7,    inc: 18e3,  c1: '#F7C75B', c2: '#C7800F' },
  { id: 'ai',      name: 'AI Lab',             base: 3.3e8,  inc: 110e3, c1: '#C29BFF', c2: '#6A3FD6' },
  { id: 'quantum', name: 'Quantum Computing',  base: 5.1e9,  inc: 700e3, c1: '#5EF0E0', c2: '#138A9C' },
  { id: 'space',   name: 'Satellite Internet', base: 7.5e10, inc: 5e6,   c1: '#B5C3D9', c2: '#4A5A75' },
];

const UPGRADES = [];
(function buildUpgrades() {
  const tiers = [
    { req: 10,  costMul: 50,  mult: 3, label: 'Optimization' },
    { req: 50,  costMul: 5e3, mult: 3, label: 'Automation' },
    { req: 150, costMul: 5e6, mult: 5, label: 'AI Integration' },
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
    ['AI Assistant',                 1.5, 5e4,  1e4],
    ['Government AI',                2,   5e6,  1e6],
    ['Neural Cloud',                 2,   5e8,  1e8],
    ['National Language Model',      3,   5e10, 1e10],
    ['Artificial General Intelligence', 5, 5e13, 1e13],
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
  return 100 * (1 - Math.exp(-score / 200));
}

function popTarget() { return 1e6 * (1 + totalOwned() * 0.015) * (1 + welfare() / 100); }

function globalMult(withTemp) {
  let m = 1;
  for (const u of UPGRADES) if (u.kind === 'global' && state.upgrades[u.id]) m *= u.mult;
  m *= 1 + welfare() / 100;
  m *= Math.sqrt(state.pop / 1e6);
  m *= 1 + state.influence * INFLUENCE_BONUS;
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
  return (1 + incomePerSec() * 0.05) * m;
}

function earn(x) { state.gdp += x; state.runEarned += x; state.lifeEarned += x; }

function costFor(s, n) {
  const r = COST_GROWTH;
  return s.base * Math.pow(r, owned(s.id)) * (Math.pow(r, n) - 1) / (r - 1);
}

function maxAffordable(s) {
  const r = COST_GROWTH;
  const c0 = s.base * Math.pow(r, owned(s.id));
  return Math.max(0, Math.floor(Math.log(state.gdp * (r - 1) / c0 + 1) / Math.log(r)));
}

function purchaseCount(s) { return buyAmt === 'max' ? Math.max(1, maxAffordable(s)) : buyAmt; }

function isUnlocked(i) { return i === 0 || owned(SECTORS[i - 1].id) > 0 || owned(SECTORS[i].id) > 0; }

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
  if (before === 0) toast(`${s.name} is online`, s.id, s);
  const hit = MILESTONES.filter(m => before < m && before + n >= m).pop();
  if (hit) toast(`${s.name} reached ${hit}: income ×2`, s.id, s);
}

function buyUpgrade(id) {
  const u = UPGRADES.find(x => x.id === id);
  if (!u || state.upgrades[id] || !u.unlocked() || state.gdp < u.cost) return;
  state.gdp -= u.cost;
  state.upgrades[id] = true;
  toast(`${u.name} activated`, u.icon, u);
}

/* ---------------- Cybersecurity ---------------- */

function secCost() { return 2000 * Math.pow(10, state.secLevel); }
function secChance() { return Math.min(0.95, 0.25 + state.secLevel * 0.1); }

function buySecurity() {
  if (state.secLevel >= SEC_MAX || state.gdp < secCost()) return;
  state.gdp -= secCost();
  state.secLevel++;
  toast(`Defense upgraded to level ${state.secLevel}`, 'shield-check', 'green');
}

function scheduleAttack(now) { state.nextAttack = now + (90 + Math.random() * 60) * 1000; }

function repelAttack() {
  if (!state.attack) return;
  const reward = Math.max(50, incomePerSec(false) * 20);
  earn(reward);
  state.attack = null;
  state.attacksRepelled++;
  scheduleAttack(Date.now());
  toast(`Attack stopped. Reward: ${money(reward)}`, 'shield-check', 'green');
}

function resolveAttack(now) {
  state.attack = null;
  if (Math.random() < secChance()) {
    state.attacksRepelled++;
    toast('Auto-defense blocked the attack', 'shield-check', 'green');
  } else {
    const stolen = state.gdp * 0.1;
    state.gdp -= stolen;
    state.debuffUntil = now + DEBUFF_DURATION;
    state.attacksLost++;
    toast(`Breach! Hackers stole ${money(stolen)}`, 'alert', 'bad');
  }
  scheduleAttack(now);
}

function updateAttack(now) {
  if (state.attack) {
    if (now >= state.attack.endsAt) resolveAttack(now);
  } else if (now >= state.nextAttack) {
    if (incomePerSec(false) >= 5) state.attack = { endsAt: now + ATTACK_WINDOW };
    else scheduleAttack(now);
  }
}

/* ---------------- Boost (rewarded ad placeholder) ---------------- */

function activateBoost() {
  const now = Date.now();
  if (now < state.boostReadyAt) return;
  state.boostUntil = now + BOOST_DURATION;
  state.boostReadyAt = now + BOOST_COOLDOWN;
  toast('2× income for 2 minutes', 'bolt', 'gold');
}

/* ---------------- Prestige: technology export ---------------- */

function claimableInfluence() { return Math.floor(Math.sqrt(state.runEarned / PRESTIGE_DIVISOR)); }

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
  const keep = {
    nation: state.nation, lifeEarned: state.lifeEarned,
    influence: state.influence + gain, prestiges: state.prestiges + 1,
    clicks: state.clicks, attacksRepelled: state.attacksRepelled, attacksLost: state.attacksLost,
    startedAt: state.startedAt, player: state.player, achievements: state.achievements,
  };
  state = Object.assign(defaultState(), keep);
  sectorSig = ''; upgSig = '';
  saveGame();
  showModal('Technology exported', `+${gain} Influence. All income is now +${Math.round(state.influence * INFLUENCE_BONUS * 100)}%.`, { icon: 'globe', tone: 'violet' });
}

/* ---------------- Rank ---------------- */

function techRank() {
  const r = 195 - Math.floor(Math.log10(Math.max(1, state.lifeEarned)) * 10);
  return Math.max(1, Math.min(195, r));
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
    if (!owned(s.id)) return { text: `Unlock ${s.name}`, cost: s.base };
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
  const s = saved && typeof saved === 'object' ? Object.assign(defaultState(), saved) : defaultState();
  if (s.nation === 'Rəqəmsal Respublika' || s.nation === 'Digital Republic') s.nation = DEFAULT_NATION; // older defaults
  s.player = Object.assign({ ...DEFAULT_PLAYER }, saved && saved.player);
  if (!s.achievements || typeof s.achievements !== 'object') s.achievements = {};
  return s;
}

function applyOffline() {
  const now = Date.now();
  const elapsed = Math.min(OFFLINE_MAX_SEC, (now - state.lastSave) / 1000);
  state.attack = null;
  state.nextAttack = Math.max(state.nextAttack, now + 60e3);
  if (elapsed < 30) return;
  const target = popTarget();
  state.pop = target - (target - state.pop) * Math.exp(-elapsed * 0.05);
  const gain = incomePerSec(false) * elapsed * OFFLINE_EFFICIENCY;
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
  $('modalOk').textContent = opts.okText || 'Continue';
  modalOnOk = opts.onOk || null;
  $('modal').hidden = false;
  if (!input.hidden) input.focus();
}

function closeModal(confirmed) {
  const fn = confirmed ? modalOnOk : null;
  const value = $('modalInput').value;
  modalOnOk = null;
  $('modal').hidden = true;
  if (fn) fn(value);
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
  const visible = [];
  for (let i = 0; i < SECTORS.length; i++) {
    visible.push(i);
    if (!isUnlocked(i)) break; // one locked teaser
  }
  const sig = visible.map(i => `${i}:${isUnlocked(i)}`).join(',');
  if (sig === sectorSig) return;
  sectorSig = sig;
  $('sectors').innerHTML = visible.map(i => {
    const s = SECTORS[i];
    if (!isUnlocked(i)) {
      return `<div class="row locked">${tile('lock', null, 'tile-locked')}
        <div class="row-title"><span class="nm">${s.name}</span></div>
        <button class="buy" disabled>Locked<small>${money(s.base)}</small></button>
        <div class="row-sub">Build one ${SECTORS[i - 1].name} to unlock</div></div>`;
    }
    return `<div class="row" data-id="${s.id}">
      ${tile(s.id, s)}
      <div class="row-title"><span class="nm">${s.name}</span><span class="count" data-f="owned"></span></div>
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

  // effects + attack (visible on every screen)
  const fx = [];
  if (now < state.boostUntil) fx.push(`<span class="chip good">${icon('bolt', 'ic-xs')}2× income · ${dur(state.boostUntil - now)}</span>`);
  if (now < state.debuffUntil) fx.push(`<span class="chip bad">${icon('alert', 'ic-xs')}Breach −50% · ${dur(state.debuffUntil - now)}</span>`);
  $('effects').innerHTML = fx.join('');
  $('attack').hidden = !state.attack;
  if (state.attack) $('attackBar').style.width = `${Math.max(0, (state.attack.endsAt - now) / ATTACK_WINDOW) * 100}%`;

  // tab badges
  const ups = availableUpgrades();
  const affordable = ups.filter(u => state.gdp >= u.cost).length;
  $('upgBadge').hidden = affordable === 0;
  $('upgBadge').textContent = affordable;
  $('secBadge').hidden = !(state.attack || (state.secLevel < SEC_MAX && state.gdp >= secCost()));

  if (screen === 'nation') {
    $('pop').textContent = fmt(state.pop);
    $('welfare').textContent = `${Math.round(welfare())}%`;
    $('influence').textContent = state.influence;
    $('defStat').textContent = `Lv ${state.secLevel}`;
    $('tapValue').textContent = `+${money(clickValue())} per tap`;
    $('buildingCount').textContent = `${totalOwned()} facilities`;
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
      boostBtn.disabled = false; boostBtn.textContent = 'Watch';
      $('boostSub').textContent = 'Watch a short ad for 2× income (2 min)';
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
  }
}

let lastTab = 'nation';
function showScreen(name) {
  screen = name;
  if (name !== 'profile') lastTab = name;
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
};
// [top band, middle band, bottom band, emblem]
const FLAGS = [
  ['#0F6E8C', '#F5B841', '#1B2839', '#F5B841'],
  ['#1D3A6E', '#E8EEF6', '#C8283E', '#1D3A6E'],
  ['#2A9BD8', '#E2483D', '#3BA55C', '#E8EEF6'],
  ['#5B47D6', '#4CC9F0', '#1B2839', '#4CC9F0'],
  ['#1E9A5A', '#E8EEF6', '#1E9A5A', '#1E9A5A'],
  ['#1B2839', '#F5B841', '#0C1420', '#F5B841'],
];

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
];

function checkAchievements(silent) {
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id]) continue;
    const [cur, target] = a.prog();
    if (cur >= target) {
      state.achievements[a.id] = Date.now();
      if (!silent) toast(`Achievement: ${a.name}`, 'star', 'gold');
    }
  }
}

function buildPickers() {
  const tone = state.player.tone;
  $('avatarIcons').innerHTML = AVATARS.map(id =>
    `<button data-avatar="${id}" aria-label="Avatar ${id}">${avatarTile(id, tone)}</button>`).join('');
  $('avatarTones').innerHTML = Object.entries(TONE_COLORS).map(([k, [c1, c2]]) =>
    `<button data-tone="${k}" aria-label="${k} color" style="--c1:${c1};--c2:${c2}"></button>`).join('');
  $('flagPicker').innerHTML = FLAGS.map((_, i) => `<button data-flag="${i}" aria-label="Flag ${i + 1}">${flagSvg(i)}</button>`).join('');
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

/* ---------------- Loop ---------------- */

let lastTick = Date.now();
let skyTimer = 0;
let achTimer = 0;
function tick() {
  const now = Date.now();
  const dt = Math.min(1, (now - lastTick) / 1000); // long gaps are handled by applyOffline
  lastTick = now;
  earn(incomePerSec() * dt);
  state.pop += (popTarget() - state.pop) * Math.min(1, dt * 0.05);
  updateAttack(now);
  if (now - achTimer > 1000) { achTimer = now; checkAchievements(false); }
  render();
  if (now - skyTimer > (reduceMotion ? 3000 : 150)) { skyTimer = now; drawSkyline(); }
}

function bindUI() {
  $('tap').addEventListener('click', e => {
    const v = clickValue();
    earn(v);
    state.clicks++;
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
  $('boost').addEventListener('click', () => { activateBoost(); render(); });
  $('repel').addEventListener('click', () => { repelAttack(); render(); });
  $('buySec').addEventListener('click', () => { buySecurity(); render(); });
  $('prestige').addEventListener('click', doPrestige);
  $('goal').addEventListener('click', () => showScreen('sectors'));
  $('modalOk').addEventListener('click', () => closeModal(true));
  $('modalCancel').addEventListener('click', () => closeModal(false));
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
    if (b) { state.player.tone = b.dataset.tone; saveGame(); buildPickers(); render(); }
  });
  $('flagPicker').addEventListener('click', e => {
    const b = e.target.closest('[data-flag]');
    if (b) { state.player.flag = Number(b.dataset.flag); saveGame(); render(); }
  });
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
      onOk: () => { state = defaultState(); sectorSig = ''; upgSig = ''; achSig = ''; saveGame(); buildPickers(); showScreen('nation'); },
    });
  });

  window.addEventListener('resize', drawSkyline);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveGame();
    else { applyOffline(); lastTick = Date.now(); render(); }
  });
  window.addEventListener('beforeunload', saveGame);
}

bindUI();
buildPickers();
checkAchievements(true);
renderInstall();
registerServiceWorker();
applyOffline();
render();
drawSkyline();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawSkyline);
setInterval(tick, 100);
setInterval(saveGame, 5000);

// Debug / test hook
window.DN = { get state() { return state; }, incomePerSec, earn, render, showScreen, SECTORS, UPGRADES };
