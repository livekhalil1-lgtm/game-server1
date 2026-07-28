# تحليل كود لعبة وكر الأوغاد (Wild City Mafia RPG)

## التحديث الأخير: 28 يوليو 2026 — اكتمال السيرفر

### ما تم إنجازه:
1. **22 API endpoint** — جميع الـ22 endpoint من FullActivity.lua (IDs 147–568)
2. **formula.lua** — مترجمة إلى JavaScript في game-logic.js (propMax, gymEffect, pourInEffect, upstarCost, costGold...)
3. **نظام المهام** — mission_data (54 مهمة) مدمجة مع finishMissionForPlayer(), checkMissionLevelUp()
4. **SQLite persistence** — عبر sql.js، كل اللاعبين والجلسات محفوظة في game_data.db
5. **LANG table** — 10,341 مفتاح (IDs 0–10340) مستخرجين من full.lua
6. **Smali analysis** — البروتوكول كاملًا في libcity_ar.so (CMsgCodec, encryptXOR, ngHttpClient)
7. **dual protocol handler** — السيرفر يقبل: XOR-only (للـtesting) و Base64+XOR (للـclient الأصلي)

### بنية السيرفر:
- `server.js` — Express server، 22 POST handler + REST APIs
- `game-logic.js` — فيزياء القتال، المعادلات، المهام، الجداول
- `database.js` — SQLite عبر sql.js، دوال CRUD
- `protocol.js` — XOR + Base64 encode/decode، واجهة بروتوكول مزدوجة
- `data/city_data.json` — 93 ملف .city محللين
- `data/rlString-ar.json` — 27 نص عربي (UI)
- `data/lang_table.json` — 10,341 مفتاح LANG من full.lua

### الـ 22 endpoint:
| Type ID | Handler | الحالة |
|---------|---------|--------|
| 232 | ReqDoCrime | ✅ |
| 213 | ReqLevelUp | ✅ |
| 301 | ReqStrengthen | ✅ |
| 267 | ReqFightNew | ✅ |
| 269 | ReqFightCooperateBossNew | ✅ |
| 214 | ReqUpdateMoney | ✅ (قمار) |
| 251 | ReqExcercise | ✅ (نادي رياضي) |
| 242 | ReqPrisonBail | ✅ |
| 243 | ReqPrisonBust | ✅ |
| 459 | ReqEnterDungeon | ✅ |
| 463 | ReqPassLevel | ✅ |
| 429 | ReqApplySubject | ✅ (مدرسة) |
| 285 | ReqGetSalery | ✅ |
| 254 | ReqSubmitNews | ✅ |
| 265 | ReqRewardLoser | ✅ |
| 292 | ReqMergeGoods | ✅ |
| 147 | ReqChatPost | ✅ |
| 266 | ReqFactionLoser | ✅ |
| 189 | ReqFactionJoinMilitia | ✅ |
| 234 | ReqFlyTo | ✅ |
| 568 | ReqFAFightInfo | ✅ |
| 271 | ReqLadderFighterJudgeNew | ✅ |
| - | ReqPlayerInfo | ✅ |
| - | ReqJoinJob | ✅ (إضافي) |
| - | ReqBuyGood | ✅ (إضافي) |
| - | ReqSellGood | ✅ (إضافي) |
| - | ReqUseEquipment | ✅ (إضافي) |
| - | ReqHospitalCure | ✅ (إضافي) |

### البروتوكول:
- **XOR key**: `"One ring to rule them all, one ring to find them, one ring to bring them all and in the darkness bind them."`
- طبقتان للترميز: 1) JSON → XOR → Base64، أو 2) JSON → XOR فقط
- السيرفر يكتشف التنسيق تلقائيًا
- الـnative library (libcity_ar.so) هو اللي يشغل HTTP client (CMsgCodec, encryptXOR, ngHttpClient)

