const ROWS = 4;
const COLS = 8;

const PIECE_TYPES = [
  { key: "general", name: "General", short: "G", rank: 7, count: 1 },
  { key: "advisor", name: "Advisor", short: "A", rank: 6, count: 2 },
  { key: "elephant", name: "Elephant", short: "E", rank: 5, count: 2 },
  { key: "chariot", name: "Chariot", short: "R", rank: 4, count: 2 },
  { key: "horse", name: "Horse", short: "H", rank: 3, count: 2 },
  { key: "cannon", name: "Cannon", short: "C", rank: 2, count: 2 },
  { key: "soldier", name: "Soldier", short: "S", rank: 1, count: 5 },
];

// Traditional Chinese (Taiwan) labels for pieces
const PIECE_LABELS = {
  red: {
    general: "帥",
    advisor: "仕",
    elephant: "相",
    chariot: "俥",
    horse: "傌",
    cannon: "炮",
    soldier: "兵",
  },
  black: {
    general: "將",
    advisor: "士",
    elephant: "象",
    chariot: "車",
    horse: "馬",
    cannon: "砲",
    soldier: "卒",
  },
};

const COLORS = ["red", "black"];

let board = [];
let activePlayer = 1; // 1 or 2
let playerColors = { 1: null, 2: null }; // assigned on first flip
let selectedCell = null;
let gameOver = false;

let playerNames = { 1: "", 2: "" };
let playerAvatars = { 1: "", 2: "" };
let moveHistory = []; // { player: 1|2, text: string }[]
let timerId = null;
let remainingSeconds = 30;
let isPaused = false;

const RECORD_KEY = "banqi-win-loss-record";
let winRecord = { 1: 0, 2: 0 };
let lossRecord = { 1: 0, 2: 0 };

let gameRules = {
  anqiChain: false,
  carHorseSpecial: false,
};
let gameMode = "twoPlayer"; // "twoPlayer" | "vsAI" | "online"
let aiDifficulty = "easy"; // "easy" | "medium" | "hard" | "nightmare"
let aiTurnTimeoutId = null;
let onlineGameId = null;
let myPlayerNumber = null; // 1 or 2 when online
let firestoreUnsubscribe = null;
let chainCaptureActive = false; // 暗棋連吃時此回合只能移動同一子
let capturedPieces = { red: [], black: [] };
let lastCapturedCount = { red: 0, black: 0 };
let pendingCaptureFly = null; // { startRect: DOMRect, piece } for fly-from-board animation
let profileLocked = { 1: false, 2: false };
let pendingProfileContext = null; // "twoPlayer" | "vsAI" | "onlineHost" | "onlineJoin"
let pendingProfilePayload = null;

// 頁面載入時就初始化 Firebase，確保點「建立遊戲」時連線已就緒
(function initFirebaseEarly() {
  if (typeof window === "undefined" || !window.firebaseConfig || !window.firebase) return;
  try {
    if (!window.firebase.apps || window.firebase.apps.length === 0) {
      window.firebase.initializeApp(window.firebaseConfig);
    }
    if (window.firebase.database) {
      window._rtdb = window.firebase.database();
    }
  } catch (e) {
    if (e.code === "app/duplicate-app" || (e.message && e.message.indexOf("already exists") !== -1)) {
      try {
        if (window.firebase.database) {
          window._rtdb = window.firebase.database();
        }
      } catch (_) {}
    }
  }
})();

function isGameStarted() {
  return !!(playerColors[1] && playerColors[2]);
}

function readRuleOptions() {
  gameRules.anqiChain = !!document.getElementById("ruleAnqiChain")?.checked;
  gameRules.carHorseSpecial = !!document.getElementById("ruleCarHorse")?.checked;
  gameMode = document.getElementById("ruleVsAI")?.checked ? "vsAI" : "twoPlayer";
  aiDifficulty = document.getElementById("ruleAIDifficulty")?.value || "easy";
}

function updateRuleOptionsDisabled() {
  const el = document.getElementById("ruleOptions");
  if (el) el.classList.toggle("disabled", isGameStarted());
}

function loadRecord() {
  try {
    const raw = localStorage.getItem(RECORD_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      winRecord = { 1: data.w1 || 0, 2: data.w2 || 0 };
      lossRecord = { 1: data.l1 || 0, 2: data.l2 || 0 };
    }
  } catch (_) {}
}

function saveRecord() {
  try {
    localStorage.setItem(
      RECORD_KEY,
      JSON.stringify({ w1: winRecord[1], w2: winRecord[2], l1: lossRecord[1], l2: lossRecord[2] })
    );
  } catch (_) {}
}

function recordWin(winnerPlayer) {
  const loser = winnerPlayer === 1 ? 2 : 1;
  winRecord[winnerPlayer] = (winRecord[winnerPlayer] || 0) + 1;
  lossRecord[loser] = (lossRecord[loser] || 0) + 1;
  saveRecord();
  renderRecord();
}

function renderRecord() {
  const el1 = document.getElementById("record1");
  const el2 = document.getElementById("record2");
  if (el1) el1.innerHTML = `勝 <span class="number">${winRecord[1] || 0}</span> 敗 <span class="number">${lossRecord[1] || 0}</span>`;
  if (el2) el2.innerHTML = `勝 <span class="number">${winRecord[2] || 0}</span> 敗 <span class="number">${lossRecord[2] || 0}</span>`;
}

function resetRecord() {
  winRecord = { 1: 0, 2: 0 };
  lossRecord = { 1: 0, 2: 0 };
  saveRecord();
  renderRecord();
}

function createInitialPieces() {
  const pieces = [];

  for (const color of COLORS) {
    for (const type of PIECE_TYPES) {
      for (let i = 0; i < type.count; i++) {
        pieces.push({
          id: `${color}-${type.key}-${i}`,
          color,
          type: type.key,
          name: type.name,
          short: type.short,
          rank: type.rank,
          faceUp: false,
          captured: false,
        });
      }
    }
  }

  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }

  return pieces;
}

function initBoard() {
  const pieces = createInitialPieces();
  board = [];
  capturedPieces = { red: [], black: [] };
  lastCapturedCount = { red: 0, black: 0 };
  pendingCaptureFly = null;

  let index = 0;
  for (let row = 0; row < ROWS; row++) {
    const rowArr = [];
    for (let col = 0; col < COLS; col++) {
      rowArr.push({ piece: pieces[index++] });
    }
    board.push(rowArr);
  }
}

function pieceToSerializable(piece) {
  if (!piece) return null;
  return { t: piece.type, c: piece.color, f: piece.faceUp };
}

function pieceFromSerializable(s) {
  if (!s || !s.t || !s.c) return null;
  const typeInfo = PIECE_TYPES.find((x) => x.key === s.t);
  return {
    type: s.t,
    color: s.c,
    faceUp: !!s.f,
    name: typeInfo?.name ?? s.t,
    short: typeInfo?.short ?? "?",
    rank: typeInfo?.rank ?? 0,
    captured: false,
  };
}

function getSerializedState() {
  const boardSer = board.map((row) =>
    row.map((cell) => ({ p: pieceToSerializable(cell?.piece) }))
  );
  const capturedRed = capturedPieces.red.map(pieceToSerializable).filter(Boolean);
  const capturedBlack = capturedPieces.black.map(pieceToSerializable).filter(Boolean);
  return {
    board: boardSer,
    activePlayer,
    playerColors: { 1: playerColors[1], 2: playerColors[2] },
    playerNames: { 1: playerNames[1] || "", 2: playerNames[2] || "" },
    playerAvatars: { 1: playerAvatars[1] || "", 2: playerAvatars[2] || "" },
    moveHistory: moveHistory.slice(),
    capturedPieces: { red: capturedRed, black: capturedBlack },
    gameOver,
    gameRules: { anqiChain: gameRules.anqiChain, carHorseSpecial: gameRules.carHorseSpecial },
    selectedCell: selectedCell ? { row: selectedCell.row, col: selectedCell.col } : null,
    chainCaptureActive,
  };
}

function setStateFromSerialized(data) {
  if (!data || !data.board) return;
  const typeInfo = (key) => PIECE_TYPES.find((x) => x.key === key);
  board = data.board.map((row) =>
    row.map((cell) => {
      const p = cell?.p;
      return {
        piece: p ? (() => {
          const t = typeInfo(p.t);
          return {
            type: p.t,
            color: p.c,
            faceUp: !!p.f,
            name: t?.name ?? p.t,
            short: t?.short ?? "?",
            rank: t?.rank ?? 0,
            captured: false,
          };
        })() : null,
      };
    })
  );
  activePlayer = data.activePlayer ?? 1;
  playerColors[1] = data.playerColors?.[1] ?? null;
  playerColors[2] = data.playerColors?.[2] ?? null;
  playerNames[1] = data.playerNames?.[1] ?? playerNames[1];
  playerNames[2] = data.playerNames?.[2] ?? playerNames[2];
  playerAvatars[1] = data.playerAvatars?.[1] ?? playerAvatars[1];
  playerAvatars[2] = data.playerAvatars?.[2] ?? playerAvatars[2];
  moveHistory = data.moveHistory ? data.moveHistory.slice() : [];
  capturedPieces.red = (data.capturedPieces?.red || []).map((p) => pieceFromSerializable(p)).filter(Boolean);
  capturedPieces.black = (data.capturedPieces?.black || []).map((p) => pieceFromSerializable(p)).filter(Boolean);
  const incomingGameOver = !!data.gameOver;
  gameOver = gameOver || incomingGameOver;
  if (data.gameRules) {
    gameRules.anqiChain = !!data.gameRules.anqiChain;
    gameRules.carHorseSpecial = !!data.gameRules.carHorseSpecial;
  }
  selectedCell = data.selectedCell ? { row: data.selectedCell.row, col: data.selectedCell.col } : null;
  chainCaptureActive = !!data.chainCaptureActive;
  pendingCaptureFly = null;
  if (gameOver && timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }

  const input1 = document.getElementById("player1Name");
  const input2 = document.getElementById("player2Name");
  if (input1) input1.value = playerNames[1] || "";
  if (input2) input2.value = playerNames[2] || "";

  const avatarSelect1 = document.getElementById("player1Avatar");
  const avatarSelect2 = document.getElementById("player2Avatar");
  if (avatarSelect1) avatarSelect1.value = playerAvatars[1] || "";
  if (avatarSelect2) avatarSelect2.value = playerAvatars[2] || "";

  if (gameMode === "online") {
    if (playerNames[1] && playerAvatars[1]) profileLocked[1] = true;
    if (playerNames[2] && playerAvatars[2]) profileLocked[2] = true;
  }
  applyAllProfileDisplays();
  renderAvatarPreview(1);
  renderAvatarPreview(2);

  renderBoard();
  renderHistory();
  updateStatus();
  updateRuleOptionsDisabled();
}

