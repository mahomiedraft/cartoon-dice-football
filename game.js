// Cartoon Dice Football — manual dice input
// Chiefs (You) vs Broncos (CPU calls plays)
// Highlights: on D6=5, optional D20=20 = breakaway TD.

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

// Yard marker in real football style (absolute field)
// 0..50 => CHI x, 51..100 => DEN (100-x)
function yardMarker(ballOnAbs) {
  const x = Math.round(ballOnAbs);
  if (x <= 50) return `CHI ${x}`;
  return `DEN ${100 - x}`;
}

function nowMeta(state) {
  const poss = state.possession === "HOME" ? "Chiefs" : "Broncos";
  return `Q${state.quarter} ${fmtClock(state.clock)} • ${poss} ball`;
}

// ---------- Players ----------
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
    // Chiefs TD bias toward Kelce, because of course
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

// ---------- DOM ----------
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

  overlayTitle: document.getElementById("overlayTitle"),
  overlaySub: document.getElementById("overlaySub"),
  overlayCard: document.getElementById("overlayCard"),
  confetti: document.getElementById("confetti"),

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
};

// Yard numbers: 10 20 30 40 50 40 30 20 10
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
    label.style.top = "12px";
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

// ---------- Game State ----------
const initialState = () => ({
  // Absolute field: 0 = Chiefs endzone, 100 = Broncos endzone
  ballOn: 25,
  down: 1,
  toGo: 10,

  possession: "HOME", // Chiefs start
  score: { HOME: 0, AWAY: 0 },

  quarter: 1,
  clock: 5 * 60,

  lastPlayWasSack: false,
  expectingChaos: false,
  pendingPlayCall: null, // RUN/PASS/PUNT/FG
});

let state = initialState();

// ---------- UI ----------
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

function spawnConfetti() {
  el.confetti.innerHTML = "";
  const pieces = 28;
  for (let i = 0; i < pieces; i++) {
    const c = document.createElement("div");
    c.className = "c";
    c.style.left = `${Math.random() * 100}%`;
    c.style.top = `${-10 - Math.random() * 40}px`;
    c.style.animationDelay = `${Math.random() * 0.15}s`;
    c.style.opacity = String(0.6 + Math.random() * 0.4);
    c.style.transform = `rotate(${Math.random() * 180}deg)`;
    el.confetti.appendChild(c);
  }
  setTimeout(() => (el.confetti.innerHTML = ""), 1300);
}

function showOverlay(title, sub, vibe = "normal") {
  el.overlayTitle.textContent = title;
  el.overlaySub.textContent = sub;

  el.overlayCard.classList.remove("pop");
  el.overlayTitle.classList.remove("bounce");
  void el.overlayCard.offsetWidth;
  el.overlayCard.classList.add("pop");
  el.overlayTitle.classList.add("bounce");

  if (vibe === "shake") {
    el.field.classList.remove("shake");
    void el.field.offsetWidth;
    el.field.classList.add("shake");
  }
  if (vibe === "confetti") spawnConfetti();
}

function updateUI() {
  el.homeScore.textContent = state.score.HOME;
  el.awayScore.textContent = state.score.AWAY;
  el.quarter.textContent = `Q${state.quarter}`;
  el.clock.textContent = fmtClock(state.clock);

  const possName = state.possession === "HOME" ? "Chiefs" : "Broncos";
  el.possession.textContent = `${possName} ball`;
  el.situation.textContent = `${ordinalDown(state.down)} & ${state.toGo} @ ${yardMarker(state.ballOn)}`;

  // Positioning inside the playable field area (between endzones)
  const innerLeft = 9;
  const innerRight = 91;
  const x = innerLeft + (state.ballOn / 100) * (innerRight - innerLeft);

  const y = 50 + (state.down - 2) * 4;
  el.ball.style.left = `${x}%`;
  el.ball.style.top = `${y}%`;

  // Blue LOS
  el.losLine.style.left = `${x}%`;

  // Yellow first down marker (absolute field)
  const firstDownSpot = state.possession === "HOME"
    ? clamp(state.ballOn + state.toGo, 0, 100)
    : clamp(state.ballOn - state.toGo, 0, 100);

  const fdX = innerLeft + (firstDownSpot / 100) * (innerRight - innerLeft);
  el.fdLine.style.left = `${fdX}%`;

  // Buttons: Chiefs only
  const cpuTurn = state.possession === "AWAY";
  el.btnRun.disabled = cpuTurn;
  el.btnPass.disabled = cpuTurn;
  el.btnPunt.disabled = cpuTurn;
  el.btnFG.disabled = cpuTurn;

  if (cpuTurn) {
    const cpuCall = chooseCpuPlayCall();
    el.cpuHint.textContent = `CPU (Broncos) will call: ${cpuCall}. You still roll/type the dice.`;
  } else {
    el.cpuHint.textContent = `You are the Chiefs. Pick a play, roll dice, type them, resolve.`;
  }

  ensureCpuPlayCall();
}

