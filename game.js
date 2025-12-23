// Cartoon Dice Football — visual-heavy build
// Adds: sidelines/benches, chain crew animation, TD endzone glow + fireworks,
// goal posts, ball trail, ribbon board, weather toggle, player icons,
// red zone tint, instant replay zoom.

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function fmtClock(seconds) {
  const s = clamp(seconds, 0, 15 * 60);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
function ordinalDown(d) {
  return d === 1 ? "1st" : d === 2 ? "2nd" : d === 3 ? "3rd" : "4th";
}
function yardMarker(ballOnAbs) {
  const x = Math.round(ballOnAbs);
  if (x <= 50) return `CHI ${x}`;
  return `DEN ${100 - x}`;
}
function nowMeta(state) {
  const poss = state.possession === "HOME" ? "Chiefs" : "Broncos";
  return `Q${state.quarter} ${fmtClock(state.clock)} • ${poss} ball`;
}

const ROSTER = {
  HOME: { team: "Chiefs", QB: "Patrick Mahomes", RB: "Isiah Pacheco", WR1: "Travis Kelce", WR2: "Rashee Rice" },
  AWAY: { team: "Broncos", QB: "Bo Nix", RB: "Javonte Williams", WR1: "Courtland Sutton", WR2: "Troy Franklin" }
};

function pickPassTarget(side, tier) {
  const p = ROSTER[side];
  if (tier === "short") return p.WR2;
  if (tier === "first") return p.WR1;
  if (tier === "big") return Math.random() < 0.5 ? p.WR1 : p.WR2;
  if (tier === "td") {
    if (side === "HOME") return Math.random() < 0.65 ? p.WR1 : p.WR2;
    return Math.random() < 0.5 ? p.WR1 : p.WR2;
  }
  return p.WR1;
}
function actorForPlay(side, playCall, d6) {
  const p = ROSTER[side];
  if (d6 === 1) return p.QB;
  if (playCall === "RUN") return p.RB;
  if (playCall === "PASS") {
    if (d6 === 3) return pickPassTarget(side, "short");
    if (d6 === 4) return pickPassTarget(side, "first");
    if (d6 === 5) return pickPassTarget(side, "big");
    if (d6 === 6) return pickPassTarget(side, "td");
    return p.WR2;
  }
  return p.QB;
}

const el = {
  homeScore: document.getElementById("homeScore"),
  awayScore: document.getElementById("awayScore"),
  quarter: document.getElementById("quarter"),
  clock: document.getElementById("clock"),
  possession: document.getElementById("possession"),
  situation: document.getElementById("situation"),

  field: document.getElementById("field"),
  yardlines: document.getElementById("yardlines"),
  ball: document.getElementById("ball"),
  losLine: document.getElementById("losLine"),
  fdLine: document.getElementById("fdLine"),
  chainCrew: document.getElementById("chainCrew"),
  trailLayer: document.getElementById("trailLayer"),

  qbIcon: document.getElementById("qbIcon"),
  rbIcon: document.getElementById("rbIcon"),
  defIcon: document.getElementById("defIcon"),

  ezHome: document.getElementById("ezHome"),
  ezAway: document.getElementById("ezAway"),

  overlayTitle: document.getElementById("overlayTitle"),
  overlaySub: document.getElementById("overlaySub"),
  overlayCard: document.getElementById("overlayCard"),

  confetti: document.getElementById("confetti"),
  ribbon: document.getElementById("ribbon"),
  ribbonText: document.getElementById("ribbonText"),
  replayTag: document.getElementById("replayTag"),

  weatherLayer: document.getElementById("weatherLayer"),

  log: document.getElementById("log"),

  inD6: document.getElementById("inD6"),
  inD10: document.getElementById("inD10"),
  inD20: document.getElementById("inD20"),

  btnRun: document.getElementById("btnRun"),
  btnPass: document.getElementById("btnPass"),
  btnPunt: document.getElementById("btnPunt"),
  btnFG: document.getElementById("btnFG"),
  btnResolve: document.getElementById("btnResolve"),
  btnNewGame: document.getElementById("btnNewGame"),
  cpuHint: document.getElementById("cpuHint"),

  wxClear: document.getElementById("wxClear"),
  wxSnow: document.getElementById("wxSnow"),
  wxRain: document.getElementById("wxRain"),
  wxNight: document.getElementById("wxNight"),
};

function renderYardlines() {
  const count = 10;
  const frag = document.createDocumentFragment();

  for (let i = 1; i < count; i++) {
    const pos = i / count;

    const line = document.createElement("div");
    line.style.position = "absolute";
    line.style.left = `${pos * 100}%`;
    line.style.top = "0";
    line.style.bottom = "0";
    line.style.width = "2px";
    line.style.background = "rgba(255,255,255,.22)";
    frag.appendChild(line);

    const yard = (i <= 5) ? i * 10 : (10 - i) * 10;

    const label = document.createElement("div");
    label.style.position = "absolute";
    label.style.left = `${pos * 100}%`;
    label.style.top = "40px"; // under ribbon
    label.style.transform = "translateX(-50%)";
    label.style.fontWeight = "1000";
    label.style.fontSize = "12px";
    label.style.color = "rgba(255,255,255,.9)";
    label.style.textShadow = "0 4px 10px rgba(0,0,0,.45)";
    label.textContent = yard;
    frag.appendChild(label);
  }

  el.yardlines.innerHTML = "";
  el.yardlines.appendChild(frag);
}
renderYardlines();

const initialState = () => ({
  ballOn: 25,
  down: 1,
  toGo: 10,
  possession: "HOME",
  score: { HOME: 0, AWAY: 0 },
  quarter: 1,
  clock: 5 * 60,

  lastPlayWasSack: false,
  expectingChaos: false,
  pendingPlayCall: null,

  // for visuals
  lastBallX: null,
  lastBallY: null,
});

let state = initialState();

function logPlay(text) {
  const item = document.createElement("div");
  item.className = "item";
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = nowMeta(state);
  const t = document.createElement("div");
  t.className = "text";
  t.textContent = text;
  item.appendChild(meta);
  item.appendChild(t);
  el.log.prepend(item);
}

function showOverlay(title, sub, vibe = "normal") {
  el.overlayTitle.textContent = title;
  el.overlaySub.textContent = sub;

  el.overlayCard.classList.remove("pop");
  void el.overlayCard.offsetWidth;
  el.overlayCard.classList.add("pop");

  if (vibe === "shake") {
    el.field.classList.remove("shake");
    void el.field.offsetWidth;
    el.field.classList.add("shake");
  }
}

function flashRibbon(text) {
  el.ribbonText.textContent = text;
  el.ribbon.classList.remove("flash");
  void el.ribbon.offsetWidth;
  el.ribbon.classList.add("flash");
}

function showReplay() {
  el.replayTag.classList.add("show");
  el.field.classList.remove("replay-zoom");
  void el.field.offsetWidth;
  el.field.classList.add("replay-zoom");
  setTimeout(() => el.replayTag.classList.remove("show"), 800);
}

function pulseBroadcastLines() {
  el.losLine.classList.remove("snap");
  void el.losLine.offsetWidth;
  el.losLine.classList.add("snap");
  el.fdLine.classList.add("shimmer");
  setTimeout(() => el.losLine.classList.remove("snap"), 300);
}

function spawnConfetti(team) {
  // team: HOME or AWAY, just tint a bit by mixing opacity (still mostly white)
  el.confetti.innerHTML = "";
  const pieces = 28;
  for (let i = 0; i < pieces; i++) {
    const c = document.createElement("div");
    c.className = "c";
    c.style.left = `${Math.random() * 100}%`;
    c.style.top = `${-10 - Math.random() * 40}px`;
    c.style.animationDelay = `${Math.random() * 0.15}s`;
    c.style.opacity = String(0.6 + Math.random() * 0.4);

    // tiny tint
    if (team === "HOME") c.style.background = "rgba(255,255,255,.95)";
    if (team === "AWAY") c.style.background = "rgba(255,255,255,.95)";

    el.confetti.appendChild(c);
  }
  setTimeout(() => (el.confetti.innerHTML = ""), 1300);
}

function spawnFireworks(side) {
  // Burst near the scoring endzone
  const x = side === "HOME" ? 14 : 86; // percent
  const y = 30; // percent

  const bursts = 22;
  for (let i = 0; i < bursts; i++) {
    const p = document.createElement("div");
    p.className = "firework";
    p.style.left = `${x + (Math.random()*6 - 3)}%`;
    p.style.top = `${y + (Math.random()*10 - 5)}%`;

    const ang = Math.random() * Math.PI * 2;
    const mag = 60 + Math.random() * 110;
    const dx = Math.cos(ang) * mag;
    const dy = Math.sin(ang) * mag;

    p.style.setProperty("--dx", `${dx}px`);
    p.style.setProperty("--dy", `${dy}px`);

    el.confetti.appendChild(p);
    setTimeout(() => p.remove(), 950);
  }
}

function glowEndzone(side) {
  const ez = side === "HOME" ? el.ezHome : el.ezAway;
  ez.classList.remove("glow");
  void ez.offsetWidth;
  ez.classList.add("glow");
}

function clearIcons() {
  el.qbIcon.classList.remove("show");
  el.rbIcon.classList.remove("show");
  el.defIcon.classList.remove("show");
}

function setIcon(elm, xPct, yPct, show) {
  elm.style.left = `${xPct}%`;
  elm.style.top = `${yPct}%`;
  if (show) elm.classList.add("show"); else elm.classList.remove("show");
}

function addBallTrail(x1, y1, x2, y2) {
  // x/y in percent
  const dx = (x2 - x1);
  const dy = (y2 - y1);
  const dist = Math.sqrt(dx*dx + dy*dy);
  if (dist < 2) return;

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  const t = document.createElement("div");
  t.className = "trail";
  t.style.left = `${x1}%`;
  t.style.top = `${y1}%`;
  t.style.width = `${dist}%`;
  t.style.transform = `translate(0,-50%) rotate(${angle}deg)`;
  el.trailLayer.appendChild(t);
  setTimeout(() => t.remove(), 420);
}

function updateRedZoneTint() {
  // offense distance to goal line
  const distToGoal = state.possession === "HOME" ? (100 - state.ballOn) : state.ballOn;
  if (distToGoal <= 20) el.field.classList.add("redzone");
  else el.field.classList.remove("redzone");
}

function updateUI() {
  el.homeScore.textContent = state.score.HOME;
  el.awayScore.textContent = state.score.AWAY;
  el.quarter.textContent = `Q${state.quarter}`;
  el.clock.textContent = fmtClock(state.clock);

  const possName = state.possession === "HOME" ? "Chiefs" : "Broncos";
  el.possession.textContent = `${possName} ball`;
  el.situation.textContent = `${ordinalDown(state.down)} & ${state.toGo} @ ${yardMarker(state.ballOn)}`;

  // Positioning inside playable area between endzones
  const innerLeft = 9;
  const innerRight = 91;
  const x = innerLeft + (state.ballOn / 100) * (innerRight - innerLeft);
  const y = 56 + (state.down - 2) * 4;

  // Store old for trail
  const prevX = (state.lastBallX == null) ? x : state.lastBallX;
  const prevY = (state.lastBallY == null) ? y : state.lastBallY;

  // Ball
  el.ball.style.left = `${x}%`;
  el.ball.style.top = `${y}%`;

  // Lines
  el.losLine.style.left = `${x}%`;

  const firstDownSpot = state.possession === "HOME"
    ? clamp(state.ballOn + state.toGo, 0, 100)
    : clamp(state.ballOn - state.toGo, 0, 100);

  const fdX = innerLeft + (firstDownSpot / 100) * (innerRight - innerLeft);
  el.fdLine.style.left = `${fdX}%`;

  // Chain crew sits at first down line near top sideline
  el.chainCrew.style.left = `${fdX}%`;

  // Save for next frame
  state.lastBallX = x;
  state.lastBallY = y;

  // Buttons: Chiefs only
  const cpuTurn = state.possession === "AWAY";
  el.btnRun.disabled = cpuTurn;
  el.btnPass.disabled = cpuTurn;
  el.btnPunt.disabled = cpuTurn;
  el.btnFG.disabled = cpuTurn;

  ensureCpuPlayCall();
  el.fdLine.classList.add("shimmer");

  updateRedZoneTint();

  // Tiny subtle trail on any movement
  addBallTrail(prevX, prevY, x, y);
}

function readDie(inputEl, min, max) {
  const raw = String(inputEl.value || "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}
function validateDice(d6, d10, d20, expectingChaos, playCall) {
  if (d6 == null) return { ok: false, msg: "Enter D6 (1–6)." };
  if ([3,4,5].includes(d6) && d10 == null) return { ok: false, msg: "Enter D10 (1–10) for this D6 result." };
  if (expectingChaos && d20 == null) return { ok: false, msg: "Chaos triggered — enter D20 (1–20)." };
  if (playCall === "FG" && d20 == null) return { ok: false, msg: "Field Goal attempt needs D20 (1–20)." };
  return { ok: true, msg: "" };
}

function runoffSeconds(d6, playCall) {
  if (d6 === 6) return 10;
  if (playCall === "PUNT" || playCall === "FG") return 12;
  if (d6 === 1) return 28;
  if (d6 === 2) return 25;
  if (d6 === 3) return 24;
  if (d6 === 4) return 20;
  if (d6 === 5) return 16;
  return 20;
}

function yardsFromDice(d6, d10) {
  if (d6 === 2) return -(Math.random() < 0.5 ? 1 : 0);
  if (d6 === 3) return 3 + Math.floor(d10 / 5);
  if (d6 === 4) return 10 + Math.floor(d10 / 2);
  if (d6 === 5) return 20 + d10;
  return 0;
}

function moveBallBy(yardsSignedForOffense) {
  const before = state.ballOn;
  const next = state.possession === "HOME"
    ? state.ballOn + yardsSignedForOffense
    : state.ballOn - yardsSignedForOffense;

  state.ballOn = clamp(next, 0, 100);

  const after = state.ballOn;
  const gain = state.possession === "HOME" ? (after - before) : (before - after);
  return gain;
}

function isTouchdown() {
  return (state.possession === "HOME" && state.ballOn >= 100) ||
         (state.possession === "AWAY" && state.ballOn <= 0);
}

function scoreTD() {
  state.score[state.possession] += 6;
  state.score[state.possession] += 1;
}

function switchPossession(reason) {
  state.possession = state.possession === "HOME" ? "AWAY" : "HOME";
  state.down = 1;
  state.toGo = 10;
  state.lastPlayWasSack = false;
  state.expectingChaos = false;
  state.pendingPlayCall = null;
  clearIcons();

  state.ballOn = state.possession === "HOME" ? 25 : 75;

  logPlay(reason);
  ensureCpuPlayCall();
}

function chooseCpuPlayCall() {
  const distToScore = state.ballOn;
  const inFgRange = distToScore <= 35;
  const deep = distToScore >= 75;

  if (state.down === 4) {
    if (inFgRange) return "FG";
    if (deep) return "PUNT";
    return (state.toGo <= 3) ? "PASS" : "PUNT";
  }
  return Math.random() < 0.52 ? "RUN" : "PASS";
}

function ensureCpuPlayCall() {
  if (state.possession !== "AWAY") return;
  if (state.expectingChaos) return;
  if (state.pendingPlayCall) return;

  state.pendingPlayCall = chooseCpuPlayCall();
  showOverlay("BRONCOS CALL", `${state.pendingPlayCall} — enter dice, then Resolve.`, "normal");
}

function isOwnTerritory() {
  return state.possession === "HOME" ? state.ballOn < 50 : state.ballOn > 50;
}
function isGoalLineDanger() {
  return state.possession === "HOME" ? state.ballOn <= 5 : state.ballOn >= 95;
}
function lateHalf() {
  return state.clock <= 120 && (state.quarter === 2 || state.quarter === 4);
}
function trailingLate() {
  if (state.quarter !== 4) return false;
  const my = state.score[state.possession];
  const opp = state.score[state.possession === "HOME" ? "AWAY" : "HOME"];
  return my < opp && state.clock <= 180;
}
function chaosShouldTrigger(d6, playCall) {
  if (d6 !== 1) return false;
  if (isOwnTerritory()) return true;
  if (isGoalLineDanger()) return true;
  if (state.lastPlayWasSack) return true;
  if (lateHalf()) return true;
  if (trailingLate()) return true;
  if (state.down === 4 && playCall !== "PUNT" && playCall !== "FG") return true;
  return false;
}

function chaosOutcome(d20) {
  if (d20 === 1) return { type: "TURNOVER", text: "Turnover!" };
  if (d20 <= 3) return { type: "NEAR", text: "Near turnover — offense recovers." };
  if (d20 <= 5) return { type: "FLAG", text: "FLAG!" };
  if (d20 <= 8) return { type: "HARDHIT", text: "Hard hit — no flag." };
  if (d20 <= 15) return { type: "CLEAN", text: "No extra effect." };
  if (d20 <= 18) return { type: "MOMENTUM", text: "Momentum swing." };
  if (d20 === 19) return { type: "DEF_MISTAKE", text: "Defensive mistake — offense bonus." };
  return { type: "ABSOLUTE", text: "ABSOLUTE CHAOS." };
}

function applyFlag() {
  const play = state.pendingPlayCall || "PLAY";
  const isPass = play === "PASS";
  const defensive = Math.random() < (isPass ? 0.45 : 0.25);

  if (defensive) {
    const yards = isPass ? 15 : 5;
    const gain = moveBallBy(yards);
    state.down = 1;
    state.toGo = 10;
    return `🚩 Defensive penalty +${gain} → Ball @ ${yardMarker(state.ballOn)} (Automatic 1st down)`;
  } else {
    const yards = Math.random() < 0.35 ? 5 : 10;
    const gain = moveBallBy(-yards);
    state.toGo += Math.abs(gain);
    return `🚩 Offensive penalty ${gain} → Ball @ ${yardMarker(state.ballOn)} (Replay down)`;
  }
}

function applyChaosNow(d20) {
  const defTeam = state.possession === "HOME" ? "Broncos" : "Chiefs";
  const out = chaosOutcome(d20);

  if (out.type === "TURNOVER") {
    showOverlay("TURNOVER!", `D20=${d20} — ${defTeam} take over.`, "shake");
    flashRibbon("TURNOVER!");
    switchPossession(`${defTeam} take over on a turnover (Chaos D20=${d20}).`);
    return;
  }

  if (out.type === "FLAG") {
    const msg = applyFlag();
    showOverlay("FLAG!", `D20=${d20} — ${msg}`, "shake");
    flashRibbon("FLAG ON THE PLAY");
    logPlay(`CHAOS (D20=${d20}): ${msg}`);

    state.toGo += 6;
    state.down += 1;
    state.clock = clamp(state.clock - 10, 0, 15 * 60);

    if (state.down > 4) {
      showOverlay("TURNOVER ON DOWNS", "Defense takes over.", "shake");
      switchPossession("Turnover on downs.");
    }
    return;
  }

  showOverlay("CHAOS", `D20=${d20} — ${out.text}`, out.type === "HARDHIT" ? "shake" : "normal");
  flashRibbon(out.type === "HARDHIT" ? "BIG HIT!" : "CHAOS MOMENT");
  logPlay(`CHAOS (D20=${d20}): ${out.text}`);

  state.toGo += 6;
  state.down += 1;
  state.clock = clamp(state.clock - 10, 0, 15 * 60);

  if (state.down > 4) {
    showOverlay("TURNOVER ON DOWNS", "Defense takes over.", "shake");
    switchPossession("Turnover on downs.");
  }
}

// Special teams
function resolvePunt() {
  const net = 38 + Math.floor(Math.random() * 10);
  const kickerTeam = state.possession === "HOME" ? "Chiefs" : "Broncos";

  const before = state.ballOn;
  const landing = clamp(state.possession === "HOME" ? (before + net) : (before - net), 0, 100);

  let finalLanding = landing;
  if (state.possession === "HOME" && finalLanding >= 95) finalLanding = 80;
  if (state.possession === "AWAY" && finalLanding <= 5) finalLanding = 20;

  state.possession = state.possession === "HOME" ? "AWAY" : "HOME";
  state.down = 1;
  state.toGo = 10;
  state.lastPlayWasSack = false;
  state.expectingChaos = false;
  state.pendingPlayCall = null;
  clearIcons();
  state.ballOn = finalLanding;

  showOverlay("PUNT", `${kickerTeam} punt → Ball @ ${yardMarker(state.ballOn)}`, "normal");
  flashRibbon("PUNT");
  logPlay(`${kickerTeam} punt → Ball @ ${yardMarker(state.ballOn)} (New possession).`);
}

function resolveFieldGoal(d20) {
  const distToGoal = state.possession === "HOME" ? (100 - state.ballOn) : state.ballOn;
  const kickDistance = distToGoal + 17;

  let needed;
  if (kickDistance <= 33) needed = 4;
  else if (kickDistance <= 40) needed = 7;
  else if (kickDistance <= 47) needed = 11;
  else if (kickDistance <= 54) needed = 15;
  else needed = 18;

  const kickerTeam = state.possession === "HOME" ? "Chiefs" : "Broncos";
  const made = d20 >= needed;

  state.clock = clamp(state.clock - 10, 0, 15 * 60);

  if (made) {
    state.score[state.possession] += 3;
    showOverlay("FIELD GOAL!", `${kickerTeam} GOOD (D20=${d20}, need ${needed}+)`, "normal");
    flashRibbon("FIELD GOAL IS GOOD!");
    logPlay(`${kickerTeam} FG GOOD (D20=${d20}, need ${needed}+) → Score ${state.score.HOME}-${state.score.AWAY}`);
    showReplay();
    switchPossession("Kickoff after FG.");
  } else {
    showOverlay("NO GOOD", `${kickerTeam} missed (D20=${d20}, need ${needed}+)`, "shake");
    flashRibbon("FIELD GOAL NO GOOD");
    logPlay(`${kickerTeam} FG missed (D20=${d20}, need ${needed}+).`);
    switchPossession("Missed FG — possession flips.");
  }
}

// Play resolution
function resolveNormalPlay(playCall, d6, d10, d20) {
  const side = state.possession;

  // Show basic player icons for the play (quick + readable)
  clearIcons();

  // Compute current LOS position for icons
  const innerLeft = 9, innerRight = 91;
  const losX = innerLeft + (state.ballOn / 100) * (innerRight - innerLeft);
  const baseY = 56;

  if (playCall === "PASS") {
    setIcon(el.qbIcon, losX - (side === "HOME" ? 2 : -2), baseY, true);
  } else if (playCall === "RUN") {
    setIcon(el.rbIcon, losX, baseY, true);
  }

  if (d6 === 6) {
    const scorer = actorForPlay(side, playCall, 6);
    scoreTD();
    showOverlay("TOUCHDOWN!", `${scorer} scores! (+XP)`, "normal");
    flashRibbon("TOUCHDOWN!!!");
    showReplay();
    glowEndzone(side);
    spawnConfetti(side);
    spawnFireworks(side);
    logPlay(`${scorer} TD! → Score ${state.score.HOME}-${state.score.AWAY}`);
    state.clock = clamp(state.clock - 10, 0, 15 * 60);
    switchPossession("Kickoff after TD.");
    return;
  }

  if (d6 === 1) {
    const qb = ROSTER[side].QB;
    const loss = 6;
    const gain = moveBallBy(-loss);
    state.lastPlayWasSack = true;

    // Defender icon appears on sack
    setIcon(el.defIcon, losX, baseY, true);

    const chaos = chaosShouldTrigger(d6, playCall);
    if (chaos) {
      state.expectingChaos = true;
      showOverlay("SACK!", `-${Math.abs(gain)} → Ball @ ${yardMarker(state.ballOn)} • CHAOS! Enter D20.`, "shake");
      flashRibbon("SACK! CHAOS TRIGGERED");
      showReplay();
      logPlay(`${qb} sacked ${gain} → Ball @ ${yardMarker(state.ballOn)} (CHAOS triggered)`);
      return;
    }

    state.toGo += Math.abs(gain);
    state.down += 1;
    state.clock = clamp(state.clock - runoffSeconds(d6, playCall), 0, 15 * 60);

    showOverlay("SACK!", `${qb} sacked ${gain} → Ball @ ${yardMarker(state.ballOn)}`, "shake");
    flashRibbon("SACK!");
    showReplay();
    logPlay(`${qb} sacked ${gain} → Ball @ ${yardMarker(state.ballOn)}`);

    if (state.down > 4) switchPossession("Turnover on downs.");
    return;
  }

  if (d6 === 2) {
    const actor = actorForPlay(side, playCall, d6);
    const y = -(Math.random() < 0.5 ? 1 : 0);
    const gain = moveBallBy(y);

    state.lastPlayWasSack = false;
    state.toGo = clamp(state.toGo - gain, 1, 99);
    state.down += 1;
    state.clock = clamp(state.clock - runoffSeconds(d6, playCall), 0, 15 * 60);

    showOverlay("STUFFED", `${actor} ${gain} → Ball @ ${yardMarker(state.ballOn)}`, "shake");
    flashRibbon("STONEWALLED!");
    showReplay();
    logPlay(`${actor} stuffed ${gain} → Ball @ ${yardMarker(state.ballOn)}`);

    if (state.down > 4) switchPossession("Turnover on downs.");
    return;
  }

  if (d6 === 3 || d6 === 4 || d6 === 5) {
    const actor = actorForPlay(side, playCall, d6);
    let yards = yardsFromDice(d6, d10);

    const big = (d6 === 5);
    const highlight = (d6 === 5 && d20 === 20);

    if (highlight) {
      const dist = side === "HOME" ? (100 - state.ballOn) : state.ballOn;
      yards = dist; // breakaway
      showOverlay("HIGHLIGHT REEL!", `${actor} breaks free! D20=20 → BREAKAWAY!`, "normal");
      flashRibbon("HIGHLIGHT PLAY!");
      showReplay();
      logPlay(`🔥 HIGHLIGHT: D6=5 + D20=20 → breakaway unlocked.`);
    }

    const gain = moveBallBy(yards);

    // Add a brighter trail for big plays
    if (big || highlight) {
      const x1 = state.lastBallX ?? 50;
      const y1 = state.lastBallY ?? 56;
      const x2 = 9 + (state.ballOn / 100) * (91 - 9);
      const y2 = 56 + (state.down - 2) * 4;
      addBallTrail(x1, y1, x2, y2);
      showReplay();
    }

    if (isTouchdown()) {
      scoreTD();
      showOverlay("TOUCHDOWN!", `${actor} goes the distance! (+XP)`, "normal");
      flashRibbon("TOUCHDOWN!!!");
      glowEndzone(side);
      spawnConfetti(side);
      spawnFireworks(side);
      showReplay();
      logPlay(`${actor} TD (+${gain}) → Score ${state.score.HOME}-${state.score.AWAY}`);
      state.clock = clamp(state.clock - runoffSeconds(d6, playCall), 0, 15 * 60);
      state.lastPlayWasSack = false;
      switchPossession("Kickoff after TD.");
      return;
    }

    if (gain >= state.toGo) {
      // First down chain crew moment
      state.down = 1;
      state.toGo = 10;
      showOverlay(big ? "BIG PLAY!" : "FIRST DOWN!", `${actor} +${gain} → Ball @ ${yardMarker(state.ballOn)}`, "normal");
      flashRibbon("MOVE THOSE CHAINS!");
      showReplay();
      logPlay(`${actor} +${gain} → Ball @ ${yardMarker(state.ballOn)} (1st down)`);
    } else {
      state.toGo = state.toGo - gain;
      state.down += 1;
      showOverlay(big ? "BIG PLAY!" : "GAIN", `${actor} +${gain} → Ball @ ${yardMarker(state.ballOn)}`, "normal");
      flashRibbon(big ? "CHUNK PLAY!" : "GOOD GAIN");
      logPlay(`${actor} +${gain} → Ball @ ${yardMarker(state.ballOn)}`);
    }

    state.clock = clamp(state.clock - runoffSeconds(d6, playCall), 0, 15 * 60);
    state.lastPlayWasSack = false;

    if (state.down > 4) switchPossession("Turnover on downs.");
    return;
  }
}

function advanceQuarterIfNeeded() {
  if (state.clock > 0) return;

  if (state.quarter < 4) {
    state.quarter += 1;
    state.clock = 5 * 60;
    showOverlay(`Q${state.quarter} START`, "Fresh quarter, fresh chaos.", "normal");
    flashRibbon(`START OF Q${state.quarter}`);
    logPlay(`--- End of Q${state.quarter - 1}. Start Q${state.quarter}. ---`);
  } else {
    const h = state.score.HOME, a = state.score.AWAY;
    const result = h === a ? "TIE GAME" : (h > a ? "CHIEFS WIN" : "BRONCOS WIN");
    showOverlay(result, `Final: Chiefs ${h} — Broncos ${a}`, "normal");
    flashRibbon(`FINAL: CHIEFS ${h} — BRONCOS ${a}`);
    spawnConfetti(h > a ? "HOME" : "AWAY");
    logPlay(`FINAL: Chiefs ${h} — Broncos ${a}`);
  }
}

// Controls
function setPlayCall(call) {
  if (state.possession === "AWAY") return;
  state.pendingPlayCall = call;
  showOverlay("CHIEFS CALL", `${call} — enter dice, then Resolve.`, "normal");
  flashRibbon(`CHIEFS: ${call}`);
}

el.btnRun.addEventListener("click", () => setPlayCall("RUN"));
el.btnPass.addEventListener("click", () => setPlayCall("PASS"));
el.btnPunt.addEventListener("click", () => setPlayCall("PUNT"));
el.btnFG.addEventListener("click", () => setPlayCall("FG"));

el.btnNewGame.addEventListener("click", () => {
  state = initialState();
  el.log.innerHTML = "";
  el.inD6.value = "";
  el.inD10.value = "";
  el.inD20.value = "";
  clearIcons();
  el.trailLayer.innerHTML = "";
  el.confetti.innerHTML = "";
  showOverlay("NEW GAME", "Chiefs start at CHI 25. Pick a play.", "normal");
  flashRibbon("NEW GAME!");
  updateUI();
});

// Weather
function setWeather(mode) {
  document.body.classList.remove("wx-snow","wx-rain","wx-night");
  el.weatherLayer.innerHTML = "";

  if (mode === "snow") document.body.classList.add("wx-snow");
  if (mode === "rain") document.body.classList.add("wx-rain");
  if (mode === "night") document.body.classList.add("wx-night");

  // Particles
  if (mode === "snow") {
    for (let i = 0; i < 70; i++) {
      const s = document.createElement("div");
      s.className = "snowflake";
      s.style.left = `${Math.random()*100}%`;
      s.style.top = `${-20 - Math.random()*200}px`;
      s.style.setProperty("--t", `${5 + Math.random()*5}s`);
      s.style.opacity = `${0.25 + Math.random()*0.6}`;
      el.weatherLayer.appendChild(s);
    }
  }
  if (mode === "rain") {
    for (let i = 0; i < 80; i++) {
      const r = document.createElement("div");
      r.className = "raindrop";
      r.style.left = `${Math.random()*110 - 5}%`;
      r.style.top = `${-40 - Math.random()*240}px`;
      r.style.setProperty("--t", `${0.8 + Math.random()*0.8}s`);
      r.style.opacity = `${0.20 + Math.random()*0.55}`;
      el.weatherLayer.appendChild(r);
    }
  }

  flashRibbon(mode === "clear" ? "CLEAR SKIES" : mode.toUpperCase() + " MODE");
}

el.wxClear.addEventListener("click", () => setWeather("clear"));
el.wxSnow.addEventListener("click", () => setWeather("snow"));
el.wxRain.addEventListener("click", () => setWeather("rain"));
el.wxNight.addEventListener("click", () => setWeather("night"));

el.btnResolve.addEventListener("click", () => {
  pulseBroadcastLines();
  ensureCpuPlayCall();

  if (!state.pendingPlayCall) {
    showOverlay("PICK A PLAY", "Choose Run/Pass/Punt/FG.", "normal");
    return;
  }

  const d6 = readDie(el.inD6, 1, 6);
  const d10 = readDie(el.inD10, 1, 10);
  const d20 = readDie(el.inD20, 1, 20);

  const check = validateDice(d6, d10, d20, state.expectingChaos, state.pendingPlayCall);
  if (!check.ok) {
    showOverlay("DICE NEEDED", check.msg, "normal");
    return;
  }

  if (state.expectingChaos) {
    applyChaosNow(d20);
    state.expectingChaos = false;

    el.inD6.value = "";
    el.inD10.value = "";
    el.inD20.value = "";
    state.pendingPlayCall = null;

    updateUI();
    advanceQuarterIfNeeded();
    return;
  }

  const call = state.pendingPlayCall;

  if (call === "PUNT") {
    resolvePunt();
    state.clock = clamp(state.clock - 12, 0, 15 * 60);
    state.pendingPlayCall = null;

    el.inD6.value = "";
    el.inD10.value = "";
    el.inD20.value = "";

    updateUI();
    advanceQuarterIfNeeded();
    return;
  }

  if (call === "FG") {
    resolveFieldGoal(d20);
    state.pendingPlayCall = null;

    el.inD6.value = "";
    el.inD10.value = "";
    el.inD20.value = "";

    updateUI();
    advanceQuarterIfNeeded();
    return;
  }

  resolveNormalPlay(call, d6, d10, d20);

  if (!state.expectingChaos) {
    state.pendingPlayCall = null;
    el.inD6.value = "";
    el.inD10.value = "";
    el.inD20.value = "";
  } else {
    el.inD20.value = "";
  }

  updateUI();
  advanceQuarterIfNeeded();
});

// Init
setWeather("clear");
flashRibbon("WELCOME TO CARTOON DICE FOOTBALL");
showOverlay("READY", "Chiefs ball @ CHI 25. Pick a play, type dice, Resolve.", "normal");
updateUI();
