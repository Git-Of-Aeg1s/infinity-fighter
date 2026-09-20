// 03-audio：BGM 切换 / BOSS 警报音效 / 全局静音开关

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：04-spawn(2 名) 12-ui(1 名) 14-main(3 名)
  //
  import { bossFlow, musicToggle, state } from './02-core.js';


  // ---------- BGM ----------
  // 主界面：main_theme / main_theme_2 随机轮播（一首自然播完 → 随机切另一首，不与刚播完的重复）
  // 常规战斗：battle_normal_1；BOSS 战（含警报演出）：旧日之歌 battle_boss_1 / 暴风之眼 battle_boss_2
  // 结算曲：胜利 victory / 失败 defeat（单次播放；结算页弹出时才起播；未播完就返回主界面 / 再来一局 → 音量迅速淡出）
  const BGM_TRACKS = {
    main_theme:      './assets/audio/main_theme.mp4',
    main_theme_2:    './assets/audio/main_theme_2.mp3',
    battle_normal_1: './assets/audio/battle_normal_1.mp4',
    battle_normal_2: './assets/audio/battle_normal_2.mp4',
    battle_boss_1:   './assets/audio/battle_boss_1.mp4',
    battle_boss_2:   './assets/audio/battle_boss_2.mp4',
    victory:         './assets/audio/victory.mp3',
    defeat:          './assets/audio/defeat.mp3',
  };
  const BGM_VOLUME = 0.6;   // 音乐基准音量
  // 每曲目音量倍率：平衡各曲目的母带响度差异（战斗曲与 main_theme 维持 1.0；觉得某曲偏响/偏轻直接调这里）
  const BGM_GAIN = {
    main_theme: 1,
    main_theme_2: 0.8,   // 比 main_theme 母带偏响，收小对齐
    victory: 0.85,   // 短结算曲通常母带偏响，稍收
    defeat: 0.85,
  };
  const MENU_TRACKS = ['main_theme', 'main_theme_2'];   // 主界面轮播池
  const RESULT_TRACKS = ['victory', 'defeat'];          // 结算曲（单次播放、可快速淡出）
  const RESULT_FADE = 0.35;   // 结算曲提前退出的淡出时长（s）
  const bgmAudios = Object.create(null);
  let bgmCurrent = null;      // 当前应播放的曲目 key
  let bgmUnlocked = false;    // 浏览器自动播放限制：首次交互后解锁
  let audioMuted = false;     // 全局静音：音乐(BGM) + 音效(警报) 总开关，由标题栏右侧按钮切换
  let resultDone = false;     // 结算曲是否已自然播完（播完后结算页转主界面轮播）
  let resultFade = null;      // 结算曲淡出中：{ key, audio, t0, from }
  let prevResultShown = false;   // 上一帧是否处于结算展示（胜利页 / 失败页）：上升沿重置 resultDone，避免上一局遗留导致本局结算曲不播

  function trackVol(key) { return BGM_VOLUME * (BGM_GAIN[key] || 1); }

  function initBGM() {
    for (const key in BGM_TRACKS) {
      const a = new Audio(BGM_TRACKS[key]);
      a.loop = !MENU_TRACKS.includes(key) && !RESULT_TRACKS.includes(key);   // 主界面曲/结算曲不循环（轮播与单次）
      a.volume = trackVol(key);
      a.preload = 'auto';
      bgmAudios[key] = a;
    }
    // 主界面曲自然播完 → 随机切另一首（smoke 桩无 addEventListener，需守卫）
    for (const key of MENU_TRACKS) {
      const a = bgmAudios[key];
      if (a.addEventListener) a.addEventListener('ended', () => {
        if (bgmCurrent !== key || state.mode === 'playing') return;
        switchTrack(pickMenuTrack(key));
      });
    }
    // 结算曲自然播完 → 标记完成，下一帧交还主界面轮播
    for (const key of RESULT_TRACKS) {
      const a = bgmAudios[key];
      if (a.addEventListener) a.addEventListener('ended', () => {
        if (bgmCurrent === key) { resultDone = true; bgmCurrent = null; }
      });
    }
  }

  // 主界面轮播：从未播完的候选中随机取一首（except = 刚播完的 key，可为 null）
  function pickMenuTrack(except) {
    const pool = MENU_TRACKS.filter(k => k !== except);
    return pool[(Math.random() * pool.length) | 0];
  }

  // 结算曲快速淡出（提前返回主界面 / 再来一局时触发）：淡完暂停归零并恢复音量供下次播放
  function startResultFade() {
    const a = bgmAudios[bgmCurrent];
    if (!a || a.paused) return;
    resultFade = { key: bgmCurrent, audio: a, t0: performance.now(), from: a.volume };
  }

  function stepResultFade() {
    if (!resultFade) return;
    if (resultFade.audio.paused) { resultFade.audio.volume = trackVol(resultFade.key); resultFade = null; return; }
    const k = (performance.now() - resultFade.t0) / (RESULT_FADE * 1000);
    if (k >= 1) {
      resultFade.audio.pause();
      resultFade.audio.currentTime = 0;
      resultFade.audio.volume = trackVol(resultFade.key);
      resultFade = null;
    } else {
      resultFade.audio.volume = resultFade.from * (1 - k);
    }
  }

  // 主界面轮播目标：已是轮播曲则维持（避免每帧重置），否则随机取一首（except = 刚播完的 key，可为 null）
  function menuTarget(except) {
    return (bgmCurrent && MENU_TRACKS.includes(bgmCurrent)) ? bgmCurrent : pickMenuTrack(except);
  }

  // 切换当前曲目（立即起播，遵循解锁 / 暂停 / 静音）；被切走的结算曲若未播完走快速淡出
  function switchTrack(key) {
    if (bgmCurrent) {
      const prev = bgmAudios[bgmCurrent];
      if (RESULT_TRACKS.includes(bgmCurrent) && !prev.paused) startResultFade();
      else { prev.pause(); prev.currentTime = 0; }
    }
    bgmCurrent = key;
    if (RESULT_TRACKS.includes(key)) resultDone = false;
    const a = bgmAudios[key];
    if (a && bgmUnlocked && !state.paused && !audioMuted) a.play().catch(() => {});
  }

  // 警报演出期间不播放任何 BGM（静默 + 警报音效营造紧张感）

  // 每帧根据状态决定应播放的曲目，并处理暂停/恢复
  function updateBGM() {
    stepResultFade();
    // 结算展示上升沿：新一局结算开始 → 允许结算曲重新起播（清掉上一局自然播完遗留的 resultDone，
    // 否则上一局结算曲播完后 resultDone 恒为 true，下一局胜利页会直接跳主界面轮播、胜利曲不响）
    const resultShown = state.victoryOverlay || state.mode === 'gameover';
    if (resultShown && !prevResultShown) resultDone = false;
    prevResultShown = resultShown;
    let target;
    if (state.mode === 'playing') {
      if (bossFlow.victoryDelay > 0) {
        // 击坠演出期（结算页尚未弹出）：不提前播胜利曲，维持当前战斗曲直到结算页弹出
        target = (bgmCurrent && !RESULT_TRACKS.includes(bgmCurrent)) ? bgmCurrent : null;
      } else if (bossFlow.stage === 'warn') {
        target = null;   // 警报演出期间：无BGM，纯警报音效
      } else if (bossFlow.stage === 'fight') {
        target = (bossFlow.pending === 'storm') ? 'battle_boss_2' : 'battle_boss_1';   // 暴风之眼专属 BGM
      } else {
        target = 'battle_normal_1';
      }
    } else if (state.victoryOverlay && !resultDone) {
      target = 'victory';   // 胜利结算：先播胜利曲（播完转主界面轮播）
    } else if (state.mode === 'gameover' && !resultDone) {
      target = 'defeat';    // 失败结算：先播失败曲（播完转主界面轮播）
    } else {
      // 主界面 / 结算曲播完后的结算页：主界面随机轮播
      target = menuTarget(bgmCurrent);
    }
    if (bgmCurrent !== target) switchTrack(target);
    if (!bgmCurrent) {
      // 静默期（警报演出）不播放任何曲目，但警报音效需跟随暂停 / 静音
      if (state.paused || audioMuted) {
        if (!alarmAudio.paused) alarmAudio.pause();
      } else if (alarmAudio.src && bossFlow.stage === 'warn' && alarmAudio.paused && alarmAudio.currentTime > 0) {
        alarmAudio.play().catch(() => {});
      }
      return;
    }
    const a = bgmAudios[bgmCurrent];
    if (!a || !bgmUnlocked) return;
    if (state.paused || audioMuted) {
      if (!a.paused) a.pause();
    } else if (a.paused) {
      a.play().catch(() => {});
    }
  }

  // ---------- BOSS 警报音效 ----------
  const alarmAudio = new Audio('./assets/audio/boss_alarm.mp3');
  alarmAudio.loop = false;
  alarmAudio.volume = 0.55;
  alarmAudio.preload = 'auto';

  function startAlarm() {
    if (audioMuted) return;   // 静音时不播放警报音效
    alarmAudio.currentTime = 0;
    alarmAudio.play().catch(() => {});
  }

  function stopAlarm() {
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
  }

  function unlockBGM() {
    if (bgmUnlocked) return;
    bgmUnlocked = true;
    const a = bgmCurrent ? bgmAudios[bgmCurrent] : null;
    if (a && !state.paused && !audioMuted) a.play().catch(() => {});
  }
  window.addEventListener('keydown', unlockBGM, { once: true });
  window.addEventListener('pointerdown', unlockBGM, { once: true });
  window.addEventListener('touchstart', unlockBGM, { once: true });

  // ---------- 全局音乐 / 音效开关（标题栏右侧按钮） ----------
  // 点击切换静音：静音时暂停所有 BGM 与警报音效，再次点击恢复
  function setMuted(muted) {
    audioMuted = muted;
    if (musicToggle) {
      // 图标为内联 SVG，由 CSS 依据 .muted 类切换开/关两个图标；勿用 textContent（会清空 SVG 子节点）
      musicToggle.classList.toggle('muted', muted);
    }
    if (muted) {
      for (const key in bgmAudios) { const a = bgmAudios[key]; if (!a.paused) a.pause(); }
      if (!alarmAudio.paused) alarmAudio.pause();
    } else {
      updateBGM();   // 恢复：立即按当前状态续播应播曲目
    }
  }
  if (musicToggle) {
    musicToggle.addEventListener('click', () => setMuted(!audioMuted));
  }

  initBGM();

  export {
    BGM_TRACKS, BGM_VOLUME, bgmAudios, bgmCurrent, bgmUnlocked, audioMuted,
    initBGM, updateBGM, alarmAudio, startAlarm, stopAlarm, unlockBGM,
    setMuted,
  };