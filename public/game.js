const API = 'http://127.0.0.1:8080';
let token = null;
let player = null;

function xorEncode(d) {
  const k = "One ring to rule them all, one ring to find them, one ring to bring them all and in the darkness bind them.";
  const b = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i++) b[i] = d.charCodeAt(i) ^ k.charCodeAt(i % k.length);
  return String.fromCharCode(...b);
}
function xorDecode(d) { return xorEncode(d); }

async function apiCall(path, body) {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: xorEncode(JSON.stringify(body)),
  });
  return JSON.parse(xorDecode(new Uint8Array(await r.arrayBuffer()).reduce((s, b) => s + String.fromCharCode(b), '')));
}

const CITIES = [
  {id:400,name:'🏛️ العاصمة',flag:'🇨🇳'},
  {id:402,name:'🌆 هونغ كونغ',flag:'🇭🇰'},
  {id:408,name:'🏯 إمبراطوري',flag:'🇨🇳'},
  {id:13,name:'🇪🇬 القاهرة',flag:'🇪🇬'},
  {id:21,name:'🇺🇸 نيويورك',flag:'🇺🇸'},
  {id:25,name:'🇧🇷 ريو',flag:'🇧🇷'},
  {id:29,name:'🇯🇵 طوكيو',flag:'🇯🇵'},
  {id:47,name:'🇳🇱 أمستردام',flag:'🇳🇱'},
  {id:51,name:'🇮🇹 روما',flag:'🇮🇹'},
  {id:55,name:'🏙️ شينغتشينغ',flag:'🇨🇳'},
  {id:59,name:'🏝️ تشيونغتشو',flag:'🇨🇳'},
  {id:17,name:'🇲🇽 مكسيكو',flag:'🇲🇽'},
  {id:5,name:'🌍 نانفي',flag:'🌍'},
  {id:9,name:'🌃 شيانغ قانغ',flag:'🇭🇰'},
];

async function doLogin() {
  const name = document.getElementById('loginName').value.trim() || 'مقاتل';
  try {
    const res = await apiCall('/ReqLogin', { device_id: 'web_' + Date.now(), name });
    if (res.code === 1) {
      token = res.player.session_token;
      player = res.player;
      document.getElementById('loginScreen').classList.remove('active');
      document.getElementById('gameScreen').classList.add('active');
      updateUI();
      showPanel('city');
      loadChat();
      loadJobs();
    } else {
      document.getElementById('loginError').textContent = 'خطأ في تسجيل الدخول';
    }
  } catch(e) {
    document.getElementById('loginError').textContent = 'فشل الاتصال بالسيرفر';
  }
}

function updateUI() {
  if (!player) return;
  document.getElementById('pName').textContent = player.name;
  document.getElementById('pLevel').textContent = player.level;
  document.getElementById('pMoney').textContent = player.money;
  document.getElementById('pGold').textContent = player.gold || 0;
  document.getElementById('pHealth').textContent = player.health;
  document.getElementById('pMaxHealth').textContent = player.maxHealth;
  document.getElementById('pEnergy').textContent = player.energy;
  document.getElementById('pNerve').textContent = player.nerve;
  document.getElementById('hospitalHealth').textContent = player.health;
  document.getElementById('hospitalMaxHealth').textContent = player.maxHealth;
  document.getElementById('bankMoney').textContent = player.money;
  const ps = document.getElementById('prisonStatus');
  if (ps) ps.textContent = player.jail > 0 ? '⛓️ مسجون! ' + player.jail + ' ثانية' : '✅ لست في السجن';
  const hf = document.getElementById('healthFill');
  if (hf) hf.style.width = (player.maxHealth > 0 ? (player.health / player.maxHealth * 100) : 0) + '%';
  ['gymStr','gymEnd','gymSpd','gymNim'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = player[id.replace('gymStr','strength').replace('gymEnd','endurance').replace('gymSpd','speed').replace('gymNim','nimble')] || 0;
  });
  updateStats();
}

function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const p = document.getElementById('panel-' + name);
  if (p) p.classList.add('active');
  if (name === 'city') { renderCityMap(); }
  if (name === 'job') loadJobs();
  if (name === 'chat') loadChat();
  if (name === 'airport') loadCities();
}

async function loadPlayer() {
  try {
    const res = await apiCall('/ReqPlayerInfo', { token });
    if (res.code === 1) { player = res.player; updateUI(); }
  } catch(e) {}
}

function loadCities() {
  const div = document.getElementById('cityList');
  if (!div) return;
  div.innerHTML = CITIES.map(c =>
    `<div class="city-card" onclick="doFlyTo(${c.id})">
      <span class="ci">${c.flag}</span>
      <div class="cn">${c.name}</div>
    </div>`
  ).join('');
}

