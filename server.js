const express = require('express');
const fs = require('fs');
const path = require('path');
const { xorEncode, xorDecode, base64Encode, base64Decode, unwrapRequest, parseClientPacket } = require('./protocol');
const G = require('./game-logic');
const DB = require('./database');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const PORT = 8080;

// Logger middleware BEFORE body parsers to capture raw info
app.use((req, res, next) => {
  const ct = req.get('Content-Type') || 'none';
  console.log(`[REQ] ${req.method} ${req.path} ct=${ct}`);
  next();
});

app.use(express.raw({ type: 'application/octet-stream', limit: '10mb' }));
app.use(express.text({ type: 'text/plain', limit: '10mb' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const raw = req.body;
  if (raw) {
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw));
    console.log(`[RAW] ${req.method} ${req.path} body(${buf.length}B) ct=${req.get('Content-Type')||'?'} hex=${buf.slice(0, 96).toString('hex')} text=${buf.slice(0, 96).toString('latin1').replace(/[^\x20-\x7E]/g,'?')}`);
  }
  if (!raw) return next();
  if (Buffer.isBuffer(raw) && raw.length > 0) {
    try {
      const decrypted = xorDecode(raw);
      req.body = parseClientPacket(JSON.parse(decrypted));
    } catch (e) {
      try {
        const asText = raw.toString('utf8').trim();
        const fromBase64 = unwrapRequest(asText);
        req.body = parseClientPacket(fromBase64);
      } catch (e2) {
        try { req.body = parseClientPacket(JSON.parse(raw.toString('utf8'))); } catch (e3) {}
      }
    }
  } else if (typeof raw === 'string' && raw.length > 0) {
    try {
      const fromBase64 = unwrapRequest(raw.trim());
      req.body = parseClientPacket(fromBase64);
    } catch (e) {
      try { req.body = parseClientPacket(JSON.parse(raw)); } catch (e2) {}
    }
  }
  next();
});

function xorRes(res, data) {
  const json = JSON.stringify(data);
  // Try to send as XOR-only first (compatible with test client)
  res.set('Content-Type', 'application/octet-stream');
  res.send(xorEncode(json));
}

const gameData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'city_data.json'), 'utf8'));
const playerCache = new Map();

const stringDb = {};
try {
  const arStr = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'rlString-ar.json'), 'utf8'));
  arStr.forEach(s => { stringDb[s.id] = s.text; });
} catch (e) {}

let autoPersistTimer = null;
function schedulePersist() {
  if (autoPersistTimer) clearTimeout(autoPersistTimer);
  autoPersistTimer = setTimeout(() => {
    try {
      for (const [id, player] of playerCache) {
        persistPlayer(player);
      }
    } catch(e) { console.error('[DB] auto-persist error:', e.message); }
  }, 5000);
}

function xorRes(res, data) {
  schedulePersist();
  res.set('Content-Type', 'application/octet-stream');
  res.send(xorEncode(JSON.stringify(data)));
}

function getPlayer(req) {
  const { token } = req.body || {};
  if (!token) return null;
  const playerId = DB.findPlayerIdByToken(token);
  if (!playerId) return null;
  if (!playerCache.has(playerId)) {
    const p = DB.findPlayerById(playerId);
    if (p) playerCache.set(playerId, p);
  }
  return playerCache.get(playerId) || null;
}

function persistPlayer(player) {
  if (player && player.id) {
    try { DB.updatePlayer(player); } catch(e) { console.error('[DB] persist error:', e.message); }
  }
}

function ensurePlayer(player) {
  if (!player.completedMissions) player.completedMissions = new Set();
  if (!player.activeMissions) player.activeMissions = G.getInitialMissions();
  if (!player.inventory) player.inventory = [];
  if (!player.dungeonLevel) player.dungeonLevel = 0;
  if (!player.nerve) player.nerve = 100;
  if (!player.energy) player.energy = 100;
  if (!player.health) player.health = 100;
  if (!player.maxHealth) player.maxHealth = 100;
  if (!player.strength) player.strength = 10;
  if (!player.defense) player.defense = 10;
  if (!player.nimble) player.nimble = 10;
  if (!player.speed) player.speed = 10;
  if (!player.endurance) player.endurance = 10;
  if (!player.jail) player.jail = 0;
  if (!player.wanted) player.wanted = 0;
  if (!player.city) player.city = 1;
  if (!player.gold) player.gold = 0;
  return player;
}

