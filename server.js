const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  pingTimeout: 60000,
});

app.use(express.static(path.join(__dirname, 'public')));

// ─── 常數 ───────────────────────────────────────────────
const TURN_TIME    = 15;    // 每輪秒數
const KNOCK_WINDOW = 5;     // 敲頭投票窗口（秒）
const MIN_PLAYERS  = 2;     // 最少幾人才能開始
const START_DELAY  = 3000;  // 足夠人數後倒數開始（ms）
const MAX_SENTENCE = 40;    // 句子最大字元數
const MAX_ROOMS       = 200;  // 最多幾個房間（防記憶體爆炸）
const JOIN_RATE_LIMIT = 5;   // 同一 socket 最多幾次 join（防刷房）
const RANDOM_LOBBY_TIME = 30; // 隨機房間等待窗口（秒）

// 不允許的字元（防 XSS）
const FORBIDDEN_CHARS = /[<>&"'`]/;

const STARTING_WORDS = [
  // 原有
  '西瓜', '貓咪', '蘋果', '音樂', '夏天', '咖啡',
  '月亮', '星星', '海浪', '山頂', '朋友', '夢想',
  '城市', '花朵', '笑聲', '彩虹', '糖果', '火車',
  '雲朵', '小狗', '冰淇淋', '電影', '跑步', '大樹',
  // 食物飲料
  '壽司', '拉麵', '泡麵', '草莓', '芒果', '香蕉',
  '鳳梨', '奶茶', '漢堡', '披薩', '餃子', '薯條',
  '巧克力', '布丁', '甜甜圈', '蛋糕', '火鍋', '烤肉',
  '珍珠', '壽桃',
  // 動物
  '兔子', '熊貓', '企鵝', '老虎', '獅子', '狐狸',
  '鸚鵡', '鱷魚', '海豚', '蝴蝶', '烏龜', '章魚',
  '長頸鹿', '北極熊', '無尾熊',
  // 自然
  '沙漠', '森林', '瀑布', '火山', '海灘', '草原',
  '湖泊', '島嶼', '閃電', '颱風',
  // 日常物品
  '手機', '電腦', '眼鏡', '雨傘', '書包', '鋼琴',
  '吉他', '帽子', '圍巾', '鑰匙', '氣球', '蠟燭',
  '鬧鐘', '鏡子', '枕頭',
  // 活動
  '旅行', '游泳', '跳舞', '唱歌', '爬山', '釣魚',
  '烹飪', '冒險', '睡覺', '購物',
  // 幻想角色
  '魔王', '勇者', '忍者', '海盜', '機器人', '殭屍',
  '幽靈', '恐龍', '外星人', '超人', '偵探', '公主',
  '巫師', '飛龍', '仙女',
  // 抽象情感
  '勇氣', '秘密', '謊言', '記憶', '思念',
  // 感情相關
  '曖昧', '暗戀', '告白', '初戀', '熱戀', '求婚',
  '約會', '戀愛', '喜歡', '心動', '擁抱', '親吻',
  '牽手', '甜蜜', '浪漫',
  '單身', '交往', '婚禮', '新婚', '夫妻', '情侶',
  '閃婚', '閃離', '復合', '遠距', '劈腿', '偷情',
  '出軌', '小三', '分手',
  '嫉妒', '佔有', '心碎', '失戀', '吃醋', '放手',
  '道歉', '原諒', '守護',
  '備胎', '撩妹', '撩漢', '花心', '渣男', '綠茶',
  '正宮', '前任', '緣分', '月老',
  // 科幻宇宙
  '宇宙', '星空', '太空', '黑洞', '時光機', '龍捲風',
  '彩虹橋', '飛碟', '隕石', '銀河',
];

// ─── 房間管理 ────────────────────────────────────────────
const rooms = new Map();

function genRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆的 0/O/1/I
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function createRoom(id) {
  return {
    id,
    players: [],        // { id, name, status: 'active'|'eliminated'|'pending' }
    gameState: 'waiting', // waiting | countdown | playing | knock-window | ended
    currentSentence: '',
    currentPlayerId: null,
    turnTimer: null,
    knockTimer: null,
    countdownTimer: null,
    lobbyTimer: null,   // 隨機房間等待倒數
    lobbyEndTime: null,
    knockVotes: new Set(),
    turnEndTime: null,
  };
}

function getRoom(id) {
  if (!rooms.has(id)) rooms.set(id, createRoom(id));
  return rooms.get(id);
}

function activePlayers(room) {
  return room.players.filter(p => p.status === 'active');
}

// ─── 測試房間 (9999) ─────────────────────────────────────
const TEST_ROOM_ID = '9999';
const BOT_CHARS = [...'的了在是我你他們都很好大小上下來去吃喝玩笑跑飛超真也又還不沒想說看聽走坐站哈嗚哦咦哇啊唉嗯喂欸啦囉咩嘿嗨'];
const BOT_PLAYERS = [
  { id: 'bot-1', name: '機器人甲' },
  { id: 'bot-2', name: '機器人乙' },
  { id: 'bot-3', name: '機器人丙' },
];

function isBot(id) { return typeof id === 'string' && id.startsWith('bot-'); }

function injectBots(room) {
  BOT_PLAYERS.forEach(b => {
    if (!room.players.find(p => p.id === b.id)) {
      room.players.push({ id: b.id, name: b.name, status: 'active' });
    }
  });
}

function botPlay(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.gameState !== 'playing') return;
  if (!isBot(room.currentPlayerId)) return;

  clearTimers(room);

  const char = BOT_CHARS[Math.floor(Math.random() * BOT_CHARS.length)];
  const sentenceArr = [...room.currentSentence];
  const pos = Math.floor(Math.random() * (sentenceArr.length + 1));
  const newSentence = sentenceArr.slice(0, pos).join('') + char + sentenceArr.slice(pos).join('');

  if (newSentence.length > MAX_SENTENCE) {
    const winner = room.players.find(p => p.status === 'active' && !isBot(p.id)) || activePlayers(room)[0] || null;
    endGame(roomId, winner);
    return;
  }

  room.gameState = 'knock-window';
  room.knockVotes.clear();
  room.turnEndTime = Date.now() + KNOCK_WINDOW * 1000;

  const player = room.players.find(p => p.id === room.currentPlayerId);
  const active = activePlayers(room);
  const knockRequired = Math.max(1, Math.floor(active.length / 2));

  io.to(roomId).emit('answerSubmitted', {
    playerId:     room.currentPlayerId,
    playerName:   player?.name || '?',
    newSentence,
    knockWindow:  KNOCK_WINDOW,
    knockRequired,
    turnEndTime:  room.turnEndTime,
  });
  emitState(roomId);

  room.knockTimer = setTimeout(() => {
    if (room.gameState !== 'knock-window') return;
    const active2 = activePlayers(room);
    const req2 = Math.max(1, Math.floor(active2.length / 2));
    if (room.knockVotes.size >= req2) {
      room.knockVotes.clear();
      io.to(roomId).emit('knocked', { playerId: room.currentPlayerId, playerName: player?.name || '?' });
      setTimeout(() => eliminateCurrentPlayer(roomId, 'knocked'), 1500);
    } else {
      room.currentSentence = newSentence;
      room.knockVotes.clear();
      io.to(roomId).emit('accepted', { newSentence });
      advancePlayer(room);
      setTimeout(() => { emitState(roomId); startTurn(roomId); }, 1500);
    }
  }, KNOCK_WINDOW * 1000);
}

