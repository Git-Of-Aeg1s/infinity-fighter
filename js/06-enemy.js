// 06-enemy：敌机更新（移动 / 开火 / 弹幕）+ 先兆者导弹 + 暴鸰炸弹 + 掉落 + killEnemy

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：04-spawn(1 名) 07-player(2 名) 08-entities(1 名) 14-main(7 名)
  // 本文件写共享状态（state/bossFlow/levelFlow 属性赋值；新增属性先在 02-core 归域声明）：
  //   state.{crystalMagnetMul, hasteT, lives, orangeBombUsed, score, stormVortex}  bossFlow.{defeatedName, phase, postDelay, stage, timer, victoryDelay}  levelFlow.{douzhiSkipOnce}
  //
  import { ANVIL, BAOLING, BOSS, BOSS_BULLET, BOSS_MINION_WAVE, BOSS_SEQUENCE, CANVAS_H, CANVAS_W, DOUZHI, DROP_BOMB_ORANGE, DROP_HP_BOSS, DROP_HP_BOSS2, DROP_HP_GREEN, DROP_HP_RATE, DROP_KIT_BERSERK, DROP_KIT_PURPLE, DROP_KIT_RATE, DROP_KIT_RED, DROP_KIT_YELLOW, DROP_SHIELD_BLUE, DROP_SHIELD_RATE, DROP_SHIELD_STACK, DUSK, ENEMY_CLASS, ENEMY_TYPES, FASHI_A1, FASHI_A2, FASHI_ARRAY, FASHI_MATRIX, HANSHUANG, HARBINGER, JIAOXIANG, PLAYER_CFG, POPIAN, SHIP_BULLET_COLOR, SHIP_BULLET_LEN, SIDE_ENTRY_BOOST, SIDE_ENTRY_DECAY, SIDE_MOON, SIDE_SPEED_MUL, SPLIT_RED, SPAWN_PHASE_LEVEL, STORM, STORM2, STORM_WIND, WEILONG, YU4, bossDmgMul, currentArmor, diffMods, invulnDiffMul } from './01-config.js';
  import { blBombs, bossFlow, clamp, clearNearestEnemyBullet, crystals, cubeHitFx, douzhiFx, eBullets, enemies, enemyFireIv, levelFlow, missileWarns, missiles, pBullets, pillarStrikes, phaseFx, player, popianMissiles, powerups, rand, shake, spawnParticles, spellCubes, state, tryBulwarkCheatDeath, windFlows, zoneMarks } from './02-core.js';
  import { makeEnemy, spawnFashiMatrix, spawnSideGroup, spawnStrikerGroup, yu4AuraMul } from './04-spawn.js';
  import { pushBossBullet, spawnBoss, updateBoss } from './05-boss.js';
  import { accumulateWeaponDropHit, bulwarkActive, clearEnemyBullets, damagePlayer, shieldSweepHit, testDamagePlayer } from './07-player.js';
  import { updateBossLootMarks } from './05-boss.js';
  import { spawnPowerup } from './08-entities.js';
  import { endGame } from './12-ui.js';



  function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.type === 'boss') {
        updateBoss(e, dt);
        // BOSS 血量阶段掉落判定（每当失去 20% 血量；所有 BOSS 通用，含今后新增，见 05-boss updateBossLootMarks）
        updateBossLootMarks(e);

        // 撞玩家（BOSS 不受撞击反伤）。旧日之歌：接触一次性伤害 50（受击无敌帧照常）；
        // 暴风之眼：接触持续掉血 ≈40/s（1 血/0.025s，无视无敌帧）；护盾均免疫；测试模式血量归零自动重置（不掉命）
        // 完全登场（combatReady）前无接触判定：汇聚 / 组装阶段的机体尚不可碰撞
        if (e.combatReady && player.alive &&
            Math.abs(e.x - player.x) < e.w / 2 && Math.abs(e.y - player.y) < e.h / 2 &&
            player.shield <= 0 && player.crystalShield <= 0) {
          if (Math.random() < 0.5) spawnParticles(player.x + rand(-8, 8), player.y + rand(-8, 8), '#ff4d6d', 1, 70);
          if (e.bossId === 'storm') {
            if (state.challenge) {
              testDamagePlayer(dt / 0.025 * bossDmgMul());   // ≈40 HP/s（具象：BOSS 伤害 -40%），血量 ≤0 立刻重置为满
            } else {
              player.hp -= dt / 0.025 * bossDmgMul();   // ≈40 HP/s（具象：BOSS 伤害 -40%）
              if (player.hp <= 0) {
                // 最终壁垒：每条命一次的免死同样生效于本持续接触致死路径
                if (!tryBulwarkCheatDeath()) {
                  player.hp = 0;
                  player.alive = false;
                  state.lives--;
                  spawnParticles(player.x, player.y, '#ff4d6d', 40, 320);
                  shake(16, 0.6);
                  if (state.lives <= 0) setTimeout(() => endGame(), 700);
                  else player.respawnTimer = PLAYER_CFG.respawnTime;
                }
              }
            }
          } else {
            // 旧日之歌 50 / 风暴编织者 40：接触一次性伤害（受击无敌帧照常；护盾免疫；具象：BOSS 伤害 -40%）
            const cDmg = (e.bossId === 'storm2' ? STORM2.crashDmg : BOSS.crashDmg) * bossDmgMul();
            if (state.challenge) {
              testDamagePlayer(cDmg);
              player.invuln = PLAYER_CFG.invulnTime * invulnDiffMul(); player.invulnBlink = true;   // 接触后照常给受击无敌帧
            } else {
              damagePlayer(cDmg);
            }
          }
        }
        continue;
      }
      e.wobble += dt * 2;
      // 头顶血条渐显渐隐（0.15s）与白色残量追踪（受伤出现、回满消失；绘制见 drawEnemy）
      e.barT = clamp((e.barT || 0) + (e.hp < e.maxHp ? dt : -dt) / 0.15, 0, 1);
      e.hpTrail = e.hpTrail == null ? e.hp : e.hpTrail + (e.hp - e.hpTrail) * Math.min(1, dt * 2.2);
      if (e.phase > 0) e.phase -= dt;   // 虚化倒计时，归零后可被伤害
      if (e.unfoldT > 0) e.unfoldT -= dt;   // 4类就位展开动画计时
      if (e.type === 'yu4') e.auraT += dt;   // 御4：登场计时（超过 auraDelay 后防御光环渐显）
      if (e.type === 'anvil') { e.auraT += dt; anvilHealTick(e, dt); }   // 铁砧：登场计时 + 每秒治疗光环内敌人
      if (e.type === 'jiaoxiang') { e.auraT += dt; jiaoxiangBurn(e, dt); }   // 焦香螺旋桨：登场计时 + 持续火焰灼烧
      if (e.type === 'fashiArray') {   // 法术阵列：血红雾气（到达后）+ 召唤红光衰减 + 黑雾强度（入场/退场为 1，到位后逐渐消散）
        if (e.arrived) e.auraT += dt;
        if (e.summonFlash > 0) e.summonFlash -= dt;
        const mistTarget = (!e.arrived || e.leaving) ? 1 : 0;
        e.mistI += (mistTarget - (e.mistI || 0)) * Math.min(1, dt * 2);
      }
      updateEnemyMovement(e, dt);
      updateEnemyFire(e, dt);
  
      // 4类在场期间周期召唤护航
      if (e.type === 'capital') {
        e.escortTimer -= dt;
        if (e.escortTimer <= 0 && e.arrived && !state.challenge) {
          e.escortTimer = rand(5, 7);
          if (Math.random() < 0.5) spawnSideGroup();
          else spawnStrikerGroup();
        }
        // 赤金主力舰「金环扩散」：圆环扩大 1.2s，环带上的我方与敌方子弹瞬间消散；到范围后停止并淡出消散
        if (e.variant === 'crgold') {
          // 旋转双环显现：机翼展开完成后（unfoldT 归零）逐渐淡入
          if (e.arrived && !(e.unfoldT > 0)) e.ringT = (e.ringT || 0) + dt;
          // 扩环特效：环缘随机迸出金色火星（随扩环持续；被斩断后停止）
          if (e.ringWave && !e.ringWave.broken && e.ringWave.t <= e.ringWave.dur) {
            const wa = Math.random() * Math.PI * 2;
            spawnParticles(e.x + Math.cos(wa) * e.ringWave.r, e.y + Math.sin(wa) * e.ringWave.r, '#ffd166', 2, 90);
          }
        }
        if (e.ringWave) {
          const w = e.ringWave;
          if (w.broken) {
            // 被群星之杀斩击切断：清弹效果失效，断口碎裂、快速消散（07-player doSlash 置位）
            w.fadeT += dt;
            if (w.fadeT >= w.fadeDur) e.ringWave = null;
          } else {
            w.t += dt;
            if (w.t <= w.dur) {
              w.r += 150 * dt;   // 扩张速度（px/s）
              const band = 16;   // 环带判定厚度
              for (let i = pBullets.length - 1; i >= 0; i--) {
                const pb = pBullets[i];
                if (Math.abs(Math.hypot(pb.x - e.x, pb.y - e.y) - w.r) <= band) pBullets.splice(i, 1);
              }
              for (let i = eBullets.length - 1; i >= 0; i--) {
                const eb = eBullets[i];
                if (Math.abs(Math.hypot(eb.x - e.x, eb.y - e.y) - w.r) <= band) eBullets.splice(i, 1);
              }
            } else {
              e.ringWave = null;   // 到达最大范围即刻消散（无停顿）
            }
          }
        }
      }
  
      // 飞出屏幕（仅穿越型会触发）；横向边界 ±460：各长队编队（BOSS 后固定首波 / 1类长队 /
      // 紫自爆流等）队尾在屏外最深处约 -431，旧 ±120 边界会把尚未入场的队尾整排在第一帧就移除；
      // 顶部出界仅限 leaving（法术阵列 30s 后向上飞离），入场中的敌人不受影响
      if (e.y - e.h / 2 > CANVAS_H || e.x < -460 || e.x > CANVAS_W + 460 ||
          (e.leaving && e.y + e.h / 2 < 0)) {
        enemies.splice(i, 1);
        continue;
      }
  
      // 撞玩家（仅机身中心判定点）；幽暮突击艇、斗志昂扬无法碰撞：既不撞伤玩家、也不受撞机反伤，与玩家互相穿过
      if (!(e.type === 'striker' && e.skill === 'dusk') && e.type !== 'douzhi' && e.type !== 'jiaoxiang' &&
          player.alive && player.invuln <= 0 &&
          Math.hypot(e.x - player.x, e.y - (player.y + PLAYER_CFG.hitOffsetY)) <
          PLAYER_CFG.hitRadius + Math.max(e.w, e.h) / 2 * (e.hsNoDecel ? HANSHUANG.entryHitScale : 1)) {
        // 卫护飞船（invulnMul 0.4）：撞击造成的无敌时间仅为常规的 40%
        // 破片：碰撞伤害按登场时间分段（0.5s 内无伤害 / 0.5~2s 2类×80% / 2s 后 2类×150%）
        let crashDmg = ENEMY_TYPES[e.type].crashDmg;
        if (e.type === 'popian') {
          const base2 = ENEMY_TYPES.striker.crashDmg;
          crashDmg = e.entryT < POPIAN.crashImmune ? 0
            : e.entryT < POPIAN.crashLowEnd ? base2 * POPIAN.crashLowMul
            : base2 * POPIAN.crashHighMul;
        }
        if (crashDmg > 0) damagePlayer(crashDmg, ENEMY_TYPES[e.type].invulnMul || 1);
        e.hp -= 40 * yu4AuraMul(e);   // 撞机反伤为普通伤害，可被御4防御光环削减（真实伤害仅高能爆弹）
        spawnParticles(e.x, e.y, e.color, 18, 220);
        shake(6, 0.25);   // 撞机冲击震屏较弱（受击本体反馈见 damagePlayer）
        if (e.hp <= 0) killEnemy(i);
      }
    }
  }
  
  function updateEnemyMovement(e, dt) {
    if (e.type === 'tornado') {
      // 大型龙卷：缓慢垂直下移直至脱离战场（轻微左右摇摆）
      e.y += STORM.tornadoDescend * dt;
      e.x += Math.sin(e.wobble * 0.5) * 14 * dt;
      return;
    }
    if (e.type === 'side' || e.type === 'prolifera' || e.type === 'escort') {
      // 斜插直线穿越，不反弹；SIDE_SPEED_MUL 统一控制全部虚象级（1类）飞船实际移动速度；
      // 入场瞬间额外冲刺（_entryMul 初值 >1），随后按指数快速衰减回 1（整组同帧生成、同倍率衰减，队形不变）
      // 增生侧翼艇同 1类移动；卫护飞船继承母舰 _sideVel 沿原航向大致继续飞行（_entryMul 预置 1，无入场冲刺）
      const v = e._sideVel || { vx: 0, vy: 60 };
      if (e._entryMul === undefined) e._entryMul = SIDE_ENTRY_BOOST;
      else if (e._entryMul > 1) e._entryMul = Math.max(1, 1 + (e._entryMul - 1) * Math.exp(-SIDE_ENTRY_DECAY * dt));
      const mul = SIDE_SPEED_MUL * e._entryMul;
      e.x += v.vx * mul * dt;
      e.y += v.vy * mul * dt;
      // 赤月：入场 1~2.5s 后随机时刻，向顶角方向（当前航向正前方）发射一枚子弹（仅此一次）
      if (e.type === 'side' && e.behavior === 'moon' && !e.moonFired && e.moonFireT != null) {
        e.moonFireT -= dt;
        if (e.moonFireT <= 0) {
          e.moonFired = true;
          const cfg = ENEMY_TYPES.side;
          pushEBullet(e, Math.atan2(v.vy, v.vx), cfg.bulletSpeed, cfg, { x: e.x, y: e.y });
        }
      }
      return;
    }
    if (e.type === 'striker' && e.skill === 'dusk') {
      // 幽暮：浮现(渐显) → 下移落点(平滑减速停驻) → 停 0.2s → 随机基准角环射 6/8 发 → 停 0.5s → 下移同距渐隐离场
      // 不走通用前锋逻辑（不停留前锋线、不冲锋、不通用开火）
      e.duskT += dt;
      if (e.duskPhase === 0) {
        // 浮现渐显（原位淡入）
        e.duskFade = Math.min(1, e.duskT / DUSK.fadeIn);
        if (e.duskT >= DUSK.fadeIn) { e.duskPhase = 1; e.duskT = 0; }
      } else if (e.duskPhase === 1) {
        // 下移到落点：ease-out（初速即峰值、随后平滑减速到 0 —— 加速快、不瞬停）
        // 剩余距离与瞬时速度低于阈值即视为停稳（消除 ease-out 长尾造成的“已停但动画未开始”空档），
        // 贴齐落点后立刻进入白环预警（速度阈值 10px/s ≈ 0.16px/帧，肉眼不可辨，不违反“不瞬停”要求）
        const t = Math.min(1, e.duskT / DUSK.moveDur);
        const ease = 1 - Math.pow(1 - t, 3);
        e.y = e.duskSY + DUSK.shift * ease;
        const remain = DUSK.shift * (1 - ease);
        const vel = 3 * DUSK.shift * (1 - t) * (1 - t) / DUSK.moveDur;
        if (t >= 1 || (remain <= 1.5 && vel <= 10)) { e.y = e.duskTY; e.duskPhase = 2; e.duskT = 0; }
      } else if (e.duskPhase === 2) {
        // 瞄准停顿 0.2s，结束时开火：以随机方向为基准，向四周正六边形(6)或正八边形(8)的均匀方向各射 1 发
        if (e.duskT >= DUSK.aimWait) {
          e.duskN = Math.random() < 0.5 ? 6 : 8;
          e.duskBaseA = Math.random() * Math.PI * 2;
          const cfg = ENEMY_TYPES.striker;
          for (let k = 0; k < e.duskN; k++) {
            // 幽暮环射弹：初速 140，出膛后 0.3s 内沿飞行方向加速到 280（DUSK.bulletStartSpeed/Accel/MaxSpeed）
            pushEBullet(e, e.duskBaseA + k * Math.PI * 2 / e.duskN, DUSK.bulletStartSpeed, cfg,
              { x: e.x, y: e.y, accel: DUSK.bulletAccel, maxSpeed: DUSK.bulletMaxSpeed });
          }
          e.duskPhase = 4; e.duskT = 0;   // 发射一轮后随即离场
        }
      } else {
        // 渐隐离场：向下移动与浮现时相同的距离，透明度同步衰减（ease-in 加速离去）
        const t = Math.min(1, e.duskT / DUSK.exitDur);
        e.y = e.duskTY + DUSK.shift * (t * t);
        e.duskFade = 1 - t;
        if (t >= 1) e.y = CANVAS_H + e.h;   // 已完全渐隐，移出屏外交由通用出屏检测移除
      }
      return;
    }
    if (e.type === 'striker') {
      // 前锋定位：快速入位到前锋停留线（y 200~240 逐架随机）停留，随后向下冲锋（冲锋速度随关卡 +5/s 线性增长）
      // 入位/冲锋基准速度逐变体定义（VARIANTS.striker entry/charge，幽暮不适用）
      const holdY = e.holdY != null ? e.holdY : 210;
      const descend = e.entrySpd != null ? e.entrySpd : 140;   // 入位下降速度
      // 霜白(silent)不停留直接冲锋；其余变体沿用入位即计时
      const holdAfterArrival = (e.skill === 'silent');
      if (e.holdTimer > 0) {
        if (!holdAfterArrival || e.y >= holdY - 0.5) e.holdTimer -= dt;
        // 下降至前锋停留线：接近时逐渐减速到 0（而非瞬间归零）
        if (e.y < holdY) {
          if (e.vy == null) e.vy = descend;
          const dist = holdY - e.y;
          const targetVy = dist >= 70 ? descend : descend * Math.max(0.12, dist / 70);
          e.vy += (targetVy - e.vy) * Math.min(1, dt * 12);
          e.y += e.vy * dt;
          if (dist <= 1) { e.y = holdY; e.vy = 0; }
        }
        e.x += Math.sin(e.wobble) * 14 * dt;
        return;
      }
      // 冲锋启动：较短时间内从 0 平滑加速到冲锋速度
      const charge = ((e.chargeBase != null ? e.chargeBase : 160) + (levelFlow.level - 1) * 5) * e.speedMul;
      if (e.vy == null) e.vy = 0;
      e.vy += (charge - e.vy) * Math.min(1, dt * 10);
      e.y += e.vy * dt;
      e.x += Math.sin(e.wobble) * 30 * dt;
      return;
    }
    if (e.type === 'hanshuang') {
      // 寒霜：登场计时 → 入场（顶部竖直下移 / 侧翼斜向下飞向同半场落点，见 spawnHanshuang）→ 停留 20s → 向下离场（不攻击）
      e.auraT += dt;
      const spd = HANSHUANG.speed * e.speedMul;
      if (!e.arrived) {
        // 平滑进站：首帧沿落点方向全速起步（顶部初速 +100%、entryDecay 内线性衰减；侧翼无加成），
        // 接近落点按距离比例减速（不瞬间归零）
        // 侧翼入场移速 -30%（flankSpeedMul，仅入场阶段；顶部入场在 enterSpd 基础上再 +100% 初速）
        const enterSpd = e.hsFlank ? spd * HANSHUANG.flankSpeedMul : spd;
        if (!e.hsEntry) {
          const dx = e.targetX - e.x, dy = e.targetY - e.y;
          const dl = Math.hypot(dx, dy) || 1;
          const v0 = enterSpd * (e.hsFlank ? 1 : HANSHUANG.entryBoost);
          e.vx = dx / dl * v0; e.vy = dy / dl * v0;
          e.entryT = 0; e.hsEntry = true;
        }
        e.entryT += dt;
        const t = Math.min(1, e.entryT / HANSHUANG.entryDecay);
        const base = e.hsFlank ? enterSpd : spd * (1 + (HANSHUANG.entryBoost - 1) * (1 - t));   // 顶部初速 1s 内衰减完毕
        const dist = Math.hypot(e.targetX - e.x, e.targetY - e.y);
        const k = dist >= 90 ? 1 : Math.max(0.12, dist / 90);
        const wantVx = (e.targetX - e.x) / (dist || 1) * base * k;
        const wantVy = (e.targetY - e.y) / (dist || 1) * base * k;
        e.vx += (wantVx - e.vx) * Math.min(1, dt * 10);
        e.vy += (wantVy - e.vy) * Math.min(1, dt * 10);
        e.x += e.vx * dt; e.y += e.vy * dt;
        e.hsNoDecel = dist >= 90;   // 入场未减速阶段：判定箱略缩 + 受伤 -20%（见 HANSHUANG.entryDR/entryHitScale）
        if (dist <= 1) { e.x = e.targetX; e.y = e.targetY; e.vx = e.vy = 0; e.arrived = true; e.hsNoDecel = false; }
      } else if (state.challenge) {
        // 图鉴挑战模式：永驻场，便于观察光圈减速效果
      } else if (e.dwellT > 0) {
        e.dwellT -= dt;
      } else {
        // 停留结束向下离场：从静止平滑加速到全速，出屏后由通用检测移除
        e.leaving = true;
        e.hsNoDecel = false;   // 离场不属于入场保护
        e.vy += (spd - e.vy) * Math.min(1, dt * 10);
        e.y += e.vy * dt;
      }
      return;
    }
    if (e.type === 'weilong') {
      // 威龙：独立蛇形航点巡航（不走悬停/离场通用逻辑）
      updateWeilongMovement(e, dt);
      return;
    }
    if (e.type === 'baoling') {
      // 暴鸰：不悬停，径直下压；武装后进入索敌半径 → 停车锁定投弹；投弹后停留 1.5s 再以 70% 速继续俯冲
      e.blT += dt;
      if (e.blPhase === 0) {
        e.y += BAOLING.speedSlow * e.speedMul * dt;
        if (e.blT >= BAOLING.armDelay && player.alive && e.y < player.y &&
            Math.hypot(e.x - player.x, e.y - player.y) <= BAOLING.triggerDist) {
          e.blPhase = 1;
          e.blWarn = { tx: player.x, ty: player.y, t: 0 };   // 预警区锁定玩家当前位置（不再跟踪）
        }
        return;
      }
      if (e.blPhase === 1) {
        // 停车：预警倒计时，结束后炸弹脱离本体（火星特效），交由 blBombs 独立飞行
        e.blWarn.t += dt;
        if (e.blWarn.t >= BAOLING.warnTime) {
          throwBaolingBomb(e);
          e.blPhase = 2;
          e.blWaitT = 0;
        }
        return;
      }
      if (e.blPhase === 2) {
        // 投弹后原地多停留 1.5s，随后才继续俯冲
        e.blWaitT += dt;
        if (e.blWaitT >= BAOLING.postThrowWait) e.blPhase = 3;
        return;
      }
      e.y += BAOLING.speedPost * e.speedMul * dt;   // 投弹完毕：以炮艇 70% 速继续俯冲（出屏由通用检测移除）
      return;
    }
    if (e.type === 'douzhi') {
      // 斗志昂扬：横向匀速穿越（速度=威龙×1.5），同时沿余弦曲线小幅上下浮动；不悬停、不攻击（出屏由通用检测移除）
      e.x += DOUZHI.speed * e.dirX * e.speedMul * dt;
      e.cosPhase += DOUZHI.freqY * dt;
      e.y = e.baseY + Math.sin(e.cosPhase) * DOUZHI.ampY;
      return;
    }
    if (e.type === 'fashiA1') {
      // 法术大师A1：速度积分驱动状态机（下降 → 刹停 → 射击 → 可选横移 → 恢复下降）
      e.entryT += dt;
      const spd = FASHI_A1.speed * e.speedMul;
      const acc = FASHI_A1.accel;
      // 炮管朝向：正常阶段平滑追踪玩家（最大转向角速度很大，几乎实时转向）；
      // 超过屏高 80% 后不再追踪，炮管缓慢转向正下方（faceAng 0 = 炮口朝正下）作为离场姿态
      if (e.y > CANVAS_H * 0.8) {
        e.faceAng = (e.faceAng || 0) + clamp(0 - (e.faceAng || 0), -FASHI_A1.exitTurn * dt, FASHI_A1.exitTurn * dt);
      } else {
        const wantFace = Math.atan2(player.y - e.y, player.x - e.x) - Math.PI / 2;
        const df = Math.atan2(Math.sin(wantFace - (e.faceAng || 0)), Math.cos(wantFace - (e.faceAng || 0)));
        e.faceAng = (e.faceAng || 0) + clamp(df, -FASHI_A1.maxTurn * dt, FASHI_A1.maxTurn * dt);
      }
      // 超过屏高 80%（从上往下）：不再攻击与左右移动，径直加速下压飞离战场（出屏后由通用检测移除）
      if (e.y > CANVAS_H * 0.8) {
        e.vx += (0 - e.vx) * Math.min(1, dt * acc);
        e.vy += (spd - e.vy) * Math.min(1, dt * acc);
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        return;
      }
      switch (e.fa1State) {
        case 'descend': {
          // 入场 0.5s 内从 entrySpeed 线性衰减到 speed（最大速度），之后保持 speed
          const t = Math.min(1, e.entryT / FASHI_A1.entryDecay);
          const targetVy = FASHI_A1.entrySpeed + (spd - FASHI_A1.entrySpeed) * t;
          e.vx += (0 - e.vx) * Math.min(1, dt * acc);
          e.vy += (targetVy - e.vy) * Math.min(1, dt * acc);
          if (e.entryT >= (e.fa1FirstAt != null ? e.fa1FirstAt : FASHI_A1.firstDelay[0])) {
            e.fa1FireTimer -= dt;
            if (e.fa1FireTimer <= 0) e.fa1State = 'brake';
          }
          break;
        }
        case 'brake':
          e.vx += (0 - e.vx) * Math.min(1, dt * acc);
          e.vy += (0 - e.vy) * Math.min(1, dt * acc);
          if (Math.abs(e.vy) < 8 && Math.abs(e.vx) < 8) {
            e.vx = 0; e.vy = 0;
            e.fa1State = 'fire'; e.fa1T = 0; e.fa1Fired = false;
          }
          break;
        case 'fire': {
          e.fa1T += dt;
          if (!e.fa1Fired && e.fa1T >= FASHI_A1.firePause) {
            e.fa1Fired = true;
            const ang = Math.atan2(player.y - e.y, player.x - e.x);
            const cfg = ENEMY_TYPES.fashiA1;
            // 发射点位：炮口（局部 +y 14 × drawScale，随机身 faceAng 旋转到世界坐标）——激光从炮管处射出
            const mz = 14 * cfg.drawScale;
            // 激光：尾端锚定（b.x/b.y = 尾端），无上限持续生长，直到尾端出界才消失
            pushEBullet(e, ang, FASHI_A1.laserSpeed, cfg, {
              x: e.x - Math.sin(e.faceAng || 0) * mz,
              y: e.y + Math.cos(e.faceAng || 0) * mz,
              laser: true, len: 4, growRate: FASHI_A1.laserGrowRate,
              r: FASHI_A1.laserR, color: '#a855f7', dmg: FASHI_A1.laserDmg,
            });
          }
          if (e.fa1Fired && e.fa1T >= FASHI_A1.firePause + FASHI_A1.fireLingerAfter) {
            if (Math.random() < FASHI_A1.strafeChance) {
              e.fa1State = 'strafe'; e.fa1T = 0;
              // 左 15% / 右 15% 区域：强制向场心方向横移（不再靠近那一侧边界）
              const inLeft = e.x < CANVAS_W * 0.15;
              const inRight = e.x > CANVAS_W * 0.85;
              if (inLeft) e.strafeDir = 1;
              else if (inRight) e.strafeDir = -1;
              else e.strafeDir = Math.random() < 0.5 ? -1 : 1;
              e.strafeDist = rand(FASHI_A1.strafeMin, FASHI_A1.strafeMax);
              const maxX = e.strafeDir > 0 ? (CANVAS_W - 40 - e.x) : (e.x - 40);
              e.strafeDist = Math.min(e.strafeDist, Math.max(30, maxX));
              e.strafeMoved = 0;
            } else {
              e.fa1State = 'resume'; e.fa1T = 0;
            }
          }
          break;
        }
        case 'strafe': {
          const tvx = e.strafeDir * FASHI_A1.strafeSpeed;
          e.vx += (tvx - e.vx) * Math.min(1, dt * acc);
          e.vy += (0 - e.vy) * Math.min(1, dt * acc);
          e.strafeMoved += Math.abs(e.vx * dt);
          if (e.strafeMoved >= e.strafeDist) { e.fa1State = 'resume'; e.fa1T = 0; }
          break;
        }
        case 'resume':
          e.vx += (0 - e.vx) * Math.min(1, dt * acc);
          e.vy += (spd - e.vy) * Math.min(1, dt * acc);
          if (e.vy >= spd * 0.9) {
            e.fa1State = 'descend';
            e.fa1FireTimer = enemyFireIv(FASHI_A1);
          }
          break;
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.x += Math.sin(e.wobble) * 6 * dt;   // 轻微摆动
      return;
    }
    if (e.type === 'fashiA2') {
      // 法术大师A2：与 A1 同款速度积分状态机（下降 → 刹停 → 射击 → 可选横移 → 恢复下降），
      // 差异：速度取威龙（远慢于 A1）→ 横移进行中攻击计时照常递减，触发即打断横移（刹停射击后
      // strafeAbort 置位 → 本次射击完毕放弃剩余横移、径直下降直到下次攻击）
      e.entryT += dt;
      const spd = FASHI_A2.speed * e.speedMul;
      const acc = FASHI_A2.accel;
      // 炮管朝向：同 A1——正常阶段平滑追踪玩家；超过屏高 80% 后不再追踪，缓慢转向正下方（离场姿态）
      if (e.y > CANVAS_H * 0.8) {
        e.faceAng = (e.faceAng || 0) + clamp(0 - (e.faceAng || 0), -FASHI_A2.exitTurn * dt, FASHI_A2.exitTurn * dt);
      } else {
        const wantFace = Math.atan2(player.y - e.y, player.x - e.x) - Math.PI / 2;
        const df = Math.atan2(Math.sin(wantFace - (e.faceAng || 0)), Math.cos(wantFace - (e.faceAng || 0)));
        e.faceAng = (e.faceAng || 0) + clamp(df, -FASHI_A2.maxTurn * dt, FASHI_A2.maxTurn * dt);
      }
      // 超过屏高 80%（从上往下）：不再攻击与左右移动，径直加速下压飞离战场（出屏后由通用检测移除）
      if (e.y > CANVAS_H * 0.8) {
        e.vx += (0 - e.vx) * Math.min(1, dt * acc);
        e.vy += (spd - e.vy) * Math.min(1, dt * acc);
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        return;
      }
      switch (e.fa2State) {
        case 'descend': {
          // 入场 0.5s 内从 entrySpeed 线性衰减到 speed（最大速度），之后保持 speed
          const t = Math.min(1, e.entryT / FASHI_A2.entryDecay);
          const targetVy = FASHI_A2.entrySpeed + (spd - FASHI_A2.entrySpeed) * t;
          e.vx += (0 - e.vx) * Math.min(1, dt * acc);
          e.vy += (targetVy - e.vy) * Math.min(1, dt * acc);
          if (e.entryT >= (e.fa2FirstAt != null ? e.fa2FirstAt : FASHI_A2.firstDelay[0])) {
            e.fa2FireTimer -= dt;
            if (e.fa2FireTimer <= 0) e.fa2State = 'brake';
          }
          break;
        }
        case 'brake':
          e.vx += (0 - e.vx) * Math.min(1, dt * acc);
          e.vy += (0 - e.vy) * Math.min(1, dt * acc);
          if (Math.abs(e.vy) < 8 && Math.abs(e.vx) < 8) {
            e.vx = 0; e.vy = 0;
            e.fa2State = 'fire'; e.fa2T = 0; e.fa2Fired = false;
          }
          break;
        case 'fire': {
          e.fa2T += dt;
          if (!e.fa2Fired && e.fa2T >= FASHI_A2.firePause) {
            e.fa2Fired = true;
            const ang = Math.atan2(player.y - e.y, player.x - e.x);
            const cfg = ENEMY_TYPES.fashiA2;
            // 发射点位：炮口（局部 +y 18 × drawScale，随机身 faceAng 旋转到世界坐标）——激光从更粗更长的炮管处射出
            const mz = 18 * cfg.drawScale;
            // 激光：尾端锚定（b.x/b.y = 尾端），无上限持续生长，直到尾端出界才消失；更亮更粗（laserBright 标记渲染增强）
            pushEBullet(e, ang, FASHI_A2.laserSpeed, cfg, {
              x: e.x - Math.sin(e.faceAng || 0) * mz,
              y: e.y + Math.cos(e.faceAng || 0) * mz,
              laser: true, laserBright: true, len: 6, growRate: FASHI_A2.laserGrowRate,
              r: FASHI_A2.laserR, color: '#c084fc', dmg: FASHI_A2.laserDmg,
            });
          }
          if (e.fa2Fired && e.fa2T >= FASHI_A2.firePause + FASHI_A2.fireLingerAfter) {
            // 攻击计时从本次射击完毕重新起算：横移与随后的下降共用同一窗口（1~1.5s），
            // 横移耗时（80~160px ÷ 62）常超出窗口 → 下一击在横移途中触发（见 strafe 分支打断）
            e.fa2FireTimer = enemyFireIv(FASHI_A2);
            // 横移被打断的情况：射击完毕放弃剩余横移，径直下降直到下次攻击（不再掷横移）
            if (e.strafeAbort) {
              e.strafeAbort = false;
              e.fa2State = 'resume'; e.fa2T = 0;
            } else if (Math.random() < FASHI_A2.strafeChance) {
              e.fa2State = 'strafe'; e.fa2T = 0;
              // 左 15% / 右 15% 区域：强制向场心方向横移（不再靠近那一侧边界）
              const inLeft = e.x < CANVAS_W * 0.15;
              const inRight = e.x > CANVAS_W * 0.85;
              if (inLeft) e.strafeDir = 1;
              else if (inRight) e.strafeDir = -1;
              else e.strafeDir = Math.random() < 0.5 ? -1 : 1;
              e.strafeDist = rand(FASHI_A2.strafeMin, FASHI_A2.strafeMax);
              const maxX = e.strafeDir > 0 ? (CANVAS_W - 40 - e.x) : (e.x - 40);
              e.strafeDist = Math.min(e.strafeDist, Math.max(30, maxX));
              e.strafeMoved = 0;
            } else {
              e.fa2State = 'resume'; e.fa2T = 0;
            }
          }
          break;
        }
        case 'strafe': {
          // 斜下 45° 移动（统一替代原纯水平横移）：攻击计时照常递减，到点即打断（brake 刹停射击，strafeAbort 记录放弃剩余斜移）
          e.fa2FireTimer -= dt;
          if (e.fa2FireTimer <= 0) {
            e.strafeAbort = true;   // 打断：射击完毕后放弃剩余斜移
            e.fa2State = 'brake';
            break;
          }
          // 标量速度斜坡 → 精确 45° 速度向量：水平/垂直分量恒等（不随逐帧插值/初速差异偏转）
          const ramp = Math.min(1, dt * acc);
          const m = Math.hypot(e.vx, e.vy) + (FASHI_A2.strafeSpeed - Math.hypot(e.vx, e.vy)) * ramp;   // 速度模长向 strafeSpeed 平滑逼近
          e.vx = e.strafeDir * m / Math.SQRT2;
          e.vy = m / Math.SQRT2;
          e.strafeMoved += Math.abs(e.vx * dt);
          if (e.strafeMoved >= e.strafeDist) { e.fa2State = 'resume'; e.fa2T = 0; }
          break;
        }
        case 'resume':
          e.vx += (0 - e.vx) * Math.min(1, dt * acc);
          e.vy += (spd - e.vy) * Math.min(1, dt * acc);
          if (e.vy >= spd * 0.9) {
            e.fa2State = 'descend';   // 攻击计时已在射击完毕时重置（横移/下降共用窗口）
          }
          break;
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      // 轻微摆动（斜移期间禁用，保证 45° 路径不受横向摆动偏转）
      if (e.fa2State !== 'strafe') e.x += Math.sin(e.wobble) * 6 * dt;
      return;
    }
    if (e.type === 'jiaoxiang') {
      // 焦香螺旋桨：全程速度积分驱动（位置连续变化，杜绝切换闪动/状态重置）；
      // 入场朝目标点逼近 → 绕圈用"引导点追踪"（追圆周上领先角度的点）形成大致圆形轨迹，含轻微随机漂移
      // 绕圈圆心/半径逐次随机（spawn 时写入本体；缺省回退屏中/固定值以防异常生成路径）
      const cx = e.jxCx != null ? e.jxCx : CANVAS_W / 2;
      const cy = e.jxCy != null ? e.jxCy : CANVAS_H * 0.60;
      const R = e.jxR != null ? e.jxR : 175;
      const spd = JIAOXIANG.speed * e.speedMul;
      // 横杠旋转（三根异速，B/C 同向、A 独立）
      e.jxSpinA += e.jxSpdA * dt;
      e.jxSpinB += e.jxSpdB * dt;
      e.jxSpinC += e.jxSpdC * dt;
      let wantVx, wantVy;
      if (e.jxPhase === 0) {
        // 入场阶段：朝目标点直线逼近。非侧翼（顶部）入场就位前带 150% 移速加成；
        // 加成在距目标点 entryBoostDecayDist 以内按剩余距离线性衰减，到位（entryReach）降回 100%；侧翼入场无加成
        const dx = e.jxTargetX - e.x, dy = e.jxTargetY - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        let boost = 1;
        if (!e.jxFlank) {
          const d0 = JIAOXIANG.entryBoostDecayDist, d1 = JIAOXIANG.entryReach;
          const k = dist >= d0 ? 1 : Math.max(0, (dist - d1) / (d0 - d1));   // 远处满加成(1)→到位无加成(0)
          boost = 1 + (JIAOXIANG.entryBoost - 1) * k;
        }
        const s = spd * boost;
        wantVx = dx / dist * s; wantVy = dy / dist * s;
        // 逼近目标点 → 切入绕圈（速度向量原样保留，天然连贯，无任何位置重置）
        if (dist < JIAOXIANG.entryReach) e.jxPhase = 1;
      } else {
        // 绕圈阶段：追踪圆周上"领先角度"的引导点，速度积分自然形成大致圆形轨迹（非严格圆）
        const curA = Math.atan2(e.y - cy, e.x - cx);
        const leadA = curA + e.jxOrbitDir * JIAOXIANG.leadAngle;
        const gx = cx + Math.cos(leadA) * R, gy = cy + Math.sin(leadA) * R;
        const gdx = gx - e.x, gdy = gy - e.y;
        const gl = Math.hypot(gdx, gdy) || 1;
        // 期望速度 = 朝引导点（绕圈速度 ×orbitSpeedMul，较入场降 25%）+ 相干随机漂移（"乱动"）
        // "乱动"用 OU 相干随机游走：漂移向量朝随机目标缓变，而非逐帧白噪声；
        // 白噪声会被下方转向平滑（turn≈0.05/帧）滤波抵消几乎不动，相干游走有持续性故明显可见
        const jr = Math.min(1, dt * JIAOXIANG.jitterRate);
        e.jxJitX += (rand(-1, 1) * JIAOXIANG.jitter - e.jxJitX) * jr;
        e.jxJitY += (rand(-1, 1) * JIAOXIANG.jitter - e.jxJitY) * jr;
        wantVx = gdx / gl * spd * JIAOXIANG.orbitSpeedMul + e.jxJitX;
        wantVy = gdy / gl * spd * JIAOXIANG.orbitSpeedMul + e.jxJitY;
      }
      // 速度平滑转向（限制角速度 → 速度曲线连贯无突变）+ 位置积分（连续，绝不跳变）
      const turn = Math.min(1, dt * JIAOXIANG.turnRate);
      e.vx += (wantVx - e.vx) * turn;
      e.vy += (wantVy - e.vy) * turn;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      // 绕圈阶段硬性边框约束（轨迹不出边框；入场阶段不 clamp 以免挡住屏外入场）
      if (e.jxPhase === 1) {
        e.x = clamp(e.x, e.w / 2, CANVAS_W - e.w / 2);
        e.y = clamp(e.y, e.h / 2, CANVAS_H - e.h / 2);
      }
      return;
    }
    if (e.type === 'popian') {
      // 破片：登场计时（碰撞分段 + 索敌增长）→ 直线飞向选定点 → 到位急停锁停（除非被击毁不再移动）
      e.entryT += dt;
      // 索敌范围随时间增长（30% 屏高起步、每秒 +5% 屏高，封顶 detectMax）——体现为攻击范围增大
      e.detectR = Math.min(CANVAS_H * POPIAN.detectMax,
        CANVAS_H * (POPIAN.detectBase + POPIAN.detectGrow * e.entryT));
      if (!e.arrived) {
        const dx = e.tpX - e.x, dy = e.tpY - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        const spd = POPIAN.speed * e.speedMul;
        // 速度曲线圆滑：临近落点在 brakeDist 内按剩余距离线性减速到 0（而非从高速直接跳 0）
        const brakeDist = 60;
        const wantSpd = dist >= brakeDist ? spd : spd * Math.max(0, dist / brakeDist);
        const tvx = dx / dist * wantSpd, tvy = dy / dist * wantSpd;
        e.vx += (tvx - e.vx) * Math.min(1, dt * 12);
        e.vy += (tvy - e.vy) * Math.min(1, dt * 12);
        e.x += e.vx * dt; e.y += e.vy * dt;
        // 飞行朝向：机身平滑倾斜对齐速度方向（局部 +y 指向飞行方向），受最大转向角速度限制
        const face = Math.atan2(e.vy, e.vx) - Math.PI / 2;
        const dfly = Math.atan2(Math.sin(face - e.faceAng), Math.cos(face - e.faceAng));
        e.faceAng += clamp(dfly, -POPIAN.maxTurn * dt, POPIAN.maxTurn * dt);
        if (dist <= 2.5 || wantSpd < 5) {
          // 到位：锁停（位置吸附、速度归零），停稳后才可攻击（首次攻击延迟 firstDelay）
          e.x = e.tpX; e.y = e.tpY; e.vx = 0; e.vy = 0;
          e.arrived = true;
          e.atkT = POPIAN.firstDelay;
        }
      } else {
        // 停稳：不再移动，但头部以最大转向角速度平滑转向玩家方向（局部 +y 头部始终朝向玩家所在处）
        const face = Math.atan2(player.y - e.y, player.x - e.x) - Math.PI / 2;
        const df = Math.atan2(Math.sin(face - e.faceAng), Math.cos(face - e.faceAng));
        e.faceAng += clamp(df, -POPIAN.maxTurn * dt, POPIAN.maxTurn * dt);
      }
      // 已锁停：不再移动（攻击由 updateEnemyFire 处理）
      return;
    }
    // 法术矩阵：入场下降（初速 2× 快速衰减）→ 到 20%~40% 屏高目标区后 OU 相干随机游走「胡乱移动」（不脱离战场）→ 18s 后加速向下离场
    if (e.type === 'fashiMatrix') {
      e.entryT += dt;
      e.rot = (e.rot || 0) + (e.bodySpin || 0) * dt;   // 机体本体自旋（菱形绕中心旋转，全阶段持续）
      if (e.spinT != null && e.spinT < e.spinDur) {   // 被法术阵列死亡爆发震出：0.4s 内转随机 1~2 圈（easeOut，转速逐渐衰减）
        e.spinT = Math.min(e.spinDur, e.spinT + dt);
        const p = e.spinT / e.spinDur;
        const ang = e.spinTotal * (1 - Math.pow(1 - p, 2));   // easeOutQuad：起转最快、平滑衰减到 0
        e.rot += ang - (e.spinLast || 0);
        e.spinLast = ang;
      }
      const spd = FASHI_MATRIX.speed * e.speedMul;
      const acc = FASHI_MATRIX.accel;
      if (e.mxPhase === 0) {
        // 入场下降：初速 entrySpeed(2×) 在 entryDecay 内快速衰减到 spd，之后匀速直下（不减速），到达目标高度即切入胡乱移动
        const t = Math.min(1, e.entryT / FASHI_MATRIX.entryDecay);
        const fall = FASHI_MATRIX.entrySpeed + (spd - FASHI_MATRIX.entrySpeed) * t;
        e.vx += (0 - e.vx) * Math.min(1, dt * acc);
        e.vy += (fall - e.vy) * Math.min(1, dt * acc);
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (e.y >= e.hoverY) {
          // 不清零速度：保留下降动量，由胡乱移动的速度平滑(turnRate)自然接管 → 轨迹连贯，无「停一下再走」的卡顿
          e.mxPhase = 1; e.arrived = true; e.wanderT = 0;
          e.wanderX = rand(-1, 1) * FASHI_MATRIX.jitter; e.wanderY = rand(-1, 1) * FASHI_MATRIX.jitter;
        }
        return;
      }
      if (e.mxPhase === 1) {
        // 胡乱移动：OU 相干随机游走（漂移向量朝随机目标缓变，非逐帧白噪声 → 穿过速度平滑滤波仍连贯可见，不卡顿）
        e.wanderT += dt;
        const jr = Math.min(1, dt * FASHI_MATRIX.jitterRate);
        e.wanderX += (rand(-1, 1) * FASHI_MATRIX.jitter - e.wanderX) * jr;
        e.wanderY += (rand(-1, 1) * FASHI_MATRIX.jitter - e.wanderY) * jr;
        let wantVx = e.wanderX, wantVy = e.wanderY;
        // 软边界回拉：越接近活动区边缘越叠加朝内速度（避免硬 clamp 贴边卡顿）
        const minX = e.w / 2 + 12, maxX = CANVAS_W - e.w / 2 - 12;
        const minY = CANVAS_H * 0.10, maxY = CANVAS_H * 0.58;
        const m = 46, pull = FASHI_MATRIX.edgePull;
        if (e.x < minX + m) wantVx += pull * (1 - (e.x - minX) / m);
        else if (e.x > maxX - m) wantVx -= pull * (1 - (maxX - e.x) / m);
        if (e.y < minY + m) wantVy += pull * (1 - (e.y - minY) / m);
        else if (e.y > maxY - m) wantVy -= pull * (1 - (maxY - e.y) / m);
        const turn = Math.min(1, dt * FASHI_MATRIX.turnRate);
        e.vx += (wantVx - e.vx) * turn;
        e.vy += (wantVy - e.vy) * turn;
        e.x += e.vx * dt; e.y += e.vy * dt;
        e.x = clamp(e.x, minX, maxX);
        e.y = clamp(e.y, minY, maxY);
        if (e.wanderT >= e.holdTimer) { e.mxPhase = 2; e.leaving = true; }   // 18s 后开走（挑战模式 holdTimer=1e9 永驻）
        return;
      }
      // mxPhase 2：离场——加速向下飞离战场（出屏后由通用检测移除）
      e.vx += (0 - e.vx) * Math.min(1, dt * acc);
      e.vy += (spd * FASHI_MATRIX.exitMul - e.vy) * Math.min(1, dt * acc);
      e.x += e.vx * dt; e.y += e.vy * dt;
      return;
    }
    // 法术阵列：匀速下降（220，无减速动作）→ 到屏幕上方 20%~30% 后像法术矩阵一样
    // 胡乱移动（不脱离屏幕）→ 30s 后向上飞离战场
    if (e.type === 'fashiArray') {
      const cruise = FASHI_ARRAY.descend * e.speedMul;
      if (!e.arrived) {
        // 匀速下降不减速：到达停驻高度后保留下降动量，由胡乱移动的速度平滑自然接管（同法术矩阵）
        if (!e.vy) e.vy = cruise;   // makeEnemy 初始 vy=0（非 null）：首帧补设巡航初速
        e.y += e.vy * dt;
        if (e.y >= e.hoverY) { e.arrived = true; }
        return;
      }
      if (e.holdTimer > 0) {
        e.holdTimer -= dt;
        // 到达悬停位置后胡乱移动（行动逻辑参考法术矩阵：OU 相干随机游走 + 软边界回拉，不脱离屏幕；速度同乘 speedMul）
        e.wanderT += dt;
        const jr = Math.min(1, dt * FASHI_MATRIX.jitterRate);
        e.wanderX += (rand(-1, 1) * FASHI_MATRIX.jitter - e.wanderX) * jr;
        e.wanderY += (rand(-1, 1) * FASHI_MATRIX.jitter - e.wanderY) * jr;
        let wantVx = e.wanderX * e.speedMul, wantVy = e.wanderY * e.speedMul;
        const minX = e.w / 2 + 12, maxX = CANVAS_W - e.w / 2 - 12;
        const minY = CANVAS_H * 0.10, maxY = CANVAS_H * 0.58;
        const m = 46, pull = FASHI_MATRIX.edgePull * e.speedMul;
        if (e.x < minX + m) wantVx += pull * (1 - (e.x - minX) / m);
        else if (e.x > maxX - m) wantVx -= pull * (1 - (maxX - e.x) / m);
        if (e.y < minY + m) wantVy += pull * (1 - (e.y - minY) / m);
        else if (e.y > maxY - m) wantVy -= pull * (1 - (maxY - e.y) / m);
        const turn = Math.min(1, dt * FASHI_MATRIX.turnRate);
        e.vx += (wantVx - e.vx) * turn;
        e.vy += (wantVy - e.vy) * turn;
        e.x += e.vx * dt; e.y += e.vy * dt;
        e.x = clamp(e.x, minX, maxX);
        e.y = clamp(e.y, minY, maxY);
        return;
      }
      // 停留结束：向上加速飞离战场（顶部出界后由通用出界检测移除；挑战模式永驻）
      if (state.challenge) { e.holdTimer = 2; return; }
      e.leaving = true;
      if (e.vy == null) e.vy = 0;
      e.vy += (-cruise - e.vy) * Math.min(1, dt * 10);
      e.vx += (0 - e.vx) * Math.min(1, dt * 10);
      e.x += e.vx * dt; e.y += e.vy * dt;
      return;
    }
    // gunship / capital / harbinger / yu4：下降到悬停高度 → 停留开火 → 停止攻击、以进场同速前开走（可能撞击玩家）
    // 炮艇/主力舰的下降速度逐变体定义（VARIANTS.speed）；御4/铁砧 240
    const cruise = (e.type === 'capital'
        ? (e.variant === 'azure' ? 220 : e.variant === 'crgold' ? 280 : 250)
        : e.type === 'harbinger' ? HARBINGER.descend
        : e.type === 'yu4' ? YU4.speed
        : e.type === 'anvil' ? ANVIL.speed
        : e.type === 'gunship' ? (e.variant === 'crimson' ? 270 : e.variant === 'amber' ? 240 : 300)
        : 320) * e.speedMul;
    if (!e.arrived) {
      // 接近悬停高度时逐渐减速到 0（而非瞬间归零）
      if (e.vy == null) e.vy = cruise;
      const dist = e.hoverY - e.y;
      const targetVy = dist >= 90 ? cruise : cruise * Math.max(0.12, dist / 90);
      e.vy += (targetVy - e.vy) * Math.min(1, dt * 12);
      e.y += e.vy * dt;
      if (dist <= 1 || e.y >= e.hoverY) {
        e.y = e.hoverY; e.arrived = true; e.vy = 0;
        if (e.type === 'capital') {
          // 4类就位展开动画：0.55s 机翼从收拢完全弹出
          e.unfoldT = 0.55;
          spawnParticles(e.x, e.y + 20, '#ffb3bd', 16, 200);
        }
      }
      return;
    }
      if (e.holdTimer > 0) {
        e.holdTimer -= dt;
        // 悬停期间水平巡航
        if (e.type === 'capital') {
          // 赤金技能3：停移（holdEase 平滑过渡 1↔0，摆动速度不瞬间归零、恢复时不瞬间起跳）
          if (e.holdEase == null) e.holdEase = 1;   // 首帧初始化（避免 undefined 参与运算产生 NaN）
          const wantHold = (e.variant === 'crgold' && e.crgoldHold > 0) ? 0 : 1;
          if (e.crgoldHold > 0) e.crgoldHold -= dt;
          e.holdEase += (wantHold - e.holdEase) * Math.min(1, dt * 6);
          e.x = clamp(e.x + Math.sin(e.wobble * 0.35) * 30 * e.holdEase * dt, e.w / 2 + 6, CANVAS_W - e.w / 2 - 6);
        } else if (!e.staticX) {
        // gunship / harbinger：轻幅左右巡航（先兆者幅度更小，稳居后排）
        // staticX：BOSS 召唤的先兆者固定在最左/最右，不巡航，避免被 BOSS 机体挡住打不到
        e.x += Math.sin(e.wobble * 0.6) * (e.type === 'harbinger' ? 24 : 50) * e.speedMul * dt;
      }
      e.x = clamp(e.x, e.w / 2, CANVAS_W - e.w / 2);
      return;
    }
    // 停留结束：停止攻击，以进场同速向下开走，直至飞出屏幕
    // 挑战模式：不离开，持续悬停攻击（便于观察弹幕）
    if (state.challenge) { e.holdTimer = 2; return; }
    e.leaving = true;
    // 启动加速：较短时间内从 0 平滑加速到巡航速度（比减速过程更快）
    if (e.vy == null) e.vy = 0;
    e.vy += (cruise - e.vy) * Math.min(1, dt * 10);
    e.y += e.vy * dt;
  }

  // 威龙移动：沿蛇形航点路径巡航；攻击窗口内停止移动；到位航点可停顿（dwell）
  function updateWeilongMovement(e, dt) {
    // 攻击时停止移动（attackT 由 updateEnemyFire 在发起连射时设置）
    if (e.attackT > 0) { e.attackT -= dt; return; }
    const wps = e.waypoints;
    if (!wps || e.wpIdx >= wps.length) return;   // 路径走完（离场中），交由出屏检测移除
    // 航点停顿（如末段 2s）：停顿期间不推进
    if (e.dwellT > 0) {
      e.dwellT -= dt;
      if (e.dwellT <= 0) e.wpIdx++;
      return;
    }
    const wp = wps[e.wpIdx];
    const dx = wp.x - e.x, dy = wp.y - e.y;
    const dist = Math.hypot(dx, dy);
    const spd = WEILONG.speed * e.speedMul;
    if (dist <= spd * dt + 1.5) {
      // 抵达航点：吸附到精确位置，按需停顿或推进到下一航点
      e.x = wp.x; e.y = wp.y;
      if (wp.dwell) e.dwellT = wp.dwell;
      else e.wpIdx++;
    } else {
      e.x += dx / dist * spd * dt;
      e.y += dy / dist * spd * dt;
    }
  }
  
  function updateEnemyFire(e, dt) {
    if (e.y < 0 || e.x < -30 || e.x > CANVAS_W + 30) return;   // 未入场不开火（含横向尚未入场的长队队尾，避免屏外开火）
    // 幽暮突击艇：环射由移动状态机在“瞄准停顿”结束时触发，不走通用开火计时
    if (e.type === 'striker' && e.skill === 'dusk') return;
    // 法术大师A1：攻击逻辑在移动状态机内处理，不走通用开火
    if (e.type === 'fashiA1') return;
    // 法术大师A2：攻击逻辑在移动状态机内处理，不走通用开火
    if (e.type === 'fashiA2') return;
    // 大型龙卷：随机向 360° 快速射出风条（从机体内部随机点射出，与涡流风旋技能的风条完全一致）
    if (e.type === 'tornado') {
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) {
        e.fireTimer = rand(0.20, 0.30);
        for (let k = 0; k < 2; k++) {
          // 风条：初速低沿飞行方向加速（100.625→408.1），长度 7.2 以 150px/s 长到 42，波动渲染
          pushBossBullet(e.x + rand(-e.w * 0.2, e.w * 0.2), e.y + rand(-e.h * 0.3, e.h * 0.3),
            Math.random() * Math.PI * 2, 56,
            { r: 5.6, dmg: STORM.tornadoDmg, color: STORM_WIND, len: 7.2, lenTarget: 42, growRate: 150,
              oval: true, accel: 100.625, maxSpeed: 408.1 });
        }
      }
      return;
    }
    // 炮火先兆者：入场瞬间即开始充能（不等待就位），红色充满即召唤导弹预警（最多 5 发）
    // 充能与召唤均在 updateEnemyFire 内进行，不影响 updateEnemyMovement 的移动（下降/悬停巡航照常）
    if (e.type === 'harbinger') {
      if (e.leaving) return;   // 已离场：停止充能
      // 具象：攻击间隔 +25% —— 充能序列整体时间膨胀（红相充满更慢 → 召唤导弹更稀疏）
      e.chargeT += dt / (diffMods().enemyFireIntervalMul != null ? diffMods().enemyFireIntervalMul : 1);
      // 首波红相 1.5s、后续波红相 2s；充满即召唤（chargeWave 整波保持不变，避免召唤后动画参数跳变）
      const cd = (e.chargeWave || 0) === 0 ? HARBINGER.chargeFirst : HARBINGER.charge;
      if (!e.firedThisCycle && e.chargeT >= cd && e.missilesGuided < HARBINGER.maxMissiles) {
        e.firedThisCycle = true;
        e.missilesGuided++;
        summonMissile(e);
        // 最后一轮（第 5 发）召唤后立即离场：置 holdTimer=0 令移动分支转入离场
        if (e.missilesGuided >= HARBINGER.maxMissiles) e.holdTimer = 0;
      }
      if (e.chargeT >= HARBINGER.cycle) { e.chargeT = 0; e.chargeWave = (e.chargeWave || 0) + 1; e.firedThisCycle = false; }
      return;
    }
    // 威龙：每隔一段时间朝玩家射 5 枚无偏转快弹（弹速 +60%）；发起时设置攻击窗口（期间停止移动）
    // 自包含处理连发（不落入下方通用 burst 逻辑，避免 fireTimer 双重递减）
    if (e.type === 'weilong') {
      if (e.burst) {
        // 连发进行中：按间隔逐发射出（5 枚同向、无偏转）
        e.burstTimer -= dt;
        if (e.burstTimer <= 0) {
          const b = e.burst;
          pushEBullet(e, b.baseAng, b.speed, ENEMY_TYPES.weilong, b.opts);
          b.shots++;
          e.burstTimer = b.gap;
          if (b.shots >= b.count) e.burst = null;
        }
        return;
      }
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) {
        const cfg = ENEMY_TYPES.weilong;
        e.fireTimer = enemyFireIv(cfg);
        e.burst = {
          baseAng: Math.atan2(player.y - e.y, player.x - e.x),   // 锁定玩家方向（无偏转）
          speed: cfg.bulletSpeed * WEILONG.bulletSpeedMul,       // 较普通弹快 60%
          count: WEILONG.burstCount, shots: 0, gap: WEILONG.burstGap,
          opts: { color: '#ffb42e', r: 5, dmg: cfg.bulletDmg },  // 橙黄能量弹
        };
        e.burstTimer = 0;   // 首立即发
        e.attackT = WEILONG.burstGap * (WEILONG.burstCount - 1) + 0.10;   // 攻击窗口：期间停止移动
      }
      return;
    }
    // 破片：停稳锁停后，索敌范围内 → 玩家位置红圈预警 0.8s → 快速三连发不可击毁导弹（8/5/5，条件性无视无敌）
    if (e.type === 'popian') {
      if (!e.arrived || e.leaving) return;   // 未停稳不攻击
      // 红圈预警进行中：倒计时结束即锁定红圈中心、发起三连发
      if (e.warn) {
        e.warn.t += dt;
        if (e.warn.t >= POPIAN.warnTime) {
          e.popBurst = { count: POPIAN.burstCount, shots: 0, gap: POPIAN.burstGap, tx: e.warn.tx, ty: e.warn.ty, firstHit: false };
          e.popBurstTimer = 0;   // 首立即发
          e.warn = null;
        }
        return;
      }
      // 三连发进行中：按间隔逐发射出（共享 burst.firstHit 状态）
      if (e.popBurst) {
        e.popBurstTimer -= dt;
        if (e.popBurstTimer <= 0) {
          const b = e.popBurst;
          spawnPopianMissile(e, b.tx, b.ty, b.shots, b);
          b.shots++;
          e.popBurstTimer = b.gap;
          if (b.shots >= b.count) e.popBurst = null;
        }
        return;
      }
      // 攻击间隔计时：仅当玩家处于索敌范围内、且机身已朝向玩家（对齐阈值内）才发起预警
      // （未朝向玩家时无法发射——等待转向完成，短暂重试）
      e.atkT -= dt;
      if (e.atkT <= 0) {
        const wantFace = Math.atan2(player.y - e.y, player.x - e.x) - Math.PI / 2;
        const df = Math.atan2(Math.sin(wantFace - e.faceAng), Math.cos(wantFace - e.faceAng));
        if (player.alive && Math.abs(df) <= POPIAN.fireAlign &&
            Math.hypot(player.x - e.x, player.y - e.y) <= e.detectR) {
          // 锁定玩家当前位置（含少量随机偏移）为红圈中心，预警期间不再跟踪
          e.warn = {
            tx: clamp(player.x + rand(-POPIAN.warnOffset, POPIAN.warnOffset), 12, CANVAS_W - 12),
            ty: clamp(player.y + rand(-POPIAN.warnOffset, POPIAN.warnOffset), 12, CANVAS_H - 12),
            t: 0,
          };
          e.atkT = enemyFireIv(POPIAN);
        } else {
          e.atkT = 0.25;   // 不在范围 / 尚未转向到位：短暂重试
        }
      }
      return;
    }
    // 法术矩阵：到达目标区胡乱移动期间，朝玩家左右 ±15° 发射发光正方体（独立 spellCubes 弹道；法术阵列在场时偏移角/速度增强，见 fireMatrixCube）
    if (e.type === 'fashiMatrix') {
      if (!e.arrived || e.leaving) return;   // 入场下降未就位 / 离场中不攻击
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) {
        e.fireTimer = enemyFireIv(FASHI_MATRIX);
        fireMatrixCube(e);
      }
      return;
    }
    // 法术阵列：就位后朝玩家发射大号红色正方体（独立 spellCubes 弹道，飞行途中分裂为 3 枚常规正方体）；
    // 并每 4s 闪动红光、在周围一定范围内召唤一个法术矩阵（召唤体死亡不加分不掉水晶、1s 后开始攻击并随机移动）
    if (e.type === 'fashiArray') {
      if (!e.arrived || e.leaving) return;
      e.summonTimer -= dt;
      if (e.summonTimer <= 0) {
        e.summonTimer = FASHI_ARRAY.summonInterval;
        e.summonFlash = FASHI_ARRAY.summonFlashDur;   // 周身红光闪动（见 drawFashiArrayBody）
        const ang = Math.random() * Math.PI * 2;
        const dist = rand(FASHI_ARRAY.summonDistMin, FASHI_ARRAY.summonDistMax);
        const mx = clamp(e.x + Math.cos(ang) * dist, 50, CANVAS_W - 50);
        const my = clamp(e.y + Math.sin(ang) * dist, 40, CANVAS_H * 0.62);
        const m = spawnFashiMatrix(mx, my);
        m.hoverY = m.y;      // 生成后立即随机移动（就地进入胡乱移动，不再下移寻位）
        m.noReward = true;   // 召唤体：死亡不加分、不掉水晶（见 killEnemy）
        m.fireTimer = 1.0;   // 生成后 1s 开始攻击
        cubeHitFx.push({ x: mx, y: my, t: 0.3, max: 0.3, r: 14, k: 0.55 });   // 生成位置光效闪动
        spawnParticles(mx, my, '#ff8a97', 6, 150);
      }
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) {
        e.fireTimer = enemyFireIv(FASHI_ARRAY);
        fireArrayCube(e);
      }
      return;
    }
    // 其余悬停型：停留结束、前开走阶段停止攻击
    if (e.leaving) return;

    // 定时子射击队列：每帧递减，到点执行（双侧双曲线 / 第二波弹幕 / 多轮齐射等）
    if (e.scheduled && e.scheduled.length) {
      for (let si = e.scheduled.length - 1; si >= 0; si--) {
        const sc = e.scheduled[si];
        sc.t -= dt;
        if (sc.t <= 0) { sc.fn(); e.scheduled.splice(si, 1); }
      }
    }
  
    // 连射状态（螺旋 / 双连炮 / 齐射）优先
    if (e.burst) {
      e.burstTimer -= dt;
      if (e.burstTimer <= 0) {
        const b = e.burst;
        const cfg = ENEMY_TYPES[e.type];
        const jit = b.jitter ? rand(-b.jitter, b.jitter) : 0;   // 每发随机角度偏差
        pushEBullet(e, b.baseAng + b.step * b.shots + jit, b.speed, cfg, b.opts || {});
        if (b.mirror) {
          const mAng = Math.PI - (b.baseAng + b.step * b.shots + jit);
          // mirrorAx：镜像弹反转横向加速度 → 左右对称的双曲线
          const mOpts = (b.opts && b.mirrorAx) ? Object.assign({}, b.opts, { ax: -(b.opts.ax || 0) }) : (b.opts || {});
          pushEBullet(e, mAng, b.speed, cfg, mOpts);
        }
        b.shots++;
        e.burstTimer = b.gap;
        if (b.shots >= b.count) e.burst = null;
      }
      return;
    }
  
    e.fireTimer -= dt;
    if (e.fireTimer > 0) return;
    const cfg = ENEMY_TYPES[e.type];
    e.fireTimer = enemyFireIv(cfg);
  
    if (e.type === 'side' || e.type === 'prolifera' || e.type === 'escort') {
      // 仅 side 的 'shoot' 行为追踪射击，且整场只攻击一次（首射后不再开火）；增生侧翼艇/卫护飞船无攻击
      if (e.type === 'side' && e.behavior === 'shoot' && !e.hasFired) {
        pushEBullet(e, Math.atan2(player.y - e.y, player.x - e.x) + rand(-0.06, 0.06), cfg.bulletSpeed, cfg);
        e.hasFired = true;
      }
      return;
    }
    if (e.type === 'striker') {
      if (e.skill === 'spread') {
        // 烈橙：朝向前方（向下）对称射两发，两弹射线夹角在 40°/50°/60° 间随机（不追踪、不直射）
        const face = Math.PI / 2;
        const spreadDeg = 40 + Math.floor(Math.random() * 3) * 10;   // 40 / 50 / 60
        const half = spreadDeg * Math.PI / 360;                       // 夹角一半（度→弧度）
        pushEBullet(e, face - half, cfg.bulletSpeed, cfg);
        pushEBullet(e, face + half, cfg.bulletSpeed, cfg);
      } else if (e.skill === 'homing') {
        // 幽蓝：追踪玩家方向射击（带极小偏差）
        pushEBullet(e, Math.atan2(player.y - e.y, player.x - e.x) + rand(-0.05, 0.05), cfg.bulletSpeed, cfg);
      } else if (e.skill === 'silent') {
        // 霜白：不开火
      } else {
        // 赤红：垂直向前直射，带 ±10° 随机偏差、不追踪
        pushEBullet(e, Math.PI / 2 + rand(-Math.PI / 18, Math.PI / 18), cfg.bulletSpeed, cfg);
      }
      return;
    }
    if (e.type === 'gunship') {
      if (e.skill === 'aggressive') {
        // 红：火力猛 —— 瞄准三连射+外扩双曲线（合并） / 内收双曲线 / 三方向三段齐射
        switch (e.pattern % 3) {
          case 0: {
            // 技能1（合并，两段弹幕同时发射）：瞄准三连射（锁定发射瞬间玩家方位）与左右双曲线外扩弹流并行
            const aimAng = Math.atan2(player.y - e.y, player.x - e.x);
            // 双曲线占用 burst 槽，立即开始（每侧6发、向两侧外扩）
            e.burst = { baseAng: Math.PI / 2 - 0.18, step: 0, count: 6, shots: 0, gap: 0.085, speed: cfg.bulletSpeed * 1.05, mirror: true, mirrorAx: true, opts: { ax: 220 } };
            e.burstTimer = 0;
            // 三连射不占 burst 槽，改走 scheduled 直射：第 1 发同帧立即出膛，与双曲线同步开火
            pushEBullet(e, aimAng, cfg.bulletSpeed * 1.25, cfg);
            e.scheduled.push({ t: 0.12, fn: () => pushEBullet(e, aimAng, cfg.bulletSpeed * 1.25, cfg) });
            e.scheduled.push({ t: 0.24, fn: () => pushEBullet(e, aimAng, cfg.bulletSpeed * 1.25, cfg) });
            break;
          }
          case 1:
            // 技能2：左右同时双曲线弹（每侧6发）——方向反转：右侧弹往左扫、左侧弹往右扫（向内交叉；主弹 ax 反向即得）
            e.burst = { baseAng: Math.PI / 2 - 0.18, step: 0, count: 6, shots: 0, gap: 0.085, speed: cfg.bulletSpeed * 1.05, mirror: true, mirrorAx: true, opts: { ax: -220 } };
            e.burstTimer = 0;
            break;
          case 2: {
            // 技能三：垂直向下 + 下±20° 三方向，每方向快速射 2 发，连发 3 段（段间隔 0.5s）；
            // 第三段发射完（段内第二发 t=1.11s 出膛）才重新计算攻击间隔，
            // 避免齐射未结束 fireTimer 就走完、下个技能提前插入打断节奏
            e.fireTimer = 1e9;   // 挂起攻击计时（触发分支前已被重置），由第三段结束的 scheduled 恢复
            fireTriVolley(e, cfg);
            e.scheduled.push({ t: 0.5, fn: () => fireTriVolley(e, cfg) });
            e.scheduled.push({ t: 1.0, fn: () => fireTriVolley(e, cfg) });
            e.scheduled.push({ t: 1.11, fn: () => { e.fireTimer = enemyFireIv(cfg); } });
            break;
          }
        }
      } else if (e.skill === 'ring') {
        // 金：'/\/\' 弹幕（快速2发×2组） / 巨型橙红弹（单发） 交替
        switch (e.pattern % 2) {
          case 0:   // 技能1：'/\/\' 弹幕 —— 快速发射两次，短暂间隔后再快速发射两次
            fireSlashPattern(e, cfg);
            e.scheduled.push({ t: 0.14, fn: () => fireSlashPattern(e, cfg) });
            e.scheduled.push({ t: 0.62, fn: () => fireSlashPattern(e, cfg) });
            e.scheduled.push({ t: 0.76, fn: () => fireSlashPattern(e, cfg) });
            break;
          case 1: {   // 技能2：向玩家发射一枚巨型橙红弹（常规配色、半径缩小30%、仅1发）
            const ang = Math.atan2(player.y - e.y, player.x - e.x);
            pushEBullet(e, ang, cfg.bulletSpeed * 0.85, cfg, { r: 13, len: 0, color: SHIP_BULLET_COLOR, dmg: cfg.bulletDmg * 1.4 });
            break;
          }
        }
      } else {
        // 紫 mixed：散射 + 追踪（%4 循环）
        switch (e.pattern % 4) {
          case 0:   // 散射：朝正下方同方向快速射出 2 发（间隔较小、不连在一起）
            e.burst = { baseAng: Math.PI / 2, step: 0, count: 2, shots: 0, gap: 0.13, speed: cfg.bulletSpeed, mirror: false };
            e.burstTimer = 0;
            break;
          case 1: {   // 散射：8 发环形爆发
            const off = Math.random() * Math.PI * 2;
            for (let k = 0; k < 8; k++) pushEBullet(e, off + k * Math.PI / 4, cfg.bulletSpeed * 0.85, cfg);
            break;
          }
          case 2: {   // 追踪：朝玩家方向 ±5° 一次性同时射出 2 发（只射一次）
            const ang = Math.atan2(player.y - e.y, player.x - e.x);
            const a5 = Math.PI / 36;   // 5°
            pushEBullet(e, ang - a5, cfg.bulletSpeed * 1.15, cfg);
            pushEBullet(e, ang + a5, cfg.bulletSpeed * 1.15, cfg);
            break;
          }
          case 3: {   // 追踪：瞄准玩家单发高速狙击
            pushEBullet(e, Math.atan2(player.y - e.y, player.x - e.x), cfg.bulletSpeed * 1.5, cfg);
            break;
          }
        }
      }
      e.pattern++;
      return;
    }
    // capital：按变体技能循环弹幕（3/4类常规子弹均为橙红色长条弹）
    if (e.skill === 'crgold') {
      // 赤金主力舰：三技能循环 —— 锁定三轮齐射 / 金环扩散清弹 / 双向加速弹幕
      switch (e.pattern % 3) {
        case 0: {
          // 技能1：锁定玩家当前瞬间坐标——首轮 5 发（最远两发间总夹角 40°）、随后 2/2 两轮；
          // 每次射击为紧凑两连发（一前一后）：第二轮间隔翻倍（0.56s）、第二轮→第三轮间隔减 25%（0.21s）
          const lockAng = Math.atan2(player.y - e.y, player.x - e.x);
          const volleys = [[5, 40], [2, 22], [2, 25]];   // [发数, 总夹角°]
          const times = [0, 0.56, 0.77];
          const twinGap = 0.06;   // 同一次射击两发的前后间隔
          volleys.forEach(([n, spread], vi) => {
            const half = spread * Math.PI / 360;
            for (let k = 0; k < n; k++) {
              const off = n === 1 ? 0 : -half + (2 * half) * k / (n - 1);
              e.scheduled.push({ t: times[vi], fn: () => pushEBullet(e, lockAng + off, cfg.bulletSpeed, cfg) });
              e.scheduled.push({ t: times[vi] + twinGap, fn: () => pushEBullet(e, lockAng + off, cfg.bulletSpeed, cfg) });
            }
          });
          break;
        }
        case 1: {
          // 技能2：金环扩散 —— 消耗一枚旋转环扩大 1.2s，环带上我方与敌方子弹瞬间消散（双环最多放两次）
          if ((e.ringsLeft || 0) > 0) {
            e.ringsLeft--;
            e.ringWave = { r: e.w * 0.22, t: 0, dur: 1.2 };
            spawnParticles(e.x, e.y, '#ffd166', 18, 220);
            shake(4, 0.2);
          } else {
            // 双环耗尽：退化为瞄准双发
            const ang = Math.atan2(player.y - e.y, player.x - e.x);
            const a5 = Math.PI / 36;
            pushEBullet(e, ang - a5, cfg.bulletSpeed * 1.15, cfg);
            pushEBullet(e, ang + a5, cfg.bulletSpeed * 1.15, cfg);
          }
          break;
        }
        case 2: {
          // 技能3：朝竖直向下依次射出四组「左3右3」加速长条弹（初速≈0、逐渐加速到最大速度），
          // 四组的左右两 stream 夹角依次为 75°/55°/35°/15°（逐组收窄）；释放期间自身停移（crgoldHold）
          const accel = 420, maxSpeed = cfg.bulletSpeed * 1.8;
          e.crgoldHold = 2.0;
          for (let g = 0; g < 4; g++) {
            const halfA = [75, 55, 35, 15][g] * Math.PI / 360;   // 每侧偏角 = 夹角的一半
            const t0 = g * 0.5;
            for (let i = 0; i < 3; i++) {
              e.scheduled.push({ t: t0 + i * 0.07, fn: () => pushEBullet(e, Math.PI / 2 + halfA, 0.5, cfg, { accel, maxSpeed }) });
              e.scheduled.push({ t: t0 + i * 0.07, fn: () => pushEBullet(e, Math.PI / 2 - halfA, 0.5, cfg, { accel, maxSpeed }) });   // 左右同帧发射（原 +0.035 错开致两侧不同时）
            }
          }
          break;
        }
      }
    } else if (e.skill === 'lance') {
      // 蓝：更聚焦玩家 —— 六连齐射(±20°随机偏差) / 大红弹飞行后分裂6小弹 / 双臂螺旋
      switch (e.pattern % 3) {
        case 0:   // 技能1：瞄准六连齐射，每发 ±20° 随机偏差
          e.burst = { baseAng: Math.atan2(player.y - e.y, player.x - e.x), step: 0, count: 6, shots: 0, gap: 0.13, speed: cfg.bulletSpeed * 1.2, mirror: false, jitter: Math.PI / 9 };
          e.burstTimer = 0;
          break;
        case 1: {   // 技能2：向前方发射大号红弹，飞行一段后停止→分裂成 6 个小红弹（互相 60°）
          const ang = Math.atan2(player.y - e.y, player.x - e.x);
          pushEBullet(e, ang, cfg.bulletSpeed * 0.9, cfg, {
            r: 15, len: 0, color: SPLIT_RED,
            split: { dist: 170, count: 6, speed: cfg.bulletSpeed * 1.15, r: 6, color: SPLIT_RED, len: 0 },
          });
          break;
        }
        case 2:   // 技能3（不变）：双臂螺旋 12 发
          e.burst = { baseAng: Math.random() * Math.PI * 2, step: 0.4, count: 12, shots: 0, gap: 0.1, speed: cfg.bulletSpeed, mirror: true };
          e.burstTimer = 0;
          break;
      }
    } else {
      // 红 barrage：三种设计化弹幕循环（交叉矛 / 弧线织网 / '/||\'→'/|\' 加速弹幕）
      switch (e.pattern % 3) {
        case 0:
          fireCrossLances(e, cfg);
          break;
        case 1: {   // 技能2：从一侧机翼依次射出 6 枚扇形弹（正下→水平向下 20°），短暂间隔后另一侧再射（先左先右随机）
          const firstSide = Math.random() < 0.5 ? -1 : 1;
          fireHyperbolaFan(e, cfg, firstSide);
          e.scheduled.push({ t: 0.62, fn: () => fireHyperbolaFan(e, cfg, -firstSide) });
          break;
        }
        case 2:
          fireBarrageWide(e, cfg);        // '/||\'（30°）
          e.scheduled.push({ t: 0.55, fn: () => fireBarrageNarrow(e, cfg) });   // 随后 '/|\'（45°）
          break;
      }
    }
    e.pattern++;
  }
  
  function pushEBullet(e, ang, speed, cfg, opts = {}) {
    // 3/4 类舰常规子弹：橙红色长条弹（可被 opts 覆盖）；1/2 类维持黄色圆弹
    const isShip = e.type === 'gunship' || e.type === 'capital';
    eBullets.push({
      x: opts.x != null ? opts.x : e.x,
      y: opts.y != null ? opts.y : e.y + e.h / 2,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      ax: opts.ax || 0,             // 横向加速度（1/4 双曲线弹道）
      accel: opts.accel || 0,       // 沿飞行方向的加速度（初速低、快速增长）
      maxSpeed: opts.maxSpeed || 0, // 加速上限（0 = 不限）
      r: opts.r != null ? opts.r : cfg.bulletR,
      len: opts.len != null ? opts.len : (isShip ? SHIP_BULLET_LEN : 0),
      dmg: opts.dmg != null ? opts.dmg : cfg.bulletDmg,
      color: opts.color || (isShip ? SHIP_BULLET_COLOR : '#ffd166'),
      split: opts.split || null,    // 分裂弹配置（飞行一段→停止→分裂）
      laser: !!opts.laser,          // 自定义渲染：胶囊形紫色激光（fashiA1/A2）
      laserBright: !!opts.laserBright, // A2 专属：激光更亮（渲染辉光与配色增强）
      lenTarget: opts.lenTarget || 0, // 生长目标长度（激光逐渐增长）
      growRate: opts.growRate || 0,   // 每秒生长像素
      traveled: 0,
    });
  }

  /* ---------- 3类金/红（gunship）设计化弹幕 ---------- */
  // 金 技能1：'/\/\' 弹幕 —— 左右各一组 '/'+'\'，与竖直方向夹角 10°
  function fireSlashPattern(e, cfg) {
    const down = Math.PI / 2, a10 = Math.PI / 18, sideX = e.w * 0.42;
    pushEBullet(e, down + a10, cfg.bulletSpeed, cfg, { x: e.x - sideX });   // 左组 '/'
    pushEBullet(e, down - a10, cfg.bulletSpeed, cfg, { x: e.x - sideX });   // 左组 '\'
    pushEBullet(e, down + a10, cfg.bulletSpeed, cfg, { x: e.x + sideX });   // 右组 '/'
    pushEBullet(e, down - a10, cfg.bulletSpeed, cfg, { x: e.x + sideX });   // 右组 '\'
  }

  // 红 技能3：垂直向下 + 下±20° 三方向，每方向快速射 2 发（一轮，两发间隔 0.11s）
  function fireTriVolley(e, cfg) {
    const down = Math.PI / 2, a20 = Math.PI / 9;
    const dirs = [down - a20, down, down + a20];
    const speed = cfg.bulletSpeed * 1.05;
    for (const ang of dirs) pushEBullet(e, ang, speed, cfg);
    e.scheduled.push({ t: 0.11, fn: () => { for (const ang of dirs) pushEBullet(e, ang, speed, cfg); } });
  }

  /* ---------- 4类红（capital barrage）设计化弹幕 ---------- */
  // 技能1：双翼交叉矛 —— 左翼向右下、右翼向左下，各 3 发收拢交叉成 X
  function fireCrossLances(e, cfg) {
    const down = Math.PI / 2;
    const wingX = e.w * 0.38;
    const speed = cfg.bulletSpeed * 1.05;
    const spawnY = e.y - e.h * 0.3;   // 发射点上移：弹幕飞抵下方时更分散
    for (let k = 0; k < 3; k++) {
      const a = 0.34 + k * 0.16;   // 相对竖直的偏角（约 20°/29°/38°）
      pushEBullet(e, down - a, speed, cfg, { x: e.x - wingX, y: spawnY });   // 左翼 → 右下
      pushEBullet(e, down + a, speed, cfg, { x: e.x + wingX, y: spawnY });   // 右翼 → 左下
    }
  }

  // 技能2：方向扇形弹幕 —— 从一侧机翼逐发依次射出 6 枚弹，
  // 不再一次性齐射，而是从最下方（正下 π/2）逐发往上抬，至最上方一枚与水平方向向下成 20°，
  // 6 枚在 70° 跨度内均匀分布（相邻夹角 14°），朝场地中心一侧展开成宽扇
  function fireHyperbolaFan(e, cfg, side) {
    // side = -1：左翼射出、扇形向右（中心）展开；side = +1：右翼射出、向左（中心）展开
    const wingX = e.w * 0.42;
    const spawnX = e.x + side * wingX;
    const speed = cfg.bulletSpeed;
    const a20 = Math.PI / 9;                                   // 20°：最上方弹与水平向下的夹角
    const N = 6;                                               // 每次射出总数
    const gap = 0.07;                                          // 相邻两发射出间隔（从下往上依次）
    const topAng = Math.PI / 2 + side * (Math.PI / 2 - a20);   // 最上方弹方向（20° below horizontal，朝中心）
    for (let k = 0; k < N; k++) {
      // k=0 最下方（正下 π/2） → k=N-1 最上方（与水平向下成 20°）
      const ang = Math.PI / 2 + (topAng - Math.PI / 2) * (k / (N - 1));
      const fire = () => pushEBullet(e, ang, speed, cfg, { x: spawnX });
      if (k === 0) fire();
      else e.scheduled.push({ t: k * gap, fn: fire });
    }
  }

  // 技能3 笔画：同一射线连射 4 发不同初速的长条弹，沿射线拉开成“一笔画”；初速低→加速到最大弹速
  function fireStroke(e, ang, spawnX, cfg, accel, maxSpeed) {
    const spawnY = e.y - e.h * 0.1;   // 发射点（舰体中心略上方），弹幕飞抵下方时更分散
    for (const sp of [42, 97, 152, 207]) {   // 相邻间距较原来 +50%
      pushEBullet(e, ang, sp, cfg, { x: spawnX, y: spawnY, accel, maxSpeed, color: SHIP_BULLET_COLOR, len: SHIP_BULLET_LEN });
    }
  }

  // 技能3 第一波：'/||\' —— / 与 | 夹角 30°，两个 | 之间留有横向距离
  function fireBarrageWide(e, cfg) {
    const down = Math.PI / 2, a30 = Math.PI / 6;
    const accel = 240, maxSpeed = cfg.bulletSpeed * 1.2, gap = 40;   // accel 降 40%（400→240）、最大弹速降 40%（2×→1.2×）→ 加速更缓、笔画拉得更开
    fireStroke(e, down + a30, e.x - gap, cfg, accel, maxSpeed);        // '/' 左外，向下偏左 30°
    fireStroke(e, down, e.x - gap * 0.35, cfg, accel, maxSpeed);       // '|' 左
    fireStroke(e, down, e.x + gap * 0.35, cfg, accel, maxSpeed);       // '|' 右
    fireStroke(e, down - a30, e.x + gap, cfg, accel, maxSpeed);        // '\' 右外，向下偏右 30°
  }

  // 技能3 第二波（随后）：'/|\' —— 夹角 45°，单 '|' 居中
  function fireBarrageNarrow(e, cfg) {
    const down = Math.PI / 2, a45 = Math.PI / 4;
    const accel = 240, maxSpeed = cfg.bulletSpeed * 1.2, gap = 34;   // accel 降 40%（400→240）、最大弹速降 40%（2×→1.2×）→ 加速更缓、笔画拉得更开
    fireStroke(e, down + a45, e.x - gap, cfg, accel, maxSpeed);        // '/'
    fireStroke(e, down, e.x, cfg, accel, maxSpeed);                    // '|'
    fireStroke(e, down - a45, e.x + gap, cfg, accel, maxSpeed);        // '\'
  }

  // ---------- 炮火先兆者导弹 ----------
  // 召唤：锁定玩家当前 x，生成垂直预警线（3s 后导弹从上方高速下落）
  function summonMissile(e) {
    missileWarns.push({ x: clamp(player.x, 14, CANVAS_W - 14), t: 0, dur: HARBINGER.warnTime });
    spawnParticles(e.x, e.y, '#ff5a3c', 14, 200);
    shake(4, 0.2);
  }

  // 导弹命中玩家的特殊结算（先兆者导弹专用伤害规则）。
  // 注：风暴编织者并没有导弹技能——但其技能1（电弧激光）在既有设计中刻意复用本函数做命中结算
  // （低血秒杀 / ≥60 扣 80% 血量并降级，"与先兆者导弹一致"，见 05-boss runStorm2Skill 技能1 注释），
  // 因此具象的「固定 50 伤害」分支对 先兆者导弹 与 编织者技能1激光 同时生效
  function missileHitPlayer() {
    // 具象：导弹不再有秒杀机制——固定 50 伤害（不扣 80% 血量、不降武器等级；受击无敌照常；护盾免疫由调用方处理）
    const flat = diffMods().missileFlatDmg;
    if (flat != null) {
      if (state.challenge) {
        testDamagePlayer(flat);
        player.invuln = PLAYER_CFG.invulnTime * invulnDiffMul(); player.invulnBlink = true;   // 受击无敌：闪动提示
      } else {
        damagePlayer(flat);
      }
      shake(8, 0.35);
      spawnParticles(player.x, player.y, '#ff5a3c', 26, 320);
      return;
    }
    // 测试模式：导弹照常结算血量（不掉武器等级、不掉命；血量归零自动重置）
    if (state.challenge) {
      const dmg = player.hp < HARBINGER.lowHpKill ? PLAYER_CFG.maxHp : player.hp * 0.8;
      testDamagePlayer(dmg);
      player.invuln = PLAYER_CFG.invulnTime; player.invulnBlink = true;   // 受击无敌：闪动提示
      shake(8, 0.35);
      spawnParticles(player.x, player.y, '#ff5a3c', 26, 320);
      return;
    }
    if (player.hp < HARBINGER.lowHpKill) {
      // 血量低于 60：直接击杀（走标准掉命/结束流程）
      damagePlayer(player.hp + 100);
    } else {
      // 血量 >= 60：失去 80% 当前血量 + 武器等级 -1（先兆者导弹保留直接降级；不进入受击计数）
      player.hp = player.hp * 0.2;
      if (player.weapon > 1) player.weapon--;
      player.berserk = 0;
      player.invuln = PLAYER_CFG.invulnTime * invulnDiffMul(); player.invulnBlink = true;   // 受击无敌：闪动提示
      shake(8, 0.35);
      spawnParticles(player.x, player.y, '#ff5a3c', 26, 320);
    }
  }

  function updateMissiles(dt) {
    // 预警线：到时转为下落导弹
    for (let i = missileWarns.length - 1; i >= 0; i--) {
      const w = missileWarns[i];
      w.t += dt;
      if (w.t >= w.dur) {
        missiles.push({ x: w.x, y: -30, vy: HARBINGER.missileSpeed, r: HARBINGER.missileR });
        missileWarns.splice(i, 1);
      }
    }
    // 下落导弹
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i];
      m.y += m.vy * dt;
      // 护盾消解
      if (player.shield > 0 && player.alive &&
          Math.hypot(m.x - player.x, m.y - player.y) < 36 + m.r) {
        spawnParticles(m.x, m.y, '#6fe3ff', 16, 220);
        missiles.splice(i, 1);
        continue;
      }
      // 命中玩家判定点
      if (player.alive && player.invuln <= 0 &&
          Math.hypot(m.x - player.x, m.y - (player.y + PLAYER_CFG.hitOffsetY)) < PLAYER_CFG.hitRadius + m.r) {
        missileHitPlayer();
        missiles.splice(i, 1);
        continue;
      }
      if (m.y > CANVAS_H + 40) { missiles.splice(i, 1); continue; }
    }
  }

  // 高能爆弹等清场时一并清除导弹与预警线（含暴风之眼区域标记/风流/风柱）
  function clearMissiles() {
    missileWarns.length = 0;
    missiles.length = 0;
    popianMissiles.length = 0;   // 破片三连发导弹一并清除
    spellCubes.length = 0;       // 法术矩阵发光正方体一并清除
    cubeHitFx.length = 0;        // 正方体击中特效一并清除
    phaseFx.length = 0;          // 碎盾特效一并清除
    zoneMarks.length = 0;
    windFlows.length = 0;
    pillarStrikes.length = 0;
    state.stormVortex = null;   // 涡流风旋（技能7）一并清除
  }
  
  // ---------- 破片三连发导弹 ----------
  // 从破片下方炮管射出，高速飞向锁定的红圈中心；不可被击毁（护盾仍可免疫）；命中按首发/后两发规则结算
  function spawnPopianMissile(e, tx, ty, idx, burst) {
    const ox = e.x + (idx === 0 ? 0 : (idx === 1 ? -7 : 7));   // 三发略错开出射点（中/左/右炮管感）
    const oy = e.y + 12;
    const dx = tx - ox, dy = ty - oy;
    const d = Math.hypot(dx, dy) || 1;
    popianMissiles.push({ x: ox, y: oy, ux: dx / d, uy: dy / d, spd: POPIAN.missileSpeed, r: POPIAN.missileR, tx, ty, idx, burst });
    spawnParticles(ox, oy, '#ff7a45', 5, 120);
  }

  function updatePopianMissiles(dt) {
    for (let i = popianMissiles.length - 1; i >= 0; i--) {
      const m = popianMissiles[i];
      const step = m.spd * dt;
      // 护盾消解（导弹不可被击毁，但护盾仍免疫）
      if (player.shield > 0 && player.alive &&
          Math.hypot(m.x - player.x, m.y - player.y) < 36 + m.r) {
        spawnParticles(m.x, m.y, '#6fe3ff', 12, 200);
        popianMissiles.splice(i, 1);
        continue;
      }
      // 命中玩家判定点（不预先判无敌：由 popianMissileHit 依首发/后两发规则结算）
      if (player.alive &&
          Math.hypot(m.x - player.x, m.y - (player.y + PLAYER_CFG.hitOffsetY)) < PLAYER_CFG.hitRadius + m.r) {
        popianMissileHit(m);
        popianMissiles.splice(i, 1);
        continue;
      }
      // 飞向锁定目标点：抵达即小范围爆炸（多粒子 + 提亮，更明显），玩家在爆圈内视为命中
      const dist = Math.hypot(m.tx - m.x, m.ty - m.y);
      if (step >= dist) {
        spawnParticles(m.tx, m.ty, '#ff5a3c', 20, 300);
        spawnParticles(m.tx, m.ty, '#ffb545', 12, 240);
        spawnParticles(m.tx, m.ty, '#ffffff', 6, 180);
        shake(4, 0.2);
        if (player.alive && Math.hypot(player.x - m.tx, player.y - m.ty) <= POPIAN.blastR) {
          m.x = m.tx; m.y = m.ty;
          popianMissileHit(m);
        }
        popianMissiles.splice(i, 1);
        continue;
      }
      m.x += m.ux * step; m.y += m.uy * step;
      if (Math.random() < 0.5) spawnParticles(m.x, m.y, '#ff7a45', 1, 30);   // 高速尾焰
      if (m.y > CANVAS_H + 40 || m.x < -40 || m.x > CANVAS_W + 40) { popianMissiles.splice(i, 1); continue; }
    }
  }

  // 破片导弹命中结算：首发 8 伤害（正常无敌判定）；首发命中后，后两发无视无敌各 5 伤害；
  // 若首发未命中/玩家无敌，后两发命中则无敌时间 -30%（invulnMul 0.7）
  // 破片导弹计入武器等级的受击计数，但一轮三连发（无论命中几发）仅计一次（b.counted 门控，经 accumulateWeaponDropHit 显式累加）
  function popianMissileHit(m) {
    const b = m.burst;
    let hitLanded = false;
    if (m.idx === 0) {
      if (damagePlayer(POPIAN.firstDmg, 1, false, true)) { b.firstHit = true; hitLanded = true; }   // 首发成功造成伤害 → 标记，后两发无视无敌
    } else if (b.firstHit) {
      damagePlayer(POPIAN.followDmg, 1, true, true);   // 无视玩家无敌时间
      hitLanded = true;
    } else {
      damagePlayer(POPIAN.followDmg, POPIAN.invulnCutMul, false, true);   // 该次受击无敌时间 -30%
      hitLanded = true;
    }
    if (hitLanded && !b.counted) { b.counted = true; accumulateWeaponDropHit(); }   // 整轮仅计一次命中
    // 命中爆炸：三层粒子 + 更强震屏（比落点空爆更明显）
    spawnParticles(m.x, m.y, '#ff5a3c', 22, 320);
    spawnParticles(m.x, m.y, '#ffb545', 14, 260);
    spawnParticles(m.x, m.y, '#ffffff', 8, 200);
    shake(5, 0.25);
  }

  // ---------- 法术矩阵：发光正方体（独立 spellCubes 弹道）----------
  // 朝玩家左右 ±offsetDeg 发射；射程 = rand(0.7,1.4)×到玩家距离 + 15%屏高；
  // 场上存在 3 类「法术阵列」(fashiArray) 时偏移角增至 ±25°、正方体速度 +25%（向前兼容：fashiArray 尚未实装时恒 false）
  function fireMatrixCube(e) {
    if (!player.alive) return;
    const arr = enemies.some(t => t.type === 'fashiArray' && t !== e);
    const offDeg = arr ? FASHI_MATRIX.offsetDegArray : FASHI_MATRIX.offsetDeg;
    const baseAng = Math.atan2(player.y - e.y, player.x - e.x);
    const ang = baseAng + rand(-offDeg, offDeg) * Math.PI / 180;
    const dist0 = Math.hypot(player.x - e.x, player.y - e.y);
    const maxRange = rand(FASHI_MATRIX.rangeMin, FASHI_MATRIX.rangeMax) * dist0 + CANVAS_H * FASHI_MATRIX.rangeScreen;
    const cruise = FASHI_MATRIX.cubeSpeed * (arr ? FASHI_MATRIX.cubeSpeedMulArray : 1);
    spellCubes.push({
      x: e.x, y: e.y, ux: Math.cos(ang), uy: Math.sin(ang),
      spd: cruise * 0.35, cruise,   // 初速 35% → 平滑加速到 cruise（平滑速度曲线）
      dmg: FASHI_MATRIX.cubeDmg,
      traveled: 0, maxRange, phase: 'fly', glow: 1, alpha: 1,
      // 生长：发射瞬间为最大尺寸的 50%，cubeGrowTime 内成长到最大（scale/r 每帧在 updateSpellCubes 更新）
      growT: 0, scale: FASHI_MATRIX.cubeGrowFrom, r: FASHI_MATRIX.cubeR * FASHI_MATRIX.cubeGrowFrom,
    });
    spawnParticles(e.x, e.y, '#ffd9d9', 4, 90);
  }

  // 法术阵列：发射大号红色正方体（法术矩阵同款放大 ~1.35 倍、红光更强、伤害 26）；
  // 飞行 30%~60% 射程时分裂为 3 枚常规正方体（1 同向 + 2 垂直），分裂前 0.5s 红圈收缩预警（见 updateSpellCubes / drawSpellCubes）
  function fireArrayCube(e) {
    if (!player.alive) return;
    const baseAng = Math.atan2(player.y - e.y, player.x - e.x);
    const ang = baseAng + rand(-8, 8) * Math.PI / 180;
    const dist0 = Math.hypot(player.x - e.x, player.y - e.y);
    const maxRange = rand(FASHI_MATRIX.rangeMin, FASHI_MATRIX.rangeMax) * dist0 + CANVAS_H * FASHI_MATRIX.rangeScreen;
    const cruise = FASHI_ARRAY.cubeSpeed;
    spellCubes.push({
      x: e.x, y: e.y, ux: Math.cos(ang), uy: Math.sin(ang),
      spd: cruise * 0.35, cruise,
      dmg: FASHI_ARRAY.cubeDmg,
      traveled: 0, maxRange, phase: 'fly', glow: 1, alpha: 1,
      growT: 0, scale: FASHI_MATRIX.cubeGrowFrom, r: FASHI_ARRAY.cubeR * FASHI_MATRIX.cubeGrowFrom,
      big: true,
      splitDist: maxRange * rand(FASHI_ARRAY.splitMin, FASHI_ARRAY.splitMax),
      warnT: -1,   // <0 = 未进入分裂预警
    });
    spawnParticles(e.x, e.y, '#ffd9d9', 4, 90);
  }

  // 大正方体分裂：原地裂为 3 枚常规法术矩阵正方体——1 枚沿原方向、2 枚垂直于原方向；
  // 射程继承剩余射程、以最大尺寸直接出现；伴随微弱冲击波爆炸特效（k 缩放 drawCubeHitFx 扩散半径）
  function splitSpellCube(c, i) {
    const rem = Math.max(60, c.maxRange - c.traveled);
    const dirs = [[c.ux, c.uy], [-c.uy, c.ux], [c.uy, -c.ux]];
    for (const [nx, ny] of dirs) {
      spellCubes.push({
        x: c.x, y: c.y, ux: nx, uy: ny,
        spd: c.spd, cruise: c.cruise,
        dmg: FASHI_MATRIX.cubeDmg,
        traveled: 0, maxRange: rem, phase: 'fly', glow: 1, alpha: 1,
        growT: FASHI_MATRIX.cubeGrowTime, scale: 1, r: FASHI_MATRIX.cubeR,
      });
    }
    spawnParticles(c.x, c.y, '#ff5a6e', 8, 180);
    spawnParticles(c.x, c.y, '#ffd9d9', 5, 140);
    cubeHitFx.push({ x: c.x, y: c.y, t: 0.3, max: 0.3, r: c.r * 0.6, k: 0.45 });
    spellCubes.splice(i, 1);
  }

  // 正方体生命周期：fly（平滑加速巡航）→ brake（临近射程减速滑行，末段提前渐隐，速度归零时恰好 alpha=0 消失）
  //   → blocked（撞上守愿者被阻挡：撞击特效后停在盾面快速消散，尾焰随消散快速衰减而非瞬间消失）
  function updateSpellCubes(dt) {
    for (let i = spellCubes.length - 1; i >= 0; i--) {
      const c = spellCubes[i];
      const px = c.x, py = c.y;   // 守愿者白盾扫掠相交用上一帧位置
      // 生长：cubeGrowTime 内从 50% 平滑成长到最大尺寸（碰撞半径 r 同步跟随，保证判定与视觉一致；法术阵列大正方体用其专属基准半径）
      c.growT += dt;
      c.scale = FASHI_MATRIX.cubeGrowFrom + (1 - FASHI_MATRIX.cubeGrowFrom) * Math.min(1, c.growT / FASHI_MATRIX.cubeGrowTime);
      c.r = (c.big ? FASHI_ARRAY.cubeR : FASHI_MATRIX.cubeR) * c.scale;
      if (c.phase === 'fly') {
        c.spd += (c.cruise - c.spd) * Math.min(1, dt * FASHI_MATRIX.cubeAccel);   // 平滑加速
        const step = c.spd * dt;
        c.x += c.ux * step; c.y += c.uy * step; c.traveled += step;
        // 法术阵列大正方体：飞行至分裂行程前 0.5s 进入预警（红圈收缩预警，见 drawSpellCubes），到点分裂
        if (c.big) {
          if (c.warnT < 0 && c.traveled >= c.splitDist - c.cruise * FASHI_ARRAY.splitWarn) c.warnT = FASHI_ARRAY.splitWarn;
          if (c.warnT >= 0) {
            c.warnT -= dt;
            if (c.warnT <= 0) { splitSpellCube(c, i); continue; }
          }
        }
        if (c.traveled >= c.maxRange - FASHI_MATRIX.brakeDist) c.phase = 'brake';
      } else if (c.phase === 'brake') {
        c.spd += (0 - c.spd) * Math.min(1, dt * FASHI_MATRIX.brakeRate);   // 快速减速
        const step = c.spd * dt;
        c.x += c.ux * step; c.y += c.uy * step; c.traveled += step;
        c.glow = Math.max(FASHI_MATRIX.glowFloor, c.glow - dt * FASHI_MATRIX.dimRate);   // 缓慢黯淡
        // 末段提前渐隐：剩余滑行时间进入 fadeTime 窗口后 alpha 线性推进，速度归零（spd<10 记 0）时恰好为 0
        const rem = Math.max(0, Math.log(Math.max(c.spd, 10) / 10) / FASHI_MATRIX.brakeRate);
        c.alpha = Math.min(1, rem / FASHI_MATRIX.fadeTime);
        if (c.spd < 10) { spellCubes.splice(i, 1); continue; }   // 速度归零：恰好消失
      } else {   // blocked：撞盾被阻挡，停在盾面快速消散
        c.dieT += dt;
        c.alpha = Math.max(0, 1 - c.dieT / FASHI_MATRIX.shieldDie);
        if (c.dieT >= FASHI_MATRIX.shieldDie) { spellCubes.splice(i, 1); continue; }
      }
      // 白红光效拖尾在绘制层实现（drawSpellCubes 沿运动反方向画渐变光带，非粒子），此处不再生成拖尾粒子
      // 守愿者白盾：正方体撞盾被阻挡（盾参考系下相对位移扫掠 + 弹体半径边缘）——
      //   仅粒子效果（白蓝盾面火花 + 红色碎片），本体停在盾面快速消散、尾焰快速衰减（不瞬间消失、不放冲击波环）
      if (c.phase !== 'blocked' && bulwarkActive()) {
        const hit = shieldSweepHit(px, py, c.x, c.y, c.r);
        if (hit) {
          c.x = hit.x - c.ux * c.r; c.y = hit.y - c.uy * c.r;   // 本体贴在盾面上
          c.phase = 'blocked'; c.dieT = 0; c.spd = 0;
          spawnParticles(hit.x, hit.y, '#eaf6ff', 10, 200);
          spawnParticles(hit.x, hit.y, '#ff5a6e', 6, 170);
          continue;
        }
      }
      // 护盾消解（正方体不可被击毁，但护盾仍免疫）
      if (player.shield > 0 && player.alive && Math.hypot(c.x - player.x, c.y - player.y) < 36 + c.r) {
        spawnParticles(c.x, c.y, '#6fe3ff', 10, 180);
        spellCubes.splice(i, 1);
        continue;
      }
      // 命中玩家判定点（被阻挡后不再伤害；渐隐门控：alpha 低于 35% 不再构成威胁——与暴风之眼区域打击同规则）
      if (c.phase !== 'blocked' && c.alpha > 0.35 && player.alive &&
          Math.hypot(c.x - player.x, c.y - (player.y + PLAYER_CFG.hitOffsetY)) < PLAYER_CFG.hitRadius + c.r) {
        damagePlayer(c.dmg);
        // 击中特效：白热爆闪（突出白光）+ 红色碎片 + 冲击波环（drawCubeHitFx）
        spawnParticles(c.x, c.y, '#ffffff', 18, 300);
        spawnParticles(c.x, c.y, '#ff5a6e', 12, 210);
        cubeHitFx.push({ x: c.x, y: c.y, t: 0.55, max: 0.55, r: c.r * 1.15 });
        spellCubes.splice(i, 1);
        continue;
      }
      // 出界移除
      if (c.y > CANVAS_H + 40 || c.y < -40 || c.x < -40 || c.x > CANVAS_W + 40) { spellCubes.splice(i, 1); continue; }
    }
    // 击中特效推进：扩散渐隐，寿命尽即移除（独立于 spellCubes，命中后本体已删仍继续播放）
    for (let i = cubeHitFx.length - 1; i >= 0; i--) {
      cubeHitFx[i].t -= dt;
      if (cubeHitFx[i].t <= 0) cubeHitFx.splice(i, 1);
    }
  }

  // ---------- 暴鸰炸弹 ----------
  // 已投出的炸弹：低速下坠 dropTime → 沿固定方向极速加速冲向预警区中心 → 抵达即爆炸（仅伤玩家，不伤敌人）
  function updateBaolingBombs(dt) {
    for (let i = blBombs.length - 1; i >= 0; i--) {
      const b = blBombs[i];
      b.t += dt;
      if (b.phase === 'drop') {
        // 低速下坠（初速极低，无高初速）
        b.y += BAOLING.dropSpeed * dt;
        if (Math.random() < 0.35) spawnParticles(b.x, b.y, '#ffb545', 1, 40);   // 引信余火
        if (b.t >= BAOLING.dropTime) {
          b.phase = 'strike';
          const dx = b.tx - b.x, dy = b.ty - b.y;
          const d = Math.hypot(dx, dy) || 1;
          b.ux = dx / d; b.uy = dy / d;   // 目标为静止预警区中心：方向固定
        }
      } else {
        // 极强加速冲刺：初速延续下坠低速，随后爆发加速
        b.spd += BAOLING.strikeAccel * dt;
        const step = b.spd * dt;
        const dist = Math.hypot(b.tx - b.x, b.ty - b.y);
        if (step >= dist) {
          explodeBaolingBomb(b);
          blBombs.splice(i, 1);
          continue;
        }
        b.x += b.ux * step;
        b.y += b.uy * step;
        if (Math.random() < 0.6) spawnParticles(b.x, b.y, '#ff7a45', 1, 36);   // 高速尾焰
      }
    }
  }

  // 炸弹爆炸（投掷命中）：红色预警区中心爆开，仅对玩家结算伤害（范围内）
  function explodeBaolingBomb(b) {
    spawnParticles(b.tx, b.ty, '#ff5a3c', 30, 320);
    spawnParticles(b.tx, b.ty, '#ffb545', 18, 260);
    spawnParticles(b.tx, b.ty, '#ffffff', 10, 200);
    shake(11, 0.35);
    if (player.alive &&
        Math.hypot(player.x - b.tx, player.y - b.ty) <= BAOLING.blastR) {
      damagePlayer(BAOLING.playerDmg);
    }
  }

  // 暴鸰投弹：炸弹脱离本体（预警倒计时结束正常脱离 / 停车锁定期间被击毁时强制提前脱离），
  // 交由 blBombs 独立飞向预警区中心——一旦脱离，击毁暴鸰也无法终止
  function throwBaolingBomb(e) {
    blBombs.push({
      x: e.x, y: e.y + 18,
      tx: e.blWarn.tx, ty: e.blWarn.ty,
      phase: 'drop', t: 0, spd: BAOLING.dropSpeed, ux: 0, uy: 1,
    });
    spawnParticles(e.x, e.y + 16, '#ffd166', 12, 220);   // 脱离火星
    spawnParticles(e.x, e.y + 16, '#ff7a45', 8, 160);
    e.blThrown = true;
  }

  // 暴鸰亡语：炸弹尚未投出即被击毁 → 原地爆炸，对爆圈内所有单位造成伤害
  // （玩家 40 / 敌人 600 + 20% 最大生命，敌人伤害封顶 2600；可连锁引爆其它未投弹暴鸰；不抖屏）
  function detonateBaoling(e) {
    spawnParticles(e.x, e.y, '#ff5a3c', 36, 360);
    spawnParticles(e.x, e.y, '#ffd166', 24, 300);
    spawnParticles(e.x, e.y, '#ffffff', 12, 240);
    if (player.alive &&
        Math.hypot(player.x - e.x, player.y - e.y) <= BAOLING.blastR) {
      damagePlayer(BAOLING.playerDmg);
    }
    for (const t of enemies) {
      if (t === e) continue;
      // 非真实伤害：可被御4防御光环削减；敌人伤害封顶 2600
      t.hp -= Math.min(BAOLING.enemyDmgCap, BAOLING.enemyDmgBase + t.maxHp * BAOLING.enemyDmgRatio) * yu4AuraMul(t);
    }
    // 结算被炸毁的敌人（重入由 killEnemy 的 _deathSettled 拦截；身份删除防索引错位；
    // 多轮清扫：嵌套结算中的 splice 会让单轮倒序遍历漏掉部分 hp<=0 敌人，反复扫至无遗漏）
    for (let pass = 0; pass < 4; pass++) {
      let swept = false;
      for (let i = enemies.length - 1; i >= 0; i--) {
        const t = enemies[i];
        if (!t) continue;   // 嵌套结算可能清空数组导致越界
        if (t !== e && t.hp <= 0 && !t._deathSettled) { killEnemy(i); swept = true; }
      }
      if (!swept) break;
    }
  }

  // ---------- 斗志昂扬死亡演出 ----------
  // 序列：蓝盒脱离并迅速渐隐 → 淡黄光环扩大（同时激活我方攻速/弹速翻倍 8s）→ 本体快速渐隐消失
  // 演出约 boxFade + haloDur（0.65s）结束后移除；增益 hasteT 独立倒计时 8s（不随演出结束而中断）
  function updateDouzhiFx(dt) {
    // 增益倒计时（每帧递减；演出结束后仍继续，直至 8s 到期）
    if (state.hasteT > 0) state.hasteT = Math.max(0, state.hasteT - dt);
    for (let i = douzhiFx.length - 1; i >= 0; i--) {
      const f = douzhiFx[i];
      f.t += dt;
      // 蓝盒脱离渐隐（0 → boxFade）：向下漂离 + 透明度 1→0
      const bp = clamp(f.t / DOUZHI.boxFade, 0, 1);
      f.boxAlpha = 1 - bp;
      f.boxDy = bp * DOUZHI.boxDetach;
      // 蓝盒渐隐结束（仅一次）：激活淡黄光环 + 我方攻速/弹速翻倍增益
      if (!f.buffGiven && f.t >= DOUZHI.boxFade) {
        f.buffGiven = true;
        state.hasteT = DOUZHI.buffDuration;   // 增益不可叠加：直接重置为满时长（重复获得刷新计时）
        const pds = ENEMY_TYPES.douzhi.drawScale;
        spawnParticles(f.x, f.y + f.boxDy + 18.5 * pds, '#f6ecb4', 22, 260);   // 以掉落的盒子为中心迸发
      }
      // 本体快速渐隐（蓝盒渐隐结束后开始）
      f.bodyAlpha = clamp(1 - (f.t - DOUZHI.boxFade) / DOUZHI.bodyFade, 0, 1);
      // 光环播完即移除（本体此时已完全渐隐）
      if (f.t >= DOUZHI.boxFade + DOUZHI.haloDur) douzhiFx.splice(i, 1);
    }
  }

  // 敌人颜色标记：决定道具掉落规则（1类按行为 / 2·3·4类按变体 / 特殊舰船与 BOSS 按固定标记）
  //   red=套件×1.5 | purple=套件×1.2 | yellow=套件×1.2（含金）| blue=护盾6% | green=加血10% | orange=爆弹1%（整场一次）
  //   gray / white / black 无专属掉落规则，仅作分类（gray=灰黑系特殊无人机/炮兵）
  function enemyColorTags(e) {
    switch (e.type) {
      case 'side':      // 1类：白=pass 无规则 / 黄=shoot / 紫=kamikaze
        return e.behavior === 'shoot' ? ['yellow'] : e.behavior === 'kamikaze' ? ['purple'] : e.behavior === 'moon' ? ['red'] : [];
      case 'prolifera': // 增生侧翼艇（淡青绿）
        return ['green'];
      case 'striker':   // 赤红 / 烈橙 / 幽蓝（霜白、幽暮无规则）
        return e.variant === 'crimson' ? ['red'] : e.variant === 'amber' ? ['orange'] : e.variant === 'azure' ? ['blue'] : [];
      case 'gunship':   // 紫 / 红 / 金（金曜按黄色计）
        return e.variant === 'violet' ? ['purple'] : e.variant === 'crimson' ? ['red'] : e.variant === 'amber' ? ['yellow'] : [];
      case 'capital':   // 红 / 蓝
        return e.variant === 'crimson' ? ['red'] : e.variant === 'azure' ? ['blue'] : [];
      case 'harbinger': return ['gray', 'red'];      // 炮火先兆者：灰 + 红
      case 'weilong':   return ['orange', 'yellow']; // 威龙：橙 + 黄
      case 'hanshuang': return ['gray', 'blue'];     // 寒霜：灰 + 蓝
      case 'yu4':       return ['gray', 'blue'];     // 御4：灰 + 蓝
      case 'anvil':     return ['gray', 'green'];    // 铁砧：灰 + 绿（治疗无人机，绿色→加血掉落倾向）
      case 'baoling':   return ['gray', 'red'];      // 暴鸰：灰 + 红
      case 'jiaoxiang': return ['orange', 'red'];    // 焦香螺旋桨：橙 + 红（火焰系）
      case 'douzhi':    return ['gray'];             // 斗志昂扬：灰蓝系（增益已由死亡演出赋予，无专属掉落加成）
      case 'fashiArray': return ['red'];             // 法术阵列：血红（红色标记：升级套件 ×1.5）
      case 'boss':      return e.bossId === 'storm' ? ['white', 'blue'] : e.bossId === 'storm2' ? ['gray', 'blue'] : ['black'];   // 暴风之眼：白 + 蓝 / 风暴编织者：灰 + 蓝 / 旧日之歌：黑
      default:          return [];
    }
  }

  // 通用道具掉落（普通敌人与 BOSS 共用；依 升级套件 → 量子护盾 → 加血 顺序互斥判定）
  // 高能爆弹不在此池：仅 4类（5%）与 BOSS（20%）固定掉落，另有橙色敌人 0.5%（整场最多一次）独立判定
  function rollItemDrops(e, x, y) {
    const tags = enemyColorTags(e);
    const isBoss = e.type === 'boss';
    if (e.type === 'douzhi') return;   // 斗志昂扬：不掉任何道具（仅掉水晶）
    // 类型掉率修正：1类（含增生侧翼艇；卫护飞船不走此池）所有道具概率减半；2类突击艇全部道具概率 ×0.75。
    // 具象：1/2类额外减少修正不再生效。高能爆弹为橙色标记的独立判定（见函数末尾），不在此修正范围内
    const dMods = diffMods();
    let dropMul = 1;
    if (!dMods.dropClassNoReduce) {
      if (e.type === 'side' || e.type === 'prolifera') dropMul = 0.5;
      else if (e.type === 'striker') dropMul = 0.75;
    }
    // BOSS 战期间强制波次（全难度）的 1类敌人——所有道具掉率 ×0.3（标记见 04-spawn spawnBossMinionWave；具象不生效）
    if (e.minionDrop && !dMods.bossMinionDropNoReduce) dropMul *= BOSS_MINION_WAVE.dropMul;
    // 升级套件：基础 9% → 红 ×1.5 / 紫 ×1.2 / 黄（含金）×1.2；
    // 再按「场上已有套件数 + 我方火力等级」统一降率：===4 全体 ×0.5、>=5 全体 ×0.3
    let kitRate = DROP_KIT_RATE;
    if (tags.includes('red')) kitRate *= DROP_KIT_RED;
    if (tags.includes('purple')) kitRate *= DROP_KIT_PURPLE;
    if (tags.includes('yellow')) kitRate *= DROP_KIT_YELLOW;
    // 火力等级补偿：Lv1/Lv2/Lv3 时升级套件掉率分别 +30% / +20% / +10%（×1.3/×1.2/×1.1；Lv4+ 无修正）
    if (player.weapon === 1) kitRate *= 1.3;
    else if (player.weapon === 2) kitRate *= 1.2;
    else if (player.weapon === 3) kitRate *= 1.1;
    const kitLoad = powerups.reduce((n, p) => n + (p.kind === 'kit' ? 1 : 0), 0) + player.weapon;
    if (kitLoad >= 5) kitRate *= 0.3;
    else if (kitLoad === 4) kitRate *= 0.5;
    kitRate *= dropMul;
    // 量子护盾：基础 2% / 蓝色 6%；场上已有护盾道具或我方已带盾时 ×0.35
    let shieldRate = tags.includes('blue') ? DROP_SHIELD_BLUE : DROP_SHIELD_RATE;
    if (powerups.some(p => p.kind === 'shield') || player.shield > 0) shieldRate *= DROP_SHIELD_STACK;
    shieldRate *= dropMul;
    // 加血套件：普通敌人走互斥链（基础 1.8% / 增生侧翼艇固定 10%）；BOSS 在链外独立判定（40% 掉 1 / 另有 10% 一次掉 2）
    const hpRate = isBoss ? 0 : (tags.includes('green') ? DROP_HP_GREEN : DROP_HP_RATE) * dropMul;
    const pr = Math.random();
    if (pr < kitRate) {
      // 升级套件；其中 5% 变为暴走道具（红橙大 S，吃到攻击等级立刻满级）
      if (Math.random() < DROP_KIT_BERSERK) spawnPowerup(x, y, 'berserk', 15);
      else spawnPowerup(x, y, 'kit', 12);
    } else if (pr < kitRate + shieldRate) {
      spawnPowerup(x, y, 'shield', 13);
    } else if (pr < kitRate + shieldRate + hpRate) {
      spawnPowerup(x, y, 'hp', 12);
    }
    if (isBoss) {
      const hr = Math.random();
      if (hr < DROP_HP_BOSS) spawnPowerup(x, y, 'hp', 12);
      else if (hr < DROP_HP_BOSS + DROP_HP_BOSS2) { spawnPowerup(x, y, 'hp', 12); spawnPowerup(x, y, 'hp', 12); }
    }
    // 橙色敌人（烈橙突击艇 / 威龙）：0.5% 掉爆弹 —— 整场战斗最多触发一次（不影响 4类 5% 与 BOSS 20%）
    if (tags.includes('orange') && !state.orangeBombUsed && Math.random() < DROP_BOMB_ORANGE) {
      state.orangeBombUsed = true;
      spawnPowerup(x, y, 'bomb', 12);
    }
  }

  // 铁砧治疗光环：登场 auraDelay 后激活；每 healInterval 秒，对正方形光环内所有敌人（含自身、含 BOSS）
  // 回复 maxHp×healRatio + healFlat（各自不超过 maxHp）。判定以敌机中心是否落在正方形范围内。
  function anvilHealTick(e, dt) {
    if (e.auraT < ANVIL.auraDelay) return;   // 光环未显现不治疗
    e.healT = (e.healT || 0) + dt;
    if (e.healT < ANVIL.healInterval) return;
    e.healT -= ANVIL.healInterval;
    const R = ANVIL.auraR;
    for (const t of enemies) {
      if (t.hp <= 0 || t.hp >= t.maxHp) continue;
      if (Math.abs(t.x - e.x) <= R && Math.abs(t.y - e.y) <= R) {
        t.hp = Math.min(t.maxHp, t.hp + t.maxHp * ANVIL.healRatio + ANVIL.healFlat);
        spawnParticles(t.x, t.y, '#8ce36b', 3, 60);   // 轻微治疗粒子
      }
    }
  }

  // 焦香螺旋桨火焰灼烧：登场 auraDelay 后激活；光环内玩家持续掉血（近本体翻倍）；
  // 复刻 BOSS 接触伤害的连续扣血模型（无视无敌帧；护盾免疫）；测试模式照常扣血（血量归零自动重置，不掉命）
  function jiaoxiangBurn(e, dt) {
    const delay = e.jxFlank ? JIAOXIANG.auraDelayFlank : JIAOXIANG.auraDelay;
    if (e.auraT < delay) return;
    if (!player.alive || player.shield > 0) return;
    if (currentArmor.id === 'chixin') return;   // 炽心装甲：免疫焦香螺旋桨的火环伤害
    const dist = Math.hypot(e.x - player.x, e.y - (player.y + PLAYER_CFG.hitOffsetY));
    if (dist > JIAOXIANG.auraR) return;
    const near = dist <= JIAOXIANG.nearR;
    const dps = JIAOXIANG.burnDps * (near ? 2 : 1);
    if (state.challenge) {
      testDamagePlayer(dps * dt);
      if (Math.random() < 0.35) spawnParticles(player.x + rand(-8, 8), player.y + rand(-8, 8), near ? '#ff4500' : '#ff7a18', 1, 70);
      return;
    }
    player.hp -= dps * dt;
    if (Math.random() < 0.35) spawnParticles(player.x + rand(-8, 8), player.y + rand(-8, 8), near ? '#ff4500' : '#ff7a18', 1, 70);
    if (player.hp <= 0) {
      player.hp = 0;
      player.alive = false;
      state.lives--;
      spawnParticles(player.x, player.y, '#ff4d6d', 40, 320);
      shake(16, 0.6);
      if (state.lives <= 0) setTimeout(() => endGame(), 700);
      else player.respawnTimer = PLAYER_CFG.respawnTime;
    }
  }

  function killEnemy(index) {
    const e = enemies[index];
    // 测试模式（图鉴挑战）：敌方不再无敌 —— 照常走完整击杀流程，仅屏蔽得分与水晶/道具掉落（见下方 testMode 门控）
    const testMode = !!state.challenge;
    // 死亡结算重入保护：结算期间（如暴鸰亡语连锁殉爆）该敌机仍留在数组内且 hp<=0，
    // 其它暴鸰的殉爆波及会再次调用 killEnemy——不拦截会造成两只暴鸰互相重入引爆（无限递归、海量爆炸卡死）
    if (e._deathSettled) return;
    e._deathSettled = true;
    // 按对象身份移除：连锁殉爆嵌套结算期间数组索引会错位，按调用时的 index 删除会误删其它敌人或漏删自身
    const spliceSelf = () => {
      const i = enemies.indexOf(e);
      if (i >= 0) enemies.splice(i, 1);
    };
    // BOSS 击毁：单独结算
    if (e.type === 'boss') {
      if (!testMode) state.score += Math.round(e.score * diffMods().scoreMul);
      spawnParticles(e.x, e.y, '#ffffff', 60, 380);
      spawnParticles(e.x, e.y, BOSS_BULLET.long, 40, 300);
      shake(22, 1.0);
      clearEnemyBullets(); clearMissiles();   // BOSS 死亡：立刻清除全场所有弹幕
      // BOSS 死亡：大量水晶四散飘落，短暂下坠后被战机全部吸收（测试模式不掉落）
      // 水晶：旧日之歌 50 / 风暴编织者 80（继承一阶段掉落）；暴风之眼不再掉落水晶（由二阶段继承）
      if (!testMode && e.bossId !== 'storm') {
        const nCry = e.bossId === 'storm2' ? 80 : 50;
        for (let k = 0; k < nCry; k++) {
          const giant = Math.random() < 0.004;
          crystals.push({
            x: e.x + rand(-200, 200), y: e.y + rand(-40, 40),
            vx: rand(-80, 80), vy: rand(120, 210),
            r: giant ? 15 : 6, val: giant ? 500 : 10,
            giant, t: Math.random() * Math.PI * 2,
            absorbDelay: rand(0.35, 0.7),   // 稍微下落一段距离后再全部吸收
          });
        }
        // 击败 BOSS 20% 掉落高能爆弹
        if (Math.random() < 0.20) spawnPowerup(e.x, e.y, 'bomb', 12);
        // BOSS 死亡：掉落一个暴走道具（短暂下坠后被战机立即吸收，同水晶）
        powerups.push({
          x: e.x, y: e.y, kind: 'berserk', r: 15,
          vx: rand(-60, 60), vy: rand(120, 180),
          absorbDelay: rand(0.4, 0.7),   // 稍微下落一段距离后再强制吸收
        });
        // BOSS 也参与通用道具掉落池（颜色标记：旧日之歌=黑 / 暴风之眼=白+蓝）；
        // 加血规则不同：40% 掉 1 个 / 另有 10% 一次掉 2 个（下方清场循环会为其补 absorbDelay 强制吸收）
        rollItemDrops(e, e.x, e.y);
      }
      bossFlow.stage = 'none';   // BOSS 流程结束
      bossFlow.timer = 0;
      // 击败第一个 BOSS（旧日之歌）：水晶磁吸半径永久 ×1.5（本场战斗持续生效，重开归 1）
      if (e.bossId === 'song') state.crystalMagnetMul = 1.5;
      // 阶段推进：还有下一个 BOSS → 重置计时进入新一轮刷怪；已是最终 BOSS（或测试 / 图鉴挑战）→ 延迟后胜利结算
      bossFlow.phase++;
      // 击败 BOSS 引发的阶段跳变升级：下一次「关卡提升」不召唤斗志昂扬；
      // 阶段衔接为连续升级（新阶段首级 = 击败时等级）时不构成跳变、不置豁免，避免吞掉阶段内首次自然升级的判定
      const lvCfgNext = SPAWN_PHASE_LEVEL[bossFlow.phase] || SPAWN_PHASE_LEVEL[SPAWN_PHASE_LEVEL.length - 1];
      if (lvCfgNext.base > levelFlow.level) levelFlow.douzhiSkipOnce = true;
      if (bossFlow.phase < BOSS_SEQUENCE.length && !state.testBoss && !state.challenge) {
        if (e.bossId === 'storm') {
          // 暴风之眼被击败：风暴轰然消散，直接召唤二阶段飞舰「风暴编织者」
          // （专属登场动画后续单独设计；跳过等清场 / 警报 / 常规刷怪，直接进入战斗）
          spawnBoss('storm2');
          bossFlow.stage = 'fight';
        } else {
          bossFlow.victoryDelay = 0;
          bossFlow.postDelay = 2;   // 击败 BOSS 后 2s 再刷怪（不计入关卡推进；到时固定刷首波 1类长队）
        }
      } else {
        bossFlow.victoryDelay = 2.5;  // 延迟后返回主界面
        bossFlow.defeatedName = e.name;
      }
      spliceSelf();
      // BOSS 被击败：强行击坠场上所有剩余敌方单位（小怪 / 护航 / 召唤物，含 BOSS 测试召唤物）
      // 倒序遍历逐个走 killEnemy 完整击杀演出（爆炸粒子 / 水晶 / 计分）
      // （增生侧翼艇被清场击毁时会分裂卫护飞船并追加到数组尾部，故循环至场上无残留为止）
      // guard 上限防御性兜底：理论上必然清空，防任何未知路径（如未来 killEnemy 新增提前 return）造成主线程死循环卡死
      let clearGuard = 0;
      while (enemies.some(en => en.type !== 'boss') && clearGuard++ < 50) {
        for (let i = enemies.length - 1; i >= 0; i--) {
          if (enemies[i] && enemies[i].type !== 'boss') killEnemy(i);
        }
      }
      // 清场击杀可能触发 1 类紫亡语射击，统一再清一次残留敌弹
      clearEnemyBullets();
      // 清场击杀掉落的水晶 / 道具：与 BOSS 掉落物一致，延迟一段后强制吸收
      // （BOSS 自身掉落物已带 absorbDelay 不受影响；胜利结算延迟 2.5s 内可全部吸完）
      for (const c of crystals) {
        if (c.absorbDelay == null) c.absorbDelay = rand(0.35, 0.7);
      }
      for (const p of powerups) {
        if (p.absorbDelay == null) p.absorbDelay = rand(0.35, 0.7);
      }
      return;
    }
    // 卫护飞船（增生侧翼艇衍生）：仅掉水晶 —— 80% 掉 1 个 / 20% 掉 2 个，不参与通用水晶/道具掉落池（测试模式不掉落不加分）
    if (e.type === 'escort') {
      spawnParticles(e.x, e.y, e.color, 14, 200);
      if (!testMode) {
        state.score += Math.round(e.score * diffMods().scoreMul);
        const n = Math.random() < 0.8 ? 1 : 2;
        for (let k = 0; k < n; k++) {
          crystals.push({
            x: e.x + rand(-8, 8), y: e.y + rand(-5, 5),
            vx: 0, vy: rand(150, 200),
            r: 6, val: 10, giant: false,
            t: Math.random() * Math.PI * 2,
          });
        }
      }
      spliceSelf();
      return;
    }
    // 法术阵列召唤的法术矩阵（周期召唤体）：死亡不加分、不掉水晶（仅爆炸演出，直接移除）
    if (e.noReward) {
      spawnParticles(e.x, e.y, e.color, 14, 200);
      spliceSelf();
      return;
    }
    // 1类亡语 variants：阵亡时向下垂直射击（弹速 230，与常规 1类子弹一致）
    if (e.deathShot) {
      const cfg = ENEMY_TYPES[e.type];
      pushEBullet(e, Math.PI / 2, cfg.bulletSpeed, cfg);
    }
    // 赤月亡语：尚未发射过子弹即被击毁时，12% 概率向顶角方向（航向正前方）补射一枚（与常规发射同弹速）
    if (e.type === 'side' && e.behavior === 'moon' && !e.moonFired && Math.random() < SIDE_MOON.deathShotChance) {
      const v = e._sideVel || { vx: 0, vy: 60 };
      const cfg = ENEMY_TYPES.side;
      pushEBullet(e, Math.atan2(v.vy, v.vx), cfg.bulletSpeed, cfg, { x: e.x, y: e.y });
    }
    // 暴鸰亡语分派：炸弹已脱离 → 无亡语；预警区已形成（停车锁定中）→ 强制提前投弹，
    // 炸弹仍将抵达目标位置并爆炸（击杀无法终止）；预警区形成前被击毁 → 原地爆炸（敌我通杀）
    if (e.type === 'baoling') {
      if (!e.blThrown && e.blWarn) throwBaolingBomb(e);
      else if (!e.blThrown) detonateBaoling(e);
    }
    spawnParticles(e.x, e.y, e.color, 22, 260);
    if (!testMode) state.score += Math.round(e.score * diffMods().scoreMul);
    // 群星守望：击杀 1/2/3/4 类敌人时按概率立刻清除一颗离自身最近的敌方子弹（30%/60%/80%/100%）
    const watchCls = ENEMY_CLASS[e.type];
    const watchChance = (watchCls && currentArmor.clearChance && !testMode)
      ? currentArmor.clearChance[watchCls] : 0;
    if (watchChance && Math.random() < watchChance && eBullets.length) {
      clearNearestEnemyBullet(player.x, player.y);
    }
    // 所有非 BOSS 敌机被击毁均不再抖屏（仅保留 BOSS 的击毁震屏）
    // 增生侧翼艇：击毁后分裂出 2~3 个卫护飞船（深蓝紫渐变小三角，沿原航向大致继续飞行，出厂带随机虚化护盾）
    if (e.type === 'prolifera') {
      const n = 2 + Math.floor(Math.random() * 2);
      const base = e._sideVel || { vx: 0, vy: 60 };
      for (let k = 0; k < n; k++) {
        const esc = makeEnemy('escort', e.x + rand(-10, 10), e.y + rand(-8, 8), { fireTimer: 1e9 });
        esc._sideVel = { vx: base.vx + rand(-16, 16), vy: base.vy + rand(-10, 14) };   // 大致沿原路径，带小幅散布
        esc._entryMul = 1;   // 预置 1：无入场冲刺，平滑接续原航向
      }
      spawnParticles(e.x, e.y, '#9a7bff', 10, 180);
    }
    // 法术阵列亡语：死亡爆发震出一个法术矩阵——无盾（无虚化护盾），0.4s 内高速旋转随机 1~2 圈
    // （转速逐渐衰减），1s 后开始攻击，其余与常规法术矩阵逻辑一致（含 18s 胡乱移动后离场）
    if (e.type === 'fashiArray') {
      const m = spawnFashiMatrix(clamp(e.x, 60, CANVAS_W - 60), clamp(e.y, 40, CANVAS_H * 0.55));
      m.hoverY = m.y;          // 就地停驻：从爆发点直接进入胡乱移动（不再下移寻位）
      m.spinT = 0;             // 被爆发震出的附加自旋计时
      m.spinDur = 0.4;         // 自旋总时长（s）
      m.spinTotal = (Math.random() < 0.5 ? -1 : 1) * rand(1, 2) * Math.PI * 2;   // 随机 1~2 圈（方向随机）
      m.spinLast = 0;          // 已施加的自旋角（增量法叠加到 e.rot）
      m.fireTimer = 1.4;       // 1s 后开始攻击（首攻延迟）
      spawnParticles(e.x, e.y, '#ff5a6e', 10, 200);
    }
    // 3 / 4 类击毁后槽位释放，再次出场由场面压力刷新系统接管（无固定冷却）
    if (e.type === 'capital') {
      spawnParticles(e.x, e.y, '#ffd166', 30, 340);
      // 高能爆弹：击败 4 类主力舰 5% 掉落（BOSS 为 20%；橙色敌人另有 0.5%，整场最多一次，见 rollItemDrops）
      if (!testMode && Math.random() < 0.05) spawnPowerup(e.x, e.y, 'bomb', 12);
    }
    // 威龙击毁：高血量精英，较大爆炸演出（不抖屏）
    if (e.type === 'weilong') {
      spawnParticles(e.x, e.y, '#ffd166', 26, 320);
      spawnParticles(e.x, e.y, '#ff7a18', 18, 260);
    }
    // 寒霜击毁：冰晶碎裂演出（不抖屏）
    if (e.type === 'hanshuang') {
      spawnParticles(e.x, e.y, '#cfeeff', 26, 300);
      spawnParticles(e.x, e.y, '#7fd4ff', 16, 240);
    }
    // 御4击毁：防御力场随之瓦解，金灰碎片演出（不抖屏）
    if (e.type === 'yu4') {
      spawnParticles(e.x, e.y, '#e8d28a', 22, 280);
      spawnParticles(e.x, e.y, '#8b95a3', 14, 220);
    }
    // 铁砧击毁：治疗力场瓦解，青绿 + 灰黑碎片演出（不抖屏）
    if (e.type === 'anvil') {
      spawnParticles(e.x, e.y, '#8ce36b', 22, 280);
      spawnParticles(e.x, e.y, '#6b7280', 14, 220);
    }
    // 暴鸰击毁：机体爆碎演出（未投弹时 detonateBaoling 另有大型爆炸；不抖屏）
    if (e.type === 'baoling') {
      spawnParticles(e.x, e.y, '#ff7a45', 20, 280);
      spawnParticles(e.x, e.y, '#ffd166', 12, 220);
    }
    // 焦香螺旋桨击毁：橙红黄三色火焰碎片演出（不抖屏）
    if (e.type === 'jiaoxiang') {
      spawnParticles(e.x, e.y, '#ff7a18', 30, 340);
      spawnParticles(e.x, e.y, '#ff4500', 20, 280);
      spawnParticles(e.x, e.y, '#ffd166', 14, 220);
    }
    // 斗志昂扬击毁：进入死亡演出序列（蓝盒脱离迅速渐隐 → 淡黄扩大光环 → 我方攻速/弹速翻倍 8s → 本体快速渐隐）
    // 增益在演出中段（蓝盒渐隐结束）由 updateDouzhiFx 激活；本体作为 douzhiFx 独立绘制、渐隐后移除
    if (e.type === 'douzhi') {
      douzhiFx.push({ x: e.x, y: e.y, t: 0, wobble: e.wobble, buffGiven: false, boxAlpha: 1, boxDy: 0, bodyAlpha: 1 });
      spawnParticles(e.x, e.y, '#8fd0ff', 18, 240);
      spawnParticles(e.x, e.y, '#f6ecb4', 12, 200);
    }
    // 法术大师A1击毁：紫光碎裂演出
    if (e.type === 'fashiA1') {
      spawnParticles(e.x, e.y, '#a855f7', 16, 240);
      spawnParticles(e.x, e.y, '#e0d0ff', 10, 180);
    }
    // 法术大师A2击毁：紫白爆裂演出（较 A1 更盛；不抖屏）
    if (e.type === 'fashiA2') {
      spawnParticles(e.x, e.y, '#c084fc', 26, 300);
      spawnParticles(e.x, e.y, '#f3e8ff', 16, 240);
    }
    // 法术矩阵击毁：白红碎裂演出（菱形法师无人机，贴合白红主题）
    if (e.type === 'fashiMatrix') {
      spawnParticles(e.x, e.y, '#ff5566', 18, 260);
      spawnParticles(e.x, e.y, '#fff0f0', 10, 200);
    }
    // 水晶掉落：大概率，数量随体型增加；直接垂直下坠，不乱飘（测试模式不掉水晶、不掉道具）
    if (!testMode) {
      // 紫电（自爆 1类）与大型龙卷不掉水晶；幽暮 80% 掉 3~5；斗志昂扬必定掉落 4~6
      // BOSS 击败后固定首波（postBossWave 标记）的 1类：必定掉落且数量翻倍
      const isDusk = e.type === 'striker' && e.skill === 'dusk';
      const dropR = Math.random();
      const cCount = (e.postBossWave ? 2 : 1) *
        (e.type === 'capital' || e.type === 'fashiArray' ? 12 + Math.floor(Math.random() * 7) :
        e.type === 'weilong' ? 10 + Math.floor(Math.random() * 3) :
        e.type === 'hanshuang' || e.type === 'yu4' || e.type === 'anvil' ? 6 + Math.floor(Math.random() * 5) :
        e.type === 'fashiA2' || e.type === 'jiaoxiang' ? 8 + Math.floor(Math.random() * 5) :
        e.type === 'baoling' ? 4 + Math.floor(Math.random() * 4) :
        e.type === 'douzhi' ? 4 + Math.floor(Math.random() * 3) :
        isDusk ? 3 + Math.floor(Math.random() * 3) :
        e.type === 'fashiA1' || e.type === 'popian' ? 3 + Math.floor(Math.random() * 3) :
        e.type === 'fashiMatrix' ? 2 + Math.floor(Math.random() * 3) :
        e.type === 'striker' ? 2 + Math.floor(Math.random() * 3) :
        1 + Math.floor(Math.random() * 3));
      const noDrop = (e.type === 'side' && e.behavior === 'kamikaze') || e.type === 'tornado';   // 紫电/大型龙卷不掉水晶
      const guaranteed = e.postBossWave || e.type === 'douzhi';
      if (!noDrop && (guaranteed || dropR < ((e.type === 'side' || e.type === 'prolifera') ? 0.60 : 0.80))) {
        for (let k = 0; k < cCount; k++) {
          // 极小概率巨型水晶（0.4%）：体型稍大，价值 50 颗普通水晶
          const giant = Math.random() < 0.004;
          crystals.push({
            x: e.x + rand(-10, 10), y: e.y + rand(-6, 6),
            vx: 0, vy: rand(150, 200),
            r: giant ? 15 : 6, val: giant ? 500 : 10,
            giant,
            t: Math.random() * Math.PI * 2,
          });
        }
      }
      // 通用道具掉落（颜色标记驱动，见 rollItemDrops）：
      // 升级套件 9%（红×1.5 / 紫×1.2 / 黄×1.2，负载降率） / 量子护盾 2%（蓝 6%） / 加血套件 1.8%（绿 10%）
      // 类型修正：1类（含增生侧翼艇）全体道具概率减半、2类突击艇全体道具概率 ×0.75（水晶掉率不在本池、不受影响）
      // 注：高能爆弹不在此通用池，仅由 4 类（5%）与 BOSS（20%）掉落，另有橙色敌人 0.5%（整场最多一次，rollItemDrops 内判定）
      rollItemDrops(e, e.x, e.y);
    }
    spliceSelf();
  }

  export {
    updateEnemies, updateEnemyMovement, updateWeilongMovement, updateEnemyFire, pushEBullet, fireSlashPattern,
    fireTriVolley, fireCrossLances, fireHyperbolaFan, fireStroke, fireBarrageWide, fireBarrageNarrow,
    summonMissile, missileHitPlayer, updateMissiles, clearMissiles, spawnPopianMissile, updatePopianMissiles,
    popianMissileHit, fireMatrixCube, updateSpellCubes, updateBaolingBombs, explodeBaolingBomb, throwBaolingBomb,
    detonateBaoling, updateDouzhiFx, enemyColorTags, rollItemDrops, anvilHealTick, jiaoxiangBurn,
    killEnemy,
  };