// Version check & maintenance endpoints (game expects JSON, not XOR)
app.post(['/', '/checkversion', '/maintenance/check'], (req, res) => {
  console.log(`[VERSION_CHECK] body keys=${Object.keys(req.body||{})} raw=${JSON.stringify(req.body||'')}`);
  res.json({
    reviewVersion: 0,
    majorVersion: 1,
    minorVersion: 1,
    isNew: false,
    heartbeat: 60,
    version: '1.0.0',
    checkversion: 'ok',
    impart: { level: 1 },
    crossPlat: true
  });
});

app.post('/ReqLogin', (req, res) => {
  const { device_id, name } = req.body || {};
  let player = DB.findPlayerByDeviceId(device_id || `dev_${Date.now()}`);
  if (!player) {
    player = DB.createPlayer(device_id || `dev_${Date.now()}`, name || 'Player');
    player = ensurePlayer(player);
    playerCache.set(player.id, player);
  } else {
    ensurePlayer(player);
    playerCache.set(player.id, player);
  }
  const token = `tok_${player.id}_${Date.now()}`;
  DB.saveSession(token, player.id);
  persistPlayer(player);

  xorRes(res, { code: 1, player: { ...G.getPlayerStats(player), session_token: token } });
});

app.post('/ReqDoCrime', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0, msg: 'not logged in' });
  ensurePlayer(player);
  const { crimeType } = req.body || {};
  if (player.nerve < 1) return xorRes(res, { code: 0, msg: 'no nerve', nerve: player.nerve });

  const crimeData = gameData['crime.city']?.records?.find(r => r.lang_id === parseInt(crimeType) || r.id === parseInt(crimeType)) || null;
  const crimeLevel = Math.floor(player.level / 5) + 1;
  const expGain = Math.floor(Math.random() * 20) + 5 + crimeLevel * 2;
  const moneyGain = Math.floor(Math.random() * 50) + 10 + crimeLevel * 5;

  player.nerve -= 1;
  player.experience += expGain;
  player.money += moneyGain;
  player.wanted = Math.min(100, (player.wanted || 0) + 1);

  while (player.experience >= G.calcExpForLevel(player.level)) {
    player.experience -= G.calcExpForLevel(player.level);
    player.level++;
    G.checkMissionLevelUp(player, player.level);
  }

  if (Math.random() < 0.05) {
    player.jail = 30;
    G.finishMissionForPlayer(player, 3);
  }

  G.finishMissionForPlayer(player, 28);
  persistPlayer(player);

  xorRes(res, {
    code: 1, result: 'success', exp: expGain, money: moneyGain,
    player: { level: player.level, money: player.money, experience: player.experience, nerve: player.nerve, wanted: player.wanted, jail: player.jail },
    crimeData: crimeData ? { name: crimeData.name, lang_id: crimeData.lang_id, id: crimeData.id } : null,
  });
});

app.post('/ReqLevelUp', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  const { upLevelNum } = req.body || {};
  const levels = parseInt(upLevelNum) || 1;
  const cost = player.level * 100 * levels;
  if (player.money < cost) return xorRes(res, { code: 0, msg: 'not enough money', need: cost, money: player.money });

  player.money -= cost;
  player.level += levels;
  player.experience = 0;

  xorRes(res, { code: 1, level: player.level, player: { level: player.level, experience: player.experience, money: player.money } });
});

app.post('/ReqStrengthen', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  const { equipType, equipIdx } = req.body || {};
  const cost = player.level * 50;
  if (player.money < cost) return xorRes(res, { code: 0, msg: 'not enough money' });

  player.money -= cost;
  const success = Math.random() < 0.7;
  if (success) {
    player.strength = (player.strength || 10) + 1;
    xorRes(res, { code: 1, isSuccess: true, strength: player.strength, player: G.getPlayerStats(player) });
  } else {
    xorRes(res, { code: 1, isSuccess: false, msg: 'strengthen failed', player: G.getPlayerStats(player) });
  }
});