function pendingPlayers(room) {
  return room.players.filter(p => p.status === 'pending');
}

// ─── 廣播房間狀態 ────────────────────────────────────────
function emitState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const active = activePlayers(room);
  const knockRequired = Math.max(1, Math.floor(active.length / 2));
  const timeLeft = room.turnEndTime
    ? Math.max(0, Math.ceil((room.turnEndTime - Date.now()) / 1000))
    : null;

  io.to(roomId).emit('state', {
    gameState:       room.gameState,
    currentSentence: room.currentSentence,
    currentPlayerId: room.currentPlayerId,
    players:         room.players.map(p => ({ id: p.id, name: p.name, status: p.status })),
    knockVotes:      room.knockVotes.size,
    knockRequired,
    timeLeft,
    turnEndTime:  room.turnEndTime  || null,
    lobbyEndTime: (room.isRandom && room.lobbyEndTime) ? room.lobbyEndTime : null,
  });
}

// ─── 清除計時器 ──────────────────────────────────────────
function clearTimers(room) {
  if (room.turnTimer)     { clearTimeout(room.turnTimer);     room.turnTimer     = null; }
  if (room.knockTimer)    { clearTimeout(room.knockTimer);    room.knockTimer    = null; }
  if (room.countdownTimer){ clearTimeout(room.countdownTimer); room.countdownTimer = null; }
  if (room.lobbyTimer)    { clearTimeout(room.lobbyTimer);    room.lobbyTimer    = null; }
  room.turnEndTime  = null;
  room.lobbyEndTime = null;
}