function getRealtimeDb() {
  if (!window.firebaseConfig || !window.firebase?.database) return null;

  // Ensure databaseURL exists (RTDB requires it). If user didn't set it, try the common default.
  if (!window.firebaseConfig.databaseURL && window.firebaseConfig.projectId) {
    window.firebaseConfig.databaseURL = `https://${window.firebaseConfig.projectId}-default-rtdb.firebaseio.com`;
  }

  if (!window._rtdb) {
    try {
      if (!window.firebase.apps || window.firebase.apps.length === 0) {
        window.firebase.initializeApp(window.firebaseConfig);
      }
      window._rtdb = window.firebase.database();
    } catch (e) {
      if (e.code === "app/duplicate-app" || (e.message && e.message.indexOf("already exists") !== -1)) {
        window._rtdb = window.firebase.database();
      } else {
        console.warn("Firebase init failed", e);
        return null;
      }
    }
  }
  return window._rtdb;
}

function generateGameCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function refreshProfileFromInputs() {
  const input1 = document.getElementById("player1Name");
  const input2 = document.getElementById("player2Name");
  const avatar1 = document.getElementById("player1Avatar");
  const avatar2 = document.getElementById("player2Avatar");

  playerNames[1] = input1 ? String(input1.value || "").trim() : (playerNames[1] || "");
  playerNames[2] = input2 ? String(input2.value || "").trim() : (playerNames[2] || "");
  playerAvatars[1] = avatar1 ? String(avatar1.value || "").trim() : (playerAvatars[1] || "");
  playerAvatars[2] = avatar2 ? String(avatar2.value || "").trim() : (playerAvatars[2] || "");
}

function validateProfilesForMode(mode, role = "auto", showAlert = true) {
  refreshProfileFromInputs();
  let needP1 = true;
  let needP2 = false;
  if (mode === "twoPlayer") {
    needP2 = true;
  } else if (mode === "online") {
    if (role === "host") {
      needP1 = true;
      needP2 = false;
    } else if (role === "joiner") {
      needP1 = false;
      needP2 = true;
    } else {
      needP1 = true;
      needP2 = true;
    }
  }

  if (needP1 && !playerNames[1]) {
    if (showAlert) alert("請先輸入玩家 1 名稱再開始。");
    document.getElementById("player1Name")?.focus();
    return false;
  }
  if (needP1 && !playerAvatars[1]) {
    if (showAlert) alert("請先為玩家 1 選擇角色。");
    document.getElementById("player1Avatar")?.focus();
    return false;
  }
  if (needP2 && !playerNames[2]) {
    if (showAlert) alert("請先輸入玩家 2 名稱再開始。");
    document.getElementById("player2Name")?.focus();
    return false;
  }
  if (needP2 && !playerAvatars[2]) {
    if (showAlert) alert("請先為玩家 2 選擇角色。");
    document.getElementById("player2Avatar")?.focus();
    return false;
  }
  return true;
}

function ensureProfilesReadyForCurrentContext(showAlert = true) {
  let mode = gameMode;
  let role = "auto";
  if (mode === "online") {
    role = myPlayerNumber === 1 ? "host" : myPlayerNumber === 2 ? "joiner" : "auto";
  }
  return validateProfilesForMode(mode, role, showAlert);
}

function resetForNewOnlineRoomAsHost() {
  initBoard();
  activePlayer = 1;
  playerColors = { 1: null, 2: null };
  selectedCell = null;
  gameOver = false;
  chainCaptureActive = false;
  moveHistory = [];
  renderHistory();
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
  remainingSeconds = 30;
  isPaused = false;
  updateTimerDisplay();
}

function createOnlineGame() {
  const db = getRealtimeDb();
  if (!db) {
    alert("請先設定 Firebase Realtime Database：請確認已啟用 Realtime Database，並在 firebase-config.js 設定 databaseURL。");
    return;
  }
  resetForNewOnlineRoomAsHost();
  const code = generateGameCode();
  const player1Id = "p1-" + Math.random().toString(36).slice(2, 12);
  sessionStorage.setItem("banqi-online-id", player1Id);
  myPlayerNumber = 1; // host is always player 1
  onlineGameId = code;
  gameMode = "online";
  refreshProfileFromInputs();
  const state = getSerializedState();
  state.player1Id = player1Id;
  state.player2Id = null;
  state.createdAt = Date.now();
  const ref = db.ref(`banqi_games/${code}`);
  ref.set(state).then(() => {
    console.log("建立遊戲成功，代碼：" + code);
    document.getElementById("onlineCreateArea").style.display = "block";
    document.getElementById("onlineJoinArea").style.display = "none";
    const actions = document.querySelector("#modeModalStepOnline .modal-actions");
    if (actions) actions.style.display = "none";
    document.getElementById("onlineGameCode").textContent = code;
    document.getElementById("modeModalBackOnline").style.display = "none";
    startOnlineListener();
  }).catch((err) => {
    console.error("建立遊戲失敗", err);
    alert("建立遊戲失敗：" + (err.message || err));
  });
}

function joinOnlineGame(code) {
  const db = getRealtimeDb();
  if (!db) {
    alert("請先設定 Firebase Realtime Database。");
    return;
  }
  const trimmed = String(code).trim().toUpperCase();
  if (trimmed.length !== 6) {
    document.getElementById("onlineJoinError").textContent = "請輸入 6 位代碼";
    document.getElementById("onlineJoinError").style.display = "block";
    return;
  }
  const ref = db.ref(`banqi_games/${trimmed}`);
  ref.once("value").then((snap) => {
    const data = snap.val();
    if (!data) {
      document.getElementById("onlineJoinError").textContent = "找不到此遊戲";
      document.getElementById("onlineJoinError").style.display = "block";
      return;
    }
    if (data.player2Id) {
      document.getElementById("onlineJoinError").textContent = "此遊戲已滿";
      document.getElementById("onlineJoinError").style.display = "block";
      return;
    }
    const player2Id = "p2-" + Math.random().toString(36).slice(2, 12);
    sessionStorage.setItem("banqi-online-id", player2Id);
    myPlayerNumber = 2;
    onlineGameId = trimmed;
    gameMode = "online";
    // Use transaction to avoid race (only first joiner gets the seat)
    ref.transaction((current) => {
      if (!current) return current;
      if (current.player2Id) return; // abort
      return {
        ...current,
        player2Id,
        playerNames: {
          ...(current.playerNames || {}),
          2: playerNames[2] || "",
        },
        playerAvatars: {
          ...(current.playerAvatars || {}),
          2: playerAvatars[2] || "",
        },
      };
    }, (err, committed, finalSnap) => {
      if (err) {
        document.getElementById("onlineJoinError").textContent = "加入失敗：" + (err.message || err);
        document.getElementById("onlineJoinError").style.display = "block";
        return;
      }
      if (!committed) {
        document.getElementById("onlineJoinError").textContent = "此遊戲已滿";
        document.getElementById("onlineJoinError").style.display = "block";
        return;
      }
      const finalData = finalSnap.val();
      hideModeModal();
      document.getElementById("onlineJoinError").style.display = "none";
      setStateFromSerialized(finalData);
      startOnlineListener();
    }, false);
  }).catch((err) => {
    document.getElementById("onlineJoinError").textContent = "無法連線：" + (err.message || err);
    document.getElementById("onlineJoinError").style.display = "block";
  });
}

function startOnlineListener() {
  const db = getRealtimeDb();
  if (!db || !onlineGameId) return;
  if (firestoreUnsubscribe) firestoreUnsubscribe();
  const ref = db.ref(`banqi_games/${onlineGameId}`);
  const onValue = (snap) => {
    const data = snap.val();
    if (!data) return;
    if (myPlayerNumber === 1 && !data.player2Id) return;
    setStateFromSerialized(data);
    if (myPlayerNumber === 1 && data.player2Id) hideModeModal();
  };
  ref.on("value", onValue, (err) => console.warn("RTDB listener error", err));
  firestoreUnsubscribe = () => ref.off("value", onValue);
}

function syncOnlineState() {
  if (gameMode !== "online" || !onlineGameId) return;
  const db = getRealtimeDb();
  if (!db) return;
  refreshProfileFromInputs();
  const state = getSerializedState();
  db.ref(`banqi_games/${onlineGameId}`).update(state).catch((err) => console.warn("Sync failed", err));
}

function leaveOnlineGame() {
  if (firestoreUnsubscribe) {
    firestoreUnsubscribe();
    firestoreUnsubscribe = null;
  }
  onlineGameId = null;
  myPlayerNumber = null;
  if (gameMode === "online") gameMode = "twoPlayer";
}

function getCurrentPlayerColor() {
  return playerColors[activePlayer];
}

function getOpponentPlayerColor() {
  return playerColors[activePlayer === 1 ? 2 : 1];
}

