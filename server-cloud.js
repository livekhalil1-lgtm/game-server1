const express = require('express');
const path = require('path');
const { xorEncode, xorDecode, base64Encode, base64Decode, unwrapRequest, parseClientPacket } = require('./protocol');
const G = require('./game-logic');
const FB = require('./firebase-db');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 8080;

app.use(express.raw({ type: 'application/octet-stream', limit: '10mb' }));
app.use(express.text({ type: 'text/plain', limit: '10mb' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const raw = req.body;
  if (!raw) return next();
  req.useXor = false;
  if (Buffer.isBuffer(raw) && raw.length > 0) {
    try {
      const decrypted = xorDecode(raw);
      req.body = parseClientPacket(JSON.parse(decrypted));
      req.useXor = true;
    } catch (e) {
      try {
        const asText = raw.toString('utf8').trim();
        const fromBase64 = unwrapRequest(asText);
        req.body = parseClientPacket(fromBase64);
        req.useXor = true;
      } catch (e2) {
        try { req.body = parseClientPacket(JSON.parse(raw.toString('utf8'))); } catch (e3) {}
      }
    }
  } else if (typeof raw === 'string') {
    try {
      const fromBase64 = unwrapRequest(raw);
      req.body = parseClientPacket(fromBase64);
      req.useXor = true;
    } catch (e) {
      try { req.body = parseClientPacket(JSON.parse(raw)); } catch (e2) {}
    }
  } else if (typeof raw === 'object') {
    try { req.body = parseClientPacket(raw); } catch (e) {}
  }
  next();
});

function respond(req, res, data) {
  if (req.useXor) {
    res.type('application/octet-stream');
    res.send(xorEncode(JSON.stringify(data)));
  } else {
    res.json(data);
  }
}

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  respond(req, res, { code: 0, msg: 'Server error' });
});

async function getPlayer(token) {
  if (!token) return null;
  const pid = await FB.findPlayerIdByToken(token);
  if (!pid) return null;
  return await FB.findPlayerById(pid.player_id);
}

async function savePlayer(player) {
  try { await FB.updatePlayer(player.id, player); } catch (e) { console.error('[FB] save error:', e.message); }
}

function freshPlayerData(p) {
  if (!p || !p.id) return p;
  const { id, ...rest } = p;
  return rest;
}

async function getFreshPlayer(player) {
  const p = await FB.findPlayerById(player.id);
  return freshPlayerData(p);
}

// Version check
app.post(['/', '/checkversion', '/maintenance/check'], (req, res) => {
  respond(req, res, { reviewVersion: 0, majorVersion: 1, minorVersion: 1, isNew: false, heartbeat: 60, version: '1.0.0', checkversion: 'ok', impart: { level: 1 }, crossPlat: true });
});

// --- Game endpoints ---

app.post('/ReqLogin', async (req, res) => {
  try {
    const { device_id, name } = req.body;
    let player = await FB.findPlayerByName(name || 'Player');
    if (!player) {
      player = await FB.createPlayer(name || 'Player');
    }
    const sessionToken = 'tok_' + player.id + '_' + Date.now();
    await FB.updatePlayer(player.id, { session_token: sessionToken });
    const pd = freshPlayerData(player);
    pd.session_token = sessionToken;
    respond(req, res, { code: 1, sessionToken, session_token: sessionToken, player: pd });
  } catch (e) { console.error(e); respond(req, res, { code: 0, msg: 'Login error' }); }
});

app.post('/ReqDoCrime', async (req, res) => {
  const { token, crimeType } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  if (player.jail > 0) return respond(req, res, { code: 0, msg: 'مسجون!' });
  if (player.nerve < 1) return respond(req, res, { code: 0, msg: 'ما عندك أعصاب' });

  player.nerve = (player.nerve || 100) - 1;
  player.experience = (player.experience || 0) + Math.floor(Math.random() * 20) + 10;
  player.money = (player.money || 0) + Math.floor(Math.random() * 50) + 20;
  player.wanted = Math.min(100, (player.wanted || 0) + 1);
  if (Math.random() < 0.05) player.jail = 30;
  while (player.experience >= G.calcExpForLevel(player.level)) { player.experience -= G.calcExpForLevel(player.level); player.level++; }
  await savePlayer(player);
  respond(req, res, { code: 1, result: 'success', exp: 20, money: 30, player: await getFreshPlayer(player) });
});

