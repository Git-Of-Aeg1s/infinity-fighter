// 02-achievements：成就系统（注册表 ACHIEVEMENTS 见 01-config；本局进度 / 解锁判定 / 结算徽章展示 / 数值图鉴「成就」页）
//
// ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
// 被依赖：05-boss / 06-enemy / 07-player / 08-entities / 12-ui / 13-encyclopedia / 14-main
// 依赖：01-config（ACHIEVEMENTS 注册表与装备注册表）、02-core（state / bossFlow / resultAchieve / infoBody）
// 共享状态：成就进度收敛于本模块 achv 域（不经 state / bossFlow / levelFlow），随局重置经 resetAchievements
//   （12-ui resetGame 在 state.testBoss / state.challenge 置位之后调用——门控以这两项为准）
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
  // 窗口结束时按单次爆炸击杀数判定：≥5 砰砰礼物 / ≥3 砰砰
  function achvBaolingBlastBegin() {
    achv._baolingPrev = achv.baolingKills;
    achv.baolingKills = 0;
    achv.baolingWindow = true;
  }
  function achvBaolingBlastEnd() {
    const n = achv.baolingKills;
    achv.baolingWindow = false;
    achv.baolingKills = achv._baolingPrev || 0;
    if (n >= 5) unlockAchievement('baoling5');
    else if (n >= 3) unlockAchievement('baoling3');
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
    // 无伤击败（各段独立判定）
    if (achv.bossNoHit[bossId]) {
      if (bossId === 'song') unlockAchievement('songPerfect');
      else if (bossId === 'storm') unlockAchievement('stormPerfect');
      else if (bossId === 'storm2') unlockAchievement('storm2Perfect');
    }
    if (bossId === 'song') unlockAchievement('faceSong');
    else if (bossId === 'storm') unlockAchievement(hasPilot('tianxiu') ? 'stormWithTianxiu' : 'stormWithoutTianxiu');
    else if (bossId === 'storm2') unlockAchievement('defeatStorm2');
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

  // 胜利结算评估（14-main 胜利分支，showOverlay 之前调用）——持久战 / 守望者 / 无垠战机 / 「无垠」/ 忘了
  function achvEvaluateVictory() {
    if (!achvGateOk()) return;
    if (achv.bossDurMax >= 120) unlockAchievement('bossMarathon');
    const noBulwark = currentWingman.id !== 'bulwark';
    // 守望者：无伤、不作弊，且装备守愿者通关
    if (!achv.damageTaken && !achv.cheatUsed && currentWingman.id === 'bulwark') unlockAchievement('watchkeeper');
    if (!achv.damageTaken && noBulwark && !achv.cheatUsed) unlockAchievement('infinityFighter');
    const pilotClean = (p) => p.empty || p.whiteboard;
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
    let html = '<div class="achv-tip-name" style="color:' + tier.color + '">' + a.name + '</div>'
      + '<div class="achv-tip-tier">等级：' + tier.name + '</div>'
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
  function renderResultAchievements() {
    if (!resultAchieve) return;
    const area = resultAchieve.querySelector('.result-achieve-area');
    if (!achvGateOk() || !area) { resultAchieve.classList.add('hidden'); return; }
    area.innerHTML = '';
    let any = false;
    for (const tier of ACHIEVEMENT_TIER_ORDER) {
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

  // 数值与机制图鉴「成就」页（13-encyclopedia 调度）：按档位分组全量收录
  function renderInfoAchievements() {
    if (!infoBody) return;
    infoBody.innerHTML = '';
    for (const tier of ACHIEVEMENT_TIER_ORDER) {
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
  };