app.post('/ReqFightNew', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  const { fightType, targetId } = req.body || {};
  const type = parseInt(fightType) || G.FIGHT_TYPES.FIGHT_PVE;

  if (player.health < 10) return xorRes(res, { code: 0, msg: 'health too low', health: player.health });

  const npc = { strength: 8 + player.level * 2, endurance: 8 + player.level, nimble: 8 + Math.floor(player.level / 2), speed: 8 + Math.floor(player.level / 3), weapon: null, equipment: null };
  const opponent = targetId ? { ...npc, strength: npc.strength + 5 } : npc;

  const result = G.simulateFight(player, opponent);
  player.health = Math.max(0, player.health - (100 - result.playerHp));
  player.experience += result.expGain;
  player.money += result.moneyGain;

  while (player.experience >= G.calcExpForLevel(player.level)) {
    player.experience -= G.calcExpForLevel(player.level);
    player.level++;
    G.checkMissionLevelUp(player, player.level);
  }

  if (result.result === G.FIGHT_RESULT.SUCCESS) G.finishMissionForPlayer(player, 27);
  if (result.result === G.FIGHT_RESULT.FAIL && player.health <= 0) { player.health = 10; player.jail = 10; }

  xorRes(res, {
    code: 1, result: result.result, expGain: result.expGain, moneyGain: result.moneyGain,
    fightType: type, player: G.getPlayerStats(player),
  });
});

app.post('/ReqFightCooperateBossNew', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  if (player.energy < 5) return xorRes(res, { code: 0, msg: 'not enough energy' });

  player.energy -= 5;
  const bossHp = 500 + player.level * 50;
  const damage = G.calcDamage(player, { endurance: 30 });
  const reward = Math.floor(bossHp / 10) + player.level * 5;
  player.money += reward;
  player.experience += Math.floor(reward / 2);

  while (player.experience >= G.calcExpForLevel(player.level)) {
    player.experience -= G.calcExpForLevel(player.level);
    player.level++;
    G.checkMissionLevelUp(player, player.level);
  }

  xorRes(res, { code: 1, damage, reward, bossRemainingHp: Math.max(0, bossHp - damage), player: G.getPlayerStats(player) });
});

app.post('/ReqUpdateMoney', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  const { gameType, bet } = req.body || {};
  const betAmount = parseInt(bet) || 100;
  if (player.money < betAmount) return xorRes(res, { code: 0, msg: 'not enough money' });

  const win = Math.random() > 0.45;
  let multiplier = 1;
  const gt = parseInt(gameType) || 1;
  if (gt === 1) multiplier = 2;
  else if (gt === 2) multiplier = 2.5;
  else if (gt === 3) multiplier = 3;
  else if (gt === 4) multiplier = 4;

  if (win) {
    const winnings = Math.floor(betAmount * multiplier);
    player.money += winnings;
    xorRes(res, { code: 1, win: true, gameType: gt, bet: betAmount, winnings, money: player.money });
  } else {
    player.money -= betAmount;
    xorRes(res, { code: 1, win: false, gameType: gt, bet: betAmount, money: player.money });
  }
});

app.post('/ReqExcercise', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  const { excerciseType, attribute } = req.body || {};
  const eType = parseInt(excerciseType);

  if (eType === -1) {
    const cost = 10 + player.level * 5;
    if (player.money < cost) return xorRes(res, { code: 0, msg: 'not enough money' });
    player.money -= cost;
    const happy = 50;
    const energy = player.energy || 100;
    const effect = G.gymEffect(happy, energy);
    const attr = parseInt(attribute) || 0;
    if (attr === 1) player.strength = (player.strength || 10) + 1;
    else if (attr === 2) player.endurance = (player.endurance || 10) + 1;
    else if (attr === 3) player.speed = (player.speed || 10) + 1;
    else if (attr === 4) player.nimble = (player.nimble || 10) + 1;
    else player.strength = (player.strength || 10) + 1;
    player.energy = Math.max(0, (player.energy || 100) - 5);

    G.finishMissionForPlayer(player, 4);
    G.finishMissionForPlayer(player, 23);
    G.finishMissionForPlayer(player, 23);

    xorRes(res, { code: 1, effect: Math.floor(effect), attribute, player: G.getPlayerStats(player) });
  } else if (eType === 1) {
    const resetCost = player.level * 100;
    if (player.money < resetCost) return xorRes(res, { code: 0, msg: 'not enough money' });
    player.money -= resetCost;
    player.strength = 10;
    player.endurance = 10;
    player.speed = 10;
    player.nimble = 10;
    xorRes(res, { code: 1, reset: true, player: G.getPlayerStats(player) });
  } else {
    xorRes(res, { code: 0, msg: 'invalid excercise type' });
  }
});