// ─── 找下一個玩家 ID（在更改陣列之前呼叫）──────────────────
function peekNextPlayerId(room) {
  const active = activePlayers(room);
  if (active.length <= 1) return null;
  const idx = active.findIndex(p => p.id === room.currentPlayerId);
  const nextIdx = idx === -1 ? 0 : (idx + 1) % active.length;
  return active[nextIdx].id;
}

// ─── 前進到下一個玩家 ────────────────────────────────────
function advancePlayer(room) {
  const active = activePlayers(room);
  if (active.length === 0) { room.currentPlayerId = null; return; }
  const idx = active.findIndex(p => p.id === room.currentPlayerId);
  const nextIdx = idx === -1 ? 0 : (idx + 1) % active.length;
  room.currentPlayerId = active[nextIdx].id;
}

// ─── 開始一局遊戲 ────────────────────────────────────────
function startGame(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  clearTimers(room);
  const active = activePlayers(room);
  if (active.length < MIN_PLAYERS) return;

  const startWord = STARTING_WORDS[Math.floor(Math.random() * STARTING_WORDS.length)];
  room.currentSentence  = startWord;
  room.gameState        = 'playing';
  room.currentPlayerId  = active[0].id;
  room.knockVotes.clear();

  io.to(roomId).emit('gameStarted', { startWord });
  emitState(roomId);
  setTimeout(() => startTurn(roomId), 2000);
}

// ─── 開始某人的回合 ──────────────────────────────────────
function startTurn(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.gameState === 'ended' || room.gameState === 'waiting') return;

  const active = activePlayers(room);
  if (active.length < 2)     { endGame(roomId, active[0] || null); return; }

  // 確保 currentPlayerId 合法
  if (!active.find(p => p.id === room.currentPlayerId)) {
    room.currentPlayerId = active[0].id;
  }

  room.gameState    = 'playing';
  room.knockVotes.clear();
  room.turnEndTime  = Date.now() + TURN_TIME * 1000;

  const player = room.players.find(p => p.id === room.currentPlayerId);
  io.to(roomId).emit('turnStart', {
    currentPlayerId:   room.currentPlayerId,
    currentPlayerName: player?.name || '?',
    totalTime:         TURN_TIME,
    turnEndTime:       room.turnEndTime,
  });
  emitState(roomId);

  // 測試房間：bot 自動在 1–3 秒內出題
  if (isBot(room.currentPlayerId)) {
    clearTimeout(room.turnTimer);
    const delay = 1000 + Math.floor(Math.random() * 2000);
    room.turnTimer = setTimeout(() => botPlay(roomId), delay);
    return;
  }

  room.turnTimer = setTimeout(() => {
    eliminateCurrentPlayer(roomId, 'timeout');
  }, TURN_TIME * 1000);
}

// ─── 淘汰目前玩家 ────────────────────────────────────────
function eliminateCurrentPlayer(roomId, reason) {
  const room = rooms.get(roomId);
  if (!room) return;

  clearTimers(room);
  const player = room.players.find(p => p.id === room.currentPlayerId);
  if (!player || player.status !== 'active') return;

  // 淘汰前先找下一位
  const nextId = peekNextPlayerId(room);

  player.status = 'eliminated';
  io.to(roomId).emit('eliminated', { playerId: player.id, playerName: player.name, reason });

  const active = activePlayers(room);
  if (active.length < 2) { endGame(roomId, active[0] || null); return; }

  room.currentPlayerId = nextId || active[0].id;

  setTimeout(() => {
    emitState(roomId);
    startTurn(roomId);
  }, 2500);
}

