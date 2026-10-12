/**
 * Khelar Khata - Live Cricket Broadcast Web Viewer Engine
 * Zero-Leak Public Web Client (Read-Only Firebase Realtime Database Listener)
 */

const firebaseConfig = {
  apiKey: "AIzaSyBte674YTlmLLxAyU2dDQj-DgeLoqfeU04",
  databaseURL: "https://kheler-khata-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "kheler-khata",
  storageBucket: "kheler-khata.firebasestorage.app"
};

// Initialize Firebase App & Realtime Database instance
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// State variables
let currentMatchCode = null;
let activeListeners = [];
let overlayDismissTimer = null;
let lastKnownBallsCount = -1;
let lastKnownChip = null;
let activeHls = null;

// DOM Elements
const dom = {
  headerMatchTitle: document.getElementById("headerMatchTitle"),
  headerMatchCode: document.getElementById("headerMatchCode"),
  btnChangeCode: document.getElementById("btnChangeCode"),
  btnFullscreen: document.getElementById("btnFullscreen"),
  stageViewport: document.getElementById("stageViewport"),
  livePill: document.getElementById("livePill"),
  connectionStatusText: document.getElementById("connectionStatusText"),
  btnShareMatch: document.getElementById("btnShareMatch"),
  
  // Video & Backdrop
  stadiumBackdrop: document.getElementById("stadiumBackdrop"),
  backdropMatchVs: document.getElementById("backdropMatchVs"),
  backdropSubText: document.getElementById("backdropSubText"),
  youtubeContainer: document.getElementById("youtubeContainer"),
  youtubeIframe: document.getElementById("youtubeIframe"),
  hlsContainer: document.getElementById("hlsContainer"),
  hlsVideo: document.getElementById("hlsVideo"),

  // Celebration Banner
  celebrationBanner: document.getElementById("celebrationBanner"),
  celebrationText: document.getElementById("celebrationText"),

  // Overlays
  cardMatchSummary: document.getElementById("cardMatchSummary"),
  cardBatterOverview: document.getElementById("cardBatterOverview"),
  cardOutBatter: document.getElementById("cardOutBatter"),
  cardTargetBanner: document.getElementById("cardTargetBanner"),
  cardBowlerOverview: document.getElementById("cardBowlerOverview"),
  cardTextBanner: document.getElementById("cardTextBanner"),

  // Overlay fields
  summaryHeaderTitle: document.getElementById("summaryHeaderTitle"),
  sumTeamAName: document.getElementById("sumTeamAName"),
  sumTeamAScore: document.getElementById("sumTeamAScore"),
  sumTeamAStats: document.getElementById("sumTeamAStats"),
  sumTeamBName: document.getElementById("sumTeamBName"),
  sumTeamBScore: document.getElementById("sumTeamBScore"),
  sumTeamBStats: document.getElementById("sumTeamBStats"),
  summaryFooterStatus: document.getElementById("summaryFooterStatus"),

  batterCardName: document.getElementById("batterCardName"),
  batterCardRuns: document.getElementById("batterCardRuns"),
  batterCardBalls: document.getElementById("batterCardBalls"),
  batterCardFours: document.getElementById("batterCardFours"),
  batterCardSixes: document.getElementById("batterCardSixes"),
  batterCardSR: document.getElementById("batterCardSR"),

  outBatterName: document.getElementById("outBatterName"),
  outBatterDesc: document.getElementById("outBatterDesc"),
  outBatterStats: document.getElementById("outBatterStats"),

  targetCardRuns: document.getElementById("targetCardRuns"),
  targetCardDetails: document.getElementById("targetCardDetails"),

  bowlerCardName: document.getElementById("bowlerCardName"),
  bowlerCardOvers: document.getElementById("bowlerCardOvers"),
  bowlerCardMaidens: document.getElementById("bowlerCardMaidens"),
  bowlerCardRuns: document.getElementById("bowlerCardRuns"),
  bowlerCardWickets: document.getElementById("bowlerCardWickets"),
  bowlerCardEcon: document.getElementById("bowlerCardEcon"),

  textBannerContent: document.getElementById("textBannerContent"),

  // Score Bar (Lower Third)
  sbTeamBadge: document.getElementById("sbTeamBadge"),
  sbScore: document.getElementById("sbScore"),
  sbOvers: document.getElementById("sbOvers"),
  sbMaxOvers: document.getElementById("sbMaxOvers"),
  sbStrikerName: document.getElementById("sbStrikerName"),
  sbStrikerScore: document.getElementById("sbStrikerScore"),
  sbNonStrikerName: document.getElementById("sbNonStrikerName"),
  sbNonStrikerScore: document.getElementById("sbNonStrikerScore"),
  sbBowlerName: document.getElementById("sbBowlerName"),
  sbBowlerFigures: document.getElementById("sbBowlerFigures"),
  sbThisOverChips: document.getElementById("sbThisOverChips"),
  sbCrr: document.getElementById("sbCrr"),
  sbRrrBox: document.getElementById("sbRrrBox"),
  sbRrr: document.getElementById("sbRrr"),
  sbTargetNotice: document.getElementById("sbTargetNotice"),
  sbRunsNeeded: document.getElementById("sbRunsNeeded"),
  sbBallsLeft: document.getElementById("sbBallsLeft"),

  // Modal
  codeModal: document.getElementById("codeModal"),
  inputMatchCode: document.getElementById("inputMatchCode"),
  btnModalCancel: document.getElementById("btnModalCancel"),
  btnModalConnect: document.getElementById("btnModalConnect")
};