app.post('/ReqFightNew', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  if (player.health < 10) return respond(req, res, { code: 0, msg: 'صحتك ضعيفة' });

  const result = G.simulateFight(player, { strength: 8 + player.level * 2, endurance: 8 + player.level, nimble: 8, speed: 8, weapon: null, equipment: null });
  player.health = Math.max(1, player.health - (100 - result.playerHp));
  player.experience = (player.experience || 0) + result.expGain;
  player.money = (player.money || 0) + result.moneyGain;
  if (result.result === G.FIGHT_RESULT.FAIL && player.health <= 0) { player.health = 10; player.jail = 10; }
  while (player.experience >= G.calcExpForLevel(player.level)) { player.experience -= G.calcExpForLevel(player.level); player.level++; }
  await savePlayer(player);
  respond(req, res, { code: 1, result: result.result, expGain: result.expGain, moneyGain: result.moneyGain, player: await getFreshPlayer(player) });
});

app.post('/ReqExcercise', async (req, res) => {
  const { token, excerciseType, attribute } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  if (player.energy < 5) return respond(req, res, { code: 0, msg: 'ما عندك طاقة' });

  player.energy -= 5;
  const cost = 10 + player.level * 5;
  if ((player.money || 0) < cost) return respond(req, res, { code: 0, msg: 'ما فيه فلوس' });
  player.money -= cost;
  const attrMap = { 1: 'strength', 2: 'endurance', 3: 'speed', 4: 'nimble' };
  const a = attrMap[parseInt(attribute)];
  if (a) player[a] = (player[a] || 10) + 1;
  await savePlayer(player);
  respond(req, res, { code: 1, player: await getFreshPlayer(player) });
});

app.post('/ReqUpdateMoney', async (req, res) => {
  const { token, gameType, bet } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  const betAmount = parseInt(bet) || 100;
  if ((player.money || 0) < betAmount) return respond(req, res, { code: 0, msg: 'ما فيه فلوس' });

  const multipliers = { 1: 2, 2: 2.5, 3: 3, 4: 4 };
  const mult = multipliers[parseInt(gameType)] || 2;
  const win = Math.random() < 0.45;
  if (win) { player.money += Math.floor(betAmount * mult); } else { player.money -= betAmount; }
  await savePlayer(player);
  respond(req, res, { code: 1, win, gameType: parseInt(gameType) || 1, bet: betAmount, winnings: win ? Math.floor(betAmount * mult) : 0, money: player.money });
});

app.post('/ReqLevelUp', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  const cost = player.level * 100;
  if ((player.money || 0) < cost) return respond(req, res, { code: 0, msg: 'ما فيه فلوس' });
  player.money -= cost;
  player.level++;
  player.experience = 0;
  await savePlayer(player);
  respond(req, res, { code: 1, level: player.level, player: await getFreshPlayer(player) });
});

app.post('/ReqJoinJob', async (req, res) => {
  const { token, jobType } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  const jt = parseInt(jobType);
  if (!G.JOB_SALARIES[jt]) return respond(req, res, { code: 0, msg: 'وظيفة غير صحيحة' });
  player.job = jt;
  player.jobLevel = 1;
  await savePlayer(player);
  respond(req, res, { code: 1, job: jt, jobLevel: 1, player: await getFreshPlayer(player) });
});

app.post('/ReqBuyGood', async (req, res) => {
  const { token, goodType, goodCate, amount } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  const a = parseInt(amount) || 1;
  const price = (50 + player.level * 5) * a;
  if ((player.money || 0) < price) return respond(req, res, { code: 0, msg: 'ما فيه فلوس' });
  player.money -= price;
  await savePlayer(player);
  respond(req, res, { code: 1, goodType: parseInt(goodType) || 0, goodCate: parseInt(goodCate) || 0, amount: a, totalCost: price, player: await getFreshPlayer(player) });
});

app.post('/ReqSellGood', async (req, res) => {
  const { token, goodType, goodCate, amount } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  const a = parseInt(amount) || 1;
  const price = Math.floor((30 + player.level * 3) / 2) * a;
  player.money = (player.money || 0) + price;
  await savePlayer(player);
  respond(req, res, { code: 1, sold: true, totalPrice: price, player: await getFreshPlayer(player) });
});

app.post('/ReqUseEquipment', async (req, res) => {
  const { token, useType, equipIdx } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  const ut = parseInt(useType) || G.EQUIP_USE_TYPE.WEAPON;
  if (ut === G.EQUIP_USE_TYPE.WEAPON) player.weapon = parseInt(equipIdx) || 1;
  else if (ut === G.EQUIP_USE_TYPE.ARMOR) player.equipment = parseInt(equipIdx) || 1;
  else if (ut === G.EQUIP_USE_TYPE.MOUNT) player.mount = parseInt(equipIdx) || 1;
  await savePlayer(player);
  respond(req, res, { code: 1, useType: ut, equipIdx: parseInt(equipIdx) || 0, player: await getFreshPlayer(player) });
});