// ─── 結束遊戲 ────────────────────────────────────────────
function endGame(roomId, winner) {
  const room = rooms.get(roomId);
  if (!room) return;

  clearTimers(room);
  room.gameState = 'ended';

  io.to(roomId).emit('gameOver', {
    winnerId:   winner?.id   || null,
    winnerName: winner?.name || null,
  });

  // 5 秒後重置
  room.countdownTimer = setTimeout(() => resetRoom(roomId), 6000);
}

// ─── 重置房間（新一局）──────────────────────────────────
function resetRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  clearTimers(room);

  // 所有人（含淘汰者）復活
  room.players = room.players.map(p => ({ ...p, status: 'active' }));
  room.currentSentence  = '';
  room.currentPlayerId  = null;
  room.gameState        = 'waiting';
  room.knockVotes.clear();

  // 測試房間：重置後重新注入 bots 並自動開始
  if (roomId === TEST_ROOM_ID) {
    injectBots(room);
    io.to(roomId).emit('roomReset');
    emitState(roomId);
    const hasRealPlayer = room.players.some(p => !isBot(p.id));
    if (hasRealPlayer) setTimeout(() => startGame(TEST_ROOM_ID), 3000);
    return;
  }

  io.to(roomId).emit('roomReset');
  emitState(roomId);
  // 不自動開始，等玩家按按鈕
}

// ─── 通知可以開始（人數足夠時廣播）─────────────────────
function notifyCanStart(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.gameState !== 'waiting') return;
  emitState(roomId); // state 裡已有人數，前端自行判斷
}

// ─── 隨機房間大廳倒數 ────────────────────────────────────
function startLobbyCountdown(roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.isRandom || room.lobbyTimer) return;

  room.lobbyEndTime = Date.now() + RANDOM_LOBBY_TIME * 1000;
  emitState(roomId);

  room.lobbyTimer = setTimeout(() => {
    room.lobbyTimer   = null;
    room.lobbyEndTime = null;
    const active = activePlayers(room);
    if (room.gameState === 'waiting' && active.length >= MIN_PLAYERS) {
      startGame(roomId);
    } else {
      emitState(roomId); // 人不夠，繼續等待
    }
  }, RANDOM_LOBBY_TIME * 1000);
}

// ─── 隨機配對：找或建一個公開房間 ──────────────────────────
const MAX_RANDOM_PLAYERS = 8;

function findOrCreateRandomRoom() {
  for (const [id, room] of rooms) {
    if (room.isRandom &&
        (room.gameState === 'waiting' || room.gameState === 'countdown') &&
        activePlayers(room).length < MAX_RANDOM_PLAYERS) {
      return id;
    }
  }
  if (rooms.size >= MAX_ROOMS) return null;
  const id = genRoomId();
  const room = createRoom(id);
  room.isRandom = true;
  rooms.set(id, room);
  return id;
}

