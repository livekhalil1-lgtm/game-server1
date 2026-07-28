const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'game_data.db');

let db = null;

async function initDatabase() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT UNIQUE,
    name TEXT DEFAULT 'Player',
    level INTEGER DEFAULT 1,
    money INTEGER DEFAULT 1000,
    gold INTEGER DEFAULT 0,
    experience INTEGER DEFAULT 0,
    health INTEGER DEFAULT 100,
    max_health INTEGER DEFAULT 100,
    energy INTEGER DEFAULT 100,
    nerve INTEGER DEFAULT 100,
    strength INTEGER DEFAULT 10,
    defense INTEGER DEFAULT 10,
    nimble INTEGER DEFAULT 10,
    speed INTEGER DEFAULT 10,
    endurance INTEGER DEFAULT 10,
    weapon TEXT,
    equipment TEXT,
    mount TEXT,
    city INTEGER DEFAULT 0,
    faction TEXT,
    job TEXT,
    job_level INTEGER DEFAULT 0,
    wanted INTEGER DEFAULT 0,
    jail INTEGER DEFAULT 0,
    dungeon_level INTEGER DEFAULT 0,
    inventory TEXT DEFAULT '[]',
    completed_missions TEXT DEFAULT '[]',
    active_missions TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    last_login TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    player_id INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER,
    player_name TEXT,
    chat_type INTEGER DEFAULT 0,
    message TEXT,
    time TEXT DEFAULT (datetime('now'))
  )`);

  save();
  console.log('Database initialized');
  return db;
}

function save() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function backup() {
  if (!db) return;
  const bakDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(bakDir)) fs.mkdirSync(bakDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bakPath = path.join(bakDir, `game_data_${ts}.db`);
  const data = db.export();
  fs.writeFileSync(bakPath, Buffer.from(data));
  console.log(`[DB] Backup saved: ${bakPath}`);
  
  // Keep only last 10 backups
  try {
    const files = fs.readdirSync(bakDir).filter(f => f.endsWith('.db')).sort();
    while (files.length > 10) {
      const old = files.shift();
      fs.unlinkSync(path.join(bakDir, old));
    }
  } catch(e) {}
  return bakPath;
}

function getDb() { return db; }

function playerToRow(p) {
  return {
    device_id: p.device_id,
    name: p.name,
    level: p.level,
    money: p.money,
    gold: p.gold || 0,
    experience: p.experience,
    health: p.health || 100,
    max_health: p.maxHealth || 100,
    energy: p.energy || 100,
    nerve: p.nerve || 100,
    strength: p.strength || 10,
    defense: p.defense || 10,
    nimble: p.nimble || 10,
    speed: p.speed || 10,
    endurance: p.endurance || 10,
    weapon: p.weapon ? JSON.stringify(p.weapon) : null,
    equipment: p.equipment ? JSON.stringify(p.equipment) : null,
    mount: p.mount ? JSON.stringify(p.mount) : null,
    city: p.city || 0,
    faction: p.faction || null,
    job: p.job ? String(p.job) : null,
    job_level: p.jobLevel || 0,
    wanted: p.wanted || 0,
    jail: p.jail || 0,
    dungeon_level: p.dungeonLevel || 0,
    inventory: JSON.stringify(p.inventory || []),
    completed_missions: JSON.stringify(p.completedMissions ? [...p.completedMissions] : []),
    active_missions: JSON.stringify(p.activeMissions || []),
    last_login: new Date().toISOString(),
  };
}

function rowToPlayer(row) {
  if (!row) return null;
  return {
    id: row.id,
    device_id: row.device_id,
    name: row.name,
    level: row.level,
    money: row.money,
    gold: row.gold || 0,
    experience: row.experience,
    health: row.health,
    maxHealth: row.max_health,
    energy: row.energy,
    nerve: row.nerve,
    strength: row.strength,
    defense: row.defense,
    nimble: row.nimble,
    speed: row.speed,
    endurance: row.endurance,
    weapon: row.weapon ? JSON.parse(row.weapon) : null,
    equipment: row.equipment ? JSON.parse(row.equipment) : null,
    mount: row.mount ? JSON.parse(row.mount) : null,
    city: row.city,
    faction: row.faction,
    job: row.job ? parseInt(row.job) : null,
    jobLevel: row.job_level,
    wanted: row.wanted,
    jail: row.jail,
    dungeonLevel: row.dungeon_level,
    inventory: JSON.parse(row.inventory || '[]'),
    completedMissions: new Set(JSON.parse(row.completed_missions || '[]')),
    activeMissions: JSON.parse(row.active_missions || '[]'),
    created_at: new Date(row.created_at).getTime(),
    last_login: new Date(row.last_login).getTime(),
  };
}

function findPlayerByDeviceId(deviceId) {
  if (!deviceId) return null;
  try {
    const stmt = db.prepare('SELECT * FROM players WHERE device_id = ?');
    stmt.bind([deviceId]);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return rowToPlayer(row);
  } catch(e) {
    console.error('[DB] findPlayerByDeviceId error:', e.message);
    return null;
  }
}

function findPlayerById(id) {
  if (!id) return null;
  const stmt = db.prepare('SELECT * FROM players WHERE id = ?');
  stmt.bind([id]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return rowToPlayer(row);
}

function createPlayer(deviceId, name) {
  if (!deviceId) return null;
  db.run(`INSERT INTO players (device_id, name) VALUES (?, ?)`, [deviceId, name || 'Player']);
  save();
  return findPlayerByDeviceId(deviceId);
}

function updatePlayer(player) {
  try {
    const r = playerToRow(player);
    db.run(`UPDATE players SET
      name=?, level=?, money=?, gold=?, experience=?, health=?, max_health=?,
      energy=?, nerve=?, strength=?, defense=?, nimble=?, speed=?, endurance=?,
      weapon=?, equipment=?, mount=?, city=?, faction=?, job=?, job_level=?,
      wanted=?, jail=?, dungeon_level=?, inventory=?, completed_missions=?,
      active_missions=?, last_login=?
      WHERE id=?`, [
      r.name, r.level, r.money, r.gold, r.experience, r.health, r.max_health,
      r.energy, r.nerve, r.strength, r.defense, r.nimble, r.speed, r.endurance,
      r.weapon, r.equipment, r.mount, r.city, r.faction, r.job, r.job_level,
      r.wanted, r.jail, r.dungeon_level, r.inventory, r.completed_missions,
      r.active_missions, r.last_login, player.id,
    ]);
    save();
  } catch(e) {
    console.error('[DB] updatePlayer error:', e.message);
  }
}

function saveSession(token, playerId) {
  db.run(`INSERT OR REPLACE INTO sessions (token, player_id) VALUES (?, ?)`, [token, playerId]);
  save();
}

function findPlayerIdByToken(token) {
  if (!token) return null;
  try {
    const stmt = db.prepare('SELECT player_id FROM sessions WHERE token = ?');
    stmt.bind([token]);
    const hasRow = stmt.step();
    let row = null;
    if (hasRow) row = stmt.getAsObject();
    stmt.free();
    if (!row) console.log('[DB DEBUG] findPlayerIdByToken: no row for token', token);
    else console.log('[DB DEBUG] findPlayerIdByToken: found', JSON.stringify(row));
    return row ? row.player_id : null;
  } catch(e) {
    console.error('[DB DEBUG] findPlayerIdByToken error:', e.message);
    return null;
  }
}

function getAllPlayers() {
  const stmt = db.prepare('SELECT id, name, level, money, job FROM players');
  const rows = [];
  while (stmt.step()) { rows.push(stmt.getAsObject()); }
  stmt.free();
  return rows;
}

function addChat(playerId, playerName, chatType, message) {
  db.run(`INSERT INTO chats (player_id, player_name, chat_type, message) VALUES (?, ?, ?, ?)`,
    [playerId, playerName, chatType, message]);
  save();
}

function getRecentChats(limit = 50) {
  const stmt = db.prepare(`SELECT * FROM chats ORDER BY id DESC LIMIT ?`);
  const rows = [];
  stmt.bind([limit]);
  while (stmt.step()) { rows.push(stmt.getAsObject()); }
  stmt.free();
  return rows.reverse();
}

function debugSessions() {
  const stmt = db.prepare('SELECT * FROM sessions');
  const rows = [];
  while (stmt.step()) { rows.push(stmt.getAsObject()); }
  stmt.free();
  return { sessions: rows, count: rows.length };
}

module.exports = {
  initDatabase, getDb, save, backup,
  findPlayerByDeviceId, findPlayerById, createPlayer, updatePlayer,
  saveSession, findPlayerIdByToken,
  getAllPlayers, addChat, getRecentChats, debugSessions,
};