// ---------- Dice ----------
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

  if ([3,4,5].includes(d6) && d10 == null) {
    return { ok: false, msg: "Enter D10 (1–10) for this D6 result." };
  }

  if (expectingChaos && d20 == null) {
    return { ok: false, msg: "Chaos triggered — enter D20 (1–20)." };
  }

  if (playCall === "FG" && d20 == null) {
    return { ok: false, msg: "Field Goal attempt needs D20 (1–20)." };
  }

  // D20 is optional on big play highlight (D6=5)
  return { ok: true, msg: "" };
}

// ---------- Core Rules ----------
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
  if (d6 === 3) return 3 + Math.floor(d10 / 5);   // 3–5
  if (d6 === 4) return 10 + Math.floor(d10 / 2);  // 10–15
  if (d6 === 5) return 20 + d10;                  // 21–30
  return 0;
}

function moveBallBy(yardsSignedForOffense) {
  // Offense direction: Chiefs increase ballOn; Broncos decrease ballOn
  const before = state.ballOn;
  const next = state.possession === "HOME"
    ? state.ballOn + yardsSignedForOffense
    : state.ballOn - yardsSignedForOffense;

  state.ballOn = clamp(next, 0, 100);

  // Signed gain for offense based on actual movement (caps included)
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
  state.score[state.possession] += 1; // auto XP
}

function switchPossession(reason) {
  state.possession = state.possession === "HOME" ? "AWAY" : "HOME";
  state.down = 1;
  state.toGo = 10;
  state.lastPlayWasSack = false;
  state.expectingChaos = false;
  state.pendingPlayCall = null;

  // Start new possession at own 25
  state.ballOn = state.possession === "HOME" ? 25 : 75;

  logPlay(reason);
  ensureCpuPlayCall();
}

function chooseCpuPlayCall() {
  // Simple CPU strategy (no cheating; just chooses intent)
  const distToScore = state.ballOn; // Broncos drive toward 0, so their distance to TD = ballOn
  const inFgRange = distToScore <= 35;
  const deep = distToScore >= 75;

  if (state.down === 4) {
    if (inFgRange) return "FG";
    if (deep) return "PUNT";
    return (state.toGo <= 3) ? "PASS" : "PUNT";
  }

  // Slight pass lean
  return Math.random() < 0.52 ? "RUN" : "PASS";
}

function ensureCpuPlayCall() {
  if (state.possession !== "AWAY") return;
  if (state.expectingChaos) return;
  if (state.pendingPlayCall) return;

  state.pendingPlayCall = chooseCpuPlayCall();
  showOverlay("BRONCOS CALL", `${state.pendingPlayCall} — enter dice, then Resolve.`, "normal");
}

// ---------- Chaos (D20) ----------
function isOwnTerritory() {
  // Relative to offense
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
  if (d6 !== 1) return false; // chaos tied to sacks + desperation
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
  if (d20 <= 5) return { type: "FLAG", text: "FLAG!" };         // penalties live here
  if (d20 <= 8) return { type: "HARDHIT", text: "Hard hit — no flag." };
  if (d20 <= 15) return { type: "CLEAN", text: "No extra effect." };
  if (d20 <= 18) return { type: "MOMENTUM", text: "Momentum swing." };
  if (d20 === 19) return { type: "DEF_MISTAKE", text: "Defensive mistake — offense bonus." };
  return { type: "ABSOLUTE", text: "ABSOLUTE CHAOS." };
}