const CRIMES = ['🚂 سرقة القطار','🌉 نشل الجيب','🏪 سرقة متجر','💰 احتيال','🔫 سطو مسلح','🚗 سرقة سيارة'];

function loadCrimes() {
  const div = document.getElementById('crimeList');
  if (div) div.innerHTML = CRIMES.map((c, i) =>
    `<div class="item" onclick="doCrime(${i+1})"><div style="font-size:24px">${c.split(' ')[0]}</div><div>${c}</div></div>`
  ).join('');
}

async function doCrime(t) {
  const res = await apiCall('/ReqDoCrime', { token, crimeType: t });
  if (res.code === 1) { player = res.player; updateUI(); showResult('crimeResult', '✅ تمت الجريمة! +' + res.exp + ' خبرة +' + res.money + ' 💰'); }
  else showResult('crimeResult', '❌ ' + (res.msg || 'فشلت'));
}

async function doFight(t) {
  const res = await apiCall('/ReqFightNew', { token, fightType: t });
  const r = {1:'فوز 🏆',2:'هزيمة 💀',3:'تعادل 🤝',4:'قبضت عليك الشرطة 👮'};
  if (res.code === 1) { player = res.player; updateUI(); showResult('fightResult', '⚔️ ' + (r[res.result]||'') + '\n🧪 خبرة: +' + res.expGain + '\n💰 نقود: +' + res.moneyGain); }
}

async function doCooperateBoss() {
  const res = await apiCall('/ReqFightCooperateBossNew', { token });
  if (res.code === 1) { player = res.player; updateUI(); showResult('fightResult', '👥 قتال تعاوني: ضرر ' + res.damage + ' 🎁 مكافأة: ' + res.reward); }
}

async function doFAFight() {
  const res = await apiCall('/ReqFAFightInfo', { token });
  if (res.code === 1) { player = res.player; updateUI(); showResult('fightResult', '🌀 قتال القوى: ' + (res.win ? 'فوز 🏆' : 'هزيمة 💀') + ' (قوتك: ' + res.power + ')'); }
}

async function doExercise(t, a) {
  const res = await apiCall('/ReqExcercise', { token, excerciseType: t, attribute: a });
  if (res.code === 1) { player = res.player; updateUI(); showResult('gymResult', '✅ تمرين ناجح!\n💪 قوة: ' + res.player.strength + ' 🏃 تحمل: ' + res.player.endurance + '\n💨 سرعة: ' + res.player.speed + ' 🎯 رشاقة: ' + res.player.nimble); }
}

async function doGamble(g) {
  const res = await apiCall('/ReqUpdateMoney', { token, gameType: g, bet: 100 });
  const gn = {1:'🎰 سلوتس',2:'🃏 21 نقطة',3:'♠️ بوكر',4:'🔴⚫ أحمر/أسود'};
  if (res.code === 1) { player = res.player; updateUI(); showResult('gambleResult', gn[g] + ': ' + (res.win ? 'فزت 🎉' : 'خسرت 💸') + '\n💰 الرصيد: ' + res.money); }
}

async function doCure(t) {
  const res = await apiCall('/ReqHospitalCure', { token, cureType: t });
  if (res.code === 1) { player = res.player; updateUI(); showResult('cureResult', '✅ تم العلاج! الصحة: ' + res.player.health + '/' + res.player.maxHealth); }
  else showResult('cureResult', '❌ ' + (res.msg || 'ما فيه فلوس'));
}

async function doEnterDungeon() {
  const res = await apiCall('/ReqEnterDungeon', { token, dungeonId: 1 });
  if (res.code === 1) { player = res.player; updateUI(); showResult('dungeonResult', '🚪 دخلت الزنزانة! المستوى: ' + res.dungeonLevel); }
}

async function doPassLevel(r) {
  const res = await apiCall('/ReqPassLevel', { token, dungeonId: 1, result: r });
  if (res.code === 1) { player = res.player; updateUI(); showResult('dungeonResult', res.result === 1 ? '🏁 اجتزت المستوى! +' + res.expGain + ' خبرة +' + res.moneyGain + ' 💰' : '💀 فشلت'); }
}

async function doStudy() {
  const res = await apiCall('/ReqApplySubject', { token, subjectId: 1 });
  if (res.code === 1) { player = res.player; updateUI(); showResult('studyResult', '✅ درست بنجاح! +1 قوة'); }
}

