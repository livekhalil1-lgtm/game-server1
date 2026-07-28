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
  } else if (typeof raw === 'string') {
    try {
      const fromBase64 = unwrapRequest(raw);
      req.body = parseClientPacket(fromBase64);
    } catch (e) {
      try { req.body = parseClientPacket(JSON.parse(raw)); } catch (e2) {}
    }
  } else if (typeof raw === 'object') {
    try { req.body = parseClientPacket(raw); } catch (e) {}
  }
  next();
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(200).json({ code: 0, msg: 'Server error' });
});

function sendEncrypted(res, obj) {
  res.send(xorEncode(JSON.stringify(obj)));
}

async function getPlayer(token) {
  if (!token) return null;
  const pid = await FB.findPlayerIdByToken(token);
  if (!pid) return null;
  return await FB.findPlayerById(pid.player_id);
}

async function savePlayer(player) {
  try { await FB.updatePlayer(player.id, player); } catch (e) { console.error('[FB] save error:', e.message); }
}

// === POST Handlers ===

app.post('/ReqLogin', async (req, res) => {
  try {
    const { device_id, name } = req.body;
    let player = await FB.findPlayerByName(name || 'Player');
    if (!player) {
      player = await FB.createPlayer(name || 'Player');
    } else {
      player.session_token = 'tok_' + player.id + '_' + Date.now();
      await FB.updatePlayer(player.id, { session_token: player.session_token });
    }
    delete player.id;
    sendEncrypted(res,{ code: 1, player });
  } catch (e) { console.error(e); sendEncrypted(res,{ code: 0, msg: 'Login error' }); }
});

app.post('/ReqDoCrime', async (req, res) => {
  const { token, crimeType } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid token' });
  if (player.jail > 0) return sendEncrypted(res,{ code: 0, msg: 'مسجون!' });
  if (player.nerve < 10) return sendEncrypted(res,{ code: 0, msg: 'ما عندك أعصاب' });
  player.nerve -= 10;
  player.experience = (player.experience || 0) + 50;
  player.money += 200;
  const levelUp = G.finishMissionForPlayer(player, 'crime');
  G.checkMissionLevelUp(player);
  if (levelUp) player.level = Math.floor(player.experience / 1000) + 1;
  await savePlayer(player);
  const p = await FB.findPlayerById(player.id);
  sendEncrypted(res,{ code: 1, exp: 50, money: 200, player: deleteId(p) });
});

app.post('/ReqFightNew', async (req, res) => {
  const { token, fightType } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid token' });
  if (player.health < 20) return sendEncrypted(res,{ code: 0, msg: 'صحتك ضعيفة' });
  const result = Math.floor(Math.random() * 3) + 1;
  const expGain = 80 + Math.floor(Math.random() * 40);
  const moneyGain = 100 + Math.floor(Math.random() * 200);
  player.experience = (player.experience || 0) + expGain;
  player.money += moneyGain;
  player.health = Math.max(1, player.health - 10);
  G.checkMissionLevelUp(player);
  await savePlayer(player);
  sendEncrypted(res,{ code: 1, result, expGain, moneyGain, player: await freshPlayer(player) });
});

app.post('/ReqExcercise', async (req, res) => {
  const { token, excerciseType, attribute } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  if (player.energy < 20) return sendEncrypted(res,{ code: 0, msg: 'ما عندك طاقة' });
  player.energy -= 20;
  const attrMap = { 1: 'strength', 2: 'endurance', 3: 'speed', 4: 'nimble' };
  const attr = attrMap[attribute];
  if (attr) player[attr] = (player[attr] || 10) + 1 + Math.floor(Math.random() * 3);
  await savePlayer(player);
  G.checkMissionLevelUp(player);
  sendEncrypted(res,{ code: 1, player: await freshPlayer(player) });
});

app.post('/ReqUpdateMoney', async (req, res) => {
  const { token, gameType, bet } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  if ((player.money || 0) < (bet || 100)) return sendEncrypted(res,{ code: 0, msg: 'ما فيه فلوس' });
  const win = Math.random() < 0.4;
  if (win) { player.money += (bet || 100) * 2; } else { player.money -= (bet || 100); }
  await savePlayer(player);
  sendEncrypted(res,{ code: 1, win, money: player.money });
});

