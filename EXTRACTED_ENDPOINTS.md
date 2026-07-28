# EXTRACTED ENDPOINTS - وكر الأوغاد (Wild City AR)

## Source: script.package (ZIP, password: `AnansiLua`)
## Extracted Files:
- `full.lua` (734,157 bytes) - Main game logic + data tables
- `formula.lua` (4,986 bytes) - Game formulas (gym effects, hunting)
- `FullActivity.lua` (12,857 bytes) - Activity/achievement tracking + endpoint mapping

---

## Confirmed Endpoints (from FullActivity.lua)

These are mapped by HTTP numeric ID in the activity tracking system:

| ID | Endpoint | Chinese Name | Description |
|----|----------|-------------|-------------|
| 232 | `ReqDoCrime` | 历练 | Commit a crime |
| 213 | `ReqLevelUp` | 升级 | Level up |
| 301 | `ReqStrengthen` | 强化 | Strengthen equipment |
| 267 | `ReqFightNew` | - | Fight (PVP/PVE/Faction/Wanted/Dungeon) |
| 269 | `ReqFightCooperateBossNew` | 挑战遭遇战 | Cooperative boss fight |
| 214 | `ReqUpdateMoney` | 娱乐城 | Casino/Gambling (slots, blackjack, poker) |
| 251 | `ReqExcercise` | 健身房训练 | Gym exercise / Stat reset |
| 242 | `ReqPrisonBail` | 监狱保释 | Prison bail (pay to leave) |
| 243 | `ReqPrisonBust` | 监狱辩护 | Prison bust (break out) |
| 459 | `ReqEnterDungeon` | 进入探险 | Enter dungeon |
| 463 | `ReqPassLevel` | 通关探险 | Complete dungeon level |
| 429 | `ReqApplySubject` | 学院学习 | School / Study subject |
| 285 | `ReqGetSalery` | 打卡 | Get salary (check-in) |
| 254 | `ReqSubmitNews` | 发布广告 | Submit news / Advertise |
| 265 | `ReqRewardLoser` | 悬赏 | Bounty / Wanted reward |
| 292 | `ReqMergeGoods` | 兑换 | Merge/Exchange goods |
| 147 | `ReqChatPost` | 世界发言 | Chat post (world/guild) |
| 266 | `ReqFactionLoser` | 公会连击 | Faction combo chain |
| 189 | `ReqFactionJoinMilitia` | 公会团练 | Faction militia training |
| 234 | `ReqFlyTo` | 飞机出行 | Fly/Travel to another city |
| 568 | `ReqFAFightInfo` | 原力竞技 | Force arena fight info |
| 271 | `ReqLadderFighterJudgeNew` | 天梯战 | Ladder/ranked fight |

## Other Expected Endpoints (from server.js / C++ engine)

These are NOT in FullActivity.lua (not tracked for achievements) but are called by the C++ engine:

| Endpoint | Description |
|----------|-------------|
| `ReqLogin` | Login / Register |
| `ReqBuyGood` | Buy item from shop |
| `ReqSellGood` | Sell item |
| `ReqUseEquipment` | Equip/Unequip item |
| `ReqHospitalCure` | Heal in hospital |
| `ReqJoinJob` | Join a job |
| `ReqGetMissionInfo` | Get mission list |
| `ReqPlayerInfo` | Get player info by ID |

---

## Network Protocol

### Encryption Pipeline (from libcity_ar.so):
```
Client sends:
  JSON object
  → XOR encrypt (ngStringHelper::encryptXOR)
  → [optional] RC4 encrypt (ngRC414::EncryptWithKey)
  → [optional] Base64 encode (ngStringV2::Base64Encode)
  → HTTP POST to server

Server responds in same format.
```

### XOR Key:
```
"One ring to rule them all, one ring to find them, one ring to bring them all and in the darkness bind them."
```

### HTTP Headers (from SO):
```
User-Agent: Anansi/1.0
Content-Type: application/octet-stream (or text/plain for Base64)
X-Game-Checksum: (MD5 hash of body?)
```

### URL Format (from SO analysis):
The URL template `/%s/%s` exists in the SO, but the game also stores endpoint names directly as `ReqDoCrime`, `ReqLogin`, etc. The actual URL path is likely:

```
http://server:8080/ReqDoCrime
```

OR possibly with module prefix:
```
http://server:8080/game/ReqDoCrime
```

The catch-all sniffer should resolve the exact format.

---

## Lua Response Handlers (JudgeAdd functions)

From FullActivity.lua, the Lua callbacks expect these response fields:

| Endpoint | Lua Parses | Field Name |
|----------|-----------|------------|
| ReqDoCrime | crimeType | INT32 |
| ReqLevelUp | upLevelNum | INT32 |
| ReqPrisonBust | result (1=success) | INT32 |
| ReqChatPost | typ (0=world, 2=guild) | INT32 |
| ReqFightNew | typ + result | INT32 + INT32 |
| ReqUpdateMoney | typ (1-4 for casino type) | INT32 |
| ReqFactionLoser | typ + consisNum | INT32 + INT32 |
| ReqFactionJoinMilitia | localTroopIdx | INT32 |
| ReqExcercise | typ (1=reset, -1=train) | INT32 |
| ReqRewardLoser | fate (2=heavy hit) | INT32 |
| ReqEnterDungeon | isfristEnter (1=first time) | INT32 |
| ReqStrengthen | isSuccess (bool) | BOOLEAN |

---

## Lua Callback Functions (defined in full.lua)

Called by C++ engine after server response:
```
OnSendMail()
OnPostFight(isNPC, playerKey, result)
OnSendMoney(playerKey, money)
OnSendGift(playerKey, goodType, goodCate, amount)
OnGetSalary(amount)
OnGetMission()
OnCrimeDone()
OnChat()
OnUpdateInfo()
OnIntoHospital()
OnInGym()
OnJoinJob()
OnLevelUp()
OnDungeonFinish()
checkMission(taskName)
finishMission(mid)
updateMission(taskId, missionId)
getMissionInfoByMID(mid)
getTutorialInfoByTID(tid)
```

---

## Data Files (.city format)

All `.city` files in `assets/` are **binary data files** (NOT JSON). They use a proprietary binary format starting with a header containing file version and record count. Examples:
- `crime.city`: Crime definitions
- `weapon.city`: Weapon stats
- `equipment.city`: Equipment data
- `mission.city`: Mission definitions
- `exp.city`: Experience per level
- `cities.city`: City definitions
- `shop.city` (implied): Shop inventory

The `city_data.json` in the project is a pre-converted JSON export of these binary files.
