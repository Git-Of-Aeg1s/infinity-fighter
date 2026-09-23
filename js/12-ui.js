// 12-ui：HUD 更新 / 流程控制（resetGame / 暂停 / 结算）/ 选机与僚机卡片

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：06-enemy(1 名) 07-player(1 名) 13-encyclopedia(1 名) 14-main(10 名)
  // 本文件写共享状态（state/bossFlow/levelFlow 属性赋值；新增属性先在 02-core 归域声明）：
  //   state.{bombs, challenge, crystalMagnetMul, demo, flash, hasteT, hpKitBanked, hpKitLastT, hurt, lives, mode, orangeBombUsed, paused, score, shakeMag, shakeTime, testBoss, time, victoryOverlay}  levelFlow.{capitalIdleT, douzhiSkipOnce, jiaoxiang13Done, level, lowPressureT, prevLevel, spawnTimer}  bossFlow.{defeatedName, pending, phase, postDelay, postWaveT, stage, timer, victoryDelay, warnT}
  //
  import { ARMOR_SKILLS, dagouWaveIv, ARMORS, BERSERK, BULWARK, CANVAS_H, CANVAS_W, DIFFICULTIES, DOUZHI, PILOTS, PLANES, PLAYER_CFG, SHIELD_DURATION, WINGMEN_CFG, armorMaxHp, currentArmor, currentDifficulty, currentPilotMain, currentPilotSub, currentPlane, currentWingman, diffMods, pilotBombStartAdd, setArmor, setDifficulty, setPilotMain, setPilotSub, setPlane, setWingman } from './01-config.js';
  import { DPR, armorGrid, armorGlyphFx, berserkBar, berserkFill, blBombs, bombIcons, bossFlow, bossTestRow, bulwarkBurst, clamp, crystalBurst, crystals, cubeHitFx, diffGrid, dagouMissiles, diffLabel, douzhiBar, douzhiFill, douzhiFx, eBullets, enemies, dashKillFx, friendStorms, gameoverHomeBtn, hpFill, infoEntryBtn, jingdunBar, jingdunFill, levelFlow, livesText, menuScreen, menuStartBtn, missileWarns, missiles, overlay, overlayDesc, overlayTitle, pBullets, particles, pauseHomeBtn, pauseRetryBtn, pilotGauge, pilotGaugeKey, pilotGaugeRing, pilotGridMain, pilotGridSub, pillarStrikes, phaseFx, planeGrid, player, playerHitFx, popianMissiles, powerups, rand, resultAchieve, retrialBtn, scoreText, shieldBar, shieldFill, skillGauge, skillGaugeRing, slashFx, spellCubes, startBtn, state, titleBar, trailGhosts, watchClearFx, windFlows, wingmanGrid, zoneMarks } from './02-core.js';
  import { holdBGM, stopAlarm } from './03-audio.js';
  import { delayedShots, initWingmen } from './07-player.js';
  import { berserkBurst, bombBurst, shieldBurst } from './08-entities.js';
  import { paintShip, paintWingman, paintWingmanBulwark } from './09-draw-ships.js';
  import { openEncyclopedia } from './13-encyclopedia.js';



  // ---------- HUD ----------
  function updateHUD() {
    // 主菜单打开时给舞台挂 menu-open 类：CSS 隐藏战斗 HUD（菜单背景透明后会透出画布）
    menuScreen.parentElement.classList.toggle('menu-open', !menuScreen.classList.contains('hidden'));
    const maxHp = player.maxHp || PLAYER_CFG.maxHp;
    const ratio = player.hp / maxHp;
    hpFill.style.width = (ratio * 100) + '%';
    hpFill.classList.toggle('warn', ratio <= 0.55 && ratio > 0.25);

    hpFill.classList.toggle('danger', ratio <= 0.25);
    // 测试情况（测试该敌人 / 测试BOSS）：隐藏积分计数器（.score-panel）
    scoreText.parentElement.style.display = state.challenge ? 'none' : '';
    scoreText.textContent = state.score;
    // 右上角爆弹图标：图标数量代表爆弹数（上限随难度，诗篇 2）；测试模式（图鉴挑战敌人 / BOSS 测试）爆弹无限，显示 ∞
    if (state.challenge) {
      bombIcons.innerHTML = '<span class="bomb-icon infinite">∞</span>';
    } else {
      const n = Math.max(0, state.bombs);
      if (bombIcons.childElementCount !== n) {
        let html = '';
        for (let i = 0; i < n; i++) html += '<span class="bomb-icon"></span>';
        bombIcons.innerHTML = html;   // 仅数量变化时重建，避免每帧重排
      }
    }
    livesText.textContent = '♥'.repeat(Math.max(0, state.lives)) || '—';
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
    const pilotGaugeMode = (currentPilotMain.id === 'tianxiu' || currentPilotSub.id === 'tianxiu') ? 'tianxiu'
      : (currentPilotMain.id === 'lingluo' || currentPilotSub.id === 'lingluo') ? 'lingluo' : null;
    const showPilotGauge = !!pilotGaugeMode && state.mode === 'playing';
    pilotGauge.classList.toggle('hidden', !showPilotGauge);
    if (showPilotGauge) {
      let frac, ready;
      if (pilotGaugeMode === 'tianxiu') {
        frac = clamp(state.princeGauge || 0, 0, 1);
        ready = frac >= 1;
      } else {
        frac = clamp(1 - state.lingluoCdT / PILOTS.lingluo.cd, 0, 1);
        ready = state.lingluoCdT <= 0 && player.alive;
      }
      pilotGaugeRing.style.background = `conic-gradient(${PILOTS[pilotGaugeMode].color} ${frac * 360}deg, rgba(255,255,255,0.10) 0deg)`;
      pilotGauge.classList.toggle('ready', ready);
      if (pilotGaugeKey) pilotGaugeKey.textContent = 'Q';   // 天秀忧郁王子 / 陵落技能统一 Q 键
    }
    // 可莉：绷绷炸弹 HUD 图标着色（红橙火花主题）
    bombIcons.classList.toggle('klee', currentPilotMain.id === 'keli' || currentPilotSub.id === 'keli');
  }
  // ---------- 流程控制 ----------
  function resetGame(autoStart = false, opts = {}) {
    state.score = 0;
    levelFlow.level = 1;
    const bombStart = diffMods().bombStart;
    state.bombs = (bombStart != null ? bombStart : 1) + pilotBombStartAdd();   // 诗篇：初始不带高能爆弹（mods.bombStart）；可莉：初始额外 1 颗绷绷炸弹
    state.lives = PLAYER_CFG.lives;
    levelFlow.spawnTimer = 1.2;
    state.time = 0;
    state.hasteT = 0;       // 斗志昂扬增益（攻速/弹速翻倍）剩余时长
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
    levelFlow.bossMinionT = 0;           // 诗篇：BOSS 战 1类强制波次计时归零
    levelFlow.bossMinionNext = rand(6, 12);
    state.orangeBombUsed = false;
    state.hpKitLastT = -99;   // 诗篇加血节流计时归位（开局不受冷却限制）
    state.hpKitBanked = 0;    // 诗篇加血节流预触发计数清零
    state.crystalMagnetMul = 1;   // 水晶磁吸倍率重开归 1（击败旧日之歌后再 ×1.5）
    state.armorSkillGauge = 0;    // 装甲技能量表（七日澜心）重开归零
    // 驾驶员运行态重置：许凯狗冲刺（测试 / 图鉴挑战直接开 BOSS 战，不进入冲刺阶段）。
    // 仅在真正开局（autoStart）时置位——返回主界面（resetGame(false)）必须清零，
    // 否则主菜单演示机体（复用 drawPlayer）会残留冲刺白光特效
    state.pilotDashT = (autoStart && (currentPilotMain.id === 'xukaigou' || currentPilotSub.id === 'xukaigou') && !state.testBoss && !state.challenge)
      ? PILOTS.xukaigou.dashDur : 0;
    state.maxinSpeedMul = 1;   // 马兴犬：移速倍率恢复原速
    // 天秀忧郁王子：量表与增益全部归零
    state.princeGauge = 0;
    state.princeScoreBase = 0; state.princeCrystalGain = 0;
    // 陵落：Q 技能冷却满值起步（开局技力条为空，不能立刻释放）；大狗：导弹雨计时取 10~22s 随机初值
    state.lingluoCdT = (currentPilotMain.id === 'lingluo' || currentPilotSub.id === 'lingluo') ? PILOTS.lingluo.cd : 0;
    state.dagouMissT = (currentPilotMain.id === 'dagou' || currentPilotSub.id === 'dagou')
      ? dagouWaveIv(state.dagouDebugRapid) : 0;
    state.dagouWarnFadeT = 0;   // 大狗：预警蓝光渐隐计时归零
    // 哈基米大王：闪避累积加成与尾部闪避计时清零；凌漓：隐藏计数表与澜心量表快照归零
    state.hajimiDodgeBonus = 0;
    state.hajimiTailT = 0;
    state.lingliGauge = 0;
    state.lingliArmorGaugePrev = 0;
    player.lingluoMaxDebt = 0;   // 陵落：生命上限债务清零（player.maxHp 已在下方按装甲复原）
    // 大无垠之王：BOSS 战累积增伤清零
    state.kingDmg = 0; state.kingTaken = 0;
    // 埃逸：自爆相关状态归零
    state.aiyiSelfDestruct = false; state.aiyiFinalDeath = false; state.selfDestructVictory = false;
    state.aiyiWaves.length = 0; state.aiyiWaveSeq = 0;
    player.aiyiChargeT = 0;
    friendStorms.length = 0;      // 友方大风暴随重开清空
    dashKillFx.length = 0;        // 许凯狗冲刺白光冲击特效随重开清空
    dagouMissiles.length = 0;     // 大狗导弹雨随重开清空（否则回主菜单后飞行中/待发射导弹冻结在画面上）
    player.crystalShield = 0;     // 七日澜心水晶护盾清除
    player.bulwarkUsed = false;   // 最终壁垒：新的一条命，免死机会重置
    player.bulwarkFxT = 0;        // 最终壁垒：免死菱形环绕演出计时归零
    player.chixinBurnT = 0;       // 炽心：灼烧计时归零
    player.regenT = 0;            // 洄：回血计时归零
    player.watchClearCd = 0;      // 群星守望：消弹冷却归零
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
    // 测试模式：指定 BOSS 直接挑战；按 R 重开时保留测试目标，点“开始游戏”则清除
    state.testBoss = opts.testBoss !== undefined ? opts.testBoss
      : (opts.keepTest ? state.testBoss : null);
    // 图鉴挑战模式：按 R 重开时保留，点“开始游戏”/返回主界面则清除
    state.challenge = opts.challenge !== undefined ? opts.challenge
      : (opts.keepTest ? state.challenge : null);
    const bossChallenge = state.challenge && state.challenge.kind === 'boss';
    bossFlow.pending = (bossChallenge ? state.challenge.bossId : null) || state.testBoss || 'song';
    if (bossChallenge || state.testBoss) bossFlow.stage = 'wait';   // 跳过等待，清场后进警报（直接 wait→warn，避免开场多打一发）
    // 风暴编织者挑战 / 试炼：无警报直接召唤——BGM 延后 0.8s 起播（结算曲淡出 + 登场雷暴衔接，不再立刻重播）
    if ((bossChallenge && state.challenge.bossId === 'storm2') || state.testBoss === 'storm2') holdBGM(0.8);
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
    popianMissiles.length = 0;
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
    // 战斗内重开（R / 重新挑战）时主菜单已隐藏，直接落位。此刻 player.y 仍为演示屏站位（updateDemo 每帧强制）
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
    player.kbT = 0; player.kbVx = 0; player.kbVy = 0;   // 清除击退状态
    player.invuln = state.pilotDashT > 0 ? state.pilotDashT : 1.0;   // 许凯狗：开局无敌覆盖整个冲刺阶段（不闪动）
    player.invulnBlink = false;   // 开局无敌不闪动：清掉上一局残留的受击闪动标记（登场/重生无敌保持机体完整可见）
    player.alive = true;
    player.weapon = (state.testBoss || state.challenge) ? 4 : (currentPlane.startWeapon || 1);   // BOSS 试炼 / 图鉴挑战：默认火力 Lv4
    player.berserkBanner = 0;
    player.shield = 0;
    player.respawnTimer = 0;
    player.hitCount = 0;
    player.hitFxT = 0;
    player.slashCd = 0; player.slashTarget = null; player.slashQueued = 0; player.slashGapT = 0;   // 群星之杀斩击运行态重置
    player.berserkSpread = 0;   // 暴走刃帆变形进度归零（否则上一局暴走中返回主界面，主菜单演示会残留金光/光点）
    // 磁力装甲：开局自带量子护盾（仅开局，重生不带）
    player.shield = (currentArmor.startShield || 0);
    initWingmen();

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
  // 三档难度（具象 / 真我 / 诗篇）均已实装，由 DIFFICULTIES 注册表驱动（数值/行为差异见 01-config 各自 mods
  // 与 SONG_SHIP / STORM_SHIP）；wip 难度（当前无）展示但不可选（点击抖动拒绝），机制保留供未来扩展。
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
      if (d.wip) {
        const badge = document.createElement('span');
        badge.className = 'diff-badge';
        badge.textContent = '设计中';
        card.appendChild(badge);
      }
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

  // ---------- 装备四框 ↔ 展开面板（战机 / 装甲 / 副武器占位 / 僚机） ----------
  // 点击装备框展开对应选择面板（覆盖演示屏区域），再点同框或 ✕ 收起；单开互斥。
  // 框内第二行实时显示当前选中项名称（refreshLoadout，选择变化 / 回主菜单时刷新）。
  function closeAllPanels() {
    document.querySelectorAll('.loadout-panel').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.loadout-box, .pilot-diamond').forEach(b => b.classList.remove('open'));
  }

  // 框内当前配置摘要 + 当前形象缩略图（副武器未实装：静态占位，不在刷新范围）
  function refreshLoadout() {
    const planeVal = document.getElementById('loadoutPlaneVal');
    const armorVal = document.getElementById('loadoutArmorVal');
    const wingmanVal = document.getElementById('loadoutWingmanVal');
    const pilotVal = document.getElementById('loadoutPilotVal');
    if (planeVal) planeVal.textContent = currentPlane.name;
    if (armorVal) armorVal.textContent = currentArmor.name;
    // 驾驶员菱形框摘要：主驾驶员名 + 副驾驶员名（副行为空则只显示主；有简称 short 的显示简称，悬停提示仍用全名）
    const pilotDiamond = document.querySelector('.pilot-diamond');
    const pilotSubVal = document.getElementById('loadoutPilotSubVal');
    if (pilotVal) pilotVal.textContent = currentPilotMain.empty ? '无' : (currentPilotMain.short || currentPilotMain.name);
    if (pilotSubVal) pilotSubVal.textContent = currentPilotSub.empty ? '' : (currentPilotSub.short || currentPilotSub.name);
    if (pilotDiamond) pilotDiamond.title =
      '主驾驶员：' + (currentPilotMain.empty ? '无' : currentPilotMain.name) +
      '／副驾驶员：' + (currentPilotSub.empty ? '无' : currentPilotSub.name);
    // 装甲名正下方的半透明图标（绝对定位，不挤动文字）：随当前装甲同步图案与颜色
    const armorGlyph = document.getElementById('loadoutArmorGlyph');
    if (armorGlyph) {
      armorGlyph.textContent = currentArmor.glyph;
      armorGlyph.style.color = currentArmor.color;
      armorGlyph.classList.toggle('glyph-sym', !!currentArmor.sym);   // ∞（洄）字形换 Corbel 修左右不对称
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
    }
    refreshLoadout();
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
    showOverlay(
      '战机陨落',
      `<span class="result-stats">最终得分：<b style="color:#7ce7ff;font-size:18px">${state.score}</b><br />
       关卡难度：<b style="color:#b28dff">${currentDifficulty.name}</b><br />
       抵达关卡：<b style="color:#ffb545">${levelFlow.level}</b><br />
       剩余生命：<b style="color:#ff4d6d">${Math.max(0, state.lives)}</b></span><br /><br />
       按 <kbd>R</kbd> 或点击下方按钮再次出击`,
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
      card.className = 'armor-card pilot-card' + (p.id === equipped.id ? ' selected' : '');
      card.dataset.pilot = p.id;
      if (!p.empty) {
        const glyph = document.createElement('div');
        glyph.className = 'armor-card-glyph';
        glyph.textContent = p.glyph;
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
    buildWingmanCards, buildPlaneCards, buildPilotCards, initMenuPanels, togglePause, endGame,
  };