async function doFlyTo(id) {
  const res = await apiCall('/ReqFlyTo', { token, cityId: id });
  if (res.code === 1) { player = res.player; updateUI(); showResult('flyResult', '✈️ وصلت إلى المدينة ' + id); }
  else showResult('flyResult', '❌ ' + (res.msg || 'ما فيه فلوس'));
}

async function doPrisonBail() {
  const res = await apiCall('/ReqPrisonBail', { token });
  if (res.code === 1) { player = res.player; updateUI(); showResult('prisonResult', '💰 دفعت الكفالة وطلعت!'); }
  else showResult('prisonResult', '❌ ' + (res.msg || 'ما انت مسجون'));
}

async function doPrisonBust() {
  const res = await apiCall('/ReqPrisonBust', { token });
  if (res.code === 1) { player = res.player; updateUI(); showResult('prisonResult', res.result === 1 ? '💥 هربت من السجن!' : '💀 فشلت في الهروب'); }
}

async function doSalary() {
  const res = await apiCall('/ReqGetSalery', { token });
  if (res.code === 1) { player = res.player; updateUI(); showResult('salaryResult', '💰 استلمت راتب: +' + res.salary); }
}

async function doChat() {
  const msg = document.getElementById('chatInput').value.trim();
  if (!msg) return;
  document.getElementById('chatInput').value = '';
  await apiCall('/ReqChatPost', { token, chatType: 0, message: msg });
  loadChat();
}

async function loadChat() {
  try {
    const msgs = await (await fetch(API + '/api/chats')).json();
    const box = document.getElementById('chatMessages');
    if (!box) return;
    const scroll = box.scrollTop >= box.scrollHeight - box.clientHeight - 20;
    box.innerHTML = msgs.map(m => '<div class="chat-msg"><span class="chat-name">' + m.player_name + ':</span> ' + m.message + '</div>').join('');
    if (scroll) box.scrollTop = box.scrollHeight;
  } catch(e) {}
}

const JOBS = [
  {id:462,name:'🍽️ مطعم',sal:'50-800'},{id:463,name:'🍸 بار',sal:'60-900'},
  {id:464,name:'🎬 سينما',sal:'70-1000'},{id:465,name:'🎵 موسيقى',sal:'80-1100'},
  {id:466,name:'💼 مكتب',sal:'90-1200'},{id:467,name:'🔬 علوم',sal:'100-1400'},
  {id:468,name:'👮 شرطة',sal:'110-1500'},{id:469,name:'🏥 مستشفى',sal:'120-1600'},
  {id:470,name:'🏛️ حكومة',sal:'130-1800'},{id:471,name:'⛏️ منجم',sal:'140-2000'},
  {id:472,name:'🏋️ أعمال شاقة',sal:'150-2200'},{id:473,name:'🆓 حر',sal:'0'},
];