app.post('/ReqPrisonBail', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  if (!player.jail || player.jail <= 0) return xorRes(res, { code: 0, msg: 'not in jail' });

  const bailCost = 500 + player.level * 100;
  if (player.money < bailCost) return xorRes(res, { code: 0, msg: 'not enough money' });

  player.money -= bailCost;
  player.jail = 0;

  xorRes(res, { code: 1, bailCost, player: G.getPlayerStats(player) });
});

app.post('/ReqPrisonBust', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  if (!player.jail || player.jail <= 0) return xorRes(res, { code: 0, msg: 'not in jail' });
  if (player.health < 30) return xorRes(res, { code: 0, msg: 'health too low' });

  const success = Math.random() < 0.4;
  if (success) {
    player.jail = 0;
    player.health = Math.max(0, player.health - 20);
    xorRes(res, { code: 1, result: 1, player: G.getPlayerStats(player) });
  } else {
    player.health = Math.max(0, player.health - 40);
    xorRes(res, { code: 1, result: 0, player: G.getPlayerStats(player) });
  }
});

app.post('/ReqEnterDungeon', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  const { dungeonId } = req.body || {};
  const dId = parseInt(dungeonId) || 1;
  if (player.energy < 10) return xorRes(res, { code: 0, msg: 'not enough energy' });

  player.energy -= 10;
  player.dungeonLevel = (player.dungeonLevel || 0) + 1;
  const isFirst = player.dungeonLevel === 1 ? 1 : 0;

  G.finishMissionForPlayer(player, 51);

  xorRes(res, { code: 1, dungeonId: dId, isfristEnter: isFirst, dungeonLevel: player.dungeonLevel, player: G.getPlayerStats(player) });
});

app.post('/ReqPassLevel', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  const { dungeonId, result } = req.body || {};
  const r = parseInt(result) || 1;

  if (r === 1) {
    const expGain = 50 + (player.dungeonLevel || 0) * 10;
    const moneyGain = 100 + (player.dungeonLevel || 0) * 20;
    player.experience += expGain;
    player.money += moneyGain;

    while (player.experience >= G.calcExpForLevel(player.level)) {
      player.experience -= G.calcExpForLevel(player.level);
      player.level++;
      G.checkMissionLevelUp(player, player.level);
    }

    xorRes(res, { code: 1, result: 1, expGain, moneyGain, player: G.getPlayerStats(player) });
  } else {
    xorRes(res, { code: 1, result: 0, player: G.getPlayerStats(player) });
  }
});

app.post('/ReqApplySubject', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  const { subjectId } = req.body || {};
  const cost = 200 + player.level * 30;
  if (player.money < cost) return xorRes(res, { code: 0, msg: 'not enough money' });
  if (player.energy < 5) return xorRes(res, { code: 0, msg: 'not enough energy' });

  player.money -= cost;
  player.energy -= 5;
  player.experience += 30 + Math.floor(player.level * 1.5);
  player.strength = (player.strength || 10) + 1;

  while (player.experience >= G.calcExpForLevel(player.level)) {
    player.experience -= G.calcExpForLevel(player.level);
    player.level++;
    G.checkMissionLevelUp(player, player.level);
  }

  xorRes(res, { code: 1, subjectId: parseInt(subjectId) || 1, player: G.getPlayerStats(player) });
});

app.post('/ReqGetSalery', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  const jobCate = player.job;
  const jobLvl = player.jobLevel || 0;
  let salary = player.level * 50;
  if (jobCate && G.JOB_SALARIES[jobCate]) {
    salary = G.JOB_SALARIES[jobCate][Math.min(jobLvl, 5)] || player.level * 50;
  }
  player.money += salary;

  G.finishMissionForPlayer(player, 1);

  xorRes(res, { code: 1, salary, money: player.money, player: G.getPlayerStats(player) });
});

app.post('/ReqSubmitNews', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  const { newsContent } = req.body || {};
  const cost = 50 + player.level * 10;
  if (player.money < cost) return xorRes(res, { code: 0, msg: 'not enough money' });

  player.money -= cost;
  player.wanted = Math.min(100, (player.wanted || 0) + 5);

  xorRes(res, { code: 1, published: true, content: newsContent || '', player: G.getPlayerStats(player) });
});