function getPieceLabel(piece) {
  const mapping = PIECE_LABELS[piece.color];
  if (mapping && mapping[piece.type]) {
    return mapping[piece.type];
  }
  return piece.short;
}

function getBoardPieceRect(row, col) {
  const boardEl = document.getElementById("board");
  if (!boardEl) return null;
  const cellIndex = row * COLS + col;
  const cellEl = boardEl.children[cellIndex];
  if (!cellEl) return null;
  const pieceEl = cellEl.querySelector(".piece");
  return (pieceEl || cellEl).getBoundingClientRect();
}

// Character avatars: put your images in the "images" folder (see images/README.txt).
// Fallback URLs are used if a local image is missing.
const CHARACTER_IMAGE_BASE = "images";
const CHARACTER_FALLBACK_URL = "https://api.dicebear.com/7.x/personas/svg?seed=";

const CHARACTERS = {
  liubei:       { name: "劉備",   cssClass: "avatar-liubei",   id: "liubei" },
  guanyu:       { name: "關羽",   cssClass: "avatar-guanyu",   id: "guanyu" },
  zhangfei:     { name: "張飛",   cssClass: "avatar-zhangfei", id: "zhangfei" },
  caocao:       { name: "曹操",   cssClass: "avatar-caocao",   id: "caocao" },
  sunquan:      { name: "孫權",   cssClass: "avatar-sunquan",  id: "sunquan" },
  huangyueying: { name: "黃月英", cssClass: "avatar-huangyueying", id: "huangyueying" },
  xiaoqiao:     { name: "小喬",   cssClass: "avatar-xiaoqiao", id: "xiaoqiao" },
  daqiao:       { name: "大喬",   cssClass: "avatar-daqiao",   id: "daqiao" },
  kimmy:        { name: "奇米",   cssClass: "avatar-kimmy",    id: "kimmy" },
};

function getCharacterImageUrl(id) {
  return `${CHARACTER_IMAGE_BASE}/${id}.png`;
}

function getPlayerName(playerNumber) {
  const raw = playerNames[playerNumber] ?? "";
  const trimmed = String(raw).trim();
  return trimmed || `玩家 ${playerNumber}`;
}

const AI_NAMES = [
  "竹北劉德華", "新竹金城武", "中壢梁朝偉", "板橋郭富城", "三重黎明",
  "淡水周潤發", "永和周星馳", "土城古天樂", "中和張學友", "蘆洲劉青雲",
  "新莊吳彥祖", "三重彭于晏", "板橋陳冠希", "中和余文樂",
];

function assignRandomAINameAndAvatar() {
  const name = AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)];
  const ids = Object.keys(CHARACTERS);
  const avatarId = ids[Math.floor(Math.random() * ids.length)];
  playerNames[2] = name;
  playerAvatars[2] = avatarId;
  const input2 = document.getElementById("player2Name");
  const select2 = document.getElementById("player2Avatar");
  if (input2) input2.value = name;
  if (select2) select2.value = avatarId;
  renderAvatarPreview(2);
}

function getAvatarName(avatarId) {
  if (!avatarId) return "";
  return CHARACTERS[avatarId]?.name || "";
}

function applyProfileDisplayForPlayer(playerNumber) {
  const fieldEl = document.getElementById(playerNumber === 1 ? "player1Field" : "player2Field");
  const avatarCtrlEl = document.getElementById(playerNumber === 1 ? "player1AvatarControl" : "player2AvatarControl");
  const identityEl = document.getElementById(playerNumber === 1 ? "player1Identity" : "player2Identity");
  if (!fieldEl || !avatarCtrlEl || !identityEl) return;

  if (profileLocked[playerNumber]) {
    fieldEl.style.display = "none";
    avatarCtrlEl.style.display = "none";
    const name = playerNames[playerNumber] || `玩家 ${playerNumber}`;
    identityEl.textContent = name;
    identityEl.style.display = "";
  } else {
    fieldEl.style.display = "";
    avatarCtrlEl.style.display = "";
    identityEl.style.display = "none";
    identityEl.textContent = "";
  }
}

function applyAllProfileDisplays() {
  applyProfileDisplayForPlayer(1);
  applyProfileDisplayForPlayer(2);
}

function setModeWithRecordReset(nextMode) {
  if (gameMode !== nextMode) {
    resetRecord();
  }
  gameMode = nextMode;
}

function resetOnlineModalUI() {
  document.getElementById("onlineCreateArea").style.display = "none";
  document.getElementById("onlineJoinArea").style.display = "none";
  const actions = document.querySelector("#modeModalStepOnline .modal-actions");
  if (actions) actions.style.display = "";
  document.getElementById("modeModalBackOnline").style.display = "";
  const joinErr = document.getElementById("onlineJoinError");
  if (joinErr) joinErr.style.display = "none";
}

function showProfileStep(context, payload = null) {
  pendingProfileContext = context;
  pendingProfilePayload = payload;

  document.getElementById("modeModalStep1").style.display = "none";
  document.getElementById("modeModalStep2").style.display = "none";
  document.getElementById("modeModalStepOnline").style.display = "none";
  document.getElementById("modeModalStepProfile").style.display = "";

  const p1Group = document.getElementById("profilePlayer1Group");
  const p2Group = document.getElementById("profilePlayer2Group");
  if (p1Group) p1Group.style.display = "";
  if (p2Group) p2Group.style.display = "";
  if (context === "vsAI" || context === "onlineHost") {
    if (p2Group) p2Group.style.display = "none";
  } else if (context === "onlineJoin") {
    if (p1Group) p1Group.style.display = "none";
  }

  const errEl = document.getElementById("modeProfileError");
  if (errEl) errEl.style.display = "none";

  const p1Name = document.getElementById("profilePlayer1Name");
  const p2Name = document.getElementById("profilePlayer2Name");
  const p1Avatar = document.getElementById("profilePlayer1Avatar");
  const p2Avatar = document.getElementById("profilePlayer2Avatar");
  if (p1Name) p1Name.value = playerNames[1] || "";
  if (p2Name) p2Name.value = playerNames[2] || "";
  if (p1Avatar) p1Avatar.value = playerAvatars[1] || "";
  if (p2Avatar) p2Avatar.value = playerAvatars[2] || "";
}

function applyProfileToBoards() {
  const p1Name = document.getElementById("profilePlayer1Name");
  const p2Name = document.getElementById("profilePlayer2Name");
  const p1Avatar = document.getElementById("profilePlayer1Avatar");
  const p2Avatar = document.getElementById("profilePlayer2Avatar");

  if (pendingProfileContext !== "onlineJoin") {
    playerNames[1] = p1Name ? String(p1Name.value || "").trim() : playerNames[1];
    playerAvatars[1] = p1Avatar ? String(p1Avatar.value || "").trim() : playerAvatars[1];
  }
  if (pendingProfileContext !== "onlineHost" && pendingProfileContext !== "vsAI") {
    playerNames[2] = p2Name ? String(p2Name.value || "").trim() : playerNames[2];
    playerAvatars[2] = p2Avatar ? String(p2Avatar.value || "").trim() : playerAvatars[2];
  }

  const input1 = document.getElementById("player1Name");
  const input2 = document.getElementById("player2Name");
  const avatar1 = document.getElementById("player1Avatar");
  const avatar2 = document.getElementById("player2Avatar");
  if (input1) input1.value = playerNames[1] || "";
  if (input2) input2.value = playerNames[2] || "";
  if (avatar1) avatar1.value = playerAvatars[1] || "";
  if (avatar2) avatar2.value = playerAvatars[2] || "";
  renderAvatarPreview(1);
  renderAvatarPreview(2);
}

function validateProfileModal() {
  const errEl = document.getElementById("modeProfileError");
  let msg = "";
  const p1Name = String(document.getElementById("profilePlayer1Name")?.value || "").trim();
  const p2Name = String(document.getElementById("profilePlayer2Name")?.value || "").trim();
  const p1Avatar = String(document.getElementById("profilePlayer1Avatar")?.value || "").trim();
  const p2Avatar = String(document.getElementById("profilePlayer2Avatar")?.value || "").trim();

  if (pendingProfileContext === "twoPlayer") {
    if (!p1Name || !p2Name) msg = "請填寫兩位玩家名稱。";
    else if (!p1Avatar || !p2Avatar) msg = "請為兩位玩家選擇角色。";
  } else if (pendingProfileContext === "vsAI" || pendingProfileContext === "onlineHost") {
    if (!p1Name) msg = "請填寫玩家 1 名稱。";
    else if (!p1Avatar) msg = "請為玩家 1 選擇角色。";
  } else if (pendingProfileContext === "onlineJoin") {
    if (!p2Name) msg = "請填寫玩家 2 名稱。";
    else if (!p2Avatar) msg = "請為玩家 2 選擇角色。";
  }

  if (errEl) {
    if (msg) {
      errEl.textContent = msg;
      errEl.style.display = "block";
    } else {
      errEl.style.display = "none";
    }
  }
  return !msg;
}

function showModeModal() {
  const el = document.getElementById("modeModal");
  const step1 = document.getElementById("modeModalStep1");
  const step2 = document.getElementById("modeModalStep2");
  const stepOnline = document.getElementById("modeModalStepOnline");
  const stepProfile = document.getElementById("modeModalStepProfile");
  if (step1) step1.style.display = "";
  if (step2) step2.style.display = "none";
  if (stepOnline) stepOnline.style.display = "none";
  if (stepProfile) stepProfile.style.display = "none";
  profileLocked = { 1: false, 2: false };
  applyAllProfileDisplays();
  if (el) el.classList.add("modal-open");
}

function hideModeModal() {
  const el = document.getElementById("modeModal");
  if (el) el.classList.remove("modal-open");
}

