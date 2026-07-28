const API = window.location.origin;
const KEY = "One ring to rule them all, one ring to find them, one ring to bring them all and in the darkness bind them.";
let token = null;
let player = null;
let hoveredBuilding = -1;
let cityBg = null, cityData = null;

function xorEncode(d) {
  const b = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i++) b[i] = d.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length);
  return String.fromCharCode(...b);
}

async function apiCall(path, body) {
  const r = await fetch(API + path, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream' },
    body: xorEncode(JSON.stringify(body)),
  });
  const raw = new Uint8Array(await r.arrayBuffer());
  const dec = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) dec[i] = raw[i] ^ KEY.charCodeAt(i % KEY.length);
  return JSON.parse(new TextDecoder().decode(dec));
}

const CITIES = [
  {id:400,name:'🏛️ العاصمة'},{id:402,name:'🌆 هونغ كونغ'},{id:408,name:'🏯 إمبراطوري'},
  {id:13,name:'🇪🇬 القاهرة'},{id:21,name:'🇺🇸 نيويورك'},{id:25,name:'🇧🇷 ريو'},
  {id:29,name:'🇯🇵 طوكيو'},{id:47,name:'🇳🇱 أمستردام'},{id:51,name:'🇮🇹 روما'},
  {id:55,name:'🏙️ شينغتشينغ'},{id:59,name:'🏝️ تشيونغتشو'},{id:17,name:'🇲🇽 مكسيكو'},
  {id:5,name:'🌍 نانفي'},{id:9,name:'🌃 شيانغ قانغ'},
];

async function doLogin() {
  const name = document.getElementById('loginName').value.trim() || 'مقاتل';
  try {
    const res = await apiCall('/ReqLogin', { device_id: 'web_' + Date.now(), name });
    if (res.code === 1) {
      token = res.player.session_token;
      player = res.player;
      show('loginScreen', false);
      show('gameScreen', true);
      updateUI();
      loadChat();
      loadJobs();
      loadCities();
      initCityMap();
    } else {
      el('loginError').textContent = 'خطأ في تسجيل الدخول';
    }
  } catch(e) {
    el('loginError').textContent = 'فشل الاتصال بالسيرفر';
  }
}

function el(id) { return document.getElementById(id); }
function show(id, on) { const e = el(id); if (e) e.classList.toggle('active', on); }

function updateUI() {
  if (!player) return;
  setText('pName', player.name);
  setText('pLevel', player.level);
  setText('pMoney', player.money);
  setText('pGold', player.gold || 0);
  setText('pHealth', player.health);
  setText('pMaxHealth', player.maxHealth);
  setText('pEnergy', player.energy);
  setText('pNerve', player.nerve);
  setText('hospitalHealth', player.health);
  setText('hospitalMaxHealth', player.maxHealth);
  setText('bankMoney', player.money);
  setText('gymStr', player.strength || 0);
  setText('gymEnd', player.endurance || 0);
  setText('gymSpd', player.speed || 0);
  setText('gymNim', player.nimble || 0);
  const ps = el('prisonStatus');
  if (ps) ps.textContent = player.jail > 0 ? '⛓️ مسجون! ' + player.jail + 'ث' : '✅ طليق';
  const hf = el('healthFill');
  if (hf) hf.style.width = (player.maxHealth > 0 ? (player.health / player.maxHealth * 100) : 0) + '%';
  updateStats();
}

function setText(id, v) { const e = el(id); if (e) e.textContent = v; }

function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const p = el('panel-' + name);
  if (p) p.classList.add('active');
  if (name === 'city') renderCityMap();
  if (name === 'crimes') loadCrimes();
  if (name === 'job') loadJobs();
  if (name === 'chat') loadChat();
  if (name === 'airport') loadCities();
}

async function loadPlayer() {
  if (!token) return;
  try {
    const res = await apiCall('/ReqPlayerInfo', { token });
    if (res.code === 1) { player = res.player; updateUI(); }
  } catch(e) {}
}

function loadCities() {
  const div = el('cityList');
  if (!div) return;
  div.innerHTML = CITIES.map(c =>
    `<div class="city-card" onclick="doFlyTo(${c.id})"><span class="cc-flag">${c.name.split(' ')[0]}</span><div class="cn">${c.name}</div></div>`
  ).join('');
}

