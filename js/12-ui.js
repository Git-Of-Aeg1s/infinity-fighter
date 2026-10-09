// 12-ui：HUD 更新 / 流程控制（resetGame / 暂停 / 结算）/ 选机与僚机卡片

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：07-player(1 名) 13-encyclopedia(1 名) 14-main(13 名)
  // 本文件写共享状态（state/bossFlow/levelFlow 属性赋值；新增属性先在 02-core 归域声明）：
  //   state.{bombs, challenge, crystalMagnetMul, demo, flash, hasteT, hpKitBanked, hpKitLastT, hurt, lives, mode, orangeBombUsed, paused, score, shakeMag, shakeTime, testBoss, time, victoryOverlay, laodaT, laodaMul, magnetBonus, swordStormT, swordStormAng, swordStormAcc, frostField, bombCapAdd, bengbagGot, jiukeT, jiukeDodgePct, gachaFx, gachaStones, gachaReady, itemPickFx}  levelFlow.{capitalIdleT, douzhiSkipOnce, hpKitWaveCd, jiaoxiang13Done, level, lowPressureT, prevLevel, poemClearNext, poemClearT, poemWaveIdx, spawnTimer}  bossFlow.{defeatedName, pending, phase, postDelay, postWaveT, stage, timer, victoryDelay, warnT}
  //
  import { CANVAS_H, CANVAS_W } from './01-config-core.js';
  import { ARMOR_SKILLS, dagouWaveIv, ARMORS, BERSERK, BULWARK, PILOTS, PLANES, PLAYER_CFG, SHIELD_DURATION, SUB_WEAPONS, WINGMEN_CFG, armorMaxHp, currentArmor, currentPilotMain, currentPilotSub, currentPlane, currentSubWeapon, currentWingman, hasPilot, pilotBombStartAdd, setArmor, setPilotMain, setPilotSub, setPlane, setSubWeapon, setWingman } from './01-config-loadout.js';
  import { DOUZHI } from './01-config-enemies.js';
  import { DIFFICULTIES, currentDifficulty, diffMods, setDifficulty } from './01-config.js';
  import { DPR, armorGrid, armorGlyphFx, berserkBar, berserkFill, blastRings, blBombs, bombIcons, bossEntranceActive, bossFlow, bossTestRow, bulwarkBurst, clamp, crystalBurst, crystals, cubeHitFx, dagouMissiles, dashKillFx, diffGrid, diffLabel, douzhiBar, douzhiFill, douzhiFx, eBullets, encyClose, encyclopedia, enemies, feijianWaves, frostZones, friendStorms, gameoverHomeBtn, hpBarrier, hpPermBarrier, hpFill, infoClose, infoEntryBtn, infoModal, jingdunBar, jingdunFill, kingBonus, levelFlow, livesText, menuScreen, menuStartBtn, missileWarns, missiles, overlay, overlayDesc, overlayTitle, pBullets, gamepad, padIndicator, padPressed, particles, pauseHomeBtn, pauseRetryBtn, pilotGauge, pilotGaugeCount, pilotGaugeKey, pilotGaugeRing, pilotGridMain, pilotGridSub, pillarStrikes, phaseFx, planeGrid, player, playerHitFx, popianMissiles, powerups, rand, resultAchieve, retrialBtn, scoreText, shieldBar, shieldFill, skillGauge, skillGaugeRing, slashFx, spellCubes, startBtn, state, stoneCount, stonePanel, subGrid, titleBar, trailGhosts, watchClearFx, wgSlashes, windFlows, wingmanGrid, xinRings, meiScythes, ddjMissiles, zoneMarks } from './02-core.js';
  import { holdBGM, stopAlarm } from './03-audio.js';
  import { achvEvaluateDefeat, renderResultAchievements, resetAchievements } from './02-achievements.js';
  import { currentBombCap, delayedShots, initWingmen } from './07-player.js';
  import { berserkBurst, bombBurst, shieldBurst } from './08-entities.js';
  import { paintShip, paintWingman, paintWingmanBulwark } from './09-draw-ships.js';
  import { openEncyclopedia } from './13-encyclopedia.js';



  // ---------- HUD ----------
  // 大无垠之王增伤读数渐显 / 渐隐：updateHUD 无 dt，经 state.time 差分推进（暂停时 state.time 冻结 → 淡变同步冻结）；
  // 渐显 0.45s（起点恢复占位），渐隐 0.3s（完成后 display:none 回收布局）
  let kingBonusAlpha = 0;
  let kingBonusLastT = null;
  function stepKingBonusFade(target) {
    const now = state.time;
    const dt = kingBonusLastT == null ? 0 : clamp(now - kingBonusLastT, 0, 0.1);
    kingBonusLastT = now;
    if (target) {
      kingBonus.classList.remove('hidden');
      kingBonusAlpha = Math.min(1, kingBonusAlpha + dt / 0.45);
    } else if (kingBonusAlpha > 0) {
      kingBonusAlpha = Math.max(0, kingBonusAlpha - dt / 0.3);
      if (kingBonusAlpha <= 0) kingBonus.classList.add('hidden');
    }
    kingBonus.style.opacity = kingBonusAlpha.toFixed(3);
  }

  function updateHUD() {
    // 主菜单打开时给舞台挂 menu-open 类：CSS 隐藏战斗 HUD（菜单背景透明后会透出画布）
    menuScreen.parentElement.classList.toggle('menu-open', !menuScreen.classList.contains('hidden'));
    // 手柄连接指示（右上角 FPS 读数下方）：随每帧轮询结果显隐（gamepad 状态由 14-main pollGamepad 刷新）
    padIndicator.classList.toggle('hidden', !gamepad.connected);
    const maxHp = player.maxHp || PLAYER_CFG.maxHp;
    const ratio = player.hp / maxHp;
    hpFill.style.width = (ratio * 100) + '%';
    // 青时炮艇支援弹屏障：HP 条右缘白蓝覆盖条（宽度 = 条宽 × barrier / max(barrierMax, 生命上限)；
    // 末 1s player.barrier 自动线性衰减 → 覆盖条等比缩短，无需额外动画）
    const barRatio = (player.barrier || 0) > 0
      ? clamp(player.barrier / Math.max(player.barrierMax || 0, maxHp), 0, 1) : 0;
    hpBarrier.style.width = (barRatio * 100) + '%';
    // 瓶中精灵永久屏障：HP 条右缘青色覆盖条（位于普通屏障右侧；不随时间衰减）
    const permRatio = (player.permBarrier || 0) > 0
      ? clamp(player.permBarrier / maxHp, 0, 1) : 0;
    hpPermBarrier.style.width = (permRatio * 100) + '%';
    hpFill.classList.toggle('warn', ratio <= 0.55 && ratio > 0.25);

    hpFill.classList.toggle('danger', ratio <= 0.25);
    // 测试情况（测试该敌人 / 测试BOSS）：隐藏积分计数器（.score-panel）
    scoreText.parentElement.style.display = state.challenge ? 'none' : '';
    scoreText.textContent = state.score;
    // 原石收集计数（当局）：仅萧杨显示——其他驾驶员不收集原石（隐藏避免常驻 0 的噪音；挑战/测试不掉水晶同样隐藏）；
    // resetGame 归零后随首颗原石点亮；萧杨只显示收集数（不再带 /16 上限后缀，2026-10-01）
    const showStones = hasPilot('xiaoyang') && !state.challenge && !state.testBoss && state.mode === 'playing';
    stonePanel.classList.toggle('hidden', !showStones);
    if (showStones) stoneCount.textContent = String(state.gachaStones);
    // 左下角爆弹图标（2026-10-04 移入 hud-bl 首行，紧贴血条左侧心形上方；技能量表右移让位）：
    // 实心图标 = 现有爆弹数，虚线空圈 = 空栏位（总栏位 = 当前上限：
    // 真我 2（mods.bombCap）+ 绷绷背包 +1（bombCapAdd））；测试模式（图鉴挑战敌人 / BOSS 测试）爆弹无限，显示 ∞
    if (state.challenge) {
      bombIcons.innerHTML = '<span class="bomb-icon infinite">∞</span>';
    } else {
      const n = Math.max(0, state.bombs);
      const cap = Math.max(n, currentBombCap());
      if (bombIcons.childElementCount !== cap || bombIcons.dataset.filled !== String(n)) {
        let html = '';
        for (let i = 0; i < cap; i++) html += i < n ? '<span class="bomb-icon"></span>' : '<span class="bomb-icon empty"></span>';
        bombIcons.innerHTML = html;   // 仅数量/栏位变化时重建，避免每帧重排
        bombIcons.dataset.filled = String(n);
      }
    }
    // 左下角心显示（2026-10-08 用户定稿）：显示备用命数——初始 2 命 → 1 颗，死亡一次后消失（最后一条命），再死即终局；
    // 天使璃（无限生命，special 特殊驾驶员）恒显 1 颗
    livesText.textContent = '♥'.repeat(hasPilot('tianshiLovely') ? 1 : Math.max(0, state.lives - 1));
    // HUD 当前难度标签：战斗中显示（图鉴挑战 / BOSS 测试不显示，避免与积分器同隐不同现造成混乱）
    diffLabel.textContent = '难度 · ' + currentDifficulty.name;
    diffLabel.classList.toggle('hidden', state.mode !== 'playing' || !!state.challenge || !!state.testBoss);
    const berserkOn = player.weapon === 5 && player.berserk > 0;
    const shieldOn = player.shield > 0;
    // 暴走读条（右下角）：有颜色区域按剩余比例逐渐变短
    berserkBar.classList.toggle('active', berserkOn);
    berserkFill.style.width = berserkOn ? (player.berserk / BERSERK.duration * 100) + '%' : '0%';
    // 护盾读条（右下角）
    shieldBar.classList.toggle('active', shieldOn);
    shieldFill.style.width = shieldOn ? (player.shield / (player.shieldMax || SHIELD_DURATION) * 100) + '%' : '0%';
    // 昂扬读条（右下角，白色；斗志昂扬增益倒计时）
    const douzhiOn = state.hasteT > 0;
    douzhiBar.classList.toggle('active', douzhiOn);
    douzhiFill.style.width = douzhiOn ? (state.hasteT / DOUZHI.buffDuration * 100) + '%' : '0%';
    // 晶盾读条（右下角，淡粉；七日澜心结晶护盾倒计时）
    const jingdunOn = player.crystalShield > 0;
    jingdunBar.classList.toggle('active', jingdunOn);
    jingdunFill.style.width = jingdunOn ? (player.crystalShield / ARMOR_SKILLS.lanxin.dur * 100) + '%' : '0%';
    // 装甲技能圆形计数表（左下角、生命值上方，七日澜心专属）：按填充角度显示量表，满时高亮提示按 F
    const skillDef = ARMOR_SKILLS[currentArmor.id];
    skillGauge.classList.toggle('hidden', !skillDef || state.mode !== 'playing');
    if (skillDef) {
      const frac = clamp(state.armorSkillGauge || 0, 0, 1);
      skillGaugeRing.style.background = `conic-gradient(${skillDef.color} ${frac * 360}deg, rgba(255,255,255,0.10) 0deg)`;
      skillGauge.classList.toggle('ready', frac >= 1);
      skillGauge.style.setProperty('--skill-color', skillDef.color);
    }
    // 驾驶员量表（与装甲量表同款式）：天秀忧郁王子白色量表 / 陵落 Q 冷却（均按 Q，满格 = 可释放）
    // / 依击杀计数条（无按键，满格自动召唤镰刀；环形填充为 #FFC0CB→白 渐变）
    // / 叮咚鸡计数表（按 Q）：环形展示当前层进度，每充满一层转一整周；已充满的持有层数在右下角显示数字
    const pilotGaugeMode = (currentPilotMain.id === 'tianxiu' || currentPilotSub.id === 'tianxiu') ? 'tianxiu'
      : (currentPilotMain.id === 'lingluo' || currentPilotSub.id === 'lingluo') ? 'lingluo'
      : (currentPilotMain.id === 'mei' || currentPilotSub.id === 'mei') ? 'mei'
      : (currentPilotMain.id === 'dingdongji' || currentPilotSub.id === 'dingdongji') ? 'dingdongji' : null;
    const showPilotGauge = !!pilotGaugeMode && state.mode === 'playing';
    pilotGauge.classList.toggle('hidden', !showPilotGauge);
    if (showPilotGauge) {
      let frac, ready;
      if (pilotGaugeMode === 'tianxiu') {
        frac = clamp(state.princeGauge || 0, 0, 1);
        ready = frac >= 1;
      } else if (pilotGaugeMode === 'mei') {
        frac = clamp((state.meiCounter || 0) / PILOTS.mei.counterMax, 0, 1);
        ready = frac >= 1;
      } else if (pilotGaugeMode === 'dingdongji') {
        // 充满一次（一层 8 格）转一整周：环形只展示当前层进度；持有层数见右下角数字；
        // Q 上限初始 useMax 次、击败 BOSS 可掷骰提升——次数耗尽后即使持有层 >0 也不再点亮 ready
        frac = clamp((state.ddjGauge || 0) / PILOTS.dingdongji.layerMax, 0, 1);
        ready = (state.ddjLayers || 0) >= 1 && (state.ddjUses || 0) < (state.ddjUseMax || PILOTS.dingdongji.useMax) && player.alive;
      } else {
        frac = clamp(1 - state.lingluoCdT / PILOTS.lingluo.cd, 0, 1);
        ready = state.lingluoCdT <= 0 && player.alive;
      }
      // 依：环形填充按 #FFC0CB→白 渐变推进（注册色即渐变本体）；其余量表为纯色填充
      pilotGaugeRing.style.background = pilotGaugeMode === 'mei'
        ? `conic-gradient(#FFC0CB, #ffffff ${frac * 360}deg, rgba(255,255,255,0.10) 0deg)`
        : `conic-gradient(${PILOTS[pilotGaugeMode].color} ${frac * 360}deg, rgba(255,255,255,0.10) 0deg)`;
      pilotGauge.classList.toggle('ready', ready);
      if (pilotGaugeKey) pilotGaugeKey.textContent = pilotGaugeMode === 'mei' ? '自动' : 'Q';   // 天秀 / 陵落 / 叮咚鸡 Q 键；依无需按键
      // 右下角充能数字：仅叮咚鸡显示已充满的持有层数（其余模式无持有量概念）
      if (pilotGaugeCount) pilotGaugeCount.textContent = pilotGaugeMode === 'dingdongji' && (state.ddjLayers || 0) > 0 ? String(state.ddjLayers) : '';
    }
    // 大无垠之王：BOSS 战累积增伤读数（血条上方；向上取整仅整数；未装备 / 无累积 / 非 BOSS 战阶段隐藏——
    // 显示门控额外要求 stage === 'fight'：即使状态因任何路径残留，小怪阶段也绝不显示；
    // 警报 / BOSS 登场动画（bossEntranceActive）期间不显示——动画放完后渐显浮现，条件不再满足时渐隐）
    const showKingBonus = (currentPilotMain.id === 'king' || currentPilotSub.id === 'king') && state.kingDmg > 0
      && bossFlow.stage === 'fight' && !bossEntranceActive();
    stepKingBonusFade(showKingBonus);
    if (showKingBonus) kingBonus.textContent = '♛ 增伤 +' + Math.ceil(state.kingDmg * 100) + '%';
    // 可莉：绷绷炸弹 HUD 图标着色（红橙火花主题）
    bombIcons.classList.toggle('klee', currentPilotMain.id === 'keli' || currentPilotSub.id === 'keli');
    // （奖励道具槽 itemGauge / 原石抽卡 R 栏 gachaGauge 已移除——2026-10-01 道具槽整体取消：
    //   击坠赞助无人机立即生效 07-player applyRewardItem，机体前方播道具图标/扩散波特效；
    //   抽卡改萧杨 Q 技能，充能进度由 stonePanel 显示 16/16）
  }
  // ---------- 流程控制 ----------
  function resetGame(autoStart = false, opts = {}) {
    state.score = 0;
    levelFlow.level = 1;
    const bombStart = diffMods().bombStart;
    state.bombs = (bombStart != null ? bombStart : 1) + pilotBombStartAdd();   // 真我：初始不带高能爆弹（mods.bombStart）；可莉：初始额外 1 颗绷绷炸弹
    state.lives = PLAYER_CFG.lives;
    levelFlow.spawnTimer = 1.2;
    state.time = 0;
    state.hasteT = 0;       // 斗志昂扬增益（攻速/弹速翻倍）剩余时长
    // 奖励道具效果状态归位（道具槽已取消——击坠立即生效；07-player applyRewardItem 置位 / updateRewardFx 推进）
    state.laodaT = 0; state.laodaMul = 1;
    state.magnetBonus = 0;
    state.swordStormT = 0; state.swordStormAng = -Math.PI / 2; state.swordStormAcc = 0;
    state.frostField = null;
    state.bombCapAdd = 0; state.bengbagGot = false;
    state.jiukeT = 0; state.jiukeDodgePct = 0;
    state.itemPickFx.length = 0;
    state.xgLooseBombs.length = 0;   // 辛国栋击毁残留的地毯轰炸落点预警（对局重开清空）
    state.gachaFx = null;
    state.xinFuryRing = null;
    state.honghongT = 0;
    player.permBarrier = 0; player.barrier = 0; player.barrierMax = 0; player.barrierT = 0;
    state.gachaStones = 0; state.gachaReady = false;
    levelFlow.prevLevel = 1;    // 上一帧关卡（用于检测升级以触发斗志昂扬出现）
    levelFlow.douzhiSkipOnce = false;   // 击败 BOSS 的跳变升级豁免标记（重开清空）
    state.paused = false;
    pauseHomeBtn.classList.add('hidden');
    pauseRetryBtn.classList.add('hidden');
    retrialBtn.classList.add('hidden');
    gameoverHomeBtn.classList.add('hidden');   // 失败结算页按钮随重开隐藏
    state.shakeTime = 0;
    state.shakeMag = 0;
    state.shakeDur = 0;
    levelFlow.lowPressureT = 0;
    levelFlow.capitalIdleT = 0;
    levelFlow.jiaoxiang13Done = false;   // Lv13 首波必出焦香螺旋桨：每局重置
    levelFlow.bossMinionT = 0;           // 真我：BOSS 战 1类强制波次计时归零
    levelFlow.bossMinionNext = rand(6, 12);
    levelFlow.hpKitWaveCd = 0;           // 诗篇：加血套件波次节流剩余波数归零
    levelFlow.poemWaveIdx = 0;        // 诗篇波次制：本阶段波次计数归零
    levelFlow.poemClearT = 0;         // 诗篇波次制：清场计时归零
    levelFlow.poemClearNext = 0;      // 诗篇波次制：清场间隔归零（0 = 开局立即首波）
    state.orangeBombUsed = false;
    state.hpKitLastT = -99;   // 真我加血节流计时归位（开局不受冷却限制）
    state.hpKitBanked = 0;    // 真我加血节流预触发计数清零
    state.crystalMagnetMul = 1;   // 水晶磁吸倍率重开归 1（击败旧日之歌后再 ×1.5）
    state.armorSkillGauge = 0;    // 装甲技能量表（七日澜心）重开归零
    // 驾驶员运行态重置：许凯狗冲刺置位判定在下方（testBoss / challenge 置位之后——见 resetGame 尾部）
    state.maxinSpeedMul = 1;   // 马兴犬：移速倍率恢复原速
    // 天秀忧郁王子：量表与增益全部归零
    state.princeGauge = 0;
    state.princeScoreBase = 0; state.princeCrystalGain = 0;
    // 陵落：Q 技能冷却满值起步（开局技力条为空，不能立刻释放）；大狗：导弹雨计时取 10~22s 随机初值
    state.lingluoCdT = (currentPilotMain.id === 'lingluo' || currentPilotSub.id === 'lingluo') ? PILOTS.lingluo.cd : 0;
    state.dagouMissT = (currentPilotMain.id === 'dagou' || currentPilotSub.id === 'dagou')
      ? dagouWaveIv(state.dagouDebugRapid) : 0;
    state.dagouWarnFadeT = 0;   // 大狗：预警蓝光渐隐计时归零
    state.dagouChains.length = 0;   // 大狗：待发射连射链波清空
    state.daodanChains.length = 0;   // 捣蛋来袭（副武器）：连射链待发射弹清空
    // 哈基米大王：闪避累积加成与尾部闪避计时清零；依：击杀计数归零
    state.hajimiDodgeBonus = 0;
    state.hajimiTailT = 0;
    state.meiCounter = 0;
    meiScythes.length = 0;   // 依：在途镰刀清扫随重开清空
    // 叮咚鸡：计数表三层/当前层进度与暴走升级机会归零，在途导弹清空；Q 释放次数归零
    state.ddjGauge = 0;
    state.ddjLayers = 0;
    state.ddjUses = 0;
    state.ddjUseMax = PILOTS.dingdongji.useMax;   // Q 释放上限复位（击败 BOSS 掷骰 +1 的运行时增益归位）
    state.ddjBerserkUps = 0;
    ddjMissiles.length = 0;
    player.lingluoMaxDebt = 0;   // 陵落：生命上限债务清零（player.maxHp 已在下方按装甲复原）
    // 大无垠之王：BOSS 战累积增伤清零（读数淡变状态同步复位——立刻隐藏）
    state.kingDmg = 0; state.kingTaken = 0;
    state.wenjiukeVuln = 1;   // 温酒客：受伤提升回到开局 +100%（每击败一个 BOSS -25 个百分点，见 06-enemy 击败结算）
    kingBonusAlpha = 0; kingBonusLastT = null;
    kingBonus.classList.add('hidden'); kingBonus.style.opacity = '0';
    // 埃逸：自爆相关状态归零
    state.aiyiSelfDestruct = false; state.aiyiFinalDeath = false; state.selfDestructVictory = false;
    state.aiyiWaves.length = 0; state.aiyiWaveSeq = 0;
    player.aiyiChargeT = 0;
    friendStorms.length = 0;      // 友方大风暴随重开清空
    dashKillFx.length = 0;        // 许凯狗冲刺白光冲击特效随重开清空
    dagouMissiles.length = 0;     // 大狗导弹雨随重开清空（否则回主菜单后飞行中/待发射导弹冻结在画面上）
    feijianWaves.length = 0;      // 副武器·无界飞剑：未发射的飞剑波随重开清空
    xinRings.length = 0;          // 副武器·辛国栋之怒：灼烧火环随重开清空
    state.dagouChains.length = 0;   // 大狗连射链待发射队列随重开清空
    state.daodanChains.length = 0;   // 捣蛋来袭连射链待发射队列随重开清空
    player.crystalShield = 0;     // 七日澜心水晶护盾清除
    player.bulwarkUsed = false;   // 最终壁垒：新的一条命，免死机会重置
    player.bulwarkFxT = 0;        // 最终壁垒：免死菱形环绕演出计时归零
    player.bulwarkEndT = 0;       // 最终壁垒：菱形收尾演出计时归零
    player.chixinBurnT = 0;       // 炽心：灼烧计时归零
    player.regenT = 0;            // 洄：回血计时归零
    player.tianshuArmedT = 0; player.tianshuCycleT = 0;   // 天枢圣卫：圣守周期归零
    player.shieldMax = 0;         // 护盾读条分母复位
    bossFlow.timer = 0;
    bossFlow.phase = 0;
    bossFlow.stage = 'none';
    bossFlow.victoryDelay = 0;
    bossFlow.postDelay = 0;
    bossFlow.postWaveT = 0;
    bossFlow.defeatedName = '';
    state.victoryOverlay = false;
    bossFlow.warnT = 0;
    // 测试模式：指定 BOSS 直接挑战；重开时保留测试目标，点“开始游戏”则清除
    state.testBoss = opts.testBoss !== undefined ? opts.testBoss
      : (opts.keepTest ? state.testBoss : null);
    // 图鉴挑战模式：重开时保留，点“开始游戏”/返回主界面则清除
    state.challenge = opts.challenge !== undefined ? opts.challenge
      : (opts.keepTest ? state.challenge : null);
    const bossChallenge = state.challenge && state.challenge.kind === 'boss';
    bossFlow.pending = (bossChallenge ? state.challenge.bossId : null) || state.testBoss || 'song';
    if (bossChallenge || state.testBoss) bossFlow.stage = 'wait';   // 跳过等待，清场后进警报（直接 wait→warn，避免开场多打一发）
    // 风暴编织者挑战 / 试炼：无警报直接召唤——BGM 延后 0.8s 起播（结算曲淡出 + 登场雷暴衔接，不再立刻重播）
    if ((bossChallenge && state.challenge.bossId === 'storm2') || state.testBoss === 'storm2') holdBGM(0.8);
    // 驾驶员运行态重置：许凯狗冲刺仅正常开局生效——BOSS 试炼（testBoss）/ 图鉴挑战（challenge）不进入冲刺。
    // 必须在 testBoss / challenge 置位之后判定（原先置于其前，读到的还是上一局的值——试炼开局会误触发冲刺）。
    // 仅在真正开局（autoStart）时置位——返回主界面（resetGame(false)）必须清零，
    // 否则主菜单演示机体（复用 drawPlayer）会残留冲刺白光特效
    state.pilotDashT = (autoStart && (currentPilotMain.id === 'xukaigou' || currentPilotSub.id === 'xukaigou') && !state.testBoss && !state.challenge)
      ? PILOTS.xukaigou.dashDur : 0;
  resetAchievements();   // 成就：本局进度清零（须在 state.testBoss / state.challenge 置位之后——门控以这两项为准）
    state.flash = 0;
    state.hurt = 0;
    state.demo = false;   // 离开/进入任何局：关闭主菜单攻击演示标记（由 updateDemo 在 idle 重新置位）
    shieldBurst.active = false;
    bombBurst.active = false;
    berserkBurst.active = false;   // 暴走冲击波随重开熄灭（主菜单演示中途开局时可能仍处激活态）
    crystalBurst.active = false;   // 结晶护盾解除冲击波随重开熄灭
    bulwarkBurst.active = false;   // 最终壁垒免死金环随重开熄灭
    watchClearFx.length = 0;       // 群星守望消弹光粒随重开清空
    armorGlyphFx.length = 0;       // 装甲触发图标演出随重开清空
    blastRings.length = 0;         // 爆炸冲击圈（大狗导弹雨）随重开清空
    stopAlarm();

    enemies.length = 0;
    pBullets.length = 0;
    eBullets.length = 0;
    delayedShots.length = 0;   // Lv4 半拍补射队列随重开清空
    trailGhosts.length = 0;
    particles.length = 0;
    powerups.length = 0;
    crystals.length = 0;
    missileWarns.length = 0;
    missiles.length = 0;
    blBombs.length = 0;
    frostZones.length = 0;   // 虚幻寒冷区域随重开清空（否则回主页面后更新停止、渲染仍在，冰蓝区域冻结残留）
    popianMissiles.length = 0;
    wgSlashes.length = 0;   // 战争幽灵技能1/2双刃斩击流随重开清空
    spellCubes.length = 0;
    cubeHitFx.length = 0;
    playerHitFx.length = 0;   // 命中玩家特效随重开清空
    phaseFx.length = 0;   // 碎盾特效随重开清空
    douzhiFx.length = 0;
    slashFx.length = 0;   // 群星之杀：斩击特效随重开清空
    zoneMarks.length = 0;
    windFlows.length = 0;
    pillarStrikes.length = 0;

    player.x = CANVAS_W / 2;
    // 主菜单开局（开始游戏 / 图鉴挑战 / BOSS 试炼）：机体从演示屏站位平滑飞入出战位，不再瞬移；
    // 战斗内重开（重新挑战按钮 / 再次挑战）时主菜单已隐藏，直接落位。此刻 player.y 仍为演示屏站位（updateDemo 每帧强制）
    if (autoStart && !menuScreen.classList.contains('hidden')) {
      player.enterFromY = clamp(player.y, 60, CANVAS_H);
      player.y = player.enterFromY;
      player.enterT = PLAYER_CFG.enterDur;
    } else {
      player.y = CANVAS_H - 90;
      player.enterT = 0;
    }
    player.maxHp = armorMaxHp();   // 当前装甲下的每条命最大 HP（复合装甲 +40）
    player.hp = player.maxHp;
    player.cooldown = 0;
    player.subCooldown = 0;   // 副武器冷却归零（此处统一复位）
    state.dagouDebugRapid = false;    // 作弊键 9（大狗导弹连发）离开游戏后默认关闭，新局需重新按 9 开启（用户 2026-10-02 指定）
    state.tianxiuDebugSpam = false;   // 作弊键 8（天秀旋风连发）同上
    player.kbT = 0; player.kbVx = 0; player.kbVy = 0;   // 清除击退状态
    player.spinT = 0;   // 清除击飞自旋（黑暗之手登场阴影掠过；09-draw-ships drawPlayer 读取）
    state.dhFledElites.length = 0;   // 黑暗之手：迅速离场精英登记清空（第三轮按 ELITE_REVIVE.levels 返场）
    state.dhZhangPending = false;    // 黑暗之手：四精英全数击败标记归位（第三轮 Lv25 张华&张策召唤触发）
    player.invuln = state.pilotDashT > 0 ? state.pilotDashT : 1.0;   // 许凯狗：开局无敌覆盖整个冲刺阶段（不闪动）
    player.invulnBlink = false;   // 开局无敌不闪动：清掉上一局残留的受击闪动标记（登场/重生无敌保持机体完整可见）
    player.alive = true;
    player.weapon = (state.testBoss || state.challenge) ? 4 : (currentPlane.startWeapon || 1);   // BOSS 试炼 / 图鉴挑战：默认火力 Lv4
    // 捣蛋来袭 / 辛国栋之怒：开局不立即射击——首射前先等待一个完整攻击间隔（按当前火力等级取参）
    const subFire0 = currentSubWeapon.fire;
    if (subFire0 && (subFire0.kind === 'daodan' || subFire0.kind === 'xinring')) {
      player.subCooldown = (subFire0.levels[player.weapon] || subFire0.levels[1]).interval;
    }
    player.berserkBanner = 0;
    player.shield = 0;
    player.respawnTimer = 0;
    player.hitCount = 0;
    player.hitFxT = 0;
    player.slashCd = 0; player.slashTarget = null; player.slashQueued = 0; player.slashGapT = 0;   // 群星之杀斩击运行态重置
    player.berserkSpread = 0;   // 暴走刃帆变形进度归零（否则上一局暴走中返回主界面，主菜单演示会残留金光/光点）
    // 磁力装甲：开局自带量子护盾（仅开局，重生不带）
    player.shield = (currentArmor.startShield || 0);

    if (autoStart) {
      state.mode = 'playing';
      overlay.classList.add('hidden');
      menuScreen.classList.add('hidden');   // 进入战斗：隐藏主菜单页
      // 顶部标题栏（大无垠战机 + 英文名）开始游戏后同样隐藏：标题只保留在主菜单页
      titleBar.classList.add('hidden');
    } else {
      state.mode = 'idle';
      menuScreen.classList.remove('hidden');   // 主菜单独立页面（idle 态不再使用遮罩）
      overlay.classList.add('hidden');
      titleBar.classList.add('hidden');   // 菜单内已有大标题，隐藏页面顶部标题栏（visibility 保留占位）
      closeAllPanels();   // 回到主菜单：收起上次留下的展开面板
      refreshLoadout();   // 装备框摘要与当前配置同步
      bossTestRow.style.display = 'none';   // BOSS 试炼已移入怪物图鉴
      // 怪物图鉴入口按钮：现为主菜单静态元素（index.html），此处仅恢复显示；点击绑定见 initMenuPanels
      const encyBtn = document.getElementById('encyEntryBtn');
      if (encyBtn) encyBtn.style.display = '';
    }
    // 僚机初始化必须在模式分支之后：initWingmen 依赖 mode / menuScreen 判定主菜单演示态，
    // 直接落位到演示站位（否则刷新页面时僚机会从底部出战位快速上移追赶，见 07-player initWingmen）
    initWingmen();
    syncInfoEntryBtn();
  }

  // 数值与机制图鉴入口按钮（ⓘ）：仅主菜单页可见时显示（战斗 / 暂停 / 结算均隐藏）
  function syncInfoEntryBtn() {
    const show = state.mode === 'idle' && !state.paused && !state.victoryOverlay &&
                 !menuScreen.classList.contains('hidden');
    infoEntryBtn.classList.toggle('hidden', !show);
  }

  function showOverlay(title, html, btnText) {
    overlayTitle.textContent = title;
    overlayDesc.innerHTML = html;
    startBtn.textContent = btnText;
    overlay.classList.remove('hidden');
  }

  // ---------- 难度选择（主菜单底部：开始按钮上方的紧凑胶囊组） ----------
  // 难度由 DIFFICULTIES 注册表驱动（数值/行为差异见 01-config 各自 mods 与 SONG_SHIP / STORM_SHIP）：
  // 虚象 / 具象 / 真我三档实装可选；「诗篇」为 wip 占位——展示但不可选（点击抖动拒绝，锁定态半透明 +
  // 悬停提示见注册表 desc），不附加角标。
  // 紧凑样式只展示名称（完整描述放 title 悬停提示），完整卡片文案保留在注册表中。
  function buildDiffCards() {
    diffGrid.innerHTML = '';
    for (const id in DIFFICULTIES) {
      const d = DIFFICULTIES[id];
      const card = document.createElement('div');
      card.className = 'diff-card' + (d.id === currentDifficulty.id ? ' selected' : '') + (d.wip ? ' locked' : '');
      card.dataset.diff = d.id;
      card.textContent = d.name;
      card.title = d.desc.replace(/<[^>]*>/g, ' ').trim();   // 去标签后作悬停提示
      card.addEventListener('click', () => {
        if (d.wip) {   // 未实装难度：抖动提示，不可选择
          card.classList.remove('deny');
          void card.offsetWidth;   // 强制重排以重启动画
          card.classList.add('deny');
          return;
        }
        setDifficulty(d);
        diffGrid.querySelectorAll('.diff-card').forEach(el =>
          el.classList.toggle('selected', el.dataset.diff === d.id));
      });
      diffGrid.appendChild(card);
    }
  }

  // ---------- 装备四框 ↔ 展开面板（战机 / 装甲 / 副武器 / 僚机） ----------
  // 点击装备框展开对应选择面板（覆盖演示屏区域），再点同框或 ✕ 收起；单开互斥。
  // 框内第二行实时显示当前选中项名称（refreshLoadout，选择变化 / 回主菜单时刷新）。
  function closeAllPanels() {
    document.querySelectorAll('.loadout-panel').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.loadout-box, .pilot-diamond').forEach(b => b.classList.remove('open'));
  }

  // 框内当前配置摘要 + 当前形象缩略图
  function refreshLoadout() {
    const planeVal = document.getElementById('loadoutPlaneVal');
    const armorVal = document.getElementById('loadoutArmorVal');
    const subVal = document.getElementById('loadoutSubVal');
    const wingmanVal = document.getElementById('loadoutWingmanVal');
    const pilotVal = document.getElementById('loadoutPilotVal');
    if (planeVal) planeVal.textContent = currentPlane.name;
    if (armorVal) armorVal.textContent = currentArmor.name;
    if (subVal) subVal.textContent = currentSubWeapon.name;
    // 驾驶员菱形框摘要：主驾驶员名 + 副驾驶员名（副行为空则只显示主；有简称 short 的显示简称，悬停提示仍用全名）
    const pilotDiamond = document.querySelector('.pilot-diamond');
    const pilotSubVal = document.getElementById('loadoutPilotSubVal');
    if (pilotVal) pilotVal.textContent = currentPilotMain.empty ? '无' : (currentPilotMain.short || currentPilotMain.name);
    if (pilotSubVal) pilotSubVal.textContent = currentPilotSub.empty ? '' : (currentPilotSub.short || currentPilotSub.name);
    if (pilotDiamond) {
      pilotDiamond.title =
        '主驾驶员：' + (currentPilotMain.empty ? '无' : currentPilotMain.name) +
        '／副驾驶员：' + (currentPilotSub.empty ? '无' : currentPilotSub.name);
      // 特殊驾驶员（special）装备中（主/副任一槽）：菱形框金边替换为青粉渐变流光 + 双白芒
      //（style.css .pilot-diamond.special-pilot）
      pilotDiamond.classList.toggle('special-pilot', !!(currentPilotMain.special || currentPilotSub.special));
    }
    // 装甲名正下方的半透明图标（绝对定位，不挤动文字）：随当前装甲同步图案与颜色
    const armorGlyph = document.getElementById('loadoutArmorGlyph');
    if (armorGlyph) {
      armorGlyph.textContent = currentArmor.glyph;
      armorGlyph.style.color = currentArmor.color;
      armorGlyph.classList.toggle('glyph-sym', !!currentArmor.sym);   // ∞（洄）字形换 Corbel 修左右不对称
    }
    // 副武器名正下方的框内图标（同装甲框图案：绝对定位在空区居中，不挤动文字）：随当前副武器同步图案与颜色
    // 无界飞剑等带 glyphTransform/glyphBold 的字形与选择卡片同款应用（CSS 基准 translateX(-50%) 必须保留，切换时回退复位）
    const subGlyph = document.getElementById('loadoutSubGlyph');
    if (subGlyph) {
      if (currentSubWeapon.iconSvg) {
        subGlyph.classList.add('glyph-svg');   // 矢量图标（焰环 / 狗耳导弹）：内联 SVG，辉光走注册色
        subGlyph.innerHTML = currentSubWeapon.iconSvg;
        subGlyph.style.transform = 'translateX(-50%)';   // CSS 基准居中保留
        subGlyph.style.fontWeight = '';
      } else {
        subGlyph.textContent = currentSubWeapon.glyph || '□';
        subGlyph.style.transform = 'translateX(-50%)' + (currentSubWeapon.glyphTransform ? ' ' + currentSubWeapon.glyphTransform : '');
        subGlyph.style.fontWeight = currentSubWeapon.glyphBold ? '700' : '';
      }
      subGlyph.style.color = currentSubWeapon.color || '#9fb4d8';
    }
    if (wingmanVal) wingmanVal.textContent = currentWingman.empty ? '无' : currentWingman.name;
    // 战机形象（同选机卡片画法：暴走形态静态帧；群星之杀暴走巨帆更大，额外缩小）
    const pc = document.getElementById('loadoutPlaneCvs');
    if (pc) {
      pc.width = 92 * DPR; pc.height = 76 * DPR;   // 重设尺寸即清空画布
      const c = pc.getContext('2d');
      c.scale(DPR, DPR);
      c.translate(46, 38);
      let s = currentPlane.id === 'starslayer' ? 0.6 : 0.9;
      if (currentPlane.id === 'chaos') s *= 0.9;   // 混乱将至：装备框预览图缩小 10%（选机卡片同步）
      c.scale(s, s);
      paintShip(c, 1, currentPlane, 1, true);
    }
    // 僚机形象（与选僚机卡片同一画法）
    const wc = document.getElementById('loadoutWingmanCvs');
    if (wc) {
      wc.width = 56 * DPR; wc.height = 60 * DPR;
      const c = wc.getContext('2d');
      c.scale(DPR, DPR);
      paintWingmanThumb(c, currentWingman);
    }
  }

  function initMenuPanels() {
    document.querySelectorAll('[data-panel]').forEach(box => {
      box.addEventListener('click', () => {
        const panel = document.getElementById(box.dataset.panel);
        if (!panel) return;
        const wasOpen = !panel.classList.contains('hidden');
        closeAllPanels();
        if (!wasOpen) {
          panel.classList.remove('hidden');
          box.classList.add('open');
        }
      });
    });
    document.querySelectorAll('.panel-close').forEach(btn => {
      btn.addEventListener('click', () => closeAllPanels());
    });
    // 怪物图鉴入口（静态按钮）：一次性绑定点击（resetGame 仅做显隐，避免重复绑定监听）
    const encyBtn = document.getElementById('encyEntryBtn');
    if (encyBtn) encyBtn.addEventListener('click', openEncyclopedia);
    // 操作提示（左上角 ? 按钮）：点击展开 / 收起按键说明卡片；✕ 仅收起
    const helpBtn = document.getElementById('helpEntryBtn');
    const helpPanel = document.getElementById('helpPanel');
    if (helpBtn && helpPanel) {
      helpBtn.addEventListener('click', () => helpPanel.classList.toggle('hidden'));
      const helpClose = document.getElementById('helpClose');
      if (helpClose) helpClose.addEventListener('click', () => helpPanel.classList.add('hidden'));
      // 「手柄」按钮（面板头左上角）：键盘 ↔ 手柄 按键页互斥切换（active 亮起标记当前为手柄页）
      const helpPadBtn = document.getElementById('helpPadBtn');
      const helpQuadKey = document.getElementById('helpQuadKey');
      const helpQuadPad = document.getElementById('helpQuadPad');
      if (helpPadBtn && helpQuadKey && helpQuadPad) {
        helpPadBtn.addEventListener('click', () => {
          const toPad = helpQuadPad.classList.contains('hidden');
          helpQuadPad.classList.toggle('hidden', !toPad);
          helpQuadKey.classList.toggle('hidden', toPad);
          helpPadBtn.classList.toggle('active', toPad);
        });
      }
    }
    refreshLoadout();
  }

  // ---------- 手柄菜单导航（主菜单 / 暂停 / 失败 / 胜利结算：焦点移动 + A 确认 + B 返回） ----------
  // 14-main 主循环在「非战斗帧」（idle / 暂停 / 结算）调用 padMenuTick(dt)；战斗帧的动作键在 14-main padCombatTick。
  // 焦点环用内联 outline（不引入 CSS 类，避免与各界面 hover / selected 样式互相干扰）；
  // 手柄未连接时本函数直接返回（键盘 / 鼠标用户零开销、焦点环永不出现）。
  let padFocusEl = null;   // 当前焦点元素
  let padNavDir = null;    // 当前按住的方向键 / 摇杆方向（长按重复用）
  let padNavRepT = 0;      // 方向按住时长（秒）：0.35s 后每 0.15s 重复移动一拍

  function padSetFocus(el) {
    if (padFocusEl === el) return;
    if (padFocusEl) { padFocusEl.style.outline = ''; padFocusEl.style.outlineOffset = ''; padFocusEl.style.zIndex = ''; }
    padFocusEl = el || null;
    if (padFocusEl) {
      padFocusEl.style.outline = '2px solid #7ce7ff';
      padFocusEl.style.outlineOffset = '2px';
      padFocusEl.style.zIndex = '5';
    }
  }

  // 收集当前界面可聚焦元素（数组顺序 = 视觉行序；空数组 = 该界面不支持导航 / 被弹窗阻断）
  function padFocusList() {
    // 怪物图鉴 / 数值与机制图鉴弹窗：列表结构在 13-encyclopedia 动态构建，不做卡片级导航——
    // B 关闭防软锁（padBackAction），方向导航让位给鼠标
    if (!encyclopedia.classList.contains('hidden') || !infoModal.classList.contains('hidden')) return [];
    if (!overlay.classList.contains('hidden')) {
      // 暂停 / 失败 / 胜利结算：只收集当前可见按钮（数组顺序 = 卡片内视觉自上而下）
      return [retrialBtn, startBtn, gameoverHomeBtn, pauseRetryBtn, pauseHomeBtn]
        .filter(b => !b.classList.contains('hidden'));
    }
    if (!menuScreen.classList.contains('hidden')) {
      // 主菜单：展开的装备面板优先（面板卡片 + 关闭钮），教程面板其次，否则主界面元素
      const openPanel = [...document.querySelectorAll('.loadout-panel')].find(p => !p.classList.contains('hidden'));
      if (openPanel) {
        const close = openPanel.querySelector('.panel-close');
        return [...openPanel.querySelectorAll('button, .plane-card, .armor-card'), ...(close ? [close] : [])];
      }
      const helpPanel = document.getElementById('helpPanel');
      if (helpPanel && !helpPanel.classList.contains('hidden')) {
        // 焦点序 = 视觉序：左上「手柄」切换按钮 → 右上关闭
        return [document.getElementById('helpPadBtn'), document.getElementById('helpClose')].filter(Boolean);
      }
      return [
        document.getElementById('helpEntryBtn'),
        ...document.querySelectorAll('[data-panel]'),
        ...diffGrid.children,
        menuStartBtn,
        document.getElementById('encyEntryBtn'),
        document.getElementById('infoEntryBtn'),
      ].filter(Boolean);
    }
    return [];
  }

  // B 键「返回」：按界面层级回退一步（返回 true 表示已消费）。结算页 B 不绑定任何动作（防误触重开 / 返回）
  function padBackAction() {
    if (!encyclopedia.classList.contains('hidden')) { encyClose.click(); return true; }
    if (!infoModal.classList.contains('hidden')) { infoClose.click(); return true; }
    if (!overlay.classList.contains('hidden')) {
      if (state.paused) togglePause();   // 暂停页 B = 继续游戏
      return true;
    }
    if (!menuScreen.classList.contains('hidden')) {
      const openPanel = [...document.querySelectorAll('.loadout-panel')].find(p => !p.classList.contains('hidden'));
      if (openPanel) { closeAllPanels(); return true; }
      const helpPanel = document.getElementById('helpPanel');
      if (helpPanel && !helpPanel.classList.contains('hidden')) {
        const c = document.getElementById('helpClose');
        if (c) c.click();
        return true;
      }
    }
    return false;
  }

  // 方向选点：取中心点位于指定方向、按「轴向距离 + 垂向偏移惩罚」最小的元素；
  // 无几何候选（DOM 几何不可用 / 无同向元素）时回退列表线性 ±1（到边缘停住，不回绕防连按冲过目标）
  function padPickFocus(list, cur, dx, dy) {
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const ox = b.left + b.width / 2 - cx, oy = b.top + b.height / 2 - cy;
      const along = dx !== 0 ? ox * dx : oy * dy;
      const cross = dx !== 0 ? Math.abs(oy) : Math.abs(ox);
      if (along <= 2) continue;   // 必须确在目标方向上（留 2px 容差，同行视为不偏）
      const score = along + cross * 2.5;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) return best;
    const i = list.indexOf(cur);
    if (i < 0) return list[0] || cur;
    return list[i + ((dx !== 0 ? dx : dy) > 0 ? 1 : -1)] || cur;
  }

  // 主循环每帧调用（仅非战斗帧）：焦点移动（十字键 + 左摇杆推杆越 0.55 计方向）+ A 确认 + B 返回 + Start 暂停·继续
  function padMenuTick(dt) {
    if (!gamepad.connected) {
      if (padFocusEl) { padSetFocus(null); padNavDir = null; padNavRepT = 0; }
      return;
    }
    const list = padFocusList();
    if (!list.length) {
      if (padFocusEl) { padSetFocus(null); padNavDir = null; padNavRepT = 0; }
      return;
    }
    if (!list.includes(padFocusEl)) padSetFocus(list[0]);   // 界面切换 / 列表内容变化：焦点落到首位
    const dir = (gamepad.btn.left || gamepad.ax < -0.55) ? 'left'
      : (gamepad.btn.right || gamepad.ax > 0.55) ? 'right'
      : (gamepad.btn.up || gamepad.ay < -0.55) ? 'up'
      : (gamepad.btn.down || gamepad.ay > 0.55) ? 'down' : null;
    if (dir !== padNavDir) {
      padNavDir = dir; padNavRepT = 0;   // 首拍立即移动
      if (dir && padFocusEl) padSetFocus(padPickFocus(list, padFocusEl,
        dir === 'left' ? -1 : dir === 'right' ? 1 : 0,
        dir === 'up' ? -1 : dir === 'down' ? 1 : 0));
    } else if (dir) {
      padNavRepT += dt;
      if (padNavRepT >= 0.35) {   // 长按重复拍：0.35s 起每 0.15s 一步（此处只管重复，首拍在上面立即执行）
        padNavRepT -= 0.15;
        padSetFocus(padPickFocus(list, padFocusEl,
          dir === 'left' ? -1 : dir === 'right' ? 1 : 0,
          dir === 'up' ? -1 : dir === 'down' ? 1 : 0));
      }
    }
    if (padPressed('a') && padFocusEl) padFocusEl.click();   // A = 确认（等同点击）
    if (padPressed('b')) padBackAction();                    // B = 返回
    if (padPressed('start') && state.paused) togglePause();  // Start = 暂停 / 继续（与键盘 P 同语义）
  }

  // ---------- 选机页面 ----------
    // ---------- 选僚机页面 ----------
  // 僚机缩略图绘制（选僚机卡片与主菜单装备框共用）：调用前 c 已按 DPR 缩放、画布 56×60 逻辑尺寸
  function paintWingmanThumb(c, wm) {
    c.translate(31, 30);   // 两僚机舱体中心统一对齐 (31,30)——群星允诺舱体在本地原点，直落该点；
    c.scale(-1, 1);   // 左右反转预览图                       // 守愿者舱体在本地 (side*3,-3)，由分支内 translate 修正。
    // 整体较画布中心右移 3px：尾翼/盾弧镜像后甩向左侧，视觉重心偏左，微调回正
    // 暴走星焰尾（静态帧）：白紫亮焰，较常规更长更亮（与游戏内 wkBerserk 焰一致）
    const isBulwark = wm.weapon && wm.weapon.kind === 'fan';
    if (isBulwark) {
      c.scale(0.82 * BULWARK.scale, 0.82 * BULWARK.scale);   // 缩小以容纳前方装甲板（×守愿者整体尺寸系数）
      c.translate(-3, 3);   // 机体中心修正：舱体本地 (side*3,-3) 经本位移 + 镜像 + 缩放后恰落画布中心（与群星允诺舱体同心）
      // 冷蓝暴走尾焰（静态帧）
      const fg = c.createLinearGradient(0, 8, 0, 8 + 15 + 5);
      fg.addColorStop(0, 'rgba(234, 248, 255, 0.95)');
      fg.addColorStop(0.5, 'rgba(150, 210, 255, 0.65)');
      fg.addColorStop(1, 'rgba(60, 140, 240, 0)');
      c.fillStyle = fg;
      c.beginPath();
      c.moveTo(0, 8);   // 尾焰对齐本体中线（本体偏移 side*3=3，与游戏内 drawWingmen 一致）
      c.lineTo(3, 8 + 15 + 5);
      c.lineTo(6, 8);
      c.closePath();
      c.fill();
      paintWingmanBulwark(c, 1, true, 0.35, true);   // 重甲堡垒机体（暴走过热状态，静态帧；still 冻结相位保证预览确定性）
    } else {
      const fg = c.createLinearGradient(0, 8, 0, 8 + 15 + 5);
      fg.addColorStop(0, 'rgba(238, 228, 255, 0.95)');
      fg.addColorStop(0.5, 'rgba(168, 138, 255, 0.65)');
      fg.addColorStop(1, 'rgba(118, 88, 240, 0)');
      c.fillStyle = fg;
      c.beginPath();
      c.moveTo(-3, 8);
      c.lineTo(0, 8 + 15 + 5);
      c.lineTo(3, 8);
      c.closePath();
      c.fill();
      paintWingman(c, 1, true, true);   // 与游戏内僚机同一造型（暴走：含机翼延伸三角；still 冻结相位）
      // 暴走状态（静态帧，强度对齐游戏内 pulse 峰值）：机体辉光（星核过载）+ 翼尖微光
      const aura = c.createRadialGradient(0, -1, 2, 0, -1, 17);
      aura.addColorStop(0, 'rgba(186, 160, 255, 0.55)');
      aura.addColorStop(1, 'rgba(186, 160, 255, 0)');
      c.fillStyle = aura;
      c.beginPath(); c.arc(0, -1, 17, 0, Math.PI * 2); c.fill();
      c.save();
      c.globalAlpha = 0.55; c.shadowColor = '#b49bff'; c.shadowBlur = 12;
      c.fillStyle = '#cbb8ff';
      c.beginPath(); c.arc(12.3, 11.4, 2.2, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  }

  function buildWingmanCards() {
    wingmanGrid.innerHTML = '';
    for (const id in WINGMEN_CFG) {
      const wm = WINGMEN_CFG[id];
      if (wm.empty) continue;   // 去掉“无僚机/不选僚机”选项：必须携带僚机出击
      const card = document.createElement('div');
      card.className = 'plane-card wingman-card' + (wm.id === currentWingman.id ? ' selected' : '');
      card.dataset.wingman = wm.id;
      if (!wm.empty) {
        const cvs = document.createElement('canvas');
        cvs.width = 56 * DPR; cvs.height = 60 * DPR;
        cvs.style.width = '56px'; cvs.style.height = '60px';
        const c = cvs.getContext('2d');
        c.scale(DPR, DPR);
        paintWingmanThumb(c, wm);
        card.appendChild(cvs);
      } else {
        card.classList.add('wingman-none');
      }
      const name = document.createElement('div');
      name.className = 'plane-card-name';
      name.textContent = wm.name;
      const desc = document.createElement('div');
      desc.className = 'plane-card-desc';
      desc.innerHTML = wm.desc;
      card.append(name, desc);
      card.addEventListener('click', () => {
        setWingman(wm);
        wingmanGrid.querySelectorAll('.plane-card').forEach(el =>
          el.classList.toggle('selected', el.dataset.wingman === wm.id));
        initWingmen();   // 同步重建僚机，避免 idle 预览与开局位置不一致（壁垒前侧 vs 群星后侧）
        refreshLoadout();   // 装备框摘要同步
      });
      wingmanGrid.appendChild(card);
    }
  }

  function buildPlaneCards() {
    planeGrid.innerHTML = '';
    for (const id in PLANES) {
      const p = PLANES[id];
      const card = document.createElement('div');
      card.className = 'plane-card' + (p.id === currentPlane.id ? ' selected' : '');
      card.dataset.plane = p.id;

      // 缩略图：复用玩家战机造型（高 DPI 适配）；暴走状态造型（翼片全展开 + 翼尖微光）
      const cvs = document.createElement('canvas');
      cvs.width = 92 * DPR; cvs.height = 76 * DPR;
      cvs.style.width = '92px'; cvs.style.height = '76px';
      const c = cvs.getContext('2d');
      c.scale(DPR, DPR);
      c.translate(46, 38);
      let cardScale = p.id === 'starslayer' ? 0.6 : 0.9;    // 群星之杀暴走巨帆更大：缩小以完整入图
      if (p.id === 'chaos') cardScale *= 0.9;   // 混乱将至：选机卡片预览图缩小 10%（主页面装备框同步）
      c.scale(cardScale, cardScale);
      paintShip(c, 1, p, 1, true);   // 概览图使用暴走形态（berserkT=1，still=静态不画动态光效）；传入当前卡片机型 p
      // 暴走翼尖微光（静态帧）——仅 chaos；群星之杀的侧角光已在 paintStarslayer 内绘制
      if (p.id === 'chaos') {
        c.save();
        c.globalAlpha = 0.5; c.shadowColor = '#ff69b4'; c.shadowBlur = 14;
        c.fillStyle = '#ff69b4';
        for (const sx of [-1, 1]) {
          c.beginPath(); c.arc(sx * 22 * 1.2 * (p.drawScale || 1), 10, 2.5, 0, Math.PI * 2); c.fill();
        }
        c.restore();
      }

      const name = document.createElement('div');
      name.className = 'plane-card-name';
      name.textContent = p.name;
      const desc = document.createElement('div');
      desc.className = 'plane-card-desc';
      desc.innerHTML = p.desc;

      card.append(cvs, name, desc);
      card.addEventListener('click', () => {
        setPlane(p);
        planeGrid.querySelectorAll('.plane-card').forEach(el =>
          el.classList.toggle('selected', el.dataset.plane === p.id));
        refreshLoadout();   // 装备框摘要同步
      });
      planeGrid.appendChild(card);
    }
  }

  function togglePause() {
    state.paused = !state.paused;
    if (state.paused) {
      bossTestRow.style.display = 'none';
      const encyBtn = document.getElementById('encyEntryBtn');
      if (encyBtn) encyBtn.style.display = 'none';
      resultAchieve.classList.add('hidden');   // 暂停页不显示「获得成就」区（仅胜利 / 失败结算页显示）
      showOverlay('已暂停', '按 <kbd>P</kbd> 继续游戏', '继续游戏');
      retrialBtn.classList.add('hidden');   // 暂停菜单不显示胜利页专属按钮
      pauseHomeBtn.classList.remove('hidden');
      // 挑战模式（含 BOSS 试炼/测试）：额外显示“重新挑战”
      if (state.challenge || state.testBoss) pauseRetryBtn.classList.remove('hidden');
      else pauseRetryBtn.classList.add('hidden');
    } else {
      overlay.classList.add('hidden');
      pauseHomeBtn.classList.add('hidden');
      pauseRetryBtn.classList.add('hidden');
      retrialBtn.classList.add('hidden');
    }
    syncInfoEntryBtn();
  }

  function endGame() {
    state.mode = 'gameover';
    const encyBtn = document.getElementById('encyEntryBtn');
    if (encyBtn) encyBtn.style.display = 'none';
    resultAchieve.classList.remove('hidden');   // 失败结算页同样显示「获得成就」区
    achvEvaluateDefeat();   // 成就：失败局条件评估（忘了）
    renderResultAchievements();   // 成就：本局获得成就徽章渲染（无成就时区块自动隐藏）
    showOverlay(
      '战机陨落',
      `<span class="result-stats">最终得分：<b style="color:#7ce7ff;font-size:18px">${state.score}</b><br />` +
      (hasPilot('xiaoyang') ? `原石收集：<b style="color:#ffc9e2">✦ ${state.gachaStones}/16</b><br />` : '') +
      `关卡难度：<b style="color:#b28dff">${currentDifficulty.name}</b>${state.challenge || state.testBoss ? '' : `<br />抵达关卡：<b style="color:#ffb545">${levelFlow.level}</b>`}<br />
       剩余生命：<b style="color:#ff4d6d">${Math.max(0, state.lives)}</b></span><br /><br />
       点击下方按钮再次出击`,
      '再来一局'
    );
    gameoverHomeBtn.classList.remove('hidden');   // 失败结算页：返回主界面按钮
    syncInfoEntryBtn();
  }

  // ---------- 装甲选择页面 ----------
  // 装甲注册表（ARMORS，见 01-config）驱动：主界面卡片自动生成；效果经 armorXxx 读取函数落地于战斗逻辑
  function buildArmorCards() {
    armorGrid.innerHTML = '';
    for (const id in ARMORS) {
      const a = ARMORS[id];
      const card = document.createElement('div');
      card.className = 'armor-card' + (a.id === currentArmor.id ? ' selected' : '');
      card.dataset.armor = a.id;
      const glyph = document.createElement('div');
      glyph.className = 'armor-card-glyph' + (a.sym ? ' glyph-sym' : '');
      glyph.textContent = a.glyph;
      glyph.style.color = a.color;
      const name = document.createElement('div');
      name.className = 'armor-card-name';
      name.textContent = a.name;
      const desc = document.createElement('div');
      desc.className = 'armor-card-desc';
      desc.innerHTML = a.brief || a.desc;   // 卡片用简短文案（brief）；详细数值见数值与机制图鉴「护甲」页
      card.append(glyph, name, desc);
      card.addEventListener('click', () => {
        setArmor(a);
        armorGrid.querySelectorAll('.armor-card').forEach(el =>
          el.classList.toggle('selected', el.dataset.armor === a.id));
        refreshLoadout();   // 装备框摘要同步
      });
      armorGrid.appendChild(card);
    }
  }

  // ---------- 副武器选择页面 ----------
  // 副武器注册表（SUB_WEAPONS，见 01-config）驱动：panelSub 面板自动生成卡片（注册表键序 = 卡片展示顺序）。
  // 开火与冷却推进见 07-player fireSubWeapon / updateSubWeapon（与主炮独立冷却、同时自动开火）
  function buildSubWeaponCards() {
    subGrid.innerHTML = '';
    for (const id in SUB_WEAPONS) {
      const w = SUB_WEAPONS[id];
      const card = document.createElement('div');
      card.className = 'armor-card' + (w.id === currentSubWeapon.id ? ' selected' : '');
      card.dataset.sub = w.id;
      const glyph = document.createElement('div');
      glyph.className = 'armor-card-glyph';
      if (w.iconSvg) {
        glyph.classList.add('glyph-svg');   // 矢量图标（焰环 / 狗耳导弹）：内联 SVG，辉光走注册色
        glyph.innerHTML = w.iconSvg;
      } else {
        glyph.textContent = w.glyph || '□';
        if (w.glyphTransform) glyph.style.transform = w.glyphTransform;   // 无界飞剑：字形倒转 180° + 加宽（注册表 glyphTransform）
        if (w.glyphBold) glyph.style.fontWeight = '700';   // 无界飞剑：线条增粗
      }
      glyph.style.color = w.color || '#9fb4d8';
      const name = document.createElement('div');
      name.className = 'armor-card-name';
      name.textContent = w.name;
      const desc = document.createElement('div');
      desc.className = 'armor-card-desc';
      desc.innerHTML = w.brief || w.desc;   // 卡片用简短文案（brief）；详细数值见数值与机制图鉴「副武器」页
      card.append(glyph, name, desc);
      card.addEventListener('click', () => {
        setSubWeapon(w);
        subGrid.querySelectorAll('.armor-card').forEach(el =>
          el.classList.toggle('selected', el.dataset.sub === w.id));
        refreshLoadout();   // 装备框摘要同步
      });
      subGrid.appendChild(card);
    }
  }

  // ---------- 驾驶员选择页面 ----------
  // 驾驶员注册表（PILOTS，见 01-config）驱动：主界面菱形框面板按 主/副 两个槽位分区生成卡片
  // （无"无驾驶员"空选项；同名驾驶员不可同时占据两槽——选中一侧会自动把另一侧同名卸下为 none）。
  // 效果经各战斗挂点 hasPilot(id) 判定（任一槽位命中即生效）
  function buildPilotCards() {
    buildPilotGrid(pilotGridMain, 'main');
    buildPilotGrid(pilotGridSub, 'sub');
  }

  function buildPilotGrid(grid, slot) {
    const equipped = slot === 'main' ? currentPilotMain : currentPilotSub;
    grid.innerHTML = '';
    for (const id in PILOTS) {
      const p = PILOTS[id];
      if (p.empty || p.slot !== slot) continue;   // 各槽位只列出归属该槽位的驾驶员（none 不再作为选项展示）
      const card = document.createElement('div');
      card.className = 'armor-card pilot-card' + (p.id === equipped.id ? ' selected' : '') + (p.special ? ' special' : '');   // special = 特殊驾驶员：卡片右上角白光角标（style.css .pilot-card.special）
      card.dataset.pilot = p.id;
      if (!p.empty) {
        const glyph = document.createElement('div');
        glyph.className = 'armor-card-glyph';
        if (p.iconSvg) {
          glyph.classList.add('glyph-svg');   // 矢量图标（陵落彼岸花）：内联 SVG，currentColor 继承注册色
          glyph.innerHTML = p.iconSvg;
        } else {
          glyph.textContent = p.glyph;
          if (p.glyphTransform) glyph.style.transform = p.glyphTransform;   // 胡笛客：ω 倒转 180°（与哈基米成对）
          if (p.glyphBold) glyph.style.fontWeight = '700';
        }
        glyph.style.color = p.color;
        card.appendChild(glyph);
      }
      const name = document.createElement('div');
      name.className = 'armor-card-name';
      name.textContent = p.name;
      const desc = document.createElement('div');
      desc.className = 'armor-card-desc';
      desc.innerHTML = p.brief || p.desc;   // 卡片用简短文案（brief）；详细机制见数值与机制图鉴「驾驶员」页
      card.append(name, desc);
      card.addEventListener('click', () => {
        // 槽位写入 + 同名互斥：选中一侧时从另一侧卸下同名驾驶员
        if (slot === 'main') {
          setPilotMain(p);
          if (currentPilotSub.id === p.id) setPilotSub(PILOTS.none);
        } else {
          setPilotSub(p);
          if (currentPilotMain.id === p.id) setPilotMain(PILOTS.none);
        }
        buildPilotCards();   // 重渲染两侧网格的选中态（简单可靠）
        refreshLoadout();    // 菱形框摘要同步
      });
      grid.appendChild(card);
    }
  }

  export {
    updateHUD, resetGame, syncInfoEntryBtn, showOverlay, buildDiffCards, buildArmorCards,
    buildSubWeaponCards, buildWingmanCards, buildPlaneCards, buildPilotCards, initMenuPanels, togglePause, endGame,
    padMenuTick,
  };