// 2. Extract Match Code from URL (?match=XYZ or ?live=XYZ or #XYZ)
function getMatchCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const matchParam = params.get("match") || params.get("live");
  if (matchParam && matchParam.trim().length > 0) {
    return matchParam.trim();
  }
  const hash = window.location.hash.replace("#", "").trim();
  if (hash.length > 0) {
    return hash;
  }
  return null;
}

// 3. Connect to Match Code in Firebase
function connectToMatch(code) {
  if (!code) return;
  code = code.trim().toUpperCase();

  detachAllListeners();

  currentMatchCode = code;
  dom.headerMatchCode.textContent = code;
  dom.connectionStatusText.textContent = `Connecting to match ${code}...`;
  updateUrl(code);

  const matchRef = db.ref(`matches/${code}`);

  // Listener: Meta
  const metaRef = matchRef.child("meta");
  const metaCallback = metaRef.on("value", (snap) => {
    if (!snap.exists()) {
      dom.connectionStatusText.textContent = `Match ${code} not found. Please check code.`;
      dom.headerMatchTitle.textContent = "Match Not Found";
      return;
    }
    const meta = snap.val() || {};
    const title = meta.title || `${meta.teamA || "Team A"} vs ${meta.teamB || "Team B"}`;
    dom.headerMatchTitle.textContent = title;
    dom.backdropMatchVs.textContent = title.toUpperCase();
    dom.connectionStatusText.textContent = `Connected (Status: ${meta.status || "Live"})`;
    
    if (meta.maxOvers) {
      dom.sbMaxOvers.textContent = `/${meta.maxOvers}`;
    }
    if (meta.shortA && !meta.battingTeam) {
      dom.sbTeamBadge.textContent = meta.shortA;
    }
  }, (err) => {
    dom.connectionStatusText.textContent = "Connection error: " + err.message;
  });
  activeListeners.push({ ref: metaRef, callback: metaCallback });

  // Listener: State
  const stateRef = matchRef.child("state");
  const stateCallback = stateRef.on("value", (snap) => {
    if (!snap.exists()) return;
    const state = snap.val() || {};
    renderScoreBar(state);
    checkForCelebration(state);
  });
  activeListeners.push({ ref: stateRef, callback: stateCallback });

  // Listener: Video Config
  const videoRef = matchRef.child("video");
  const videoCallback = videoRef.on("value", (snap) => {
    const videoData = snap.val() || {};
    renderVideoStream(videoData);
  });
  activeListeners.push({ ref: videoRef, callback: videoCallback });

  // Listener: Broadcast Overlays
  const overlayRef = matchRef.child("overlay");
  const overlayCallback = overlayRef.on("value", (snap) => {
    if (!snap.exists()) {
      hideAllOverlays();
      return;
    }
    const packet = snap.val() || {};
    handleOverlayPacket(packet);
  });
  activeListeners.push({ ref: overlayRef, callback: overlayCallback });
}