const CRIMES = ['🚂 سرقة قطار','🌉 نشل جيب','🏪 سرقة متجر','💰 احتيال','🔫 سطو مسلح','🚗 سرقة سيارة','💣 اختطاف','🔥 حرق متعمد'];
function loadCrimes() {
  const div = el('crimeList');
  if (div) div.innerHTML = CRIMES.map((c, i) =>
    `<div class="item" onclick="doCrime(${i+1})"><div class="item-icon">${c.split(' ')[0]}</div><div>${c}</div></div>`
  ).join('');
}

async function doCrime(t) {
  const res = await apiCall('/ReqDoCrime', { token, crimeType: t });
  if (res.code === 1) { player = res.player; updateUI(); showResult('crimeResult', '✅ تمت الجريمة! +' + res.exp + ' خبرة +' + res.money + ' 💰'); }
  else showResult('crimeResult', '❌ ' + (res.msg || 'فشلت'));
}

async function doFight(t) {
  const res = await apiCall('/ReqFightNew', { token, fightType: t });
  const r = {1:'🏆 فوز',2:'💀 هزيمة',3:'🤝 تعادل',4:'👮 قبضوا عليك'};
  if (res.code === 1) { player = res.player; updateUI(); showResult('fightResult', '⚔️ ' + (r[res.result]||'') + '\n🧪 خبرة: +' + res.expGain + '\n💰 نقود: +' + res.moneyGain); }
}

async function doCooperateBoss() {
  const res = await apiCall('/ReqFightCooperateBossNew', { token });
  if (res.code === 1) { player = res.player; updateUI(); showResult('fightResult', '👥 ضرر: ' + res.damage + ' 🎁 مكافأة: ' + res.reward); }
}

async function doFAFight() {
  const res = await apiCall('/ReqFAFightInfo', { token });
  if (res.code === 1) { player = res.player; updateUI(); showResult('fightResult', '🌀 ' + (res.win ? '🏆 فوز' : '💀 هزيمة') + ' (قوتك: ' + res.power + ')'); }
}

async function doExercise(t, a) {
  const res = await apiCall('/ReqExcercise', { token, excerciseType: t, attribute: a });
  if (res.code === 1) { player = res.player; updateUI(); showResult('gymResult', '✅ تمرين!\n💪 قوة: ' + (player.strength||10) + ' 🏃 تحمل: ' + (player.endurance||10) + '\n💨 سرعة: ' + (player.speed||10) + ' 🎯 رشاقة: ' + (player.nimble||10)); }
}

async function doGamble(g) {
  const res = await apiCall('/ReqUpdateMoney', { token, gameType: g, bet: 100 });
  const gn = {1:'🎰 سلوتس',2:'🃏 21 نقطة',3:'♠️ بوكر',4:'🔴⚫ أحمر/أسود'};
  if (res.code === 1) { player = res.player; updateUI(); showResult('gambleResult', gn[g] + ': ' + (res.win ? '🎉 فزت' : '💸 خسرت') + '\n💰 ' + res.money); }
}

async function doCure(t) {
  const res = await apiCall('/ReqHospitalCure', { token, cureType: t });
  if (res.code === 1) { player = res.player; updateUI(); showResult('cureResult', '✅ تم العلاج! ' + res.player.health + '/' + res.player.maxHealth); }
  else showResult('cureResult', '❌ ' + (res.msg || 'ما فيه فلوس'));
}

async function doEnterDungeon() {
  const res = await apiCall('/ReqEnterDungeon', { token, dungeonId: 1 });
  if (res.code === 1) { player = res.player; updateUI(); showResult('dungeonResult', '🚪 دخلت! المستوى: ' + res.dungeonLevel); }
}

async function doPassLevel(r) {
  const res = await apiCall('/ReqPassLevel', { token, dungeonId: 1, result: r });
  if (res.code === 1) { player = res.player; updateUI(); showResult('dungeonResult', res.result === 1 ? '🏁 اجتزت! +' + res.expGain + 'خبرة +' + res.moneyGain + '💰' : '💀 فشلت'); }
}

async function doStudy() {
  const res = await apiCall('/ReqApplySubject', { token, subjectId: 1 });
  if (res.code === 1) { player = res.player; updateUI(); showResult('studyResult', '✅ درست! +1 قوة'); }
}

