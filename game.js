// Cartoon Dice Football (manual dice input) — Chiefs (You) vs Broncos (CPU)
// GitHub Pages friendly: no build tools, no modules.

// ---------- Helpers ----------
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

function nowMeta(state) {
  return `${state.quarterLabel} ${fmtClock(state.clock)} • ${state.possession === "HOME" ? "Chiefs" : "Broncos"} ball`;
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
  chain: document.getElementById("chain"),

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
  btnNewDrive: document.getElementById("btnNewDrive"),

  cpuHint: document.getElementById("cpuHint"),
};

// Yardlines: draw 10 segments between endzones
function renderYardlines() {
  const count = 10;
  const frag = document.createDocumentFragment();
  for (let i = 0; i <= count; i++) {
    const line = document.createElement("div");
    line.style.position = "absolute";
    line.style.left = `${(i / count) * 100}%`;
    line.style.top = "0";
    line.style.bottom = "0";
    line.style.width = "2px";
    line.style.background = "rgba(255,255,255,.22)";
    frag.appendChild(line);

    const label = document.createElement("div");
    label.style.position = "absolute";
    label.style.left = `${(i / count) * 100}%`;
    label.style.top = "10px";
    label.style.transform = "translateX(-50%)";
    label.style.fontWeight = "1000";
    label.style.fontSize = "11px";
    label.style.color = "rgba(255,255,255,.75)";
    label.style.textShadow = "0 4px 10px rgba(0,0,0,.35)";
    label.textContent = String(i * 10);
    frag.appendChild(label);
  }
  el.yardlines.appendChild(frag);
}
renderYardlines();

// ---------- Game State ----------
const initialState = () => ({
  // Field model: 0..100, where 0 = Chiefs endzone (HOME goal), 100 = Broncos endzone (AWAY goal)
  // Offense direction depends on possession:
  // HOME offense drives toward 100; AWAY offense drives toward 0.
  ballOn: 25,
  down: 1,
  toGo: 10,

  possession: "HOME", // YOU start with Chiefs
  score: { HOME: 0, AWAY: 0 },

  quarter: 1,
  clock: 5 * 60, // 5 min arcade quarter
  lastPlayWasSack: false,
  pendingPlayCall: null, // "RUN"|"PASS"|"PUNT"|"FG"
  expectingChaos: false,
  lastWasTurnover: false,
});

let state = initialState();

// ---------- UI Updates ----------
function quarterLabel(q) { return `Q${q}`; }

function updateUI() {
  el.homeScore.textContent = state.score.HOME;
  el.awayScore.textContent = state.score.AWAY;
  el.quarter.textContent = quarterLabel(state.quarter);
  el.clock.textContent = fmtClock(state.clock);

  const possName = state.possession === "HOME" ? "Chiefs" : "Broncos";
  el.possession.textContent = `${possName} ball`;

  const side = state.possession === "HOME" ? "CHI" : "DEN";
  const yard = Math.round(state.possession === "HOME" ? state.ballOn : (100 - state.ballOn));
  const spot = `${side} ${yard}`;
  el.situation.textContent = `${ordinalDown(state.down)} & ${state.toGo} @ ${spot}`;

  // Ball marker position: keep it inside inner field (between endzones)
  const innerLeft = 9;  // %
  const innerRight = 91; // %
  const x = innerLeft + (state.ballOn / 100) * (innerRight - innerLeft);

  // Some vertical variety just for cartoon feel (changes slightly with down)
  const y = 50 + (state.down - 2) * 4;
  el.ball.style.left = `${x}%`;
  el.ball.style.top = `${y}%`;

  // Chain marker
  const firstDownSpot = state.possession === "HOME"
    ? clamp(state.ballOn + state.toGo, 0, 100)
    : clamp(state.ballOn - state.toGo, 0, 100);

  const chainX = innerLeft + (firstDownSpot / 100) * (innerRight - innerLeft);
  el.chain.style.left = `${chainX}%`;
  el.chain.style.top = `${y}%`;

  // CPU hint
  if (state.possession === "AWAY") {
    const cpuCall = chooseCpuPlayCall();
    el.cpuHint.textContent = `CPU (Broncos) will call: ${cpuCall}. You still enter the dice you rolled.`;
  } else {
    el.cpuHint.textContent = `You are the Chiefs. Pick a play, then type your dice rolls.`;
  }
}

