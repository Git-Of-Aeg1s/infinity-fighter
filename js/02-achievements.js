// 02-achievements：成就系统（注册表 ACHIEVEMENTS 见 01-config；本局进度 / 解锁判定 / 结算徽章展示 / 数值图鉴「成就」页）
//
// ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
// 被依赖：05-boss / 06-enemy / 07-player / 08-entities / 12-ui / 13-encyclopedia / 14-main
// 依赖：01-config（ACHIEVEMENTS 注册表与装备注册表）、02-core（state / bossFlow / resultAchieve / infoBody）
// 共享状态：成就进度收敛于本模块 achv 域（不经 state / bossFlow / levelFlow），随局重置经 resetAchievements
//   （12-ui resetGame 在 state.testBoss / state.challenge 置位之后调用——门控以这两项为准）
//   例外：state.achvBulwarkLowBoss（最后一搏）由 02-core tryBulwarkCheatDeath 写入——02-core 不得反向 import 本模块，
//   故经 state 中转，本模块只读并在 resetAchievements / achvOnBossKilled 消费
//
// 死亡原因标记（cause，damagePlayer 第 6 参 / 特殊死亡路径手工传入）：
//   'missile'        先兆者导弹击杀（damagePlayer 内由 src='missile' 派生）
//   'crash:<bossId>' BOSS 本体碰撞击杀（旧日之歌 / 暴风之眼 / 风暴编织者）
//   'boss:<bossId>'  BOSS 弹幕击杀（08-entities 敌弹命中按 owner 归属派生）
//   'burn:jiaoxiang' 焦香螺旋桨火环灼烧致死（06-enemy jiaoxiangBurn 专用路径）
//   'vortexPre'      暴风之眼涡流风旋就位（fly）阶段接触击杀
//   'laser:storm2'   风暴编织者技能1 电弧激光击杀
//
// 击杀来源标记（killSrc，killEnemy 同步窗口内消费，用完即清）：
//   'dagou'      大狗导弹雨击杀（07-player updateDagouMissiles / dagouMissileBlast）
//   'chixin'     炽心火环灼烧击杀（07-player updatePlayer 灼烧循环）
//   'bomb-keli'  可莉绷绷炸弹击杀（07-player useBomb，BOSS 击杀判定用）

  import { ACHIEVEMENTS, ACHIEVEMENT_TIERS, ACHIEVEMENT_TIER_ORDER, ACHIEVEMENT_INFINITY_ENABLED, ARMOR_SKILLS, ENEMY_CLASS, FIRST_ROUND_BOSSES, currentArmor, currentPilotMain, currentPilotSub, currentWingman, hasPilot } from './01-config.js';
  import { state, bossFlow, resultAchieve, infoBody } from './02-core.js';

  // ─── 本局成就进度域（resetAchievements 随局重置）───
  const achv = {
    unlocked: {},        // 成就 id → true（本局已获得）
    bombUsedEver: false, // 本局是否使用过爆弹（高能 / 绷绷）——齐宣王 / 「无垠」
    bombFirstInFinal: false, // 本局首次用弹是否发生在最终 BOSS 战（齐宣王）
    cheatUsed: false,    // 本局是否使用作弊（武器等级直设 / 8 / 9 连发开关）——无垠 / 无垠战机
    dagouCheatT: 0,      // 大狗导弹连发作弊累计时长（s；捣蛋来袭 ≥100s）
    damageTaken: false,  // 本局是否受过任何伤害（无垠 / 无垠战机 / 各 BOSS 无伤成就）
    bossNoHit: {},       // bossId → 当前 BOSS 战分段是否无伤（昨日今日明日 / 风暴航船 / 赫拉之眼）
    bossStartAt: 0,      // 当前 BOSS 战分段开始时刻（state.time，登场警报起算；持久战计时）
    bossDurMax: 0,       // 本局最长单段 BOSS 战时长（s；持久战 ≥120，暴风之眼与风暴编织者各算一段）
    currentBoss: null,   // 当前在场的 BOSS id（spawnBoss 登记；齐宣王「最终BOSS战」判定）
    wingmanBlocked: 0,   // 守愿者白盾挡弹计数（守愿加护 >100）
    zidianHits: 0,       // 紫电侧翼艇亡语弹命中次数（饿啊 ≥3）
    douzhiKills: 0,      // 斗志昂扬击杀数（斗志非常昂扬 ≥2）
    killsTotal: 0,       // 敌机击坠总数（非 BOSS；狂暴开杀 ≥200）
    pickups: 0,          // 道具拾取数（水晶不算；UPUPUP ≥15）
    watchClears: 0,      // 群星守望消除敌弹数（群星不灭 ≥60）
    chixinClass1Kills: 0,// 炽心灼烧击杀 1 类敌人数（飞蛾扑火 ≥20）
    lingluoSkillCount: 0,// 陵落 Q 技能成功释放次数（疯狂杀戮 ≥3）
    armorSkillUsed: false, // 本局是否使用过装甲技能（F；忘了）
    pilotSkillUsed: false, // 本局是否使用过驾驶员主动技能（Q；忘了）
    baolingWindow: false,// 暴鸰殉爆结算窗口中（砰砰 / 砰砰礼物——单次爆炸击杀数）
    baolingKills: 0,     // 当前殉爆窗口击杀数
    _baolingPrev: 0,     // 外层殉爆窗口计数暂存（嵌套殉爆互不影响）
    killSrc: null,       // 击杀来源标记（'dagou' | 'chixin' | 'bomb-keli'；同步窗口内消费）
    songDown: false,     // 第一轮 BOSS（旧日之歌）已被击败（萎靡不振——击败前掉命判定）
    chengyueDry: 0,      // 澄月：连续暴走未触发护盾的判定次数（非非 ≥5；触发护盾即清零）
    maxinSlowT: 0,       // 马兴犬低速模式连续时长（s；鳖爬 ≥30）
    maxinFastT: 0,       // 马兴犬高速模式连续时长（s；冲刺冲刺 ≥120）
    huiHealTotal: 0,     // 洄累计治疗量（时流回溯 ≥100；含每 2s 回复与击败 BOSS 回复）
    lanxinShieldBoss: false, // 当前结晶护盾开启于 BOSS 战（云心）
    lanxinShieldAbsorb: 0,   // 当前结晶护盾存续期间气泡消解的敌弹数（云心）
    dagouChain3N: 0,     // 大狗：完成「连射 3 轮」的链序列数（欧欧欧 ≥2）
    dagouChain4N: 0,     // 大狗：完成「连射 4 轮」的链序列数（！？欧欧？！ ≥1）
    _dagouSeqC3: false,  // 当前链序列已计 3 轮（同序列 4 轮不重复计 3 轮）
    _dagouSeqC4: false,  // 当前链序列已计 4 轮
    auraFieldKills: 0,   // 御4力场 / 铁砧光圈内击坠数（其实是打不到 ≥12）
  };

  // 测试 / 图鉴挑战模式不产出任何成就
  function achvGateOk() {
    return !state.challenge && !state.testBoss;
  }

  // 解锁成就（去重；仅正常流程生效）
  function unlockAchievement(id) {
    if (!achvGateOk() || achv.unlocked[id]) return;
    achv.unlocked[id] = true;
    console.log('[成就] ' + ACHIEVEMENTS[id].name);
  }

  // ─── 事件挂点（各模块调用）───

  // BOSS 登场（05-boss spawnBoss）：登记当前 BOSS、开始计时、重置该分段无伤标记
  function achvNoteBossSpawned(bossId) {
    if (!achvGateOk()) return;
    achv.currentBoss = bossId;
    achv.bossStartAt = state.time;
    achv.bossNoHit[bossId] = true;
  }

  // 玩家受到伤害（damagePlayer 结算路径 / 焦香灼烧 / 暴风之眼持续接触）：打无伤标记
  function achvNoteDamage() {
    if (!achvGateOk()) return;
    achv.damageTaken = true;
    if (bossFlow.stage === 'fight' && achv.currentBoss) achv.bossNoHit[achv.currentBoss] = false;
  }

  // 玩家掉命（damagePlayer 死亡分支 / 焦香灼烧致死 / 暴风之眼持续接触致死）。
  // finalDeath=false：仍有余命（仅"每条命均可"类成就在此即时解锁）；true：最后一命陨落
  function achvOnDeath(cause, finalDeath) {
    if (!achvGateOk()) return;
    if (cause === 'missile') unlockAchievement('missileDeath');   // 每条命均可
    // 铜皮难顶：装备铜皮夏勇时被击坠（每条命均可）
    if (currentArmor.id === 'tongpi') unlockAchievement('tongpiDeath');
    // 萎靡不振：使用许凯狗时，第一轮 BOSS（旧日之歌）被击败前掉命（每条命均可）
    if (hasPilot('xukaigou') && !achv.songDown) unlockAchievement('xukaiPreBossDeath');
    if (!finalDeath) return;
    if (typeof cause === 'string' && cause.startsWith('crash:')) {
      const bid = cause.slice(6);
      if (FIRST_ROUND_BOSSES.includes(bid)) unlockAchievement('firstBossCrashDeath');
      if (bid === 'storm') unlockAchievement('stormCrashDeath');
    }
    if (cause === 'boss:song' || cause === 'crash:song') unlockAchievement('songDeath');
    if (cause === 'burn:jiaoxiang') unlockAchievement('burnDeath');
    if (cause === 'vortexPre') unlockAchievement('vortexPreDeath');
    if (cause === 'laser:storm2') unlockAchievement('laserStorm2Death');
    // 至尊陨落：陨落时首个 BOSS 尚未登场（phase 0 且处于刷怪段 / 等待清场段——警报与战斗均视为"已抵达"）
    if (bossFlow.phase === 0 && (bossFlow.stage === 'none' || bossFlow.stage === 'wait')) unlockAchievement('deathBeforeBoss');
    // 答辩：陨落时分数不足 1w
    if (state.score < 10000) unlockAchievement('lowScoreDeath');
  }

  // 敌机被击毁（killEnemy 入口，重入保护之后；BOSS 分支另走 achvOnBossKilled）
  function achvOnKill(e) {
    if (!e || !achvGateOk()) return;
    if (e.type === 'douzhi') {
      achv.douzhiKills++;
      if (achv.douzhiKills >= 2) unlockAchievement('douzhi2');
    }
    if (e.type !== 'boss') {
      achv.killsTotal++;
      if (achv.killsTotal >= 200) unlockAchievement('kill200');
    }
    if (achv.killSrc === 'dagou' && e.type === 'harbinger') unlockAchievement('dagouHarbinger');
    if (achv.killSrc === 'chixin' && (e.type === 'hanshuang' || e.type === 'jiaoxiang')) unlockAchievement('chixinBurnKill');
    if (achv.killSrc === 'chixin' && ENEMY_CLASS[e.type] === 1) {
      achv.chixinClass1Kills++;
      if (achv.chixinClass1Kills >= 20) unlockAchievement('chixinClass1');
    }
    if (achv.baolingWindow) {
      achv.baolingKills++;   // 殉爆波及击杀（含连锁引爆的另一只暴鸰；自身被 t === e 排除）
    }
  }

  // 暴鸰殉爆结算窗口（06-enemy detonateBaoling 在清扫循环前后调用；嵌套殉爆以暂存互不影响）。
  // 窗口结束时按单次爆炸击坠数独立判定：≥6 砰砰礼物 / ≥3 砰砰（非互斥——≥6 时两者同时解锁）
  function achvBaolingBlastBegin() {
    achv._baolingPrev = achv.baolingKills;
    achv.baolingKills = 0;
    achv.baolingWindow = true;
  }
  function achvBaolingBlastEnd() {
    const n = achv.baolingKills;
    achv.baolingWindow = false;
    achv.baolingKills = achv._baolingPrev || 0;
    if (n >= 3) unlockAchievement('baoling3');
    if (n >= 6) unlockAchievement('baoling5');
  }

  // 道具拾取（08-entities applyPowerupPickup；水晶不走该路径不计；UPUPUP ≥15）
  function achvNotePickup() {
    if (!achvGateOk()) return;
    achv.pickups++;
    if (achv.pickups >= 15) unlockAchievement('pickup15');
  }

  // 群星守望消弹（06-enemy 击杀触发点上报实际消除数；群星不灭 ≥60）
  function achvNoteWatchClear(n) {
    if (!achvGateOk() || !n) return;
    achv.watchClears += n;
    if (achv.watchClears >= 60) unlockAchievement('watch60');
  }

  // 支援光环内击坠上报（06-enemy killEnemy 判定 inSupportAura 后调用；其实是打不到 ≥12）
  function achvNoteAuraFieldKill() {
    if (!achvGateOk()) return;
    achv.auraFieldKills++;
    if (achv.auraFieldKills >= 12) unlockAchievement('inFieldKill12');
  }

  // 陵落 Q 技能成功释放（07-player triggerPilotSkill；疯狂杀戮 ≥3）
  function achvNoteLingluoSkill() {
    if (!achvGateOk()) return;
    achv.lingluoSkillCount++;
    if (achv.lingluoSkillCount >= 3) unlockAchievement('lingluo3');
  }

  // 技能使用标记（忘了）：装甲技能 F / 驾驶员主动技能 Q 实际释放成功时置位
  function achvNoteArmorSkillUsed() { achv.armorSkillUsed = true; }
  function achvNotePilotSkillUsed() { achv.pilotSkillUsed = true; }

  // 忘了：装备了带主动技能的护甲（ARMOR_SKILLS 注册）或驾驶员（天秀 / 陵落），整局从未使用过任何技能
  function achvCheckForgotSkill() {
    const hasSkillEquip = !!ARMOR_SKILLS[currentArmor.id] || hasPilot('tianxiu') || hasPilot('lingluo');
    if (hasSkillEquip && !achv.armorSkillUsed && !achv.pilotSkillUsed) unlockAchievement('forgotSkill');
  }

  // BOSS 被击败（killEnemy BOSS 分支；须在 spawnBoss('storm2') 阶段切换之前调用）
  function achvOnBossKilled(bossId) {
    if (!achvGateOk()) return;
    // 持久战：记录本段 BOSS 战时长（登场起算；暴风之眼 / 风暴编织者各算一段，取最长）
    const dur = Math.max(0, state.time - (achv.bossStartAt || 0));
    if (dur > achv.bossDurMax) achv.bossDurMax = dur;
    // 无伤击败（各段独立判定；须整局未开启过作弊——昨日今日明日 / 风暴航船 / 赫拉之眼）
    if (achv.bossNoHit[bossId] && !achv.cheatUsed) {
      if (bossId === 'song') unlockAchievement('songPerfect');
      else if (bossId === 'storm') unlockAchievement('stormPerfect');
      else if (bossId === 'storm2') unlockAchievement('storm2Perfect');
    }
    if (bossId === 'song') {
      unlockAchievement('faceSong');
      achv.songDown = true;   // 萎靡不振：第一轮 BOSS 已被击败（此后掉命不再判定）
    }
    else if (bossId === 'storm') unlockAchievement(hasPilot('tianxiu') ? 'stormWithTianxiu' : 'stormWithoutTianxiu');
    else if (bossId === 'storm2') unlockAchievement('defeatStorm2');
    // 最后一搏：不死触发瞬间登记的低血量 BOSS 被击败（登记见 02-core tryBulwarkCheatDeath）
    if (state.achvBulwarkLowBoss && state.achvBulwarkLowBoss === bossId) {
      unlockAchievement('bulwarkLastBlow');
      state.achvBulwarkLowBoss = null;
    }
    // 轰轰火花：绷绷炸弹击杀任意 BOSS（useBomb 设置的 killSrc 同步窗口内）
    if (achv.killSrc === 'bomb-keli') unlockAchievement('keliBombBoss');
  }

  // 使用爆弹（07-player useBomb 非挑战路径）——齐宣王：本局首次用弹发生在最终 BOSS 战，且在最终 BOSS 战内打空全部库存
  function achvOnBombUsed() {
    if (!achvGateOk()) return;
    if (!achv.bombUsedEver && bossFlow.stage === 'fight' && achv.currentBoss === 'storm2') achv.bombFirstInFinal = true;
    achv.bombUsedEver = true;
    if (achv.bombFirstInFinal && bossFlow.stage === 'fight' && achv.currentBoss === 'storm2' && state.bombs <= 0) {
      unlockAchievement('qixuanwang');
    }
  }

  // 击杀来源标记（killEnemy 同步窗口内消费；各设置方用完必须 achvClearKillSrc）
  function achvSetKillSrc(src) { achv.killSrc = src; }
  function achvClearKillSrc() { achv.killSrc = null; }

  // 作弊使用（14-main：8 / 9 连发开关开启、0+1~5 武器等级直设）——无垠 / 无垠战机排除项
  function achvNoteCheat() {
    if (!achvGateOk()) return;
    achv.cheatUsed = true;
  }

  // 大狗导弹连发作弊累计时长（07-player updatePlayer 连发模式下逐帧累加；捣蛋来袭 ≥100s）
  function achvAddDagouCheat(dt) {
    if (!achvGateOk()) return;
    achv.dagouCheatT += dt;
    if (achv.dagouCheatT >= 100) unlockAchievement('dagouCheat100');
  }

  // 守愿者白盾挡下一发直射弹（08-entities 普通弹吸收分支；守愿加护 >100）
  function achvWingmanBlock() {
    if (!achvGateOk()) return;
    achv.wingmanBlocked++;
    if (achv.wingmanBlocked > 100) unlockAchievement('bulwark100');
  }

  // 被紫电侧翼艇亡语弹命中（08-entities 敌弹命中分支，owner.deathShot 识别；饿啊 ≥3）
  function achvZidianHit() {
    if (!achvGateOk()) return;
    achv.zidianHits++;
    if (achv.zidianHits >= 3) unlockAchievement('zidianHits3');
  }

  // 澄月护盾判定结果（07-player tryChengyueShield；非非：连续 5 次暴走判定均未触发护盾，触发即清零）
  function achvNoteChengyueRoll(triggered) {
    if (!achvGateOk()) return;
    if (triggered) { achv.chengyueDry = 0; return; }
    achv.chengyueDry++;
    if (achv.chengyueDry >= 5) unlockAchievement('chengyueDry5');
  }

  // 哈基米大王当前闪避概率上报（07-player 闪避失败累积步进后调用；哦非非 ≥60%）
  function achvNoteHajimiDodge(p) {
    if (!achvGateOk()) return;
    if (p >= 0.6 - 0.0001) unlockAchievement('hajimiDodge60');
  }

  // 祈星减半生效且原伤害 ≥50（07-player damagePlayer 减半分支；繁星赐福）
  function achvNoteQixingBigHalve() {
    if (!achvGateOk()) return;
    unlockAchievement('qixingBigHalve');
  }

  // 马兴犬移速模式逐帧上报（07-player updatePilotStatus；mul <1 低速 / >1 高速 / 否则复位。
  // 连续计时：低速 ≥30s 鳖爬 / 高速 ≥120s 冲刺冲刺；切换模式即清零对方与自身）
  function achvNoteMaxinSpeed(mul, dt) {
    if (!achvGateOk()) return;
    if (mul < 1) {
      achv.maxinSlowT += dt;
      achv.maxinFastT = 0;
      if (achv.maxinSlowT >= 30) unlockAchievement('maxinSlow30');
    } else if (mul > 1) {
      achv.maxinFastT += dt;
      achv.maxinSlowT = 0;
      if (achv.maxinFastT >= 120) unlockAchievement('maxinFast120');
    } else {
      achv.maxinSlowT = 0;
      achv.maxinFastT = 0;
    }
  }

  // 洄治疗量上报（07-player 每 2s 回复 / 06-enemy 击败 BOSS 回复，均按实际结算量；时流回溯 ≥100）
  function achvNoteHuiHeal(amount) {
    if (!achvGateOk() || !(amount > 0)) return;
    achv.huiHealTotal += amount;
    if (achv.huiHealTotal >= 100) unlockAchievement('huiHeal100');
  }

  // 七日澜心结晶护盾开启（07-player triggerArmorSkill；云心：BOSS 战中开启 + 存续期消除 ≥60 发）
  function achvNoteLanxinShieldStart(bossFight) {
    if (!achvGateOk()) return;
    achv.lanxinShieldBoss = !!bossFight;
    achv.lanxinShieldAbsorb = 0;
  }

  // 结晶护盾气泡消解敌弹计数（08-entities 护盾消解分支，仅结晶护盾期间；云心）
  function achvNoteLanxinAbsorb() {
    if (!achvGateOk()) return;
    achv.lanxinShieldAbsorb++;
  }

  // 结晶护盾消失：扩散波消弹数上报，与存续期消解数合并判定（07-player 护盾到期分支；云心 ≥60）
  function achvNoteLanxinShieldEnd(cleared) {
    if (!achvGateOk()) return;
    if (achv.lanxinShieldBoss && achv.lanxinShieldAbsorb + (cleared || 0) >= 60) unlockAchievement('lanxinShield60');
    achv.lanxinShieldBoss = false;
    achv.lanxinShieldAbsorb = 0;
  }

  // 凌漓弹幕清除冲击波上报（07-player lingliBurst；清除空气：实际消除数为 0）
  function achvNoteLingliBurst(cleared) {
    if (!achvGateOk()) return;
    if (!cleared) unlockAchievement('lingliAirClear');
  }

  // 大无垠之王增伤累积上报（07-player updatePilotStatus BOSS 战累积处；陷入疯狂 ≥50% / 彻底疯狂 ≥80%）
  function achvNoteKingDmg(v) {
    if (!achvGateOk()) return;
    if (v >= 0.5) unlockAchievement('kingMad50');
    if (v >= 0.8) unlockAchievement('kingMad80');
  }

  // 陵落 Q 技能开启后血量降为 1（07-player triggerPilotSkill 扣血结算后调用；命定之死）
  function achvNoteLingluoHp1() {
    if (!achvGateOk()) return;
    unlockAchievement('lingluoHp1');
  }

  // 大狗导弹连射链上报（07-player launchDagouWave；lv = 连射层级，0/缺省 = 常规波——新序列起点）。
  // 「连射 N 轮」= 单条链序列总发射 N 波（1 轮常规 + N-1 次连射，序列自常规波起算、跨序列不累计）：
  //   欧欧欧 = 达成 2 次「连射 3 轮」（1 常规 + 2 连射，lv 达 2）；！？欧欧？！ = 达成 1 次「连射 4 轮」（lv 达 3）
  function achvNoteDagouChain(lv) {
    if (!achvGateOk()) return;
    if (!lv || lv < 1) {   // 常规波：开启新链序列
      achv._dagouSeqC3 = false;
      achv._dagouSeqC4 = false;
      return;
    }
    if (lv >= 2 && !achv._dagouSeqC3) {
      achv._dagouSeqC3 = true;
      achv.dagouChain3N++;
      if (achv.dagouChain3N >= 2) unlockAchievement('dagouChain3');
    }
    if (lv >= 3 && !achv._dagouSeqC4) {
      achv._dagouSeqC4 = true;
      achv.dagouChain4N++;
      if (achv.dagouChain4N >= 1) unlockAchievement('dagouChain4');
    }
  }

  // 胜利结算评估（14-main 胜利分支，showOverlay 之前调用）——持久战 / 守望者 / 无垠战机 / 「无垠」/ 忘了
  function achvEvaluateVictory() {
    if (!achvGateOk()) return;
    if (achv.bossDurMax >= 120) unlockAchievement('bossMarathon');
    const noBulwark = currentWingman.id !== 'bulwark';
    // 守望者：无伤、不作弊，且装备守愿者通关
    if (!achv.damageTaken && !achv.cheatUsed && currentWingman.id === 'bulwark') unlockAchievement('watchkeeper');
    if (!achv.damageTaken && noBulwark && !achv.cheatUsed) unlockAchievement('infinityFighter');
    const pilotClean = (p) => p.empty || p.whiteboard;
    // 白板驾驶员通关：温酒客（九克之王）/ 胡笛客（卑鄙笛客）/ 萧杨（阴险萧杨）
    if (hasPilot('wenjiuke')) unlockAchievement('wenjiukeWin');
    if (hasPilot('hudike')) unlockAchievement('hudikeWin');
    if (hasPilot('xiaoyang')) unlockAchievement('xiaoyangWin');
    if (ACHIEVEMENT_INFINITY_ENABLED && !achv.damageTaken && !achv.cheatUsed && !achv.bombUsedEver &&
        noBulwark && currentArmor.noEffect && pilotClean(currentPilotMain) && pilotClean(currentPilotSub)) {
      unlockAchievement('infinity');
    }
    achvCheckForgotSkill();   // 忘了：整局（胜利局同样）未使用任何已装备主动技能
  }

  // 失败结算评估（12-ui endGame 调用）——忘了（整局未使用已装备主动技能；失败局同样结算）
  function achvEvaluateDefeat() {
    if (!achvGateOk()) return;
    achvCheckForgotSkill();
  }

  // 随局重置（12-ui resetGame；须在 state.testBoss / state.challenge 置位之后调用）
  function resetAchievements() {
    for (const k in achv.unlocked) delete achv.unlocked[k];
    achv.bombUsedEver = false;
    achv.bombFirstInFinal = false;
    achv.cheatUsed = false;
    achv.dagouCheatT = 0;
    achv.damageTaken = false;
    achv.bossNoHit = {};
    achv.bossStartAt = 0;
    achv.bossDurMax = 0;
    achv.currentBoss = null;
    achv.wingmanBlocked = 0;
    achv.zidianHits = 0;
    achv.douzhiKills = 0;
    achv.killsTotal = 0;
    achv.pickups = 0;
    achv.watchClears = 0;
    achv.chixinClass1Kills = 0;
    achv.lingluoSkillCount = 0;
    achv.armorSkillUsed = false;
    achv.pilotSkillUsed = false;
    achv.baolingWindow = false;
    achv.baolingKills = 0;
    achv._baolingPrev = 0;
    achv.killSrc = null;
    achv.songDown = false;
    achv.chengyueDry = 0;
    achv.maxinSlowT = 0;
    achv.maxinFastT = 0;
    achv.huiHealTotal = 0;
    achv.lanxinShieldBoss = false;
    achv.lanxinShieldAbsorb = 0;
    achv.dagouChain3N = 0;
    achv.dagouChain4N = 0;
    achv._dagouSeqC3 = false;
    achv._dagouSeqC4 = false;
    achv.auraFieldKills = 0;
    state.achvBulwarkLowBoss = null;   // 最后一搏：低血 BOSS 登记（02-core tryBulwarkCheatDeath 写入）
  }

  // ─── 展示：徽章 DOM / 悬停详情 / 结算页 / 数值图鉴「成就」页 ───

  // 构建单个成就徽章：标签造型背景（CSS 分档位质感）+ 中央圆形具体图标
  function buildAchvBadge(id) {
    const a = ACHIEVEMENTS[id];
    const el = document.createElement('div');
    el.className = 'achv-badge achv-' + a.tier;
    const glyph = document.createElement('span');
    glyph.className = 'achv-glyph';
    glyph.textContent = a.icon;
    el.appendChild(glyph);
    return el;
  }

  // 悬停详情浮层（单例，挂 body）
  let achvTip = null;
  function ensureAchvTip() {
    if (achvTip) return achvTip;
    achvTip = document.createElement('div');
    achvTip.className = 'achv-tooltip hidden';
    document.body.appendChild(achvTip);
    return achvTip;
  }
  function achvTipHtml(id) {
    const a = ACHIEVEMENTS[id];
    const tier = ACHIEVEMENT_TIERS[a.tier];
    // （等级行已按要求移除——档位信息由徽章配色自明）
    let html = '<div class="achv-tip-name" style="color:' + tier.color + '">' + a.name + '</div>'
      + '<div class="achv-tip-desc">' + a.desc + '</div>';
    if (a.holders) {
      html += '<div class="achv-tip-holders">' +
        (a.holders.length ? '已完成 ' + a.holders.length + ' 人：' + a.holders.join('、') : '暂无完成者') + '</div>';
    }
    if (a.finalOnly && !ACHIEVEMENT_INFINITY_ENABLED) html += '<div class="achv-tip-locked">仅最终版本开放获得</div>';
    return html;
  }
  function bindAchvTip(el, id) {
    el.addEventListener('mouseenter', () => {
      const t = ensureAchvTip();
      t.innerHTML = achvTipHtml(id);
      t.classList.remove('hidden');
    });
    el.addEventListener('mousemove', (ev) => {
      const t = ensureAchvTip();
      const pad = 14;
      const w = t.offsetWidth || 240, h = t.offsetHeight || 90;
      let x = ev.clientX + pad, y = ev.clientY + pad;
      if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
      if (y + h > window.innerHeight - 8) y = ev.clientY - h - pad;
      t.style.left = Math.max(8, x) + 'px';
      t.style.top = Math.max(8, y) + 'px';
    });
    el.addEventListener('mouseleave', () => {
      if (achvTip) achvTip.classList.add('hidden');
    });
  }

  // 结算页「获得成就」区渲染（胜利 / 失败结算通用；本局无成就时隐藏区块）
  // 档位按稀有度从高到低排列（长歌 → 虚象），同档内保持注册表键序
  function renderResultAchievements() {
    if (!resultAchieve) return;
    const area = resultAchieve.querySelector('.result-achieve-area');
    if (!achvGateOk() || !area) { resultAchieve.classList.add('hidden'); return; }
    area.innerHTML = '';
    let any = false;
    for (let t = ACHIEVEMENT_TIER_ORDER.length - 1; t >= 0; t--) {
      const tier = ACHIEVEMENT_TIER_ORDER[t];
      for (const id in ACHIEVEMENTS) {
        if (ACHIEVEMENTS[id].tier !== tier || !achv.unlocked[id]) continue;
        const badge = buildAchvBadge(id);
        bindAchvTip(badge, id);
        area.appendChild(badge);
        any = true;
      }
    }
    resultAchieve.classList.toggle('hidden', !any);
  }

  // 数值与机制图鉴「成就」页（13-encyclopedia 调度）：按档位分组收录 + 档位筛选标签
  let infoAchvTier = 'all';   // 当前选中的档位筛选（'all' = 全部；仅图鉴 UI 局部状态，不归 state 域）
  function renderInfoAchievements() {
    if (!infoBody) return;
    infoBody.innerHTML = '';
    // 档位筛选标签：样式复用「怪物权重」页的 subtabs / chip（切换后仅渲染对应档位分组）
    const chips = document.createElement('div');
    chips.className = 'info-subtabs';
    const defs = [{ id: 'all', name: '全部' },
      ...ACHIEVEMENT_TIER_ORDER.map(t => ({ id: t, name: ACHIEVEMENT_TIERS[t].name }))];
    for (const d of defs) {
      const b = document.createElement('button');
      b.className = 'info-chip' + (infoAchvTier === d.id ? ' active' : '');
      b.textContent = d.name;
      b.addEventListener('click', () => { infoAchvTier = d.id; renderInfoAchievements(); });
      chips.appendChild(b);
    }
    infoBody.appendChild(chips);
    for (const tier of ACHIEVEMENT_TIER_ORDER) {
      if (infoAchvTier !== 'all' && tier !== infoAchvTier) continue;   // 筛选：仅渲染选中档位
      const meta = ACHIEVEMENT_TIERS[tier];
      const head = document.createElement('h3');
      head.className = 'info-achv-tier-head';
      head.textContent = meta.name;
      head.style.color = meta.color;
      infoBody.appendChild(head);
      for (const id in ACHIEVEMENTS) {
        const a = ACHIEVEMENTS[id];
        if (a.tier !== tier) continue;
        const card = document.createElement('div');
        card.className = 'info-wave-card info-achv-card';
        const row = document.createElement('div');
        row.className = 'info-achv-row';
        const badge = buildAchvBadge(id);
        bindAchvTip(badge, id);
        const name = document.createElement('h4');
        name.textContent = a.name;
        name.style.color = meta.color;
        row.append(badge, name);
        const body = document.createElement('p');
        body.innerHTML = a.desc +
          (a.holders
            ? (a.holders.length ? '<br />已完成 ' + a.holders.length + ' 人：' + a.holders.join('、') : '<br />暂无完成者')
            : '') +
          (a.finalOnly && !ACHIEVEMENT_INFINITY_ENABLED ? '<br /><i>仅最终版本开放获得</i>' : '');
        card.append(row, body);
        infoBody.appendChild(card);
      }
    }
  }

  export {
    achv, unlockAchievement, achvNoteBossSpawned, achvNoteDamage, achvOnDeath, achvOnKill, achvOnBossKilled,
    achvOnBombUsed, achvSetKillSrc, achvClearKillSrc, achvNoteCheat, achvAddDagouCheat, achvWingmanBlock,
    achvZidianHit, achvBaolingBlastBegin, achvBaolingBlastEnd, achvNotePickup, achvNoteWatchClear,
    achvNoteLingluoSkill, achvNoteArmorSkillUsed, achvNotePilotSkillUsed, achvEvaluateVictory,
    achvEvaluateDefeat, resetAchievements, buildAchvBadge, renderResultAchievements, renderInfoAchievements,
    achvNoteChengyueRoll, achvNoteHajimiDodge, achvNoteQixingBigHalve, achvNoteMaxinSpeed, achvNoteHuiHeal,
    achvNoteLanxinShieldStart, achvNoteLanxinAbsorb, achvNoteLanxinShieldEnd, achvNoteLingliBurst,
    achvNoteKingDmg, achvNoteLingluoHp1, achvNoteDagouChain, achvNoteAuraFieldKill,
  };
