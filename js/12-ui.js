// 12-ui：HUD 更新 / 流程控制（resetGame / 暂停 / 结算）/ 选机与僚机卡片

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：06-enemy(1 名) 07-player(1 名) 13-encyclopedia(1 名) 14-main(7 名)
  // 本文件写共享状态（state/bossFlow/levelFlow 属性赋值；新增属性先在 02-core 归域声明）：
  //   state.{bombs, challenge, crystalMagnetMul, flash, hasteT, hurt, lives, mode, orangeBombUsed, paused, score, shakeMag, shakeTime, testBoss, time, victoryOverlay}  levelFlow.{capitalIdleT, douzhiSkipOnce, jiaoxiang13Done, level, lowPressureT, prevLevel, spawnTimer}  bossFlow.{defeatedName, pending, phase, postDelay, postWaveT, stage, timer, victoryDelay, warnT}
  //
  import { BERSERK, CANVAS_H, CANVAS_W, DOUZHI, PLANES, PLAYER_CFG, SHIELD_DURATION, WINGMEN_CFG, currentPlane, currentWingman, setPlane, setWingman } from './01-config.js';
  import { DPR, berserkBar, berserkFill, blBombs, bombIcons, bossFlow, bossTestRow, crystals, cubeHitFx, douzhiBar, douzhiFill, douzhiFx, eBullets, enemies, gameoverHomeBtn, hpFill, infoEntryBtn, levelFlow, livesText, missileWarns, missiles, overlay, overlayDesc, overlayTitle, pBullets, particles, pauseHomeBtn, pauseRetryBtn, pillarStrikes, phaseFx, planeGrid, planeSelect, player, playerHitFx, popianMissiles, powerups, retrialBtn, scoreText, shieldBar, shieldFill, slashFx, spellCubes, startBtn, state, trailGhosts, windFlows, wingmanGrid, wingmanSelect, zoneMarks } from './02-core.js';
  import { stopAlarm } from './03-audio.js';
  import { delayedShots, initWingmen } from './07-player.js';
  import { bombBurst, shieldBurst } from './08-entities.js';
  import { paintShip, paintWingman, paintWingmanBulwark } from './09-draw-ships.js';
  import { openEncyclopedia } from './13-encyclopedia.js';



  // ---------- HUD ----------
  function updateHUD() {
    const ratio = player.hp / PLAYER_CFG.maxHp;
    hpFill.style.width = (ratio * 100) + '%';
    hpFill.classList.toggle('warn', ratio <= 0.55 && ratio > 0.25);

    hpFill.classList.toggle('danger', ratio <= 0.25);
    // 测试情况（测试该敌人 / 测试BOSS）：隐藏积分计数器（.score-panel）
    scoreText.parentElement.style.display = state.challenge ? 'none' : '';
    scoreText.textContent = state.score;
    // 右上角爆弹图标：图标数量代表爆弹数（上限 3）；测试模式（图鉴挑战敌人 / BOSS 测试）爆弹无限，显示 ∞
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
    const berserkOn = player.weapon === 5 && player.berserk > 0;
    const shieldOn = player.shield > 0;
    // 暴走读条（右下角）：有颜色区域按剩余比例逐渐变短
    berserkBar.classList.toggle('active', berserkOn);
    berserkFill.style.width = berserkOn ? (player.berserk / BERSERK.duration * 100) + '%' : '0%';
    // 护盾读条（右下角）
    shieldBar.classList.toggle('active', shieldOn);
    shieldFill.style.width = shieldOn ? (player.shield / SHIELD_DURATION * 100) + '%' : '0%';
    // 斗志昂扬读条（右下角，白色）
    const douzhiOn = state.hasteT > 0;
    douzhiBar.classList.toggle('active', douzhiOn);
    douzhiFill.style.width = douzhiOn ? (state.hasteT / DOUZHI.buffDuration * 100) + '%' : '0%';
  }
  // ---------- 流程控制 ----------
  function resetGame(autoStart = false, opts = {}) {
    state.score = 0;
    levelFlow.level = 1;
    state.bombs = 1;
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
    levelFlow.lowPressureT = 0;
    levelFlow.capitalIdleT = 0;
    levelFlow.jiaoxiang13Done = false;   // Lv13 首波必出焦香螺旋桨：每局重置
    state.orangeBombUsed = false;
    state.crystalMagnetMul = 1;   // 水晶磁吸倍率重开归 1（击败旧日之歌后再 ×1.5）
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
    state.flash = 0;
    state.hurt = 0;
    shieldBurst.active = false;
    bombBurst.active = false;
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
    player.y = CANVAS_H - 90;
    player.hp = PLAYER_CFG.maxHp;
    player.cooldown = 0;
    player.kbT = 0; player.kbVx = 0; player.kbVy = 0;   // 清除击退状态
    player.invuln = 1.0;
    player.invulnBlink = false;   // 开局无敌不闪动：清掉上一局残留的受击闪动标记（登场/重生无敌保持机体完整可见）
    player.alive = true;
    player.weapon = (state.testBoss || state.challenge) ? 4 : (currentPlane.startWeapon || 1);   // BOSS 试炼 / 图鉴挑战：默认火力 Lv4
    player.berserkBanner = 0;
    player.shield = 0;
    player.respawnTimer = 0;
    player.hitCount = 0;
    player.hitFxT = 0;
    player.slashCd = 0; player.slashTarget = null; player.slashQueued = 0; player.slashGapT = 0;   // 群星之杀斩击运行态重置
    initWingmen();

    if (autoStart) {
      state.mode = 'playing';
      overlay.classList.add('hidden');
    } else {
      state.mode = 'idle';
      planeSelect.classList.remove('hidden'); wingmanSelect.classList.remove('hidden');   // 标题页：展示选机卡片
      bossTestRow.style.display = 'none';   // BOSS 试炼已移入怪物图鉴
      showOverlay('准备起飞~', defaultDesc(), '开始游戏');
      // 图鉴入口按钮
      let encyBtn = document.getElementById('encyEntryBtn');
      if (!encyBtn) {
        const btn = document.createElement('button');
        btn.id = 'encyEntryBtn';
        btn.className = 'ency-entry-btn';
        btn.textContent = '怪物图鉴';
        btn.addEventListener('click', openEncyclopedia);
        startBtn.parentNode.insertBefore(btn, startBtn.nextSibling);
      } else {
        encyBtn.style.display = '';
      }
    }
    syncInfoEntryBtn();
  }

  // 数值与机制图鉴入口按钮（ⓘ）：仅开始界面显示（遮罩可见 + 选机页可见 + 非暂停 + 非胜利结算）
  function syncInfoEntryBtn() {
    const show = !overlay.classList.contains('hidden') &&
                 !planeSelect.classList.contains('hidden') &&
                 state.mode === 'idle' && !state.paused && !state.victoryOverlay;
    infoEntryBtn.classList.toggle('hidden', !show);
  }

  function defaultDesc() {
    return `<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动 · <kbd>Space</kbd> 爆弹 · <kbd>P</kbd> 暂停 · <kbd>R</kbd> 重新开始`;
  }

  function showOverlay(title, html, btnText) {
    overlayTitle.textContent = title;
    overlayDesc.innerHTML = html;
    startBtn.textContent = btnText;
    overlay.classList.remove('hidden');
  }

  // ---------- 选机页面 ----------
    // ---------- 选僚机页面 ----------
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
        c.translate(31, 34);   // 补偿本体偏移(side*3,-3)在镜像后的左上偏移
        c.scale(-1, 1);   // 左右反转预览图
        // 暴走星焰尾（静态帧）：白紫亮焰，较常规更长更亮（与游戏内 wkBerserk 焰一致）
        const isBulwark = wm.weapon && wm.weapon.kind === 'fan';
        if (isBulwark) {
          c.scale(0.82, 0.82);   // 缩小以容纳前方装甲板
          c.translate(-10, 0);   // 居中修正：盾弧向外侧扫 110°（镜像后甩向左边），整体 bbox 左偏约 8px，回拉到画布中心
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
          paintWingmanBulwark(c, 1, true, 0.35);   // 重甲堡垒机体（暴走过热状态，静态帧）
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
          paintWingman(c, 1, true);   // 与游戏内僚机同一造型（暴走：含机翼延伸三角）
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
      const cardScale = p.id === 'starslayer' ? 0.6 : 0.9;    // 群星之杀暴走巨帆更大：缩小以完整入图
      c.scale(cardScale, cardScale);
      paintShip(c, 1, p, 1, true);   // 概览图使用暴走形态（berserkT=1，still=静态不画动态光效）；传入当前卡片机型 p
      // 暴走翼尖微光（静态帧）——仅 chaos；群星之杀的侧角光已在 paintStarslayer 内绘制
      if (p.id === 'chaos') {
        c.save();
        c.globalAlpha = 0.5; c.shadowColor = '#ff69b4'; c.shadowBlur = 14;
        c.fillStyle = '#ff69b4';
        for (const sx of [-1, 1]) {
          c.beginPath(); c.arc(sx * 22 * 1.2, 10, 2.5, 0, Math.PI * 2); c.fill();
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
      });
      planeGrid.appendChild(card);
    }
  }

  function togglePause() {
    state.paused = !state.paused;
    if (state.paused) {
      planeSelect.classList.add('hidden'); wingmanSelect.classList.add('hidden');
      bossTestRow.style.display = 'none';
      const encyBtn = document.getElementById('encyEntryBtn');
      if (encyBtn) encyBtn.style.display = 'none';
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
    planeSelect.classList.add('hidden'); wingmanSelect.classList.add('hidden');   // 结算页：隐藏选机，直接重开
    const encyBtn = document.getElementById('encyEntryBtn');
    if (encyBtn) encyBtn.style.display = 'none';
    showOverlay(
      '战机陨落',
      `最终得分：<b style="color:#7ce7ff;font-size:18px">${state.score}</b><br />
       抵达关卡：<b style="color:#ffb545">${levelFlow.level}</b><br />
       剩余生命：<b style="color:#ff4d6d">${Math.max(0, state.lives)}</b><br /><br />
       按 <kbd>R</kbd> 或点击下方按钮再次出击`,
      '再来一局'
    );
    gameoverHomeBtn.classList.remove('hidden');   // 失败结算页：返回主界面按钮
    syncInfoEntryBtn();
  }

  export {
    updateHUD, resetGame, syncInfoEntryBtn, defaultDesc, showOverlay, buildWingmanCards,
    buildPlaneCards, togglePause, endGame,
  };