function showGameOverModal(winnerPlayer) {
  const name = getPlayerName(winnerPlayer);
  const msgEl = document.getElementById("gameOverMessage");
  const modal = document.getElementById("gameOverModal");
  if (msgEl) msgEl.textContent = `恭喜 ${name} 贏得比賽`;
  if (modal) modal.classList.add("modal-open");
}

function hideGameOverModal() {
  const modal = document.getElementById("gameOverModal");
  if (modal) modal.classList.remove("modal-open");
}

function renderAvatarPreview(playerNumber) {
  const selectId = playerNumber === 1 ? "player1Avatar" : "player2Avatar";
  const previewId = playerNumber === 1 ? "player1AvatarPreview" : "player2AvatarPreview";
  const select = document.getElementById(selectId);
  const preview = document.getElementById(previewId);
  if (!select || !preview) return;

  preview.innerHTML = "";
  const value = (select.value || "").trim();
  if (!value || !CHARACTERS[value]) {
    return;
  }
  const char = CHARACTERS[value];
  const img = document.createElement("img");
  img.className = "avatar-image";
  img.alt = char.name;
  img.src = getCharacterImageUrl(char.id);
  img.onerror = function () {
    if (this.src.endsWith(".png")) {
      this.src = `${CHARACTER_IMAGE_BASE}/${char.id}.jpg`;
    } else {
      this.onerror = null;
      this.src = CHARACTER_FALLBACK_URL + char.id;
    }
  };
  preview.appendChild(img);
  const badge = document.createElement("div");
  badge.className = `avatar-badge ${char.cssClass}`;
  badge.textContent = char.name;
  preview.appendChild(badge);
}

function formatPosition(pos) {
  return `(${pos.row + 1}, ${pos.col + 1})`;
}

function addHistoryEntry(player, text) {
  moveHistory.push({ player, text });
  renderHistory();
}

function renderHistory() {
  const history1El = document.getElementById("history1");
  const history2El = document.getElementById("history2");
  if (!history1El || !history2El) return;

  const entries1 = moveHistory.filter((e) => e.player === 1).map((e) => e.text);
  const entries2 = moveHistory.filter((e) => e.player === 2).map((e) => e.text);

  function fillList(container, entries) {
    container.innerHTML = "";
    if (entries.length === 0) {
      container.textContent = "尚未有移動紀錄。";
      return;
    }
    const list = document.createElement("ol");
    list.className = "history-list";
    entries.forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      list.appendChild(li);
    });
    container.appendChild(list);
  }

  fillList(history1El, entries1);
  fillList(history2El, entries2);
}

function updateTimerDisplay() {
  const timerEl = document.getElementById("timer");
  if (!timerEl) return;

  const seconds = Math.max(0, remainingSeconds);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(1, "0");
  const ss = String(s).padStart(2, "0");

  const lowClass = remainingSeconds > 0 && remainingSeconds < 10 ? " timer-low" : "";
  timerEl.innerHTML = `<span class="timer-label">剩餘時間：</span><span class="number timer-number${lowClass}">${mm}:${ss}</span>`;
}

function handleTimeout() {
  if (gameOver) return;

  const loserPlayer = activePlayer;
  const winnerPlayer = activePlayer === 1 ? 2 : 1;
  recordWin(winnerPlayer);
  const statusEl = document.getElementById("status");
  const loserName = getPlayerName(loserPlayer);
  const winnerName = getPlayerName(winnerPlayer);

  if (statusEl) {
    statusEl.innerHTML = `<span class="status-win">${winnerName} 獲勝！</span> ${loserName} 超時未移動。`;
  }

  gameOver = true;
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
  showGameOverModal(winnerPlayer);
  if (gameMode === "online") syncOnlineState();
}

function startTimer(reset = true) {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }

  isPaused = false;

  if (reset) {
    remainingSeconds = 30;
  }
  updateTimerDisplay();

  timerId = setInterval(() => {
    if (gameOver) {
      clearInterval(timerId);
      timerId = null;
      return;
    }

    if (isPaused) {
      return;
    }

    remainingSeconds -= 1;
    if (remainingSeconds <= 0) {
      clearInterval(timerId);
      timerId = null;
      remainingSeconds = 0;
      updateTimerDisplay();
      handleTimeout();
    } else {
      updateTimerDisplay();
    }
  }, 1000);
}

function isInsideBoard(row, col) {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS;
}

function handleCellClick(row, col) {
  if (gameOver || isPaused) return;
  if (!ensureProfilesReadyForCurrentContext(false)) {
    showTemporaryStatus("請先完成玩家名稱與角色設定。", "status-warning");
    return;
  }
  if (gameMode === "vsAI" && activePlayer === 2) return;
  if (gameMode === "online" && activePlayer !== myPlayerNumber) return;

  if (selectedCell) {
    if (selectedCell.row === row && selectedCell.col === col) {
      selectedCell = null;
      renderBoard();
      if (gameMode === "online") syncOnlineState();
      return;
    }
    attemptMove(selectedCell, { row, col });
    renderBoard();
    if (gameMode === "online") syncOnlineState();
    return;
  }

  const cell = board[row][col];
  if (!cell || !cell.piece) return;

  const piece = cell.piece;

  if (!piece.faceUp) {
    flipPiece(row, col);
    endTurn();
    return;
  }

  if (!playerColors[1] || !playerColors[2]) return;

  const pieceColor = piece.color;
  const currentColor = getCurrentPlayerColor();

  if (pieceColor !== currentColor) {
    showTemporaryStatus("你只能移動自己的棋子。", "status-warning");
    return;
  }
  selectedCell = { row, col };
  renderBoard();
}

function flipPiece(row, col) {
  const cell = board[row][col];
  if (!cell || !cell.piece || cell.piece.faceUp) {
    return;
  }

  const piece = cell.piece;
  piece.faceUp = true;

  if (!playerColors[1] && !playerColors[2]) {
    playerColors[activePlayer] = piece.color;
    playerColors[activePlayer === 1 ? 2 : 1] = piece.color === "red" ? "black" : "red";
    updateRuleOptionsDisabled();
  }

   const currentPlayerName = getPlayerName(activePlayer);
   const pos = formatPosition({ row, col });
   const colorLabel = piece.color === "red" ? "紅方" : "黑方";
   const label = getPieceLabel(piece);
   addHistoryEntry(activePlayer, `${currentPlayerName} 在 ${pos} 翻開了 ${colorLabel} ${label}`);

  renderBoard();
  updateStatus();
  if (gameMode === "online") syncOnlineState();
}

function isAdjacent(a, b) {
  const dr = Math.abs(a.row - b.row);
  const dc = Math.abs(a.col - b.col);
  return dr + dc === 1;
}

function isStraightLine(a, b) {
  return a.row === b.row || a.col === b.col;
}

function countPiecesBetween(a, b) {
  if (!isStraightLine(a, b)) return Infinity;

  let count = 0;

  if (a.row === b.row) {
    const row = a.row;
    const start = Math.min(a.col, b.col) + 1;
    const end = Math.max(a.col, b.col);
    for (let c = start; c < end; c++) {
      const cell = board[row][c];
      if (cell && cell.piece) count += 1;
    }
  } else {
    const col = a.col;
    const start = Math.min(a.row, b.row) + 1;
    const end = Math.max(a.row, b.row);
    for (let r = start; r < end; r++) {
      const cell = board[r][col];
      if (cell && cell.piece) count += 1;
    }
  }

  return count;
}

function isClearPath(a, b) {
  return countPiecesBetween(a, b) === 0;
}

function isDiagonalOneStep(a, b) {
  const dr = Math.abs(a.row - b.row);
  const dc = Math.abs(a.col - b.col);
  return dr === 1 && dc === 1;
}

function canCapture(attacker, defender) {
  if (!attacker || !defender) return false;
  if (attacker.color === defender.color) return false;

  if (attacker.type === "general" && defender.type === "soldier") return false;
  if (attacker.type === "cannon") return true;
  if (gameRules.carHorseSpecial && (attacker.type === "chariot" || attacker.type === "horse")) return true;
  if (attacker.type === "soldier" && defender.type === "general") return true;

  return attacker.rank >= defender.rank;
}