// ─── Socket.io 事件 ──────────────────────────────────────
io.on('connection', (socket) => {

  // 加入房間
  socket.on('join', ({ name, roomId, mode }) => {
    // 防止重複加入
    if (socket.data.roomId) { socket.emit('error', { message: '已在房間中' }); return; }

    // 速率限制：同一 socket 最多 JOIN_RATE_LIMIT 次
    socket.data.joinCount = (socket.data.joinCount || 0) + 1;
    if (socket.data.joinCount > JOIN_RATE_LIMIT) {
      socket.emit('error', { message: '操作太頻繁，請重新整理頁面' });
      return;
    }

    const trimName = (name || '').trim().slice(0, 5);
    if (!trimName) { socket.emit('error', { message: '請輸入名字' }); return; }

    // 名字不得含 HTML 特殊字元
    if (FORBIDDEN_CHARS.test(trimName)) {
      socket.emit('error', { message: '名字不能包含特殊符號（< > & \' "）' });
      return;
    }

    let rid;
    if (mode === 'random') {
      rid = findOrCreateRandomRoom();
      if (rid === null) {
        socket.emit('error', { message: '流量超載中，請稍等再加入！' });
        return;
      }
    } else {
      rid = (roomId?.trim().toUpperCase()) || genRoomId();
      // 房間上限檢查
      if (!rooms.has(rid) && rid !== TEST_ROOM_ID && rooms.size >= MAX_ROOMS) {
        socket.emit('error', { message: '伺服器已滿，請稍後再試' });
        return;
      }
      if (!rooms.has(rid)) rooms.set(rid, createRoom(rid));
    }
    const room = rooms.get(rid);

    // 測試房間：注入 bot
    if (rid === TEST_ROOM_ID) {
      injectBots(room);
    }

    socket.join(rid);
    socket.data.roomId = rid;
    socket.data.name   = trimName;

    const isPlaying = room.gameState !== 'waiting' && room.gameState !== 'countdown';
    const player = { id: socket.id, name: trimName, status: isPlaying ? 'pending' : 'active' };
    room.players.push(player);

    socket.emit('joined', {
      playerId:  socket.id,
      roomId:    rid,
      isPending: isPlaying,
      isRandom:  !!room.isRandom,
    });
    emitState(rid);

    // 測試房間：有真人加入且遊戲未開始 → 2 秒後自動開始
    if (rid === TEST_ROOM_ID && !isPlaying) {
      setTimeout(() => {
        const r = rooms.get(TEST_ROOM_ID);
        if (r && r.gameState === 'waiting') startGame(TEST_ROOM_ID);
      }, 2000);
    }

    // 隨機房間：等待玩家手動開始
    if (room.isRandom && !isPlaying) {
      notifyCanStart(rid);
    }
  });

  // 提交答案
  socket.on('submit', ({ position, character }) => {
    const roomId = socket.data.roomId;
    const room   = rooms.get(roomId);
    if (!room || room.gameState !== 'playing') return;
    if (room.currentPlayerId !== socket.id) return;

    const char = (character || '').trim();
    if (!char || [...char].length !== 1) {
      socket.emit('error', { message: '只能加一個字！' });
      return;
    }
    // 防 XSS：拒絕 HTML 特殊字元
    if (FORBIDDEN_CHARS.test(char)) {
      socket.emit('error', { message: '不能使用這個符號！' });
      return;
    }
    // 只允許中文字（CJK 統一漢字）
    if (!/^[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]$/.test(char)) {
      socket.emit('error', { message: '只能加中文字！' });
      return;
    }
    const pos = Math.max(0, Math.min(Math.floor(Number(position) || 0), room.currentSentence.length));
    const newSentence = room.currentSentence.slice(0, pos) + char + room.currentSentence.slice(pos);
    if (newSentence.length > MAX_SENTENCE) {
      socket.emit('error', { message: `句子太長了，最多 ${MAX_SENTENCE} 字！` });
      return;
    }

    clearTimers(room);
    room.gameState   = 'knock-window';
    room.knockVotes.clear();
    room.turnEndTime = Date.now() + KNOCK_WINDOW * 1000;

    const player     = room.players.find(p => p.id === socket.id);
    const active     = activePlayers(room);
    const knockRequired = Math.max(1, Math.floor(active.length / 2));

    io.to(roomId).emit('answerSubmitted', {
      playerId:    socket.id,
      playerName:  player?.name || '?',
      newSentence,
      knockWindow:  KNOCK_WINDOW,
      knockRequired,
      turnEndTime:  room.turnEndTime,
    });
    emitState(roomId);

    // 敲頭窗口結束後判定
    room.knockTimer = setTimeout(() => {
      if (room.gameState !== 'knock-window') return;

      const active2       = activePlayers(room);
      const knockRequired2 = Math.max(1, Math.floor(active2.length / 2));

      if (room.knockVotes.size >= knockRequired2) {
        // 被敲頭 → 直接淘汰
        room.knockVotes.clear();
        io.to(roomId).emit('knocked', {
          playerId:   socket.id,
          playerName: player?.name || '?',
        });
        setTimeout(() => {
          eliminateCurrentPlayer(roomId, 'knocked');
        }, 1500);
      } else {
        // 通過！
        room.currentSentence = newSentence;
        room.knockVotes.clear();
        io.to(roomId).emit('accepted', { newSentence });
        advancePlayer(room);
        setTimeout(() => {
          emitState(roomId);
          startTurn(roomId);
        }, 1500);
      }
    }, KNOCK_WINDOW * 1000);
  });

  // 敲頭投票
  socket.on('knock', () => {
    const roomId = socket.data.roomId;
    const room   = rooms.get(roomId);
    if (!room || room.gameState !== 'knock-window') return;
    if (room.currentPlayerId === socket.id) return; // 不能敲自己

    const voter = room.players.find(p => p.id === socket.id && p.status === 'active');
    if (!voter) return;
    if (room.knockVotes.has(socket.id)) return; // 已投票

    room.knockVotes.add(socket.id);

    const active        = activePlayers(room);
    const knockRequired = Math.max(1, Math.floor(active.length / 2));

    io.to(roomId).emit('knockVote', {
      votes:       room.knockVotes.size,
      required:    knockRequired,
      voterId:     socket.id,
      voterName:   voter.name,
    });
    emitState(roomId);
  });

  // 斷線處理
  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    // 測試房間：真人離開時完整重置（保留 bots）
    if (roomId === TEST_ROOM_ID) {
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) room.players.splice(idx, 1);
      clearTimers(room);
      room.players = BOT_PLAYERS.map(b => ({ id: b.id, name: b.name, status: 'active' }));
      room.gameState = 'waiting';
      room.currentSentence = '';
      room.currentPlayerId = null;
      room.knockVotes.clear();
      return;
    }

    const playerName      = socket.data.name;
    const wasCurrentPlayer = room.currentPlayerId === socket.id;

    // 離開前先計算下一位
    let nextId = null;
    if (wasCurrentPlayer) nextId = peekNextPlayerId(room);

    // 從 players 移除
    const idx = room.players.findIndex(p => p.id === socket.id);
    if (idx !== -1) room.players.splice(idx, 1);

    io.to(roomId).emit('playerLeft', { playerId: socket.id, playerName });

    const active = activePlayers(room);

    if (room.gameState !== 'waiting' && room.gameState !== 'ended') {
      if (active.length < 2) {
        endGame(roomId, active[0] || null);
        return;
      }
      if (wasCurrentPlayer) {
        clearTimers(room);
        room.currentPlayerId = nextId || active[0].id;
        setTimeout(() => { emitState(roomId); startTurn(roomId); }, 1500);
        return;
      }
    }

    emitState(roomId);

    // 清理空房間
    setTimeout(() => {
      const r = rooms.get(roomId);
      if (r && r.players.length === 0) { clearTimers(r); rooms.delete(roomId); }
    }, 60000);
  });

  // 手動開始遊戲
  socket.on('requestStart', () => {
    const roomId = socket.data.roomId;
    const room   = rooms.get(roomId);
    if (!room || room.gameState !== 'waiting') return;
    if (activePlayers(room).length < MIN_PLAYERS) {
      socket.emit('error', { message: `需要至少 ${MIN_PLAYERS} 人才能開始！` });
      return;
    }
    startGame(roomId);
  });

  // Emoji 反應
  const ALLOWED_REACTIONS = ['😂🤙','🥵👊','🤡👏','🤓🫵','😘🫰','😝🖖','😡','😤','😳','😱','🤢','😈','💩','💋','👀','🤷‍♀️'];
  socket.on('reaction', ({ emoji }) => {
    const roomId = socket.data.roomId;
    const room   = rooms.get(roomId);
    if (!room) return;

    // 速率限制：每人每 1.5 秒最多一個
    const now = Date.now();
    if (socket.data.lastReaction && now - socket.data.lastReaction < 1500) return;
    socket.data.lastReaction = now;

    if (!ALLOWED_REACTIONS.includes(emoji)) return;

    const player = room.players.find(p => p.id === socket.id);
    io.to(roomId).emit('reaction', { emoji, playerName: player?.name || '?' });
  });

  // 心跳（偵測閒置）
  socket.on('heartbeat', () => {
    socket.data.lastHeartbeat = Date.now();
  });
});

// ─── 閒置踢除（等待中的房間，2 分鐘沒有心跳就踢）────────
const IDLE_TIMEOUT = 2 * 60 * 1000; // 2 分鐘
setInterval(() => {
  const now = Date.now();
  for (const [, room] of rooms) {
    if (room.gameState !== 'waiting') continue;
    room.players.forEach(p => {
      const s = io.sockets.sockets.get(p.id);
      if (!s) return;
      const hb = s.data.lastHeartbeat;
      if (hb && now - hb > IDLE_TIMEOUT) {
        s.emit('kicked', { reason: 'idle' });
        s.disconnect(true);
      }
    });
  }
}, 30000);

// ─── 啟動伺服器 ──────────────────────────────────────────
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`\n🎮 接字遊戲伺服器啟動`);
  console.log(`   http://localhost:${PORT}\n`);
});
