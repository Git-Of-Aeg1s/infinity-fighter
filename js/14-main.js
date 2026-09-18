// 14-main：输入绑定 / 主循环调度 / 事件绑定 / 启动入口（必须最后加载）
'use strict';

  // ---------- 输入 ----------
  const keys = Object.create(null);
  // 武器等级切换作弊开关：true=需先按 0 武装再用 1~5 切换；false=默认可直接切换（当前测试期）
  const WEAPON_CHEAT_REQUIRE_ARM = false;
  // 直接设定武器等级（调试/作弊）：Lv5 视为暴走，需同时给予暴走倒计时，否则下一帧会回落 Lv4
  function debugSetWeapon(n) {
    if (!player.alive) return;
    if (n === 5) {
      player.weapon = 5;
      player.berserk = BERSERK.duration;
      player.berserkBanner = Math.max(player.berserkBanner || 0, 1.5);
      spawnParticles(player.x, player.y, currentPlane.berserkColor || '#ffb545', 20, 240);
    } else {
      player.weapon = n;
      player.berserk = 0;
    }
    player.cooldown = 0;
  }
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      e.preventDefault();
    }
    if (k === 'p' && state.mode === 'playing') togglePause();
    if (k === 'r') resetGame(true, { keepTest: true });
    if (k === ' ' && state.mode === 'playing' && !state.paused) useBomb();
    // 作弊：切换武器等级（测试用）。预留“按 0 武装”门控——WEAPON_CHEAT_REQUIRE_ARM 改为 true 后需先按 0 才能用 1~5 切换。
    if (state.mode === 'playing' && !state.paused) {
      if (k === '0') state.cheatArm = true;
      const lv = '12345'.indexOf(k);
      if (lv >= 0 && (!WEAPON_CHEAT_REQUIRE_ARM || state.cheatArm)) debugSetWeapon(lv + 1);
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  // ---------- 主循环 ----------
  let lastTime = performance.now();

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
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    try {
      if (state.mode === 'playing' && !state.paused) {
      state.time += dt;

      // 关卡推进：由当前阶段的有效刷怪时间决定（bossTimer 仅在 bossStage==='none' 期间累加，
      // 停怪/警报/BOSS 战自然冻结；击败 BOSS 归零重计——得分不再影响出怪强度）
      const lvCfg = SPAWN_PHASE_LEVEL[state.bossPhase] || SPAWN_PHASE_LEVEL[SPAWN_PHASE_LEVEL.length - 1];
      const lvPhaseTime = SPAWN_PHASE_TIMES[state.bossPhase] ?? SPAWN_PHASE_TIMES[SPAWN_PHASE_TIMES.length - 1];
      state.level = lvCfg.base + Math.floor(Math.min(state.bossTimer, lvPhaseTime) / lvCfg.step);

      // 关卡提升时：每次升级有 DOUZHI.spawnChance 概率从屏幕左/右侧生成一架斗志昂扬横穿（挑战模式不生成）；
      // 击败 BOSS 引发的阶段跳变升级除外（douzhiSkipOnce，见 killEnemy）
      if (state.level > state.prevLevel) {
        state.prevLevel = state.level;
        if (state.douzhiSkipOnce) state.douzhiSkipOnce = false;
        else if (!state.challenge && Math.random() < DOUZHI.spawnChance) spawnDouzhi();
      } else if (state.level < state.prevLevel) {
        state.prevLevel = state.level;
      }

      // BOSS 流程状态机：none → wait(等清场) → warn(警报演出) → fight(BOSS战) → none
      // 关卡节奏：刷怪 50s → 旧日之歌 → 击败后 2s + 固定首波 + 4s → 再刷怪 50s → 暴风之眼 → 胜利结算
      // 达到登场条件后不再出怪；场上清空后播放警报，演出结束 BOSS 中速进场并展开
      if (state.challenge) {
        // 图鉴挑战模式：跳过常规出怪与 BOSS 计时，由 updateChallenge 单独驱动
        updateChallenge(dt);
      } else if (state.bossStage === 'none') {
        // BOSS 击败后的 2s 缓冲与首波 4s 观察期不计入关卡推进（冻结 bossTimer，等级不增长）
        if (state.postBossDelay <= 0 && state.postBossWaveT <= 0) state.bossTimer += dt;
        // 当前阶段刷怪时间到 → 等清场后进警报；登场 BOSS 由 bossPhase 决定（旧日之歌 → 暴风之眼）
        const phaseTime = SPAWN_PHASE_TIMES[state.bossPhase] ?? SPAWN_PHASE_TIMES[SPAWN_PHASE_TIMES.length - 1];
        if (state.bossTimer >= phaseTime) state.bossStage = 'wait';
      } else if (state.bossStage === 'wait') {
        if (enemies.length === 0) {
          state.bossStage = 'warn';
          state.warnT = 0;
          // 正常流程：登场本阶段对应的 BOSS（BOSS 试炼 / 图鉴挑战已在 resetGame 指定 pendingBoss，不覆盖）
          if (!state.testBoss && !state.challenge) {
            state.pendingBoss = BOSS_SEQUENCE[state.bossPhase] || BOSS_SEQUENCE[BOSS_SEQUENCE.length - 1];
          }
          collectAllItems();   // 警报开始时立即收集场上所有水晶和道具
          clearEnemyBullets(); clearMissiles();   // 警报触发：立刻清除全场所有弹幕
          startAlarm();
        }
      } else if (state.bossStage === 'warn') {
        state.warnT += dt;
        // 旧日之歌：提前 3s 生成（黑洞在警报背后形成）
        if (!enemies.some(en => en.type === 'boss') && state.warnT >= BOSS_WARN_TOTAL - BOSS_SPAWN_EARLY) {
          spawnBoss(state.pendingBoss);
        }
        if (state.warnT >= BOSS_WARN_TOTAL) {
          stopAlarm();
          state.bossStage = 'fight';
        }
      }

      // BOSS 击败后的刷新序列：2s 缓冲 → 固定首波（1类长队横扫、无紫色）→ 4s 观察期 → 恢复正常刷怪
      // 期间压力/槽位通道与 bossTimer 全部冻结（2s 与 4s 均不计入关卡推进）
      if (!state.challenge && state.bossStage === 'none' &&
          (state.postBossDelay > 0 || state.postBossWaveT > 0)) {
        if (state.postBossDelay > 0) {
          state.postBossDelay -= dt;
          if (state.postBossDelay <= 0) {
            state.postBossDelay = 0;
            spawnPostBossWave();
            state.postBossWaveT = 4;   // 自首波刷新（第一个敌人出现）起计时
          }
        } else {
          state.postBossWaveT -= dt;
          if (state.postBossWaveT <= 0) state.postBossWaveT = 0;
        }
      }

      if (!state.challenge && state.bossStage === 'none' && state.bossVictoryDelay <= 0 &&
          state.postBossDelay <= 0 && state.postBossWaveT <= 0) {
        // bossVictoryDelay > 0：最终 BOSS 已被击坠、正在等待胜利结算——冻结刷怪，避免结算前刷出新怪
        // ---------- 场面压力刷新系统（替代固定冷却） ----------
        // 压力比 = 场上敌人权重和 / 满场基准；低于阈值 → 直接/加速刷新，高于阈值 → 较慢（间隔有限，拖得太长仍会刷新）
        const threshold = spawnPressureThreshold();
        const pressure = fieldPressureW() / PRESSURE_CAPACITY;
        // 低于阈值：刷新倒计时加速流逝（间隔快速缩短直到刷新）；回到阈值以上恢复正常流速
        let rush = 1;
        if (pressure < threshold) {
          state.lowPressureT += dt;
          rush = Math.min(SPAWN_RUSH_CAP, 1 + state.lowPressureT * SPAWN_RUSH);
        } else {
          state.lowPressureT = 0;
        }

        // 波次通道（1/2 类与特殊编队）：不再等待上一波清场，刷新速率由压力调制
        state.spawnTimer -= dt * rush;
        if (state.spawnTimer <= 0) {
          spawnWave();
          // Lv13 后本局限定：首次刷新的怪中必定伴随一台焦香螺旋桨（一次性，随波打上 waveTag）
          if (!state.jiaoxiang13Done && state.level >= 13) {
            state.jiaoxiang13Done = true;
            spawnJiaoxiang();
            enemies[enemies.length - 1].waveTag = state.waveSeq;
          }
          const base = Math.max(0.55, 2.1 - (state.level - 1) * 0.15);
          // 高于阈值时下一波间隔放大（较慢）；低于阈值保持基础间隔并叠加加速流逝 → 迅速补怪
          state.spawnTimer = rand(base * 0.7, base * 1.3) * (pressure >= threshold ? SPAWN_SLOW_MUL : 1);
          state.lowPressureT = 0;
        }

        // 3类槽位通道（同屏限 1；仅“槽位出场”的 3 类占用——波次编队自带的炮艇带 waveTag，不占用）：
        // 压力低于阈值 → 直接刷新；高于阈值 → 等待，槽位空闲超过上限仍会强制刷新
        const hasSpecial3 = enemies.some(e =>
          (e.type === 'gunship' || e.type === 'harbinger' || e.type === 'weilong' || e.type === 'hanshuang' || e.type === 'yu4' || e.type === 'anvil' || e.type === 'baoling') &&
          e.waveTag == null);
        if (state.level >= 2 && !hasSpecial3) {
          state.specialIdleT += dt;
          // 本局首次槽位出场（仅第一轮）必为炮火先兆者（便于识别）；第二轮起删除强制，按权重抽取
          if (!state.harbingerIntro && state.bossPhase === 0) {
            state.harbingerIntro = true;
            spawnHarbinger();
            state.specialIdleT = 0;
          } else if (pressure < threshold || state.specialIdleT >= specialMaxWait()) {
            pickSpecial3Spawn()();
            state.specialIdleT = 0;
          }
        } else {
          state.specialIdleT = 0;   // 槽位被占用：空闲计时归零，待其离场/被击毁后重新累计
        }

        // 4类通道（同屏限 1）：同一压力规则，强制刷新上限更长（节奏更慢）
        if (state.level >= 3 && !enemies.some(e => e.type === 'capital')) {
          state.capitalIdleT += dt;
          if (pressure < threshold || state.capitalIdleT >= capitalMaxWait()) {
            spawnCapital();
            state.capitalIdleT = 0;
          }
        } else {
          state.capitalIdleT = 0;
        }
      }

      updatePlayer(dt);
      updateWingmen(dt);
      updateEnemies(dt);
      updateBullets(dt);
      updateMissiles(dt);
      updateBaolingBombs(dt);   // 暴鸰：炸弹下坠 / 加速冲向预警区中心 / 爆炸
      updatePopianMissiles(dt); // 破片：三连发导弹飞行 / 命中结算（条件性无视无敌）
      updateSpellCubes(dt);     // 法术矩阵：发光正方体飞行 / 限程减速黯淡 / 停留 / 渐隐 / 命中结算
      updateDouzhiFx(dt);       // 斗志昂扬：死亡演出推进 + 增益时长衰减
      updateSlashFx(dt);        // 群星之杀：空间斩击特效存留时长推进 / 到期移除
      updateZoneMarks(dt);   // 暴风之眼：区域标记倒计时 / 风流 / 风柱
      updatePowerups(dt);
      updateCrystals(dt);
      updateParticles(dt);
      updateStars(dt);
      updateNebulae(dt);

      // BOSS 击杀后延迟返回主界面
      if (state.bossVictoryDelay > 0) {
        state.bossVictoryDelay -= dt;
        if (state.bossVictoryDelay <= 0) {
          state.bossVictoryDelay = 0;
          state.mode = 'idle';
          victoryOverlayActive = true;
          planeSelect.classList.add('hidden'); wingmanSelect.classList.add('hidden');
          const encyBtnV = document.getElementById('encyEntryBtn');
          if (encyBtnV) encyBtnV.style.display = 'none';
          showOverlay(
            '胜利',
            `击坠 <b style="color:#ffb545">${state.defeatedBossName}</b>！<br /><br />` +
            (state.challenge ? '' : `最终得分：<b style="color:#7ce7ff;font-size:18px">${state.score}</b><br />`) +
            `抵达关卡：<b style="color:#ffb545">${state.level}</b>`,
            '返回主界面'
          );
          // BOSS 试炼 / 图鉴挑战胜利：额外提供「再次挑战」（重开同一目标）；正常流程胜利不显示
          if (state.testBoss || state.challenge) retrialBtn.classList.remove('hidden');
          else retrialBtn.classList.add('hidden');
          syncInfoEntryBtn();
        }
      }
    } else if (!state.paused) {
      // 暂停时完全冻结画面（不更新背景与粒子，避免暂停遮罩后仍有闪动）
      updateStars(dt * 0.4);
      updateNebulae(dt * 0.4);
      updateParticles(dt);
      updateWingmen(dt);   // idle 模式也平滑 lerp 僚机位置（开火已被 state.mode 门控抑制）
    }

    // 全屏特效衰减（震屏 / 白闪 / 护盾·暴走冲击波）：只要未暂停就执行——
    // 战斗中正常衰减；胜利结算 / 返回主界面 / 游戏结束等非战斗状态也持续衰减，
    // 否则特效会在离开 playing 后冻结在当前值，白闪残影永久覆盖结算画面（画面仍在重绘）；
    // 暂停时跳过：画布本身不重绘，特效随画面完全冻结
    if (!state.paused) {
      if (state.shakeTime > 0) {
        state.shakeTime -= dt;
        if (state.shakeTime <= 0) { state.shakeTime = 0; state.shakeMag = 0; }
      }
      if (flash > 0) flash = Math.max(0, flash - dt * 2);
      if (shieldBurst.active) {
        shieldBurst.t += dt;
        if (shieldBurst.t >= shieldBurst.duration) shieldBurst.active = false;
      }
      if (berserkBurst.active) {
        berserkBurst.t += dt;
        if (berserkBurst.t >= berserkBurst.duration) berserkBurst.active = false;
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

  // 重新挑战：保留当前挑战目标（等同按 R），重新开始同一挑战
  pauseRetryBtn.addEventListener('click', () => {
    pauseRetryBtn.classList.add('hidden');
    resetGame(true, { keepTest: true });
  });

  // 再次挑战（胜利结算页专属）：保留试炼/挑战目标，重开同一 BOSS
  retrialBtn.addEventListener('click', () => {
    retrialBtn.classList.add('hidden');
    victoryOverlayActive = false;
    resetGame(true, { keepTest: true });
  });

  startBtn.addEventListener('click', () => {
    if (state.paused) {
      togglePause();        // 暂停中点击“继续游戏”：恢复游戏
    } else if (victoryOverlayActive) {
      victoryOverlayActive = false;
      resetGame(false);   // 胜利后返回主界面
    } else {
      // 开局 / 再来一局：保留当前试炼/测试目标（与按 R 一致）；主界面时 testBoss/challenge 已为 null，故仍是正常开局
      resetGame(true, { keepTest: true });
    }
  });
  encyClose.addEventListener('click', closeEncyclopedia);

  // ---------- 自适应缩放 ----------
  // 视口适配：把「标题栏 + 游戏舞台」作为整体按视口等比缩放（大屏放大、小屏缩小、垂直居中），
  // 并同步提升画布物理分辨率（缩放比 × DPR）保持任意缩放下清晰。HUD/遮罩/图鉴为 DOM 元素，随 transform 一致缩放。
  const gameWrap = document.querySelector('.game-wrap');
  const gameSizer = document.querySelector('.game-sizer');
  let wrapNaturalH = 0;   // 未缩放时的整体高度（标题 + 间距 + 舞台），首次测量后缓存
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
  buildPlaneCards();
  buildWingmanCards();
  resetGame(false);
  fitStage();
  scheduleLoop();
