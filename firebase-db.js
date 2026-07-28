const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');

let db = null;

function init() {
  if (db) return db;
  let serviceAccount = null;
  const keyPath = path.join(__dirname, 'firebase-key.json');
  
  // Try file, then env var
  if (fs.existsSync(keyPath)) {
    serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  } else if (process.env.FIREBASE_KEY) {
    serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
  }
  
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  } else {
    try {
      admin.initializeApp({
        credential: admin.applicationDefault(),
        projectId: 'wogad-game',
      });
    } catch (e) {
      if (!e.message.includes('already exists')) throw e;
    }
  }
  db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });
  console.log('[Firebase] Firestore connected to wogad-game');
  return db;
}

async function findPlayerByName(name) {
  const snap = await db.collection('players').where('name', '==', name).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: parseInt(doc.id), ...doc.data() };
}

async function findPlayerById(id) {
  const doc = await db.collection('players').doc(String(id)).get();
  if (!doc.exists) return null;
  return { id: parseInt(doc.id), ...doc.data() };
}

async function findPlayerIdByToken(token) {
  const snap = await db.collection('players').where('session_token', '==', token).limit(1).get();
  if (snap.empty) return null;
  return { player_id: parseInt(snap.docs[0].id) };
}

async function createPlayer(name) {
  const playersRef = db.collection('players');
  // Use counter doc for auto-increment
  const counterRef = db.collection('counters').doc('players');
  let newId;
  try {
    await db.runTransaction(async (t) => {
      const snap = await t.get(counterRef);
      const next = (snap.data()?.next || 1);
      newId = next;
      t.set(counterRef, { next: next + 1 });
    });
  } catch (e) {
    // Fallback: add a new doc and use server timestamp
    const doc = await playersRef.add({ _temp: true, _created: new Date().toISOString() });
    newId = parseInt(doc.id.replace(/[^0-9]/g, '').slice(-6)) || Date.now();
    await doc.delete();
  }
  const player = {
    name, level: 1, money: 1000, gold: 0, experience: 0,
    health: 100, maxHealth: 100, energy: 100, nerve: 100,
    strength: 10, defense: 10, nimble: 10, speed: 10, endurance: 10,
    weapon: null, equipment: null, mount: null, city: 0,
    faction: null, job: null, jobLevel: 0, wanted: 0, jail: 0,
    completedMissions: [], activeMissions: [],
    session_token: 'tok_' + newId + '_' + Date.now(),
    createdAt: new Date().toISOString()
  };
  await playersRef.doc(String(newId)).set(player);
  return { id: newId, ...player };
}

async function updatePlayer(id, data) {
  await db.collection('players').doc(String(id)).update(data);
}

async function saveChat(msg) {
  await db.collection('chats').add({
    player_name: msg.player_name,
    message: msg.message,
    createdAt: new Date().toISOString()
  });
}

async function getRecentChats(limit = 50) {
  const snap = await db.collection('chats')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => d.data()).reverse();
}

module.exports = { init, findPlayerByName, findPlayerById, findPlayerIdByToken, createPlayer, updatePlayer, saveChat, getRecentChats };