function logPlay(text) {
  const item = document.createElement("div");
  item.className = "item";
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = nowMeta({ ...state, quarterLabel: quarterLabel(state.quarter) });
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

  // animate
  el.overlayCard.classList.remove("pop");
  el.overlayTitle.classList.remove("bounce");
  void el.overlayCard.offsetWidth;
  el.overlayCard.classList.add("pop");
  el.overlayTitle.classList.add("bounce");

  // screen shake for sacks/turnovers
  if (vibe === "shake") {
    el.field.classList.remove("shake");
    void el.field.offsetWidth;
    el.field.classList.add("shake");
  }

  if (vibe === "confetti") {
    spawnConfetti();
  }
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

// ---------- Rules ----------
function readDie(inputEl, min, max) {
  const raw = String(inputEl.value || "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function validateDiceForPlay(d6, d10, d20, expectingChaos) {
  if (d6 == null) return { ok: false, msg: "Enter D6 (1–6)." };
  if ([3,4,5].includes(d6) && d10 == null) return { ok: false, msg: "Enter D10 (1–10) for this D6 result." };
  if (expectingChaos && d20 == null) return { ok: false, msg: "Chaos triggered — enter D20 (1–20)." };
  return { ok: true, msg: "" };
}

function isOwnTerritory() {
  // "Own territory" relative to current offense
  if (state.possession === "HOME") return state.ballOn < 50;
  return state.ballOn > 50;
}

function isGoalLineDanger() {
  // near own goal line relative to offense
  if (state.possession === "HOME") return state.ballOn <= 5;
  return state.ballOn >= 95;
}

function lateHalf() {
  const late = state.clock <= 120;
  return late && (state.quarter === 2 || state.quarter === 4);
}

function trailingLate() {
  if (state.quarter !== 4) return false;
  const my = state.possession === "HOME" ? state.score.HOME : state.score.AWAY;
  const opp = state.possession === "HOME" ? state.score.AWAY : state.score.HOME;
  return my < opp && state.clock <= 180;
}

function chaosShouldTrigger(d6Result, playCall) {
  // Your triggers (implemented reasonably)
  if (d6Result !== 1) return false; // chaos triggers from sacks in this ruleset (plus desperation)
  if (isOwnTerritory()) return true;
  if (isGoalLineDanger()) return true;
  if (state.lastPlayWasSack) return true;
  if (lateHalf()) return true;
  if (trailingLate()) return true;

  // Trick/desperation isn't in v1, but going for it on 4th is essentially desperation:
  if (state.down === 4 && playCall !== "PUNT" && playCall !== "FG") return true;

  return false;
}

function applyChaos(d20) {
  // Returns modifier object
  if (d20 === 1) return { type: "TURNOVER", text: "Turnover! Ball pops loose / pick chaos." };
  if (d20 <= 3) return { type: "NEAR", text: "Near turnover — offense barely recovers." };
  if (d20 <= 5) return { type: "PENALTY", text: "Penalty swings it (holding-ish energy)." };
  if (d20 <= 8) return { type: "HARDHIT", text: "No chaos — just a hard hit." };
  if (d20 <= 15) return { type: "CLEAN", text: "Clean play — no extra effect." };
  if (d20 <= 18) return { type: "MOMENTUM", text: "Momentum swing — crowd goes nuts." };
  if (d20 === 19) return { type: "DEF_MISTAKE", text: "Defensive mistake — bonus for offense." };
  return { type: "ABSOLUTE", text: "ABSOLUTE CHAOS — huge swing!" }; // 20
}

function runoffSeconds(d6, playCall) {
  // Cartoon pacing: sacks/runs drain more, big plays less, TDs stop.
  if (d6 === 6) return 10;
  if (playCall === "PUNT" || playCall === "FG") return 12;
  if (d6 === 1) return 28;         // sack drains clock
  if (d6 === 2) return 25;         // stuffed run / short play
  if (d6 === 3) return 24;
  if (d6 === 4) return 20;
  if (d6 === 5) return 16;
  return 20;
}

function yardsFromDice(d6, d10) {
  if (d6 === 2) return -(Math.random() < 0.5 ? 1 : 0); // -1 to 0
  if (d6 === 3) return 3 + Math.floor(d10 / 5);        // 3–5
  if (d6 === 4) return 10 + Math.floor(d10 / 2);       // 10 + 0..5 => 10–15 (we'll treat as first-down type)
  if (d6 === 5) return 20 + d10;                       // 21–30
  return 0;
}

function switchPossession(reason = "Possession changes") {
  state.possession = state.possession === "HOME" ? "AWAY" : "HOME";
  state.down = 1;
  state.toGo = 10;
  state.lastPlayWasSack = false;
  state.expectingChaos = false;
  state.pendingPlayCall = null;
  state.lastWasTurnover = reason.toLowerCase().includes("turnover");

  // After change, place ball at "own 25" equivalent for new offense
  state.ballOn = state.possession === "HOME" ? 25 : 75;
}

function scoreTD() {
  state.score[state.possession] += 6;
  // Auto extra point per your rules
  state.score[state.possession] += 1;
}

function isTouchdownForOffense(nextBallOn) {
  if (state.possession === "HOME") return nextBallOn >= 100;
  return nextBallOn <= 0;
}

function moveBall(yards) {
  const next = state.possession === "HOME" ? state.ballOn + yards : state.ballOn - yards;
  state.ballOn = clamp(next, 0, 100);
}

function chooseCpuPlayCall() {
  // Basic CPU logic: punt on 4th deep, FG in range, otherwise pass more when behind.
  const cpuIsAway = (state.possession === "AWAY");
  if (!cpuIsAway) return "PASS";

  const yardToEndzone = 100 - state.ballOn; // Broncos driving toward 0; but field is 0..100
  // For Broncos offense (AWAY drives toward 0), distance to score is state.ballOn
  const distToScore = state.ballOn;

  const inFgRange = distToScore <= 35; // rough
  const deep = distToScore >= 75;

  if (state.down === 4) {
    if (inFgRange) return "FG";
    if (deep) return "PUNT";
    // go for it mid-field if short
    return state.toGo <= 3 ? "PASS" : "PUNT";
  }

  // Behind late? throw more
  const broncosBehind = state.score.AWAY < state.score.HOME;
  if (state.quarter >= 3 && broncosBehind) return "PASS";

  // Mix
  return Math.random() < 0.52 ? "RUN" : "PASS";
}

// ---------- Special Teams ----------
function resolvePunt() {
  // Simple punt: flip field; no dice needed besides D6 (we still let you type D6 for flavor)
  // We'll use a fixed net punt with some variance tied to down/toGo.
  const net = 38 + Math.floor(Math.random() * 10); // 38–47
  const oldPoss = state.possession;

  // Move ball in punt direction (offense's direction) then switch; new offense takes where it lands.
  let landing;
  if (oldPoss === "HOME") landing = clamp(state.ballOn + net, 0, 100);
  else landing = clamp(state.ballOn - net, 0, 100);

  // Cap: touchback-ish behavior
  if (oldPoss === "HOME" && landing >= 95) landing = 80; // opponent 20
  if (oldPoss === "AWAY" && landing <= 5) landing = 20;  // opponent 20

  // Switch and set new ball
  state.possession = oldPoss === "HOME" ? "AWAY" : "HOME";
  state.down = 1;
  state.toGo = 10;
  state.lastPlayWasSack = false;
  state.expectingChaos = false;
  state.pendingPlayCall = null;

  // Set spot for new offense
  state.ballOn = state.possession === "HOME" ? (100 - landing) : landing; 
  // Explanation: since ballOn is absolute field, keep it as landing.
  // But we changed possession, so just set ballOn = landing:
  state.ballOn = landing;

  logPlay(`${oldPoss === "HOME" ? "Chiefs" : "Broncos"} punt it away. New possession.`);
  showOverlay("PUNT", "Field flips. New possession.", "normal");
}

function resolveFieldGoal(d20) {
  // You requested FG uses D20 and long kicks need high D20.
  // We'll compute distance roughly based on offense direction.
  const distToScore = state.possession === "HOME" ? (100 - state.ballOn) : state.ballOn;
  const kickDistance = distToScore + 17; // rough (endzone+snap+hold)
  let needed;
  if (kickDistance <= 33) needed = 4;
  else if (kickDistance <= 40) needed = 7;
  else if (kickDistance <= 47) needed = 11;
  else if (kickDistance <= 54) needed = 15;
  else needed = 18;

  const made = d20 >= needed;

  // Clock runoff small
  state.clock = clamp(state.clock - 10, 0, 15 * 60);

  if (made) {
    state.score[state.possession] += 3;
    logPlay(`FIELD GOAL is GOOD! (D20 ${d20} vs need ${needed})`);
    showOverlay("FIELD GOAL!", `Good from ~${kickDistance} yards (need ${needed}+).`, "confetti");
    // Switch possession at "own 25"
    switchPossession("Kickoff after FG");
  } else {
    logPlay(`Field Goal missed. (D20 ${d20} vs need ${needed})`);
    showOverlay("NO GOOD", `Missed from ~${kickDistance} yards (needed ${needed}+).`, "shake");
    // Possession flips; opponent takes at spot (simplified to their 25)
    switchPossession("Missed FG");
  }
}

// ---------- Main Play Resolution ----------
function resolveNormalPlay(playCall, d6, d10, d20) {
  // TD on D6=6 immediate
  state.expectingChaos = false;

  const offenseName = state.possession === "HOME" ? "Chiefs" : "Broncos";

  if (d6 === 6) {
    scoreTD();
    logPlay(`${offenseName} hit a TOUCHDOWN! (D6=6)`);
    showOverlay("TOUCHDOWN!", "Dice said: straight to the endzone. (+XP)", "confetti");
    // After TD, switch possession at 25
    switchPossession("Kickoff after TD");
    // clock runoff
    state.clock = clamp(state.clock - 10, 0, 15 * 60);
    state.lastPlayWasSack = false;
    return;
  }

  // Sack
  if (d6 === 1) {
    const loss = 6; // fixed sack loss; you can tune later
    moveBall(-loss);
    state.lastPlayWasSack = true;

    // Chaos trigger check
    const chaos = chaosShouldTrigger(d6, playCall);
    if (chaos) {
      state.expectingChaos = true;
      showOverlay("SACK!", "Chaos triggered — enter your D20 and hit Resolve again.", "shake");
      logPlay(`${offenseName} sacked for -${loss}. CHAOS TRIGGERED.`);
      return;
    }

    // No chaos: proceed with down update
    state.toGo += loss;
    state.down += 1;

    // Turnover on downs?
    if (state.down > 4) {
      logPlay(`${offenseName} turned it over on downs after the sack.`);
      showOverlay("TURNOVER ON DOWNS", "Defense takes over.", "shake");
      switchPossession("Turnover on downs");
      return;
    }

    logPlay(`${offenseName} takes a sack (-${loss}).`);
    showOverlay("SACK!", `Big loss. Now ${ordinalDown(state.down)} & ${state.toGo}.`, "shake");
    state.clock = clamp(state.clock - runoffSeconds(d6, playCall), 0, 15 * 60);
    return;
  }

  // Stuffed run (−1 to 0)
  if (d6 === 2) {
    const y = yardsFromDice(d6, d10);
    moveBall(y);

    state.lastPlayWasSack = false;
    state.toGo = clamp(state.toGo - y, 1, 99);
    state.down += 1;

    if (y <= 0) {
      showOverlay("STUFFED", `No room. ${y} yards.`, "shake");
    } else {
      showOverlay("SMALL PUSH", `Grinds out ${y} yards.`, "normal");
    }

    logPlay(`${offenseName} stuffed run: ${y} yards.`);
    state.clock = clamp(state.clock - runoffSeconds(d6, playCall), 0, 15 * 60);

    if (state.down > 4) {
      logPlay(`${offenseName} turned it over on downs.`);
      showOverlay("TURNOVER ON DOWNS", "Defense takes over.", "shake");
      switchPossession("Turnover on downs");
    }
    return;
  }

  // Gains
  if (d6 === 3 || d6 === 4 || d6 === 5) {
    const y = yardsFromDice(d6, d10);

    // Cap by field space
    const before = state.ballOn;
    moveBall(y);
    const actual = Math.abs(state.ballOn - before); // absolute movement
    const signed = (state.possession === "HOME") ? (state.ballOn - before) : (before - state.ballOn);

    // TD by reaching endzone space (from big play etc.)
    if (isTouchdownForOffense(state.ballOn)) {
      scoreTD();
      logPlay(`${offenseName} breaks loose for a TOUCHDOWN!`);
      showOverlay("TOUCHDOWN!", `Explodes for a score! (+XP)`, "confetti");
      switchPossession("Kickoff after TD");
      state.clock = clamp(state.clock - runoffSeconds(d6, playCall), 0, 15 * 60);
      state.lastPlayWasSack = false;
      return;
    }

    // First down?
    if (signed >= state.toGo) {
      state.down = 1;
      state.toGo = 10;
      showOverlay(d6 === 5 ? "BIG PLAY!" : "FIRST DOWN!", `Gains ${signed} yards. Chains move.`, "normal");
      logPlay(`${offenseName} gains ${signed} yards. FIRST DOWN.`);
    } else {
      state.toGo = state.toGo - signed;
      state.down += 1;
      showOverlay(d6 === 5 ? "BIG PLAY!" : "GAIN", `Gains ${signed} yards.`, "normal");
      logPlay(`${offenseName} gains ${signed} yards.`);
    }

    state.clock = clamp(state.clock - runoffSeconds(d6, playCall), 0, 15 * 60);
    state.lastPlayWasSack = false;

    if (state.down > 4) {
      logPlay(`${offenseName} turned it over on downs.`);
      showOverlay("TURNOVER ON DOWNS", "Defense takes over.", "shake");
      switchPossession("Turnover on downs");
    }
    return;
  }

  // Fallback
  logPlay(`${offenseName} play resolved.`);
}

function applyChaosNow(d20) {
  const offenseName = state.possession === "HOME" ? "Chiefs" : "Broncos";
  const defenseName = state.possession === "HOME" ? "Broncos" : "Chiefs";
  const outcome = applyChaos(d20);

  state.expectingChaos = false;

  if (outcome.type === "TURNOVER") {
    logPlay(`CHAOS (D20=${d20}): ${outcome.text} ${defenseName} take over!`);
    showOverlay("TURNOVER!", outcome.text, "shake");
    switchPossession("Turnover (chaos)");
    return;
  }

  if (outcome.type === "NEAR") {
    logPlay(`CHAOS (D20=${d20}): ${outcome.text}`);
    showOverlay("NEAR TURNOVER", outcome.text, "shake");
    // offense keeps ball; just extra clock drain
    state.clock = clamp(state.clock - 8, 0, 15 * 60);
    // proceed to next down after the sack already applied:
    // We had returned early after sack. Now we must apply down logic.
    state.toGo += 6;
    state.down += 1;
    if (state.down > 4) {
      logPlay(`${offenseName} turned it over on downs.`);
      showOverlay("TURNOVER ON DOWNS", "Defense takes over.", "shake");
      switchPossession("Turnover on downs");
    }
    return;
  }

  if (outcome.type === "PENALTY") {
    // Usually holding: pushes offense back a bit
    const penalty = 10;
    if (state.possession === "HOME") state.ballOn = clamp(state.ballOn - penalty, 0, 100);
    else state.ballOn = clamp(state.ballOn + penalty, 0, 100);

    logPlay(`CHAOS (D20=${d20}): ${outcome.text} -10 yards.`);
    showOverlay("PENALTY!", `${outcome.text} (-10)`, "shake");

    // Apply down after sack
    state.toGo += 6 + penalty;
    state.down += 1;
    state.clock = clamp(state.clock - 10, 0, 15 * 60);
    if (state.down > 4) {
      logPlay(`Turnover on downs.`);
      showOverlay("TURNOVER ON DOWNS", "Defense takes over.", "shake");
      switchPossession("Turnover on downs");
    }
    return;
  }

  if (outcome.type === "DEF_MISTAKE") {
    // Bonus for offense: soften the sack impact a bit
    const bonus = 6;
    if (state.possession === "HOME") state.ballOn = clamp(state.ballOn + bonus, 0, 100);
    else state.ballOn = clamp(state.ballOn - bonus, 0, 100);

    logPlay(`CHAOS (D20=${d20}): ${outcome.text} Offense gets +${bonus}.`);
    showOverlay("DEFENSE BLOWS IT", `${outcome.text} (+${bonus})`, "normal");

    state.toGo = clamp(state.toGo + 6 - bonus, 1, 99); // sack loss (6) partially erased
    state.down += 1;
    state.clock = clamp(state.clock - 8, 0, 15 * 60);
    return;
  }

  if (outcome.type === "ABSOLUTE") {
    // Huge swing: 50/50 either turnover or big bailout based on parity
    const turnover = (d20 % 2 === 0);
    if (turnover) {
      logPlay(`CHAOS (D20=${d20}): ${outcome.text} TURNOVER!`);
      showOverlay("ABSOLUTE CHAOS!", "Turnover eruption. Defense takes it.", "shake");
      switchPossession("Turnover (absolute chaos)");
      return;
    } else {
      const bailout = 12;
      if (state.possession === "HOME") state.ballOn = clamp(state.ballOn + bailout, 0, 100);
      else state.ballOn = clamp(state.ballOn - bailout, 0, 100);

      logPlay(`CHAOS (D20=${d20}): ${outcome.text} Offense bails out (+${bailout}).`);
      showOverlay("ABSOLUTE CHAOS!", `Offense escapes with +${bailout}!`, "confetti");

      state.toGo = clamp(state.toGo + 6 - bailout, 1, 99);
      state.down += 1;
      state.clock = clamp(state.clock - 6, 0, 15 * 60);
      return;
    }
  }

  // CLEAN / HARDHIT / MOMENTUM
  logPlay(`CHAOS (D20=${d20}): ${outcome.text}`);
  showOverlay("CHAOS", outcome.text, outcome.type === "HARDHIT" ? "shake" : "normal");

  // Apply down after sack
  state.toGo += 6;
  state.down += 1;
  state.clock = clamp(state.clock - 10, 0, 15 * 60);

  if (state.down > 4) {
    logPlay(`Turnover on downs.`);
    showOverlay("TURNOVER ON DOWNS", "Defense takes over.", "shake");
    switchPossession("Turnover on downs");
  }
}

// Quarter/clock handling
function advanceQuarterIfNeeded() {
  if (state.clock > 0) return;

  if (state.quarter < 4) {
    state.quarter += 1;
    state.clock = 5 * 60;
    logPlay(`End of quarter. Starting Q${state.quarter}.`);
    showOverlay(`Q${state.quarter} START`, "Fresh quarter, fresh chaos.", "normal");
  } else {
    // End of game
    const h = state.score.HOME, a = state.score.AWAY;
    const result = h === a ? "TIE GAME" : (h > a ? "CHIEFS WIN" : "BRONCOS WIN");
    showOverlay(result, `Final: Chiefs ${h} — Broncos ${a}`, "confetti");
  }
}

// ---------- Controls ----------
function setPlayCall(call) {
  state.pendingPlayCall = call;
  const who = state.possession === "HOME" ? "Chiefs" : "Broncos";
  showOverlay(`${who} call: ${call}`, "Type your dice rolls, then hit Resolve.", "normal");
}

el.btnRun.addEventListener("click", () => setPlayCall("RUN"));
el.btnPass.addEventListener("click", () => setPlayCall("PASS"));
el.btnPunt.addEventListener("click", () => setPlayCall("PUNT"));
el.btnFG.addEventListener("click", () => setPlayCall("FG"));

el.btnNewDrive.addEventListener("click", () => {
  state = initialState();
  el.log.innerHTML = "";
  el.inD6.value = "";
  el.inD10.value = "";
  el.inD20.value = "";
  showOverlay("NEW GAME", "Chiefs start with the ball at the 25.", "normal");
  updateUI();
});

el.btnResolve.addEventListener("click", () => {
  // Auto CPU play call if it's Broncos turn and none selected
  if (!state.pendingPlayCall) {
    if (state.possession === "AWAY") {
      state.pendingPlayCall = chooseCpuPlayCall();
    } else {
      showOverlay("PICK A PLAY", "Choose Run/Pass/Punt/FG first.", "normal");
      return;
    }
  }

  const d6 = readDie(el.inD6, 1, 6);
  const d10 = readDie(el.inD10, 1, 10);
  const d20 = readDie(el.inD20, 1, 20);

  const check = validateDiceForPlay(d6, d10, d20, state.expectingChaos);
  if (!check.ok) {
    showOverlay("DICE NEEDED", check.msg, "normal");
    return;
  }

  const call = state.pendingPlayCall;

  // If we were expecting chaos, resolve that first and return
  if (state.expectingChaos) {
    applyChaosNow(d20);
    // clear dice inputs for next action
    el.inD6.value = "";
    el.inD10.value = "";
    el.inD20.value = "";
    updateUI();
    advanceQuarterIfNeeded();
    return;
  }

  // Special teams
  if (call === "PUNT") {
    resolvePunt();
    state.clock = clamp(state.clock - runoffSeconds(d6, call), 0, 15 * 60);
    state.pendingPlayCall = null;
    el.inD6.value = ""; el.inD10.value = ""; el.inD20.value = "";
    updateUI();
    advanceQuarterIfNeeded();
    return;
  }

  if (call === "FG") {
    if (d20 == null) {
      showOverlay("FIELD GOAL", "Enter D20 to attempt the kick.", "normal");
      return;
    }
    resolveFieldGoal(d20);
    state.pendingPlayCall = null;
    el.inD6.value = ""; el.inD10.value = ""; el.inD20.value = "";
    updateUI();
    advanceQuarterIfNeeded();
    return;
  }

  // Normal play resolution
  resolveNormalPlay(call, d6, d10, d20);

  // If a sack triggered chaos, we stop here and wait for D20 next click
  if (!state.expectingChaos) {
    // Clear play call after resolution
    state.pendingPlayCall = null;
    // Run clock
    state.clock = clamp(state.clock - runoffSeconds(d6, call), 0, 15 * 60);
  }

  // Clear dice inputs (but keep D20 if expecting chaos)
  el.inD6.value = "";
  el.inD10.value = "";
  if (!state.expectingChaos) el.inD20.value = "";

  updateUI();
  advanceQuarterIfNeeded();
});

// Initialize
showOverlay("READY", "Chiefs start on offense. Pick a play, type your dice, and resolve.", "normal");
updateUI();