app.post('/ReqHospitalCure', async (req, res) => {
  const { token, cureType } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  const cost = player.level * 20;
  if ((player.money || 0) < cost) return respond(req, res, { code: 0, msg: 'ما فيه فلوس' });
  player.money -= cost;
  player.health = player.maxHealth || 100;
  await savePlayer(player);
  respond(req, res, { code: 1, cureType: parseInt(cureType) || 0, cost, player: await getFreshPlayer(player) });
});

app.post('/ReqEnterDungeon', async (req, res) => {
  const { token, dungeonId } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  if (player.energy < 10) return respond(req, res, { code: 0, msg: 'ما عندك طاقة' });
  player.energy -= 10;
  player.dungeonLevel = (player.dungeonLevel || 0) + 1;
  await savePlayer(player);
  respond(req, res, { code: 1, dungeonId: parseInt(dungeonId) || 1, isfristEnter: player.dungeonLevel === 1 ? 1 : 0, dungeonLevel: player.dungeonLevel, player: await getFreshPlayer(player) });
});

app.post('/ReqPassLevel', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  const expGain = 50 + (player.dungeonLevel || 0) * 10;
  const moneyGain = 100 + (player.dungeonLevel || 0) * 20;
  player.experience = (player.experience || 0) + expGain;
  player.money = (player.money || 0) + moneyGain;
  while (player.experience >= G.calcExpForLevel(player.level)) { player.experience -= G.calcExpForLevel(player.level); player.level++; }
  await savePlayer(player);
  respond(req, res, { code: 1, result: 1, expGain, moneyGain, player: await getFreshPlayer(player) });
});

app.post('/ReqApplySubject', async (req, res) => {
  const { token, subjectId } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  const cost = 200 + player.level * 30;
  if ((player.money || 0) < cost) return respond(req, res, { code: 0, msg: 'ما فيه فلوس' });
  if (player.energy < 5) return respond(req, res, { code: 0, msg: 'ما عندك طاقة' });
  player.money -= cost;
  player.energy -= 5;
  player.experience = (player.experience || 0) + 30 + Math.floor(player.level * 1.5);
  player.strength = (player.strength || 10) + 1;
  while (player.experience >= G.calcExpForLevel(player.level)) { player.experience -= G.calcExpForLevel(player.level); player.level++; }
  await savePlayer(player);
  respond(req, res, { code: 1, subjectId: parseInt(subjectId) || 1, player: await getFreshPlayer(player) });
});

app.post('/ReqGetSalery', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  if (!player.job) return respond(req, res, { code: 0, msg: 'ما عندك وظيفة' });
  let salary = player.level * 50;
  if (G.JOB_SALARIES[player.job]) salary = G.JOB_SALARIES[player.job][Math.min(player.jobLevel || 0, 5)] || salary;
  player.money = (player.money || 0) + salary;
  await savePlayer(player);
  respond(req, res, { code: 1, salary, player: await getFreshPlayer(player) });
});

app.post('/ReqSubmitNews', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  const cost = 50 + player.level * 10;
  if ((player.money || 0) < cost) return respond(req, res, { code: 0, msg: 'ما فيه فلوس' });
  player.money -= cost;
  player.wanted = Math.min(100, (player.wanted || 0) + 5);
  await savePlayer(player);
  respond(req, res, { code: 1, published: true, player: await getFreshPlayer(player) });
});

app.post('/ReqRewardLoser', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  const reward = player.level * 20;
  player.money = (player.money || 0) + reward;
  player.experience = (player.experience || 0) + Math.floor(reward / 2);
  await savePlayer(player);
  respond(req, res, { code: 1, reward, player: await getFreshPlayer(player) });
});

app.post('/ReqMergeGoods', async (req, res) => {
  const { token, mergeType } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  const mt = parseInt(mergeType) || 0;
  if (mt === 0 && (player.money || 0) >= 100) { player.money -= 100; }
  else if (mt === 1 && (player.gold || 0) >= 1) { player.gold -= 1; player.money = (player.money || 0) + 10000; }
  else if (mt === 2 && (player.money || 0) >= 1000) { player.money -= 1000; }
  else if (mt === 3 && (player.experience || 0) >= 500) { player.experience -= 500; player.level++; }
  await savePlayer(player);
  respond(req, res, { code: 1, mergeType: mt, player: await getFreshPlayer(player) });
});