function applyFlag() {
  // Simple, believable flags
  const offense = state.possession;
  const play = state.pendingPlayCall || "PLAY";

  const isPass = play === "PASS";
  const defensive = Math.random() < (isPass ? 0.45 : 0.25);

  if (defensive) {
    const yards = isPass ? 15 : 5;
    const gain = moveBallBy(yards);
    // auto first down
    state.down = 1;
    state.toGo = 10;
    return `🚩 Defensive penalty +${gain} → Ball @ ${yardMarker(state.ballOn)} (Automatic 1st down)`;
  } else {
    const yards = Math.random() < 0.35 ? 5 : 10; // false start / holding
    const gain = moveBallBy(-yards); // negative for offense
    state.toGo += Math.abs(gain);
    return `🚩 Offensive penalty ${gain} → Ball @ ${yardMarker(state.ballOn)} (Replay down)`;
  }
}

function applyChaosNow(d20) {
  const offTeam = state.possession === "HOME" ? "Chiefs" : "Broncos";
  const defTeam = state.possession === "HOME" ? "Broncos" : "Chiefs";

  const out = chaosOutcome(d20);

  // After a sack, base sack loss is 6 yards (already moved ball)
  // Now we apply the down/toGo plus chaos modifier
  if (out.type === "TURNOVER") {
    showOverlay("TURNOVER!", `D20=${d20} — ${defTeam} take over.`, "shake");
    switchPossession(`${defTeam} take over on a turnover (Chaos D20=${d20}).`);
    return;
  }

  if (out.type === "FLAG") {
    const msg = applyFlag();
    showOverlay("FLAG!", `D20=${d20} — ${msg}`, "shake");
    logPlay(`CHAOS (D20=${d20}): ${msg}`);
    // then apply the sack down update
    state.toGo += 6;
    state.down += 1;
    state.clock = clamp(state.clock - 10, 0, 15 * 60);
    if (state.down > 4) {
      showOverlay("TURNOVER ON DOWNS", "Defense takes over.", "shake");
      switchPossession("Turnover on downs.");
    }
    return;
  }

  if (out.type === "DEF_MISTAKE") {
    const bonus = 6;
    const gain = moveBallBy(bonus);
    showOverlay("DEFENSE BLOWS IT", `D20=${d20} — offense escapes +${gain}.`, "normal");
    logPlay(`CHAOS (D20=${d20}): Defensive mistake → +${gain} → Ball @ ${yardMarker(state.ballOn)}`);
    state.toGo = clamp(state.toGo + 6 - gain, 1, 99);
    state.down += 1;
    state.clock = clamp(state.clock - 8, 0, 15 * 60);
    return;
  }

  if (out.type === "ABSOLUTE") {
    const turnover = (d20 % 2 === 0);
    if (turnover) {
      showOverlay("ABSOLUTE CHAOS!", `D20=${d20} — turnover eruption.`, "shake");
      switchPossession(`${defTeam} take over (ABSOLUTE CHAOS D20=${d20}).`);
      return;
    } else {
      const bailout = 12;
      const gain = moveBallBy(bailout);
      showOverlay("ABSOLUTE CHAOS!", `D20=${d20} — offense escapes +${gain}!`, "confetti");
      logPlay(`CHAOS (D20=${d20}): Offense escapes +${gain} → Ball @ ${yardMarker(state.ballOn)}`);
      state.toGo = clamp(state.toGo + 6 - gain, 1, 99);
      state.down += 1;
      state.clock = clamp(state.clock - 6, 0, 15 * 60);
      return;
    }
  }

  // NEAR / HARDHIT / CLEAN / MOMENTUM
  showOverlay("CHAOS", `D20=${d20} — ${out.text}`, out.type === "HARDHIT" ? "shake" : "normal");
  logPlay(`CHAOS (D20=${d20}): ${out.text}`);

  state.toGo += 6;
  state.down += 1;
  state.clock = clamp(state.clock - 10, 0, 15 * 60);

  if (state.down > 4) {
    showOverlay("TURNOVER ON DOWNS", "Defense takes over.", "shake");
    switchPossession("Turnover on downs.");
  }
}

// ---------- Special Teams ----------
function resolvePunt(d6) {
  // Punt net: 38–47, with touchback rules
  const net = 38 + Math.floor(Math.random() * 10);
  const kickerTeam = state.possession === "HOME" ? "Chiefs" : "Broncos";

  const before = state.ballOn;
  // Punt direction is offense direction
  const landing = clamp(state.possession === "HOME" ? (before + net) : (before - net), 0, 100);

  // Touchback-ish
  let finalLanding = landing;
  if (state.possession === "HOME" && finalLanding >= 95) finalLanding = 80; // DEN 20
  if (state.possession === "AWAY" && finalLanding <= 5) finalLanding = 20;  // CHI 20

  // Switch possession, set ball to landing
  state.possession = state.possession === "HOME" ? "AWAY" : "HOME";
  state.down = 1;
  state.toGo = 10;
  state.lastPlayWasSack = false;
  state.expectingChaos = false;
  state.pendingPlayCall = null;
  state.ballOn = finalLanding;

  showOverlay("PUNT", `${kickerTeam} punt it away → Ball @ ${yardMarker(state.ballOn)}`, "normal");
  logPlay(`${kickerTeam} punt → Ball @ ${yardMarker(state.ballOn)} (New possession).`);
}

