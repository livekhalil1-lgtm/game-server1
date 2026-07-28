const FIGHT_TYPES = {
  FIGHT_PVP: 0, FIGHT_FACTION: 1, FIGHT_WANTED: 2, FIGHT_PVE: 3,
  FIGHT_CLUB_PVP: 4, FIGHT_PVE_BOSS_WAR: 5, FIGHT_LADDER: 6,
  FIGHT_DUNGEON: 7, FIGHT_COMPETITION: 8, FIGHT_COOPERATE: 9,
  FIGHT_SKYSCRAPER: 10, FIGHT_KINGFIGHT: 11, FIGHT_CITYWAR: 12,
};

const FIGHT_RESULT = { UNKNOWN: 0, SUCCESS: 1, FAIL: 2, DRAW: 3, CAUGHT: 4 };

const GOOD_CATE = { WEAPON: 0, ARMOR: 1, DRUG: 2, PRODUCT: 3, TRADE: 4, MISSION: 5, SPECIAL_FOOD: 6, GENERAL: 9 };

const JOB_TYPES = {
  RESTAURANT: 462, BAR: 463, CINEMA: 464, MUSIC: 465, OFFICE: 466,
  SCIENCE: 467, POLICE: 468, HOSPITAL: 469, GOVERNMENT: 470, MINE: 471, PHYSICAL: 472, FREE: 473,
};

const JOB_SALARIES = {
  462: [50, 100, 180, 300, 500, 800],
  463: [60, 120, 200, 350, 550, 900],
  464: [70, 140, 250, 400, 600, 1000],
  465: [80, 160, 280, 450, 700, 1100],
  466: [90, 180, 300, 500, 800, 1200],
  467: [100, 200, 350, 550, 900, 1400],
  468: [110, 220, 380, 600, 1000, 1500],
  469: [120, 240, 400, 650, 1100, 1600],
  470: [130, 260, 450, 700, 1200, 1800],
  471: [140, 280, 480, 750, 1300, 2000],
  472: [150, 300, 500, 800, 1400, 2200],
  473: [0, 0, 0, 0, 0, 0],
};

const EXP_TABLE = [];
for (let i = 1; i <= 100; i++) {
  EXP_TABLE[i] = Math.floor(i * 100 + Math.pow(i, 1.5) * 10);
}

const EQUIP_USE_TYPE = { WEAPON: 1, ARMOR: 2, MOUNT: 3 };

const BUILDINGS = {
  GAMBLING: 0, HOSPITAL: 1, PRISON: 2, FIGHTING: 3, TAOBAO: 4,
  BANK: 5, STOCK: 6, GOVERNMENT: 7, MARKET: 8, JOB: 9, AIRPORT: 10,
  GYM: 11, FACTION: 12, BLACKMARKET: 13, PROPERTY: 14, MARRY: 15,
  SCHOOL: 16, FLAG: 17, REDUCE_TOXICITY: 18, LADDER: 19, DUNGEONS: 20,
  STRENGTHEN_SHOP: 21, AUCTION_HOUSE: 22,
};

function propMax(star, quality) {
  if (star > 5) star = 5;
  let prop = 2500.0 * Math.pow(quality, 3) + Math.pow(star, 3.6 - (4 - quality) * 0.2);
  let result = Math.floor(Math.floor(prop) / 1000) * 1000;
  return result;
}

function gymEffect(happy, energy) {
  return (0.00328 * happy + 0.55) * energy / 10;
}

function pourInEffect(attack, hit, dodge, def, level) {
  if (attack <= 0) attack = 0;
  if (hit <= 0) hit = 0;
  if (dodge <= 0) dodge = 0;
  if (def <= 0) def = 0;
  return (attack + hit + dodge + def) * 1.3 * 0.4 + 100;
}

function upstarCost(star, quality) {
  return 200000 * Math.pow(3, quality - 1) * Math.pow(star, 2);
}

function restoreFeelingMoney(nowFeeling, star, quality) {
  return 50 * Math.pow(quality, 2) * Math.pow(star, 2) * (100 - nowFeeling);
}

function costGold(minusProp) {
  let result = minusProp / (minusProp + 100000) * 2000;
  if (result < 5) result = 5;
  return Math.floor(result + 0.5);
}

function calcExpForLevel(level) {
  return EXP_TABLE[level] || level * 150;
}

function calcFightPower(player) {
  return (player.strength || 10) * 2 + (player.nimble || 10) * 1.5 + (player.speed || 10) * 1.2 + (player.endurance || 10) * 1.8;
}

function calcDamage(attacker, defender) {
  const atk = (attacker.strength || 10) + (attacker.weapon ? 20 : 0);
  const def = (defender.endurance || 10) + (defender.equipment ? 15 : 0);
  const base = Math.max(1, atk - def / 2);
  const variance = 0.8 + Math.random() * 0.4;
  return Math.floor(base * variance);
}