function attemptMove(from, to) {
  const fromCell = board[from.row][from.col];
  const toCell = board[to.row][to.col];

  if (!fromCell || !fromCell.piece || !fromCell.piece.faceUp) {
    return;
  }

  const movingPiece = fromCell.piece;
  const isCannon = movingPiece.type === "cannon";

  if (movingPiece.color !== getCurrentPlayerColor()) {
    showTemporaryStatus("你只能移動自己的棋子。", "status-warning");
    return;
  }

  const isChariot = movingPiece.type === "chariot";
  const isHorse = movingPiece.type === "horse";

  if (!toCell || !toCell.piece) {
    if (isCannon) {
      if (!isStraightLine(from, to)) {
        showTemporaryStatus("炮只能沿直線移動。", "status-warning");
        return;
      }
      if (!isClearPath(from, to)) {
        showTemporaryStatus("炮平移時路徑上不能有棋子。", "status-warning");
        return;
      }
    } else if (gameRules.carHorseSpecial && isChariot) {
      if (!isAdjacent(from, to)) {
        showTemporaryStatus("車飛馬斜：車吃棋時可沿直線飛，移動到空位時只能走一格。", "status-warning");
        return;
      }
    } else if (gameRules.carHorseSpecial && isHorse) {
      if (!isAdjacent(from, to)) {
        showTemporaryStatus("車飛馬斜：馬吃棋時可走斜角，移動到空位時只能走一格。", "status-warning");
        return;
      }
    } else if (!isAdjacent(from, to)) {
      showTemporaryStatus("每步只能上下左右移動一格。", "status-warning");
      return;
    }

    const currentPlayerName = getPlayerName(activePlayer);
    const fromPos = formatPosition(from);
    const toPos = formatPosition(to);
    const colorLabel = movingPiece.color === "red" ? "紅方" : "黑方";
    const label = getPieceLabel(movingPiece);
    addHistoryEntry(activePlayer, `${currentPlayerName} 將 ${colorLabel} ${label} 從 ${fromPos} 走到 ${toPos}`);

    board[to.row][to.col] = { piece: movingPiece };
    board[from.row][from.col] = { piece: null };
    selectedCell = null;
    renderBoard();
    endTurn();
    return;
  }

  const targetPiece = toCell.piece;

  if (!targetPiece.faceUp) {
      if (gameRules.anqiChain) {
      const validReach =
        isAdjacent(from, to) ||
        (gameRules.carHorseSpecial && isChariot && isStraightLine(from, to) && isClearPath(from, to)) ||
        (gameRules.carHorseSpecial && isHorse && (isDiagonalOneStep(from, to) || isAdjacent(from, to)));
      if (!validReach) {
        showTemporaryStatus("無法移動到該格（須相鄰或符合車飛馬斜）。", "status-warning");
        return;
      }
      targetPiece.faceUp = true;
      if (targetPiece.color === movingPiece.color) {
        addHistoryEntry(activePlayer, `${getPlayerName(activePlayer)} 翻開己方子於 ${formatPosition(to)}，該子放回原位。`);
        renderBoard();
        updateStatus();
        endTurn();
        return;
      }
      if (!canCapture(movingPiece, targetPiece)) {
        showTemporaryStatus("這步吃棋不符合大小規則。", "status-warning");
        targetPiece.faceUp = false;
        return;
      }
      const currentPlayerName = getPlayerName(activePlayer);
      const fromPos = formatPosition(from);
      const toPos = formatPosition(to);
      const attackerColorLabel = movingPiece.color === "red" ? "紅方" : "黑方";
      const defenderColorLabel = targetPiece.color === "red" ? "紅方" : "黑方";
      const attackerLabel = getPieceLabel(movingPiece);
      const defenderLabel = getPieceLabel(targetPiece);
      addHistoryEntry(
        activePlayer,
        `${currentPlayerName} 用 ${attackerColorLabel} ${attackerLabel} 從 ${fromPos} 吃掉（翻開）${defenderColorLabel} ${defenderLabel} 於 ${toPos}`
      );
      const startRect = getBoardPieceRect(to.row, to.col);
      if (startRect) pendingCaptureFly = { startRect: { left: startRect.left, top: startRect.top, width: startRect.width, height: startRect.height }, piece: targetPiece };
      targetPiece.captured = true;
      capturedPieces[targetPiece.color].push(targetPiece);
      board[to.row][to.col] = { piece: movingPiece };
      board[from.row][from.col] = { piece: null };
      selectedCell = null;
      renderBoard();
      checkGameOver();
      const canChain = gameRules.anqiChain && canPieceCaptureAgain(to.row, to.col);
      if (!gameOver && canChain) {
        if (gameRules.anqiChain) chainCaptureActive = true;
        selectedCell = { row: to.row, col: to.col };
        renderBoard();
        updateStatus();
        if (gameMode === "online") syncOnlineState();
      } else if (!gameOver) {
        endTurn();
      }
      return;
    }
    showTemporaryStatus("不能走到蓋著的棋子上，請先翻開它。", "status-warning");
    return;
  }

  if (targetPiece.color === movingPiece.color) {
    if (gameRules.anqiChain && chainCaptureActive) {
      showTemporaryStatus("暗棋連吃時，此回合只能繼續移動同一棋。", "status-warning");
      return;
    }
    selectedCell = { row: to.row, col: to.col };
    renderBoard();
    if (gameMode === "online") syncOnlineState();
    return;
  }

  if (isCannon) {
    if (!isStraightLine(from, to)) {
      showTemporaryStatus("炮吃棋必須沿直線跳過一枚棋子。", "status-warning");
      return;
    }
    const between = countPiecesBetween(from, to);
    if (between !== 1) {
      showTemporaryStatus("炮吃棋時，炮與目標之間必須剛好隔一枚棋子。", "status-warning");
      return;
    }
  } else if (gameRules.carHorseSpecial && isChariot) {
    if (!isStraightLine(from, to) || countPiecesBetween(from, to) !== 0) {
      showTemporaryStatus("車飛馬斜吃棋：車沿直線，中間不能有棋。", "status-warning");
      return;
    }
  } else if (gameRules.carHorseSpecial && isHorse) {
    if (!isDiagonalOneStep(from, to)) {
      showTemporaryStatus("車飛馬斜：馬只能以斜角一格吃棋。", "status-warning");
      return;
    }
  } else if (!isAdjacent(from, to)) {
    showTemporaryStatus("吃棋須相鄰（或開啟車飛馬斜）。", "status-warning");
    return;
  }

  if (!canCapture(movingPiece, targetPiece)) {
    showTemporaryStatus("這步吃棋不符合大小規則。", "status-warning");
    return;
  }

  const currentPlayerName = getPlayerName(activePlayer);
  const fromPos = formatPosition(from);
  const toPos = formatPosition(to);
  const attackerColorLabel = movingPiece.color === "red" ? "紅方" : "黑方";
  const defenderColorLabel = targetPiece.color === "red" ? "紅方" : "黑方";
  const attackerLabel = getPieceLabel(movingPiece);
  const defenderLabel = getPieceLabel(targetPiece);
  addHistoryEntry(
    activePlayer,
    `${currentPlayerName} 用 ${attackerColorLabel} ${attackerLabel} 從 ${fromPos} 吃掉 ${defenderColorLabel} ${defenderLabel} 於 ${toPos}`
  );

  const startRect = getBoardPieceRect(to.row, to.col);
  if (startRect) pendingCaptureFly = { startRect: { left: startRect.left, top: startRect.top, width: startRect.width, height: startRect.height }, piece: targetPiece };
  targetPiece.captured = true;
  capturedPieces[targetPiece.color].push(targetPiece);
  board[to.row][to.col] = { piece: movingPiece };
  board[from.row][from.col] = { piece: null };

  selectedCell = null;
  renderBoard();
  checkGameOver();
  if (!gameOver) {
    const canChain = gameRules.anqiChain && canPieceCaptureAgain(to.row, to.col);
    if (canChain) {
      if (gameRules.anqiChain) chainCaptureActive = true;
      selectedCell = { row: to.row, col: to.col };
      renderBoard();
      updateStatus();
      if (gameMode === "online") syncOnlineState();
    } else {
      endTurn();
    }
  }
}

function getLegalMoves() {
  const moves = [];
  const currentColor = getCurrentPlayerColor();
  if (!currentColor && !playerColors[1] && !playerColors[2]) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board[r]?.[c];
        if (cell?.piece && !cell.piece.faceUp) moves.push({ type: "flip", row: r, col: c });
      }
    }
    return moves;
  }
  if (!currentColor) return moves;

  if (chainCaptureActive && selectedCell) {
    const from = selectedCell;
    const piece = board[from.row][from.col]?.piece;
    if (!piece?.faceUp || piece.color !== currentColor) return moves;
    const tos = getDestinationsFrom(from.row, from.col);
    tos.forEach((to) => moves.push({ type: "move", from: { row: from.row, col: from.col }, to: { row: to.row, col: to.col } }));
    return moves;
  }

  let anyFaceDown = false;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = board[r]?.[c];
      if (cell?.piece && !cell.piece.faceUp) {
        anyFaceDown = true;
        if (!selectedCell) moves.push({ type: "flip", row: r, col: c });
      }
    }
  }
  const fromCells = selectedCell ? [selectedCell] : [];
  if (!selectedCell) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board[r]?.[c];
        if (cell?.piece?.faceUp && cell.piece.color === currentColor) fromCells.push({ row: r, col: c });
      }
    }
  }
  fromCells.forEach((from) => {
    const tos = getDestinationsFrom(from.row, from.col);
    tos.forEach((to) => moves.push({ type: "move", from: { row: from.row, col: from.col }, to: { row: to.row, col: to.col } }));
  });
  return moves;
}

function getDestinationsFrom(fromR, fromC) {
  const list = [];
  const from = { row: fromR, col: fromC };
  const cell = board[fromR][fromC];
  const piece = cell?.piece;
  if (!piece?.faceUp) return list;
  const currentColor = piece.color;
  const isCannon = piece.type === "cannon";
  const isChariot = piece.type === "chariot";
  const isHorse = piece.type === "horse";
  const neighbors = [
    { row: fromR - 1, col: fromC },
    { row: fromR + 1, col: fromC },
    { row: fromR, col: fromC - 1 },
    { row: fromR, col: fromC + 1 },
  ];
  for (const to of neighbors) {
    if (!isInsideBoard(to.row, to.col)) continue;
    const toCell = board[to.row][to.col];
    if (!toCell || !toCell.piece) {
      if (isCannon) continue;
      list.push(to);
      continue;
    }
    const target = toCell.piece;
    if (!target.faceUp) {
      if (gameRules.anqiChain) list.push(to);
      continue;
    }
    if (target.color === currentColor) continue;
    if (canCapture(piece, target)) list.push(to);
  }
  if (isCannon) {
    for (let r = 0; r < ROWS; r++) {
      const to = { row: r, col: fromC };
      if (r !== fromR && isStraightLine(from, to) && isClearPath(from, to) && !board[r][fromC]?.piece) list.push(to);
      if (r !== fromR && isStraightLine(from, to) && countPiecesBetween(from, to) === 1) {
        const t = board[r][fromC]?.piece;
        if (t && t.faceUp && t.color !== currentColor && canCapture(piece, t)) list.push(to);
      }
    }
    for (let c = 0; c < COLS; c++) {
      const to = { row: fromR, col: c };
      if (c !== fromC && isStraightLine(from, to) && isClearPath(from, to) && !board[fromR][c]?.piece) list.push(to);
      if (c !== fromC && isStraightLine(from, to) && countPiecesBetween(from, to) === 1) {
        const t = board[fromR][c]?.piece;
        if (t && t.faceUp && t.color !== currentColor && canCapture(piece, t)) list.push(to);
      }
    }
  }
  if (gameRules.carHorseSpecial && isChariot) {
    for (let r = 0; r < ROWS; r++) {
      const to = { row: r, col: fromC };
      if (r !== fromR && isClearPath(from, to)) {
        const t = board[r][fromC]?.piece;
        if (!t) list.push(to);
        else if (t.faceUp && t.color !== currentColor && canCapture(piece, t)) list.push(to);
      }
    }
    for (let c = 0; c < COLS; c++) {
      const to = { row: fromR, col: c };
      if (c !== fromC && isClearPath(from, to)) {
        const t = board[fromR][c]?.piece;
        if (!t) list.push(to);
        else if (t.faceUp && t.color !== currentColor && canCapture(piece, t)) list.push(to);
      }
    }
  }
  if (gameRules.carHorseSpecial && isHorse) {
    const diag = [
      { row: fromR - 1, col: fromC - 1 },
      { row: fromR - 1, col: fromC + 1 },
      { row: fromR + 1, col: fromC - 1 },
      { row: fromR + 1, col: fromC + 1 },
    ];
    diag.forEach((to) => {
      if (!isInsideBoard(to.row, to.col)) return;
      const t = board[to.row][to.col]?.piece;
      if (!t) return;
      if (t.faceUp && t.color !== currentColor && canCapture(piece, t)) list.push(to);
    });
  }
  return list;
}

