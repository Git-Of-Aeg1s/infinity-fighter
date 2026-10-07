// 14-main：输入绑定 / 主循环调度 / 事件绑定 / 启动入口（必须最后加载）

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：（无——本文件为叶子模块，修改导出名前需确认无调用方）
  // 本文件写共享状态（state/bossFlow/levelFlow 属性赋值；新增属性先在 02-core 归域声明）：
  //   state.{cheatArm, flash, hurt, maxinSpeedMul, mode, shakeTime, time, victoryOverlay}  levelFlow.{capitalIdleT, douzhiSkipOnce, jiaoxiang13Done, level, lowPressureT, prevLevel, poemClearNext, poemClearT, poemWaveIdx, spawnTimer}  bossFlow.{pending, postDelay, postWaveT, stage, timer, victoryDelay, warnT}
  //
  import { BERSERK, BOSS_MINION_WAVE, BOSS_SEQUENCE, hasPilot, isPoem, BOSS_SPAWN_EARLY, BOSS_WARN_TOTAL, CANVAS_H, CANVAS_W, DOUZHI, FASHI_ARRAY, PILOTS, PLAYER_CFG, PRESSURE_CAPACITY, REWARD_ITEMS, SPAWN_PHASE_LEVEL, SPAWN_PHASE_TIMES, SPAWN_RUSH, SPAWN_RUSH_CAP, SPAWN_SLOW_MUL, WAVE_POEM, currentDifficulty, currentPlane, diffMods, pickRewardDroneType, rewardDroneChance } from './01-config.js';
  import { armorGlyphFx, blastRings, bossEntranceActive, bossFlow, bulwarkBurst, canvas, clamp, crystalBurst, ctx, dashKillFx, encyClose, enemies, enemyEnterFrac, fpsMeter, gameoverHomeBtn, initNebulae, initStars, keys, levelFlow, menuStartBtn, musicToggle, padPressed, pauseHomeBtn, pauseRetryBtn, player, playerHitFx, pollGamepad, rand, resultAchieve, retrialBtn, spawnParticles, startBtn, state, updateNebulae, updateStars, watchClearFx } from './02-core.js';
  import { startAlarm, stopAlarm, updateBGM } from './03-audio.js';
  import { capitalMaxWait, challengeTargets, fieldPressureW, spawnBossMinionWave, spawnCapitalSlot, spawnChallengeTarget, spawnChallengeWave, spawnDouzhi, spawnFashiArray, spawnJiaoxiang, spawnPostBossWave, spawnPressureThreshold, spawnWave, updateChallenge } from './04-spawn.js';
  import { spawnBoss, spawnStormGhost, updateZoneMarks } from './05-boss.js';
  import { clearMissiles, killEnemy, updateBaolingBombs, updateDouzhiFx, updateEnemies, updateFrostZones, updateMissiles, updatePopianMissiles, updateSpellCubes, updateWgSlashes, updateXgLooseBombs } from './06-enemy.js';
  import { applyRewardItem, chargeAllGaugesOnDashEnd, clearEnemyBullets, debugForceGacha, noteDdjLevelUp, playerFireLocked, triggerArmorSkill, triggerPilotSkill, tryChengyueShield, updateAiyiWaves, updateDagouMissiles, updateDemo, updateFriendStorms, updatePilotStatus, updatePlayer, updateSlashFx, updateWingmen, useBomb } from './07-player.js';
  import { berserkBurst, bombBurst, collectAllCrystals, collectAllItems, shieldBurst, updateBullets, updateCrystals, updateParticles, updatePowerups } from './08-entities.js';
  import { render } from './10-draw-world.js';
  import { buildArmorCards, buildDiffCards, buildPilotCards, buildPlaneCards, buildSubWeaponCards, buildWingmanCards, initMenuPanels, padMenuTick, resetGame, showOverlay, syncInfoEntryBtn, togglePause, updateHUD } from './12-ui.js';
  import { achvEvaluateVictory, achvNoteCheat, achvNoteDagouCheatOn, achvNoteTianxiuCheatOn, renderResultAchievements } from './02-achievements.js';
  import { closeEncyclopedia, initEncyDiffButtons } from './13-encyclopedia.js';


  // ---------- 输入 ----------
  // 作弊武装开关（预留）：true=需先按 0 武装（state.cheatArm，右上角音量键微微变亮作为已武装标识）
  // 才能使用作弊键 1~5 / 8 / 9；false=作弊键直接生效，按 0 不做任何事（音量键标识也不会变化）。
  // 当前为 false——三种作弊键均无需武装。
  const WEAPON_CHEAT_REQUIRE_ARM = false;
  // 持续刷怪测试（图鉴「数值与机制」页发起，challenge.kind==='swarm'）的数字键道具映射：
  // 按 REWARD_ITEMS 注册表顺序（1~5 普通 / 6 轰轰炸弹 / 8~0 稀有；手持斗志昂扬已移除——2026-10-01；
  // gacha 不在列——萧杨 16 颗原石专属技能）。直接生效（道具槽已取消，07-player applyRewardItem）
  const SWARM_CHEAT_ITEMS = {
    '1': 'laodaDrink',      // 牢大特饮
    '2': 'magnetShroom',    // 磁力菇
    '3': 'noLingluo',       // 不再陵落
    '4': 'frostGen',        // 寒霜发生器
    '5': 'xinguodongFury',  // 辛国栋大怒
    '6': 'honghongBomb',    // 轰轰炸弹
    '8': 'bengbag',         // 绷绷背包
    '9': 'jiukeShadow',     // 酒客之影
    '0': 'bottleSpirit',    // 瓶中精灵
  };
  // 直接设定武器等级（调试/作弊）：Lv5 视为暴走，需同时给予暴走倒计时，否则下一帧会回落 Lv4；
  // 切到 Lv5 与自然暴走同样触发澄月判定（tryChengyueShield，BOSS 战限一次的门控照常生效）
  function debugSetWeapon(n) {
    if (!player.alive) return;
    achvNoteCheat();   // 成就：武器等级直设属作弊（无垠 / 无垠战机排除）
    if (n === 5) {
      player.weapon = 5;
      player.berserk = BERSERK.duration;
      player.berserkBanner = Math.max(player.berserkBanner || 0, 1.5);
      spawnParticles(player.x, player.y, currentPlane.berserkColor || '#ffb545', 20, 240);
      tryChengyueShield();
    } else {
      player.weapon = n;
      player.berserk = 0;
    }
    player.cooldown = 0;
  }
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    // 持续刷怪测试页标志：此页禁用常规作弊键（1~5 / 8 / 9 / 0 / =），数字键改发奖励道具（SWARM_CHEAT_ITEMS）
    const swarmTest = state.mode === 'playing' && state.challenge && state.challenge.kind === 'swarm';
    if (['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      e.preventDefault();
    }
    if (k === 'p' && state.mode === 'playing') togglePause();
    // Space / 右Ctrl（e.code 区分左右，左 Ctrl 保留给浏览器快捷键）：高能爆弹
    // （右Ctrl 同为修饰键：按住时按 W 仍会触发浏览器关标签页且无法拦截——与马兴犬弃用 Ctrl 的原因相同，玩家自担）
    if ((k === ' ' || e.code === 'ControlRight') && state.mode === 'playing' && !state.paused) useBomb();
    if (k === 'f' && state.mode === 'playing' && !state.paused) triggerArmorSkill();   // 装甲技能（七日澜心：水晶护盾；量表满方可触发）
    if (k === 'q' && state.mode === 'playing' && !state.paused) triggerPilotSkill('q');   // 驾驶员技能（天秀忧郁王子：友方大风暴，量表满方可触发 / 陵落：强行暴走，冷却结束方可触发 / 萧杨：原石抽卡充能满时释放）
    // 大狗导弹雨连发开关（作弊键，不要求装备大狗——任意驾驶员均可触发）：
    // 战斗中按 9 切换 0.2~1s 间隔，再按恢复（未装备大狗时：开启即启用整套导弹雨系统并以连发间隔运行）。
    // 开启瞬间立刻压缩当前倒计时——否则最长要等 22s 才能看到下一波，看起来像没反应；
    // WEAPON_CHEAT_REQUIRE_ARM = true 时需先按 0 武装（预留机制，见顶部开关说明）
    if (k === '9' && !swarmTest && state.mode === 'playing' && (!WEAPON_CHEAT_REQUIRE_ARM || state.cheatArm)) {
      state.dagouDebugRapid = !state.dagouDebugRapid;
      if (state.dagouDebugRapid) {
        state.dagouMissT = Math.min(state.dagouMissT, rand(0.2, 1));
        achvNoteDagouCheatOn();   // 成就：作弊开关（记作弊 + 解锁捣蛋来袭）
      }
      console.log('[debug] 大狗 rapid 导弹雨: ' + (state.dagouDebugRapid ? 'ON（0.2~1s/波）' : 'OFF（10~22s/波）'));
    }
    // 天秀连发风暴开关（作弊键，不要求装备天秀忧郁王子——任意驾驶员均可触发）：
    // 战斗中按 8 切换——每 0.4~1.4s 自动向前发射一个友方大风暴（无视量表），再按关闭；
    // WEAPON_CHEAT_REQUIRE_ARM = true 时需先按 0 武装（预留机制，见顶部开关说明）
    if (k === '8' && !swarmTest && state.mode === 'playing' && (!WEAPON_CHEAT_REQUIRE_ARM || state.cheatArm)) {
      state.tianxiuDebugSpam = !state.tianxiuDebugSpam;
      state.tianxiuDebugSpamT = 0;   // 开启瞬间立即发射第一个
      if (state.tianxiuDebugSpam) achvNoteTianxiuCheatOn();   // 成就：作弊开关（记作弊 + 解锁万道风流）
      console.log('[debug] 天秀 rapid 风暴: ' + (state.tianxiuDebugSpam ? 'ON（0.4~1.4s/个）' : 'OFF'));
    }
    // 马兴犬：Shift 加速 / CapsLock 减速（同键再按恢复原速）——不再使用 Ctrl（按住 Ctrl 时按 W 会触发浏览器关闭标签页，无法拦截）
    if (k === 'shift' && state.mode === 'playing' && !state.paused && hasPilot('maxingquan')) {
      state.maxinSpeedMul = state.maxinSpeedMul === PILOTS.maxingquan.speedFast ? 1 : PILOTS.maxingquan.speedFast;
    }
    if (k === 'capslock' && state.mode === 'playing' && !state.paused && hasPilot('maxingquan')) {
      state.maxinSpeedMul = state.maxinSpeedMul === PILOTS.maxingquan.speedSlow ? 1 : PILOTS.maxingquan.speedSlow;
    }
    // 作弊武装（预留机制）：WEAPON_CHEAT_REQUIRE_ARM = true 时按 0 武装（任意界面可按）后 1~5 / 8 / 9 才生效，
    // 右上角音量键微微变亮作为已武装标识；当前开关为 false——按 0 完全无动作（音量键标识不变）。
    // "=" 立刻再召唤一个测试目标（非作弊，保持原样）
    if (k === '0' && !swarmTest && WEAPON_CHEAT_REQUIRE_ARM && !state.cheatArm) {
      state.cheatArm = true;
      musicToggle.classList.add('cheat-armed');   // 已武装标识：音量键边框提亮
    }
    if (state.mode === 'playing' && !state.paused) {
      // 持续刷怪测试页：数字键直接获得对应道具（立即生效），常规作弊键全部让位
      if (swarmTest && SWARM_CHEAT_ITEMS[k] && !e.repeat) {
        applyRewardItem(SWARM_CHEAT_ITEMS[k]);   // 直接生效（道具槽已取消）；获得特效见 07-player pushItemPickFx
      }
      // 测试挑战（怪物权重单敌 / 波次 / 持续刷怪）按 7：立刻释放一次萧杨「哦哦！抽卡！」——
      // 无视是否携带萧杨、无视充能（debugForceGacha，07-player）；SWARM_CHEAT_ITEMS 无 7，三页共用不冲突；
      // 常规战斗（非 state.challenge）按 7 无事发生
      if (k === '7' && state.challenge && !e.repeat) debugForceGacha();
      const lv = '12345'.indexOf(k);
      if (lv >= 0 && !swarmTest && (!WEAPON_CHEAT_REQUIRE_ARM || state.cheatArm)) debugSetWeapon(lv + 1);
      // = / Shift+=（Shift+= 在多数键盘布局上产生字符 '+'，两者都接受）；忽略按住不放的自动重复
      // 事件（keydown ~30Hz 连发会疯狂重复清场+群召）
      if ((k === '=' || k === '+') && !e.repeat && state.challenge) {
        if (state.challenge.kind === 'enemy') {
          // Shift+=：场上仅 1 个测试目标（召唤物不计）时先清场再统一召唤 10 个；已有多个则直接追加 10 个
          if (e.shiftKey && challengeTargets().length === 1) {
            // 上限保护：killEnemy 对 _deathSettled 残留体会直接 return 不移除（重入保护），
            // 无上限 while 会卡死——跳过残留体直接出列，并以上限兑底
            for (let guard = enemies.length * 4 + 16; enemies.length > 0 && guard > 0; guard--) {
              const en = enemies[0];
              if (!en || en._deathSettled) { if (en) enemies.splice(0, 1); continue; }
              en.hp = 0;
              killEnemy(0);
            }
          }
          spawnChallengeTarget(e.shiftKey ? 10 : 1);
        } else if (state.challenge.kind === 'wave' && k === '=' && !e.shiftKey) {
          // 波次测试：按 = 额外刷出一整波（不清除场上敌人，可观察多波叠加；Shift+=（产生 '+'）无事发生）
          spawnChallengeWave(state.challenge);
        }
      }
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  // ---------- 手柄输入 ----------
  // 战斗内动作分发：pollGamepad 每帧刷新 gamepad（02-core）后按边沿（padPressed = 本帧按下且上一帧未按下）逐一判定。
  // 键盘动作走 keydown 事件（一次性），手柄是纯轮询——必须在此显式分发（向 keys 写 'space' 等不会被事件路径触发）。
  // 键位映射：X=装甲技能(F) Y=驾驶员技能(Q) LB/RB=爆弹(Space/右Ctrl) Start=暂停(P) RT/LT=马兴犬加速/减速(Shift/CapsLock)
  function padCombatTick() {
    if (padPressed('start')) { togglePause(); return; }   // 暂停恢复当帧不再结算战斗键（同键盘语义：暂停中 F/Q/爆弹无效）
    if (padPressed('lb') || padPressed('rb')) useBomb();
    if (padPressed('x')) triggerArmorSkill();
    if (padPressed('y')) triggerPilotSkill('q');
    // 马兴犬变速：与 Shift/CapsLock 同款「同键再按恢复」（RT 加速 / LT 减速，扳机行程过半即触发）
    if (padPressed('rt') && hasPilot('maxingquan')) {
      state.maxinSpeedMul = state.maxinSpeedMul === PILOTS.maxingquan.speedFast ? 1 : PILOTS.maxingquan.speedFast;
    }
    if (padPressed('lt') && hasPilot('maxingquan')) {
      state.maxinSpeedMul = state.maxinSpeedMul === PILOTS.maxingquan.speedSlow ? 1 : PILOTS.maxingquan.speedSlow;
    }
  }

  // ---------- 主循环 ----------
  let lastTime = performance.now();
  let fpsEma = 0;       // FPS 指数滑动平均（音量键下方灰色读数，纯展示）
  let fpsTextT = 0;     // 距上次刷新 FPS 文本的毫秒数（1s 节流：读数每秒一跳，避免逐帧写 DOM）

  // 主循环调度：页面不可见（后台标签 / 内嵌预览面板）时浏览器会挂起 requestAnimationFrame，
  // 导致游戏黑屏冻结；document.hidden 时改用 setTimeout 兑底。
  // loopToken 记录已排程标识，配合 visibilitychange 在两种机制间切换，避免排程死锁。
  let loopToken = null;         // 当前已排程标识（rAF id / timer id），null 表示未排程
  let loopByTimeout = false;    // 当前排程机制：true = setTimeout，false = requestAnimationFrame
  function scheduleLoop() {
    if (loopToken != null) return;
    const step = () => { loopToken = null; loop(performance.now()); };
    if (document.hidden) { loopByTimeout = true; loopToken = setTimeout(step, 1000 / 60); }
    else { loopByTimeout = false; loopToken = requestAnimationFrame(step); }
  }
  document.addEventListener('visibilitychange', () => {
    if (loopToken == null) return;
    if (document.hidden && !loopByTimeout) {          // 转不可见：挂起中的 rAF 永不执行，取消并改排定时器
      cancelAnimationFrame(loopToken);
      loopToken = null;
      scheduleLoop();
    } else if (!document.hidden && loopByTimeout) {   // 恢复可见：后台定时器被节流，切回 rAF 满帧
      clearTimeout(loopToken);
      loopToken = null;
      scheduleLoop();
    }
  });

  function loop(now) {
    const rawDt = Math.max(1, now - lastTime);   // 原始帧间隔（ms，FPS 读数用，不参与游戏逻辑）
    const dt = Math.min(0.033, rawDt / 1000);
    lastTime = now;
    // FPS 读数：指数滑动平均，每 1s 刷一次文本（rAF 节奏 = 显示器刷新率，后台 setTimeout 兑底路径同样计入）
    fpsEma = fpsEma ? fpsEma * 0.9 + (1000 / rawDt) * 0.1 : 1000 / rawDt;
    fpsTextT += rawDt;
    if (fpsMeter && fpsTextT >= 1000) {
      fpsTextT = 0;
      fpsMeter.textContent = 'FPS ' + Math.round(fpsEma);
    }
    try {
      // 手柄：每帧轮询（Gamepad API 无事件推送）+ 按界面分发——战斗帧走动作键，其余帧走 12-ui 菜单焦点导航
      pollGamepad();
      if (state.mode === 'playing' && !state.paused) padCombatTick();
      else padMenuTick(dt);
      if (state.mode === 'playing' && !state.paused) {
      state.time += dt;

      // 关卡推进：由当前阶段的有效刷怪时间决定（bossTimer 仅在 bossStage==='none' 期间累加，
      // 停怪/警报/BOSS 战自然冻结；击败 BOSS 归零重计——得分不再影响出怪强度）
      const lvCfg = SPAWN_PHASE_LEVEL[bossFlow.phase] || SPAWN_PHASE_LEVEL[SPAWN_PHASE_LEVEL.length - 1];
      const lvPhaseTime = SPAWN_PHASE_TIMES[bossFlow.phase] ?? SPAWN_PHASE_TIMES[SPAWN_PHASE_TIMES.length - 1];
      levelFlow.level = lvCfg.base + Math.floor(Math.min(bossFlow.timer, lvPhaseTime) / lvCfg.step);
      // 持续刷怪测试（图鉴「数值与机制」发起，challenge.kind==='swarm'）：锁定 Lv20 强度一直刷怪——
      // bossFlow.timer 恒 0（BOSS 阶段推进同样由 timer 驱动，恒 0 即永不进警报/BOSS，stage 保持 'none' 持续出怪）、
      // 等级覆盖为 20（编队权重取 Lv20 档），波次刷新照常由 spawnTimer 驱动，不会停止
      if (state.challenge && state.challenge.kind === 'swarm') {
        bossFlow.timer = 0;
        levelFlow.level = 20;
      }
      // 诗篇波次制：关卡等级 = 阶段基准 + 本阶段已刷波数 − 1（波 N = 等级 N：第一轮 10 波 = Lv1~10、第二轮 = Lv11~20；
      // 由 14-main 波次分支在每次 spawnWave 后同步刷新；许凯狗冲刺期由下方冲刺块覆盖等级）
      if (isPoem() && !state.challenge) levelFlow.level = lvCfg.base + levelFlow.poemWaveIdx - 1;

      // 许凯狗：开场高能冲刺（PILOTS.xukaigou）——
      //   等级 1s/级（开局 1 级起步，封顶 dashLv）；冲刺期间无敌由 resetGame 覆盖；
      //   机体自动在屏高 20%~50% 大幅上下摆动（updatePlayer 驱动）、我方全程停火（playerFireLocked）；
      //   出场即秒：敌机进场 60%~80%（逐机随机）即被强制击杀（enemyEnterFrac），走完整击杀流程（道具正常掉落）；
      //   撞上 BOSS：每 0.1s 造成 2000 + 4% BOSS 最大血量伤害（正常流程冲刺期无 BOSS，仅试炼残留 / 特殊时序下可撞到）；
      //   刷怪间隔 ÷3（等级 1s/级；节奏介于正常与旧 ÷5 之间——旧 ÷5 每级刷怪量对齐的设计导致刷怪量爆炸）；
      //   冲刺结束：bossFlow.timer 对齐到 dashLv 对应时刻（1 + 35/5 = 8 → 直接衔接 Lv8，刷怪期总长不变）
      if (state.pilotDashT > 0) {
        state.pilotDashT = Math.max(0, state.pilotDashT - dt);
        levelFlow.level = Math.min(PILOTS.xukaigou.dashLv,
          1 + Math.floor((PILOTS.xukaigou.dashDur - state.pilotDashT) / 1));
        levelFlow.prevLevel = levelFlow.level;   // 冲刺期升级不触发斗志昂扬判定
        bossFlow.timer = 0;
        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          if (e && e.type !== 'boss' && !e._deathSettled) {
            // 进场 60%~80%（逐机随机阈值）即强制击杀
            const frac = e._dashFrac || (e._dashFrac = rand(0.6, 0.8));
            if (enemyEnterFrac(e) >= frac) {
              // 白光冲击特效：被冲刺击杀的敌机身上炸开扩散白环 + 闪核（绘制见 10-draw-world drawDashKillFx）
              dashKillFx.push({ x: e.x, y: e.y, t: 0, max: 0.35, r: Math.max(e.w, e.h) * 0.55 });
              killEnemy(i);
            }
          }
        }
        // 冲刺撞 BOSS：每 0.1s 一跳（逐 BOSS 独立计时），伤害 2000 + 4% BOSS 最大血量；
        // 登场虚化期间（警报 / 入场动画，bossEntranceActive）BOSS 不可受击——跳过
        const dashBoss = enemies.find(en => en.type === 'boss' && !en.dying && !en._deathSettled && !bossEntranceActive());
        if (dashBoss &&
            Math.abs(player.x - dashBoss.x) < (dashBoss.w + PLAYER_CFG.w) / 2 &&
            Math.abs(player.y - dashBoss.y) < (dashBoss.h + PLAYER_CFG.h) / 2) {
          dashBoss._dashHitT = (dashBoss._dashHitT || 0) - dt;
          if (dashBoss._dashHitT <= 0) {
            dashBoss._dashHitT = 0.1;
            dashBoss.hp -= 2000 + dashBoss.maxHp * 0.04;
            if (dashBoss.hp <= 0) {
              const bi = enemies.indexOf(dashBoss);
              if (bi >= 0) killEnemy(bi);
            }
          }
        }
        if (state.pilotDashT <= 0) {
          bossFlow.timer = (PILOTS.xukaigou.dashLv - lvCfg.base) * lvCfg.step;
          chargeAllGaugesOnDashEnd();   // 冲刺结束瞬间：所有技能计量表立刻完全充能（07-player）
        }
      }

      // 关卡提升时：每次升级有 DOUZHI.spawnChance 概率从屏幕左/右侧生成一架斗志昂扬横穿（挑战模式不生成）；
      // 击败 BOSS 引发的阶段跳变升级除外（douzhiSkipOnce，见 killEnemy）
      if (levelFlow.level > levelFlow.prevLevel) {
        levelFlow.prevLevel = levelFlow.level;
        if (levelFlow.douzhiSkipOnce) levelFlow.douzhiSkipOnce = false;
        // 奖励无人机（斗志昂扬/赞助/豪华赞助）：每次关卡提升按难度概率刷新一架（每次至多一架，5/4/1 加权抽取）；
        // 击败 BOSS 的跳变升级豁免（douzhiSkipOnce）对三种一并生效；挑战模式不刷；
        // 2026-10-04 用户定稿：BOSS 试炼（testBoss）全程不刷——击败 boss 升级引发的刷新一并禁绝，试炼场只打 boss 不出杂鱼
        else if (!state.challenge && !state.testBoss && Math.random() < rewardDroneChance()) spawnDouzhi(pickRewardDroneType());
        // 叮咚鸡：每次关卡提升掷计数增量（含击败 BOSS 引发的跳变升级；挑战模式不计）
        if (!state.challenge && hasPilot('dingdongji')) noteDdjLevelUp();
      } else if (levelFlow.level < levelFlow.prevLevel) {
        levelFlow.prevLevel = levelFlow.level;
      }

      // BOSS 流程状态机：none → wait(等清场) → warn(警报演出) → fight(BOSS战) → none
      // 关卡节奏：刷怪 50s → 旧日之歌 → 击败后 2s + 固定首波 + 4s → 再刷怪 50s → 暴风之眼 → 胜利结算
      // 达到登场条件后不再出怪；场上清空后播放警报，演出结束 BOSS 中速进场并展开
      if (state.challenge) {
        // 图鉴挑战模式：跳过常规出怪与 BOSS 计时，由 updateChallenge 单独驱动
        updateChallenge(dt);
      } else if (bossFlow.stage === 'none') {
        // BOSS 击败后的 2s 缓冲与首波 4s 观察期不计入关卡推进（冻结 bossTimer，等级不增长）
        if (bossFlow.postDelay <= 0 && bossFlow.postWaveT <= 0) bossFlow.timer += dt;
        // 当前阶段刷怪时间到 → 等清场后进警报；登场 BOSS 由 bossPhase 决定（旧日之歌 → 暴风之眼）
        // 诗篇波次制：本阶段波次全部刷出且场上清空 → 直接进警报（波次耗尽即刷怪期结束，不等计时）
        const phaseTime = SPAWN_PHASE_TIMES[bossFlow.phase] ?? SPAWN_PHASE_TIMES[SPAWN_PHASE_TIMES.length - 1];
        const phaseWaves = WAVE_POEM.wavesPerPhase[bossFlow.phase] ?? WAVE_POEM.wavesPerPhase[WAVE_POEM.wavesPerPhase.length - 1];
        if (isPoem()
            ? (levelFlow.poemWaveIdx >= phaseWaves && enemies.length === 0)
            : bossFlow.timer >= phaseTime) bossFlow.stage = 'wait';
      } else if (bossFlow.stage === 'wait') {
        if (enemies.length === 0) {
          bossFlow.warnT = 0;
          // 正常流程：登场本阶段对应的 BOSS（BOSS 试炼 / 图鉴挑战已在 resetGame 指定 pendingBoss，不覆盖）
          if (!state.testBoss && !state.challenge) {
            bossFlow.pending = BOSS_SEQUENCE[bossFlow.phase] || BOSS_SEQUENCE[BOSS_SEQUENCE.length - 1];
          }
          collectAllItems();   // 警报开始时立即收集场上所有水晶和道具
          clearEnemyBullets(); clearMissiles();   // 警报触发：立刻清除全场所有弹幕
          // 风暴编织者：正常流程由暴风之眼死后直接召唤（无警报），图鉴挑战 / 试炼保持一致——
          //   跳过警报直接召唤，先放暴风之眼残影轰然消散，登场演出（雷暴 → 现身）即入场动画
          if (bossFlow.pending === 'storm2') {
            spawnStormGhost();
            spawnBoss('storm2');
            bossFlow.stage = 'fight';
          } else {
            bossFlow.stage = 'warn';
            startAlarm();
          }
        }
      } else if (bossFlow.stage === 'warn') {
        bossFlow.warnT += dt;
        // 旧日之歌：提前 3s 生成（黑洞在警报背后形成）
        if (!enemies.some(en => en.type === 'boss') && bossFlow.warnT >= BOSS_WARN_TOTAL - BOSS_SPAWN_EARLY) {
          spawnBoss(bossFlow.pending);
        }
        if (bossFlow.warnT >= BOSS_WARN_TOTAL) {
          stopAlarm();
          bossFlow.stage = 'fight';
        }
      }

      // BOSS 战斗期间（全难度）：每 6~12s 强制刷新一波 1类（小队/长队各 50%）——
      // 不受压力系统与场上存怪影响；本波敌人道具掉率 ×0.3（见 04-spawn / 06-enemy）
      // 警报演出（warn）至我方可开火（BOSS combatReady）前不计时——强制波首刷自可开火起 6~12s 后才出现；
      // bossEntranceActive 双保险：暴风之眼被击败后的本体渐隐窗口（storm 仍 combatReady、storm2 未就绪）
      // playerFireLocked 返回 false，若不封锁会在清场后再度刷出 1类，成为风暴编织者登场时的残留
      if (bossFlow.stage === 'fight' && !playerFireLocked() && !bossEntranceActive()) {
        levelFlow.bossMinionT += dt;
        // BOSS 战 1类强制波间隔固定（6~12s）：明确不受任何刷怪调整影响（不随难度 spawnIntervalMul 缩放）
        if (levelFlow.bossMinionT >= levelFlow.bossMinionNext) {
          levelFlow.bossMinionT = 0;
          levelFlow.bossMinionNext = rand(BOSS_MINION_WAVE.min, BOSS_MINION_WAVE.max);
          spawnBossMinionWave();
        }
      }

      // BOSS 击败后的刷新序列：2s 缓冲 → 固定首波（1类长队横扫、无紫色）→ 4s 观察期 → 恢复正常刷怪
      // 期间压力/槽位通道与 bossTimer 全部冻结（2s 与 4s 均不计入关卡推进）
      if (!state.challenge && bossFlow.stage === 'none' &&
          (bossFlow.postDelay > 0 || bossFlow.postWaveT > 0)) {
        if (bossFlow.postDelay > 0) {
          bossFlow.postDelay -= dt;
          if (bossFlow.postDelay <= 0) {
            bossFlow.postDelay = 0;
            spawnPostBossWave();
            bossFlow.postWaveT = 4;   // 自首波刷新（第一个敌人出现）起计时
          }
        } else {
          bossFlow.postWaveT -= dt;
          if (bossFlow.postWaveT <= 0) bossFlow.postWaveT = 0;
        }
      }

      // ---------- 诗篇波次制刷怪（登记见《诗篇难度修正.md》深度改版 #1） ----------
      // 每级一波：上一波全部击毁/离场 → clearDelay 计时 → 刷下一波（波 N = 等级 N）；
      // 不走压力系统 / 波次间隔 / 4类槽位通道（4类随波附带，见 04-spawn spawnWaveBody）；
      // 特殊刷新不受影响：BOSS 战强制波 / BOSS 后固定首波 / Lv13 焦香一次性（下方同步保留）
      if (isPoem() && !state.challenge && bossFlow.stage === 'none' && bossFlow.victoryDelay <= 0 &&
          bossFlow.postDelay <= 0 && bossFlow.postWaveT <= 0) {
        const phaseWaves = WAVE_POEM.wavesPerPhase[bossFlow.phase] ?? WAVE_POEM.wavesPerPhase[WAVE_POEM.wavesPerPhase.length - 1];
        if (state.pilotDashT > 0) {
          // 许凯狗冲刺（诗篇）：固定 1s 一波、不等清场（冲刺即秒）——6s 冲刺刷出并冲死第 1~6 波，
          // 结束时波次计数 = 6、clearNext 保持 0 → 立即衔接第 7 波（Lv7，即冲刺终点等级）
          levelFlow.poemClearT -= dt;
          if (levelFlow.poemClearT <= 0 && levelFlow.poemWaveIdx < phaseWaves) {
            spawnWave();
            levelFlow.poemClearT = 1;
          }
        } else if (levelFlow.poemWaveIdx < phaseWaves) {
          if (enemies.length === 0) {
            levelFlow.poemClearT += dt;
            if (levelFlow.poemClearT >= levelFlow.poemClearNext) {
              spawnWave();
              levelFlow.poemClearT = 0;
              levelFlow.poemClearNext = rand(WAVE_POEM.clearDelay[0], WAVE_POEM.clearDelay[1]);
              levelFlow.level = lvCfg.base + levelFlow.poemWaveIdx - 1;   // 波 N = 等级 N（与帧首计算同式）
              // Lv13 后本局限定：首次刷新必出焦香螺旋桨（与常规通道同规则，随波打上 waveTag）
              if (!levelFlow.jiaoxiang13Done && levelFlow.level >= 13) {
                levelFlow.jiaoxiang13Done = true;
                spawnJiaoxiang();
                enemies[enemies.length - 1].waveTag = levelFlow.waveSeq;
              }
            }
          } else {
            levelFlow.poemClearT = 0;
          }
        }
      }

      // 持续刷怪测试（challenge.kind==='swarm'）与正常战斗共用本通道：swarm 时等级已锁 Lv20（帧首），
      // spawnTimer 驱动一直刷怪；其余 challenge（BOSS 试炼 / 单敌 / 波次测试）仍跳过（各自由 updateChallenge 补刷）
      if ((!state.challenge || state.challenge.kind === 'swarm') && !isPoem() && bossFlow.stage === 'none' && bossFlow.victoryDelay <= 0 &&
          bossFlow.postDelay <= 0 && bossFlow.postWaveT <= 0) {
        // bossVictoryDelay > 0：最终 BOSS 已被击坠、正在等待胜利结算——冻结刷怪，避免结算前刷出新怪
        // ---------- 场面压力刷新系统（替代固定冷却） ----------
        // 压力比 = 场上敌人权重和 / 满场基准（虚象 ×0.75：更早超阈值 → 更早进入慢速刷新，压低同屏数量）；
        // 低于阈值 → 直接/加速刷新，高于阈值 → 较慢（间隔有限，拖得太长仍会刷新）
        const threshold = spawnPressureThreshold();
        const pressure = fieldPressureW() / (PRESSURE_CAPACITY * (diffMods().pressureCapacityMul != null ? diffMods().pressureCapacityMul : 1));
        // 低于阈值：刷新倒计时加速流逝（间隔快速缩短直到刷新）；回到阈值以上恢复正常流速。
        // 许凯狗冲刺期间 rush 强制为 1：冲刺期场上几乎全空、压力恒低于阈值，
        // 若叠加低气压加速（最高 ×4），实际节奏会变成 base/12 ≈ 旧的 ÷5 体感——
        // 冲刺的刷怪间隔就是 base/3，不再叠加任何压力加速
        let rush = 1;
        if (state.pilotDashT > 0) {
          levelFlow.lowPressureT = 0;
        } else if (pressure < threshold) {
          levelFlow.lowPressureT += dt;
          rush = Math.min(SPAWN_RUSH_CAP, 1 + levelFlow.lowPressureT * SPAWN_RUSH);
        } else {
          levelFlow.lowPressureT = 0;
        }

        // 波次通道（1/2 类与特殊编队）：不再等待上一波清场，刷新速率由压力调制
        levelFlow.spawnTimer -= dt * rush;
        if (levelFlow.spawnTimer <= 0) {
          spawnWave();
          // Lv13 后本局限定：首次刷新的怪中必定伴随一台焦香螺旋桨（一次性，随波打上 waveTag）
          if (!levelFlow.jiaoxiang13Done && levelFlow.level >= 13) {
            levelFlow.jiaoxiang13Done = true;
            spawnJiaoxiang();
            enemies[enemies.length - 1].waveTag = levelFlow.waveSeq;
          }
          // 基础波间隔随难度倍率放大：具象 ×1.3（总刷怪量/同屏数量 ≈ -23%）、虚象 ×2.3（≈ -55%）
          const base = Math.max(0.55, 2.1 - (levelFlow.level - 1) * 0.15)
            * (diffMods().spawnIntervalMul != null ? diffMods().spawnIntervalMul : 1);
          if (state.pilotDashT > 0) {
            // 许凯狗冲刺阶段：刷怪间隔 ÷3（等级 1s/级；带 0.8~1.2 抖动）
            levelFlow.spawnTimer = (base / 3) * rand(0.8, 1.2);
          } else {
            // 高于阈值时下一波间隔放大（较慢）；低于阈值保持基础间隔并叠加加速流逝 → 迅速补怪
            levelFlow.spawnTimer = rand(base * 0.7, base * 1.3) * (pressure >= threshold ? SPAWN_SLOW_MUL : 1);
          }
          levelFlow.lowPressureT = 0;
        }

        // 特殊3类不再有单独生成逻辑——随常规波次登场（见 04-spawn spawnWaveBody）；
        // 同屏同种限 1 仅限 寒霜 / 御4 / 铁砧（在生成处判定）

        // 4类通道：Lv5 起 4类（主力舰 / 法术阵列）才会出现；主力舰同屏限 1（与法术阵列互斥），法术阵列不受限——
        //   场上已有法术阵列时仍可继续生成 4 类，但只能生成法术阵列（最多同时 2 台，且仅走慢速强制刷新 + 低概率）
        //   （诗篇波次制不走本通道：4类随波附带，见 04-spawn spawnWaveBody）
        const fashiArrays = enemies.filter(e => e.type === 'fashiArray').length;
        const hasCapital = enemies.some(e => e.type === 'capital');
        if (!isPoem() && levelFlow.level >= 5 && !hasCapital && fashiArrays < 2) {
          levelFlow.capitalIdleT += dt;
          if (fashiArrays === 0) {
            // 无法术阵列：正常节奏（压力低立即 / 超时强制），50% 概率法术阵列、否则主力舰
            if (pressure < threshold || levelFlow.capitalIdleT >= capitalMaxWait()) {
              spawnCapitalSlot();
              levelFlow.capitalIdleT = 0;
            }
          } else if (levelFlow.capitalIdleT >= capitalMaxWait() && Math.random() < FASHI_ARRAY.doubleChance) {
            // 已有 1 台法术阵列：仅慢速强制刷新路径 + doubleChance 低概率再补 1 台（双阵列较少出现）
            spawnFashiArray();
            levelFlow.capitalIdleT = 0;
          }
        } else {
          levelFlow.capitalIdleT = 0;
        }
      }

      updatePlayer(dt);
      updateWingmen(dt);
      // 许凯狗冲刺：怪物移速 ×enemySpdMul（+65%，经 dt 缩放实现——移动/入场速度等比加快，
      // 怪更快冲入击杀窗口；冲刺期怪物几乎都在被秒杀途中，开火计时同步缩放无可感影响）
      updateEnemies(dt * (state.pilotDashT > 0 ? PILOTS.xukaigou.enemySpdMul : 1));
      updateBullets(dt);
      updateMissiles(dt);
      updateBaolingBombs(dt);   // 暴鸰：炸弹下坠 / 加速冲向预警区中心 / 爆炸
      updateFrostZones(dt);     // 虚幻：寒冷区域倒计时 / 间歇雪花特效（减速判定在 04-spawn / 06-enemy 逐帧挂钩）
      updatePopianMissiles(dt); // 破片：三连发导弹飞行 / 命中结算（条件性无视无敌）
      updateWgSlashes(dt);      // 战争幽灵：技能1/2双刃斩击流飞行 / 命中结算（每道命中一次）
      updateXgLooseBombs(dt);   // 辛国栋击毁后残留的地毯轰炸落点：独立倒计时爆炸（不随实体消失）
      updateSpellCubes(dt);     // 法术矩阵：发光正方体飞行 / 限程减速黯淡 / 停留 / 渐隐 / 命中结算
      updateDouzhiFx(dt);       // 斗志昂扬：死亡演出推进 + 增益时长衰减
      updateSlashFx(dt);        // 群星之杀：空间斩击特效存留时长推进 / 到期移除
      updateZoneMarks(dt);   // 暴风之眼：区域标记倒计时 / 风流 / 风柱
      updatePowerups(dt);
      updateCrystals(dt);
      updateFriendStorms(dt);   // 天秀忧郁王子：友方大风暴推进（风弹 / 主体接触伤害 / 生命周期）
      updateAiyiWaves(dt);      // 埃逸：自爆扩散波推进（波前触碰敌人立刻结算）
      updateDagouMissiles(dt);  // 大狗：导弹雨推进（错峰发射 / 上行飞行 / 命中溅射）
      updatePilotStatus(dt);    // 驾驶员逐帧状态：天秀量表充能 / 王累积 / 陵落冷却 / 大狗计时
      updateParticles(dt);
      updateStars(dt);
      updateNebulae(dt);

      // BOSS 击杀后延迟返回主界面
      if (bossFlow.victoryDelay > 0) {
        bossFlow.victoryDelay -= dt;
        if (bossFlow.victoryDelay > 0 && bossFlow.victoryDelay <= 0.8) {
          collectAllCrystals();   // 结算页面前 0.8s：收集场上全部未收集水晶（逐帧触发幂等，覆盖窗口内新掉落）
        }
        if (bossFlow.victoryDelay <= 0) {
          bossFlow.victoryDelay = 0;
          state.mode = 'idle';
          state.victoryOverlay = true;
          achvEvaluateVictory();   // 成就：胜利条件评估（持久战 / 无垠战机 / 「无垠」）
          resultAchieve.classList.remove('hidden');   // 胜利结算页显示「获得成就」区（暂停页在 togglePause 内隐藏）
          renderResultAchievements();   // 成就：本局获得成就徽章渲染（无成就时区块自动隐藏）
          showOverlay(
            state.selfDestructVictory ? '自爆成功' : '胜利',   // 埃逸：自爆击杀 BOSS 的胜利结算改用专属标题（成就占位见 06-enemy killEnemy）
            `击坠 <b style="color:#ffb545">${bossFlow.defeatedName || ''}</b>！` +
            (state.challenge ? '<br />' : '<br /><br />') +   // 挑战模式无得分行：不插空行（避免三行间距过大）
            `<span class="result-stats">` +
            (state.challenge ? '' : `最终得分：<b style="color:#7ce7ff;font-size:18px">${state.score}</b><br />`) +
            (state.challenge || state.testBoss || !hasPilot('xiaoyang') ? '' : `原石收集：<b style="color:#ffc9e2">✦ ${state.gachaStones}/16</b><br />`) +
            `关卡难度：<b style="color:#b28dff">${currentDifficulty.name}</b>` +
            (state.challenge || state.testBoss ? '' : `<br />抵达关卡：<b style="color:#ffb545">${levelFlow.level}</b>`) +
            `</span>`,
            '返回主界面'
          );
          // BOSS 试炼 / 图鉴挑战胜利：额外提供「再次挑战」（重开同一目标）；正常流程胜利不显示
          if (state.testBoss || state.challenge) retrialBtn.classList.remove('hidden');
          else retrialBtn.classList.add('hidden');
          gameoverHomeBtn.classList.add('hidden');   // 失败结算页专属按钮：胜利页强制隐藏
          syncInfoEntryBtn();
        }
      }
    } else if (!state.paused) {
      // 暂停时完全冻结画面（不更新背景与粒子，避免暂停遮罩后仍有闪动）
      state.time += dt;   // 全局时钟：非战斗态同样推进——演示屏的暴走环绕光点 / 光环呼吸 / 尾焰摆动 / 守愿者脉冲环都挂在 state.time 上，不推进会全部静止
      updateDemo(dt);      // 主菜单攻击演示：驱动 state.demo（僚机开火门控）、阶段循环与开火（仅菜单可见时生效）
      updateStars(dt * 0.4);
      updateNebulae(dt * 0.4);
      updateParticles(dt);
      updateWingmen(dt);   // idle 模式也平滑 lerp 僚机位置（state.demo 时僚机同步开火）
      updateBullets(dt);   // 演示弹道推进（场上无敌人：仅位移 / 出界清理 / 补射队列外的共用逻辑）
    }

    // 全屏特效衰减（震屏 / 白闪 / 护盾·暴走冲击波）：只要未暂停就执行——
    // 战斗中正常衰减；胜利结算 / 返回主界面 / 游戏结束等非战斗状态也持续衰减，
    // 否则特效会在离开 playing 后冻结在当前值，白闪残影永久覆盖结算画面（画面仍在重绘）；
    // 暂停时跳过：画布本身不重绘，特效随画面完全冻结
    if (!state.paused) {
      if (state.shakeTime > 0) {
        state.shakeTime -= dt;
        if (state.shakeTime <= 0) { state.shakeTime = 0; state.shakeMag = 0; state.shakeDur = 0; }
      }
      if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 2);
      if (state.hurt > 0) state.hurt = Math.max(0, state.hurt - dt * 1.6);   // 受击红晕衰减
      for (let i = playerHitFx.length - 1; i >= 0; i--) {   // 命中玩家特效推进（闪核 / 冲击环 / 火花）
        playerHitFx[i].t += dt;
        if (playerHitFx[i].t >= playerHitFx[i].max) playerHitFx.splice(i, 1);
      }
      if (shieldBurst.active) {
        shieldBurst.t += dt;
        if (shieldBurst.t >= shieldBurst.duration) shieldBurst.active = false;
      }
      if (crystalBurst.active) {
        crystalBurst.t += dt;
        if (crystalBurst.t >= crystalBurst.duration) crystalBurst.active = false;
      }
      if (bulwarkBurst.active) {
        bulwarkBurst.t += dt;
        if (bulwarkBurst.t >= bulwarkBurst.duration) bulwarkBurst.active = false;
      }
      for (let i = watchClearFx.length - 1; i >= 0; i--) {   // 群星守望消弹光粒推进
        const p = watchClearFx[i];
        p.age += dt;
        if (p.age >= p.life) { watchClearFx.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.95;
        p.vy *= 0.95;
      }
      for (let i = armorGlyphFx.length - 1; i >= 0; i--) {   // 装甲触发图标演出推进
        armorGlyphFx[i].t += dt;
        if (armorGlyphFx[i].t >= armorGlyphFx[i].dur) armorGlyphFx.splice(i, 1);
      }
      for (let i = blastRings.length - 1; i >= 0; i--) {   // 爆炸冲击圈（大狗导弹雨）推进
        blastRings[i].t += dt;
        if (blastRings[i].t >= blastRings[i].dur) blastRings.splice(i, 1);
      }
      if (berserkBurst.active) {
        berserkBurst.t += dt;
        if (berserkBurst.t >= berserkBurst.duration) berserkBurst.active = false;
      }
      if (bombBurst.active) {
        bombBurst.t += dt;
        if (bombBurst.t >= bombBurst.duration) bombBurst.active = false;
      }
    }

    // 暂停时跳过重绘：canvas 保留最后一帧，画面完全静止
    if (!state.paused) {
      render();
      updateHUD();
    }
    updateBGM();
    } catch (err) {
      // 帧内异常只跳过本帧并记录，绝不中断主循环——
      // 此前任何一帧抛错都会跳过末尾的 scheduleLoop()，导致画面永久冻结（音乐走音频线程仍在播放、点击无效）
      console.error('[main-loop] 帧内异常，已跳过该帧：', err);
    } finally {
      scheduleLoop();   // 无论本帧是否抛错，都保证排程下一帧
    }
  }


  pauseHomeBtn.addEventListener('click', () => {
    pauseHomeBtn.classList.add('hidden');
    resetGame(false);
  });

  // 失败结算页「返回主界面」：与暂停菜单返回主界面一致（清除挑战目标，回主界面选机）
  gameoverHomeBtn.addEventListener('click', () => {
    gameoverHomeBtn.classList.add('hidden');
    resetGame(false);
  });

  // 重新挑战：保留当前挑战目标（等同战斗内重开），重新开始同一挑战
  pauseRetryBtn.addEventListener('click', () => {
    pauseRetryBtn.classList.add('hidden');
    resetGame(true, { keepTest: true });
  });

  // 再次挑战（胜利结算页专属）：保留试炼/挑战目标，重开同一 BOSS
  retrialBtn.addEventListener('click', () => {
    retrialBtn.classList.add('hidden');
    state.victoryOverlay = false;
    resetGame(true, { keepTest: true });
  });

  startBtn.addEventListener('click', () => {
    if (state.paused) {
      togglePause();        // 暂停中点击“继续游戏”：恢复游戏
    } else if (state.victoryOverlay) {
      state.victoryOverlay = false;
      resetGame(false);   // 胜利后返回主界面
    } else {
      // 开局 / 再来一局：保留当前试炼/测试目标（与「重新挑战」一致）；主界面时 testBoss/challenge 已为 null，故仍是正常开局
      resetGame(true, { keepTest: true });
    }
  });

  // 主菜单「开始游戏」：idle 态直接开局（菜单独立页面态的入口按钮）
  menuStartBtn.addEventListener('click', () => {
    if (state.mode === 'idle' && !state.paused && !state.victoryOverlay) {
      resetGame(true, { keepTest: true });
    }
  });
  encyClose.addEventListener('click', closeEncyclopedia);
  initEncyDiffButtons();   // 图鉴头部四选一难度按钮组：绑定点击并按 DIFFICULTIES 初始化状态

  // ---------- 自适应缩放 ----------
  // 视口适配：把游戏舞台按视口等比缩放（大屏放大、小屏缩小、顶部对齐），
  // 标题栏为覆盖层不占文档流空间，舞台上边界直接贴近视口顶端。
  // 同步提升画布物理分辨率（缩放比 × DPR）保持任意缩放下清晰。HUD/遮罩/图鉴为 DOM 元素，随 transform 一致缩放。
  const gameWrap = document.querySelector('.game-wrap');
  const gameSizer = document.querySelector('.game-sizer');
  let wrapNaturalH = 0;   // 未缩放时的整体高度（标题栏为覆盖层，即舞台高度 792），首次测量后缓存
  function fitStage() {
    if (!gameWrap || !gameSizer) return;
    if (!wrapNaturalH) wrapNaturalH = gameWrap.offsetHeight || 1;
    const k = clamp(
      Math.min((window.innerHeight - 36) / wrapNaturalH, (window.innerWidth - 28) / CANVAS_W),
      0.42, 2.4);
    gameWrap.style.transform = `scale(${k})`;
    gameSizer.style.width = (CANVAS_W * k) + 'px';
    gameSizer.style.height = (wrapNaturalH * k) + 'px';
    // 画布物理分辨率：显示尺寸 = 480k CSS px × DPR 设备像素 → 与逐像素 1:1，保持清晰
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(CANVAS_W * k * dpr);
    const bh = Math.round(CANVAS_H * k * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      const s = bw / CANVAS_W;   // 设备像素 / 游戏逻辑像素
      ctx.setTransform(s, 0, 0, s, 0, 0);   // 覆盖 02-core 的初始 DPR 变换
    }
  }
  window.addEventListener('resize', fitStage);
  window.addEventListener('orientationchange', fitStage);

  // ---------- 启动 ----------
  initStars();
  initNebulae();
  buildDiffCards();
  buildPlaneCards();
  buildWingmanCards();
  buildArmorCards();
  buildSubWeaponCards();   // 副武器选择卡片（SUB_WEAPONS 注册表驱动，panelSub 面板）
  buildPilotCards();   // 驾驶员选择卡片（PILOTS 注册表驱动，panelPilot 面板）
  initMenuPanels();   // 主菜单装备四框 ↔ 展开面板绑定 + 当前配置摘要
  resetGame(false);
  fitStage();
  scheduleLoop();

  export {
    WEAPON_CHEAT_REQUIRE_ARM, debugSetWeapon, lastTime, loopToken, loopByTimeout, scheduleLoop,
    loop, gameWrap, gameSizer, wrapNaturalH, fitStage,
  };