async function doFlyTo(id) {
  const res = await apiCall('/ReqFlyTo', { token, cityId: id });
  if (res.code === 1) { player = res.player; updateUI(); showResult('flyResult', '✈️ وصلت للمدينة ' + id); }
  else showResult('flyResult', '❌ ' + (res.msg || 'ما فيه فلوس'));
}

async function doPrisonBail() {
  const res = await apiCall('/ReqPrisonBail', { token });
  if (res.code === 1) { player = res.player; updateUI(); showResult('prisonResult', '💰 دفعت الكفالة!'); }
  else showResult('prisonResult', '❌ ' + (res.msg || 'ما انت مسجون'));
}

async function doPrisonBust() {
  const res = await apiCall('/ReqPrisonBust', { token });
  if (res.code === 1) { player = res.player; updateUI(); showResult('prisonResult', res.result === 1 ? '💥 هربت!' : '💀 فشلت'); }
}

async function doSalary() {
  const res = await apiCall('/ReqGetSalery', { token });
  if (res.code === 1) { player = res.player; updateUI(); showResult('salaryResult', '💰 راتب: +' + res.salary); }
}

async function doChat() {
  const input = el('chatInput');
  if (!input || !input.value.trim()) return;
  await apiCall('/ReqChatPost', { token, chatType: 0, message: input.value });
  input.value = '';
  loadChat();
}

async function loadChat() {
  try {
    const msgs = await (await fetch(API + '/api/chats')).json();
    const box = el('chatMessages');
    if (!box) return;
    const scroll = box.scrollTop >= box.scrollHeight - box.clientHeight - 20;
    box.innerHTML = msgs.map(m => '<div class="chat-msg"><b class="cn">' + (m.player_name||'?') + ':</b> ' + (m.message||'') + '</div>').join('');
    if (scroll) box.scrollTop = box.scrollHeight;
  } catch(e) {}
}

const JOBS = [
  {id:462,name:'🍽️ مطعم',sal:'50-800'},{id:463,name:'🍸 بار',sal:'60-900'},{id:464,name:'🎬 سينما',sal:'70-1000'},
  {id:465,name:'🎵 موسيقى',sal:'80-1100'},{id:466,name:'💼 مكتب',sal:'90-1200'},{id:467,name:'🔬 علوم',sal:'100-1400'},
  {id:468,name:'👮 شرطة',sal:'110-1500'},{id:469,name:'🏥 مستشفى',sal:'120-1600'},{id:470,name:'🏛️ حكومة',sal:'130-1800'},
  {id:471,name:'⛏️ منجم',sal:'140-2000'},{id:472,name:'🏋️ أعمال شاقة',sal:'150-2200'},{id:473,name:'🆓 حر',sal:'0'},
];

function loadJobs() {
  const div = el('jobList');
  if (!div) return;
  const jr = el('jobResult');
  if (jr) jr.innerHTML = player?.job ? '✅ وظيفتك: ' + (JOBS.find(j=>j.id===player.job)?.name || player.job) + ' (مستوى ' + (player.jobLevel||1) + ')' : '❌ بدون وظيفة';
  div.innerHTML = JOBS.map(j =>
    '<div class="item" onclick="doJoinJob(' + j.id + ')"><div class="item-icon">' + j.name.split(' ')[0] + '</div><div>' + j.name + '</div><div class="pr">💰 ' + j.sal + '</div></div>'
  ).join('');
}

async function doJoinJob(jt) {
  const res = await apiCall('/ReqJoinJob', { token, jobType: jt });
  if (res.code === 1) { player = res.player; updateUI(); loadJobs(); }
}

function showShop(c) {
  const items = {
    0: [{n:'🔫 مسدس',p:200},{n:'🎯 بندقية',p:500},{n:'💥 رشاش',p:1000},{n:'⚔️ سيف',p:300}],
    1: [{n:'🛡️ سترة',p:300},{n:'🦾 دروع',p:800},{n:'🪖 خوذة',p:200}],
    2: [{n:'💊 أسبرين',p:50},{n:'💉 منشطات',p:150},{n:'🧪 أدوية',p:400}],
    3: [{n:'🌽 ذرة',p:30},{n:'🌾 قمح',p:45},{n:'🪨 حديد',p:80},{n:'🪵 خشب',p:25}],
    5: [{n:'🎒 عتاد',p:100}],
  };
  const gtypes = {0:101,1:201,2:301,3:401,5:501};
  const div = el('shopList');
  if (!div) return;
  div.innerHTML = (items[c]||[]).map((x,i) =>
    '<div class="item" onclick="doBuy(' + c + ',' + i + ',1,' + x.p + ')"><div class="item-icon">' + x.n.split(' ')[0] + '</div><div>' + x.n + '</div><div class="pr">💰 ' + x.p + '</div></div>'
  ).join('');
}