app.post('/ReqRewardLoser', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  const { targetId, fate } = req.body || {};
  const f = parseInt(fate) || 1;

  if (player.energy < 3) return xorRes(res, { code: 0, msg: 'not enough energy' });
  player.energy -= 3;

  const reward = player.level * 20;
  player.money += reward;
  player.experience += Math.floor(reward / 2);

  if (f === 2) {
    G.finishMissionForPlayer(player, 15);
  }

  while (player.experience >= G.calcExpForLevel(player.level)) {
    player.experience -= G.calcExpForLevel(player.level);
    player.level++;
    G.checkMissionLevelUp(player, player.level);
  }

  xorRes(res, { code: 1, fate: f, reward, player: G.getPlayerStats(player) });
});

app.post('/ReqMergeGoods', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  const { mergeType, itemId, amount } = req.body || {};
  const mType = parseInt(mergeType) || 0;

  if (mType === 0) {
    if (player.money < 100) return xorRes(res, { code: 0, msg: 'not enough money' });
    player.money -= 100;
    player.experience += 50;
    G.finishMissionForPlayer(player, 54);
  } else if (mType === 1) {
    if (player.gold < 1) return xorRes(res, { code: 0, msg: 'not enough gold' });
    player.gold -= 1;
    player.money += 10000;
  } else if (mType === 2) {
    if (player.money < 1000) return xorRes(res, { code: 0, msg: 'not enough money' });
    player.money -= 1000;
    player.experience += 200;
  } else if (mType === 3) {
    if (player.experience < 500) return xorRes(res, { code: 0, msg: 'not enough exp' });
    player.experience -= 500;
    player.level++;
  }

  while (player.experience >= G.calcExpForLevel(player.level)) {
    player.experience -= G.calcExpForLevel(player.level);
    player.level++;
  }

  xorRes(res, { code: 1, mergeType: mType, player: G.getPlayerStats(player) });
});

app.post('/ReqChatPost', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  const { chatType, message } = req.body || {};
  const cType = parseInt(chatType) || 0;
  const cost = cType === 0 ? 50 : 10;
  if (player.money < cost) return xorRes(res, { code: 0, msg: 'not enough money' });

  player.money -= cost;
  DB.addChat(player.id, player.name, cType, message || '');

  if (cType === 0) G.finishMissionForPlayer(player, 21);

  xorRes(res, { code: 1, chatType: cType, posted: true, player: G.getPlayerStats(player) });
});

app.post('/ReqFactionLoser', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  if (!player.faction) return xorRes(res, { code: 0, msg: 'not in a faction' });

  const consisNum = parseInt(req.body?.consisNum) || 0;
  player.money += 100 + consisNum * 10;
  player.experience += 20 + consisNum * 2;

  while (player.experience >= G.calcExpForLevel(player.level)) {
    player.experience -= G.calcExpForLevel(player.level);
    player.level++;
  }

  xorRes(res, { code: 1, consisNum, player: G.getPlayerStats(player) });
});

app.post('/ReqFactionJoinMilitia', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  if (!player.faction) return xorRes(res, { code: 0, msg: 'not in a faction' });
  const { localTroopIdx } = req.body || {};
  const troopIdx = parseInt(localTroopIdx) || 0;

  if (player.energy < 5) return xorRes(res, { code: 0, msg: 'not enough energy' });
  player.energy -= 5;
  player.strength = (player.strength || 10) + 1;

  xorRes(res, { code: 1, localTroopIdx: troopIdx, player: G.getPlayerStats(player) });
});

app.post('/ReqFlyTo', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  const { cityId } = req.body || {};
  const targetCity = parseInt(cityId) || 0;

  const cost = 100 + player.level * 10;
  if (player.money < cost) return xorRes(res, { code: 0, msg: 'not enough money' });

  player.money -= cost;
  player.city = targetCity;

  G.finishMissionForPlayer(player, 36);

  xorRes(res, { code: 1, cityId: targetCity, player: G.getPlayerStats(player) });
});

app.post('/ReqFAFightInfo', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  if (player.energy < 5) return xorRes(res, { code: 0, msg: 'not enough energy' });

  player.energy -= 5;
  const power = G.calcFightPower(player);
  const opponentPower = power * (0.8 + Math.random() * 0.4);
  const win = power > opponentPower;

  if (win) {
    const reward = Math.floor(50 + player.level * 10);
    player.money += reward;
    player.experience += Math.floor(reward / 2);
  }

  while (player.experience >= G.calcExpForLevel(player.level)) {
    player.experience -= G.calcExpForLevel(player.level);
    player.level++;
  }

  xorRes(res, { code: 1, win, power: Math.floor(power), opponentPower: Math.floor(opponentPower), player: G.getPlayerStats(player) });
});