app.post('/ReqLevelUp', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  player.level = (player.level || 1) + 1;
  player.experience = 0;
  player.maxHealth = 100 + (player.level * 20);
  player.health = player.maxHealth;
  await savePlayer(player);
  sendEncrypted(res,{ code: 1, player: await freshPlayer(player) });
});

app.post('/ReqJoinJob', async (req, res) => {
  const { token, jobType } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  player.job = jobType;
  player.jobLevel = 1;
  await savePlayer(player);
  sendEncrypted(res,{ code: 1, player: await freshPlayer(player) });
});

app.post('/ReqBuyGood', async (req, res) => {
  const { token, goodType, goodCate, amount } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  const prices = { 101: 200, 201: 300, 301: 50, 401: 30, 501: 100 };
  const price = (prices[goodType] || 100) * (amount || 1);
  if ((player.money || 0) < price) return sendEncrypted(res,{ code: 0, msg: 'ما فيه فلوس' });
  player.money -= price;
  G.finishMissionForPlayer(player, 'buy');
  await savePlayer(player);
  sendEncrypted(res,{ code: 1, player: await freshPlayer(player) });
});

app.post('/ReqSellGood', async (req, res) => {
  const { token, goodType, goodCate, amount } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  const prices = { 101: 100, 201: 150, 301: 25, 401: 15, 501: 50 };
  player.money += (prices[goodType] || 50) * (amount || 1);
  await savePlayer(player);
  sendEncrypted(res,{ code: 1, player: await freshPlayer(player) });
});

app.post('/ReqUseEquipment', async (req, res) => {
  const { token, equipType } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  if (equipType === 1) player.weapon = equipType;
  else if (equipType === 2) player.equipment = equipType;
  else if (equipType === 3) player.mount = equipType;
  await savePlayer(player);
  sendEncrypted(res,{ code: 1, player: await freshPlayer(player) });
});

app.post('/ReqHospitalCure', async (req, res) => {
  const { token, cureType } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  if (cureType === 0) {
    const cost = Math.floor((player.maxHealth - player.health) * 0.5);
    if ((player.money || 0) < cost) return sendEncrypted(res,{ code: 0, msg: 'ما فيه فلوس' });
    player.money -= cost;
    player.health = player.maxHealth;
    await savePlayer(player);
    sendEncrypted(res,{ code: 1, cost, player: await freshPlayer(player) });
  } else {
    player.health = Math.min(player.maxHealth, player.health + 30);
    await savePlayer(player);
    sendEncrypted(res,{ code: 1, cost: 0, player: await freshPlayer(player) });
  }
});

app.post('/ReqEnterDungeon', async (req, res) => {
  const { token, dungeonId } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  if (player.energy < 30) return sendEncrypted(res,{ code: 0, msg: 'ما عندك طاقة' });
  player.energy -= 30;
  await savePlayer(player);
  sendEncrypted(res,{ code: 1, dungeonLevel: dungeonId || 1, monsters: '3' });
});

app.post('/ReqPassLevel', async (req, res) => {
  const { token, dungeonId, result } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  const expGain = 150;
  const moneyGain = 250;
  player.experience = (player.experience || 0) + expGain;
  player.money += moneyGain;
  G.checkMissionLevelUp(player);
  await savePlayer(player);
  sendEncrypted(res,{ code: 1, result: 1, expGain, moneyGain, player: await freshPlayer(player) });
});

app.post('/ReqApplySubject', async (req, res) => {
  const { token, subjectId } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  if (player.money < 500) return sendEncrypted(res,{ code: 0, msg: 'ما فيه فلوس' });
  player.money -= 500;
  player.strength = (player.strength || 10) + 1;
  await savePlayer(player);
  sendEncrypted(res,{ code: 1, player: await freshPlayer(player) });
});

app.post('/ReqGetSalery', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  if (!player.job) return sendEncrypted(res,{ code: 0, msg: 'ما عندك وظيفة' });
  const salary = 500 + (player.jobLevel || 1) * 100;
  player.money += salary;
  player.jobLevel = (player.jobLevel || 1) + 1;
  await savePlayer(player);
  sendEncrypted(res,{ code: 1, salary, player: await freshPlayer(player) });
});