function detachAllListeners() {
  activeListeners.forEach(({ ref, callback }) => {
    try { ref.off("value", callback); } catch (e) {}
  });
  activeListeners = [];
  if (overlayDismissTimer) {
    clearTimeout(overlayDismissTimer);
    overlayDismissTimer = null;
  }
}

function renderScoreBar(state) {
  const runs = Number(state.runs || 0);
  const wickets = Number(state.wickets || 0);
  const legalBalls = Number(state.legalBalls || 0);
  const innings = Number(state.innings || 1);
  const target = Number(state.target || 0);

  dom.sbScore.textContent = `${runs}/${wickets}`;
  const compOvers = Math.floor(legalBalls / 6);
  const remBalls = legalBalls % 6;
  dom.sbOvers.childNodes[0].nodeValue = `${compOvers}.${remBalls}`;

  if (state.battingTeam) {
    dom.sbTeamBadge.textContent = state.battingTeam.substring(0, 4).toUpperCase();
  }

  const striker = state.striker || {};
  dom.sbStrikerName.textContent = striker.id || "Striker";
  dom.sbStrikerScore.innerHTML = `${striker.r || 0} <span class="balls-sub">(${striker.b || 0})</span>`;

  const nonStriker = state.nonStriker || {};
  dom.sbNonStrikerName.textContent = nonStriker.id || "Non-Striker";
  dom.sbNonStrikerScore.innerHTML = `${nonStriker.r || 0} <span class="balls-sub">(${nonStriker.b || 0})</span>`;

  const bowler = state.bowler || {};
  dom.sbBowlerName.textContent = bowler.id || "Bowler";
  dom.sbBowlerFigures.innerHTML = `${bowler.w || 0}-${bowler.r || 0} <span class="balls-sub">(${bowler.o || "0.0"})</span>`;

  const crr = legalBalls > 0 ? ((runs * 6) / legalBalls).toFixed(2) : "0.00";
  dom.sbCrr.textContent = crr;

  if (innings === 2 && target > 0) {
    const ballsLeft = Math.max(0, (20 * 6) - legalBalls);
    const runsNeeded = Math.max(0, target - runs);
    const rrr = ballsLeft > 0 ? ((runsNeeded * 6) / ballsLeft).toFixed(2) : "-";
    dom.sbRrrBox.style.display = "block";
    dom.sbRrr.textContent = rrr;
    dom.sbTargetNotice.style.display = "block";
    dom.sbRunsNeeded.textContent = runsNeeded;
    dom.sbBallsLeft.textContent = ballsLeft;
  } else {
    dom.sbRrrBox.style.display = "none";
    dom.sbTargetNotice.style.display = "none";
  }

  const thisOver = Array.isArray(state.thisOver) ? state.thisOver : [];
  dom.sbThisOverChips.innerHTML = "";
  if (thisOver.length === 0) {
    dom.sbThisOverChips.innerHTML = '<span class="ball-chip">·</span>';
  } else {
    thisOver.forEach(chip => {
      const chipEl = document.createElement("span");
      chipEl.className = "ball-chip";
      const chipStr = String(chip);
      chipEl.textContent = chipStr;
      if (chipStr === "4") chipEl.classList.add("four");
      else if (chipStr === "6") chipEl.classList.add("six");
      else if (chipStr.startsWith("W")) chipEl.classList.add("wicket");
      dom.sbThisOverChips.appendChild(chipEl);
    });
  }
}