function simulateFight(player, opponent) {
  const pPower = calcFightPower(player);
  const oPower = calcFightPower(opponent);
  const ratio = pPower / Math.max(1, pPower + oPower);
  const roll = Math.random();
  if (roll < ratio - 0.1) return { result: FIGHT_RESULT.SUCCESS, playerHp: 80, opponentHp: 0, expGain: Math.floor(20 + oPower / 5), moneyGain: Math.floor(10 + oPower / 3) };
  if (roll > ratio + 0.1) return { result: FIGHT_RESULT.FAIL, playerHp: 20, opponentHp: 60, expGain: Math.floor(5 + oPower / 10), moneyGain: 0 };
  return { result: FIGHT_RESULT.DRAW, playerHp: 50, opponentHp: 50, expGain: Math.floor(10 + oPower / 7), moneyGain: Math.floor(5 + oPower / 5) };
}

const mission_data = {
  1: { missionId: 1, tarProgress: 1, nextMission: 2, tutorialId: 100101, doTimes: 1, rewardExp: 5, rewardMoney: 100, rewardGoodIdx: 23, rewardGoodCate: 9, rewardGold: 0, isMainCity: 1, branchMission: 0 },
  2: { missionId: 2, tarProgress: 1, nextMission: 3, tutorialId: 100201, doTimes: 1, rewardExp: 5, rewardMoney: 200, rewardGoodIdx: 708, rewardGoodCate: 5, rewardGold: 0, isMainCity: 1, branchMission: 0 },
  3: { missionId: 3, tarProgress: 1, nextMission: 31, tutorialId: 100301, doTimes: 1, rewardExp: 5, rewardMoney: 500, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: 1, branchMission: 0 },
  4: { missionId: 4, tarProgress: 1, nextMission: 5, tutorialId: 100401, doTimes: 1, rewardExp: 20, rewardMoney: 500, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: 1, branchMission: 0 },
  5: { missionId: 5, tarProgress: 1, nextMission: 6, tutorialId: 100501, doTimes: 1, rewardExp: 30, rewardMoney: 1000, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: 1, branchMission: 0 },
  6: { missionId: 6, tarProgress: 1, nextMission: 7, tutorialId: 100601, doTimes: 1, rewardExp: 40, rewardMoney: 1000, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: 1, branchMission: 0 },
  7: { missionId: 7, tarProgress: 1, nextMission: 8, tutorialId: 100701, doTimes: 1, rewardExp: 50, rewardMoney: 1500, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: 1, branchMission: 0 },
  8: { missionId: 8, tarProgress: 1, nextMission: 9, tutorialId: 100801, doTimes: 1, rewardExp: 60, rewardMoney: 1500, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: 1, branchMission: 0 },
  9: { missionId: 9, tarProgress: 1, nextMission: 10, tutorialId: 100901, doTimes: 1, rewardExp: 70, rewardMoney: 2000, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: 1, branchMission: 0 },
  10: { missionId: 10, tarProgress: 1, nextMission: 11, tutorialId: 101001, doTimes: 1, rewardExp: 80, rewardMoney: 2000, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: 1, branchMission: 0 },
  22: { missionId: 22, tarProgress: 1, nextMission: 23, tutorialId: 102201, doTimes: 1, rewardExp: 100, rewardMoney: 2000, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: 1, branchMission: 0 },
  23: { missionId: 23, tarProgress: 20, nextMission: 24, tutorialId: 102301, doTimes: 1, rewardExp: 150, rewardMoney: 3000, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: 1, branchMission: 0 },
  26: { missionId: 26, tarProgress: 10, nextMission: 49, tutorialId: 102601, doTimes: 1, rewardExp: 100, rewardMoney: 500, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: -1, branchMission: 0 },
  27: { missionId: 27, tarProgress: 1, nextMission: 22, tutorialId: 102701, doTimes: 1, rewardExp: 150, rewardMoney: 2000, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: 1, branchMission: 0 },
  28: { missionId: 28, tarProgress: 5, nextMission: 30, tutorialId: 102801, doTimes: 1, rewardExp: 200, rewardMoney: 2000, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: 1, branchMission: 0 },
  30: { missionId: 30, tarProgress: 1, nextMission: 36, tutorialId: 103001, doTimes: 1, rewardExp: 150, rewardMoney: 5000, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: -1, branchMission: 0 },
  31: { missionId: 31, tarProgress: 1, nextMission: 4, tutorialId: 103101, doTimes: 1, rewardExp: 20, rewardMoney: 500, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: 1, branchMission: 0 },
  36: { missionId: 36, tarProgress: 1, nextMission: 37, tutorialId: -1, doTimes: 1, rewardExp: 150, rewardMoney: 0, rewardGoodIdx: 7, rewardGoodCate: 9, rewardGold: 0, isMainCity: -1, branchMission: 1 },
  37: { missionId: 37, tarProgress: 1, nextMission: 38, tutorialId: -1, doTimes: 1, rewardExp: 250, rewardMoney: 0, rewardGoodIdx: 7, rewardGoodCate: 9, rewardGold: 0, isMainCity: -1, branchMission: 1 },
  38: { missionId: 38, tarProgress: 1, nextMission: 40, tutorialId: -1, doTimes: 1, rewardExp: 280, rewardMoney: 0, rewardGoodIdx: 158, rewardGoodCate: 9, rewardGold: 0, isMainCity: -1, branchMission: 1 },
  39: { missionId: 39, tarProgress: 1, nextMission: -1, tutorialId: -1, doTimes: 1, rewardExp: 300, rewardMoney: 0, rewardGoodIdx: 7, rewardGoodCate: 9, rewardGold: 0, isMainCity: -1, branchMission: 1 },
  40: { missionId: 40, tarProgress: 1, nextMission: 42, tutorialId: -1, doTimes: 1, rewardExp: 350, rewardMoney: 0, rewardGoodIdx: 507, rewardGoodCate: 2, rewardGold: 0, isMainCity: -1, branchMission: 1 },
  41: { missionId: 41, tarProgress: 1, nextMission: -1, tutorialId: -1, doTimes: 1, rewardExp: 450, rewardMoney: 0, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: -1, branchMission: 1 },
  42: { missionId: 42, tarProgress: 1, nextMission: 50, tutorialId: -1, doTimes: 1, rewardExp: 950, rewardMoney: 2000, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: 1, branchMission: 1 },
  43: { missionId: 43, tarProgress: 1, nextMission: 44, tutorialId: 104301, doTimes: 1, rewardExp: 650, rewardMoney: 0, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: 1, branchMission: 0 },
  44: { missionId: 44, tarProgress: 1000000, nextMission: 45, tutorialId: 104401, doTimes: 1, rewardExp: 700, rewardMoney: 0, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: 1, branchMission: 0 },
  45: { missionId: 45, tarProgress: 1, nextMission: 36, tutorialId: 104501, doTimes: 1, rewardExp: 200, rewardMoney: 0, rewardGoodIdx: 8, rewardGoodCate: 100, rewardGold: 0, isMainCity: -1, branchMission: 0 },
  46: { missionId: 46, tarProgress: 1, nextMission: 23, tutorialId: 104601, doTimes: 1, rewardExp: 400, rewardMoney: 0, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: 1, branchMission: 0 },
  47: { missionId: 47, tarProgress: 1, nextMission: -1, tutorialId: 104701, doTimes: 1, rewardExp: 900, rewardMoney: 0, rewardGoodIdx: 8, rewardGoodCate: 9, rewardGold: 0, isMainCity: 1, branchMission: 0 },
  48: { missionId: 48, tarProgress: 30, nextMission: 51, tutorialId: -1, doTimes: 1, rewardExp: 1000, rewardMoney: 0, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: -1, branchMission: 1 },
  49: { missionId: 49, tarProgress: 1, nextMission: 27, tutorialId: 104901, doTimes: 1, rewardExp: 100, rewardMoney: 0, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: -1, branchMission: 0 },
  50: { missionId: 50, tarProgress: 1, nextMission: 48, tutorialId: -1, doTimes: 1, rewardExp: 0, rewardMoney: 0, rewardGoodIdx: 7, rewardGoodCate: 9, rewardGold: 0, isMainCity: -1, branchMission: 1 },
  51: { missionId: 51, tarProgress: 1, nextMission: 52, tutorialId: -1, doTimes: 1, rewardExp: 0, rewardMoney: 0, rewardGoodIdx: 7, rewardGoodCate: 9, rewardGold: 0, isMainCity: -1, branchMission: 1 },
  52: { missionId: 52, tarProgress: 10, nextMission: 54, tutorialId: -1, doTimes: 1, rewardExp: 0, rewardMoney: 0, rewardGoodIdx: 8, rewardGoodCate: 9, rewardGold: 0, isMainCity: -1, branchMission: 1 },
  53: { missionId: 53, tarProgress: 1, nextMission: -1, tutorialId: -1, doTimes: 1, rewardExp: 0, rewardMoney: 0, rewardGoodIdx: 111, rewardGoodCate: 9, rewardGold: 0, isMainCity: -1, branchMission: 1 },
  54: { missionId: 54, tarProgress: 1, nextMission: 53, tutorialId: -1, doTimes: 1, rewardExp: 0, rewardMoney: 0, rewardGoodIdx: 294, rewardGoodCate: 0, rewardGold: 0, isMainCity: -1, branchMission: 1 },
  ...Array.from({ length: 20 }, (_, i) => i + 11).reduce((acc, id) => {
    acc[id] = { missionId: id, tarProgress: 1, nextMission: id + 1, doTimes: 1, rewardExp: 10 + id * 5, rewardMoney: 100 + id * 50, rewardGoodIdx: 0, rewardGoodCate: 0, rewardGold: 0, isMainCity: id <= 21 ? 1 : -1, branchMission: 0 };
    return acc;
  }, {}),
};