app.post('/ReqLadderFighterJudgeNew', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  if (player.energy < 3) return xorRes(res, { code: 0, msg: 'not enough energy' });

  player.energy -= 3;
  const result = G.simulateFight(player, { strength: 12 + player.level * 2, endurance: 10 + player.level, nimble: 8 + Math.floor(player.level / 2), speed: 8 + Math.floor(player.level / 2), weapon: null, equipment: null });
  player.experience += result.expGain;
  player.money += result.moneyGain;

  while (player.experience >= G.calcExpForLevel(player.level)) {
    player.experience -= G.calcExpForLevel(player.level);
    player.level++;
  }

  if (result.result === G.FIGHT_RESULT.SUCCESS) G.finishMissionForPlayer(player, 52);

  xorRes(res, { code: 1, result: result.result, ...result, player: G.getPlayerStats(player) });
});

app.post('/ReqPlayerInfo', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  xorRes(res, { code: 1, player: G.getPlayerStats(player) });
});

app.post('/ReqGetMissionInfo', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  xorRes(res, {
    code: 1,
    currentMissionId: G.getCurMissionId(player),
    completedMissions: [...(player.completedMissions || [])].map(Number),
    missions: G.getAllMissions(),
  });
});

app.post('/ReqJoinJob', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  const { jobType } = req.body || {};
  const jt = parseInt(jobType);
  if (!jt || !G.JOB_SALARIES[jt]) return xorRes(res, { code: 0, msg: 'invalid job type' });

  player.job = jt;
  player.jobLevel = 1;

  G.finishMissionForPlayer(player, 1);

  xorRes(res, { code: 1, job: jt, jobLevel: 1, player: G.getPlayerStats(player) });
});

app.post('/ReqBuyGood', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  const { goodType, goodCate, amount } = req.body || {};
  const a = parseInt(amount) || 1;
  const price = 50 + player.level * 5;
  const total = price * a;
  if (player.money < total) return xorRes(res, { code: 0, msg: 'not enough money' });

  player.money -= total;
  for (let i = 0; i < a; i++) {
    player.inventory.push({ type: parseInt(goodType) || 708, cate: parseInt(goodCate) || 5 });
  }

  const gt = parseInt(goodType) || 0;
  const gc = parseInt(goodCate) || 0;
  if (gt === 708 && gc === 5) G.finishMissionForPlayer(player, 2);
  if (gc === 0) G.finishMissionForPlayer(player, 11);
  if (gc === 1) G.finishMissionForPlayer(player, 13);
  if (gc === 4 && gt === 663) G.finishMissionForPlayer(player, 37);
  if (gc === 2 && gt === 509) G.finishMissionForPlayer(player, 39);
  if (gc === 2 && gt === 507) G.finishMissionForPlayer(player, 41);

  xorRes(res, { code: 1, goodType: gt, goodCate: gc, amount: a, totalCost: total, player: G.getPlayerStats(player) });
});

app.post('/ReqSellGood', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  const { goodType, goodCate, amount, sellType } = req.body || {};
  const a = parseInt(amount) || 1;
  const price = Math.floor((30 + player.level * 3) / 2);
  const total = price * a;

  if (player.inventory.filter(i => i.type === parseInt(goodType) && i.cate === parseInt(goodCate)).length < a) {
    return xorRes(res, { code: 0, msg: 'not enough items' });
  }
  let removed = 0;
  player.inventory = player.inventory.filter(i => {
    if (removed < a && i.type === parseInt(goodType) && i.cate === parseInt(goodCate)) { removed++; return false; }
    return true;
  });
  player.money += total;

  const st = parseInt(sellType) || 0;
  if (st === 1) G.finishMissionForPlayer(player, 22);
  if (st === 0 && goodCate == 4 && goodType == 663) G.finishMissionForPlayer(player, 38);
  if (st === 1 && goodCate == 2 && goodType == 507) G.finishMissionForPlayer(player, 42);

  xorRes(res, { code: 1, sold: true, totalPrice: total, player: G.getPlayerStats(player) });
});