function loadJobs() {
  const div = document.getElementById('jobList');
  if (!div) return;
  document.getElementById('jobResult').innerHTML = player?.job ? '✅ وظيفتك: ' + (JOBS.find(j=>j.id===player.job)?.name || player.job) : '❌ بدون وظيفة';
  div.innerHTML = JOBS.map(j =>
    '<div class="item" onclick="doJoinJob(' + j.id + ')"><div style="font-size:20px">' + j.name.split(' ')[0] + '</div><div>' + j.name + '</div><div class="pr">💰 ' + j.sal + '</div></div>'
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
  const div = document.getElementById('shopList');
  if (!div) return;
  div.innerHTML = (items[c]||[]).map((x,i) =>
    '<div class="item" onclick="doBuy(' + c + ',' + i + ',1,' + x.p + ')"><div style="font-size:20px">' + x.n.split(' ')[0] + '</div><div>' + x.n + '</div><div class="pr">💰 ' + x.p + '</div></div>'
  ).join('');
}

async function doBuy(c,i,a,p) {
  const gtypes = {0:101,1:201,2:301,3:401,5:501};
  const res = await apiCall('/ReqBuyGood', { token, goodType: gtypes[c]||708, goodCate: c, amount: a });
  if (res.code === 1) { player = res.player; updateUI(); showResult('shopResult', '✅ تم الشراء!'); }
  else showResult('shopResult', '❌ ' + (res.msg || 'ما فيه فلوس'));
}

function showResult(tid, txt) {
  const el = document.getElementById(tid);
  if (el) el.innerHTML = txt.replace(/\n/g, '<br>');
}

function updateStats() {
  if (!player) return;
  const attrs = [
    ['المستوى', player.level], ['الخبرة', player.experience],
    ['النقود 💰', player.money], ['الذهب 💎', player.gold||0],
    ['الصحة ❤️', player.health + '/' + player.maxHealth],
    ['الطاقة ⚡', player.energy], ['الأعصاب 🧠', player.nerve],
    ['القوة 💪', player.strength], ['الدفاع 🛡️', player.defense],
    ['السرعة 💨', player.speed], ['الرشاقة 🎯', player.nimble],
    ['التحمل 🏃', player.endurance],
    ['الوظيفة', player.job ? 'مستوى ' + player.jobLevel : 'لا'],
    ['مهام مكتملة', player.completedMissions?.length || 0],
  ];
  const el = document.getElementById('statsContent');
  if (el) el.innerHTML = attrs.map(([l,v]) => '<div class="stat-row"><span class="stat-label">' + l + '</span><span class="stat-value">' + v + '</span></div>').join('');
}

// City Map
let cityBg = null, cityData = null;

async function loadCityData() {
  if (cityData) return cityData;
  try {
    const r = await fetch(API + '/api/buildings');
    cityData = await r.json();
    cityBg = new Image();
    await new Promise(r => { cityBg.onload = r; cityBg.src = cityData.background; });
    return cityData;
  } catch(e) { return null; }
}

function renderCityMap() {
  const cv = document.getElementById('cityCanvas');
  if (!cv) return;
  const rc = cv.parentElement.getBoundingClientRect();
  cv.width = rc.width || 900; cv.height = rc.height || 550;
  const ctx = cv.getContext('2d');
  if (!cityData || !cityBg) {
    ctx.fillStyle = '#0a0505'; ctx.fillRect(0,0,cv.width,cv.height);
    ctx.fillStyle = '#c4a45a'; ctx.font = '18px Cairo'; ctx.textAlign = 'center';
    ctx.fillText('جاري تحميل المدينة...', cv.width/2, cv.height/2);
    loadCityData().then(() => { if (document.getElementById('panel-city')?.classList.contains('active')) renderCityMap(); });
    return;
  }
  const s = Math.min(cv.width / cityData.width, cv.height / cityData.height);
  const ox = (cv.width - cityData.width * s) / 2, oy = (cv.height - cityData.height * s) / 2;
  ctx.fillStyle = '#0a0505'; ctx.fillRect(0,0,cv.width,cv.height);
  ctx.drawImage(cityBg, ox, oy, cityData.width * s, cityData.height * s);
  const blds = cityData.buildings;
  const hits = [];
  for (let i = 0; i < blds.length; i++) {
    const b = blds[i];
    const bx = ox + b.mapX * s, by = oy + b.mapY * s;
    const size = 32 * s;
    hits.push({x: bx - size/2, y: by - size/2, w: size, h: size, name: b.name, icon: b.icon, panel: b.panel});
    ctx.beginPath();
    ctx.arc(bx, by, size/2 + 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx, by, size/2 + 3, 0, Math.PI * 2);
    ctx.strokeStyle = i === hoveredBuilding ? '#c4a45a' : 'rgba(196,164,90,0.4)';
    ctx.lineWidth = i === hoveredBuilding ? 3 : 1;
    ctx.stroke();
    ctx.font = Math.floor(16 * s) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillText(b.icon, bx, by + 2);
    ctx.font = Math.floor(10 * s) + 'px Cairo';
    ctx.fillStyle = i === hoveredBuilding ? '#c4a45a' : '#e0d5c1';
    ctx.fillText(b.name, bx, by + size/2 + 14 * s);
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
        if (h.panel === 'airport') { showPanel('airport'); loadCities(); }
        else showPanel(h.panel);
        return;
      }
    }
  });
  document.addEventListener('mousemove', e => {
    const cv = e.target.closest('#cityCanvas');
    const tip = document.getElementById('buildingTooltip');
    if (!cv || !cv._hits || !tip) { if (tip) tip.style.display = 'none'; return; }
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let idx = -1;
    for (let i = 0; i < cv._hits.length; i++) {
      const h = cv._hits[i];
      if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) { idx = i; break; }
    }
    if (idx >= 0) {
      tip.textContent = cv._hits[idx].name; tip.style.display = 'block'; cv.style.cursor = 'pointer';
      if (hoveredBuilding !== idx) { hoveredBuilding = idx; renderCityMap(); }
    } else {
      tip.style.display = 'none'; cv.style.cursor = 'default';
      if (hoveredBuilding !== -1) { hoveredBuilding = -1; renderCityMap(); }
    }
  });
});

setTimeout(() => loadCityData(), 1500);
setInterval(loadPlayer, 10000);
setInterval(loadChat, 5000);