function getMissionById(id) {
  return mission_data[id] || null;
}

function getInitialMissions() {
  return [1, 2, 3, 31, 4, 5, 6, 7, 8, 9, 10];
}

function checkMissionLevelUp(player, level) {
  const mfuncChecks = {
    26: (p) => p.level >= 10,
    30: (p) => p.level >= 15,
    48: (p) => p.level >= 30,
  };
  for (const [mid, check] of Object.entries(mfuncChecks)) {
    if (check(player)) {
      finishMissionForPlayer(player, parseInt(mid));
    }
  }
}

function finishMissionForPlayer(player, missionId) {
  const mission = getMissionById(missionId);
  if (!mission) return null;
  if (player.completedMissions && player.completedMissions.has(missionId)) return null;

  if (!player.completedMissions) player.completedMissions = new Set();
  player.completedMissions.add(missionId);

  player.experience = (player.experience || 0) + mission.rewardExp;
  player.money = (player.money || 0) + mission.rewardMoney;
  player.gold = (player.gold || 0) + (mission.rewardGold || 0);

  if (mission.nextMission && mission.nextMission > 0 && mission.branchMission === 0) {
    if (!player.activeMissions) player.activeMissions = [];
    if (!player.activeMissions.includes(mission.nextMission)) {
      player.activeMissions.push(mission.nextMission);
    }
  }

  while (player.experience >= calcExpForLevel(player.level)) {
    player.experience -= calcExpForLevel(player.level);
    player.level++;
    checkMissionLevelUp(player, player.level);
  }

  return {
    missionId,
    rewardExp: mission.rewardExp,
    rewardMoney: mission.rewardMoney,
    rewardGold: mission.rewardGold || 0,
    nextMission: mission.nextMission,
  };
}