### الـ Smali:
- `NGHttpSession.doPut()` — مجرد stub، كل البروتوكول في C++
- `lib/armeabi/libcity_ar.so` — 7.8 MB، فيه encryptXOR, decryptXOR, CMsgCodec, ngHttpClient, ngRC4Mnger
- الـ server URL (city-arab.anansigame.org:8080) مدمج في الـ .so
- تعديل URL يتطلب patching للـ .so أو proxy

### الخطوات القادمة:
1. تعديل APK ليشاور على localhost:8080 (patch .so أو reverse proxy)
2. إضافة systemd/tmux service production
3. UI للـ admin/web

---

## 1. نظام المهام (Mission System) — full.lua L14734-L19667
- **mission_data**: 54 مهمة معرفة، كل مهمة فيها:
  - `missionId`, `nextMission`, `branchMission` (chain/branch)
  - `tarProgress` (target progress count)
  - `doTimes` (how many times)
  - `rewardExp`, `rewardMoney`, `rewardGoodIdx`, `rewardGoodCate`, `rewardGoodAmount`
  - `isMainCity` (1=main storyline, -1=branch)
  - `tutorialId` (links to tutorial guide)

### Mission chain example:
- Mission 26 → 49 → (level 10) 
- Mission 27 → 22 → (attack player)
- Mission 28 → 30 → (do 5 crimes) → 36 → 37 → 38 → 40
- Level milestones: 10, 15, 30, 40
- Money milestone: 1,000,000

## 2. نظام الأحداث (Event Handlers) — full.lua L19682-L20150
### C++ → Lua callbacks (29 functions):
| Function | Params | Trigger |
|----------|--------|---------|
| OnJoinJob | jobCate, jobType | اشتغل وظيفة |
| OnBuyGoods | buyType, goodKey, goodCate, goodSubCate | اشترى شي |
| OnChat | type | تكلم في الشات |
| OnSendMail | — | أرسل بريد |
| OnFightFinish | isNPC, playerKey, result, type | قتال خلص |
| OnPostFight | isNPC, playerKey, result | بعد القتال |
| OnMakeFriend | playerKey | أضاف صديق |
| OnUpdateInfo | infoType | عدل معلوماته |
| OnBuyHouse | fromWhere, houseType, price | اشترى عقار |
| OnCheckInHouse | houseType | سكن في عقار |
| OnSellHouse | houseType | باع عقار |
| OnUseEquipment | useType(1=weapon,2=armor,3=mount), equipType, level | لبس سلاح/درع |
| OnCrimeDone | crimeType, result | خلص جريمة |
| OnLevelUp | level | رفع لفل |
| OnGetSalary | amount | أخذ راتب |
| OnInGym | gymType, usedEnergy | تمرن في النادي |
| OnCureSelf | fromWhere(0=hospital,1=medicine) | تعالج |
| OnUseGoldTool | goldToolType, p2, p3 | استخدم أداة ذهبية |
| OnDungeonFinish | idx, level, result | خلص زنزانة |
| OnExchangeGoods | mergeType, type, category, amount | بدّل items |
| OnReachCity | cityId | وصل لمدينة |
| OnFightFinish | isNPC, playerKey, result, type(0=pvp,1=faction, 6=ladder,7=dungeon) | قتال خلص |

## 3. أنواع القتال (ACT_FIGHT) — FullActivity.lua L107-L122
- 0: PVP
- 1: Faction (عصابة)
- 2: Wanted (مطلوب)
- 3: PVE
- 4: Club PVP
- 5: Boss War
- 6: Ladder (سلم)
- 7: Dungeon (زنزانة)
- 8: Competition
- 9: Cooperate (جماعي)
- 10: Skyscraper (برج)
- 11: King Fight
- 12: City War (حرب مدن)

## 4. نتائج القتال (ACT_RESULT) — FullActivity.lua L99-L104
- 1: SUCCESS (فوز)
- 2: FAIL (خسارة)
- 3: DRAW (تعادل)