const PIECE_VALUE = { general: 100, advisor: 60, elephant: 50, chariot: 40, horse: 35, cannon: 25, soldier: 15 };

function isSquareAttackedByOpponent(row, col, ourPiece) {
  const opponentColor = getOpponentPlayerColor();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = board[r]?.[c];
      if (!cell?.piece?.faceUp || cell.piece.color !== opponentColor) continue;
      const dests = getDestinationsFrom(r, c);
      if (dests.some((d) => d.row === row && d.col === col)) return true;
    }
  }
  return false;
}

function scoreMoveForAI(move) {
  if (move.type === "flip") {
    const ourColor = getCurrentPlayerColor();
    let ourFaceUp = 0;
    let theirFaceUp = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = board[r]?.[c]?.piece;
        if (!p?.faceUp) continue;
        if (p.color === ourColor) ourFaceUp++;
        else theirFaceUp++;
      }
    }
    return ourFaceUp <= theirFaceUp ? 2 : 0;
  }
  const fromCell = board[move.from.row][move.from.col];
  const movingPiece = fromCell?.piece;
  const toCell = board[move.to.row][move.to.col];
  const targetPiece = toCell?.piece;
  let score = 1;
  if (targetPiece) {
    const val = PIECE_VALUE[targetPiece.type] ?? 10;
    score = 15 + val;
    if (targetPiece.type === "general") score = 120;
  }
  const savedFrom = board[move.from.row][move.from.col];
  const savedTo = board[move.to.row][move.to.col];
  try {
    board[move.from.row][move.from.col] = { piece: null };
    board[move.to.row][move.to.col] = { piece: movingPiece };
    if (movingPiece && isSquareAttackedByOpponent(move.to.row, move.to.col, movingPiece)) {
      const myVal = PIECE_VALUE[movingPiece.type] ?? 10;
      score -= myVal * 2;
    }
  } finally {
    board[move.from.row][move.from.col] = savedFrom;
    board[move.to.row][move.to.col] = savedTo;
  }
  return score;
}

function pickAIMove(moves) {
  if (!moves.length) return null;
  if (aiDifficulty === "easy") {
    return moves[Math.floor(Math.random() * moves.length)];
  }
  const scored = moves.map((m) => ({ move: m, score: scoreMoveForAI(m) }));
  scored.sort((a, b) => b.score - a.score);
  const bestScore = scored[0].score;
  const top = scored.filter((s) => s.score === bestScore);
  const topN = scored.filter((s) => s.score >= bestScore - 5);
  if (aiDifficulty === "medium") {
    const pool = topN.length <= 3 ? topN : topN.slice(0, Math.max(2, Math.ceil(topN.length / 2)));
    return pool[Math.floor(Math.random() * pool.length)].move;
  }
  if (aiDifficulty === "hard") {
    const pool = topN.length <= 2 ? topN : topN.slice(0, 3);
    return pool[Math.floor(Math.random() * pool.length)].move;
  }
  return top[0].move;
}

function runAITurn() {
  aiTurnTimeoutId = null;
  if (gameOver || activePlayer !== 2 || gameMode !== "vsAI") return;
  const moves = getLegalMoves();
  const move = pickAIMove(moves);
  if (!move) return;
  if (move.type === "flip") {
    flipPiece(move.row, move.col);
    endTurn();
    return;
  }
  attemptMove(move.from, move.to);
  renderBoard();
  updateStatus();
  checkGameOver();
  if (!gameOver && activePlayer === 2 && selectedCell) {
    const delay = 350 + Math.random() * (aiDifficulty === "nightmare" ? 150 : 200);
    aiTurnTimeoutId = setTimeout(runAITurn, Math.round(delay));
  }
}

function canPieceCaptureAgain(r, c) {
  const cell = board[r]?.[c];
  if (!cell?.piece?.faceUp || cell.piece.color !== getCurrentPlayerColor()) return false;
  const piece = cell.piece;
  const isChariot = piece.type === "chariot";
  const isHorse = piece.type === "horse";
  const opponentColor = getOpponentPlayerColor();
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (row === r && col === c) continue;
      const targetCell = board[row][col];
      if (!targetCell?.piece) continue;
      const target = targetCell.piece;
      if (target.color !== opponentColor) continue;
      if (!target.faceUp && !gameRules.anqiChain) continue;
      if (piece.type === "cannon") {
        if (isStraightLine({ row: r, col: c }, { row, col }) && countPiecesBetween({ row: r, col: c }, { row, col }) === 1 && canCapture(piece, target))
          return true;
      } else if (gameRules.carHorseSpecial && isChariot) {
        if (isStraightLine({ row: r, col: c }, { row, col }) && countPiecesBetween({ row: r, col: c }, { row, col }) === 0 && canCapture(piece, target))
          return true;
      } else if (gameRules.carHorseSpecial && isHorse) {
        if (isDiagonalOneStep({ row: r, col: c }, { row, col }) && canCapture(piece, target)) return true;
      } else if (isAdjacent({ row: r, col: c }, { row, col }) && canCapture(piece, target)) {
        return true;
      }
    }
  }
  return false;
}

function endTurn() {
  activePlayer = activePlayer === 1 ? 2 : 1;
  selectedCell = null;
  chainCaptureActive = false;
  renderBoard();
  updateStatus();
  startTimer();
  if (gameMode === "online") syncOnlineState();
  if (gameMode === "vsAI" && activePlayer === 2 && !gameOver) {
    if (aiTurnTimeoutId) clearTimeout(aiTurnTimeoutId);
    const delay = aiDifficulty === "easy" ? 400 : aiDifficulty === "medium" ? 500 + Math.random() * 400 : aiDifficulty === "hard" ? 600 + Math.random() * 500 : 700 + Math.random() * 400;
    aiTurnTimeoutId = setTimeout(runAITurn, Math.round(delay));
  }
}

function checkGameOver() {
  const currentColor = getCurrentPlayerColor();
  const opponentColor = getOpponentPlayerColor();
  if (!currentColor || !opponentColor) return;

  let opponentHasPieces = false;
  let anyFaceDown = false;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = board[r][c];
      if (!cell || !cell.piece) continue;
      if (cell.piece.color === opponentColor) opponentHasPieces = true;
      if (!cell.piece.faceUp) anyFaceDown = true;
    }
  }

  let currentHasMoves = anyFaceDown;

  for (let r = 0; r < ROWS && !currentHasMoves; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = board[r][c];
      if (!cell?.piece?.faceUp || cell.piece.color !== currentColor) continue;

      const piece = cell.piece;
      const check = (nRow, nCol) => {
        if (!isInsideBoard(nRow, nCol)) return false;
        const targetCell = board[nRow][nCol];
        if (!targetCell || !targetCell.piece) return true;
        const targetPiece = targetCell.piece;
        if (!targetPiece.faceUp) return true;
        return targetPiece.color !== currentColor && canCapture(piece, targetPiece);
      };
      const from = { row: r, col: c };
      const neighbors = [
        { row: r - 1, col: c },
        { row: r + 1, col: c },
        { row: r, col: c - 1 },
        { row: r, col: c + 1 },
      ];
      for (const n of neighbors) {
        if (check(n.row, n.col)) {
          currentHasMoves = true;
          break;
        }
      }
      if (currentHasMoves) break;
      if (gameRules.carHorseSpecial && piece.type === "chariot") {
        const chariotCheck = (nRow, nCol) => {
          if (!isInsideBoard(nRow, nCol)) return false;
          const targetCell = board[nRow][nCol];
          if (!targetCell?.piece) return false;
          const targetPiece = targetCell.piece;
          if (!targetPiece.faceUp) return true;
          return targetPiece.color === opponentColor && canCapture(piece, targetPiece);
        };
        for (let rr = 0; rr < ROWS; rr++) {
          if (rr !== r && isClearPath(from, { row: rr, col: c }) && chariotCheck(rr, c)) {
            currentHasMoves = true;
            break;
          }
        }
        if (!currentHasMoves) {
          for (let cc = 0; cc < COLS; cc++) {
            if (cc !== c && isClearPath(from, { row: r, col: cc }) && chariotCheck(r, cc)) {
              currentHasMoves = true;
              break;
            }
          }
        }
      }
      if (currentHasMoves) break;
      if (gameRules.carHorseSpecial && piece.type === "horse") {
        const horseDiagCheck = (nRow, nCol) => {
          if (!isInsideBoard(nRow, nCol)) return false;
          const targetCell = board[nRow][nCol];
          if (!targetCell?.piece) return false;
          const targetPiece = targetCell.piece;
          if (!targetPiece.faceUp) return true;
          return targetPiece.color === opponentColor && canCapture(piece, targetPiece);
        };
        for (const d of [
          [r - 1, c - 1],
          [r - 1, c + 1],
          [r + 1, c - 1],
          [r + 1, c + 1],
        ]) {
          if (horseDiagCheck(d[0], d[1])) {
            currentHasMoves = true;
            break;
          }
        }
      }
    }
  }

  if (!opponentHasPieces) {
    gameOver = true;
    const winnerPlayer = activePlayer;
    const loserPlayer = activePlayer === 1 ? 2 : 1;
    recordWin(winnerPlayer);
    const statusEl = document.getElementById("status");
    const winnerName = getPlayerName(winnerPlayer);
    const loserName = getPlayerName(loserPlayer);
    statusEl.innerHTML = `<span class="status-win">${winnerName} 獲勝！</span> ${loserName} 已經沒有棋子了。`;
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
    showGameOverModal(winnerPlayer);
    if (gameMode === "online") syncOnlineState();
  } else if (!currentHasMoves) {
    gameOver = true;
    const winnerPlayer = activePlayer === 1 ? 2 : 1;
    const loserPlayer = activePlayer;
    recordWin(winnerPlayer);
    const statusEl = document.getElementById("status");
    const winnerName = getPlayerName(winnerPlayer);
    const loserName = getPlayerName(loserPlayer);
    statusEl.innerHTML = `<span class="status-win">${winnerName} 獲勝！</span> ${loserName} 已經沒有合法走法。`;
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
    showGameOverModal(winnerPlayer);
    if (gameMode === "online") syncOnlineState();
  }
}

