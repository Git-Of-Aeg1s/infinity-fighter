// 03-audio：BGM 切换 / BOSS 警报音效 / 全局静音开关

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：04-spawn(2 名) 06-enemy(1 名) 12-ui(2 名) 14-main(3 名)
  //
  // ⚠ 音频解锁纪律（2026-10-09 用户定稿：未解锁时 BGM 与警报一律不响）：浏览器禁止无用户手势
  // 自动播放，本模块所有有声媒体统一受 `bgmUnlocked` 解锁闩把守（首次 keydown/pointerdown/
  // touchstart 解锁；手柄 / AI 操控不产生这三类事件故不解锁）。**后续新增任何音效必须接入同一
  // 闩（起播 / 续播前检查 bgmUnlocked），禁止裸调 play()**——否则会出现"AI/手柄操控时新音效独响、
  // BGM/警报不响"的门槛不一致（历史 bug：警报未接闩，不点击页面时警报独响）。
  //
  import { bossFlow, musicToggle, state } from './02-core.js';


  // ---------- BGM ----------
  // 主界面：main_theme / main_theme_2 随机轮播（一首自然播完 → 随机切另一首，不与刚播完的重复）
  // 常规战斗：battle_normal_1；BOSS 战（含警报演出）：旧日之歌 battle_boss_1 / 暴风之眼 battle_boss_2（警报切入静默时战斗曲 0.5s 淡出）
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
    main_theme_2: 0.64,   // 比 main_theme 母带偏响，两次收小（0.8 → 再降 20%）对齐
    victory: 0.85,   // 短结算曲通常母带偏响，稍收
    defeat: 0.85,
  };
  const MENU_TRACKS = ['main_theme', 'main_theme_2'];   // 主界面轮播池
  const RESULT_TRACKS = ['victory', 'defeat'];          // 结算曲（单次播放、可快速淡出）
  const RESULT_FADE = 0.35;   // 结算曲提前退出的淡出时长（s）
  const ALARM_FADE = 0.5;     // 战斗曲切入警报静默的淡出时长（s）
  const bgmAudios = Object.create(null);
  let bgmCurrent = null;      // 当前应播放的曲目 key
  let bgmUnlocked = false;    // 浏览器自动播放限制：首次交互后解锁
  let audioMuted = false;     // 全局静音：音乐(BGM) + 音效(警报) 总开关，由标题栏右侧按钮切换
  let resultDone = false;     // 结算曲是否已自然播完（播完后结算页转主界面轮播）
  // 结算曲"单次展示单次起播"会话闩：记录本次结算展示（胜利页 / 失败页）内已起播过的结算曲 key。
  // 阻断两类重播竞态：①目标曲被切走又切回（如瞬时 target=null 后恢复）时 switchTrack 会从头重启；
  // ②曲目自然播完的瞬间，'ended' 事件任务若晚于下一帧 rAF 才执行，续播分支会对已停在结尾的元素
  //   调 play()——对已结束的媒体元素 play() 按规范回到起点，即"胜利曲连续播两遍"。
  // 新的结算展示上升沿 / 展示结束（下降沿）时清空，同一次展示内换成另一首结算曲仍允许（失败曲先响→胜利页弹出）。
  let resultSession = null;
  let bgmFade = null;         // 曲目淡出中：{ key, audio, t0, from, dur }（结算曲快速淡出 / 战斗曲转警报淡出共用）
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

  // 曲目淡出（结算曲提前退出 / 战斗曲切入警报静默）：淡完暂停归零并恢复音量供下次播放
  function startBGMFade(dur = RESULT_FADE) {
    const a = bgmAudios[bgmCurrent];
    if (!a || a.paused) return;
    bgmFade = { key: bgmCurrent, audio: a, t0: performance.now(), from: a.volume, dur };
  }

  function stepBGMFade() {
    if (!bgmFade) return;
    const a = bgmFade.audio;
    // 已暂停（静音 / 暂停）或被重新起播为当前曲：放弃淡出并恢复音量，交回常规逻辑接管
    if (a.paused || bgmCurrent === bgmFade.key) { a.volume = trackVol(bgmFade.key); bgmFade = null; return; }
    const k = (performance.now() - bgmFade.t0) / (bgmFade.dur * 1000);
    if (k >= 1) {
      a.pause();
      a.currentTime = 0;
      a.volume = trackVol(bgmFade.key);
      bgmFade = null;
    } else {
      a.volume = bgmFade.from * (1 - k);
    }
  }

  // 主界面轮播目标：已是轮播曲则维持（避免每帧重置），否则随机取一首（except = 刚播完的 key，可为 null）
  function menuTarget(except) {
    return (bgmCurrent && MENU_TRACKS.includes(bgmCurrent)) ? bgmCurrent : pickMenuTrack(except);
  }

  // 切换当前曲目（立即起播，遵循解锁 / 暂停 / 静音）；被切走的结算曲快速淡出，战斗曲切向静默（警报演出）0.5s 淡出
  function switchTrack(key) {
    if (key === bgmCurrent) return;   // 同曲幂等：重复切换会对已起播曲目重置从头播放（结算曲双播的诱因之一）
    if (bgmCurrent) {
      const prev = bgmAudios[bgmCurrent];
      if (!prev.paused && RESULT_TRACKS.includes(bgmCurrent)) startBGMFade(RESULT_FADE);   // 结算曲：快速淡出
      else if (!prev.paused && key === null) startBGMFade(ALARM_FADE);   // 战斗曲 → 静默（警报演出）：0.5s 淡出；其余（主界面曲 / 曲目间硬切）维持立即停止
      else { prev.pause(); prev.currentTime = 0; }
    }
    bgmCurrent = key;
    if (RESULT_TRACKS.includes(key)) { resultDone = false; resultSession = key; }
    const a = bgmAudios[key];
    if (a && bgmUnlocked && !state.paused && !audioMuted) a.play().catch(() => {});
  }

  // 警报演出期间不播放任何 BGM（静默 + 警报音效营造紧张感）

  // ---------- BOSS 击败重起播（暴风之眼专属） ----------
  // 暴风之眼被击败：当前战斗曲在 fadeT 内淡出 → 静默至 gapT → 从头重播同一首
  // （二阶段衔接演出：音乐随风暴消散退场，雷暴轰鸣中重新起势）
  let bgmRestart = null;   // { key, audio, t0, from, fadeT, gapT }
  function restartBGM(fadeT = 0.7, gapT = 0.8) {
    if (!bgmCurrent || RESULT_TRACKS.includes(bgmCurrent)) return;
    const a = bgmAudios[bgmCurrent];
    if (!a || a.paused) return;
    bgmRestart = { key: bgmCurrent, audio: a, t0: performance.now(), from: a.volume, fadeT, gapT };
  }

  function stepBGMRestart() {
    if (!bgmRestart) return;
    const r = bgmRestart, a = r.audio;
    const t = (performance.now() - r.t0) / 1000;
    // 曲目已被切换 / 暂停 / 静音：放弃重起流程并恢复音量（交回常规逻辑接管）
    if (bgmCurrent !== r.key || state.paused || audioMuted) {
      a.volume = trackVol(r.key);
      bgmRestart = null;
      return;
    }
    if (t < r.fadeT) {
      if (!a.paused) a.volume = r.from * (1 - t / r.fadeT);   // 淡出
    } else if (t < r.gapT) {
      if (!a.paused) { a.pause(); a.currentTime = 0; }   // 静默窗口（曲目已归零）
    } else {
      a.currentTime = 0;   // 从头重播同一首
      a.volume = trackVol(r.key);
      a.play().catch(() => {});
      bgmRestart = null;
    }
  }

  // ---------- BGM 起播抑制 ----------
  // 场景：挑战 / 试炼重开风暴编织者（无警报直接召唤）——重开瞬间结算曲会立刻切到战斗曲，
  //   破坏登场雷暴的氛围。holdBGM 在 delay 内强制静默（当前曲快速淡出），到期后 updateBGM 自然起播
  let bgmHoldUntil = 0;
  function holdBGM(delay = 0.8) {
    bgmHoldUntil = performance.now() + delay * 1000;
    if (!bgmCurrent) return;
    const a = bgmAudios[bgmCurrent];
    if (RESULT_TRACKS.includes(bgmCurrent)) {
      if (a && !a.paused) startBGMFade();   // 结算曲：快速淡出
    } else if (a && !a.paused) {
      a.pause(); a.currentTime = 0;            // 战斗曲：直接归零暂停
    }
  }

  // 每帧根据状态决定应播放的曲目，并处理暂停/恢复
  function updateBGM() {
    stepBGMFade();
    stepBGMRestart();
    // 结算展示上升沿：新一局结算开始 → 允许结算曲重新起播（清掉上一局自然播完遗留的 resultDone，
    // 否则上一局结算曲播完后 resultDone 恒为 true，下一局胜利页会直接跳主界面轮播、胜利曲不响）
    const resultShown = state.victoryOverlay || state.mode === 'gameover';
    if (resultShown && !prevResultShown) { resultDone = false; resultSession = null; }
    prevResultShown = resultShown;
    if (!resultShown) resultSession = null;   // 结算展示结束：会话闩复位（下一局 / 重开后再胜可正常起播）
    let target;
    if (state.victoryOverlay && !resultDone && resultSession !== 'victory') {
      // 胜利窗口可见：任意情况（正常通关 / BOSS 试炼 / 图鉴挑战）下窗口弹出即播胜利曲，
      // 判定优先级最高（不受 mode / bossFlow 阶段影响）；播完转主界面轮播
      target = 'victory';
    } else if (state.mode === 'playing') {
      if (bossFlow.victoryDelay > 0) {
        // 击坠演出期（结算页尚未弹出）：不提前播胜利曲，维持当前战斗曲直到结算页弹出
        target = (bgmCurrent && !RESULT_TRACKS.includes(bgmCurrent)) ? bgmCurrent : null;
      } else if (bossFlow.stage === 'warn') {
        target = null;   // 警报演出期间：无BGM，纯警报音效
      } else if (bossFlow.stage === 'fight') {
        target = (bossFlow.pending === 'song') ? 'battle_boss_1' : 'battle_boss_2';   // boss1 仅第一轮 BOSS 旧日之歌（2026-10-03 用户定稿口径）；其余 BOSS（暴风之眼 / 风暴编织者二阶段 / 黑暗之手 / 图鉴测试页任意 BOSS）均播 boss2——修复：此前仅 storm/darkhand 列入 boss2，storm2（测试页 + 正常流程二阶段）误播 boss1
      } else {
        // 常态非 BOSS 曲目（2026-10-08 用户定稿）：击败第二轮 BOSS（黑暗之手）后换 2 号曲（bossFlow.phase >= 2 =
        // 第三轮起）；后续加入特殊 BGM 时在此分支扩展
        target = bossFlow.phase >= 2 ? 'battle_normal_2' : 'battle_normal_1';
      }
    } else if (state.mode === 'gameover' && !resultDone && resultSession !== 'defeat') {
      target = 'defeat';    // 失败结算：先播失败曲（播完转主界面轮播）
    } else if (!resultDone && resultSession && bgmCurrent === resultSession) {
      // 结算曲仍在播放：维持当前曲——否则落到下方主界面轮播，bgmCurrent 非主界面曲会随机选曲，
      // 当帧把刚起播的结算曲切走（胜利曲响一声即断的根因）；播完（resultDone）后自然交还轮播
      target = resultSession;
    } else {
      // 主界面 / 结算曲播完后的结算页：主界面随机轮播
      target = menuTarget(bgmCurrent);
    }
    if (performance.now() < bgmHoldUntil) target = null;   // 起播抑制窗口内强制静默
    if (bgmCurrent !== target) switchTrack(target);
    if (!bgmCurrent) {
      // 静默期（警报演出）不播放任何曲目，但警报音效需跟随暂停 / 静音
      if (state.paused || audioMuted) {
        if (!alarmAudio.paused) alarmAudio.pause();
      } else if (bgmUnlocked && alarmAudio.src && bossFlow.stage === 'warn' && alarmAudio.paused && alarmAudio.currentTime > 0) {
        alarmAudio.play().catch(() => {});
      }
      return;
    }
    const a = bgmAudios[bgmCurrent];
    if (!a || !bgmUnlocked) return;
    if (state.paused || audioMuted) {
      if (!a.paused) a.pause();
    } else if (a.paused && !a.ended && !bgmRestart) {
      a.play().catch(() => {});   // 重起播静默期内不自动续播（stepBGMRestart 到点重起）；
                                  // 已自然播完（ended）的结算曲绝不自动续播——play() 会回到起点重播（双播根因）
    }
  }

  // ---------- BOSS 警报音效 ----------
  const alarmAudio = new Audio('./assets/audio/boss_alarm.mp3');
  alarmAudio.loop = false;
  alarmAudio.volume = 0.55;
  alarmAudio.preload = 'auto';

  function startAlarm() {
    if (audioMuted || !bgmUnlocked) return;   // 静音 / 未解锁（浏览器自动播放限制）不播放警报——与 BGM 同门槛，见模块头「音频解锁纪律」
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
    // 解锁瞬间若正处警报演出（此前被解锁闩挡住从未起播）则补响——与 BGM「解锁即起播」语义对齐；
    // 曾起播后中途暂停的（currentTime > 0）由 updateBGM 警报续播分支接管
    if (bossFlow.stage === 'warn' && !state.paused && !audioMuted && alarmAudio.paused && alarmAudio.currentTime === 0) startAlarm();
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
    setMuted, restartBGM, holdBGM,
  };