## 5. أنواع الجرائم (من mission callbacks)
- crimeType 100:火车站 (محطة قطار)
- crimeType 101:立交桥 (جسر)
- crimeType 102:胡同 (زقاق)
- crimeType 105:戏院 (مسرح)

## 6. أنواع الوظائف
- 462: مطعم, 463: حانة, 464: سينما, 465: موسيقى
- 466: مكتب, 467: علوم, 468: مركز شرطة, 469: مستشفى
- 470: حكومة, 471: منجم, 472: عمل جسدي, 473: حر

كل وظيفة لها 6 مستويات: 1-6

## 7. فئات الأصناف (goodCate)
- 0: سلاح (weapon)
- 1: درع (armor/equipment)
- 2: مخدر/مستهلك (drug/consumable)
- 3: منتج/طعام (product/food)
- 4: بضاعة تجارية (trade goods)
- 5: أدوات مهمات (mission tools)
- 6: طعام خاص (special food)
- 9: أدوات (general items)

## 8. المباني (BUILDINGS)
0=كازينو, 1=مستشفى, 2=سجن, 3=حلبة قتال
4=سوق حراج, 5=بنك, 6=بورصة, 7=بلدية
8=متجر, 9=وظائف, 10=مطار, 11=نادي رياضي
12=مقر عصابة, 13=سوق أسود, 14=ممتلكات, 15=زواج
16=مدرسة, 18=إزالة سموم, 19=برج 101
20=زنزانات, 21=محل تقوية, 22=مزاد

## 9. API Endpoints (22 handlers)
ReqDoCrime(232), ReqLevelUp(213), ReqStrengthen(301),
ReqFightNew(267), ReqFightCooperateBossNew(269),
ReqUpdateMoney(214), ReqExcercise(251), ReqPrisonBail(242),
ReqPrisonBust(243), ReqEnterDungeon(459), ReqPassLevel(463),
ReqApplySubject(429), ReqGetSalery(285), ReqSubmitNews(254),
ReqRewardLoser(265), ReqMergeGoods(292), ReqChatPost(147),
ReqFactionLoser(266), ReqFactionJoinMilitia(189),
ReqFlyTo(234), ReqFAFightInfo(568), ReqLadderFighterJudgeNew(271)

## 10. معادلات اللعبة (formula.lua)
- **gymEffect** = (0.00328 * happiness + 0.55) * energy / 10
- **propMax** (merc) = floor(2500 * (quality^3 + star^(3.6 - (4-quality)*0.2)) / 1000) * 1000
- **restoreFeelingCost** = 50 * quality^2 * star^2 * (100 - mood)
- **pourInEffect** (equip score) = (attack+hit+dodge+def) * 1.3 * 0.4 + 100
- **upstarCost** = 200000 * 3^(quality-1) * star^2
- **costGold** (reroll) = max(min(5, cost), cost), cost = minusProp/(minusProp+100000)*2000
- **HGGetHitRegionWidth** = 1.0 * (hitRate/(hitRate+alert)) * (dist+1)/attackDist * 200

## 11. مفاتيح معروفة
- LOTR XOR key: "One ring to rule them all, one ring to find them, one ring to bring them all and in the darkness bind them."
- bkcrack ZipCrypto keys: k0=0x2F090CF8 k1=0xA9947346 k2=0x5DD55E35

## 12. مراجع الملفات
- `E:\waker E\city_ar_decompiled\extracted_script\full.lua` (20,250 lines) — main game code
- `E:\waker E\city_ar_decompiled\extracted_script\formula.lua` (166 lines) — game formulas
- `E:\waker E\city_ar_decompiled\extracted_script\FullActivity.lua` (421 lines) — API/activity definitions
- `C:\Users\khali\OneDrive\Desktop\نجربة جديد\assets\*.city` — 93 game data files
- `C:\Users\khali\OneDrive\Desktop\نجربة جديد\game-server\data\city_data.json` — parsed game data
- `C:\Users\khali\OneDrive\Desktop\نجربة جديد\game-server\data\rlString-ar.json` — 27 Arabic UI strings
