// 03-audio：BGM 切换 / BOSS 警报音效 / 全局静音开关
'use strict';

  // ---------- BGM ----------
  // 主界面：main_theme；常规战斗：battle_normal_1；BOSS 战（含警报演出）：旧日之歌 battle_boss_1 / 暴风之眼 battle_boss_2
  const BGM_TRACKS = {
    main_theme:      './assets/audio/main_theme.mp4',
    battle_normal_1: './assets/audio/battle_normal_1.mp4',
    battle_normal_2: './assets/audio/battle_normal_2.mp4',
    battle_boss_1:   './assets/audio/battle_boss_1.mp4',
    battle_boss_2:   './assets/audio/battle_boss_2.mp4',
  };
  const BGM_VOLUME = 0.4;
  const bgmAudios = Object.create(null);
  let bgmCurrent = null;      // 当前应播放的曲目 key
  let bgmUnlocked = false;    // 浏览器自动播放限制：首次交互后解锁
  let audioMuted = false;     // 全局静音：音乐(BGM) + 音效(警报) 总开关，由标题栏右侧按钮切换

  function initBGM() {
    for (const key in BGM_TRACKS) {
      const a = new Audio(BGM_TRACKS[key]);
      a.loop = true;
      a.volume = BGM_VOLUME;
      a.preload = 'auto';
      bgmAudios[key] = a;
    }
  }

  // 警报演出期间不播放任何 BGM（静默 + 警报音效营造紧张感）

  // 每帧根据状态决定应播放的曲目，并处理暂停/恢复
  function updateBGM() {
    let target;
    if (state.mode === 'playing') {
      if (state.bossStage === 'warn') {
        target = null;   // 警报演出期间：无BGM，纯警报音效
      } else if (state.bossStage === 'fight') {
        target = (state.pendingBoss === 'storm') ? 'battle_boss_2' : 'battle_boss_1';   // 暴风之眼专属 BGM
      } else {
        target = 'battle_normal_1';
      }
    } else {
      // idle / gameover → 主界面曲
      target = 'main_theme';
    }
    if (bgmCurrent !== target) {
      if (bgmCurrent) {
        const prev = bgmAudios[bgmCurrent];
        prev.pause();
        prev.currentTime = 0;
      }
      bgmCurrent = target;
    }
    if (!bgmCurrent) {
      // 静默期（警报演出）不播放任何曲目，但警报音效需跟随暂停 / 静音
      if (state.paused || audioMuted) {
        if (!alarmAudio.paused) alarmAudio.pause();
      } else if (alarmAudio.src && state.bossStage === 'warn' && alarmAudio.paused && alarmAudio.currentTime > 0) {
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