function resolveFieldGoal(d20) {
  // Distance estimate: distance to goal line + 17
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
    showOverlay("FIELD GOAL!", `${kickerTeam} nails it (D20=${d20}, need ${needed}+).`, "confetti");
    logPlay(`${kickerTeam} FG GOOD (D20=${d20}, need ${needed}+) → Score ${state.score.HOME}-${state.score.AWAY}`);
    switchPossession("Kickoff after FG.");
  } else {
    showOverlay("NO GOOD", `${kickerTeam} misses (D20=${d20}, need ${needed}+).`, "shake");
    logPlay(`${kickerTeam} FG missed (D20=${d20}, need ${needed}+).`);
    switchPossession("Missed FG — possession flips.");
  }
}

// ---------- Play Resolution ----------
function resolveNormalPlay(playCall, d6, d10, d20) {
  const side = state.possession;
  const offTeam = side === "HOME" ? "Chiefs" : "Broncos";

  // TD on D6=6
  if (d6 === 6) {
    const scorer = actorForPlay(side, playCall, 6);
    scoreTD();
    showOverlay("TOUCHDOWN!", `${scorer} scores! (+XP)`, "confetti");
    logPlay(`${scorer} TD! → Score ${state.score.HOME}-${state.score.AWAY}`);
    state.clock = clamp(state.clock - 10, 0, 15 * 60);
    switchPossession("Kickoff after TD.");
    return;
  }

  // Sack
  if (d6 === 1) {
    const qb = ROSTER[side].QB;
    const loss = 6;
    const gain = moveBallBy(-loss); // negative number
    state.lastPlayWasSack = true;

    const chaos = chaosShouldTrigger(d6, playCall);
    if (chaos) {
      state.expectingChaos = true;
      showOverlay("SACK!", `-${Math.abs(gain)} → Ball @ ${yardMarker(state.ballOn)} • CHAOS! Enter D20 and Resolve.`, "shake");
      logPlay(`${qb} sacked ${gain} → Ball @ ${yardMarker(state.ballOn)} (CHAOS triggered)`);
      return;
    }

    // Normal sack down update
    state.toGo += Math.abs(gain);
    state.down += 1;
    state.clock = clamp(state.clock - runoffSeconds(d6, playCall), 0, 15 * 60);

    showOverlay("SACK!", `${qb} sacked ${gain} → Ball @ ${yardMarker(state.ballOn)}`, "shake");
    logPlay(`${qb} sacked ${gain} → Ball @ ${yardMarker(state.ballOn)}`);

    if (state.down > 4) {
      showOverlay("TURNOVER ON DOWNS", "Defense takes over.", "shake");
      switchPossession("Turnover on downs.");
    }
    return;
  }

  // Stuffed run (-1 to 0)
  if (d6 === 2) {
    const actor = actorForPlay(side, playCall, d6);
    const y = -(Math.random() < 0.5 ? 1 : 0);
    const gain = moveBallBy(y);

    state.lastPlayWasSack = false;
    state.toGo = clamp(state.toGo - gain, 1, 99);
    state.down += 1;
    state.clock = clamp(state.clock - runoffSeconds(d6, playCall), 0, 15 * 60);

    showOverlay("STUFFED", `${actor} ${gain} → Ball @ ${yardMarker(state.ballOn)}`, "shake");
    logPlay(`${actor} stuffed ${gain} → Ball @ ${yardMarker(state.ballOn)}`);

    if (state.down > 4) {
      showOverlay("TURNOVER ON DOWNS", "Defense takes over.", "shake");
      switchPossession("Turnover on downs.");
    }
    return;
  }

  // Gains (D6=3/4/5)
  if (d6 === 3 || d6 === 4 || d6 === 5) {
    const actor = actorForPlay(side, playCall, d6);
    let yards = yardsFromDice(d6, d10);

    // Highlight Reel: On BIG PLAY only, if D20=20 -> breakaway to endzone
    if (d6 === 5 && d20 === 20) {
      const dist = side === "HOME" ? (100 - state.ballOn) : state.ballOn;
      yards = dist; // can be 92, etc.
      showOverlay("HIGHLIGHT REEL!", `${actor} breaks free! D20=20 → BREAKAWAY!`, "confetti");
      logPlay(`🔥 HIGHLIGHT: D6=5 + D20=20 → breakaway unlocked.`);
    }

    const gain = moveBallBy(yards);

    // TD by reaching goal line
    if (isTouchdown()) {
      scoreTD();
      showOverlay("TOUCHDOWN!", `${actor} goes the distance! (+XP)`, "confetti");
      logPlay(`${actor} TD (+${gain}) → Score ${state.score.HOME}-${state.score.AWAY}`);
      state.clock = clamp(state.clock - runoffSeconds(d6, playCall), 0, 15 * 60);
      state.lastPlayWasSack = false;
      switchPossession("Kickoff after TD.");
      return;
    }

    // First down?
    if (gain >= state.toGo) {
      state.down = 1;
      state.toGo = 10;
      showOverlay(d6 === 5 ? "BIG PLAY!" : "FIRST DOWN!", `${actor} +${gain} → Ball @ ${yardMarker(state.ballOn)}`, "normal");
      logPlay(`${actor} +${gain} → Ball @ ${yardMarker(state.ballOn)} (1st down)`);
    } else {
      state.toGo = state.toGo - gain;
      state.down += 1;
      showOverlay(d6 === 5 ? "BIG PLAY!" : "GAIN", `${actor} +${gain} → Ball @ ${yardMarker(state.ballOn)}`, "normal");
      logPlay(`${actor} +${gain} → Ball @ ${yardMarker(state.ballOn)}`);
    }

    state.clock = clamp(state.clock - runoffSeconds(d6, playCall), 0, 15 * 60);
    state.lastPlayWasSack = false;

    if (state.down > 4) {
      showOverlay("TURNOVER ON DOWNS", "Defense takes over.", "shake");
      switchPossession("Turnover on downs.");
    }
    return;
  }

  // Fallback
  logPlay(`${offTeam} play resolved.`);
}