function checkForCelebration(state) {
  const legalBalls = Number(state.legalBalls || 0);
  const thisOver = Array.isArray(state.thisOver) ? state.thisOver : [];
  const latestChip = thisOver.length > 0 ? String(thisOver[thisOver.length - 1]) : null;

  if (legalBalls !== lastKnownBallsCount && latestChip) {
    lastKnownBallsCount = legalBalls;
    lastKnownChip = latestChip;

    if (latestChip === "4") {
      triggerCelebration("FOUR", "four");
    } else if (latestChip === "6") {
      triggerCelebration("MAXIMUM 6", "six");
    } else if (latestChip.startsWith("W")) {
      triggerCelebration("WICKET!", "wicket");
    }
  }
}

function triggerCelebration(text, typeClass) {
  dom.celebrationBanner.className = `celebration-banner ${typeClass} show`;
  dom.celebrationText.textContent = text;

  setTimeout(() => {
    dom.celebrationBanner.classList.remove("show");
  }, 2800);
}

function renderVideoStream(videoData) {
  let streamUrl = "";
  if (videoData.cams) {
    const cam1 = videoData.cams["1"] || (Array.isArray(videoData.cams) ? videoData.cams[0] : null);
    if (cam1) {
      streamUrl = cam1.url || cam1.rawUrl || "";
    }
  }

  const ytMatch = streamUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|live\/|shorts\/))([\w-]{11})/i);
  if (ytMatch && ytMatch[1]) {
    const videoId = ytMatch[1];
    dom.stadiumBackdrop.style.display = "none";
    dom.hlsContainer.style.display = "none";
    dom.youtubeContainer.style.display = "block";
    dom.youtubeIframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1&rel=0`;
    return;
  }

  if (streamUrl.includes(".m3u8")) {
    dom.stadiumBackdrop.style.display = "none";
    dom.youtubeContainer.style.display = "none";
    dom.hlsContainer.style.display = "block";
    if (Hls.isSupported()) {
      if (activeHls) activeHls.destroy();
      activeHls = new Hls();
      activeHls.loadSource(streamUrl);
      activeHls.attachMedia(dom.hlsVideo);
      dom.hlsVideo.play().catch(() => {});
    } else if (dom.hlsVideo.canPlayType("application/vnd.apple.mpegurl")) {
      dom.hlsVideo.src = streamUrl;
      dom.hlsVideo.play().catch(() => {});
    }
    return;
  }

  dom.youtubeContainer.style.display = "none";
  dom.hlsContainer.style.display = "none";
  dom.stadiumBackdrop.style.display = "flex";
}

function handleOverlayPacket(packet) {
  if (!packet || packet.type === "HIDE") {
    hideAllOverlays();
    return;
  }

  const type = packet.type;
  const durationMs = Number(packet.duration || 6000);
  const payload = packet.payload || {};

  hideAllOverlays();

  switch (type) {
    case "batter_overview":
    case "tournament_batter_overview":
      renderBatterOverlay(payload);
      break;
    case "out_batter":
      renderOutBatterOverlay(payload);
      break;
    case "target_banner":
      renderTargetOverlay(payload);
      break;
    case "current_bowler":
    case "new_bowler":
    case "tournament_bowler_overview":
      renderBowlerOverlay(payload);
      break;
    case "match_summary":
      renderMatchSummaryOverlay(payload);
      break;
    case "text":
    case "text_ad":
      renderTextBannerOverlay(payload);
      break;
    default:
      break;
  }

  if (overlayDismissTimer) clearTimeout(overlayDismissTimer);
  if (durationMs > 0) {
    overlayDismissTimer = setTimeout(() => {
      hideAllOverlays();
    }, durationMs);
  }
}

function hideAllOverlays() {
  dom.cardMatchSummary.style.display = "none";
  dom.cardBatterOverview.style.display = "none";
  dom.cardOutBatter.style.display = "none";
  dom.cardTargetBanner.style.display = "none";
  dom.cardBowlerOverview.style.display = "none";
  dom.cardTextBanner.style.display = "none";
}

function renderBatterOverlay(p) {
  dom.batterCardName.textContent = p.name || p.id || "Batsman";
  dom.batterCardRuns.textContent = p.runs !== undefined ? p.runs : (p.r || 0);
  dom.batterCardBalls.textContent = p.balls !== undefined ? p.balls : (p.b || 0);
  dom.batterCardFours.textContent = p.fours !== undefined ? p.fours : (p.f || 0);
  dom.batterCardSixes.textContent = p.sixes !== undefined ? p.sixes : (p.s || 0);
  const sr = p.sr || (p.balls > 0 ? ((p.runs * 100) / p.balls).toFixed(1) : "0.0");
  dom.batterCardSR.textContent = sr;
  dom.cardBatterOverview.style.display = "block";
}

function renderOutBatterOverlay(p) {
  dom.outBatterName.textContent = p.name || p.id || "Batsman";
  dom.outBatterDesc.textContent = p.howOut || p.desc || "Wicket";
  dom.outBatterStats.innerHTML = `<strong>${p.runs || 0}</strong> runs off <strong>${p.balls || 0}</strong> balls`;
  dom.cardOutBatter.style.display = "block";
}

function renderTargetOverlay(p) {
  dom.targetCardRuns.textContent = p.target || 100;
  dom.targetCardDetails.textContent = `To Win from ${p.overs || 20} Overs • RRR: ${p.rrr || "-"}`;
  dom.cardTargetBanner.style.display = "block";
}

function renderBowlerOverlay(p) {
  dom.bowlerCardName.textContent = p.name || p.id || "Bowler";
  dom.bowlerCardOvers.textContent = p.overs || p.o || "0.0";
  dom.bowlerCardMaidens.textContent = p.maidens || p.m || 0;
  dom.bowlerCardRuns.textContent = p.runs || p.r || 0;
  dom.bowlerCardWickets.textContent = p.wickets || p.w || 0;
  dom.bowlerCardEcon.textContent = p.econ || "0.00";
  dom.cardBowlerOverview.style.display = "block";
}

function renderMatchSummaryOverlay(p) {
  dom.summaryHeaderTitle.textContent = p.status || "MATCH SUMMARY";
  dom.sumTeamAName.textContent = p.teamA || "Team A";
  dom.sumTeamAScore.innerHTML = `${p.scoreA || "0/0"} <span class="overs-muted">(${p.oversA || "0.0"} Ov)</span>`;
  dom.sumTeamBName.textContent = p.teamB || "Team B";
  dom.sumTeamBScore.innerHTML = `${p.scoreB || "0/0"} <span class="overs-muted">(${p.oversB || "0.0"} Ov)</span>`;
  dom.summaryFooterStatus.textContent = p.result || "Live Match in Progress";
  dom.cardMatchSummary.style.display = "block";
}

function renderTextBannerOverlay(p) {
  dom.textBannerContent.textContent = p.text || "";
  dom.cardTextBanner.style.display = "block";
}

// Fullscreen
dom.btnFullscreen.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    if (dom.stageViewport.requestFullscreen) {
      dom.stageViewport.requestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
});

// Modal Actions
dom.btnChangeCode.addEventListener("click", () => {
  dom.inputMatchCode.value = currentMatchCode || "";
  dom.codeModal.style.display = "flex";
  dom.inputMatchCode.focus();
});

dom.btnModalCancel.addEventListener("click", () => {
  dom.codeModal.style.display = "none";
});

dom.btnModalConnect.addEventListener("click", () => {
  const code = dom.inputMatchCode.value.trim();
  if (code.length > 0) {
    dom.codeModal.style.display = "none";
    connectToMatch(code);
  }
});

dom.inputMatchCode.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    dom.btnModalConnect.click();
  }
});

// Share Stream Link
dom.btnShareMatch.addEventListener("click", () => {
  const url = window.location.href;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      alert("Stream link copied to clipboard!\n\n" + url);
    });
  } else {
    prompt("Copy this live stream link:", url);
  }
});

function updateUrl(code) {
  const newUrl = `${window.location.pathname}?match=${encodeURIComponent(code)}`;
  window.history.replaceState({ match: code }, "", newUrl);
}

// Init
window.addEventListener("DOMContentLoaded", () => {
  const initialCode = getMatchCodeFromUrl();
  if (initialCode) {
    connectToMatch(initialCode);
  } else {
    dom.codeModal.style.display = "flex";
  }
});