function getCurMissionId(player) {
  const completed = player.completedMissions || new Set();
  const initial = getInitialMissions();
  const visited = new Set();
  const queue = [...initial];
  while (queue.length > 0) {
    const mid = queue.shift();
    if (visited.has(mid)) continue;
    visited.add(mid);
    if (!completed.has(mid)) return mid;
    const m = getMissionById(mid);
    if (m && m.nextMission > 0 && !visited.has(m.nextMission)) queue.push(m.nextMission);
  }
  return 54;
}

function getAllMissions() {
  return Object.values(mission_data).map(m => ({
    id: m.missionId, tarProgress: m.tarProgress, rewardExp: m.rewardExp,
    rewardMoney: m.rewardMoney, nextMission: m.nextMission, branchMission: m.branchMission,
  }));
}

function getPlayerStats(player) {
  return {
    id: player.id,
    name: player.name,
    level: player.level,
    money: player.money,
    gold: player.gold,
    experience: player.experience,
    health: player.health || 100,
    maxHealth: player.maxHealth || 100,
    energy: player.energy || 100,
    nerve: player.nerve || 100,
    strength: player.strength || 10,
    defense: player.defense || 10,
    nimble: player.nimble || 10,
    speed: player.speed || 10,
    endurance: player.endurance || 10,
    weapon: player.weapon || null,
    equipment: player.equipment || null,
    mount: player.mount || null,
    city: player.city || 0,
    faction: player.faction || null,
    job: player.job || null,
    jobLevel: player.jobLevel || 0,
    wanted: player.wanted || 0,
    jail: player.jail || 0,
    completedMissions: player.completedMissions ? [...player.completedMissions] : [],
    activeMissions: player.activeMissions || [],
  };
}

module.exports = {
  FIGHT_TYPES, FIGHT_RESULT, GOOD_CATE, JOB_TYPES, JOB_SALARIES,
  BUILDINGS, EQUIP_USE_TYPE, EXP_TABLE,
  propMax, gymEffect, pourInEffect, upstarCost, restoreFeelingMoney, costGold,
  calcExpForLevel, calcFightPower, calcDamage, simulateFight,
  mission_data, getMissionById, getInitialMissions,
  finishMissionForPlayer, checkMissionLevelUp, getCurMissionId, getAllMissions, getPlayerStats,
};