function advanceQuarterIfNeeded() {
  if (state.clock > 0) return;

  if (state.quarter < 4) {
    state.quarter += 1;
    state.clock = 5 * 60;
    showOverlay(`Q${state.quarter} START`, "Fresh quarter, fresh chaos.", "normal");
    logPlay(`--- End of Q${state.quarter - 1}. Start Q${state.quarter}. ---`);
  } else {
    const h = state.score.HOME, a = state.score.AWAY;
    const result = h === a ? "TIE GAME" : (h > a ? "CHIEFS WIN" : "BRONCOS WIN");
    showOverlay(result, `Final: Chiefs ${h} — Broncos ${a}`, "confetti");
    logPlay(`FINAL: Chiefs ${h} — Broncos ${a}`);
  }
}

// ---------- Controls ----------
function setPlayCall(call) {
  if (state.possession === "AWAY") return; // CPU owns playcalling
  state.pendingPlayCall = call;
  showOverlay("CHIEFS CALL", `${call} — enter dice, then Resolve.`, "normal");
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
  showOverlay("NEW GAME", "Chiefs start at CHI 25. Pick a play.", "normal");
  updateUI();
});

el.btnResolve.addEventListener("click", () => {
  // Auto CPU play call if Broncos turn
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

  // If waiting for chaos, resolve chaos only
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

  // Special teams
  if (call === "PUNT") {
    resolvePunt(d6);
    state.clock = clamp(state.clock - runoffSeconds(d6, call), 0, 15 * 60);
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

  // Normal play
  resolveNormalPlay(call, d6, d10, d20);

  // Clear inputs and playcall (unless chaos is pending)
  if (!state.expectingChaos) {
    state.pendingPlayCall = null;
    el.inD6.value = "";
    el.inD10.value = "";
    el.inD20.value = "";
  } else {
    // keep D20 empty to prompt next step
    el.inD20.value = "";
  }

  updateUI();
  advanceQuarterIfNeeded();
});

// Init
showOverlay("READY", "Chiefs ball @ CHI 25. Pick a play, type dice, Resolve.", "normal");
updateUI();