app.post('/ReqChatPost', async (req, res) => {
  const { token, chatType, message } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  const cost = (parseInt(chatType) || 0) === 0 ? 50 : 10;
  if ((player.money || 0) < cost) return respond(req, res, { code: 0, msg: 'ما فيه فلوس' });
  player.money -= cost;
  await savePlayer(player);
  try { await FB.saveChat({ player_name: player.name, message: message || '' }); } catch(e) {}
  respond(req, res, { code: 1, chatType: parseInt(chatType) || 0, posted: true, player: await getFreshPlayer(player) });
});

app.post('/ReqStrengthen', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  const cost = player.level * 50;
  if ((player.money || 0) < cost) return respond(req, res, { code: 0, msg: 'ما فيه فلوس' });
  player.money -= cost;
  const success = Math.random() < 0.7;
  if (success) player.strength = (player.strength || 10) + 1;
  await savePlayer(player);
  respond(req, res, { code: 1, isSuccess: success, player: await getFreshPlayer(player) });
});

app.post('/ReqFightCooperateBossNew', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  if (player.energy < 5) return respond(req, res, { code: 0, msg: 'ما عندك طاقة' });
  player.energy -= 5;
  const damage = 50 + Math.floor(Math.random() * 100);
  const reward = 100 + player.level * 5;
  player.money = (player.money || 0) + reward;
  await savePlayer(player);
  respond(req, res, { code: 1, damage, reward, player: await getFreshPlayer(player) });
});

app.post('/ReqFlyTo', async (req, res) => {
  const { token, cityId } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  const cost = 100 + player.level * 10;
  if ((player.money || 0) < cost) return respond(req, res, { code: 0, msg: 'ما فيه فلوس' });
  player.money -= cost;
  player.city = parseInt(cityId) || 0;
  await savePlayer(player);
  respond(req, res, { code: 1, cityId: parseInt(cityId) || 0, player: await getFreshPlayer(player) });
});

app.post('/ReqFactionLoser', async (req, res) => respond(req, res, { code: 1, player: {} }));
app.post('/ReqFactionJoinMilitia', async (req, res) => respond(req, res, { code: 1 }));
app.post('/ReqFAFightInfo', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  if (player.energy < 5) return respond(req, res, { code: 0, msg: 'ما عندك طاقة' });
  player.energy -= 5;
  const power = G.calcFightPower(player);
  const win = power > (power * (0.8 + Math.random() * 0.4));
  if (win) { player.money = (player.money || 0) + Math.floor(50 + player.level * 10); }
  await savePlayer(player);
  respond(req, res, { code: 1, win, power: Math.floor(power), player: await getFreshPlayer(player) });
});
app.post('/ReqLadderFighterJudgeNew', async (req, res) => respond(req, res, { code: 1, rank: 100, score: 0, player: {} }));
app.post('/ReqPrisonBail', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  if (!player.jail || player.jail <= 0) return respond(req, res, { code: 0, msg: 'ما انت مسجون' });
  const bailCost = 500 + player.level * 100;
  if ((player.money || 0) < bailCost) return respond(req, res, { code: 0, msg: 'ما فيه فلوس' });
  player.money -= bailCost;
  player.jail = 0;
  await savePlayer(player);
  respond(req, res, { code: 1, bailCost, player: await getFreshPlayer(player) });
});
app.post('/ReqPrisonBust', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  if (!player.jail || player.jail <= 0) return respond(req, res, { code: 0, msg: 'ما انت مسجون' });
  const success = Math.random() < 0.4;
  if (success) { player.jail = 0; player.health = Math.max(0, (player.health || 100) - 20); }
  else { player.health = Math.max(0, (player.health || 100) - 40); }
  await savePlayer(player);
  respond(req, res, { code: 1, result: success ? 1 : 0, player: await getFreshPlayer(player) });
});
app.post('/ReqPlayerInfo', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return respond(req, res, { code: 0 });
  respond(req, res, { code: 1, player: freshPlayerData(player) });
});
app.post('/ReqGetMissionInfo', async (req, res) => {
  const p = await getPlayer(req.body?.token);
  respond(req, res, { code: 1, currentMissionId: 1, completedMissions: [], missions: G.getAllMissions() });
});

// === REST endpoints (plain JSON for web UI) ===
app.get('/api/chats', async (req, res) => res.json(await FB.getRecentChats(50)));
app.get('/health', (req, res) => res.json({ status: 'ok', db: 'firebase', project: 'wogad-game' }));

async function start() {
  try {
    await FB.init();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`وكر الأوغاد [Cloud] running on port ${PORT}`);
      console.log(`Firebase: wogad-game | Firestore: connected`);
    });
  } catch (e) {
    console.error('Firebase init failed:', e.message);
    process.exit(1);
  }
}
start();