async function doBuy(c,i,a,p) {
  const gtypes = {0:101,1:201,2:301,3:401,5:501};
  const res = await apiCall('/ReqBuyGood', { token, goodType: gtypes[c]||708, goodCate: c, amount: a });
  if (res.code === 1) { player = res.player; updateUI(); showResult('shopResult', '✅ تم الشراء!'); }
  else showResult('shopResult', '❌ ' + (res.msg || 'ما فيه فلوس'));
}

function showResult(tid, txt) {
  const el2 = el(tid);
  if (el2) el2.innerHTML = txt.replace(/\n/g, '<br>');
}

function updateStats() {
  if (!player) return;
  const attrs = [
    ['المستوى', player.level], ['الخبرة', player.experience], ['💰 نقود', player.money], ['💎 ذهب', player.gold||0],
    ['❤️ صحة', player.health + '/' + player.maxHealth], ['⚡ طاقة', player.energy], ['🧠 أعصاب', player.nerve],
    ['💪 قوة', player.strength], ['🛡️ دفاع', player.defense], ['💨 سرعة', player.speed],
    ['🎯 رشاقة', player.nimble], ['🏃 تحمل', player.endurance],
    ['💼 وظيفة', player.job ? 'مستوى ' + player.jobLevel : 'لا'], ['✅ مهام', (player.completedMissions||[]).length],
  ];
  const st = el('statsContent');
  if (st) st.innerHTML = attrs.map(([l,v]) => '<div class="sr2"><span>' + l + '</span><span>' + v + '</span></div>').join('');
}

// ===== City Map (Canvas) =====
async function initCityMap() {
  try {
    const r = await fetch(API + '/api/buildings');
    cityData = await r.json();
    cityBg = new Image();
    await new Promise((res, rej) => { cityBg.onload = res; cityBg.onerror = rej; cityBg.src = cityData.background; });
  } catch(e) { cityData = null; cityBg = null; }
}

function renderCityMap() {
  const cv = el('cityCanvas');
  if (!cv || !cityData || !cityBg) return;
  const rc = cv.parentElement.getBoundingClientRect();
  cv.width = rc.width || 900; cv.height = rc.height || 600;
  const ctx = cv.getContext('2d');
  const s = Math.min(cv.width / cityData.width, cv.height / cityData.height);
  const ox = (cv.width - cityData.width * s) / 2, oy = (cv.height - cityData.height * s) / 2;

  ctx.fillStyle = '#0a0505'; ctx.fillRect(0,0,cv.width,cv.height);
  ctx.drawImage(cityBg, ox, oy, cityData.width * s, cityData.height * s);

  const hits = [];
  for (const b of cityData.buildings) {
    const bx = ox + b.mapX * s, by = oy + b.mapY * s;
    const sz = 32 * s;
    hits.push({x: bx - sz/2, y: by - sz/2, w: sz, h: sz, name: b.name, icon: b.icon, panel: b.panel});

    ctx.beginPath();
    ctx.arc(bx, by, sz/2 + 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();

    ctx.beginPath();
    ctx.arc(bx, by, sz/2 + 3, 0, Math.PI * 2);
    ctx.strokeStyle = '#c4a45a'; ctx.lineWidth = 1; ctx.stroke();

    ctx.font = Math.floor(16 * s) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillText(b.icon, bx, by + 2);

    ctx.font = Math.floor(10 * s) + 'px Cairo';
    ctx.fillStyle = '#e0d5c1'; ctx.textAlign = 'center';
    ctx.fillText(b.name, bx, by + sz/2 + 14 * s);
  }
  cv._hits = hits;
}

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', e => {
    const cv = e.target.closest('#cityCanvas');
    if (!cv || !cv._hits) return;
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    for (const h of cv._hits) {
      if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) {
        showPanel(h.panel);
        return;
      }
    }
  });
});

setInterval(loadPlayer, 10000);
setInterval(loadChat, 5000);