function renderBoard() {
  const boardEl = document.getElementById("board");
  if (!boardEl) return;
  boardEl.innerHTML = "";

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = board[row][col];
      const cellEl = document.createElement("div");
      cellEl.className = "cell";
      cellEl.dataset.row = row;
      cellEl.dataset.col = col;

      cellEl.addEventListener("click", () => handleCellClick(row, col));

      if (!cell || !cell.piece) {
        boardEl.appendChild(cellEl);
        continue;
      }

      const piece = cell.piece;
      if (!piece) {
        boardEl.appendChild(cellEl);
        continue;
      }

      const pieceEl = document.createElement("div");

      if (!piece.faceUp) {
        pieceEl.className = "piece piece-back";
      } else {
        pieceEl.className = `piece piece-front ${piece.color}`;

        const shortEl = document.createElement("span");
        shortEl.className = "piece-name";
        shortEl.textContent = getPieceLabel(piece);

        pieceEl.appendChild(shortEl);
      }

      if (piece.faceUp && getCurrentPlayerColor() && piece.color === getCurrentPlayerColor()) {
        cellEl.classList.add("my-turn");
      }

      if (selectedCell && selectedCell.row === row && selectedCell.col === col) {
        cellEl.classList.add("selected");
      }

      cellEl.appendChild(pieceEl);
      boardEl.appendChild(cellEl);
    }
  }
  renderCaptured();
}

function runCaptureFlyAnimation(pending) {
  const redEl = document.getElementById("captured-red");
  const blackEl = document.getElementById("captured-black");
  const listEl = pending.piece.color === "red" ? redEl : blackEl;
  const targetEl = listEl && listEl.lastElementChild;
  if (!targetEl) {
    pendingCaptureFly = null;
    return;
  }
  const endRect = targetEl.getBoundingClientRect();
  const flyer = document.createElement("div");
  flyer.className = "piece piece-front " + pending.piece.color + " piece-captured piece-flyer";
  const span = document.createElement("span");
  span.className = "piece-name";
  span.textContent = getPieceLabel(pending.piece);
  flyer.appendChild(span);
  const sr = pending.startRect;
  flyer.style.position = "fixed";
  flyer.style.left = sr.left + "px";
  flyer.style.top = sr.top + "px";
  flyer.style.width = sr.width + "px";
  flyer.style.height = sr.height + "px";
  flyer.style.zIndex = "10000";
  flyer.style.pointerEvents = "none";
  flyer.style.transition = "left 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94), top 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94), width 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94), height 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
  document.body.appendChild(flyer);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      flyer.style.left = endRect.left + "px";
      flyer.style.top = endRect.top + "px";
      flyer.style.width = endRect.width + "px";
      flyer.style.height = endRect.height + "px";
    });
  });
  let done = false;
  const onEnd = () => {
    if (done) return;
    done = true;
    flyer.remove();
    flyer.removeEventListener("transitionend", onEnd);
    targetEl.classList.remove("fly-in-target");
    targetEl.style.opacity = "1";
    targetEl.classList.add("just-captured");
    pendingCaptureFly = null;
    setTimeout(() => targetEl.classList.remove("just-captured"), 700);
  };
  flyer.addEventListener("transitionend", onEnd);
  setTimeout(onEnd, 550);
}

function renderCaptured() {
  const redEl = document.getElementById("captured-red");
  const blackEl = document.getElementById("captured-black");
  if (!redEl || !blackEl) return;
  redEl.innerHTML = "";
  blackEl.innerHTML = "";
  capturedPieces.red.forEach((p, i) => {
    const el = document.createElement("div");
    el.className = "piece piece-front red piece-captured";
    if (i >= lastCapturedCount.red) {
      el.classList.add("fly-in-target");
      el.style.opacity = "0";
    }
    const span = document.createElement("span");
    span.className = "piece-name";
    span.textContent = getPieceLabel(p);
    el.appendChild(span);
    redEl.appendChild(el);
  });
  capturedPieces.black.forEach((p, i) => {
    const el = document.createElement("div");
    el.className = "piece piece-front black piece-captured";
    if (i >= lastCapturedCount.black) {
      el.classList.add("fly-in-target");
      el.style.opacity = "0";
    }
    const span = document.createElement("span");
    span.className = "piece-name";
    span.textContent = getPieceLabel(p);
    el.appendChild(span);
    blackEl.appendChild(el);
  });
  lastCapturedCount.red = capturedPieces.red.length;
  lastCapturedCount.black = capturedPieces.black.length;

  if (pendingCaptureFly) {
    const pending = pendingCaptureFly;
    pendingCaptureFly = null;
    runCaptureFlyAnimation(pending);
    return;
  }

  setTimeout(() => {
    redEl.querySelectorAll(".just-captured").forEach((node) => node.classList.remove("just-captured"));
    blackEl.querySelectorAll(".just-captured").forEach((node) => node.classList.remove("just-captured"));
  }, 700);
}

function updatePlayerPanelThemes() {
  const panel1 = document.querySelector(".panel-player1");
  const panel2 = document.querySelector(".panel-player2");
  if (!panel1 || !panel2) return;

  panel1.classList.remove("theme-red", "theme-black");
  panel2.classList.remove("theme-red", "theme-black");

  if (playerColors[1] === "red" || playerColors[1] === "black") {
    panel1.classList.add(`theme-${playerColors[1]}`);
  }
  if (playerColors[2] === "red" || playerColors[2] === "black") {
    panel2.classList.add(`theme-${playerColors[2]}`);
  }
}

function updateStatus() {
  const statusEl = document.getElementById("status");
  if (!statusEl) return;

  const panel1 = document.querySelector(".panel-player1");
  const panel2 = document.querySelector(".panel-player2");
  updatePlayerPanelThemes();
  panel1?.classList.remove("active-turn");
  panel2?.classList.remove("active-turn");
  if (!gameOver) {
    const turnPanel = activePlayer === 1 ? panel1 : panel2;
    turnPanel?.classList.add("active-turn");
  }

  if (gameOver) {
    return;
  }

  const p1Color = playerColors[1];
  const p2Color = playerColors[2];

  if (!p1Color || !p2Color) {
    statusEl.innerHTML = `<span class="status-highlight">${getPlayerName(
      1
    )}</span>，請點擊任意一個棋子翻開，它的顏色就是你的陣營。`;
    return;
  }

  const currentColor = getCurrentPlayerColor();
  const colorLabel = currentColor === "red" ? "紅方" : "黑方";
  const name = getPlayerName(activePlayer);
  statusEl.innerHTML = `<span class="status-highlight">${name}（${colorLabel}）</span>，輪到你走棋，可以翻一棋或移動一棋。`;
}

function showTemporaryStatus(message, cssClass) {
  const statusEl = document.getElementById("status");
  if (!statusEl) return;

  const previous = statusEl.innerHTML;
  statusEl.innerHTML = `<span class="${cssClass}">${message}</span>`;

  setTimeout(() => {
    if (!gameOver) {
      statusEl.innerHTML = previous;
    }
  }, 1200);
}

function surrenderPlayer(playerNumber) {
  if (gameOver) return;
  if (!isGameStarted()) return;

  const loserPlayer = playerNumber;
  const winnerPlayer = playerNumber === 1 ? 2 : 1;
  recordWin(winnerPlayer);
  addHistoryEntry(loserPlayer, `${getPlayerName(loserPlayer)} 投降。`);

  const statusEl = document.getElementById("status");
  const winnerName = getPlayerName(winnerPlayer);
  const loserName = getPlayerName(loserPlayer);
  if (statusEl) {
    statusEl.innerHTML = `<span class="status-win">${winnerName} 獲勝！</span> ${loserName} 投降。`;
  }

  gameOver = true;
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
  showGameOverModal(winnerPlayer);
  if (gameMode === "online") syncOnlineState();
}