app.post('/ReqUseEquipment', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  const { useType, equipIdx } = req.body || {};
  const ut = parseInt(useType) || G.EQUIP_USE_TYPE.WEAPON;

  if (ut === G.EQUIP_USE_TYPE.WEAPON) { player.weapon = parseInt(equipIdx) || 1; G.finishMissionForPlayer(player, 12); }
  else if (ut === G.EQUIP_USE_TYPE.ARMOR) { player.equipment = parseInt(equipIdx) || 1; G.finishMissionForPlayer(player, 14); }
  else if (ut === G.EQUIP_USE_TYPE.MOUNT) { player.mount = parseInt(equipIdx) || 1; }

  xorRes(res, { code: 1, useType: ut, equipIdx: parseInt(equipIdx) || 0, player: G.getPlayerStats(player) });
});

app.post('/ReqHospitalCure', (req, res) => {
  const player = getPlayer(req);
  if (!player) return xorRes(res, { code: 0 });
  ensurePlayer(player);
  const { cureType } = req.body || {};
  const ct = parseInt(cureType) || 0;
  const cost = player.level * 20;

  if (player.money < cost) return xorRes(res, { code: 0, msg: 'not enough money' });
  player.money -= cost;
  player.health = player.maxHealth;

  if (ct === 0) G.finishMissionForPlayer(player, 8);
  if (ct === 1) G.finishMissionForPlayer(player, 10);

  xorRes(res, { code: 1, cureType: ct, player: G.getPlayerStats(player) });
});

const BUILDING_DEFS = {
  0: { name:'قمار', panel:'casino', icon:'🎰' },
  1: { name:'مستشفى', panel:'hospital', icon:'🏥' },
  2: { name:'سجن', panel:'prison', icon:'⛓️' },
  3: { name:'قتال', panel:'fight', icon:'⚔️' },
  4: { name:'تاووباو', panel:'shop', icon:'🏪' },
  5: { name:'بنك', panel:'bank', icon:'🏦' },
  6: { name:'أسهم', panel:'stock', icon:'📈' },
  7: { name:'حكومة', panel:'gov', icon:'🏛️' },
  8: { name:'سوق', panel:'shop', icon:'🛒' },
  9: { name:'وظيفة', panel:'job', icon:'💼' },
  10: { name:'مطار', panel:'airport', icon:'✈️' },
  11: { name:'نادي رياضي', panel:'gym', icon:'💪' },
  12: { name:'فصيل', panel:'faction', icon:'🚩' },
  13: { name:'سوق أسود', panel:'shop', icon:'🕶️' },
  14: { name:'عقارات', panel:'property', icon:'🏠' },
  15: { name:'زواج', panel:'marry', icon:'💍' },
  16: { name:'مدرسة', panel:'school', icon:'📚' },
  18: { name:'سموم', panel:'hospital', icon:'💊' },
  19: { name:'سلم قتال', panel:'ladder', icon:'🥊' },
  20: { name:'أقبية', panel:'dungeon', icon:'🕳️' },
  21: { name:'تقوية', panel:'strengthen', icon:'🔧' },
  22: { name:'مزاد', panel:'auction', icon:'🔨' },
};

const CITY_BUILDINGS = {
  city: [1,3,5,7,8,9,10,11,16,19,20,2],
  nanfei: [1,3,7,8,9,10,11,14,2],
  xianggang: [0,1,3,5,6,7,8,9,10,11,14,2],
  aiji: [1,2,3,8,9,10,11,14,2],
  moxige: [0,1,3,5,7,8,9,10,11,14,2],
  usa: [1,3,5,7,8,9,10,11,19,20,4,2],
  baxi: [1,3,5,7,8,9,10,11,14,2],
  riben: [0,1,3,4,7,8,9,10,11,5,14,19,22,2],
  helan: [1,3,5,7,8,9,10,11,2],
  luoma: [0,1,3,5,7,8,9,10,11,14,2],
  shengcheng: [1,3,7,8,9,10,11,2],
  qiongzhou: [1,3,5,7,8,9,10,11,2],
};