app.post('/ReqSubmitNews', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  player.money += 100;
  await savePlayer(player);
  sendEncrypted(res,{ code: 1, player: await freshPlayer(player) });
});

app.post('/ReqRewardLoser', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  player.money += 50;
  await savePlayer(player);
  sendEncrypted(res,{ code: 1, player: await freshPlayer(player) });
});

app.post('/ReqMergeGoods', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  sendEncrypted(res,{ code: 1, player: await freshPlayer(player) });
});

app.post('/ReqChatPost', async (req, res) => {
  const { token, chatType, message } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  await FB.saveChat({ player_name: player.name, message: message || '' });
  sendEncrypted(res,{ code: 1, player: await freshPlayer(player) });
});

app.post('/ReqStrengthen', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  if (player.money < 500) return sendEncrypted(res,{ code: 0, msg: 'ما فيه فلوس' });
  player.money -= 500;
  player.strength = (player.strength || 10) + 2;
  await savePlayer(player);
  sendEncrypted(res,{ code: 1, player: await freshPlayer(player) });
});

app.post('/ReqFightCooperateBossNew', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  const damage = 50 + Math.floor(Math.random() * 100);
  const reward = 100 + Math.floor(Math.random() * 200);
  player.money += reward;
  player.experience = (player.experience || 0) + 50;
  await savePlayer(player);
  sendEncrypted(res,{ code: 1, damage, reward, player: await freshPlayer(player) });
});

app.post('/ReqFlyTo', async (req, res) => {
  const { token, cityId } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  if (player.money < 1000) return sendEncrypted(res,{ code: 0, msg: 'ما فيه فلوس' });
  player.money -= 1000;
  player.city = cityId;
  await savePlayer(player);
  sendEncrypted(res,{ code: 1, player: await freshPlayer(player) });
});

app.post('/ReqFactionLoser', async (req, res) => sendEncrypted(res,{ code: 1, player: null }));
app.post('/ReqFactionJoinMilitia', async (req, res) => sendEncrypted(res,{ code: 1 }));
app.post('/ReqFAFightInfo', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  sendEncrypted(res,{ code: 1, win: Math.random() < 0.5, power: (player.strength || 10) * 10 + Math.floor(Math.random() * 100) });
});
app.post('/ReqLadderFighterJudgeNew', async (req, res) => sendEncrypted(res,{ code: 1, rank: 100, score: 0 }));
app.post('/ReqPrisonBail', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  if (!player.jail || player.jail <= 0) return sendEncrypted(res,{ code: 0, msg: 'ما انت مسجون' });
  if ((player.money || 0) < 500) return sendEncrypted(res,{ code: 0, msg: 'ما فيه فلوس' });
  player.money -= 500;
  player.jail = 0;
  await savePlayer(player);
  sendEncrypted(res,{ code: 1, player: await freshPlayer(player) });
});
app.post('/ReqPrisonBust', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  if (!player.jail || player.jail <= 0) return sendEncrypted(res,{ code: 0, msg: 'ما انت مسجون' });
  const success = Math.random() < 0.3;
  if (success) { player.jail = 0; await savePlayer(player); sendEncrypted(res,{ code: 1, result: 1, player: await freshPlayer(player) }); }
  else { player.jail += 30; await savePlayer(player); sendEncrypted(res,{ code: 1, result: 0, player: await freshPlayer(player) }); }
});
app.post('/ReqPlayerInfo', async (req, res) => {
  const { token } = req.body;
  const player = await getPlayer(token);
  if (!player) return sendEncrypted(res,{ code: 0, msg: 'Invalid' });
  sendEncrypted(res,{ code: 1, player: deleteId(player) });
});

// === REST endpoints (plain JSON for web UI) ===
app.get('/api/chats', async (req, res) => res.json(await FB.getRecentChats(50)));
app.get('/health', (req, res) => res.json({ status: 'ok', db: 'firebase', project: 'wogad-game' }));

function deleteId(p) { if (p && p.id) { const { id, ...rest } = p; return rest; } return p; }

async function freshPlayer(player) {
  const p = await FB.findPlayerById(player.id);
  return deleteId(p);
}

FB.init();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`وكر الأوغاد [Cloud] running on port ${PORT}`);
  console.log(`Firebase: wogad-game | Firestore: connected`);
});