function restartGame() {
  hideGameOverModal();
  if (aiTurnTimeoutId) {
    clearTimeout(aiTurnTimeoutId);
    aiTurnTimeoutId = null;
  }
  initBoard();
  activePlayer = 1;
  playerColors = { 1: null, 2: null };
  selectedCell = null;
  gameOver = false;
  moveHistory = [];
  renderHistory();
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
  isPaused = false;
  remainingSeconds = 30;
  readRuleOptions();
  updateRuleOptionsDisabled();
  renderBoard();
  updateStatus();
  updateTimerDisplay();
}

function setup() {
  readRuleOptions();
  updateRuleOptionsDisabled();
  initBoard();
  renderBoard();
  updateStatus();
  renderHistory();
  updateTimerDisplay();

  const modeTwoPlayerBtn = document.getElementById("modeTwoPlayer");
  const modeVsAIBtn = document.getElementById("modeVsAI");
  if (modeTwoPlayerBtn) {
    modeTwoPlayerBtn.addEventListener("click", () => {
      showProfileStep("twoPlayer");
    });
  }
  if (modeVsAIBtn) {
    modeVsAIBtn.addEventListener("click", () => {
      document.getElementById("modeModalStep1").style.display = "none";
      document.getElementById("modeModalStep2").style.display = "";
    });
  }

  const modeOnlineBtn = document.getElementById("modeOnline");
  if (modeOnlineBtn) {
    modeOnlineBtn.addEventListener("click", () => {
      document.getElementById("modeModalStep1").style.display = "none";
      document.getElementById("modeModalStep2").style.display = "none";
      const stepOnline = document.getElementById("modeModalStepOnline");
      if (stepOnline) stepOnline.style.display = "";
      resetOnlineModalUI();
      const codeInput = document.getElementById("onlineCodeInput");
      if (codeInput) codeInput.value = "";
    });
  }

  const onlineCreateBtn = document.getElementById("onlineCreate");
  if (onlineCreateBtn) {
    onlineCreateBtn.addEventListener("click", () => {
      showProfileStep("onlineHost");
    });
  }

  const onlineJoinBtn = document.getElementById("onlineJoin");
  if (onlineJoinBtn) {
    onlineJoinBtn.addEventListener("click", () => {
      const actions = document.querySelector("#modeModalStepOnline .modal-actions");
      if (actions) actions.style.display = "none";
      document.getElementById("onlineJoinArea").style.display = "block";
    });
  }

  const onlineJoinSubmitBtn = document.getElementById("onlineJoinBtn");
  if (onlineJoinSubmitBtn) {
    onlineJoinSubmitBtn.addEventListener("click", () => {
      const input = document.getElementById("onlineCodeInput");
      const code = input ? input.value.trim().toUpperCase() : "";
      if (code.length !== 6) {
        document.getElementById("onlineJoinError").textContent = "請輸入 6 位代碼";
        document.getElementById("onlineJoinError").style.display = "block";
        return;
      }
      showProfileStep("onlineJoin", { code });
    });
  }

  const onlineCancelCreateBtn = document.getElementById("onlineCancelCreate");
  if (onlineCancelCreateBtn) {
    onlineCancelCreateBtn.addEventListener("click", () => {
      leaveOnlineGame();
      showModeModal();
      resetOnlineModalUI();
    });
  }

  const onlineCopyCodeBtn = document.getElementById("onlineCopyCode");
  if (onlineCopyCodeBtn) {
    onlineCopyCodeBtn.addEventListener("click", () => {
      const el = document.getElementById("onlineGameCode");
      if (!el) return;
      const code = el.textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(() => {
          const prev = onlineCopyCodeBtn.textContent;
          onlineCopyCodeBtn.textContent = "已複製！";
          setTimeout(() => { onlineCopyCodeBtn.textContent = prev; }, 1500);
        });
      } else {
        const ta = document.createElement("textarea");
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        onlineCopyCodeBtn.textContent = "已複製！";
        setTimeout(() => { onlineCopyCodeBtn.textContent = "複製代碼"; }, 1500);
      }
    });
  }

  const modeModalBackOnline = document.getElementById("modeModalBackOnline");
  if (modeModalBackOnline) {
    modeModalBackOnline.addEventListener("click", () => {
      document.getElementById("modeModalStepOnline").style.display = "none";
      document.getElementById("modeModalStep1").style.display = "";
    });
  }

  const modeModalBack = document.getElementById("modeModalBack");
  if (modeModalBack) {
    modeModalBack.addEventListener("click", () => {
      document.getElementById("modeModalStep2").style.display = "none";
      document.getElementById("modeModalStep1").style.display = "";
    });
  }

  document.querySelectorAll(".ai-level").forEach((btn) => {
    btn.addEventListener("click", () => {
      const level = btn.getAttribute("data-level");
      if (level) {
        const select = document.getElementById("ruleAIDifficulty");
        if (select) select.value = level;
        aiDifficulty = level;
      }
      showProfileStep("vsAI", { level });
    });
  });

  const modeProfileStart = document.getElementById("modeProfileStart");
  if (modeProfileStart) {
    modeProfileStart.addEventListener("click", () => {
      if (!validateProfileModal()) return;
      applyProfileToBoards();

      if (pendingProfileContext === "twoPlayer") {
        setModeWithRecordReset("twoPlayer");
        profileLocked = { 1: true, 2: true };
        const cb = document.getElementById("ruleVsAI");
        if (cb) cb.checked = false;
        restartGame();
        hideModeModal();
      } else if (pendingProfileContext === "vsAI") {
        setModeWithRecordReset("vsAI");
        profileLocked = { 1: true, 2: true };
        const cb = document.getElementById("ruleVsAI");
        if (cb) cb.checked = true;
        assignRandomAINameAndAvatar();
        restartGame();
        hideModeModal();
      } else if (pendingProfileContext === "onlineHost") {
        setModeWithRecordReset("online");
        profileLocked = { 1: true, 2: false };
        document.getElementById("modeModalStepProfile").style.display = "none";
        document.getElementById("modeModalStepOnline").style.display = "";
        createOnlineGame();
      } else if (pendingProfileContext === "onlineJoin") {
        setModeWithRecordReset("online");
        profileLocked = { 1: false, 2: true };
        const code = pendingProfilePayload?.code || "";
        joinOnlineGame(code);
      }

      applyAllProfileDisplays();
      updateStatus();
    });
  }

  const modeProfileBack = document.getElementById("modeProfileBack");
  if (modeProfileBack) {
    modeProfileBack.addEventListener("click", () => {
      document.getElementById("modeModalStepProfile").style.display = "none";
      if (pendingProfileContext === "vsAI") {
        document.getElementById("modeModalStep2").style.display = "";
      } else if (pendingProfileContext === "onlineHost" || pendingProfileContext === "onlineJoin") {
        document.getElementById("modeModalStepOnline").style.display = "";
      } else {
        document.getElementById("modeModalStep1").style.display = "";
      }
    });
  }

  const gameOverAgainBtn = document.getElementById("gameOverAgain");
  if (gameOverAgainBtn) {
    gameOverAgainBtn.addEventListener("click", () => {
      if (gameMode === "online") leaveOnlineGame();
      restartGame();
      showModeModal();
    });
  }

  ["ruleAnqiChain", "ruleCarHorse", "ruleVsAI", "ruleAIDifficulty"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", () => {
        readRuleOptions();
        updateRuleOptionsDisabled();
      });
    }
  });

  const restartBtn = document.getElementById("restartBtn");
  if (restartBtn) {
    restartBtn.addEventListener("click", restartGame);
  }

  const surrender1 = document.getElementById("surrender1");
  const surrender2 = document.getElementById("surrender2");
  if (surrender1) surrender1.addEventListener("click", () => surrenderPlayer(1));
  if (surrender2) surrender2.addEventListener("click", () => surrenderPlayer(2));

  loadRecord();
  renderRecord();

  const input1 = document.getElementById("player1Name");
  const input2 = document.getElementById("player2Name");
  if (input1) {
    input1.value = playerNames[1];
    input1.addEventListener("input", (event) => {
      playerNames[1] = event.target.value;
      updateStatus();
      if (gameMode === "online") syncOnlineState();
    });
  }
  if (input2) {
    input2.value = playerNames[2];
    input2.addEventListener("input", (event) => {
      playerNames[2] = event.target.value;
      updateStatus();
      if (gameMode === "online") syncOnlineState();
    });
  }

  const bgPicker = document.getElementById("bgColorPicker");
  if (bgPicker) {
    bgPicker.addEventListener("input", (event) => {
      const color = event.target.value;
      document.body.style.background = color;
    });
  }
  const pieceBackPicker = document.getElementById("pieceBackColorPicker");
  if (pieceBackPicker) {
    pieceBackPicker.addEventListener("input", (event) => {
      const color = event.target.value;
      document.documentElement.style.setProperty("--piece-back-color", color);
    });
    document.documentElement.style.setProperty("--piece-back-color", pieceBackPicker.value);
  }

  const avatarSelect1 = document.getElementById("player1Avatar");
  const avatarSelect2 = document.getElementById("player2Avatar");
  if (avatarSelect1) {
    avatarSelect1.addEventListener("change", () => {
      playerAvatars[1] = avatarSelect1.value;
      renderAvatarPreview(1);
      if (gameMode === "online") syncOnlineState();
    });
    playerAvatars[1] = avatarSelect1.value || "";
    renderAvatarPreview(1);
  }
  if (avatarSelect2) {
    avatarSelect2.addEventListener("change", () => {
      playerAvatars[2] = avatarSelect2.value;
      renderAvatarPreview(2);
      if (gameMode === "online") syncOnlineState();
    });
    playerAvatars[2] = avatarSelect2.value || "";
    renderAvatarPreview(2);
  }
  applyAllProfileDisplays();

  const pauseBtn = document.getElementById("pauseBtn");
  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
      if (gameOver) return;
      isPaused = !isPaused;
      pauseBtn.textContent = isPaused ? "繼續遊戲" : "暫停計時";
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setup);
} else {
  setup();
}