// Building positions on the city@2x.png map (1024x1007)
const CITY_MAP_BUILDINGS = [
  { id:1, x:160, y:280, panel:'hospital' },   // مستشفى
  { id:3, x:260, y:170, panel:'fight' },       // قتال
  { id:5, x:60, y:380, panel:'bank' },         // بنك
  { id:7, x:450, y:140, panel:'gov' },         // حكومة
  { id:8, x:550, y:260, panel:'shop' },        // سوق
  { id:9, x:340, y:350, panel:'job' },         // وظيفة
  { id:10, x:700, y:460, panel:'airport' },    // مطار
  { id:11, x:850, y:290, panel:'gym' },        // نادي رياضي
  { id:16, x:430, y:470, panel:'school' },     // مدرسة
  { id:19, x:120, y:520, panel:'ladder' },     // سلم قتال
  { id:20, x:290, y:550, panel:'dungeon' },    // أقبية
  { id:2, x:620, y:400, panel:'prison' },      // سجن
  { id:4, x:480, y:330, panel:'shop' },        // تاووباو
  { id:6, x:740, y:180, panel:'stock' },       // أسهم
  { id:0, x:80, y:200, panel:'casino' },       // قمار
  { id:14, x:200, y:440, panel:'property' },   // عقارات
  { id:12, x:900, y:400, panel:'faction' },    // فصيل
  { id:13, x:150, y:160, panel:'shop' },       // سوق أسود
  { id:15, x:820, y:180, panel:'marry' },      // زواج
  { id:18, x:510, y:520, panel:'hospital' },   // سموم
  { id:21, x:680, y:340, panel:'strengthen' }, // تقوية
  { id:22, x:380, y:250, panel:'auction' },    // مزاد
];

function getCitiesWithBuildings() {
  const cities = gameData['cities.city'];
  if (!cities || !cities.records) return [];
  const named = cities.records.filter(r => r.name);
  return named.map(c => ({
    id: c.id, name: c.name, langId: c.lang_id,
    buildings: (CITY_BUILDINGS[c.name] || [1,3,8,9,10,11]).map(b => {
      const def = BUILDING_DEFS[b];
      return { id: b, name: def ? def.name : 'مبنى', panel: def ? def.panel : '' };
    }),
  }));
}

app.get('/api/city-data', (req, res) => res.json(gameData));
app.get('/api/cities', (req, res) => res.json(getCitiesWithBuildings()));
app.get('/api/buildings', (req, res) => {
  const mapBuildings = CITY_MAP_BUILDINGS.map(b => {
    const def = BUILDING_DEFS[b.id];
    return {
      id: b.id,
      name: def ? def.name : 'مبنى',
      icon: def ? def.icon : '🏢',
      mapX: b.x, mapY: b.y,
      panel: def ? def.panel : '',
    };
  });
  res.json({ background: 'city_bg.png', width: 1024, height: 1007, buildings: mapBuildings });
});
app.get('/api/city-data/:file', (req, res) => {
  const data = gameData[req.params.file];
  if (!data) return res.status(404).json({ error: 'not found' });
  res.json(data);
});
app.get('/api/players', (req, res) => {
  res.json(DB.getAllPlayers());
});
app.get('/api/chats', (req, res) => res.json(DB.getRecentChats(50)));
app.get('/health', (req, res) => res.json({ status: 'ok', players: playerCache.size, uptime: process.uptime() }));
app.get('/debug/sessions', (req, res) => { try { const data = DB.debugSessions(); res.json(data); } catch(e) { res.json({error: e.message}); } });
app.all('/debug/lookup', (req, res) => {
  const t = req.query.token || req.body?.token || '';
  const result = DB.findPlayerIdByToken(t);
  const stmt2 = DB.getDb().prepare('SELECT player_id FROM sessions WHERE token = ?');
  stmt2.bind([t]);
  const stepResult = stmt2.step();
  const row = stepResult ? stmt2.getAsObject() : null;
  stmt2.free();
  res.json({ inputToken: t, findResult: result, directStep: stepResult, directRow: row });
});

process.on('SIGINT', () => {
  console.log('[DB] Persisting all players before exit...');
  for (const [id, player] of playerCache) { persistPlayer(player); }
  DB.save();
  process.exit(0);
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message, err.stack);
  xorRes(res, { code: 0, msg: 'internal server error' });
});

DB.initDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`وكر الأوغاد server running on port ${PORT}`);
    console.log(`Game data loaded: ${Object.keys(gameData).length} .city files`);
    console.log(`Endpoints: 22 HTTP handlers + REST + health`);
  });
}).catch(e => {
  console.error('Failed to init database:', e);
  process.exit(1);
});
