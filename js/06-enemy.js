// 06-enemy：敌机更新（移动 / 开火 / 弹幕）+ 先兆者导弹 + 暴鸰炸弹 + 掉落 + killEnemy

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：04-spawn(1 名) 07-player(4 名) 08-entities(1 名) 14-main(11 名)
  // 本文件写共享状态（state/bossFlow/levelFlow 属性赋值；新增属性先在 02-core 归域声明）：
  //   state.{crystalMagnetMul, hasteT, hpKitBanked, hpKitLastT, lives, orangeBombUsed, rewardItem, score, stormVortex, xgLooseBombs}  bossFlow.{defeatedName, phase, postDelay, stage, timer, victoryDelay}  levelFlow.{douzhiSkipOnce, hpKitWaveCd, poemWaveIdx}
  //
  import { CANVAS_H, CANVAS_W } from './01-config-core.js';
  import { ARMOR_SKILLS, PILOTS, PLAYER_CFG, currentArmor, hasPilot } from './01-config-loadout.js';
  import { ANVIL, BAOLING, BAOLING_G, DOUZHI, DUSK, ELITES, ENEMY_CLASS, ENEMY_TYPES, FASHI_A1, FASHI_A2, FASHI_ARRAY, FASHI_MATRIX, HANSHUANG, HARBINGER, JIAOXIANG, POPIAN, POPIAN_U, PULSE_MATRIX, SHIP_BULLET_COLOR, SHIP_BULLET_LEN, SIDE_ENTRY_BOOST, SIDE_ENTRY_DECAY, SIDE_MOON, SIDE_SPEED_FAST, SIDE_SPEED_SLOW, SIDE_SWIRL, SPLIT_RED, SPONSOR, UNREAL, WAR_GHOST, WEILONG, YU4 } from './01-config-enemies.js';
  import { BOSS, BOSS_BULLET, BOSS_MINION_WAVE, BOSS_ROUNDS, BOSS_SEQUENCE, DARKHAND, FIRST_ROUND_BOSSES, STORM, STORM2, STORM_WIND } from './01-config-boss.js';
  import { convertCrystalDrop, CRYSTAL_COLORS, CRYSTAL_COLORS_NORMAL, CRYSTAL_GIANT_COLORS, CRYSTAL_TIERS, DROP_BOMB_ORANGE, DROP_HP_BOSS, DROP_HP_BOSS2, DROP_HP_BY_CLASS, DROP_HP_CYAN, DROP_HP_GREEN, DROP_HP_PROLIFERA, DROP_KIT_BERSERK, DROP_KIT_PURPLE, DROP_KIT_RATE, DROP_KIT_RED, DROP_KIT_YELLOW, DROP_SHIELD_BLUE, DROP_SHIELD_RATE, DROP_SHIELD_STACK, REWARD_ITEMS, rollCrystalGiant, SPAWN_PHASE_LEVEL, WAVE_POEM, bossDmgMul, currentDifficulty, diffMods, eliteHpOf, enemyDmgMul, isPoem, isRealme, invulnDiffMul, isHardTier } from './01-config.js';
  import { blBombs, bossEntranceActive, bossFlow, clamp, clearEnemyBulletsByOwner, clearNearestEnemyBullet, crystals, cubeHitFx, dhFleeLinkedElites, dhOnLinkedEliteKilled, douzhiFx, eBullets, enemies, enemyFieldFireMul, enemyFireIv, enemyOnScreen, frostZones, friendStorms, levelFlow, missileWarns, missiles, pBullets, pillarStrikes, phaseFx, player, popianMissiles, powerups, rand, shake, spawnBlastRing, spawnParticles, spellCubes, state, tryBulwarkCheatDeath, wgSlashes, windFlows, zoneMarks } from './02-core.js';
  import { enemyFrostZoneMoveMul, makeEnemy, spawnAnvil, spawnFashiMatrix, spawnPopianU, spawnSideGroup, spawnStrikerGroup, yu4AuraMul } from './04-spawn.js';
  import { knockbackPlayer, pushBossBullet, spawnBoss, updateBoss } from './05-boss.js';
  import { restartBGM } from './03-audio.js';
  import { accumulateWeaponDropHit, applyRewardItem, bulwarkActive, clearEnemyBullets, damagePlayer, handlePlayerDeath, meiNoteKill, pilotStormContactMul, shieldSweepHit, testDamagePlayer } from './07-player.js';
  import { updateBossLootMarks, updateLovelyShieldMark } from './05-boss.js';
  import { spawnPowerup } from './08-entities.js';
  import { achvBaolingBlastBegin, achvBaolingBlastEnd, achvNoteAuraFieldKill, achvNoteDamage, achvNoteHuiHeal, achvNoteWatchClear, achvOnBossKilled, achvOnDeath, achvOnKill, unlockAchievement } from './02-achievements.js';



  function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      // 渐隐消逝中的暴风之眼（死亡演出）：不再攻击 / 碰撞 / 结算，仅推进淡出计时，播完移除
      if (e.dying) {
        e.dying.t += dt;
        e.rot = (e.rot || 0) + dt * 0.5;   // 缓慢减速旋转（读 drawStormBoss），风暴"散去"的余韵
        if (e.dying.t >= e.dying.dur) {
          const j = enemies.indexOf(e);
          if (j >= 0) enemies.splice(j, 1);
        }
        continue;
      }
      // 寒冷区域（虚幻）敌机减速：每帧按出生基准 speedMulBase 重算 speedMul（对敌生效区域内 ×0.65，
      // BOSS 效果减半；BOSS 移速另经 05-boss bossMoveUpdate 的 mul 挂钩）——多重叠区域取最强减速
      if (e.speedMulBase != null) e.speedMul = e.speedMulBase * enemyFrostZoneMoveMul(e);
      if (e.type === 'boss') {
        updateBoss(e, dt);
        // BOSS 血量阶段掉落判定（每当失去 20% 血量；所有 BOSS 通用，含今后新增，见 05-boss updateBossLootMarks）
        updateBossLootMarks(e);
        // 炼金璃：BOSS 血量首次到达 70% 时额外掉落结晶护盾（未装备炼金璃时内部直接跳过，见 05-boss updateLovelyShieldMark）
        updateLovelyShieldMark(e);

        // 撞玩家（BOSS 不受撞击反伤）。旧日之歌：接触一次性伤害 60（受击无敌帧照常）；
        // 暴风之眼：接触持续掉血 ≈40/s（1 血/0.025s，无视无敌帧）；护盾均免疫；测试模式血量归零自动重置（不掉命）
        // 完全登场（combatReady）前无接触判定：汇聚 / 组装阶段的机体尚不可碰撞
        if (e.combatReady && player.alive &&
            Math.abs(e.x - player.x) < e.w / 2 && Math.abs(e.y - player.y) < e.h / 2 &&
            player.shield <= 0 && player.crystalShield <= 0) {
          if (Math.random() < 0.5) spawnParticles(player.x + rand(-8, 8), player.y + rand(-8, 8), '#ff4d6d', 1, 70);
          if (e.bossId === 'storm') {
            // 天秀忧郁王子：暴风之眼碰撞伤害 -60%（pilotStormContactMul('stormCrash')）
            const contactMul = pilotStormContactMul('stormCrash');
            if (state.challenge) {
              testDamagePlayer(dt / 0.025 * bossDmgMul() * contactMul);   // ≈40 HP/s（虚象：BOSS 伤害 -40%），血量 ≤0 立刻重置为满
            } else {
              player.hp -= dt / 0.025 * bossDmgMul() * contactMul;   // ≈40 HP/s（虚象：BOSS 伤害 -40%）
              achvNoteDamage();   // 成就：暴风之眼本体持续接触受伤
              if (player.hp <= 0) {
                // 最终壁垒：每条命一次的免死同样生效于本持续接触致死路径
                if (!tryBulwarkCheatDeath()) {
                  player.hp = 0;
                  player.alive = false;
                  if (!hasPilot('tianshiLovely')) state.lives--;   // 天使璃：无限生命，不扣命数（永不失败结算）
                  spawnParticles(player.x, player.y, '#ff4d6d', 40, 320);
                  shake(16, 0.6);
                  achvOnDeath('crash:storm', state.lives <= 0);   // 成就：暴风陨落 / 至尊陨落等死因结算
                  handlePlayerDeath();
                }
              }
            }
          } else {
            // 旧日之歌 50 / 风暴编织者 40 / 黑暗之手 55：接触一次性伤害（受击无敌帧照常；护盾免疫；虚象：BOSS 伤害 -40%）
            const cDmg = (e.bossId === 'storm2' ? STORM2.crashDmg : e.bossId === 'darkhand' ? DARKHAND.crashDmg : BOSS.crashDmg) * bossDmgMul();
            if (state.challenge) {
              testDamagePlayer(cDmg);
              player.invuln = PLAYER_CFG.invulnTime * invulnDiffMul(); player.invulnBlink = true;   // 接触后照常给受击无敌帧
            } else {
              damagePlayer(cDmg, 1, false, false, null, 'crash:' + e.bossId);   // 成就死因：BOSS 碰撞（冲锋！冲锋！/ 暴风陨落 / 往日梦魇）
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
      // 顶部出界仅限 leaving（法术阵列 30s 后向上飞离），入场中的敌人不受影响；
      // 朴学峰流星穿刺的技能相位（10~15 贯穿）出屏是设计行为、由技能收口管理，不走此处
      const pxSkillPhase = e.type === 'puxuefeng' && e.elPhase != null && e.elPhase >= 10 && e.elPhase <= 15;
      if (!pxSkillPhase && (e.y - e.h / 2 > CANVAS_H || e.x < -460 || e.x > CANVAS_W + 460 ||
          (e.leaving && e.y + e.h / 2 < 0))) {
        enemies.splice(i, 1);
        continue;
      }
  
      // 撞玩家（仅机身中心判定点）；幽暮突击艇、奖励无人机（斗志/赞助/豪华赞助）无法碰撞：既不撞伤玩家、也不受撞机反伤，与玩家互相穿过
      if (!(e.type === 'striker' && e.skill === 'dusk') && e.type !== 'douzhi' && e.type !== 'sponsor' && e.type !== 'sponsorDeluxe' && e.type !== 'jiaoxiang' &&
          player.alive && player.invuln <= 0 &&
          Math.hypot(e.x - player.x, e.y - (player.y + PLAYER_CFG.hitOffsetY)) <
          PLAYER_CFG.hitRadius + Math.max(e.w, e.h) / 2 * (e.hsNoDecel ? HANSHUANG.entryHitScale : 1)) {
        if (e.type === 'warGhost' && e.wgPhase === 1) {
          // 战争幽灵入场冲撞特例：50 伤害 + 强力击退（复用风暴风流击退 knockbackPlayer，沿冲刺方向推开）；
          // 幽灵本体不受撞机反伤（这是刻意的突击攻击而非普通碰撞）
          damagePlayer(WAR_GHOST.entryDmg * enemyDmgMul(), 1, false, false, null);
          knockbackPlayer(e.wgDir.x, e.wgDir.y, WAR_GHOST.knockback);
          shake(8, 0.35);
          spawnParticles(player.x, player.y, '#ffd24a', 14, 240);
        } else if (e.type === 'puxuefeng' && e.elPhase != null && (e.elPhase === 11 || e.elPhase === 13 || e.elPhase === 15)) {
          // 朴学峰冲刺贯穿特例：接触伤害 + 沿冲刺方向击退（2026-10-02 用户定稿：是击退不是击飞、不旋转；
          // 复用 05-boss knockbackPlayer，同战争幽灵入场冲撞口径）；本体不受撞机反伤（刻意突击攻击）；
          // 外层 invuln 门控保证单冲至多命中一次
          damagePlayer(ENEMY_TYPES.puxuefeng.crashDmg * enemyDmgMul(), 1, false, false, null);
          knockbackPlayer(Math.cos(e.elSkill.ang), Math.sin(e.elSkill.ang), ELITES.puxuefeng.dashKbV);
          shake(8, 0.35);
          spawnParticles(player.x, player.y, '#ffd24a', 14, 240);
        } else {
        // 卫护飞船（invulnMul 0.4）：撞击造成的无敌时间仅为常规的 40%
        let crashDmg = ENEMY_TYPES[e.type].crashDmg;
        // 护盾（量子 / 水晶）期间撞机不震屏：damagePlayer 被护盾吸收返回 false，返回值决定是否给撞击反馈
        // 大型龙卷（暴风之眼召唤物）碰撞伤害携带 src 'stormCrash'：天秀忧郁王子碰撞伤害 -60% 挂点；走 BOSS 侧口径不吃非BOSS增伤
        const tookHit = crashDmg > 0 ? damagePlayer(crashDmg * (e.type === 'tornado' ? 1 : enemyDmgMul()), ENEMY_TYPES[e.type].invulnMul || 1,
          false, false, e.type === 'tornado' ? 'stormCrash' : null) : false;
        e.hp -= 40 * yu4AuraMul(e);   // 撞机反伤为普通伤害，可被御4防御光环削减（真实伤害仅高能爆弹）
        spawnParticles(e.x, e.y, e.color, 18, 220);
        if (tookHit) shake(6, 0.25);   // 撞机冲击震屏较弱（受击本体反馈见 damagePlayer）
        if (e.hp <= 0) killEnemy(i);
        }
      }
    }
  }
  
  // 战争幽灵光环（驻留期全场生效）：场上存在存活战争幽灵时，破片/破片U型/铁砧——
  // 移速 ×auraSpdMul、加速度（速度逼近率）×auraAccMul（当前 ×2 = +100%，同步乘算，防止高速下逼近率不足冲过停留锚点）；
  // 破片（非U型）攻击无视索敌距离（对齐角度门控保留，见 updateEnemyFire popian 分支）
  function warGhostAura() {
    for (const g of enemies) {
      if (g.type === 'warGhost' && !g.dying && g.hp > 0) return WAR_GHOST.auraSpdMul;
    }
    return 1;
  }
  function warGhostAuraAcc() {
    for (const g of enemies) {
      if (g.type === 'warGhost' && !g.dying && g.hp > 0) return WAR_GHOST.auraAccMul;
    }
    return 1;
  }

  function updateEnemyMovement(e, dt) {
    if (e.type === 'tornado') {
      // 大型龙卷：缓慢垂直下移直至脱离战场（无横移）
      e.y += STORM.tornadoDescend * dt;
      return;
    }
    if (e.type === 'side' || e.type === 'prolifera' || e.type === 'escort') {
      // 斜插直线穿越，不反弹；两速体系：_sideVel 生成时已按快速 200 / 慢速 150 归一（方向由编队基值决定）；
      // 入场瞬间额外冲刺（_entryMul 初值 ×1.6），随后按指数快速衰减回 1（整组同帧生成、同倍率衰减，队形不变）
      // 增生侧翼艇同 1类移动；卫护飞船继承母舰 _sideVel 沿原航向大致继续飞行（_entryMul 预置 1，无入场冲刺）
      const v = e._sideVel || { vx: 0, vy: SIDE_SPEED_SLOW };
      if (e._entryMul === undefined) e._entryMul = SIDE_ENTRY_BOOST;      // 青时炮艇召唤体：速度曲线（先横向飞出、0.7s 内平滑转向下飞）——绘制朝向按速度实时计算
      if (e._velCurve) {
        e._velCurve.t += dt;
        const cp = Math.min(1, e._velCurve.t / e._velCurve.dur);
        const ez = cp * (2 - cp);
        e._sideVel.vx = e._velCurve.vx0 + (e._velCurve.vx1 - e._velCurve.vx0) * ez;
        e._sideVel.vy = e._velCurve.vy0 + (e._velCurve.vy1 - e._velCurve.vy0) * ez;
        if (cp >= 1) e._velCurve = null;
      }

      else if (e._entryMul > 1) e._entryMul = Math.max(1, 1 + (e._entryMul - 1) * Math.exp(-SIDE_ENTRY_DECAY * dt));
      e.x += v.vx * e._entryMul * dt;
      e.y += v.vy * e._entryMul * dt;
      // 赤月：入场 1~2.5s 后随机时刻，向顶角方向（当前航向正前方）发射一枚子弹（仅此一次）
      if (e.type === 'side' && e.behavior === 'moon' && !e.moonFired && e.moonFireT != null) {
        e.moonFireT -= dt;
        if (e.moonFireT <= 0) {
          e.moonFired = true;
          const cfg = ENEMY_TYPES.side;
          pushEBullet(e, Math.atan2(v.vy, v.vx), cfg.bulletSpeed, cfg, { x: e.x, y: e.y });
        }
      }
      // 橙旋：入场 0.8~1.5s 后生成一颗环绕弹（紫电亡语弹同款），绕自身公转；
      // 环绕半径随机：基准 ×100%~140%（诗篇 110%~150%），每颗独立掷取；
      // 宿主被击坠/离场后环绕弹立刻消失（随宿主移除判定见 08-entities orbit 分支）
      if (e.type === 'side' && e.behavior === 'swirl' && !e.swirlSpawned && e.swirlT != null) {
        e.swirlT -= dt;
        if (e.swirlT <= 0) {
          e.swirlSpawned = true;
          const cfg = ENEMY_TYPES.side;
          const ang0 = Math.random() * Math.PI * 2;
          const mul = isPoem()
            ? rand(SIDE_SWIRL.distMulPoem[0], SIDE_SWIRL.distMulPoem[1])
            : rand(SIDE_SWIRL.distMul[0], SIDE_SWIRL.distMul[1]);
          pushEBullet(e, ang0, 0, cfg, { x: e.x, y: e.y, orbit: { owner: e, dist: SIDE_SWIRL.dist * mul, ang: ang0, om: SIDE_SWIRL.om } });
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
      // 入位/冲锋基准速度逐变体定义（VARIANTS.striker entry/charge，幽暮不适用）；各变体停留规则已统一（无额外修正）
      const holdY = e.holdY != null ? e.holdY : 210;
      const descend = e.entrySpd != null ? e.entrySpd : 140;   // 入位下降速度
      // 「2*7」无停留直通（50% 波次）：下降段保持入位速度越过前锋停留线，越过 holdY 后
      // 平滑衰减到 descend × vNoHoldSpdMul（基准 0.8 / 诗篇 0.6）——指数逼近保证速度曲线连续，不瞬变；
      // 全程无横移（全波 holdY 按出生偏移差异化 → 行程相等、同时越线，阵型保持）
      if (e.vNoHold) {
        if (e.y < holdY) {
          if (e.vy == null) e.vy = 0;
          e.vy += (descend - e.vy) * Math.min(1, dt * 12);
          e.y += e.vy * dt;
          return;
        }
        const tgt = descend * (e.vNoHoldSpdMul != null ? e.vNoHoldSpdMul : 0.8);
        e.vy += (tgt - e.vy) * Math.min(1, dt * 10);
        e.y += e.vy * dt;
        return;
      }
      if (e.holdTimer > 0) {
        // 停留倒数自生成即起算（与攻击倒数同口径）；下降至前锋停留线：接近时逐渐减速到 0（而非瞬间归零）
        // （速度地板 0.04：旧 0.12 地板会让机体带 ~17px/s 残速撞上吸附线，产生"微微卡顿"）
        e.holdTimer -= dt;
        if (e.y < holdY) {
          if (e.vy == null) e.vy = descend;
          const dist = holdY - e.y;
          const targetVy = dist >= 70 ? descend : descend * Math.max(0.04, dist / 70);
          e.vy += (targetVy - e.vy) * Math.min(1, dt * 12);
          e.y += e.vy * dt;
          if (dist <= 0.5) { e.y = holdY; e.vy = 0; }
        }
        // 停留期横摆（入位/冲锋无横移；各架独立相位）；横摆幅度 0.6s 缓入——到位瞬间无横向速度突变
        e.holdSwayT = (e.holdSwayT || 0) + dt;
        e.x += Math.sin(e.wobble) * 14 * Math.min(1, e.holdSwayT / 0.6) * dt;
        return;
      }
      // 冲锋启动：较短时间内从 0 平滑加速到冲锋速度（无横移）
      const charge = ((e.chargeBase != null ? e.chargeBase : 120) + (levelFlow.level - 1) * 5) * e.speedMul;
      if (e.vy == null) e.vy = 0;
      e.vy += (charge - e.vy) * Math.min(1, dt * 10);
      e.y += e.vy * dt;
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
    if (e.type === 'baoling' || e.type === 'baolingG' || e.type === 'unreal') {
      // 暴鸰 / 暴鸰·G / 虚幻：不悬停，径直下压；武装后进入索敌半径 → 停车锁定，锁定瞬间炸弹即脱离开始下坠（红圈预警照常倒计时 0.35s、与下坠并行）；投弹后停留 1.2s 再以 70% 速继续俯冲
      // （暴鸰·G 数值全部同暴鸰，仅移速 -15%、爆炸半径 +30%，见 BAOLING_G；
      //   虚幻各项数值与暴鸰等同、伤害 70%，见 UNREAL——armDelay/warnTime 等计时字段三机同值，读 BAOLING 即可）
      const BLC = e.type === 'baolingG' ? BAOLING_G : e.type === 'unreal' ? UNREAL : BAOLING;
      e.blT += dt;
      if (e.blPhase === 0) {
        e.y += BLC.speedSlow * e.speedMul * dt;
        if (e.blT >= BAOLING.armDelay && player.alive && e.y < player.y &&
            Math.hypot(e.x - player.x, e.y - player.y) <= BAOLING.triggerDist) {
          e.blPhase = 1;
          e.blWarn = { tx: player.x, ty: player.y, t: 0 };   // 预警区锁定玩家当前位置（不再跟踪）
          throwBaolingBomb(e);                               // 锁定瞬间炸弹即脱离开始下坠（三机同规则；预警圈照常倒计时 0.35s）
        }
        return;
      }
      if (e.blPhase === 1) {
        // 停车：预警倒计时（炸弹已在锁定瞬间脱离、正在下坠——见 phase 0）
        e.blWarn.t += dt;
        if (e.blWarn.t >= BAOLING.warnTime) {
          e.blPhase = 2;
          e.blWaitT = 0;
        }
        return;
      }
      if (e.blPhase === 2) {
        // 投弹后原地多停留 1.2s（postThrowWait），随后才继续俯冲
        e.blWaitT += dt;
        if (e.blWaitT >= BAOLING.postThrowWait) e.blPhase = 3;
        return;
      }
      e.y += BLC.speedPost * e.speedMul * dt;   // 投弹完毕：以炮艇 70% 速继续俯冲（出屏由通用检测移除）
      return;
    }
    if (e.type === 'douzhi' || e.type === 'sponsor' || e.type === 'sponsorDeluxe') {
      // 奖励无人机（斗志昂扬 / 赞助 / 豪华赞助）：横向匀速穿越，同时沿余弦曲线小幅上下浮动；
      // 不悬停、不攻击（出屏由通用检测移除）；赞助系移速 -20%、摆幅大幅降低（SPONSOR）
      const DC = e.type === 'douzhi' ? DOUZHI : SPONSOR;
      e.x += DC.speed * e.dirX * e.speedMul * dt;
      e.cosPhase += DOUZHI.freqY * dt;
      e.y = e.baseY + Math.sin(e.cosPhase) * DC.ampY;
      return;
    }
    if (e.type === 'pulseMatrix') {
      // 脉冲矩阵：侧翼持续横移（2026-10-02 移动逻辑改版）——登场 entrySpeed 在 1s 内二次缓出衰减到
      // 随机巡航速（50~60px/s，速度曲线连续无突变）；累计走过 travelPct×屏宽后于 brakeDist 缓冲内
      // 线性刹停（速度归零时恰好到停驻点，位置/速度均连续）；停驻后微微上下摆动（摆幅渐显）；
      // 本体自转全程持续（转速与法术矩阵等同）；不再自然离场——登场 20s 必入自爆流程（见下）
      // 登场存活计时：自爆由「登场」起算 20s（2026-10-02 由停驻起算改此；全模式生效——挑战/图鉴测试
      // 模式 holdTimer 1e9 永驻不再豁免，测试页同样能自爆）；17s/19s 起绘制层颤动预警
      e.pmAgeT = (e.pmAgeT || 0) + dt;
      if (e.pmAgeT >= PULSE_MATRIX.dwell) e.pmSelfDestruct = true;
      e.rot = (e.rot || 0) + (e.bodySpin || 0) * dt;
      if (e.leaving) {
        e.vy += (FASHI_MATRIX.speed * 1.2 - e.vy) * Math.min(1, dt * 6);   // 离场平滑加速
        e.y += e.vy * dt;
        return;
      }
      if (!e.arrived) {
        e.pmMoveT = Math.min(1, e.pmMoveT + dt);
        const k = 1 - e.pmMoveT;   // 1→0（二次缓出：前快后慢，1s 末速度恰为巡航速）
        const base = e.pmCruise + (PULSE_MATRIX.entrySpeed - e.pmCruise) * k * k;
        const remaining = CANVAS_W * PULSE_MATRIX.travelPct - e.pmTravel;
        const v = remaining <= PULSE_MATRIX.brakeDist
          ? base * Math.max(0, remaining / PULSE_MATRIX.brakeDist)   // 停驻缓冲：速度随剩余距离线性归零
          : base;
        const step = v * dt;
        e.x += e.dirX * step;
        e.pmTravel += step;
        if (e.pmTravel >= CANVAS_W * PULSE_MATRIX.travelPct) e.arrived = true;   // 归零段末速度≈0，无 snap
        return;
      }
      // 停驻：微微上下摆动（幅度随停驻时间渐显）
      if (e.pmBob) {
        e.bobT = (e.bobT || 0) + dt;
        e.y = e.pmBaseY + Math.sin(e.bobT * PULSE_MATRIX.bobFreq) * PULSE_MATRIX.bobAmp * Math.min(1, e.bobT / 1.2);
      }
      return;
    }
    if (e.type === 'warGhost') {
      // 战争幽灵状态机（相位见 spawnWarGhost）：白色风波预警 → 极速入场冲刺 → 抵达演出 →
      // 驻留摆动+技能循环 → 离场直线预警 → 加速斩出离场（出界由通用检测移除）。
      // 速度曲线铁律：入场 v = min(entrySpeed, k×剩余距离)（指数收敛、逐帧连续、无 snap）；
      // 悬停摆动全部 sin 项 t=0 偏移 0 + 幅度缓入；离场速度从 0 按固定加速度积分（≈0.46s 到满速），
      // 各相位切换处位置与速度严格连续
      if (e.wgPhase === 0) {
        // 入场风波预警：本体静驻屏外起点，仅推进预警计时（绘制见 09-draw-ships drawWarGhostWarns）；
        // 预警全部出现完毕后再停登场延迟（普通 entryDelay 0.35 / 真我 entryDelayRealme 0.25 / 诗篇 entryDelayPoem 0.1，
        // 2026-10-03 用户定稿三档各 -0.1/-0.2/-0.25s 再各 -0.05s）才冲刺——延迟期预警保持全显（绘制端 p 封顶 1）
        e.wgWarnT += dt;
        if (e.wgWarnT >= WAR_GHOST.entryWarn) {
          e.wgDelayT += dt;
          const wgDelayMax = isPoem() ? WAR_GHOST.entryDelayPoem : isRealme() ? WAR_GHOST.entryDelayRealme : WAR_GHOST.entryDelay;
          if (e.wgDelayT >= wgDelayMax) { e.wgPhase = 1; e.wgSpd = WAR_GHOST.entrySpeed; e.wgDashT = 0; }   // 屏外启动即巡航速，屏内速度曲线连续
        }
        return;
      }
      if (e.wgPhase === 1) {
        e.wgDashT += dt;   // 冲刺计时（09-draw-ships 相位 1 预警带透明度衔接用：0.36s 线性回升全亮）
        // 入场冲刺：全程 v = min(entrySpeed, k×剩余距离)——远离停留点保持巡航速，临近（k×dist < entrySpeed）
        // 后指数收敛；剩余距离 ≤ arriveLeadDist（= 预警圈半径 70×1.28 ≈ 89.6px，2026-10-02 用户定稿
        // 「碰触预警圈后就开始斩击」）即提前切入抵达演出——不停顿吸附，位置/速度连续交由 phase 2 滑行收敛，
        // 扫斩与末段滑行重叠
        const dx = e.wgStay.x - e.x, dy = e.wgStay.y - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        const v = Math.min(WAR_GHOST.entrySpeed, WAR_GHOST.entryDecelK * dist);
        const step = Math.min(v * dt, dist);
        e.x += dx / dist * step;
        e.y += dy / dist * step;
        if (dist - step < 1 || dist <= WAR_GHOST.arriveLeadDist) { e.wgPhase = 2; e.wgT = 0; }
        return;
      }
      if (e.wgPhase === 2) {
        // 抵达演出：两刃斩击扫转 + 金色爆发（绘制见 09-draw-ships drawWarGhostBody，纯演出不结算）；
        // 冲刺末段不停顿——演出期间沿用冲刺同一减速公式（v = min(entrySpeed, k×剩余距离)）滑行收敛到
        // 停留点（速度曲线逐帧连续无 snap），扫斩与滑行重叠；收敛到位吸附 + 震屏/粒子，
        // 演出计时到且收敛完成后进入驻留（双条件：滑行 40px 以 k=14 收敛 ≈0.3s < 演出 0.4s，几乎同时满足）
        const dx = e.wgStay.x - e.x, dy = e.wgStay.y - e.y;
        const dist = Math.hypot(dx, dy) || 0;
        let settled = dist < 1;
        if (!settled) {
          const v = Math.min(WAR_GHOST.entrySpeed, WAR_GHOST.entryDecelK * dist);
          const step = Math.min(v * dt, dist);
          e.x += dx / dist * step;
          e.y += dy / dist * step;
          if (dist - step < 1) {
            e.x = e.wgStay.x; e.y = e.wgStay.y;
            settled = true;
            e.wgSpd = 0;
            shake(5, 0.3);
            spawnParticles(e.x, e.y, '#ffd24a', 26, 260);
          }
        }
        e.wgT += dt;
        if (e.wgT >= WAR_GHOST.arriveFxDur && settled) { e.wgPhase = 3; e.wgT = 0; }
        return;
      }
      if (e.wgPhase === 3) {
        // 驻留：小幅低速摆动（sin 项 t=0 偏移 0 + 幅度 wobRamp 缓入，与抵达瞬间严格连续）；机头平滑追踪玩家
        e.wgT += dt;
        const ramp = Math.min(1, e.wgT / WAR_GHOST.wobRamp);
        e.x = e.wgStay.x + ramp * Math.sin(e.wgT * WAR_GHOST.wobFreqX) * WAR_GHOST.wobAmpX;
        e.y = e.wgStay.y + ramp * Math.sin(e.wgT * WAR_GHOST.wobFreqY) * WAR_GHOST.wobAmpY;
        if (player.alive && !(e.wgSkill && e.wgSkill.kind === 2 && e.wgSkill.locked)) {   // 技能2 锁定后机体停止转向（2026-10-01 用户定稿：斩线锁定即定格，机头不再跟随玩家旋转）
          const face = Math.atan2(player.y - e.y, player.x - e.x) - Math.PI / 2;
          const df = Math.atan2(Math.sin(face - e.wgFace), Math.cos(face - e.wgFace));
          e.wgFace += clamp(df, -2.5 * dt, 2.5 * dt);   // 最大转向角速度 2.5 rad/s（与破片 maxTurn 同量级，无瞬跳）
        }
        // 驻留倒计时（挑战模式 1e9 永驻）：结束 → 离场直线预警（中断未放完的技能，取消 scheduled 尾弹）
        e.wgDwellT -= dt;
        if (e.wgDwellT <= 0) {
          e.wgPhase = 4; e.wgT = 0; e.wgExit = null; e.wgSkill = null; e.wgSweepT = null;
          if (e.scheduled) e.scheduled.length = 0;
        }
        return;
      }
      if (e.wgPhase === 4) {
        // 离场直线预警：相位首帧锁定玩家所在直线方向（纯直线、无落点）；预警期间原地静止，
        // 机头以限速平滑转向离场方向（朝向为演出，斩出方向以 wgExit 为准）
        if (!e.wgExit) {
          const dx = player.x - e.x, dy = player.y - e.y;
          const l = Math.hypot(dx, dy) || 1;
          e.wgExit = { x: dx / l, y: dy / l };
        }
        const face = Math.atan2(e.wgExit.y, e.wgExit.x) - Math.PI / 2;
        const df = Math.atan2(Math.sin(face - e.wgFace), Math.cos(face - e.wgFace));
        e.wgFace += clamp(df, -2.5 * dt, 2.5 * dt);
        e.wgT += dt;
        if (e.wgT >= WAR_GHOST.exitWarn) { e.wgPhase = 5; e.wgSpd = 0; e.leaving = true; }   // leaving：停止攻击、出界移除
        return;
      }
      if (e.wgPhase === 5) {
        // 离场斩出：速度从 0 按固定加速度平滑积分到上限（≈0.46s 到满速），沿锁定直线加速直到出界
        e.wgSpd = Math.min(WAR_GHOST.exitMaxSpeed, e.wgSpd + WAR_GHOST.exitAccel * dt);
        e.x += e.wgExit.x * e.wgSpd * dt;
        e.y += e.wgExit.y * e.wgSpd * dt;
      }
      return;
    }
    if (e.elPhase != null) {
      // 4S 精英（狞笑朴学峰 / 猩红韩希先 / 铜皮夏勇 / 暴怒辛国栋，黑暗之手麾下）共用移动骨架
      //（相位见 04-spawn spawnEliteMinion）：顶部入场微速滑入驻留点 → 驻留小幅摆动+技能循环 →
      // 加速下压离场（挑战模式 1e9 永驻不离场）。
      // 速度曲线铁律：入场 v = 恒速直冲 → 匀减速至 entryEndSpd 微速维持（不彻底刹停）→ 切驻留时摆动幅度
      // 以 elWobR0 初值起步（入场 ≈wobRamp0 与末速匹配、低速路径 0 缓入）——速度大小全程连续无停顿（2026-10-02
      // 平滑化）；贯穿/下砸/掠过从静止启动均先按固定时长平滑升速（0.2~0.25s）再进入
      // 巡航/收敛段；悬停摆动全部 sin 项 t=0 偏移 0 + 幅度缓入；技能内移动相位 10~15/20~21/32/40，41 为通用归位
      const c = ELITES[e.type];
      if (e.elSkill) e.elSkill.t += dt;   // 技能计时全局推进（驻留技能由 advanceEliteSkill 消费、移动类技能由下方相位消费）
      // 朴学峰机头朝向：素材默认机头朝下（rot=0 即朝下悬停）——机头 = 冲刺方向需 rot = 冲刺角 - π/2
      //（冲①竖直向下 rot=0 即素材原样），低通以最短角差逼近（≈0.2s 过渡、无 ±π 瞬跳），其余相位回正
      if (e.type === 'puxuefeng') {
        let rotTgt = 0;
        if (e.elPhase === 12 || e.elPhase === 13 || e.elPhase === 14 || e.elPhase === 15) {
          rotTgt = e.elSkill.ang - Math.PI / 2;   // 冲②横向 / 冲③斜向（冲①向下 = rot 0 素材原样）
        }
        let rd = rotTgt - (e.elRot || 0);
        rd = Math.atan2(Math.sin(rd), Math.cos(rd));
        e.elRot = (e.elRot || 0) + rd * Math.min(1, 12 * dt);
      }
      if (e.elPhase === 0) {
        // 入场：恒速 entrySpeed 直冲 → 剩余刹车段内匀减速（v = clamp(√(2a×剩余距离), entryEndSpd, v0)，
        // a = v0/T 恒定）→ 保持 entryEndSpd≈45px/s 微速走完最后一小段（不彻底刹停，2026-10-02 用户反馈
        // 「刹停再启动很奇怪」），到位吸附（<1.5px）切驻留、摆动幅度以 wobRamp0 初值起步（速度大小与
        // 摆动初速匹配 ≈44px/s，无停顿重启；≈1.0s 平滑减速替代旧指数收敛的「前猛急刹 + 末段拖尾爬行」）
        const dx = e.elStay.x - e.x, dy = e.elStay.y - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        const a = ELITES.entrySpeed / ELITES.entryBrakeT;
        const v = clamp(Math.sqrt(2 * a * dist), ELITES.entryEndSpd, ELITES.entrySpeed);
        const step = Math.min(v * dt, dist);
        e.x += dx / dist * step;
        e.y += dy / dist * step;
        if (dist - step < 1.5) {
          e.x = e.elStay.x; e.y = e.elStay.y; e.elPhase = 1; e.elT = 0;
          e.elWobR0 = ELITES.wobRamp0;   // 入场切入：摆动幅度初值非 0（速度大小连续、不停顿）
          e.elRiseY = 0;   // 诗篇辛国栋导弹齐射上移偏移清零（重入场从驻留高度重新起算）
        }
        return;
      }
      if (e.elPhase === 1) {
        // 驻留：小幅低速摆动（sin 项 t=0 偏移 0 + 幅度缓入，与到位瞬间严格连续）；
        // 幅度初值 elWobR0：入场路径 ≈0.7（衔接入场末速）、归位/轰炸收口等低速路径 = 0（旧缓入行为）
        e.elT += dt;
        // 夏勇驻留水平追踪（2026-10-03 用户定稿：始终尝试移动至玩家水平位置）：elStay.x 朝玩家 x
        //（限横向安全边距）低通逼近——速度 = clamp(trackK×剩余距离, 0, trackMax) 经 xyTrackV
        // 低通（≈0.3s 过渡）双重平滑，玩家阵亡/已对齐时缓停（vWant=0）；摆动叠加其上，位置严格连续
        if (e.type === 'xiayong') {
          const tx = clamp(player.alive ? player.x : e.elStay.x,
            CANVAS_W * ELITES.stayXMargin, CANVAS_W * (1 - ELITES.stayXMargin));
          const ddx = tx - e.elStay.x;
          const vWant = Math.abs(ddx) < 2 ? 0
            : Math.sign(ddx) * Math.min(ELITES.xiayong.trackK * Math.abs(ddx), ELITES.xiayong.trackMax);
          e.xyTrackV = (e.xyTrackV || 0) + (vWant - (e.xyTrackV || 0)) * Math.min(1, 3.5 * dt);
          e.elStay.x += e.xyTrackV * dt;
        } else if (e.type === 'puxuefeng' || e.type === 'hanxixian' || e.type === 'xinguodong') {
          // 朴/韩/辛驻留水平追踪（2026-10-04 用户定稿）：恒速 hTrackSpd=20px/s 向玩家水平位置低通逼近
          //（xyTrackV 低通 ≈0.3s 过渡起步/停止，起步加速、对齐/玩家阵亡缓停——速度连续无瞬跳）
          const tx = clamp(player.alive ? player.x : e.elStay.x,
            CANVAS_W * ELITES.stayXMargin, CANVAS_W * (1 - ELITES.stayXMargin));
          const ddx = tx - e.elStay.x;
          const vWant = Math.abs(ddx) < 2 ? 0 : Math.sign(ddx) * ELITES.hTrackSpd;
          e.xyTrackV = (e.xyTrackV || 0) + (vWant - (e.xyTrackV || 0)) * Math.min(1, 3.5 * dt);
          e.elStay.x += e.xyTrackV * dt;
        }
        const r0 = e.elWobR0 || 0;
        const ramp = r0 + (1 - r0) * Math.min(1, e.elT / ELITES.wobRamp);
        // 诗篇·辛国栋导弹齐射上移（2026-10-04 用户定稿，登记《诗篇难度修正.md》#31）：齐射进行中整体
        // 上移 poemRisePct 屏高，技能收口后低通回落（poemRiseK 1.5/s ≈0.67s 时间常数，约 10% 屏高 ≈2s
        // 平滑完成——2026-10-04 二次定稿放缓，原 3；偏移叠加在摆动 y 上，位置全程连续无瞬跳）
        if (isPoem() && e.type === 'xinguodong') {
          const riseTgt = (e.elSkill && e.elSkill.kind === 2) ? -CANVAS_H * c.poemRisePct : 0;
          e.elRiseY = (e.elRiseY || 0) + (riseTgt - (e.elRiseY || 0)) * Math.min(1, c.poemRiseK * dt);
        }
        e.x = e.elStay.x + ramp * Math.sin(e.elT * ELITES.wobFreqX) * ELITES.wobAmpX;
        e.y = e.elStay.y + ramp * Math.sin(e.elT * ELITES.wobFreqY) * ELITES.wobAmpY + (e.elRiseY || 0);
        // 驻留倒计时（挑战模式 1e9 永驻）：结束 → 离场（中断未放完的技能，取消 scheduled 尾弹）
        e.elDwellT -= dt;
        if (e.elDwellT <= 0) {
          e.elPhase = 2; e.elSpd = 0; e.elSkill = null; e.elRemnant = null; e.xyBlades = null; e.xyOrbs = null; e.xyBarOn = false;
          if (e.scheduled) e.scheduled.length = 0;
        }
        return;
      }
      if (e.elPhase === 2) {
        // 离场：速度从 0 按 leaveAccel 平滑积分到上限（≈1.1s 到满速），径直下压出界（通用检测移除）
        e.elSpd = Math.min(ELITES.leaveMax, e.elSpd + ELITES.leaveAccel * dt);
        e.y += e.elSpd * dt;
        return;
      }
      if (e.elPhase === 10) {
        // 朴学峰·流星穿刺 冲①预警（竖直）：本体原地静驻（不向玩家对齐），区域自上而下展开；
        // 展开完成瞬间 → 冲①出发 + 锁冲②几何 + 预警②立刻开始（warn2T 自此刻累计）
        e.elT += dt;
        // 首冲触发 = pierceWarn + 难度增量（2026-10-04 用户定稿）：虚象 +0.3 / 具象 +0.2 / 真我 +0.1 / 诗篇 +0
        const fw = c.pierceWarn + (isPoem() ? 0
          : isRealme() ? c.realmeFirstWarnAdd
          : currentDifficulty.id === 'form' ? c.formFirstWarnAdd : c.firstWarnAdd);
        if (e.elT >= fw) {
          const px = player.alive ? player.x : CANVAS_W / 2;
          e.elSkill.hAng = px >= CANVAS_W / 2 ? 0 : Math.PI;   // 玩家在右半屏则从左向右冲，反之对侧
          e.elSkill.w2 = {
            x: e.elSkill.hAng === 0 ? -80 : CANVAS_W + 80,
            y: clamp(player.alive ? player.y : CANVAS_H * 0.6, 60, CANVAS_H - 60),
            ang: e.elSkill.hAng,
          };
          e.elSkill.warn2T = 0;
          e.elPhase = 11; e.elT = 0; e.elSpd = 0;
        }
        return;
      }
      if (e.elPhase >= 11 && e.elPhase <= 14) {
        // 预警链并行推进（11~14 全相位）：warn2T 自冲①出发起累计；warn2T 达 reWarn 的瞬间锁冲③几何
        //（预警③立刻出现，warn3T 起计）——两区域各自保持全亮至对应冲刺出发（绘制层 min 封顶）
        if (e.elSkill.warn2T != null) {
          e.elSkill.warn2T += dt;
          if (!e.elSkill.w3 && e.elSkill.warn2T >= c.pierceReWarn) {
            // 锁冲③（斜向）：起点固定在屏高 30%~50% 带的屏外贴边侧（起点侧随横穿方向衔接——向右穿完从
            // 右侧屏外斜进、反之左侧），终点固定为对侧底角（左下/右下角），冲刺方向指向该底角；
            // 行程 = 起点→底角直线距离；冲③行进至 80% 行程处留残像（残像换影并入冲③尾部——2026-10-02 用户定稿）
            const rightRun = e.elSkill.hAng === 0;   // 冲②是否向右
            const sx = rightRun ? CANVAS_W + 80 : -80;
            const sy = CANVAS_H * rand(0.3, 0.5);
            const ex = rightRun ? 0 : CANVAS_W;      // 对侧底角（左下/右下）
            e.elSkill.w3 = { x: sx, y: sy, ang: Math.atan2(CANVAS_H - sy, ex - sx) };
            e.elSkill.slopeTotal = Math.hypot(ex - sx, CANVAS_H - sy);   // 起点→底角行程（kind=1 走完归位）
            e.elSkill.warn3T = 0;
          }
        }
        if (e.elSkill.warn3T != null) e.elSkill.warn3T += dt;
        // 冲刺分派：0.25s 平滑升速到 pierceSpeed（位置连续）+ 行程累计（升速段也计入，收口按实际距离不漂移）
        // 贯穿速度按难度（2026-10-03 用户定稿）：虚象/具象 1107（-25%），真我/诗篇 1476（realmePierceSpeed）
        if (e.elPhase === 11 || e.elPhase === 13) {
          const pSpd = (isPoem() || isRealme()) ? c.realmePierceSpeed : c.pierceSpeed;
          e.elSpd = Math.min(pSpd, e.elSpd + pSpd * 4 * dt);
          e.x += Math.cos(e.elSkill.ang) * e.elSpd * dt;
          e.y += Math.sin(e.elSkill.ang) * e.elSpd * dt;
          e.elSkill.dist += e.elSpd * dt;
          if (e.elPhase === 11 && e.y > CANVAS_H + 80) {
            // 冲①完毕（出屏底）→ 本体屏外瞬移至冲②贴边起点 → pierceGap 后出发（冲间间隔）
            e.x = e.elSkill.w2.x; e.y = e.elSkill.w2.y; e.elSkill.ang = e.elSkill.w2.ang;
            e.elSkill.dist = 0; e.elPhase = 12; e.elT = 0; e.elSpd = 0;
          } else if (e.elPhase === 13 && e.elSkill.dist >= CANVAS_W + 160) {
            // 冲②完毕（贴边起点走完全程）→ 瞬移冲③起点 → pierceGap 后出发
            e.x = e.elSkill.w3.x; e.y = e.elSkill.w3.y; e.elSkill.ang = e.elSkill.w3.ang;
            e.elSkill.dist = 0; e.elPhase = 14; e.elT = 0; e.elSpd = 0;
          }
        } else {
          // 相位 12/14：冲间间隔等待（pierceGap，预警区域持续显示）
          e.elT += dt;
          if (e.elT >= c.pierceGap) { e.elPhase = e.elPhase + 1; e.elT = 0; e.elSpd = 0; }
        }
        return;
      }
      if (e.elPhase === 15) {
        // 冲③（斜冲：屏高 30%~50% 带一侧屏外 → 对侧底角并冲出屏底）——行进至 80% 行程处时在原位留下
        // 残像（残像换影并入冲③尾部：本体不隐匿、继续冲完；残像 afterT=0.7s 后由 advanceEliteMinions
        // 爆开收口 = 流星穿刺技能收口点），冲出屏幕底部后本体重入：瞬移停留点正上方屏外 → 相位 0 重新入场归位
        const pSpd = (isPoem() || isRealme()) ? c.realmePierceSpeed : c.pierceSpeed;
        e.elSpd = Math.min(pSpd, e.elSpd + pSpd * 4 * dt);
        e.x += Math.cos(e.elSkill.ang) * e.elSpd * dt;
        e.y += Math.sin(e.elSkill.ang) * e.elSpd * dt;
        e.elSkill.dist += e.elSpd * dt;
        if (!e.elSkill.remnantDone && e.elSkill.dist >= e.elSkill.slopeTotal * 0.8) {
          // 行进至 80% 行程处留下残像（位置不变，用户指定）；残像朝向 = 冲刺朝向（rot = 冲刺角 - π/2，与机头一致）
          e.elRemnant = { x: e.x, y: e.y, t: 0, rot: e.elSkill.ang - Math.PI / 2 };
          e.elSkill.remnantDone = true;   // 只留一次（高速下单帧越过判定带，防重复创建）
        }
        if (e.y > CANVAS_H + 80) {
          // 冲③冲出屏幕底部 → 本体瞬移至停留点正上方屏外，从场地上方重新入场（相位 0 指数减速归位，
          // 与首次入场同款速度曲线）；瞬移两端均在屏外不可见（drawEliteBody 对屏外冲刺段不绘制本体）
          e.x = e.elStay.x; e.y = -80; e.elSpd = 0; e.elPhase = 0;
        }
        return;
      }
      if (e.elPhase === 40) {
        // 辛国栋·地毯轰炸 对齐段（真我/诗篇走此段；虚象/具象扫射直接进相位 42）：持续追踪玩家当前
        // 水平位置（实时 player.x，非释放瞬间快照），剩余 <14px 提前进入投弹段；
        // 目标速度 = min(slideSpeed, alignK×剩余距离)、6/s 低通逼近（无瞬跳）
        e.elT += dt;
        const dx = player.x - e.x;
        const dist = Math.abs(dx) || 1;
        const vT = Math.min(c.slideSpeed, c.alignK * dist) * (dx < 0 ? -1 : 1);
        e.elSpd += (vT - e.elSpd) * Math.min(1, 6 * dt);
        const step = Math.min(Math.abs(e.elSpd) * dt, dist);
        e.x += (dx < 0 ? -1 : 1) * step;
        if (dist < 14 || e.elT >= c.alignDur) {
          // 进入投弹段：带符号速度无缝延续（投弹段同款追踪公式）
          e.elSkill.dropT = 0;
          e.elT = 0;
          e.elPhase = 42;
        }
        return;
      }
      if (e.elPhase === 42) {
        // 辛国栋·地毯轰炸 投弹段（2026-10-04 用户定稿改版）：虚象/具象 = 扫射（sweep，见下方分支）；
        // 真我/诗篇 = 原逻辑——继续追踪玩家水平位置（同对齐段公式），dropIv 节拍连续投弹——
        // 每一发落点 = 本体正下方（e.x）× 投放瞬间玩家所在高度（玩家死亡回退释放瞬间 lockY），
        // 投弹特效 = 脱离火星（亮红 ×12 + 深红 ×8——黑红主题化，2026-10-03 用户定稿；暴鸰扔炸弹仍为金/橙原版）；
        // 投满弹数（真我 6 / 诗篇 7）→ 原地驻留收口
        e.elT += dt;
        const s = e.elSkill;
        if (s.sweep) {
          // 虚象/具象扫射：朝锁定方向（朝玩家那一刻的水平方向）匀速横移（elSpd 6/s 低通，≈0.25s
          // 起步过渡到 slideSpeed，速度连续），dropIv 节拍持续投弹——每发落点 = 本体当前所在位置
          // 正下方（e.x）× 释放瞬间锁定的玩家竖直高度（s.lockY，2026-10-04 终版定稿：水平实时
          // 随本体、竖直锁定不变——横移沿路径铺弹成带），直到本体撞边界（钳位 e.w/2）即收口
          const vT = c.slideSpeed * s.sweepDir;
          e.elSpd += (vT - e.elSpd) * Math.min(1, 6 * dt);
          e.x += e.elSpd * dt;
          if (e.x < e.w / 2) e.x = e.w / 2;
          if (e.x > CANVAS_W - e.w / 2) e.x = CANVAS_W - e.w / 2;
          s.dropT += dt;
          while (s.dropT >= c.dropIv) {
            s.dropT -= c.dropIv;
            s.dropped++;
            e.xgBombs.push({ x: e.x, y: s.lockY, t: 0, first: s.dropped === 1 });
            spawnParticles(e.x, e.y + 16, '#ff4652', 12, 220);   // 脱离火星（亮红）
            spawnParticles(e.x, e.y + 16, '#a11226', 8, 160);
          }
          if ((s.sweepDir < 0 && e.x <= e.w / 2 + 0.5) || (s.sweepDir > 0 && e.x >= CANVAS_W - e.w / 2 - 0.5)) {
            // 撞边界 → 原地驻留收口（同投满路径：驻留点 x/y 均同步为当前位置，摆动从 0 缓入，位置严格
            // 连续——elStay.y 必须一并同步：技能期间 y 冻结在离开相位 1 时的摆动偏移上（最大 ±wobAmpY
            // ≈3% 屏高），不同步则收口重启摆动 t=0（偏移归 0）时纵向瞬跳——2026-10-04 用户反馈修复）
            e.elStay.x = e.x;
            e.elStay.y = e.y;
            e.elPhase = 1; e.elT = 0; e.elSpd = 0;
            e.elWobR0 = 0;   // 低速切入：摆动从 0 幅度缓入
            e.elSkill = null; e.elGapT = eliteSkillGap(e);
          }
          return;
        }
        const bombN = isPoem() ? c.poemBombN : isRealme() ? c.realmeBombN : c.bombN;
        const dx = player.x - e.x;
        const dist = Math.abs(dx) || 1;
        const vT = Math.min(c.slideSpeed, c.alignK * dist) * (dx < 0 ? -1 : 1);
        e.elSpd += (vT - e.elSpd) * Math.min(1, 6 * dt);
        const step = Math.min(Math.abs(e.elSpd) * dt, dist);
        e.x += (dx < 0 ? -1 : 1) * step;
        s.dropT += dt;
        while (s.dropT >= c.dropIv && s.dropped < bombN) {
          s.dropT -= c.dropIv;
          s.dropped++;
          // first = 每轮地毯轰炸的首枚弹：绘制层画大范围收缩强调圈（预警更明显；转存残留弹保留标记，绘制共用）
          e.xgBombs.push({ x: e.x, y: player.alive ? player.y : s.lockY, t: 0, first: s.dropped === 1 });
          spawnParticles(e.x, e.y + 16, '#ff4652', 12, 220);   // 脱离火星（亮红）
          spawnParticles(e.x, e.y + 16, '#a11226', 8, 160);
        }
        if (s.dropped >= bombN) {
          // 轰炸结束原地驻留（不飘回原驻留点——用户要求 2026-10-01）：驻留点 x/y 均同步为当前位置，
          // 摆动 ramp 从 0 缓入保持位置严格连续（elStay.y 同步防纵向摆动偏移瞬跳——同撞边界收口，
          // 2026-10-04 用户反馈修复）；收口同通用归位吸附（清技能 + 技能间隔计时，
          // 投弹全程追踪玩家故收尾时通常已贴近玩家正上方、速度低，直停自然）
          e.elStay.x = e.x;
          e.elStay.y = e.y;
          e.elPhase = 1; e.elT = 0; e.elSpd = 0;
          e.elWobR0 = 0;   // 低速切入：摆动从 0 幅度缓入（旧行为）
          e.elSkill = null; e.elGapT = eliteSkillGap(e);
        }
        return;
      }
      if (e.elPhase === 41) {
        // 通用归位：目标速度 = min(elRetSpd, elRetK×剩余距离)，当前速度以 6/s 指数逼近目标
        //（出屏高速回场 / 冲击后升回均平滑衔接、无速度瞬变）；到位吸附 → 驻留（摆动 t=0 重起，位置严格连续）
        const dx = e.elStay.x - e.x, dy = e.elStay.y - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        const vT = Math.min(e.elRetSpd, e.elRetK * dist);
        e.elSpd += (vT - e.elSpd) * Math.min(1, 6 * dt);
        const step = Math.min(e.elSpd * dt, dist);
        e.x += dx / dist * step;
        e.y += dy / dist * step;
        if (dist - step < 1) {
          e.x = e.elStay.x; e.y = e.elStay.y;
          e.elPhase = 1; e.elT = 0; e.elSpd = 0; e.elWobR0 = 0;   // 低速切入：摆动从 0 幅度缓入
          e.elRiseY = 0;   // 归位吸附已把 y 拉回 elStay.y，偏移同步清零（净位移 0，无瞬跳）
          e.elSkill = null; e.elGapT = eliteSkillGap(e);
        }
        return;
      }
      return;   // 其余技能内相位兜底（不应到达）
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
          // 两段巡航（不真正停留）：上 25% 屏高线以上 200，越过（y ≥ CANVAS_H × 0.25）后 140——
          // 以 cruiseAccel 低率平滑切换，速度曲线连续无瞬变
          const cruise = e.y < CANVAS_H * 0.25 ? FASHI_A1.entrySpeed : FASHI_A1.speed;
          e.vx += (0 - e.vx) * Math.min(1, dt * acc);
          e.vy += (cruise - e.vy) * Math.min(1, dt * FASHI_A1.cruiseAccel);
          // 入场横移（2026-09 批次）：60% 概率在下坠越过 15%~20% 屏高触发线时水平横移一次（每架至多一次）
          if (!e.fa1EntryDone && e.fa1EntryStrafe && e.y >= (e.fa1EntryTrigY || 0)) {
            e.fa1EntryDone = true;
            fa1StartStrafe(e);
            break;
          }
          if (e.entryT >= (e.fa1FirstAt != null ? e.fa1FirstAt : FASHI_A1.firstDelay[0])) {
            e.fa1FireTimer -= dt * enemyFieldFireMul(e);   // 奖励道具·寒霜发生器：力场内射速 -60%（BOSS 减半）
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
              fa1StartStrafe(e);
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
            e.fa2FireTimer -= dt * enemyFieldFireMul(e);   // 奖励道具·寒霜发生器：力场内射速 -60%（BOSS 减半）
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
          e.fa2FireTimer -= dt * enemyFieldFireMul(e);   // 奖励道具·寒霜发生器：力场内射速 -60%（BOSS 减半）
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
      return;
    }
    if (e.type === 'jiaoxiang') {
      // 焦香螺旋桨：全程速度积分驱动（位置连续变化，杜绝切换闪动/状态重置）；
      // 入场朝目标点逼近 → 绕圈用"切向绕行 + 径向弹簧"收敛到随机圆（含轻微随机漂移）
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
        // 绕圈阶段：切向绕行 + 径向弹簧收敛到半径 R。
        // （不再用"圆心角引导点"追踪：切入后机体一旦被带入圆内，引导点方向随圆心角剧变、
        //   期望速度逐帧甩鞭 = 下移段的卡顿瞬移；切向+径向分解在圆内/圆外/圆心附近全部稳定）
        const rx = e.x - cx, ry = e.y - cy;
        const rl = Math.hypot(rx, ry) || 1;
        const nx2 = rx / rl, ny2 = ry / rl;                        // 径向单位向量（外向）
        const tgx = -ny2 * e.jxOrbitDir, tgy = nx2 * e.jxOrbitDir; // 切向单位向量（绕行方向）
        const corr = clamp((rl - R) * 2.2, -80, 80);               // 径向修正：偏离 R 越远回拉越强（限幅 ±80）
        const jr = Math.min(1, dt * JIAOXIANG.jitterRate);
        e.jxJitX += (rand(-1, 1) * JIAOXIANG.jitter - e.jxJitX) * jr;
        e.jxJitY += (rand(-1, 1) * JIAOXIANG.jitter - e.jxJitY) * jr;
        wantVx = tgx * spd * JIAOXIANG.orbitSpeedMul + nx2 * corr + e.jxJitX;
        wantVy = tgy * spd * JIAOXIANG.orbitSpeedMul + ny2 * corr + e.jxJitY;
      }
      // 速度平滑转向（限制角速度 → 速度曲线连贯无突变）+ 位置积分（连续，绝不跳变）
      const turn = Math.min(1, dt * JIAOXIANG.turnRate);
      e.vx += (wantVx - e.vx) * turn;
      e.vy += (wantVy - e.vy) * turn;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      // 绕圈阶段硬性边框约束（轨迹不出边框；入场阶段不 clamp 以免挡住屏外入场）；
      // 触界时同步消去朝外速度分量——否则贴边界持续夹取会呈现逐帧瞬跳（下移贴近屏底时尤甚）
      if (e.jxPhase === 1) {
        const nx = clamp(e.x, e.w / 2, CANVAS_W - e.w / 2);
        const ny = clamp(e.y, e.h / 2, CANVAS_H - e.h / 2);
        if (nx !== e.x) e.vx = 0;
        if (ny !== e.y) e.vy = 0;
        e.x = nx; e.y = ny;
      }
      return;
    }
    if (e.type === 'popian' || e.type === 'popianU') {
      // 破片：登场计时（碰撞分段 + 索敌增长）→ 直线飞向选定点 → 到位急停锁停（除非被击毁不再移动）
      // 破片U型：同移动流程，差异——① 入场途中即旋转瞄准玩家（不对齐飞行方向，尾焰随移动方向绘制）；
      // ② 无需锁停即可攻击（首攻延迟 = 入场后 atkT 1.8~2s 随机，诗篇 1.6~2s，见 POPIAN_U）
      e.entryT += dt;
      // 索敌范围随时间增长（30% 屏高起步、每秒 +5% 屏高，封顶 detectMax）——体现为攻击范围增大
      e.detectR = Math.min(CANVAS_H * POPIAN.detectMax,
        CANVAS_H * (POPIAN.detectBase + POPIAN.detectGrow * e.entryT));
      if (!e.arrived) {
        const dx = e.tpX - e.x, dy = e.tpY - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        // 战争幽灵光环：移速 ×2、加速度（速度逼近率）×2（+100%）——两者同步乘算，高速下仍能精确停进落点
        const aura = warGhostAura(), auraAcc = warGhostAuraAcc();
        const spd = POPIAN.speed * e.speedMul * aura;
        // 速度曲线：临近落点在 brakeDist 内较快减速到 0（减速略微放缓：20px 制动段 + 20/s 逼近率，仍无明显滑行）
        const brakeDist = 20;
        const wantSpd = dist >= brakeDist ? spd : spd * Math.max(0, dist / brakeDist);
        const tvx = dx / dist * wantSpd, tvy = dy / dist * wantSpd;
        e.vx += (tvx - e.vx) * Math.min(1, dt * 20 * auraAcc);
        e.vy += (tvy - e.vy) * Math.min(1, dt * 20 * auraAcc);
        e.x += e.vx * dt; e.y += e.vy * dt;
        // 飞行朝向：破片减速前机身对齐速度方向、进入减速（dist < brakeDist）才启动转向玩家——
        // 带初始角速度 brakeTurn0，随剩余距离线性加速（恒角加速度），抵达时达到满角速度 maxTurn；
        // U型全程直接以满角速度 maxTurn 旋转瞄准玩家（转向全程有 clamp 角速度限制，无瞬跳）
        if (e.type === 'popianU') {
          // 红圈预警 / 三连发期间头部冻结（预警中心已锁定，直到射击完毕不再转动）
          if (!e.warn && !e.popBurst) {
            const face = Math.atan2(player.y - e.y, player.x - e.x) - Math.PI / 2;
            const df = Math.atan2(Math.sin(face - e.faceAng), Math.cos(face - e.faceAng));
            e.faceAng += clamp(df, -POPIAN.maxTurn * dt, POPIAN.maxTurn * dt);
          }
        } else if (dist < brakeDist) {
          const p = clamp(1 - dist / brakeDist, 0, 1);
          const omega = POPIAN.brakeTurn0 + (POPIAN.maxTurn - POPIAN.brakeTurn0) * p;
          const face = Math.atan2(player.y - e.y, player.x - e.x) - Math.PI / 2;
          const df = Math.atan2(Math.sin(face - e.faceAng), Math.cos(face - e.faceAng));
          e.faceAng += clamp(df, -omega * dt, omega * dt);
        } else {
          const face = Math.atan2(e.vy, e.vx) - Math.PI / 2;
          const dfly = Math.atan2(Math.sin(face - e.faceAng), Math.cos(face - e.faceAng));
          e.faceAng += clamp(dfly, -POPIAN.maxTurn * dt, POPIAN.maxTurn * dt);
        }
        if (dist <= 1.5 || wantSpd < 5) {
          // 到位：锁停（位置吸附、速度归零）；破片停稳后才可攻击（重置首次攻击延迟 firstDelay），
          // U型 atkT 自入场即计时（spawnPopian 设初值）、到位时不重置
          e.x = e.tpX; e.y = e.tpY; e.vx = 0; e.vy = 0;
          e.arrived = true;
          if (e.type !== 'popianU') e.atkT = POPIAN.firstDelay;
        }
      } else {
        // 锁停后原地小幅漂移：全部 sin 项（t=0 时偏移为 0）+ 幅度 1.5s 缓入——与锁停瞬间严格连续，无初值跳变；
        // 头部平滑转向玩家方向（预警 / 三连发期间冻结，见下）
        e.driftT = (e.driftT || 0) + dt;
        const ramp = Math.min(1, e.driftT / 1.5);
        e.x = e.tpX + ramp * (Math.sin(e.driftT * 0.8) * 9 + Math.sin(e.driftT * 2.3) * 4);
        e.y = e.tpY + ramp * (Math.sin(e.driftT * 1.1) * 7 + Math.sin(e.driftT * 2.9) * 3);
        // 红圈预警 / 三连发期间头部冻结——预警中心已锁定，直到射击完毕不再转向玩家
        if (!e.warn && !e.popBurst) {
          const face = Math.atan2(player.y - e.y, player.x - e.x) - Math.PI / 2;
          const df = Math.atan2(Math.sin(face - e.faceAng), Math.cos(face - e.faceAng));
          e.faceAng += clamp(df, -POPIAN.maxTurn * dt, POPIAN.maxTurn * dt);
        }
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
      if (e.burstDur && (e.burstT || 0) < e.burstDur) {   // 被爆发震出的飞离位移（脉冲矩阵自爆分裂）：easeOut 二次缓出、
        e.burstT = Math.min(e.burstDur, (e.burstT || 0) + dt);   // 增量法逐帧推进（每帧位移连续、末速归零停稳，速度曲线铁律）
        const q = e.burstT / e.burstDur;
        const ease = 1 - Math.pow(1 - q, 2);
        e.x += (e.burstDx || 0) * (ease - (e.burstLastEase || 0));
        e.y += (e.burstDy || 0) * (ease - (e.burstLastEase || 0));
        e.burstLastEase = ease;
      }
      const spd = FASHI_MATRIX.speed * e.speedMul;
      const acc = FASHI_MATRIX.accel;
      if (e.mxPhase === 0) {
        // 入场下降：初速 280 在 entryDecay 内衰减到巡航 160；临近停留高度（末 60px）快速减速到 40——
        // 到达 hoverY 时速度已是乱动速度，相位切换无任何速度突变
        const t = Math.min(1, e.entryT / FASHI_MATRIX.entryDecay);
        const cruise = FASHI_MATRIX.entrySpeed + (spd - FASHI_MATRIX.entrySpeed) * t;
        const dist = e.hoverY - e.y;
        const brake = 60;
        const target = dist < brake
          ? FASHI_MATRIX.wanderSpd + (cruise - FASHI_MATRIX.wanderSpd) * Math.max(0, dist / brake)
          : cruise;
        e.vx += (0 - e.vx) * Math.min(1, dt * acc);
        e.vy += (target - e.vy) * Math.min(1, dt * acc);
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (e.y >= e.hoverY) {
          // 到达 30%~50% 停留带即切入随机移动（速度已 ≈40）；首个目标点首帧抽取
          e.mxPhase = 1; e.arrived = true; e.wanderT = 0;
          e.wanderRetarget = 0; e.wanderTX = null; e.wanderTY = null;
        }
        return;
      }
      if (e.mxPhase === 1) {
        // 胡乱移动（带内随机目标点漫游）：随机抽目标点，以 wanderSpd 限速转向走过去，
        // 抵达（≤6px）或超时（1.5~2.6s）后换下一个点——无回拉墙、无方向瞬跳，各机独立漫游不汇聚；
        // 到位速度已在下降段减速到 wanderSpd（无到达急刹）。
        // 爆散分裂体（burstDx/Dy 存在，如脉冲矩阵自爆分裂）：出生在全局停留带之外（60%~80% 屏高带），
        // 目标点与 y 边界全部锚定出生点「就地游走」——若按常规全局停留带抽点/夹紧，切相位首帧会被
        // clamp 硬拉回 20%~40% 屏高带（单帧瞬移 ~270px，2026-10-02 修复）
        const splitSpawn = e.burstDur != null;
        e.wanderT += dt;
        if (e.wanderTX == null || e.wanderT >= e.wanderRetarget ||
            Math.hypot(e.wanderTX - e.x, e.wanderTY - e.y) < 6) {
          e.wanderTX = splitSpawn
            ? clamp(e.x + rand(-80, 80), 60, CANVAS_W - 60)
            : rand(50, CANVAS_W - 50);
          e.wanderTY = splitSpawn
            ? clamp(e.hoverY + rand(-80, 80), 80, CANVAS_H - 90)
            : rand(CANVAS_H * FASHI_MATRIX.hoverTopPct + 8, CANVAS_H * FASHI_MATRIX.hoverBotPct - 8);
          e.wanderRetarget = e.wanderT + rand(1.5, 2.6);
        }
        const wdx = e.wanderTX - e.x, wdy = e.wanderTY - e.y;
        const wdl = Math.hypot(wdx, wdy) || 1;
        let wantVx = wdx / wdl * FASHI_MATRIX.wanderSpd;
        let wantVy = wdy / wdl * FASHI_MATRIX.wanderSpd;
        const minX = e.w / 2 + 12, maxX = CANVAS_W - e.w / 2 - 12;
        const minY = splitSpawn ? 80 : CANVAS_H * FASHI_MATRIX.hoverTopPct;
        const maxY = splitSpawn ? CANVAS_H - 90 : CANVAS_H * FASHI_MATRIX.hoverBotPct;
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
    // 炮艇/主力舰的下降速度逐变体定义（VARIANTS.speed）；御4/铁砧 240；
    // 铁砧受战争幽灵光环：移速 ×2（+100%）、加速度（悬停逼近率）×2（同步乘算防止冲过悬停锚点，见 warGhostAura）
    const anvilAura = e.type === 'anvil' ? warGhostAura() : 1;
    const anvilAuraAcc = e.type === 'anvil' ? warGhostAuraAcc() : 1;
    const cruise = (e.type === 'capital'
        ? (e.variant === 'azure' ? 220 : e.variant === 'crgold' ? 280 : 250)
        : e.type === 'harbinger' ? HARBINGER.descend
        : e.type === 'yu4' ? YU4.speed
        : e.type === 'anvil' ? ANVIL.speed
        : e.type === 'gunship' ? (e.variant === 'crimson' ? 270 : e.variant === 'amber' ? 240 : 300)
        : 320) * e.speedMul * anvilAura;
    if (!e.arrived) {
      // 接近悬停高度时逐渐减速到 0（而非瞬间归零）
      if (e.vy == null) e.vy = cruise;
      const dist = e.hoverY - e.y;
      const targetVy = dist >= 90 ? cruise : cruise * Math.max(0.12, dist / 90);
      e.vy += (targetVy - e.vy) * Math.min(1, dt * 12 * anvilAuraAcc);
      e.y += e.vy * dt;
      // 4类主力舰：减速段（最后 90px）开始 0.4s 后展开机翼——展开动画与缓冲滑行尾部重叠，
      // 到位后无静止停顿；展开起点较减速起点延后 0.4s（用户规格）
      if (e.type === 'capital' && e.unfoldT == null && dist <= 90) {
        if (e._unfoldWait == null) e._unfoldWait = 0.4;
        e._unfoldWait -= dt;
        if (e._unfoldWait <= 0) {
          e.unfoldT = 0.55;
          spawnParticles(e.x, e.y + 20, '#ffb3bd', 16, 200);
        }
      }
      if (dist <= 1 || e.y >= e.hoverY) {
        e.y = e.hoverY; e.arrived = true; e.vy = 0;
      }
      return;
    }
      if (e.holdTimer > 0) {
        e.holdTimer -= dt;
        // 悬停摆速缓入：到位瞬间水平摆速从 0 起 0.8s smoothstep 渐升——
        // 消除"到达位置后突然拥有水平速度"的硬切（速度曲线连续）
        e.swayT = (e.swayT || 0) + dt;
        const sk0 = Math.min(1, e.swayT / 0.8);
        const swayIn = sk0 * sk0 * (3 - 2 * sk0);
        // 悬停期间水平巡航
        if (e.type === 'capital') {
          // 赤金技能3：停移（holdEase 平滑过渡 1↔0，摆动速度不瞬间归零、恢复时不瞬间起跳）
          if (e.holdEase == null) e.holdEase = 1;
          const wantHold = (e.variant === 'crgold' && e.crgoldHold > 0) ? 0 : 1;
          if (e.crgoldHold > 0) e.crgoldHold -= dt;
          e.holdEase += (wantHold - e.holdEase) * Math.min(1, dt * 6);
          e.x = clamp(e.x + Math.sin(e.wobble * 0.35) * 30 * e.holdEase * swayIn * dt, e.w / 2 + 6, CANVAS_W - e.w / 2 - 6);
        } else if (!e.staticX) {
        // gunship / harbinger：轻幅左右巡航（先兆者幅度更小，稳居后排）
        // staticX：BOSS 召唤的先兆者固定在最左/最右，不巡航，避免被 BOSS 机体挡住打不到
        e.x += Math.sin(e.wobble * 0.6) * (e.type === 'harbinger' ? 24 : 50) * e.speedMul * swayIn * dt;
      }
      // 御4 / 铁砧：到位后在左右巡航之外叠加小幅上下浮动——
      // 位置公式：相位 bobT 在到位瞬间从 0 起（t=0 偏移严格 = 0，位置与前一帧连续），
      // 振幅 A=10px（"微微"量级）、ω=1.2rad/s（周期 ≈5.2s），幅度乘 swayIn：与水平摆共用 0.8s smoothstep 缓入
      if (e.type === 'yu4' || e.type === 'anvil') {
        e.bobT = (e.bobT || 0) + dt;
        e.y = e.hoverY + Math.sin(e.bobT * 1.2) * 10 * swayIn;
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

  // 威龙移动：沿蛇形航点路径巡航；攻击时停移（炮口锁死不转向）；到位航点可停顿（dwell）
  function updateWeilongMovement(e, dt) {
    e.entryT = Math.max(0, (e.entryT || 0) - dt);   // 入场 200% 移速加成：entryDecay 内线性衰减回 100%
    // 炮口转向：以最大角速度（WEILONG.maxTurn = 3.2 rad/s，同破片）平滑追踪玩家——无瞬跳；
    // 攻击窗口期间（attackT > 0）炮口锁死、不改动转向
    if (e.attackT > 0) {
      e.attackT -= dt;
      return;   // 攻击窗口：停止移动（炮口已在上方锁死）
    } else if (player.alive) {
      const cur = e.muzzleAng != null ? e.muzzleAng : Math.PI / 2;
      const want = Math.atan2(player.y - e.y, player.x - e.x);
      const df = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
      e.muzzleAng = cur + clamp(df, -WEILONG.maxTurn * dt, WEILONG.maxTurn * dt);
    }
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
    const spd = WEILONG.speed * e.speedMul * (1 + (WEILONG.entryBoost - 1) * clamp(e.entryT / WEILONG.entryDecay, 0, 1));   // 入场加成（300%）线性衰减
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
    if (e.y < 0 || e.x < -30 || e.x > CANVAS_W + 30) {
      // 未入场不开火（含横向尚未入场的长队队尾，避免屏外开火）；
      // 例外：朴学峰残像未爆完（留影后 0.7s 内本体可能已冲出屏底/顶部重入屏外段）——放行进入
      // elPhase 分支推进残像计时与爆开收口（advanceEliteMinions），否则幻影卡死永不爆
      if (!(e.type === 'puxuefeng' && e.elRemnant)) return;
    }
    // 幽暮突击艇：环射由移动状态机在“瞄准停顿”结束时触发，不走通用开火计时
    if (e.type === 'striker' && e.skill === 'dusk') return;
    // 法术大师A1：攻击逻辑在移动状态机内处理，不走通用开火
    if (e.type === 'fashiA1') return;
    // 法术大师A2：攻击逻辑在移动状态机内处理，不走通用开火
    if (e.type === 'fashiA2') return;
    // 大型龙卷：随机向 360° 快速射出风条（从机体内部随机点射出，与涡流风旋技能的风条完全一致）
    if (e.type === 'tornado') {
      e.fireTimer -= dt * enemyFieldFireMul(e);   // 奖励道具·寒霜发生器：力场内射速 -60%（BOSS 减半）
      if (e.fireTimer <= 0) {
        e.fireTimer = rand(0.20, 0.30);
        for (let k = 0; k < 2; k++) {
          // 风条：初速低沿飞行方向加速（100.625→408.1），长度 7.2 以 150px/s 长到 42，波动渲染
          // owner 显式传 e（大型龙卷）：天秀忧郁王子"来自暴风之眼召唤物的伤害"判定用
          pushBossBullet(e.x + rand(-e.w * 0.2, e.w * 0.2), e.y + rand(-e.h * 0.3, e.h * 0.3),
            Math.random() * Math.PI * 2, 56,
            { r: 5.6, dmg: STORM.tornadoDmg, color: STORM_WIND, len: 7.2, lenTarget: 42, growRate: 150,
              oval: true, accel: 100.625, maxSpeed: 408.1, owner: e });
        }
      }
      return;
    }
    // 炮火先兆者：入场瞬间即开始充能（不等待就位），红色充满即召唤导弹预警（最多 5 发）
    // 充能与召唤均在 updateEnemyFire 内进行，不影响 updateEnemyMovement 的移动（下降/悬停巡航照常）
    if (e.type === 'harbinger') {
      if (e.leaving) return;   // 已离场：停止充能
      // 虚象：攻击间隔 +25% —— 充能序列整体时间膨胀（红相充满更慢 → 召唤导弹更稀疏）
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
      e.fireTimer -= dt * enemyFieldFireMul(e);   // 奖励道具·寒霜发生器：力场内射速 -60%（BOSS 减半）
      if (e.fireTimer <= 0) {
        const cfg = ENEMY_TYPES.weilong;
        e.fireTimer = enemyFireIv(cfg);
        e.burst = {
          baseAng: e.muzzleAng != null ? e.muzzleAng : Math.atan2(player.y - e.y, player.x - e.x),   // 沿炮口当前指向锁定（无偏转）；攻击窗口内炮口不再转向
          speed: cfg.bulletSpeed * WEILONG.bulletSpeedMul,       // 较普通弹快 60%
          count: WEILONG.burstCount, shots: 0, gap: WEILONG.burstGap,
          opts: { color: '#ffb42e', r: 5, dmg: cfg.bulletDmg },  // 橙黄能量弹
        };
        e.burstTimer = 0;   // 首立即发
        e.attackT = WEILONG.burstGap * (WEILONG.burstCount - 1) + 0.10;   // 攻击窗口：期间停止移动
      }
      return;
    }
    // 破片：停稳锁停后，索敌范围内 → 玩家位置红圈预警 0.8s → 快速三连发不可击毁导弹（8/5/5，条件性无视无敌）；
    // 破片U型：无需锁停（入场 atkT 1.8~2s / 诗篇 1.6~2s 计时即门控），导弹 10/7/7（POPIAN_U），其余同破片
    if (e.type === 'popian' || e.type === 'popianU') {
      if (e.leaving || (e.type !== 'popianU' && !e.arrived)) return;   // 未停稳不攻击（U型除外：无需就位）
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
      // （未朝向玩家时无法发射——等待转向完成，短暂重试）；
      // 战争幽灵光环：破片无视索敌距离（对齐角度门控保留；破片U型本就无需锁停、不受此门控影响）
      e.atkT -= dt * enemyFieldFireMul(e);   // 奖励道具·寒霜发生器：力场内射速 -60%（BOSS 减半）
      if (e.atkT <= 0) {
        const wantFace = Math.atan2(player.y - e.y, player.x - e.x) - Math.PI / 2;
        const df = Math.atan2(Math.sin(wantFace - e.faceAng), Math.cos(wantFace - e.faceAng));
        if (player.alive && Math.abs(df) <= POPIAN.fireAlign &&
            (warGhostAura() > 1 || Math.hypot(player.x - e.x, player.y - e.y) <= e.detectR)) {
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
      e.fireTimer -= dt * enemyFieldFireMul(e);   // 奖励道具·寒霜发生器：力场内射速 -60%（BOSS 减半）
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
      e.fireTimer -= dt * enemyFieldFireMul(e);   // 奖励道具·寒霜发生器：力场内射速 -60%（BOSS 减半）
      if (e.fireTimer <= 0) {
        e.fireTimer = enemyFireIv(FASHI_ARRAY);
        fireArrayCube(e);
      }
      return;
    }
    // 脉冲矩阵：周期性范围脉冲——出生即计时（2026-09-30：入场途中走完间隔同样释放，预警/张合照常演出）；
    // 离场中不攻击；释放前 0.6s 微微红圈收缩预警（绘制按 fireTimer 剩余值与 warnTime 推导，见 drawPulseMatrixBody）；
    // 预警完毕：自身放大动效 + 暗红冲击波（增强双波纹）+ 短命暗红烟雾；伤害改为「波到才伤」（2026-10-02）：
    //   震波波前扫到玩家所在距离的瞬间结算 30 伤害——扩散期间及时脱离脉冲半径即可免伤，波扩完后再进入不受伤
    // （走常规 damagePlayer：护盾 / 无敌帧 / 受击反馈照常，虚象等难度伤害修正经 enemyDmgMul 生效）
    if (e.type === 'pulseMatrix') {
      if (e.leaving) return;
      if (e.pmScaleT > 0) e.pmScaleT -= dt;   // 放大动效计时（绘制读取）
      // 冲击波扩散计时 + 自爆结算：自爆波扩散完毕的瞬间自身死亡（killEnemy 正常结算得分/掉落）
      // + 粒子爆散 + 分裂三座法术矩阵（自爆模式进入后本体的最后一击，2026-10-02）
      if (e.pmWaveT > 0) {
        e.pmWaveT -= dt;
        if (e.pmWaveT <= 0 && e.pmSelfDestruct && !e.pmBoomDone) {
          e.pmBoomDone = true;
          // 自爆大量粒子：三层（暗红主爆 + 深红碎片 + 亮粉高光），合计 124 粒
          spawnParticles(e.x, e.y, '#ff5a6e', 60, 380);
          spawnParticles(e.x, e.y, '#d02030', 40, 240);
          spawnParticles(e.x, e.y, '#ffb0b8', 24, 300);
          // 分裂三座法术矩阵：全部从核心爆散位置出生，随后沿 120° 三方向（带随机抖动）向外「炸开」——
          // 0.35s 内 easeOut 飞离约 40px 停稳（burstDx/Dy 通道，增量法逐帧推进）；登场旋转与法术阵列亡语同款；
          // 与亡语召唤体一致不加分不掉水晶（noReward），1.4s 后开始攻击
          for (let k = 0; k < 3; k++) {
            const a = -Math.PI / 2 + k * 2 * Math.PI / 3 + rand(-0.3, 0.3);
            const m = spawnFashiMatrix(
              clamp(e.x, 60, CANVAS_W - 60),
              clamp(e.y, 40, CANVAS_H - 70)
            );
            m.hoverY = m.y;          // 就地停驻：从核心爆散点直接进入胡乱移动（不再下移寻位）
            m.vx = 0; m.vy = 0;      // 清零 spawn 初速（入场下降初速 280）——飞离位移全部由 burst 通道承担，
                                     // 否则残余初速会在停稳后继续下冲一大段（瞬移观感，2026-10-02 修复）
            m.spinT = 0;             // 亡语式登场：被爆发震出的附加自旋计时
            m.spinDur = 0.4;
            m.spinTotal = (Math.random() < 0.5 ? -1 : 1) * rand(1, 2) * Math.PI * 2;
            m.spinLast = 0;
            m.burstT = 0;            // 爆散飞离：从核心沿 a 方向 easeOut 飞出 ~40px（0.35s）后停稳
            m.burstDur = 0.35;
            m.burstDx = Math.cos(a) * 40;
            m.burstDy = Math.sin(a) * 40;
            m.noReward = true;
            m.fireTimer = 1.4;
          }
          const bi = enemies.indexOf(e);   // 正常死亡结算（得分/掉落/图鉴计数，同弹幕击杀入口；enemies 为 02-core 模块级数组绑定，不经 state）
          if (bi >= 0) killEnemy(bi);
          return;
        }
      }
      if (e.pmSmokeT > 0) e.pmSmokeT -= dt;   // 暗红烟雾残留计时（绘制读取）
      // 震波命中判定：波前半径与绘制同 ease 曲线（18 → 本波半径二次缓出），扫到玩家距离即结算（每波至多一次）
      if (e.pmWaveT > 0 && !e.pmWaveHitDone && player.alive) {
        const wp = 1 - e.pmWaveT / PULSE_MATRIX.pulseWaveDur;
        const wr = 18 + (1 - Math.pow(1 - wp, 2)) * ((e.pmWaveR || PULSE_MATRIX.pulseR) - 18);
        if (wr >= Math.hypot(player.x - e.x, player.y - e.y)) {
          e.pmWaveHitDone = true;
          damagePlayer(PULSE_MATRIX.pulseDmg * enemyDmgMul(), 1, false, false, null);
        }
      }
      e.fireTimer -= dt * enemyFieldFireMul(e);   // 奖励道具·寒霜发生器：力场内射速 -60%（BOSS 减半）
      if (e.fireTimer <= 0) {
        const iv = isPoem() ? PULSE_MATRIX.fireIntervalPoem : PULSE_MATRIX.fireInterval;
        e.fireTimer = iv;
        e.pmCycleIv = iv;   // 周期时长记录（绘制层充能进度 p = 1 - fireTimer/pmCycleIv 分五档张合）
        e.pmScaleT = PULSE_MATRIX.scaleBumpDur;
        e.pmWaveT = PULSE_MATRIX.pulseWaveDur;
        e.pmWaveR = e.pmSelfDestruct ? PULSE_MATRIX.selfDestructR : PULSE_MATRIX.pulseR;   // 自爆波半径 160 / 普通波 132
        e.pmSmokeT = PULSE_MATRIX.smokeDur;   // 释放后短命暗红烟雾（比冲击波略长）
        e.pmWaveHitDone = false;   // 新震波重置命中标记（波前扫到玩家时置 true，见上方判定）
      }
      return;
    }
    // 战争幽灵：驻留期技能循环——首个从 {2,3} 随机，之后固定 1→2→3，间隔 skillGap；
    // 半血一次性召唤：铁砧 + 破片U型，目标点在幽灵身侧略微后方（2026-09-29 由屏幕边缘改位）
    if (e.type === 'warGhost') {
      if (e.wgPhase === 3 && !e.wgSummoned && e.hp > 0 && e.hp <= e.maxHp * 0.5) {
        e.wgSummoned = true;
        // 目标点：幽灵左右身侧（横向 summonSideGap）略微后方——幽灵机头朝下，后方即上方 summonBackY
        const gap = WAR_GHOST.summonSideGap;
        const lineY = Math.max(60, e.y - WAR_GHOST.summonBackY);   // 兜底：不靠上边界过近
        const anvilX = clamp(e.x - gap, 46, CANVAS_W - 46);
        const uX = clamp(e.x + gap, 46, CANVAS_W - 46);
        const a = spawnAnvil(ANVIL.dwell, anvilX, true);   // 铁砧：身侧横位、顶部入场，固定横位不巡航
        a.hoverY = lineY;                                  // 停留线覆盖为幽灵后方水平线
        spawnPopianU(uX, -50, { tpX: uX, tpY: lineY });    // 破片U型：对侧身位、顶部入场，目标点同处后方水平线
        spawnParticles(e.x, e.y, '#ffd24a', 18, 240);
      }
      if (e.wgPhase !== 3) return;   // 仅驻留相位施放技能（入场/离场/演出期不攻击）
      if (e.wgSkill) { advanceWarGhostSkill(e, dt); }
      else {
        e.wgGapT -= dt;
        if (e.wgGapT <= 0) startWarGhostSkill(e);
      }
      // 技能3 弹幕排入定时子射击队列：此处自行推进（专用分支提前 return，不落入通用 scheduled 段）
      if (e.scheduled && e.scheduled.length) {
        for (let si = e.scheduled.length - 1; si >= 0; si--) {
          const sc = e.scheduled[si];
          sc.t -= dt;
          if (sc.t <= 0) { sc.fn(); e.scheduled.splice(si, 1); }
        }
      }
      return;
    }
    // 4F 精英（黑暗之手麾下四精英）：驻留期技能循环——朴/韩/辛首个随机（elFirst）后两技 1↔2 轮换，
    // 夏勇固定五步循环（屏障→大子弹→回旋刃→大子弹→回旋刃，见 startEliteSkill）；
    // 移动类技能（朴1 流星穿刺 / 辛1 地毯轰炸）的相位推进在 updateEnemyMovement；
    // 此处推进独立射弹（残像 / 双刃 / 能量球 / 落弹，全相位持续）与驻留技能（朴2 连弩 / 韩1-2 / 辛2 导弹）——
    // 夏勇三技能（屏障即时收口 / 碎翼回旋刃 / 核心膨胀）均为挂载推进，收口在 advanceEliteMinions
    if (e.elPhase != null) {
      advanceEliteMinions(e, dt);
      if (e.elPhase === 1) {
        if (e.elSkill) advanceEliteSkill(e, dt);
        else {
          e.elGapT -= dt;
          if (e.elGapT <= 0) startEliteSkill(e);
        }
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
        // 出弹点快照（ox/oy）：施放瞬间锁定位置，后发不随机体移动漂移（红双曲线两技能等，见各技能）
        const bpos = b.ox != null ? { x: b.ox, y: b.oy } : {};
        pushEBullet(e, b.baseAng + b.step * b.shots + jit, b.speed, cfg, Object.assign({}, b.opts || {}, bpos));
        if (b.mirror) {
          const mAng = Math.PI - (b.baseAng + b.step * b.shots + jit);
          // mirrorAx：镜像弹反转横向加速度 → 左右对称的双曲线
          const mOpts = (b.opts && b.mirrorAx) ? Object.assign({}, b.opts, { ax: -(b.opts.ax || 0) }, bpos) : Object.assign({}, b.opts || {}, bpos);
          pushEBullet(e, mAng, b.speed, cfg, mOpts);
        }
        b.shots++;
        e.burstTimer = b.gap;
        if (b.shots >= b.count) e.burst = null;
      }
      return;
    }
  
    e.fireTimer -= dt * enemyFieldFireMul(e);   // 奖励道具·寒霜发生器：力场内射速 -60%（BOSS 减半）
    if (e.fireTimer > 0) return;
    const cfg = ENEMY_TYPES[e.type];
    e.fireTimer = enemyFireIv(cfg);
    if (e.fireIv) e.fireTimer = rand(e.fireIv[0], e.fireIv[1]);   // 变体专属攻击间隔（烈橙 1.4~2.4s）
  
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
        // 幽蓝：朝玩家方向 ±20° 随机偏转射出一发（大范围散布、不精确追踪——蓝=盾+乱射定位）
        pushEBullet(e, Math.atan2(player.y - e.y, player.x - e.x) + rand(-Math.PI / 9, Math.PI / 9), cfg.bulletSpeed, cfg);
      } else if (e.skill === 'violet') {
        // 紫晶：发射一枚精确追踪玩家的子弹（紫=追踪定位；较幽蓝首攻/间隔各 +0.3s、无虚化护盾）
        pushEBullet(e, Math.atan2(player.y - e.y, player.x - e.x) + rand(-0.05, 0.05), cfg.bulletSpeed, cfg);
      } else if (e.skill === 'silent' || e.skill === 'fortress') {
        // 霜白 / 坚垒护卫艇：不开火
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
            // 技能1（合并，两段弹幕同时发射）：瞄准双连射（中间弹固定垂直向下）与左右双曲线外扩弹流并行；
            // 出弹点以施放瞬间为准快照（sx0/sy0 与 burst ox/oy）——机体移动不拖曳弹幕轨迹
            const aimAng = Math.PI / 2;   // 中间弹不再追踪（垂直向下）
            const sx0 = e.x, sy0 = e.y + e.h / 2;
            // 双曲线占用 burst 槽，立即开始（每侧6发、向两侧外扩）
            e.burst = { baseAng: Math.PI / 2 - 0.18, step: 0, count: 6, shots: 0, gap: 0.085, speed: cfg.bulletSpeed * 1.05, mirror: true, mirrorAx: true, ox: sx0, oy: sy0, opts: { ax: 220 } };
            e.burstTimer = 0;
            // 双连射不占 burst 槽，改走 scheduled 直射：第 1 发同帧立即出膛，与双曲线同步开火
            pushEBullet(e, aimAng, cfg.bulletSpeed * 1.25, cfg, { x: sx0, y: sy0 });
            e.scheduled.push({ t: 0.12, fn: () => pushEBullet(e, aimAng, cfg.bulletSpeed * 1.25, cfg, { x: sx0, y: sy0 }) });
            break;
          }
          case 1: {
            // 技能2：左右同时双曲线弹（每侧5发）——交汇点逐次随机取屏高 50%~100%：
            // 按目标深度反解张角 th 与向心加速度 ax（镜像对恰在 yC 处回到中线交汇，横向展幅恒 ≈40px，
            // 交汇越深张角越小、曲率越缓），运动学：t交汇=2·vx0/|ax|，y交汇=y0+vy0·t交汇
            const yC = CANVAS_H * rand(0.5, 1.0);
            const dy = Math.max(140, yC - (e.y + e.h / 2));
            const sp2 = cfg.bulletSpeed * 1.05;
            const th = Math.atan(160 / dy);
            const axC = -(sp2 * sp2 * Math.sin(2 * th)) / dy;
            e.burst = { baseAng: Math.PI / 2 - th, step: 0, count: 5, shots: 0, gap: 0.085, speed: sp2, mirror: true, mirrorAx: true, ox: e.x, oy: e.y + e.h / 2, opts: { ax: axC } };
            e.burstTimer = 0;
            break;
          }
          case 2: {
            // 技能三：垂直向下 + 下±20° 三方向，每方向快速射 2 发，连发 2 轮（轮间隔 0.75s）；
            // 出弹点以施放瞬间为准快照（两轮均从同一点出膛，不随机体移动漂移）；
            // 第二轮发射完（轮内第二发 t=0.86s 出膛）才重新计算攻击间隔，
            // 避免齐射未结束 fireTimer 就走完、下个技能提前插入打断节奏
            e.fireTimer = 1e9;   // 挂起攻击计时（触发分支前已被重置），由第二轮结束的 scheduled 恢复
            const ox = e.x, oy = e.y + e.h / 2;
            fireTriVolley(e, cfg, ox, oy);
            e.scheduled.push({ t: 0.75, fn: () => fireTriVolley(e, cfg, ox, oy) });
            e.scheduled.push({ t: 0.86, fn: () => { e.fireTimer = enemyFireIv(cfg); } });
            break;
          }
        }
      } else if (e.skill === 'ring') {
        // 金：三技能循环 —— 10 发环形（诗篇 12）/ 双向 22222 加速长条弹 / 三方向 3×3 加速长条弹
        switch (e.pattern % 3) {
          case 0: {
            // 技能1：原紫晶 8 发环形爆发的强化版——10 发（诗篇 12 发）随机相位环形爆发
            // （加速长条弹：初速≈0，加速至 180%×0.85 弹速）
            const off = Math.random() * Math.PI * 2;
            const n = isPoem() ? 12 : 10;
            for (let k = 0; k < n; k++) pushEBullet(e, off + k * Math.PI * 2 / n, 2, cfg, { accel: 300, maxSpeed: cfg.bulletSpeed * 0.85 * 1.8 });
            break;
          }
          case 1: {
            // 技能2：选 360° 随机方向，对该方向与反方向各射 10 发加速长条弹（分布 22222：前后 5 波、每波 2 发）；
            // 出弹点以施放瞬间为准快照在机体核心（后发不随机体移动漂移）；
            // 同向两发出射角 ±0.03 + 垂直错位 ±6px（初始间距 12px，不再重叠）
            const ox = e.x, oy = e.y;
            const base = Math.random() * Math.PI * 2;
            const maxSp = cfg.bulletSpeed * 1.8;
            for (let wv = 0; wv < 5; wv++) {
              e.scheduled.push({ t: wv * 0.12, fn: () => {
                for (const dir of [base, base + Math.PI])
                  for (const o of [-0.03, 0.03]) {
                    const px = Math.cos(dir), py = Math.sin(dir), nx = -py, ny = px;
                    const sgn = o < 0 ? -1 : 1;
                    pushEBullet(e, dir + o, 2, cfg, { accel: 300, maxSpeed: maxSp, x: ox + nx * sgn * 6, y: oy + ny * sgn * 6 });
                  }
              }});
            }
            break;
          }
          case 2: {
            // 技能3：三方向（互夹 120°）三波加速长条弹——首轮方向随机竖直朝上或朝下，后续两轮依次旋转 60° 跟随；
            // 每发均为两发连射（同向 0.07s 追发）；出弹点以施放瞬间为准快照（后发不随机体移动漂移）
            const ox = e.x, oy = e.y + e.h / 2;
            const base0 = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
            const maxSp = cfg.bulletSpeed * 1.8;
            for (let v = 0; v < 3; v++) {
              const base = base0 + v * Math.PI / 3;
              e.scheduled.push({ t: v * 0.4, fn: () => {
                for (let k = 0; k < 3; k++) {
                  const ang = base + k * Math.PI * 2 / 3;
                  pushEBullet(e, ang, 2, cfg, { accel: 300, maxSpeed: maxSp, x: ox, y: oy });
                  e.scheduled.push({ t: 0.07, fn: () => pushEBullet(e, ang, 2, cfg, { accel: 300, maxSpeed: maxSp, x: ox, y: oy }) });
                }
              }});
            }
            break;
          }
        }
      } else if (e.skill === 'orange') {
        // 橙焰：四技能循环 —— 巨型黄弹分裂 / 下方 150° 6 发 / 双轮 2×2（40°→60°）/ 下方 120° 4 发
        switch (e.pattern % 4) {
          case 0: {
            // 技能1：朝玩家射出红橙色巨型子弹（较原更小），飞行 25% 屏高后开始减速滑行 0.7s、
            // 临近停速（剩余 25% 速度）即分裂为 6 发均匀子弹——减速一段时间后才分裂，不减为 0 再炸
            const ang = Math.atan2(player.y - e.y, player.x - e.x);
            pushEBullet(e, ang, cfg.bulletSpeed * 0.85, cfg, {
              r: 10, len: 0, color: '#ff7a45',
              split: { dist: CANVAS_H * 0.25, count: 6, speed: cfg.bulletSpeed * 0.8, r: 5, color: '#ff7a45', decayDur: 0.7, frac: 0.25, grad: true },
            });
            break;
          }
          case 1: {   // 技能2：向下方 150° 扇区均匀射出 6 发长条弹
            for (let k = 0; k < 6; k++) pushEBullet(e, Math.PI / 2 - Math.PI * 5 / 12 + k * (Math.PI * 5 / 6) / 5, cfg.bulletSpeed, cfg);
            break;
          }
          case 2: {   // 技能3：快速朝正下方释放两轮 2×2（第一轮夹角 40°、第二轮 60°，加速长条弹）；
            // 瞄准固定正下方（不追踪玩家）；出弹点以施放瞬间为准快照（后发不随机体移动漂移）
            const aim = Math.PI / 2;
            const ox = e.x, oy = e.y + e.h / 2;
            for (const [half, t0] of [[Math.PI / 9, 0], [Math.PI / 6, 0.3]]) {
              e.scheduled.push({ t: t0, fn: () => {
                for (const s of [-1, 1]) {
                  pushEBullet(e, aim + s * half, 2, cfg, { accel: 300, maxSpeed: cfg.bulletSpeed * 1.8, x: ox, y: oy });
                  e.scheduled.push({ t: 0.1, fn: () => pushEBullet(e, aim + s * half, 2, cfg, { accel: 300, maxSpeed: cfg.bulletSpeed * 1.8, x: ox, y: oy }) });
                }
              }});
            }
            break;
          }
          case 3: {   // 技能4：向下方 120° 扇区均匀射出 4 发长条弹
            for (let k = 0; k < 4; k++) pushEBullet(e, Math.PI / 2 - Math.PI / 3 + k * (Math.PI * 2 / 3) / 3, cfg.bulletSpeed, cfg);
            break;
          }
        }
      } else if (e.skill === 'cyan') {
        // 青时：三技能循环 —— 两翼召唤增生侧翼艇 / 屏障支援弹（常态 2 发·诗篇 4 发） / DNA 双螺旋四连弹
        switch (e.pattern % 3) {
          case 0: {
            // 技能1：两翼各飞出一个增生侧翼艇（先朝两侧、随后转向下飞；诗篇连续两波共 4 个）；
            // 召唤体与其分裂的卫护飞船不加分、不掉水晶
            const spawnPair = () => {
              for (const s of [-1, 1]) {
                const p = makeEnemy('prolifera', e.x + s * e.w * 0.55, e.y + e.h * 0.35, { fireTimer: 1e9 });
                p.noReward = true;
                p.chargeShield = isPoem() ? 2 : 1;   // 次数盾：常态 1 层、诗篇 2 层（单次伤害抵御一次；群星允诺暴走弹无视，见 08-entities；白色浅盾视觉见 10-draw-world）
                p.chargeShieldMax = p.chargeShield;
                p._velTilt = true;   // 绘制朝向随速度方向变化（先侧后下）
                p._sideVel = { vx: s * 140, vy: 24 };
                p._velCurve = { t: 0, dur: 0.7, vx0: s * 140, vy0: 24, vx1: s * 26, vy1: 150 };
              }
            };
            spawnPair();
            if (isPoem()) e.scheduled.push({ t: 0.7, fn: spawnPair });
            break;
          }
          case 1: {
            // 技能2：朝 360° 随机方向发射屏障支援弹（常态 2 发 / 诗篇 4 发，用户 2026-10-01 指定；登记《诗篇难度修正.md》）
            // ——命中敌机加 200 屏障（诗篇同）；命中玩家机身（大判定、无需核心）加 24（诗篇 28）屏障，持续 10s、重复命中刷新
            const n = isPoem() ? 4 : 2;
            for (let k = 0; k < n; k++)
              pushEBullet(e, Math.random() * Math.PI * 2, cfg.bulletSpeed * 0.9, cfg, { r: 7, len: 0, support: true, color: '#9ff0e0' });
            break;
          }
          case 2: {
            // 技能3（原紫晶炮艇技能1，2026-09 批次互换）：DNA 双螺旋四连弹——朝玩家 2×2（前后两批），全部自机头出膛；
            // 出弹点以施放瞬间为准快照（后批不随机体移动漂移）；加速蛇行弹（初速≈0 → 180% 弹速）；
            // 朝向绕射击方向正弦摆动（摆幅 0.385 rad，较初版 0.55 −30%）：左右两发相位相反，轨迹持续交绕呈双螺旋
            const aim = Math.atan2(player.y - e.y, player.x - e.x);
            const sx0 = e.x, sy0 = e.y + e.h / 2;
            for (const t0 of [0, 0.104]) {   // 两批间隔 0.104s（较初版 0.16s -35%）
              e.scheduled.push({ t: t0, fn: () => {
                pushEBullet(e, aim, 2, cfg, { x: sx0, y: sy0, accel: 300, maxSpeed: cfg.bulletSpeed * 1.8, weave: { amp: 0.385, om: 5.5, ph: 0 } });
                pushEBullet(e, aim, 2, cfg, { x: sx0, y: sy0, accel: 300, maxSpeed: cfg.bulletSpeed * 1.8, weave: { amp: 0.385, om: 5.5, ph: Math.PI } });
              }});
            }
            break;
          }
        }
      } else {
        // 紫 mixed：三技能循环 —— 两轮 6 发环形爆发 / 三发平行贴弹 / 锁定侧扫 60°
        switch (e.pattern % 3) {
          case 0: {
            // 技能1（原青时炮艇技能3，2026-09 批次互换）：选定两个随机方向，先后（顺序随机）各射一轮 6 发环形爆发
            //（两轮间隔 0.352s，较初版 0.22s +60%）
            const rounds = [0, 0.352];
            if (Math.random() < 0.5) rounds.reverse();
            for (const t0 of rounds) {
              const off = Math.random() * Math.PI * 2;
              e.scheduled.push({ t: t0, fn: () => {
                for (let k = 0; k < 6; k++) pushEBullet(e, off + k * Math.PI / 3, cfg.bulletSpeed * 0.85, cfg);
              }});
            }
            break;
          }
          case 1: {
            // 技能2：追踪玩家一次性同时射出三发平行长条弹（普通弹速，非加速弹）
            //（边上两发与中间同向、间距 17.6px）——中间弹出射点显著靠前（26px，侧弹仅 8px），始终更靠近玩家
            const aim = Math.atan2(player.y - e.y, player.x - e.x);
            const px = Math.cos(aim), py = Math.sin(aim);
            const nx = -py, ny = px;   // 垂直于射击方向
            pushEBullet(e, aim, cfg.bulletSpeed, cfg, { x: e.x + px * 26, y: e.y + py * 26 });
            pushEBullet(e, aim, cfg.bulletSpeed, cfg, { x: e.x + px * 8 - nx * 17.6, y: e.y + py * 8 - ny * 17.6 });
            pushEBullet(e, aim, cfg.bulletSpeed, cfg, { x: e.x + px * 8 + nx * 17.6, y: e.y + py * 8 + ny * 17.6 });
            break;
          }
          case 2: {
            // 技能3：锁定玩家当前位置，向左或右一侧 60° 区间依次均分射出 4 发（诗篇 5 发）加速长条弹
            // （加速长条弹：初速≈0，加速至 180% 弹速；出弹点以施放瞬间为准快照——机体移动不拖曳扇面）
            const aim = Math.atan2(player.y - e.y, player.x - e.x);
            const sx0 = e.x, sy0 = e.y + e.h / 2;
            const n = isPoem() ? 5 : 4;
            const side = Math.random() < 0.5 ? -1 : 1;
            for (let k = 0; k < n; k++) {
              const ang = aim + side * (Math.PI / 3) * (n === 1 ? 0 : k / (n - 1));
              e.scheduled.push({ t: k * 0.09, fn: () => pushEBullet(e, ang, 2, cfg, { accel: 300, maxSpeed: cfg.bulletSpeed * 1.8, x: sx0, y: sy0 }) });
            }
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
          // 每次射击为紧凑两连发（一前一后）：第二轮间隔翻倍（0.56s）、第二轮→第三轮间隔减 25%（0.21s）；
          // 加速长条弹（初速≈0 → 180% 弹速），出弹点以施放瞬间为准快照（不随机体移动漂移）
          const lockAng = Math.atan2(player.y - e.y, player.x - e.x);
          const ox = e.x, oy = e.y + e.h / 2;
          const volleys = [[5, 40], [2, 22], [2, 25]];   // [发数, 总夹角°]
          const times = [0, 0.56, 0.77];
          const twinGap = 0.06;   // 同一次射击两发的前后间隔
          volleys.forEach(([n, spread], vi) => {
            const half = spread * Math.PI / 360;
            for (let k = 0; k < n; k++) {
              const off = n === 1 ? 0 : -half + (2 * half) * k / (n - 1);
              e.scheduled.push({ t: times[vi], fn: () => pushEBullet(e, lockAng + off, 2, cfg, { x: ox, y: oy, accel: 300, maxSpeed: cfg.bulletSpeed * 1.8 }) });
              e.scheduled.push({ t: times[vi] + twinGap, fn: () => pushEBullet(e, lockAng + off, 2, cfg, { x: ox, y: oy, accel: 300, maxSpeed: cfg.bulletSpeed * 1.8 }) });
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
          // 技能3：朝竖直向下依次射出四组「左3右3」加速长条弹（初速≈0、逐渐加速到最大速度 180% 弹速），
          // 四组的左右两 stream 夹角依次为 75°/55°/35°/15°（逐组收窄）；释放期间自身停移（crgoldHold）；
          // 出弹点以施放瞬间为准快照（不随机体移动漂移）
          const ox = e.x, oy = e.y + e.h / 2;
          const accel = 420, maxSpeed = cfg.bulletSpeed * 1.8;
          e.crgoldHold = 2.0;
          for (let g = 0; g < 4; g++) {
            const halfA = [75, 55, 35, 15][g] * Math.PI / 360;   // 每侧偏角 = 夹角的一半
            const t0 = g * 0.5;
            for (let i = 0; i < 3; i++) {
              e.scheduled.push({ t: t0 + i * 0.07, fn: () => pushEBullet(e, Math.PI / 2 + halfA, 0.5, cfg, { accel, maxSpeed, x: ox, y: oy }) });
              e.scheduled.push({ t: t0 + i * 0.07, fn: () => pushEBullet(e, Math.PI / 2 - halfA, 0.5, cfg, { accel, maxSpeed, x: ox, y: oy }) });   // 左右同帧发射（原 +0.035 错开致两侧不同时）
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
        case 1: {   // 技能2（2026-09 批次改版）：向下方 120° 扇区内两个随机方向、先后（间隔 0.25s）各发射一颗
          // 与橙焰炮艇同款的巨型子弹（r10 橙红 #ff7a45：飞行 25% 屏高减速滑行 0.7s、临近停速分裂 6 发渐变小子弹）
          const fireGiant = (t0) => {
            const ang = Math.PI / 2 + rand(-Math.PI / 3, Math.PI / 3);   // 下方 120° 扇区随机方向
            e.scheduled.push({ t: t0, fn: () => pushEBullet(e, ang, cfg.bulletSpeed * 0.85, cfg, {
              r: 10, len: 0, color: '#ff7a45',
              split: { dist: CANVAS_H * 0.25, count: 6, speed: cfg.bulletSpeed * 0.8, r: 5, color: '#ff7a45', decayDur: 0.7, frac: 0.25, grad: true },
            })});
          };
          fireGiant(0);
          fireGiant(0.25);
          break;
        }
        case 2: {   // 技能3：双臂螺旋 12 发——镜像两臂逐发旋转展开（step 0.4 rad）；
          // 改为加速长条弹（初速≈0 → 180% 弹速），出弹点以施放瞬间为准快照（burst ox/oy）
          e.burst = {
            baseAng: Math.random() * Math.PI * 2, step: 0.4, count: 12, shots: 0, gap: 0.1,
            speed: 2, mirror: true, ox: e.x, oy: e.y + e.h / 2,
            opts: { accel: 300, maxSpeed: cfg.bulletSpeed * 1.8 },
          };
          e.burstTimer = 0;
          break;
        }
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
        case 2: {
          // 技能3：'/||\'（30°）→ '/|\'（45°）加速弹幕——出弹点以施放瞬间为准快照（两波同点，不随机体移动漂移）；
          // 第二轮在第一轮末发出膛（3×0.09s）后 0.3s 开始
          const ox = e.x, oy = e.y;
          fireBarrageWide(e, cfg, ox, oy);        // '/||\'（30°）
          e.scheduled.push({ t: 3 * 0.09 + 0.3, fn: () => fireBarrageNarrow(e, cfg, ox, oy) });   // 随后 '/|\'（45°）
          break;
        }
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
      grad: !!opts.grad,          // 橙红渐变圆弹标记（白核 → 主色 → 暗橙红边径向渐变，见 10-draw-world eBullet grad 分支）
      split: opts.split || null,    // 分裂弹配置（飞行一段→减速→分裂）
      support: !!opts.support,      // 青时炮艇支援弹标记（命中加屏障、不造成伤害，见 08-entities；此前 opts.support 未透传导致整条屏障链路失效）
      weave: opts.weave || null,    // 蛇行弹配置 { amp, om, ph }（朝向绕 baseAng 正弦摆动、恒速前进，见 08-entities）
      baseAng: ang,                 // 出射基准角（蛇行摆动中心）
      age: 0,                       // 存在时长（蛇行相位推进用）
      laser: !!opts.laser,          // 自定义渲染：胶囊形紫色激光（fashiA1/A2）
      orbit: opts.orbit || null,    // 橙旋侧翼艇环绕弹：{ owner, dist, ang, om } 锚定宿主公转（见 08-entities）
      laserBright: !!opts.laserBright, // A2 专属：激光更亮（渲染辉光与配色增强）
      lenTarget: opts.lenTarget || 0, // 生长目标长度（激光逐渐增长）
      growRate: opts.growRate || 0,   // 每秒生长像素
      traveled: 0,
      owner: e,                     // 发射者引用（群星守望 BOSS 战：击杀该敌人时清除其全部在场射弹）
    });
  }

  // A1 横移启动（攻击后 strafeChance / 入场触发线 fa1EntryStrafe 共用）：
  // 随机方向（已贴左右 15% 边缘时强制向场心）、随机距离（受 40px 边距约束）
  function fa1StartStrafe(e) {
    e.fa1State = 'strafe'; e.fa1T = 0;
    const inLeft = e.x < CANVAS_W * 0.15;
    const inRight = e.x > CANVAS_W * 0.85;
    if (inLeft) e.strafeDir = 1;
    else if (inRight) e.strafeDir = -1;
    else e.strafeDir = Math.random() < 0.5 ? -1 : 1;
    e.strafeDist = rand(FASHI_A1.strafeMin, FASHI_A1.strafeMax);
    const maxX = e.strafeDir > 0 ? (CANVAS_W - 40 - e.x) : (e.x - 40);
    e.strafeDist = Math.min(e.strafeDist, Math.max(30, maxX));
    e.strafeMoved = 0;
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

  // 红 技能3：垂直向下 + 下±20° 三方向，每方向快速射 2 发（一轮，两发间隔 0.11s）；
  // ox/oy：出弹点快照（施放瞬间锁定，两轮齐射均从同一点出膛，不随机体移动漂移）
  function fireTriVolley(e, cfg, ox, oy) {
    const down = Math.PI / 2, a20 = Math.PI / 9;
    const dirs = [down - a20, down, down + a20];
    const speed = cfg.bulletSpeed * 1.05;
    const pos = ox != null ? { x: ox, y: oy } : {};
    for (const ang of dirs) pushEBullet(e, ang, speed, cfg, pos);
    e.scheduled.push({ t: 0.11, fn: () => { for (const ang of dirs) pushEBullet(e, ang, speed, cfg, pos); } });
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

  // 技能3 笔画：同一射线沿时间依次连发 4 发同参加速长条弹（间隔 0.18s）——
  // 全部达最大弹速后间距 = 弹速 × 间隔，恒定均匀（原"同帧不同初速"方案因各弹触顶时刻不同、
  // 触顶阶段间距被不均匀压缩——屏底处前紧后松）
  function fireStroke(e, ang, spawnX, cfg, accel, maxSpeed, oy) {
    const spawnY = (oy != null ? oy : e.y) - e.h * 0.1;   // 发射点（舰体中心略上方），弹幕飞抵下方时更分散
    const gapT = 0.09;   // 相邻两发出膛间隔（0.18 → 0.09s，-50%）；触顶后间距 = 弹速 × gapT
    for (let k = 0; k < 4; k++) {
      const fn = () => pushEBullet(e, ang, 60, cfg, { x: spawnX, y: spawnY, accel, maxSpeed, color: SHIP_BULLET_COLOR, len: SHIP_BULLET_LEN });
      if (k === 0) fn();
      else e.scheduled.push({ t: k * gapT, fn });
    }
  }

  // 技能3 第一波：'/||\' —— / 与 | 夹角 30°，两个 | 之间留有横向距离；ox/oy 出弹点快照（缺省读机体位置）
  function fireBarrageWide(e, cfg, ox, oy) {
    const down = Math.PI / 2, a30 = Math.PI / 6;
    const bx = ox != null ? ox : e.x;
    const accel = 240, maxSpeed = cfg.bulletSpeed * rand(1.2, 1.4), gap = 40;   // 最大弹速逐波随机 1.2~1.4×
    fireStroke(e, down + a30, bx - gap, cfg, accel, maxSpeed, oy);        // '/' 左外，向下偏左 30°
    fireStroke(e, down, bx - gap * 0.35, cfg, accel, maxSpeed, oy);       // '|' 左
    fireStroke(e, down, bx + gap * 0.35, cfg, accel, maxSpeed, oy);       // '|' 右
    fireStroke(e, down - a30, bx + gap, cfg, accel, maxSpeed, oy);        // '\' 右外，向下偏右 30°
  }

  // 技能3 第二波（随后）：'/|\' —— 夹角 45°，单 '|' 居中；ox/oy 出弹点快照（缺省读机体位置）
  function fireBarrageNarrow(e, cfg, ox, oy) {
    const down = Math.PI / 2, a45 = Math.PI / 4;
    const bx = ox != null ? ox : e.x;
    const accel = 240, maxSpeed = cfg.bulletSpeed * rand(1.2, 1.4), gap = 34;   // 最大弹速逐波随机 1.2~1.4×
    fireStroke(e, down + a45, bx - gap, cfg, accel, maxSpeed, oy);        // '/'
    fireStroke(e, down, bx, cfg, accel, maxSpeed, oy);                    // '|'
    fireStroke(e, down - a45, bx + gap, cfg, accel, maxSpeed, oy);        // '\'
  }

  // ---------- 炮火先兆者导弹 ----------
  // 召唤：锁定玩家当前 x，生成垂直预警线（3s 后导弹从上方高速下落）
  function summonMissile(e) {
    missileWarns.push({ x: clamp(player.x, 14, CANVAS_W - 14), t: 0, dur: HARBINGER.warnTime });
    spawnParticles(e.x, e.y, '#ff5a3c', 14, 200);
    shake(4, 0.2);
  }

  // 导弹命中玩家的特殊结算（先兆者导弹专用伤害规则）。
  // 具象：伤害 = max(60, 当前血量 80%)——低血保底 60、不再直接秒杀；真我：不吃非BOSS增伤（enemyDmgMul），
  // 改为保底伤害 70（missileDmgMin，规则仍为 max(保底, 当前血量 80%)）；命中后武器等级 -1、暴走中断
  // （保留"直接降级"特性、不计入常规受击计数；掉命走 damagePlayer 标准流程，最终壁垒免死照常生效）
  // 虚象：missileFlatDmg 固定 50 伤害（无降级）；测试模式照常结算血量但不掉命、不掉级
  function missileHitPlayer() {
    // 虚象：导弹不再有秒杀机制——固定 50 伤害（不扣 80% 血量、不降武器等级；受击无敌照常；护盾免疫由调用方处理）
    const flat = diffMods().missileFlatDmg;
    if (flat != null) {
      if (state.challenge) {
        testDamagePlayer(flat);
        player.invuln = PLAYER_CFG.invulnTime * invulnDiffMul(); player.invulnBlink = true;   // 受击无敌：闪动提示
      } else {
        damagePlayer(flat, 1, false, false, 'missile');   // 导弹伤害：可莉 -30% 挂点
      }
      shake(8, 0.35);
      spawnParticles(player.x, player.y, '#ff5a3c', 26, 320);
      return;
    }
    const dmgMin = diffMods().missileDmgMin != null ? diffMods().missileDmgMin : HARBINGER.missileDmgMin;
    const dmg = Math.max(dmgMin, player.hp * 0.8);
    // 测试模式：导弹照常结算血量（不掉武器等级、不掉命；血量归零自动重置）
    if (state.challenge) {
      testDamagePlayer(dmg);
      player.invuln = PLAYER_CFG.invulnTime; player.invulnBlink = true;   // 受击无敌：闪动提示
      shake(8, 0.35);
      spawnParticles(player.x, player.y, '#ff5a3c', 26, 320);
      return;
    }
    // 走标准 damagePlayer（isMissile=true：不计入常规受击计数、不触发掉级累计）；命中后武器等级 -1、暴走中断
    if (damagePlayer(dmg, 1, false, true, 'missile')) {
      if (player.weapon > 1) player.weapon--;
      player.berserk = 0;
    }
    shake(8, 0.35);
    spawnParticles(player.x, player.y, '#ff5a3c', 26, 320);
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
    // 下落导弹（含辛国栋十二连发弧线导弹：m.turn 预压恒定转向、m.vx/m.vy 二维速度、m.dmg 自带伤害）
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i];
      if (m.turn) {
        // 弧线追踪：发射瞬间预压的恒定角速度旋转速度向量（不再跟踪，弧线飞行）
        const sp = Math.hypot(m.vx, m.vy) || 1;
        const na = Math.atan2(m.vy, m.vx) + m.turn * dt;
        m.vx = Math.cos(na) * sp;
        m.vy = Math.sin(na) * sp;
      }
      m.x += (m.vx || 0) * dt;
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
        if (m.dmg != null) {
          // 精英导弹：自带伤害（enemyDmgMul 难度修正），命中特效较轻
          damagePlayer(m.dmg * enemyDmgMul(), 1, false, false, null);
          spawnParticles(m.x, m.y, '#ff8a5c', 10, 200);
        } else {
          missileHitPlayer();
        }
        missiles.splice(i, 1);
        continue;
      }
      if (m.y > CANVAS_H + 40 || m.x < -60 || m.x > CANVAS_W + 60 || m.y < -80) { missiles.splice(i, 1); continue; }
    }
  }

  // 高能爆弹等清场时一并清除导弹与预警线（含暴风之眼区域标记/风流/风柱）
  function clearMissiles() {
    missileWarns.length = 0;
    missiles.length = 0;
    popianMissiles.length = 0;   // 破片三连发导弹一并清除
    wgSlashes.length = 0;        // 战争幽灵技能1/2双刃斩击流一并清除
    spellCubes.length = 0;       // 法术矩阵发光正方体一并清除
    cubeHitFx.length = 0;        // 正方体击中特效一并清除
    phaseFx.length = 0;          // 碎盾特效一并清除
    zoneMarks.length = 0;
    windFlows.length = 0;
    pillarStrikes.length = 0;
    state.stormVortex = null;   // 涡流风旋（技能7）一并清除
  }

  // 取消 BOSS 有预警的弹道（高能爆弹 / 绷绷炸弹 / 抽卡陨石共用调用方）：
  // - zoneMarks（暴风之眼纵向风波 / 风柱待落标记）清空——clearMissiles 亦会清，此处兜底独立调用场景
  // - BOSS 技能状态机中断（e.skill = null，与自然结束同构安全）——风暴编织者雷霆打击 / 技能1 激光蓄力等预警随之消散
  // - 登场中的战争幽灵（wgPhase ≤ 2：入场风波预警 / 入场冲刺 / 抵达演出）直接被砸杀
  function cancelBossWarns() {
    zoneMarks.length = 0;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (!e) continue;
      if (e.type === 'boss') {
        if (e.skill) e.skill = null;
        continue;
      }
      if (e.type === 'warGhost' && !e.dying && (e.wgPhase || 0) <= 2) killEnemy(i);
    }
  }
  
  // ---------- 破片三连发导弹 ----------
  // 从破片下方炮管射出，高速飞向锁定的红圈中心；不可被击毁（护盾仍可免疫）；命中按首发/后两发规则结算
  // 伤害按机型取值：破片 8/5（POPIAN）、破片U型 10/7（POPIAN_U），随导弹携带（dmgF/dmgW）供命中结算读取
  function spawnPopianMissile(e, tx, ty, idx, burst) {
    const ox = e.x + (idx === 0 ? 0 : (idx === 1 ? -7 : 7));   // 三发略错开出射点（中/左/右炮管感）
    const oy = e.y + 12;
    const dx = tx - ox, dy = ty - oy;
    const d = Math.hypot(dx, dy) || 1;
    const isU = e.type === 'popianU';
    popianMissiles.push({ x: ox, y: oy, ux: dx / d, uy: dy / d, spd: POPIAN.missileSpeed, r: POPIAN.missileR, tx, ty, idx, burst,
      dmgF: isU ? POPIAN_U.firstDmg : POPIAN.firstDmg, dmgW: isU ? POPIAN_U.followDmg : POPIAN.followDmg });
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

  // 破片导弹命中结算：首发伤害（dmgF：破片 8 / U型 10，正常无敌判定）；首发命中后，后两发无视无敌各
  // followDmg（破片 5 / U型 7）；若首发未命中/玩家无敌，后两发命中则无敌时间 -30%（invulnMul 0.7）
  // 破片导弹计入武器等级的受击计数，但一轮三连发（无论命中几发）仅计一次（b.counted 门控，经 accumulateWeaponDropHit 显式累加）
  function popianMissileHit(m) {
    const b = m.burst;
    let hitLanded = false;
    if (m.idx === 0) {
      if (damagePlayer(m.dmgF * enemyDmgMul(), 1, false, true, 'aoe')) { b.firstHit = true; hitLanded = true; }   // 首发成功造成伤害 → 标记，后两发无视无敌（瞬时区域伤害：可莉 -30% 挂点）
    } else if (b.firstHit) {
      damagePlayer(m.dmgW * enemyDmgMul(), 1, true, true, 'aoe');   // 无视玩家无敌时间
      hitLanded = true;
    } else {
      damagePlayer(m.dmgW * enemyDmgMul(), POPIAN.invulnCutMul, false, true, 'aoe');   // 该次受击无敌时间 -30%
      hitLanded = true;
    }
    if (hitLanded && !b.counted) { b.counted = true; accumulateWeaponDropHit(); }   // 整轮仅计一次命中
    // 命中爆炸：三层粒子（不再震屏）
    spawnParticles(m.x, m.y, '#ff5a3c', 22, 320);
    spawnParticles(m.x, m.y, '#ffb545', 14, 260);
    spawnParticles(m.x, m.y, '#ffffff', 8, 200);
  }

  /* ---------- 战争幽灵：技能循环与斩击流 ---------- */
  // 技能调度：首个 = e.wgFirst（入场随机 2 或 3），之后固定 1→2→3 循环（e.wgNext 跟踪下一个待释放技能）；
  // 每次释放后由 advanceWarGhostSkill 结算并重置 e.wgGapT = skillGap
  function startWarGhostSkill(e) {
    const kind = e.wgNext == null ? e.wgFirst : e.wgNext;
    e.wgNext = kind % 3 + 1;
    const g = WAR_GHOST;
    if (kind === 1) {
      // 技能1 两刃斩击（2026-10-02 用户定稿：登场时往两侧斩击的动作即「两刃斩击」；本技能=原地双刃展开 +
      // 扇面预警 fanWarn（预警期双刃平滑伸长至最长）→ 预警结束直接复用抵达演出同款扫转动画（扫斩 →
      // 斩后停持 0.15s → 缓速归鞘），扫斩窗口内对玩家一次性结算 fanDmg，尾后 ±30° 缺口不入扇面）
      e.wgSkill = { kind: 1, t: 0, hit: false, sweepT: null };
    } else if (kind === 2) {
      // 技能2 双斩流：双平行线 0.5s 跟随玩家 → 锁定 1.1s → 发射两道高速斩击流
      e.wgSkill = { kind: 2, t: 0, ang: Math.atan2(player.y - e.y, player.x - e.x), locked: false };
    } else {
      // 技能3 三方向扇形弹幕（2026-10-02 用户定稿，纠正上版「整圆环形」误读）：连续三波——
      // 每波取随机基准方向及与之互成 120° 的三个方向，每方向同帧齐射 3 发扇形（相邻夹角 20°、扇心对准方向）；
      // 第 2 波整体旋转 60°、第 3 波与第 1 波同向；全部排入 e.scheduled（fire 分支内推进）
      const base = Math.random() * Math.PI * 2;
      const cfg = ENEMY_TYPES.warGhost;
      const fanStep = g.barrageFanDeg * Math.PI / 180;
      for (let wave = 0; wave < 3; wave++) {
        const rot = wave === 1 ? g.barrageRotDeg * Math.PI / 180 : 0;
        for (let d = 0; d < g.barrageDirs; d++) {
          const dirAng = base + rot + d * (Math.PI * 2 / g.barrageDirs);
          for (let k = 0; k < g.barragePerDir; k++) {
            const ang = dirAng + (k - (g.barragePerDir - 1) / 2) * fanStep;
            // 黄红渐变弹（2026-10-02 用户定稿）：grad:'yr' 标记走白核→黄(#ffd24a)→红边(rgba(224,44,18,0.95))径向渐变渲染（10-draw-world gradYR 分支）
            e.scheduled.push({ t: wave * g.barrageWaveGap, fn: () => pushEBullet(e, ang, cfg.bulletSpeed, cfg, { r: g.barrageR, dmg: g.barrageDmg, color: '#ffd24a', grad: 'yr' }) });
          }
        }
      }
      e.wgSkill = { kind: 3, t: 0, dur: 2 * g.barrageWaveGap };
    }
  }

  // 技能推进与结算（仅驻留相位由 fire 分支逐帧调用）
  function advanceWarGhostSkill(e, dt) {
    const s = e.wgSkill, g = WAR_GHOST;
    s.t += dt;
    if (s.kind === 1) {
      // 技能1 两刃斩击：预警期（双刃随预警进度平滑伸长 66→最长[110.4]、扇面预警，2026-10-02 用户定稿
      // 「预警开始两刃就伸长、预警结束时已最长、结束直接开始斩击」——伸长渲染见 09-draw-ships skill1Warn 分支）
      // → 扫斩期（复用抵达演出扫转动画之扫斩+归鞘段、跳过增长段，e.wgSweepT 同步时钟供渲染，时间轴前移 arriveGrowDur）→ 收口
      if (s.sweepT == null) {
        // 预警期：期间不结算（双刃伸长由渲染侧按 s.t/fanWarn 平滑插值）
        if (s.t >= g.fanWarn) { s.sweepT = 0; s.t = 0; spawnParticles(e.x, e.y, '#ffd24a', 14, 220); }
      } else {
        // 扫斩期：sweepT 推进并同步到 e.wgSweepT（渲染 tAbs = arriveGrowDur + sweepT，直接进入扫斩段——
        // 预警结束时双刃已最长，无增长段）；扫斩判定窗口 = 扫斩段时长（sweepT ≤ arriveSweepDur），
        // 窗口内逐帧判定玩家是否落在双刃扇面（正前方两侧各 150°、合计 300°，尾后 ±30° 缺口）
        // 且距离 ≤ sweepReach，命中即一次性结算、不再重复
        s.sweepT += dt;
        e.wgSweepT = s.sweepT;
        if (!s.hit && player.alive && s.sweepT <= g.arriveSweepDur) {
          const fwd = e.wgFace + Math.PI / 2;   // 机头方向（wgFace 为竖直绘制基准，机头朝向 = +π/2）
          const aimAng = Math.atan2((player.y + PLAYER_CFG.hitOffsetY) - e.y, player.x - e.x);
          const dev = Math.atan2(Math.sin(aimAng - fwd), Math.cos(aimAng - fwd));
          if (Math.abs(dev) <= 150 * Math.PI / 180 &&
              Math.hypot(player.x - e.x, (player.y + PLAYER_CFG.hitOffsetY) - e.y) <= g.sweepReach) {
            s.hit = true;
            damagePlayer(g.fanDmg * enemyDmgMul(), 1, false, false, null);
          }
        }
        if (s.sweepT >= g.arriveFxDur - g.arriveGrowDur) {
          // 收口：清技能 + 重置间隔 + 清扫斩时钟（演出总长 = 扫斩 0.185 + 斩后停持 0.10 + 缓速归鞘 0.5 = 0.785s，2026-10-03 定稿停持缩短 + 扫斩提速 +70%）
          e.wgSkill = null; e.wgGapT = g.skillGap; e.wgSweepT = null;
        }
      }
    } else if (s.kind === 2) {
      if (!s.locked) {
        // 跟随期：双斩线中轴持续指向玩家
        s.ang = Math.atan2(player.y - e.y, player.x - e.x);
        if (s.t >= g.slashTrack) { s.locked = true; s.t = 0; }
      } else if (s.t >= g.slashLockWarn) {
        // 锁定预警结束：两刃同出（左右翼位置沿法线 ±slashGap/2）、同向直射沿锁定方向（直线飞行、每道命中一次）
        const ux = Math.cos(s.ang), uy = Math.sin(s.ang);
        const nx = -uy, ny = ux;
        for (const sd of [-1, 1]) {
          wgSlashes.push({
            x: e.x + nx * g.slashGap / 2 * sd, y: e.y + ny * g.slashGap / 2 * sd,
            ux, uy, spd: g.slashSpeed, dmg: g.slashDmg, hit: false, t: 0, flash: 0.18,   // flash：出射闪动时长（s）
          });
        }
        spawnParticles(e.x, e.y, '#ffd24a', 10, 180);
        e.wgSkill = null; e.wgGapT = g.skillGap;
      }
    } else {
      // 技能3：弹幕已全部排入 scheduled（分支内推进），此处仅等最后一发出膛后结束技能
      if (s.t >= s.dur) { e.wgSkill = null; e.wgGapT = g.skillGap; }
    }
  }

  // 技能2 斩击流：双道高速金色斩击，直线飞行不跟踪；命中一次（35 伤害，可莉等减伤修正经 enemyDmgMul）、出屏移除
  function updateWgSlashes(dt) {
    for (let i = wgSlashes.length - 1; i >= 0; i--) {
      const s = wgSlashes[i];
      s.t += dt;
      const step = s.spd * dt;
      s.x += s.ux * step;
      s.y += s.uy * step;
      if (!s.hit && player.alive &&
          Math.hypot(s.x - player.x, s.y - (player.y + PLAYER_CFG.hitOffsetY)) < PLAYER_CFG.hitRadius + 16) {   // 16：刃气判定收窄（2026-10-02 用户定稿「判定范围过大、略微变窄」26→16，与视觉刃体 ±12 匹配；双刃间隙 70px 内不再被误判）
        s.hit = true;
        damagePlayer(s.dmg * enemyDmgMul(), 1, false, false, null);
        spawnParticles(s.x, s.y, '#ffd24a', 10, 200);
      }
      if (s.x < -60 || s.x > CANVAS_W + 60 || s.y < -60 || s.y > CANVAS_H + 60) wgSlashes.splice(i, 1);
    }
  }

  /* ---------- 4F 精英：技能循环与独立射弹 ---------- */
  // 技能调度：首个 = e.elFirst（入场随机），之后固定轮换（e.elNext 跟踪下一个待释放技能；朴学峰/韩希先/
  // 辛国栋两技 1↔2 交替——朴 2026-10-02 残像换影并入流星穿刺冲③尾部后改两技 1=流星穿刺 / 2=翼根连弩，
  // 韩同日取消三眼齐光后编号重排为 1=凝视锁定 / 2=旋眼火螺，辛 1=地毯轰炸 / 2=十二连发）；
  // 夏勇例外（2026-10-03 用户定稿）：固定五步循环 e.xyStep 推进 [屏障(3), 大子弹(2), 回旋刃(1), 大子弹(2),
  // 回旋刃(1)]——屏障必定首发、每两轮释放一次；每次释放结束由各收口处重置 e.elGapT = eliteSkillGap(e)
  //（机型级 skillGap 覆盖公共值：朴/韩/辛 1.8s = 公共 1.2 × 1.5——2026-10-04 用户定稿韩/辛与朴对齐；
  // 夏勇 1.56s = 公共 1.2 × 1.3，2026-10-03 用户定稿技能间隔 +30%）
  function eliteSkillGap(e) {
    const ec = ELITES[e.type];
    return (ec && ec.skillGap) || ELITES.skillGap;
  }
  function startEliteSkill(e) {
    const g = ELITES, c = g[e.type];
    const total = 2;   // 朴/韩/辛 两技 1↔2 轮换
    let idx;
    if (e.type === 'xiayong') {
      idx = [3, 2, 1, 2, 1][e.xyStep || 0];   // 固定五步循环：屏障→大子弹→回旋刃→大子弹→回旋刃
      e.xyStep = ((e.xyStep || 0) + 1) % 5;
    } else {
      idx = e.elNext || e.elFirst;
      e.elNext = idx % total + 1;
    }
    e.elSkill = { kind: idx, t: 0 };
    switch (e.type) {
      case 'puxuefeng':
        if (idx === 1) {
          // 流星穿刺：三连冲（竖→横→斜）——冲①沿本体所在竖直线直接下冲（不向玩家对齐）；相位链
          // 10→11→12→13→14→15→0 见 updateEnemyMovement，冲③行进至 80% 行程处留残像（残像换影并入
          // 冲③尾部，本体继续冲完，残像由 advanceEliteMinions 推进爆开收口 = 本技能收口点）
          e.elSkill.ang = Math.PI / 2;   // 冲①竖直向下（机头朝下），冲②/③转向见相位 11/13 收口锁定
          e.elSkill.dist = 0;
          e.elSkill.w1o = { x: e.x, y: e.y };   // 预警①带起点 = 静驻点（冲①期间本体移动，绘制层需固定锚点）
          e.elPhase = 10; e.elT = 0; e.elSpd = 0;
        } else {
          // 翼根连弩：三段扇形连射状态（advanceEliteSkill 推进），本体保持驻留摆动
          e.elSkill.seg = 0; e.elSkill.shotI = 0; e.elSkill.segT = 0; e.elSkill.reloadT = 0;
        }
        break;
      case 'hanxixian':
        if (idx === 1) {
          // 凝视锁定：红细追踪线先跟随（trackT）→ 锁定静止 holdT（方向固定不开火）→ 粗激光沿固定方向
          //（advanceEliteSkill 推进三段时序）
          e.elSkill.ang = Math.atan2(player.y - e.y, player.x - e.x);
          e.elSkill.locked = false; e.elSkill.fired = false;
        } else {
          // 旋眼火螺：三炮塔公转角随机起始，advanceEliteSkill 推进公转+径向射击（长条弹 / 诗篇加速长条）
          e.elSkill.ang = Math.random() * Math.PI * 2;
          e.elSkill.fireT = 0; e.elSkill.flipped = false;
        }
        break;
      case 'xiayong':
        if (idx === 3) {
          // 屏障（2026-10-03 用户新增，固定循环首发）：立即生效——红色流动护盾（绘制层 drawEliteFx），
          // 吸收量按难度 barHp/realmeBarHp/poemBarHp，重复释放刷新；期间移速不降低（2026-10-03 五轮定稿）；
          // 即时收口不占演出
          e.xyBarOn = true;
          e.xyBarHp = e.xyBarMax = isPoem() ? c.poemBarHp : isRealme() ? c.realmeBarHp : c.barHp;
          e.xyBarBorn = state.time;   // 展开特效锚点（10-draw-world 按 age 播 0.35s easeOut 展开动画，重复释放重播）
          spawnBlastRing(e.x, e.y, Math.max(e.w, e.h) * 0.85, '#ff5a6a', 0.35);   // 展开伴随红色冲击环
          spawnParticles(e.x, e.y - 10, '#ff4652', 12, 200);
          e.elSkill = null; e.elGapT = eliteSkillGap(e) * (c.barGapMul || 1);   // 屏障后下一次技能间隔 ×1.7（barGapMul，2026-10-03 二轮定稿）
        } else if (idx === 1) {
          // 碎翼回旋刃（2026-10-03 用户定稿再改版）：先显示预警曲线 bladeWarn（轨道虚线，绘制层从
          // elSkill.cx/cy + t < bladeWarn 渲染）→ 双刃自本体中心迸出（bladeOut 内 smoothstep 飞至轨道
          // 锚点，advanceEliteMinions 生成）→ 反向绕行整一圈（bladeDur）原地湮灭收口；轨道中心 =
          // 施放瞬间本体位置下移 bladeCyOff（下缘掠过玩家高度带），本体保持驻留（含水平追踪）不额外移动
          e.elSkill.cx = e.x; e.elSkill.cy = e.y + c.bladeCyOff;
          e.elSkill.ry = c.bladeRy + Math.random() * c.bladeRyRand * CANVAS_H;   // 轨道纵向半径随机增长 0~20% 屏高（bladeRyRand，2026-10-03 四轮定稿），预警椭圆与刃体同步
          e.xyBlades = null;
        } else {
          // 核心膨胀：一次推出三颗能量球（基准朝玩家方向、相邻夹角 60°），方向锁定施放瞬间玩家方位
          //（缓慢漂移不跟踪）；各自飞行 orbDur 后原地爆散（分裂弹数按难度 6/8/10，黑红渐变），全部爆散后收口
          const sx = e.x, sy = e.y + e.h / 2 + 14;
          const base = player.alive ? Math.atan2(player.y - sy, player.x - sx) : Math.PI / 2;
          e.xyOrbs = [];
          for (let i = -1; i <= 1; i++) {
            const a = base + i * Math.PI / 3;
            e.xyOrbs.push({ x: sx, y: sy, vx: Math.cos(a) * c.orbSpd, vy: Math.sin(a) * c.orbSpd, t: 0, r: 14 });
          }
        }
        break;
      case 'xinguodong':
        if (idx === 1) {
          // 地毯轰炸（2026-10-04 用户定稿改版）：真我/诗篇 = 原逻辑，全程追踪玩家水平位置（对齐段/
          // 投弹段同款追踪公式，见移动相位 40/42）；lockY = 释放瞬间玩家高度（虚象/具象扫射的投弹
          // 高度 + 真我/诗篇玩家死亡期间的投弹回退高度）。虚象/具象 = 扫射：朝玩家所在水平方向
          //（sweepDir）横移，持续往 [本体当前 x，lockY] 投弹（水平实时随本体、竖直锁定不变，
          // 横移沿路径铺弹成带——2026-10-04 终版定稿），撞边界收口（跳过对齐段，直接进投弹相位 42）
          e.elSkill.lockY = player.alive ? player.y : CANVAS_H * c.bombBandPct;
          e.elSkill.sweep = !(isPoem() || isRealme());
          e.elSkill.sweepDir = player.alive ? (player.x >= e.x ? 1 : -1) : 1;
          e.elSkill.dropped = 0;
          e.elSkill.dropT = 0;   // 扫射直接进相位 42（跳过对齐段），投弹节拍计时必须在此初始化——否则 undefined+dt=NaN，while(NaN>=dropIv) 永假 → 空放 bug（2026-10-04 修复）
          e.elPhase = e.elSkill.sweep ? 42 : 40; e.elT = 0; e.elSpd = 0;
        } else {
          // 十二连发 × 2 轮：每轮两批 × 6 发扇形轻追踪导弹（advanceEliteSkill 推进批次）；
          // 轮间隔释放瞬间随机抽取（普通 1.2~1.6s / 诗篇 1.0~1.4s，登记《诗篇难度修正.md》）
          const gr = isPoem() ? c.poemVolleyRoundGapRange : c.volleyRoundGapRange;
          e.elSkill.batchT = 0; e.elSkill.firedBatches = 0;
          e.elSkill.gap2 = rand(gr[0], gr[1]);
        }
        break;
    }
  }

  // 驻留技能推进（仅 elPhase === 1 由 fire 分支调用；elSkill.t 已在移动骨架顶部全局推进，此处只读）
  function advanceEliteSkill(e, dt) {
    const s = e.elSkill, c = ELITES[e.type], cfg = ENEMY_TYPES[e.type];
    if (e.type === 'puxuefeng' && s.kind === 2) {
      // 翼根连弩：多段扇形连射——段首锁定瞄准角、段内扇位固定展开（射击均匀）；段内/段间同节拍 segGap；
      // 射完 reload 装填空档后技能结束
      // 段数/弹数/间隔按难度（2026-10-04 二次定稿）：真我 5 发/段、诗篇回调 6 发/段（poemSegShots）；
      // 虚象/具象 2 段/0.14s，真我/诗篇 3 段（segGap 0.12s/0.1s 沿用）
      const shots = isPoem() ? c.poemSegShots : c.segShots;
      const segGap = isPoem() ? c.poemSegGap : isRealme() ? c.realmeSegGap : c.segGap;
      const segCount = (isPoem() || isRealme()) ? c.realmeSegCount : c.segCount;
      if (s.seg < segCount) {
        s.segT += dt;
        while (s.segT >= segGap && s.shotI < shots) {
          s.segT -= segGap;
          if (s.shotI === 0) s.base = Math.atan2(player.y - e.y, player.x - e.x);   // 段首锁定瞄准角——段内扇形固定展开，射击均匀不随玩家甩动
          if (player.alive) {
            const spread = isPoem() ? c.poemSegSpreadDeg : c.segSpreadDeg;   // 诗篇总张角 32.5°：相邻夹角与低难度一致 6.5°/颗、散射范围扩大（2026-10-08 用户定稿）
            const off = (s.shotI - (shots - 1) / 2) * (spread / (shots - 1)) * Math.PI / 180;
            pushEBullet(e, s.base + off, c.bulletSpeed, cfg, { r: c.bulletR, dmg: c.dmg, color: '#e02424', grad: 'hr' });   // 黑红渐变（四精英统一色系，2026-10-03）
          }
          s.shotI++;
        }
        if (s.shotI >= shots) { s.seg++; s.shotI = 0; s.segT = -0.15; }   // 段间微歇
      } else {
        s.reloadT += dt;
        if (s.reloadT >= c.reload) { e.elSkill = null; e.elGapT = eliteSkillGap(e); }
      }
      return;
    }
    if (e.type === 'hanxixian') {
      if (s.kind === 1) {
        // 凝视锁定：追踪期 trackT（红细线跟随）→ 锁定静止期 holdT（方向固定不开火，红细线保持指向）
        // → 粗激光 laserDur（沿锁定方向射线，玩家到射线垂距 ≤ laserHalfW + 判定半径即命中，每帧判定）
        if (!s.locked) {
          if (player.alive) s.ang = Math.atan2(player.y - e.y, player.x - e.x);
          if (s.t >= c.trackT) { s.locked = true; s.t = 0; }
        } else if (!s.fired) {
          // 锁定静止期 0.5s：不开火（2026-10-02 用户定稿时序），holdT 后进入激光
          if (s.t >= c.holdT) { s.fired = true; s.t = 0; }
        } else if (s.t >= (isPoem() ? c.laserDur
          : isRealme() ? c.realmeLaserDur
          : currentDifficulty.id === 'form' ? c.formLaserDur : c.illusionLaserDur)) {
          // 激光持续按难度（2026-10-04 用户定稿）：0.5/0.6/0.8/0.9s（较旧值分别 -0.4/-0.3/-0.1/0）
          e.elSkill = null; e.elGapT = eliteSkillGap(e);
        } else if (player.alive) {
          const ux = Math.cos(s.ang), uy = Math.sin(s.ang);
          const px = player.x - e.x, py = player.y - e.y;
          const proj = px * ux + py * uy;
          if (proj > 0 && Math.abs(px * uy - py * ux) < c.laserHalfW + PLAYER_CFG.hitRadius) {
            damagePlayer(c.laserDmg * enemyDmgMul(), 1, false, false, null);
          }
        }
      } else {
        // 旋眼火螺：三炮塔绕本体公转（orbitR / orbitSpd），每 fireIv 各沿径向外射一发长条弹
        //（诗篇改加速长条弹：初速≈0 → 180% 弹速，accel 300 同 3/4 类加速弹惯例，登记《诗篇难度修正.md》），中途反转一次
        if (!s.flipped && s.t >= c.orbitDur / 2) s.flipped = true;
        s.ang += c.orbitSpd * dt * (s.flipped ? -1 : 1);
        s.fireT += dt;
        while (s.fireT >= c.fireIv) {
          s.fireT -= c.fireIv;
          for (let i = 0; i < c.turretN; i++) {
            const ta = s.ang + i * Math.PI * 2 / c.turretN;
            const opts = {
              x: e.x + Math.cos(ta) * c.orbitR, y: e.y + Math.sin(ta) * c.orbitR,
              r: c.bulletR, dmg: c.dmg, color: '#8a1018', len: SHIP_BULLET_LEN,   // 黑红但不过黑（2026-10-03 用户定稿：头端深红黑、弹身仍白热渐变）
            };
            if (isPoem()) {
              opts.accel = 300; opts.maxSpeed = c.bulletSpeed * 1.8;
              pushEBullet(e, ta, 2, cfg, opts);
            } else {
              pushEBullet(e, ta, c.bulletSpeed, cfg, opts);
            }
          }
        }
        if (s.t >= c.orbitDur) { e.elSkill = null; e.elGapT = eliteSkillGap(e); }
      }
      return;
    }
    if (e.type === 'xinguodong' && s.kind === 2) {
      // 连发导弹（2026-10-04 用户定稿改版）：每批 volleyN 发扇形轻追踪导弹（批间隔 volleyGap 0.5s），
      // 轮间随机 gap2 间隔（普通 1.2~1.6s / 诗篇 1.0~1.4s，释放瞬间抽取见 startEliteSkill）；
      // 虚象/具象 = 仅 1 轮（2 批 × 4 发 = 8 发）且导弹初速/转向减小（illusionMissileSpeed/Turn，弧度更平）；
      // 真我 = 8 发（每批 4 发 × 2 批）仍 2 轮；诗篇 = 12 发 2 轮不变（每批 6 发，登记《诗篇难度修正.md》#31，
      // 上移演出见移动相位 1，收口后下次技能间隔 +poemVolleyGapAdd）。发射瞬间按扇位偏移预压恒定转向
      //（外侧弹向内弧线回收，不再跟踪）；missiles 数组通用推进（turn 字段分支见 updateMissiles）
      s.batchT += dt;
      const vn = isPoem() ? c.poemVolleyN : c.volleyN;
      const maxB = (isPoem() || isRealme()) ? 4 : c.illusionBatches;   // 批数收口：诗篇/真我 4（2 轮），虚象/具象 2（1 轮）
      const mSpd = (isPoem() || isRealme()) ? c.missileSpeed : c.illusionMissileSpeed;
      const mTurn = (isPoem() || isRealme()) ? c.missileTurn : c.illusionMissileTurn;
      const iv = s.firedBatches === 2 ? s.gap2 : c.volleyGap;   // 第 2 批后为轮间隔，其余为批间隔
      if (s.firedBatches === 0 || s.batchT >= iv) {
        s.batchT = 0;
        s.firedBatches++;
        const base = player.alive ? Math.atan2(player.y - e.y, player.x - e.x) : Math.PI / 2;
        const step = c.volleySpreadDeg / (vn - 1) * Math.PI / 180;
        for (let i = 0; i < vn; i++) {
          const off = i - (vn - 1) / 2;
          const ang = base + off * step;
          missiles.push({
            x: e.x, y: e.y + e.h / 2,
            vx: Math.cos(ang) * mSpd, vy: Math.sin(ang) * mSpd,
            turn: off === 0 ? 0 : -Math.sign(off) * mTurn,   // 预压转向：外侧弹弧线收回玩家方向
            r: c.missileR, dmg: c.missileDmg,
            dk: 1,   // 深色弹体标记（09-draw-ships drawMissiles 分支：辛国栋导弹弹体略微压暗——2026-10-03 用户定稿）
          });
        }
        spawnParticles(e.x, e.y + e.h / 2, '#ff4652', 8, 160);
        if (s.firedBatches >= maxB) {
          e.elSkill = null;
          e.elGapT = eliteSkillGap(e) + (isPoem() ? c.poemVolleyGapAdd : 0);   // 诗篇齐射后下次技能间隔 +0.5s
        }
      }
      return;
    }
    // 夏勇·碎翼回旋刃（kind 1）与核心膨胀（kind 2）：挂载由 advanceEliteMinions 推进并各自收口，此处无逐帧逻辑
  }

  // 精英独立射弹与挂载推进（fire 分支全相位调用，离场瞬间除外——离场清场见移动骨架 elPhase 1→2 转换）
  function advanceEliteMinions(e, dt) {
    const c = ELITES[e.type];
    // 狞笑朴学峰残像（流星穿刺冲③尾部，残像换影并入——2026-10-02）：afterT 后原地爆开 burstN 发
    // 环形短弹，随即清除（流星穿刺技能由爆开收口）
    if (e.elRemnant) {
      e.elRemnant.t += dt;
      if (e.elRemnant.t >= c.afterT) {
        // 爆开弹数按难度（2026-10-04 用户定稿）：6/7/8/9 发（虚象/具象/真我/诗篇）
        const bN = isPoem() ? c.poemBurstN : isRealme() ? c.realmeBurstN
          : currentDifficulty.id === 'form' ? c.formBurstN : c.burstN;
        const base = Math.random() * Math.PI * 2;
        for (let i = 0; i < bN; i++) {
          pushEBullet(e, base + i * Math.PI * 2 / bN, c.burstSpeed, ENEMY_TYPES.puxuefeng,
            { x: e.elRemnant.x, y: e.elRemnant.y, r: 5, dmg: c.burstDmg, color: '#e02424', grad: 'hr' });   // 黑红渐变（同翼根连弩弹，2026-10-03）
        }
        spawnParticles(e.elRemnant.x, e.elRemnant.y, '#ffd0c0', 14, 220);
        e.elRemnant = null;
        if (e.elSkill && e.elSkill.kind === 1) { e.elSkill = null; e.elGapT = eliteSkillGap(e); }
      }
    }
    // 铜皮夏勇碎翼回旋刃（kind 1，2026-10-03 用户定稿再改版）：预警期（elSkill.t < bladeWarn）只显示轨道
    // 虚线（绘制层）→ 到时双刃自本体中心迸出（bladeOut 内 smoothstep 飞至轨道锚点，起步/到位速度连续）
    // → 反向绕行整一圈（恒定角速度 2π/bladeDur，一正一反，绕行长轴端峰值 ≈11px/帧）→ 原地湮灭收口；
    // 刃体全程对玩家圆碰撞（命中 0.6s 冷却）+ 拖尾采样（绘制层消费 trail）；技能被外部清除时残刃直接湮灭
    if (e.type === 'xiayong' && e.elSkill && e.elSkill.kind === 1 && !e.xyBlades && e.elSkill.t >= c.bladeWarn) {
      e.xyBlades = [];
      for (const dir of [1, -1]) {
        const ang0 = dir > 0 ? -Math.PI / 4 : Math.PI + Math.PI / 4;   // 右上 / 左上锚点（对称）
        // 迸出时长自适应（2026-10-03 二轮定稿）：本体预警期水平追踪会使迸出距离大于基准 ≈141px
        //（施放快照锚点 vs 生成帧本体位置），固定 bladeOut 会拉高 smoothstep 峰速——按实际距离
        // 等比加长 outDur（保持均速 = 基准 141px/0.35s ≈ 403px/s，峰速恒 ≈10px/帧 < 12——速度铁律）
        const ax0 = e.elSkill.cx + Math.cos(ang0) * c.bladeRx, ay0 = e.elSkill.cy + Math.sin(ang0) * e.elSkill.ry;
        const baseDist = Math.hypot(Math.cos(ang0) * c.bladeRx, Math.sin(ang0) * c.bladeRy);
        const dist = Math.hypot(ax0 - e.x, ay0 - e.y);
        e.xyBlades.push({ dir, ang: ang0, ang0, phase: 'out', ft: 0, outDur: Math.max(c.bladeOut, dist * c.bladeOut / baseDist), orbitT: 0, sx: e.x, sy: e.y, x: e.x, y: e.y, hitT: 0, done: false, trail: [] });
      }
      spawnParticles(e.x, e.y, '#3a0a10', 8, 170);
    }
    if (e.xyBlades && e.xyBlades.length) {
      const s1 = e.elSkill && e.elSkill.kind === 1 ? e.elSkill : null;
      if (!s1) {
        // 外部清除（离场/击毁）：残刃直接湮灭（elSkill 已空，仅清挂载）
        for (const b of e.xyBlades) {
          if (b.done) continue;
          spawnParticles(b.x, b.y, '#3a0a10', 8, 160);
          b.done = true;
        }
      } else {
        for (const b of e.xyBlades) {
          if (b.done) continue;
          if (b.hitT > 0) b.hitT -= dt;
          if (b.phase === 'out') {
            // 迸出段：本体中心 → 轨道锚点（smoothstep，outDur 按实际距离自适应——峰速恒 ≈10px/帧 < 12 阈值）
            b.ft += dt;
            const p = Math.min(1, b.ft / (b.outDur || c.bladeOut));
            const sp = p * p * (3 - 2 * p);
            const ax = s1.cx + Math.cos(b.ang) * c.bladeRx, ay = s1.cy + Math.sin(b.ang) * s1.ry;
            b.x = b.sx + (ax - b.sx) * sp;
            b.y = b.sy + (ay - b.sy) * sp;
            if (p >= 1) { b.phase = 'orbit'; b.orbitT = 0; }
          } else {
            // 绕行段：恒定角速度，两刃反向交汇的**第二次相撞**即刻湮灭（2026-10-03 三轮定稿）：
            // 起始角差 1.5π + 相对再转 0.5π → 各自行程 1.75π（≈1.575s），相遇点 = 椭圆正下缘中央；
            // 角度行程判定 + 消散点钳到相撞点，杜绝任何 dt 累积误差的多转
            b.orbitT += dt;
            b.ang += b.dir * (Math.PI * 2 / c.bladeDur) * dt;
            const MERGE_TRAVEL = Math.PI * 1.75;
            if ((b.ang - b.ang0) * b.dir >= MERGE_TRAVEL) {
              b.ang = b.ang0 + b.dir * MERGE_TRAVEL;   // 相撞点（两刃同点重合）
              b.x = s1.cx + Math.cos(b.ang) * c.bladeRx;
              b.y = s1.cy + Math.sin(b.ang) * s1.ry;
              spawnParticles(b.x, b.y, '#3a0a10', 14, 210);   // 暗黑湮灭团
              spawnParticles(b.x, b.y, '#e02424', 10, 290);   // 红色火花迸散
              spawnParticles(b.x, b.y, '#ffd9c8', 6, 350);    // 白热闪点
              b.done = true;
              continue;
            }
            b.x = s1.cx + Math.cos(b.ang) * c.bladeRx;
            b.y = s1.cy + Math.sin(b.ang) * s1.ry;
          }
          b.trail.push({ x: b.x, y: b.y });
          if (b.trail.length > 12) b.trail.shift();
          // 量子护盾消解（2026-10-04 二次定稿：白盾阻挡取消——回旋刃不再被守愿者白盾挡住，恢复原设定；
          // 玩家量子护盾气泡仍可消解）
          if (player.alive && player.shield > 0 &&
              Math.hypot(b.x - player.x, b.y - player.y) < 36 + c.bladeR) {
            spawnParticles(b.x, b.y, '#6fe3ff', 10, 200); b.done = true; continue;
          }
          if (player.alive && b.hitT <= 0 &&
              Math.hypot(b.x - player.x, b.y - (player.y + PLAYER_CFG.hitOffsetY)) < c.bladeR + PLAYER_CFG.hitRadius) {
            damagePlayer(c.bladeDmg * enemyDmgMul(), 1, false, false, null);
            b.hitT = 0.6;
          }
        }
        if (e.xyBlades.every(b => b.done)) {
          e.xyBlades = null;
          e.elSkill = null;
          e.elGapT = eliteSkillGap(e);   // 一圈绕完湮灭收口
        }
      }
      if (e.xyBlades && e.xyBlades.every(b => b.done)) e.xyBlades = null;
    }
    // 铜皮夏勇屏障破盾检测（技能3，2026-10-03 用户定稿）：xyBarHp 耗尽 → 三角碎片击碎特效（phaseFx red 变体）并结束屏障
    if (e.xyBarOn && !(e.xyBarHp > 0)) {
      e.xyBarOn = false;
      // 破盾击碎特效（2026-10-03 用户定稿）：复用群星之杀碎盾的 phaseFx 三角碎片迸飞（红色系）——
      // 白热闪核 + 12 枚三角碎片自罩心加速外飞随机自旋（08-entities 衰减 / 10-draw-world drawPhaseFx 绘制）
      const shards = [];
      for (let k = 0; k < 12; k++) shards.push({
        a: Math.random() * Math.PI * 2,
        w: (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 8),   // 自旋角速度（rad/s，随机方向）
        v0: 120 + Math.random() * 70,   // 迸射初速（px/s）
        acc: 425 + Math.random() * 225,   // 迸射加速度（px/s²）
      });
      phaseFx.push({ x: e.x, y: e.y, t: 0.5, max: 0.5, hue: 'red', r: Math.max(e.w * 0.98, e.h * 0.92) * 0.5 + 6, shards });
      spawnParticles(e.x, e.y, '#ff4652', 18, 260);
    }
    // 铜皮夏勇核心膨胀能量球（kind 2，2026-10-03 分裂改版）：锁定方向缓慢漂移 + 膨胀；接触伤害（每帧判定）；
    // 飞行 orbDur 后各自原地爆散环形弹（黑红渐变，弹数按难度 普通 6 / 真我 8 / 诗篇 10），全部爆散后收口技能
    if (e.xyOrbs && e.xyOrbs.length) {
      const s3 = e.elSkill && e.elSkill.kind === 2 ? e.elSkill : null;
      let allDone = true;
      const ringN = isPoem() ? c.poemRingN : isRealme() ? c.realmeRingN
        : currentDifficulty.id === 'form' ? c.formRingN : c.ringN;
      for (const o of e.xyOrbs) {
        if (o.t < c.orbDur) {
          allDone = false;
          o.t += dt;
          o.x += o.vx * dt;
          o.y += o.vy * dt;
          o.r = Math.min(c.orbR, 14 + o.t * c.orbGrow);
          if (player.alive &&
              Math.hypot(o.x - player.x, o.y - (player.y + PLAYER_CFG.hitOffsetY)) < o.r + PLAYER_CFG.hitRadius) {
            damagePlayer(c.ringDmg * enemyDmgMul(), 1, false, false, null);
          }
          if (o.t >= c.orbDur) {
            const base = Math.random() * Math.PI * 2;
            for (let i = 0; i < ringN; i++) {
              pushEBullet(e, base + i * Math.PI * 2 / ringN, c.ringSpeed, ENEMY_TYPES.xiayong,
                { x: o.x, y: o.y, r: 5, dmg: c.ringDmg, color: '#e02424', grad: 'hr' });
            }
            spawnParticles(o.x, o.y, '#5a1420', 14, 240);
          }
        }
      }
      if (allDone) {
        e.xyOrbs = null;
        if (s3) { e.elSkill = null; e.elGapT = eliteSkillGap(e); }
      }
    }
    // 暴怒辛国栋地毯轰炸落点：预警/半径按难度（2026-10-04 用户定稿改版，登记《诗篇难度修正.md》#12）：
    // 预警 虚象/具象 0.8s / 真我 1.0s / 诗篇 0.9s；半径 虚象/具象 73 / 真我 60 / 诗篇 75（绘制层渲染落点圈）
    const xgBlastR = isPoem() ? c.poemBombR : isRealme() ? c.realmeBombR : c.bombR;
    const xgWarnT = isPoem() ? c.poemBombWarn : isRealme() ? c.realmeBombWarn : c.bombWarn;
    for (let i = e.xgBombs.length - 1; i >= 0; i--) {
      const b = e.xgBombs[i];
      b.t += dt;
      if (b.t >= xgWarnT) {
        if (player.alive && Math.hypot(b.x - player.x, b.y - player.y) <= xgBlastR) {
          damagePlayer(c.bombDmg * enemyDmgMul(), 1, false, false, null);
        }
        spawnParticles(b.x, b.y, '#ff4652', 20, 300);
        spawnBlastRing(b.x, b.y, xgBlastR, '#ff5a6a', 0.3);
        shake(4, 0.2);
        e.xgBombs.splice(i, 1);
      }
    }
  }

  // 辛国栋击毁后残留的地毯轰炸落点（killEnemy 从 e.xgBombs 转存进 state.xgLooseBombs）：
  // 继续倒计时并爆炸——伤害 / 预警 / 半径按难度（在场弹同款取值，见 advanceEliteMinions 尾段）；
  // 实体已不在场，此循环独立于精英存活每帧推进（14-main 调度）
  function updateXgLooseBombs(dt) {
    if (!state.xgLooseBombs.length) return;
    const c = ELITES.xinguodong;
    const blastR = isPoem() ? c.poemBombR : isRealme() ? c.realmeBombR : c.bombR;
    const warnT = isPoem() ? c.poemBombWarn : isRealme() ? c.realmeBombWarn : c.bombWarn;
    for (let i = state.xgLooseBombs.length - 1; i >= 0; i--) {
      const b = state.xgLooseBombs[i];
      b.t += dt;
      if (b.t >= warnT) {
        if (player.alive && Math.hypot(b.x - player.x, b.y - player.y) <= blastR) {
          damagePlayer(c.bombDmg * enemyDmgMul(), 1, false, false, null);
        }
        spawnParticles(b.x, b.y, '#ff4652', 20, 300);
        spawnBlastRing(b.x, b.y, blastR, '#ff5a6a', 0.3);
        shake(4, 0.2);
        state.xgLooseBombs.splice(i, 1);
      }
    }
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

  // 法术阵列：发射大号红色正方体（较常规正方体大一号、红光更强、伤害 26）；
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
      spinSeed: rand(0, Math.PI * 2),   // 三轴翻滚初相（多枚大正方体翻滚姿态互不相同）
      spinMul: rand(0.8, 1.25) * 2,     // 三轴翻滚速度扰动 ×2（法术阵列大正方体转速翻倍，2026-09 批次）
      splitDist: maxRange * rand(FASHI_ARRAY.splitMin, FASHI_ARRAY.splitMax),
      warnT: -1,   // <0 = 未进入分裂预警
    });
    spawnParticles(e.x, e.y, '#ffd9d9', 4, 90);
  }

  // 大正方体分裂：原地裂为 3 枚常规法术矩阵正方体——1 枚沿原方向、2 枚垂直于原方向；
  // 射程继承剩余射程、以最大尺寸直接出现；伴随微弱冲击波爆炸特效（k 缩放 drawCubeHitFx 扩散半径）；
  // 二类·穿透标记 swPen 由母体继承（母体已穿盾时，分裂体在盾后生成，不再触盾也应保持减伤一致性）
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
        swPen: c.swPen,
      });
    }
    spawnParticles(c.x, c.y, '#ff5a6e', 8, 180);
    spawnParticles(c.x, c.y, '#ffd9d9', 5, 140);
    cubeHitFx.push({ x: c.x, y: c.y, t: 0.3, max: 0.3, r: c.r * 0.6, k: 0.45 });
    spellCubes.splice(i, 1);
  }

  // 正方体生命周期：fly（平滑加速巡航）→ brake（临近射程减速滑行，末段提前渐隐，速度归零时恰好 alpha=0 消失）
  //   二类·穿透射弹（注册表见 01-config BULWARK 注释）：守愿者白盾无法截断——触盾直接穿过并标记 swPen，
  //   此后命中玩家伤害 -50%（法术阵列大正方体分裂出的常规正方体继承标记）
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
      }
      // 白红光效拖尾在绘制层实现（drawSpellCubes 沿运动反方向画渐变光带，非粒子），此处不再生成拖尾粒子
      // 二类·穿透射弹：守愿者白盾无法截断——触盾直接穿过（仅弱化火花），标记 swPen 后命中伤害 -50%
      if (bulwarkActive()) {
        const hit = shieldSweepHit(px, py, c.x, c.y, c.r);
        if (hit && !c.swPen) {
          c.swPen = true;
          spawnParticles(hit.x, hit.y, '#eaf6ff', 4, 110);
        }
      }
      // 护盾消解（正方体不可被击毁，但护盾仍免疫）
      if (player.shield > 0 && player.alive && Math.hypot(c.x - player.x, c.y - player.y) < 36 + c.r) {
        spawnParticles(c.x, c.y, '#6fe3ff', 10, 180);
        spellCubes.splice(i, 1);
        continue;
      }
      // 命中玩家判定点（渐隐门控：alpha 低于 35% 不再构成威胁——与暴风之眼区域打击同规则）；
      // 穿过守愿者白盾（swPen）后伤害 -50%
      if (c.alpha > 0.35 && player.alive &&
          Math.hypot(c.x - player.x, c.y - (player.y + PLAYER_CFG.hitOffsetY)) < PLAYER_CFG.hitRadius + c.r) {
        damagePlayer((c.swPen ? c.dmg * 0.5 : c.dmg) * enemyDmgMul());
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
  // （b.g 标记暴鸰·G 的炸弹：爆炸半径 ×1.3，其余运动参数同暴鸰；
  //   b.u 标记虚幻的炸弹：运动参数同暴鸰，爆炸后原点留下寒冷区域（对玩家生效，诗篇对双方），引信/尾焰为深蓝冷焰）
  function updateBaolingBombs(dt) {
    for (let i = blBombs.length - 1; i >= 0; i--) {
      const b = blBombs[i];
      const C = b.u ? UNREAL : BAOLING;   // 虚幻炸弹运动参数（当前与暴鸰同值，读 UNREAL 保持单一来源）
      b.t += dt;
      if (b.phase === 'drop') {
        // 低速下坠（初速极低，无高初速）
        b.y += C.dropSpeed * dt;
        if (Math.random() < 0.35) spawnParticles(b.x, b.y, b.u ? '#5b8cff' : '#ffb545', 1, 40);   // 引信余火（虚幻：深蓝冷焰）
        if (b.t >= b.dropDur) {
          b.phase = 'strike';
          const dx = b.tx - b.x, dy = b.ty - b.y;
          const d = Math.hypot(dx, dy) || 1;
          b.ux = dx / d; b.uy = dy / d;   // 目标为静止预警区中心：方向固定
        }
      } else {
        // 极强加速冲刺：初速延续下坠低速，随后爆发加速
        b.spd += C.strikeAccel * dt;
        const step = b.spd * dt;
        const dist = Math.hypot(b.tx - b.x, b.ty - b.y);
        if (step >= dist) {
          explodeBaolingBomb(b);
          blBombs.splice(i, 1);
          continue;
        }
        b.x += b.ux * step;
        b.y += b.uy * step;
        if (Math.random() < 0.6) spawnParticles(b.x, b.y, b.u ? '#4d7dff' : '#ff7a45', 1, 36);   // 高速尾焰（虚幻：深蓝冷焰）
      }
    }
  }

  // 炸弹爆炸（投掷命中）：红色预警区中心爆开，仅对玩家结算伤害（范围内）（不再震屏）
  // （暴鸰·G 的炸弹（b.g）爆炸半径 ×1.3，伤害同暴鸰；
  //   虚幻的炸弹（b.u）伤害 70%，爆炸后原点留下寒冷区域——只对玩家生效（诗篇对双方生效，见 UNREAL 注释））
  function explodeBaolingBomb(b) {
    const BLC = b.u ? UNREAL : b.g ? BAOLING_G : BAOLING;
    if (b.u) {
      spawnParticles(b.tx, b.ty, '#7fd4ff', 30, 320);   // 冰蓝霜爆（虚幻）
      spawnParticles(b.tx, b.ty, '#bfe8ff', 18, 260);
      spawnParticles(b.tx, b.ty, '#ffffff', 10, 200);
      spawnFrostZone(b.tx, b.ty, 'throw');
    } else {
      spawnParticles(b.tx, b.ty, '#ff5a3c', 30, 320);
      spawnParticles(b.tx, b.ty, '#ffb545', 18, 260);
      spawnParticles(b.tx, b.ty, '#ffffff', 10, 200);
    }
    if (player.alive &&
        Math.hypot(player.x - b.tx, player.y - b.ty) <= BLC.blastR) {
      damagePlayer(BLC.playerDmg * enemyDmgMul(), 1, false, false, 'aoe');   // 瞬时区域伤害：可莉 -30% 挂点（虚幻为暴鸰 70%）
    }
  }

  // 暴鸰投弹：炸弹脱离本体，交由 blBombs 独立飞向预警区中心——一旦脱离，击毁暴鸰也无法终止
  // （三机同规则：停车锁定瞬间即脱离，预警倒计时全程弹体已在下坠；仅「预警区形成前（尚未锁定）」被击毁才原地殉爆）
  function throwBaolingBomb(e) {
    blBombs.push({
      x: e.x, y: e.y + 18,
      tx: e.blWarn.tx, ty: e.blWarn.ty,
      phase: 'drop', t: 0, spd: BAOLING.dropSpeed, ux: 0, uy: 1,
      dropDur: rand(BAOLING.dropTimeMin, BAOLING.dropTimeMax),   // 低速下坠时长逐弹随机 0.6~0.8s（2026-09-29 起锁定瞬间即投弹，起点较旧版提前 0.35s）
      g: e.type === 'baolingG',   // 暴鸰·G 标记：绘制胶囊弹形、爆炸半径 ×1.3
      u: e.type === 'unreal',     // 虚幻标记：绘制蓝/深蓝渐变矩形弹（圆柱涂装）、伤害 70%、爆炸留寒冷区域
    });
    if (e.type === 'unreal') {
      spawnParticles(e.x, e.y + 16, '#bfe8ff', 12, 220);   // 脱离冰晶（虚幻）
      spawnParticles(e.x, e.y + 16, '#5b8cff', 8, 160);
    } else {
      spawnParticles(e.x, e.y + 16, '#ffd166', 12, 220);   // 脱离火星
      spawnParticles(e.x, e.y + 16, '#ff7a45', 8, 160);
    }
    e.blThrown = true;
  }

  // 暴鸰 / 暴鸰·G / 虚幻 亡语：炸弹尚未投出即被击毁 → 原地爆炸，仅对周围敌方单位造成伤害（不伤玩家）
  // （周围 250px 内敌人 600 + 20% 最大生命（虚幻 ×0.7：420 + 14%，封顶 1400），敌人伤害封顶见各自常量；可连锁引爆其它未投弹暴鸰；不抖屏）
  // 虚幻：殉爆原地留下寒冷区域——只对敌人生效（诗篇对双方生效，见 UNREAL 注释）
  function detonateBaoling(e) {
    const BLC = e.type === 'baolingG' ? BAOLING_G : e.type === 'unreal' ? UNREAL : BAOLING;   // 暴鸰·G：亡语波及半径 ×1.3，伤害同暴鸰；虚幻：伤害 ×0.7
    if (e.type === 'unreal') {
      spawnParticles(e.x, e.y, '#7fd4ff', 36, 360);   // 冰蓝霜爆（虚幻）
      spawnParticles(e.x, e.y, '#bfe8ff', 24, 300);
      spawnParticles(e.x, e.y, '#ffffff', 12, 240);
      spawnBlastRing(e.x, e.y, BLC.deathBlastR, '#7fd4ff');
      spawnFrostZone(e.x, e.y, 'death');
    } else {
      spawnParticles(e.x, e.y, '#ff5a3c', 36, 360);
      spawnParticles(e.x, e.y, '#ffd166', 24, 300);
      spawnParticles(e.x, e.y, '#ffffff', 12, 240);
      // 扩散爆炸波：红色冲击环自爆点扩张至波及半径后渐隐（指示实际波及范围）
      spawnBlastRing(e.x, e.y, BLC.deathBlastR, '#ff5a3c');
    }
    for (const t of enemies) {
      if (t === e) continue;
      if (Math.hypot(t.x - e.x, t.y - e.y) > BLC.deathBlastR) continue;   // 仅波及自爆点周围（暴鸰 250 / 暴鸰·G 325 / 虚幻 250）内的敌方单位
      // 非真实伤害：可被御4防御光环削减；敌人伤害封顶（暴鸰系 2000 / 虚幻 1400）
      t.hp -= Math.min(BLC.enemyDmgCap, BLC.enemyDmgBase + t.maxHp * BLC.enemyDmgRatio) * yu4AuraMul(t);
    }
    // 结算被炸毁的敌人（重入由 killEnemy 的 _deathSettled 拦截；身份删除防索引错位；
    // 多轮清扫：嵌套结算中的 splice 会让单轮倒序遍历漏掉部分 hp<=0 敌人，反复扫至无遗漏）
    // 殉爆窗口：成就「砰砰 / 砰砰礼物」——单次爆炸击杀数统计（嵌套殉爆经暂存互不影响）
    achvBaolingBlastBegin();
    for (let pass = 0; pass < 4; pass++) {
      let swept = false;
      for (let i = enemies.length - 1; i >= 0; i--) {
        const t = enemies[i];
        if (!t) continue;   // 嵌套结算可能清空数组导致越界
        if (t !== e && t.hp <= 0 && !t._deathSettled) { killEnemy(i); swept = true; }
      }
      if (!swept) break;
    }
    achvBaolingBlastEnd();
  }

  // ---------- 虚幻寒冷区域 ----------
  // 生成：炸弹爆炸落点（kind 'throw'，对玩家生效）/ 殉爆原地（kind 'death'，对敌人生效）；
  // 持续 3~5s 逐次随机；诗篇难度（isPoem）下不论来源均对双方生效（见 UNREAL 注释）
  function spawnFrostZone(x, y, kind) {
    frostZones.push({
      x, y,
      r: UNREAL.frostR,
      t: 0,
      dur: rand(UNREAL.frostDurMin, UNREAL.frostDurMax),
      affectsPlayer: isPoem() || kind === 'throw',
      affectsEnemies: isPoem() || kind === 'death',
      seed: Math.random() * Math.PI * 2,   // 雪花特效排布相位（逐区域随机）
      flakeT: rand(UNREAL.flakeEveryMin, UNREAL.flakeEveryMax),   // 间歇雪花特效倒计时
    });
  }

  // 推进：倒计时到期移除；间歇浮现雪花特效（冰蓝粒子在区域内随机位置飘散，间隔 0.35~0.7s 随机）
  // 调用点：14-main（updateBaolingBombs 之后）；减速判定见 04-spawn playerFrostSlowMul / enemyFrostZoneMoveMul
  function updateFrostZones(dt) {
    for (let i = frostZones.length - 1; i >= 0; i--) {
      const z = frostZones[i];
      z.t += dt;
      if (z.t >= z.dur) { frostZones.splice(i, 1); continue; }
      z.flakeT -= dt;
      if (z.flakeT <= 0) {
        z.flakeT = rand(UNREAL.flakeEveryMin, UNREAL.flakeEveryMax);
        const a = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * z.r * 0.9;   // 面积均匀采样
        spawnParticles(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr, '#dff2ff', 2, 46);
        if (Math.random() < 0.4) spawnParticles(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr, '#9fd4ff', 1, 30);
      }
    }
  }

  // ---------- 斗志昂扬死亡演出 ----------
  // 序列：蓝盒脱离并迅速渐隐 → 淡黄光环扩大（同时激活我方攻速/弹速翻倍 8s）→ 本体快速渐隐消失
  // 演出约 boxFade + haloDur（0.65s）结束后移除；增益 hasteT 独立倒计时 8s（不随演出结束而中断）
  function updateDouzhiFx(dt) {
    // 增益倒计时（每帧递减；演出结束后仍继续，直至 8s 到期）；警报/BOSS 登场动画期间完全冻结（不消耗增益时长）
    if (state.hasteT > 0 && !bossEntranceActive()) state.hasteT = Math.max(0, state.hasteT - dt);
    for (let i = douzhiFx.length - 1; i >= 0; i--) {
      const f = douzhiFx[i];
      const isDouzhi = !f.kind || f.kind === 'douzhi';   // 赞助系（sponsor/sponsorDeluxe）无增益光环
      f.t += dt;
      // 盒子脱离渐隐（0 → boxFade）：向下漂离 + 透明度 1→0
      const bp = clamp(f.t / DOUZHI.boxFade, 0, 1);
      f.boxAlpha = 1 - bp;
      f.boxDy = bp * DOUZHI.boxDetach;
      // 盒子渐隐结束（仅一次，仅斗志昂扬）：激活淡黄光环 + 我方攻速/弹速翻倍增益
      // 许凯狗冲刺期间不读条：增益跳过（演出照常播完）
      if (isDouzhi && !f.buffGiven && f.t >= DOUZHI.boxFade) {
        f.buffGiven = true;
        if (state.pilotDashT <= 0) {
          state.hasteT = DOUZHI.buffDuration;   // 增益不可叠加：直接重置为满时长（重复获得刷新计时）
          const pds = ENEMY_TYPES.douzhi.drawScale;
          spawnParticles(f.x, f.y + f.boxDy + 18.5 * pds, '#f6ecb4', 22, 260);   // 以掉落的盒子为中心迸发
        }
      }
      // 本体快速渐隐（盒子渐隐结束后开始）
      f.bodyAlpha = clamp(1 - (f.t - DOUZHI.boxFade) / DOUZHI.bodyFade, 0, 1);
      // 光环播完即移除（本体此时已完全渐隐；赞助系无光环、按本体渐隐结束移除）
      if (f.t >= DOUZHI.boxFade + (isDouzhi ? DOUZHI.haloDur : DOUZHI.bodyFade)) douzhiFx.splice(i, 1);
    }
  }

  // 奖励道具授予（赞助无人机 / 豪华赞助无人机击坠时调用）：
  //   稀有度——sponsor 90% 普通 + 10% 稀有 / sponsorDeluxe 必定稀有；同稀有度内从 01-config REWARD_ITEMS 等权抽 id
  //   （noDrop 标记排除「哦哦！抽卡！」——萧杨 16 颗原石专属技能，见 07-player noteGachaStone）；
  //   绷绷背包一局限得一次（bengbagGot 过滤）；2026-10-01 改版：道具槽已取消——抽中即直接生效
  //   （07-player applyRewardItem：效果结算 + 机体前方道具图标/扩散波特效），图鉴文案见 13-encyclopedia「道具」页签
  function grantRewardItem(kind, x, y) {
    const rarity = kind === 'sponsorDeluxe' ? 'rare' : (Math.random() < 0.9 ? 'normal' : 'rare');
    const pool = Object.values(REWARD_ITEMS).filter(it => it.rarity === rarity && !it.noDrop && !(it.id === 'bengbag' && state.bengbagGot));
    if (pool.length === 0) return;
    const it = pool[(Math.random() * pool.length) | 0];
    if (it.id === 'bengbag') state.bengbagGot = true;
    applyRewardItem(it.id);
  }

  // 敌人颜色标记：决定道具掉落规则（1类按行为 / 2·3·4类按变体 / 特殊舰船与 BOSS 按固定标记）
  //   red=套件×1.5 | purple=套件×1.2 | yellow=套件×1.2（含金）| blue=护盾6% | green=加血固定值（增生侧翼艇 4% / 青时炮艇 8% / 铁砧 10%）| orange=爆弹1%（整场一次）
  //   gray / white / black 无专属掉落规则，仅作分类（gray=灰黑系特殊无人机/炮兵）
  function enemyColorTags(e) {
    switch (e.type) {
      case 'side':      // 1类：白=pass 无规则 / 黄=shoot / 紫=kamikaze（橙旋 swirl 数值沿用紫电，掉落标记同为 purple）
        return e.behavior === 'shoot' ? ['yellow'] : (e.behavior === 'kamikaze' || e.behavior === 'swirl') ? ['purple'] : e.behavior === 'moon' ? ['red'] : [];
      case 'prolifera': // 增生侧翼艇（淡青绿）
        return ['green'];
      case 'striker':   // 赤红 / 烈橙 / 幽蓝 / 紫晶 / 坚垒（黄：套件×1.2，与金曜/黄1类同约定）/ 幽暮（黑色标记，black 无专属掉落规则仅分类；霜白无规则）
        return e.variant === 'crimson' ? ['red'] : e.variant === 'amber' ? ['orange'] : e.variant === 'azure' ? ['blue'] : e.variant === 'violet' ? ['purple'] : e.variant === 'fortress' ? ['yellow'] : e.variant === 'dusk' ? ['black'] : [];
      case 'gunship':   // 紫 / 红 / 金（金曜按黄色计）
        return e.variant === 'violet' ? ['purple'] : e.variant === 'crimson' ? ['red'] : e.variant === 'amber' ? ['yellow'] : e.variant === 'orange' ? ['orange'] : e.variant === 'cyan' ? ['green'] : [];
      case 'capital':   // 红 / 蓝
        return e.variant === 'crimson' ? ['red'] : e.variant === 'azure' ? ['blue'] : [];
      case 'harbinger': return ['gray', 'red'];      // 炮火先兆者：灰 + 红
      case 'weilong':   return ['orange', 'yellow']; // 威龙：橙 + 黄
      case 'hanshuang': return ['gray', 'blue'];     // 寒霜：灰 + 蓝
      case 'yu4':       return ['gray', 'blue'];     // 御4：灰 + 蓝
      case 'anvil':     return ['gray', 'green'];    // 铁砧：灰 + 绿（治疗无人机，绿色→加血掉落倾向）
      case 'baoling':   return ['gray', 'red'];      // 暴鸰：灰 + 红
      case 'baolingG':  return ['gray', 'red'];      // 暴鸰·G：灰 + 红（掉落规则同暴鸰）
      case 'unreal':    return ['gray', 'blue'];     // 虚幻：灰 + 蓝（冰霜系，掉落倾向同寒霜/御4）
      case 'jiaoxiang': return ['orange', 'red'];    // 焦香螺旋桨：橙 + 红（火焰系）
      case 'pulseMatrix': return ['orange', 'red'];  // 脉冲矩阵：掉落规则与焦香螺旋桨等同（橙 + 红）
      case 'douzhi':    return ['gray'];             // 斗志昂扬：灰蓝系（增益已由死亡演出赋予，无专属掉落加成）
      case 'sponsor':   return ['gray'];             // 赞助无人机：灰系（奖励道具为独立掉落，不走本池）
      case 'sponsorDeluxe': return ['gray'];         // 豪华赞助无人机：同上
      case 'fashiArray': return ['red'];             // 法术阵列：血红（红色标记：升级套件 ×1.5）
      case 'boss':      return e.bossId === 'storm' ? ['white', 'blue'] : e.bossId === 'storm2' ? ['gray', 'blue'] : ['black'];   // 暴风之眼：白 + 蓝 / 风暴编织者：灰 + 蓝 / 旧日之歌：黑
      default:          return [];
    }
  }

  // 掉落水晶生成 x 夹取：边缘击杀（1类侧翼艇从屏幕外斜插等）时保证水晶完整出生在战场内；
  // 运动中的左右边界回收另见 08-entities updateCrystals（贴边夹取消 vx，不出两侧边界）
  function clampDropX(x, r) { return clamp(x, r + 2, CANVAS_W - r - 2); }

  // 通用道具掉落（普通敌人与 BOSS 共用；依 升级套件 → 量子护盾 → 加血 顺序互斥判定）
  // 高能爆弹不在此池：仅 4类（5%）与 BOSS（20%）固定掉落，另有橙色敌人 0.5%（整场最多一次）独立判定
  function rollItemDrops(e, x, y) {
    const tags = enemyColorTags(e);
    const isBoss = e.type === 'boss';
    if (e.type === 'douzhi' || e.type === 'sponsor' || e.type === 'sponsorDeluxe') return;   // 奖励无人机：不走通用道具池（斗志给增益、赞助系给奖励道具，仅掉水晶）
    // 类型掉率修正：1类（含增生侧翼艇；卫护飞船不走此池）所有道具概率减半；2类突击艇全部道具概率 ×0.75。
    //   （加血套件 2026-10-08 起改为按类别固定掉率——见下方 hpRate，不吃本乘区）
    // 虚象：1/2类额外减少修正不再生效。
    // 低火力减免（真我/具象，mods.dropClassLowWeaken）：判定等级 = 攻击等级 + 场上升级套件数 + 4×场上暴走道具数——
    //   判定等级 1 时削减修正失效；判定等级 2 时效果减弱 50%（1类 ×0.5→×0.75 / 2类 ×0.75→×0.875）；
    //   判定等级 ≥3（含场上有暴走道具的任意情形）不减免。
    //   BOSS 战 1类强制波的 ×0.3 削减（下方 minionDrop）不受此影响、照常生效。
    // 高能爆弹为橙色标记的独立判定（见函数末尾），不在此修正范围内
    const dMods = diffMods();
    let dropMul = 1;
    if (!dMods.dropClassNoReduce) {
      let clsMul = 1;
      if (e.type === 'side' || e.type === 'prolifera') clsMul = 0.5;
      else if (e.type === 'striker') clsMul = 0.75;
      const dropJudgeLv = player.weapon
        + powerups.reduce((n, p) => n + (p.kind === 'kit' ? 1 : 0), 0)
        + 4 * powerups.reduce((n, p) => n + (p.kind === 'berserk' ? 1 : 0), 0);
      if (dMods.dropClassLowWeaken && dropJudgeLv <= 2) {
        dropMul = 1 - (1 - clsMul) * (dropJudgeLv === 1 ? 1 : 0.5);
      } else {
        dropMul = clsMul;
      }
    }
    // BOSS 战期间强制波次（全难度）的 1类敌人——所有道具掉率 ×0.3（标记见 04-spawn spawnBossMinionWave；虚象不生效）
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
    // 加血套件：普通敌人走互斥链（按敌机类别 1类 0.5% / 2类 1% / 3类 2% / 4类 6%；绿标记固定值不吃类别表——
      //   增生侧翼艇 4% / 青时炮艇 8% / 铁砧 10%，2026-10-08 用户定稿，不再吃类型削减/判定等级减免乘区）；BOSS 在链外独立判定（40% 掉 1 / 另有 10% 一次掉 2）
    // 真我特殊机制（mods.hpKitGap）：任意两次加血套件之间至少间隔 8s——
    //   冷却期内掉落判定照常进行，但加血环节概率变为 50%（hpKitBankChance）且敌人不掉落（改为"预触发"计数）；
    //   冷却结束后若预触发 ≥1，击杀的第一个敌人必定掉落一个加血套件（随后计数清零）。
    //   每次【实际掉落】加血套件（含 BOSS 战脚本化加血）都会重置 8s 计时
    // 诗篇波次制节流（WAVE_POEM.healWaveGap）：加血套件每 N 波最多 1 个——levelFlow.hpKitWaveCd
    //   由 04-spawn 每波刷新递减；实际掉落（含 BOSS 战脚本化加血）后重新置满。节流期内命中加血环节 = 无掉落
    const hpKitWaveGap = isPoem() ? WAVE_POEM.healWaveGap : Infinity;
    const hpKitWaveBlocked = (levelFlow.hpKitWaveCd || 0) > 0;
    const hpKitGap = dMods.hpKitGap != null ? dMods.hpKitGap : Infinity;
    const hpKitInCd = state.time - state.hpKitLastT < hpKitGap;
    const hpKitRelease = !isBoss && hpKitGap !== Infinity && !hpKitInCd && state.hpKitBanked >= 1;
    const hpRate = isBoss ? 0 : tags.includes('green')
        ? (e.type === 'gunship' ? DROP_HP_CYAN : e.type === 'anvil' ? DROP_HP_GREEN : DROP_HP_PROLIFERA)   // 绿标记固定值：青时炮艇 8% / 铁砧 10% / 增生侧翼艇 4%
        : (DROP_HP_BY_CLASS[ENEMY_CLASS[e.type]] || 0);
    let hpDropped = false;
    if (hpKitRelease) {
      // 冷却结束后的第一个敌人必掉一个（清空预触发计数），并占用本次互斥链
      spawnPowerup(x, y, 'hp', 12);
      state.hpKitBanked = 0;
      state.hpKitLastT = state.time;
      hpDropped = true;
    }
    const pr = Math.random();
    if (!hpDropped) {
      if (pr < kitRate) {
        // 升级套件；其中 5% 变为暴走道具（红橙大 S，吃到攻击等级立刻满级）
        if (Math.random() < DROP_KIT_BERSERK) spawnPowerup(x, y, 'berserk', 15);
        else spawnPowerup(x, y, 'kit', 12);
      } else if (pr < kitRate + shieldRate) {
        spawnPowerup(x, y, 'shield', 13);
      } else if (hpKitGap !== Infinity && hpKitInCd) {
        // 真我冷却期内：加血环节概率变为 50%，命中改为"预触发"（敌人不掉落）
        if (Math.random() < dMods.hpKitBankChance) state.hpKitBanked++;
      } else if (!hpKitWaveBlocked && pr < kitRate + shieldRate + hpRate) {
        spawnPowerup(x, y, 'hp', 12);
        if (hpKitGap !== Infinity) state.hpKitLastT = state.time;
        if (hpKitWaveGap !== Infinity) levelFlow.hpKitWaveCd = hpKitWaveGap;
      }
    }
    if (isBoss) {
      const hr = Math.random();
      if (hr < DROP_HP_BOSS) spawnPowerup(x, y, 'hp', 12);
      else if (hr < DROP_HP_BOSS + DROP_HP_BOSS2) { spawnPowerup(x, y, 'hp', 12); spawnPowerup(x, y, 'hp', 12); }
      if (hr < DROP_HP_BOSS + DROP_HP_BOSS2 && hpKitGap !== Infinity) state.hpKitLastT = state.time;   // BOSS 脚本化加血同样重置 8s 计时
      if (hr < DROP_HP_BOSS + DROP_HP_BOSS2 && hpKitWaveGap !== Infinity) levelFlow.hpKitWaveCd = hpKitWaveGap;   // 诗篇：BOSS 加血后同样进入波次节流
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
  // 复刻 BOSS 接触伤害的连续扣血模型（无视无敌帧；护盾免疫）；测试模式照常扣血（血量归零自动重置，不掉命）。
  // 奖励道具·寒霜发生器：机体处于我方寒霜力场内时火环对玩家失效，机体自身受递增灼烧（0.1s/跳，30 起步每跳 +1，离场重置）
  function jiaoxiangBurn(e, dt) {
    const ff = state.frostField;
    if (ff && Math.hypot(e.x - ff.x, e.y - ff.y) <= ff.r) {
      e.frostBurnAcc = (e.frostBurnAcc || 0) + dt;
      while (e.frostBurnAcc >= 0.1) {
        e.frostBurnAcc -= 0.1;
        if (e.frostBurnDmg == null) e.frostBurnDmg = 30;
        e.hp -= e.frostBurnDmg;
        e.frostBurnDmg += 1;
        spawnParticles(e.x + rand(-10, 10), e.y + rand(-10, 10), '#bfeaff', 2, 90);
        if (e.hp <= 0) {
          const idx = enemies.indexOf(e);
          if (idx >= 0) killEnemy(idx);   // 力场灼烧致死（与弹幕击杀同一结算入口）
          break;
        }
      }
    } else {
      e.frostBurnAcc = 0;
      e.frostBurnDmg = null;   // 离场重置：再次进入从 30 起算
    }
    // 玩家处于我方寒霜力场内：焦香火环失效（不掉血、不冒火花）
    if (ff && player.alive && Math.hypot(player.x - ff.x, player.y + PLAYER_CFG.hitOffsetY - ff.y) <= ff.r) return;
    const delay = e.jxFlank ? JIAOXIANG.auraDelayFlank : JIAOXIANG.auraDelay;
    if (e.auraT < delay) return;
    if (!player.alive || player.shield > 0) return;
    if (currentArmor.id === 'chixin') return;   // 炽心装甲：免疫焦香螺旋桨的火环伤害
    const dist = Math.hypot(e.x - player.x, e.y - (player.y + PLAYER_CFG.hitOffsetY));
    if (dist > JIAOXIANG.auraR) return;
    const near = dist <= JIAOXIANG.nearR;
    const dps = JIAOXIANG.burnDps * (near ? 2 : 1) * enemyDmgMul();
    if (state.challenge) {
      testDamagePlayer(dps * dt);
      if (Math.random() < 0.35) spawnParticles(player.x + rand(-8, 8), player.y + rand(-8, 8), near ? '#ff4500' : '#ff7a18', 1, 70);
      return;
    }
    player.hp -= dps * dt;
    achvNoteDamage();   // 成就：焦香灼烧受伤
    if (Math.random() < 0.35) spawnParticles(player.x + rand(-8, 8), player.y + rand(-8, 8), near ? '#ff4500' : '#ff7a18', 1, 70);
    if (player.hp <= 0) {
      player.hp = 0;
      player.alive = false;
      if (!hasPilot('tianshiLovely')) state.lives--;   // 天使璃：无限生命，不扣命数（永不失败结算）
      spawnParticles(player.x, player.y, '#ff4d6d', 40, 320);
      shake(16, 0.6);
      achvOnDeath('burn:jiaoxiang', state.lives <= 0);   // 成就：烫烫烫等死因结算
      handlePlayerDeath();
    }
  }

  // 支援光环覆盖判定（成就「其实是打不到」）：目标处于已激活的御4力场 / 铁砧光圈内。
  // 御4按 yu4AuraMul 同参（圆形，auraT ≥ auraDelay 后生效）；铁砧按画出的圆形光圈判定
  // （其治疗结算为正方形、此处取玩家可见的光环范围，语义为"看着在圈里"）。
  // 不排除濒亡 / 渐隐的御4 / 铁砧——与 yu4AuraMul 在渐隐期仍提供减伤的实际表现一致。
  function inSupportAura(target) {
    for (const g of enemies) {
      if (g === target) continue;   // 自身光环不算（御4 / 铁砧不会罩住自己）
      if (g.type === 'yu4' && g.auraT >= YU4.auraDelay &&
          Math.hypot(target.x - g.x, target.y - g.y) <= YU4.auraR) return true;
      if (g.type === 'anvil' && g.auraT >= ANVIL.auraDelay &&
          Math.hypot(target.x - g.x, target.y - g.y) <= ANVIL.auraR) return true;
    }
    return false;
  }

  function killEnemy(index) {
    const e = enemies[index];
    // 测试模式（图鉴挑战）：敌方不再无敌 —— 照常走完整击杀流程，仅屏蔽得分与水晶/道具掉落（见下方 testMode 门控）
    const testMode = !!state.challenge;
    // 死亡结算重入保护：结算期间（如暴鸰亡语连锁殉爆）该敌机仍留在数组内且 hp<=0，
    // 其它暴鸰的殉爆波及会再次调用 killEnemy——不拦截会造成两只暴鸰互相重入引爆（无限递归、海量爆炸卡死）
    if (e._deathSettled) return;
    e._deathSettled = true;
    // 黑暗之手连携精英击坠登记（2026-10-08 用户定稿）：任意连携精英（dhLink 窗口召唤 / elRevive 返场）
    // 被击坠 → 本体永久登记其「额外技能」；若为当前血量窗口的精英 → 本段减伤撤销 + 反向增伤 +100%
    //（高能爆弹/绷绷炸弹不吃，登记逻辑见 02-core dhOnLinkedEliteKilled）
    if (e.dhLink || e.elRevive) dhOnLinkedEliteKilled(e.type);
    // 4F 精英击毁：场上已有的地毯轰炸预警弹转存全局（state.xgLooseBombs）继续倒计时爆炸——
    // 不随实体消失（实体弹结算挂 advanceEliteMinions、随实体移除停跑），见 updateXgLooseBombs
    if (ELITES[e.type] && e.xgBombs && e.xgBombs.length) {
      for (const b of e.xgBombs) state.xgLooseBombs.push(b);
      e.xgBombs.length = 0;
    }
    // 轰轰炸弹：击败敌人后对其周围一定距离内敌人造成 maxHp×20% 伤害，可连锁；BOSS 不触发
    if (state.honghongT > 0 && e.type !== 'boss') {
      const cls = ENEMY_CLASS[e.type] || 1;
      const spreadR = [40, 50, 60, 70][cls - 1] || 40;
      const inBossFight = enemies.some(x => x.type === 'boss' && !x.dying);
      // BOSS 战中 1 类敌人伤害 = 基础 20% × 10 = 最大生命值 200%（足以连锁清掉 BOSS 战杂兵）
      const dmgMul = (inBossFight && cls === 1) ? 2.0 : 0.2;
      const dmg = (e.maxHp || e.hp) * dmgMul;
      spawnBlastRing(e.x, e.y, spreadR, '#ff7a18', 0.3);
      spawnParticles(e.x, e.y, '#ff7a18', 10, 160);
      const killed = [];
      for (const o of enemies) {
        if (o === e || o._deathSettled || o.dying || o.type === 'boss') continue;
        if (!enemyOnScreen(o)) continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) > spreadR + Math.max(o.w, o.h) / 2) continue;
        o.hp -= dmg;
        if (o.hp <= 0) killed.push(o);
      }
      for (const t of killed) {
        const j = enemies.indexOf(t);
        if (j >= 0) killEnemy(j);   // 连锁：被波及致死的敌人再次触发轰轰炸弹
      }
    }
    achvOnKill(e);   // 成就：击杀计数与来源击杀（斗志非常昂扬 / 叮咚 / 烧烧烧）
    if (e.type !== 'boss' && inSupportAura(e)) achvNoteAuraFieldKill();   // 成就：其实是打不到（支援光环内击坠）
    // 按对象身份移除：连锁殉爆嵌套结算期间数组索引会错位，按调用时的 index 删除会误删其它敌人或漏删自身
    const spliceSelf = () => {
      const i = enemies.indexOf(e);
      if (i >= 0) enemies.splice(i, 1);
    };
    // 埃逸自爆击杀：得分按驾驶员注册表倍率结算（20%）
    const aiyiEntry = hasPilot('aiyi') ? (PILOTS.aiyi) : null;
    const sdScoreMul = (state.aiyiSelfDestruct && aiyiEntry) ? (aiyiEntry.scoreMul || 1) : 1;
    // BOSS 击毁：单独结算
    // 【统一伤害规则 · 未来双阶段转化型 BOSS 锚点】秒杀类技能（state.sweepKill / state.aiyiSelfDestruct）
    // 命中此类 BOSS（一阶段血尽 → 动画转化 → 二阶段全新形态，暂未实装）时须跳过转化直接整体击杀；
    // 全屏瞬发类（爆弹 / 紫蓝陨石）溢出伤害则不结转二阶段——规则全文见 07-player gachaMeteorImpact 注释
    if (e.type === 'boss') {
      achvOnBossKilled(e.bossId);   // 成就：BOSS 击杀（直面过往 / 忧郁 / 击坠风暴 / 无伤系列 / 轰轰火花 / 持久战计时）
      // 叮咚鸡：击败 BOSS 掷 Q 上限提升——轮次来自 BOSS_ROUNDS 表（bossId 查 pool；storm2 为 storm 连续二阶段不单独占轮，
      // 查不到按基础 25% 处理）：第 5/6 轮 100%，其余轮次 25%，掷中立刻 state.ddjUseMax +1（挑战/测试模式不掷）
      if (hasPilot('dingdongji') && !testMode) {
        const round = BOSS_ROUNDS.find(r => r.pool.includes(e.bossId));
        const boostChance = (round && (round.round === 5 || round.round === 6)) ? 1 : 0.25;
        if (Math.random() < boostChance) {
          state.ddjUseMax = (state.ddjUseMax || PILOTS.dingdongji.useMax) + 1;
          spawnParticles(player.x, player.y, '#ffcf4d', 20, 240);   // 金色粒子提示上限提升
        }
      }
      const dhSweepDeath = state.aiyiSelfDestruct || state.sweepKill;   // 秒杀类击杀（金陨/埃逸殉爆）——黑暗之手死亡方式分岔（下方清场同用）
      if (e.bossId === 'darkhand') {
        // 死亡方式分岔（2026-10-08 用户定稿）：秒杀类击杀 → 在场连携精英由本波/本陨照常击杀（下方清场
        // 含 dhLink，不转离场）；常规击杀 → 幸存精英迅速离场并记录血量（第三轮按 ELITE_REVIVE.levels 返场）
        if (!dhSweepDeath) {
          dhFleeLinkedElites();   // 黑暗之手常规死亡：其 20% 血量窗口随死亡结束——残余连携精英迅速离场并记录血量（第三轮按 ELITE_REVIVE.levels 返场）
        }
        // 未召唤精英归属（2026-10-08 用户定稿）：死亡时尚未召唤（未到 80/60/40/20% 阈值）的精英——
        // ① 此前有精英逃走（dhFledElites 非空，含本次常规死亡离场者）→ 视作未被击杀，满血登记返场
        //   （rec.hp 传 eliteHpOf 满值 → spawnRevivedElite 全额登场），后续波次照常登场；
        // ② 此前无任何精英逃走 → 视作被击杀，四精英全数击败 → 第三轮 Lv25 召唤张华&张策（dhZhangPending，14-main 消费）
        if (state.dhFledElites.length) {
          for (const pair of DARKHAND.summon.pairs) {
            for (const t of pair) {
              if (!(e.dhSummoned || []).includes(t)) state.dhFledElites.push({ type: t, hp: eliteHpOf(t) });
            }
          }
        }
        state.dhZhangPending = state.dhFledElites.length === 0;
      }
      if (!testMode) state.score += Math.round(e.score * diffMods().scoreMul * sdScoreMul);
      meiNoteKill(5, e.type);   // 依：BOSS = 5 类，击杀计数 +122（充满自动召唤镰刀）
      // 埃逸：自爆击杀 BOSS（胜利结算标题改为"自爆成功"）；
      // 成就「！？爆爆？！」：最终自爆（最后一条命）炸死最终 BOSS 风暴编织者
      if (state.aiyiSelfDestruct && hasPilot('aiyi')) {
        state.selfDestructVictory = true;
        if (state.aiyiFinalDeath && e.bossId === 'storm2') unlockAchievement('aiyiFinalBoss');
      }
      spawnParticles(e.x, e.y, '#ffffff', 60, 380);
      spawnParticles(e.x, e.y, BOSS_BULLET.long, 40, 300);
      shake(22, 1.0);
      clearEnemyBullets(); clearMissiles();   // BOSS 死亡：立刻清除全场所有弹幕
      // BOSS 死亡：大量水晶撒落（测试模式不掉落）
      // 水晶：旧日之歌 600 / 风暴编织者 900（两者分数均为 0，击杀奖励全部走水晶）；暴风之眼本体不掉水晶、击杀得分 9000
      // 不再强制吸收（原 absorbDelay 到期后无视距离全数吸走）：与普通掉落一致由磁吸 / 追逐拾取；
      // 与普通掉落同速（150~200）垂直下坠、无横向速度（不乱飞）——原 ×0.6 慢速留场修正于 2026-09-27 移除（正常速度），
      // 未收集水晶由胜利结算前 0.8s 的统一收集兜底（见 08-entities collectAllCrystals / 14-main victoryDelay 窗口）
      if (!testMode && e.bossId !== 'storm') {
        const nCry = e.bossId === 'storm2' ? 900 : 600;
        // 首轮 BOSS（FIRST_ROUND_BOSSES）掉落的水晶打标：拾取时对七日澜心量表按 firstBossBonus 额外加成
        const firstBossCry = FIRST_ROUND_BOSSES.includes(e.bossId);
        // 水晶分档换算（三档 + 巨型）：BOSS 大量掉落同样走档位体系
        const mix = convertCrystalDrop(nCry);
        const spawnTier = (tier) => {
          const def = CRYSTAL_TIERS[tier];
          const roll = rollCrystalGiant(tier);   // 巨型转化掷骰（萧杨概率 ×1.5；提升部分转出按原档计分——见 01-config rollCrystalGiant）
          const t2 = roll.tier2;
          const colorKey = roll.giant ? 'g' + Math.floor(Math.random() * CRYSTAL_GIANT_COLORS.length) : 'c' + Math.floor(Math.random() * CRYSTAL_COLORS.length);   // BOSS 专属掉落：三色均分（青 / 水蓝 / 粉）+ 巨型双色均分（粉巨型仅 BOSS 可出，2026-09-27 定稿）
          crystals.push({
            x: clampDropX(e.x + rand(-200, 200), def.r), y: e.y + rand(-40, 40),
            vx: 0, vy: rand(150, 200),   // 垂直下坠（不乱飞）；与普通掉落同速（原 ×0.6 慢速修正已移除）
            r: def.r, val: roll.val,
            tier: t2, colorKey, giant: roll.giant, firstBoss: firstBossCry,
            fromBoss: true,   // BOSS 掉落水晶标记（炼金璃隐藏计数表不计入，见 08-entities updateCrystals）
            phase: Math.random(),
            t: Math.random() * Math.PI * 2,
          });
        };
        for (let k = 0; k < mix.small; k++) spawnTier('small');
        for (let k = 0; k < mix.mid; k++) spawnTier('mid');
        for (let k = 0; k < mix.big; k++) spawnTier('big');
        // 击败 BOSS 20% 掉落高能爆弹
        if (Math.random() < 0.20) spawnPowerup(e.x, e.y, 'bomb', 12);
        // BOSS 死亡：掉落一个暴走道具（短暂下坠后被战机强制吸收；功能性拾取，不受水晶取消强制吸收影响）
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
      // 温酒客：每击败一个 BOSS，受到伤害提升 -25 个百分点（+100% → +75% → +50% → +25% → +0%，最低归零）
      if (state.wenjiukeVuln > 0) state.wenjiukeVuln = Math.max(0, state.wenjiukeVuln - PILOTS.wenjiuke.vulnDecay);
      // 洄：击败 BOSS 时回复 35% 已损失生命（上限当前装甲最大生命）；小艺连携改为立刻恢复 60% 生命
      //（2026-10-08 用户定稿：取代 35% 已损失口径，按最大生命结算）。
      // 直接结算到 player.hp，不走道具掉落——与真我加血套件 8s 节流（hpKitLastT）完全无关，不触发也不受其冷却限制。
      // 成就「时流回溯」按实际结算量累计
      if (currentArmor.id === 'hui' && currentArmor.bossKillLostPct && player.alive) {
        const bossHeal = hasPilot('xiaoyi')
          ? Math.min(player.maxHp * PILOTS.xiaoyi.huiBossHealPct, player.maxHp - player.hp)   // 小艺连携：固定 60% 生命
          : Math.min((player.maxHp - player.hp) * currentArmor.bossKillLostPct, player.maxHp - player.hp);   // 洄本体：35% 已损失
        if (bossHeal > 0) {
          player.hp += bossHeal;
          achvNoteHuiHeal(bossHeal);
          spawnParticles(player.x + rand(-12, 12), player.y + rand(-12, 12), '#66e39a', 20, 170);
        }
      }
      // 阶段推进：还有下一个 BOSS → 重置计时进入新一轮刷怪；已是最终 BOSS（或测试 / 图鉴挑战）→ 延迟后胜利结算
      bossFlow.phase++;
      levelFlow.poemWaveIdx = 0;   // 诗篇波次制：新阶段波次计数归零（下一轮从 Lv11 重新按波推进）
      // 击败 BOSS 引发的阶段跳变升级：下一次「关卡提升」不召唤斗志昂扬；
      // 阶段衔接为连续升级（新阶段首级 = 击败时等级）时不构成跳变、不置豁免，避免吞掉阶段内首次自然升级的判定
      // 诗篇波次制：波 N = 等级 N（第一轮 Lv1~10 / 第二轮 Lv11~20），阶段衔接为连续升级（10 → 11），永不跳变、不置豁免
      const lvCfgNext = SPAWN_PHASE_LEVEL[bossFlow.phase] || SPAWN_PHASE_LEVEL[SPAWN_PHASE_LEVEL.length - 1];
      if (!isPoem() && lvCfgNext.base > levelFlow.level) levelFlow.douzhiSkipOnce = true;
      // e.bossId === 'storm'：第三轮暴风之眼被击败时 phase 已越过 BOSS_SEQUENCE 末位，
      // 仍须进入本分支直召风暴编织者（二阶段不占轮次，击败编织者才走下方胜利结算）
      if ((bossFlow.phase < BOSS_SEQUENCE.length || e.bossId === 'storm') && !state.testBoss && !state.challenge) {
        if (e.bossId === 'storm') {
          // 暴风之眼被击败：风暴轰然消散，直接召唤二阶段飞舰「风暴编织者」
          // （跳过等清场 / 警报 / 常规刷怪，直接进入战斗）
          // 转阶段同时清除我方召唤物：天秀忧郁王子的大风暴本体 + 其在飞风弹（princeStorm 弹）——
          // 一阶段尾声的召唤铺场不带入二阶段（风暴本体无单独消散演出，随本体轰然消散一并退场）；
          // 其余我方弹幕（飞剑波次 / 火环 / 导弹雨等自动循环输出）不属于召唤物，不在此清除
          friendStorms.length = 0;
          for (let i = pBullets.length - 1; i >= 0; i--) {
            if (pBullets[i].princeStorm) pBullets.splice(i, 1);
          }
          spawnBoss('storm2');
          const s2 = enemies[enemies.length - 1];
          if (s2 && s2.type === 'boss') s2._sdImmune = true;   // BOSS 死亡召唤体：免疫本次爆炸的扩散波全部伤害（2026-10-03 用户定稿一丁点不吃），波扫完后解除（见 updateAiyiWaves 收尾）
          bossFlow.stage = 'fight';
          // BGM 淡出重起播：当前曲 0.7s 内淡出（淡出起点不变），1.3s 后从头重播同一首
          // （静默窗口 0.7→1.3s：给二阶段登场雷暴演出留出更长的音乐留白，重播点较原 0.8s 后移 0.5s）
          restartBGM(0.7, 1.3);
          // 本体不立即移除：保留 0.8s 渐隐消逝（alpha 1→0 + 缓慢收缩 + 减速旋转，
          // 见 updateEnemies dying 分支 / drawStormBoss），与二阶段登场的"轰然消散"冲击波环衔接
          e.dying = { t: 0, dur: 0.8 };
        } else {
          bossFlow.victoryDelay = 0;
          bossFlow.postDelay = 2;   // 击败 BOSS 后 2s 再刷怪（不计入关卡推进；到时固定刷首波 1类长队）
        }
      } else {
        bossFlow.victoryDelay = 2.5;  // 延迟后返回主界面
        bossFlow.defeatedName = e.name;
      }
      // 大无垠之王：多阶段 BOSS 切换（暴风之眼→风暴编织者，stage 已被置回 fight，仅正常流程）——
      // 两项累积增伤各减少 75%（留存 25%）；其余情况（BOSS 阶段结束，含试炼 / 挑战击败）立刻失去全部累积
      // （试炼 / 挑战中 stage 恒为 fight 且无二阶段——若不排除，暴风之眼试炼会误走留存分支把累积带入下一局）
      if (hasPilot('king')) {
        if (e.bossId === 'storm' && bossFlow.stage === 'fight' && !state.testBoss && !state.challenge) {
          state.kingDmg *= PILOTS.king.phaseKeep;
          state.kingTaken *= PILOTS.king.phaseKeep;
        } else {
          state.kingDmg = 0;
          state.kingTaken = 0;
        }
      }
      if (!e.dying) spliceSelf();   // 暴风之眼渐隐期间保留实体（见上方 dying 标记），其余 BOSS 立即移除
      // BOSS 被击败：强行击坠场上所有剩余敌方单位（小怪 / 护航 / 召唤物，含 BOSS 测试召唤物）
      // 倒序遍历逐个走 killEnemy 完整击杀演出（爆炸粒子 / 水晶 / 计分）
      // （增生侧翼艇被清场击毁时会分裂卫护飞船并追加到数组尾部，故循环至场上无残留为止）
      // 黑暗之手连携精英（dhLink）：常规死亡不被清场波及——上方 dhFleeLinkedElites 已令其终止技能并
      // 转为往下离场（记录血量待第三轮返场）；秒杀类击杀（金陨/埃逸殉爆）则同受清场——在场精英与全场
      // 敌人一同被砸死（2026-10-08 用户定稿）；已处离场相位者（elPhase 2，窗口切换离场、已登记返场）
      // 两种死亡方式均不被追杀
      let clearGuard = 0;
      while (enemies.some(en => en && en.type !== 'boss' && (!en.dhLink || (dhSweepDeath && en.elPhase !== 2))) && clearGuard++ < 50) {
        for (let i = enemies.length - 1; i >= 0; i--) {
          const en = enemies[i];
          if (en && en.type !== 'boss' && (!en.dhLink || (dhSweepDeath && en.elPhase !== 2))) killEnemy(i);
        }
      }
      // 清场击杀可能触发 1 类紫亡语射击，统一再清一次残留敌弹
      clearEnemyBullets();
      // 清场击杀掉落的道具：延迟一段后强制吸收（道具为功能性拾取，避免玩家漏拿）
      // 水晶不再强制吸收——BOSS 战结束后所有水晶（BOSS 本体掉落 + 清场击坠掉落）均由玩家磁吸 / 追逐拾取
      for (const p of powerups) {
        if (p.absorbDelay == null) p.absorbDelay = rand(0.35, 0.7);
      }
      return;
    }
    // 卫护飞船（增生侧翼艇衍生）：不掉落任何水晶与道具，不参与通用水晶/道具掉落池（测试模式不加分）
    // BOSS 战强制波衍生的卫护飞船（minionDrop 传播）与青时炮艇召唤体衍生的卫护飞船（noReward 传播）：同样不加分
    if (e.type === 'escort') {
      spawnParticles(e.x, e.y, e.color, 14, 200);
      if (!testMode && !e.minionDrop && !e.noReward) {
        state.score += Math.round(e.score * diffMods().scoreMul);
      }
      spliceSelf();
      return;
    }
    // 法术阵列召唤的法术矩阵（周期召唤体）：死亡不加分、不掉水晶（仅爆炸演出，直接移除）
    if (e.noReward) {
      // 青时炮艇召唤体：无奖励但仍分裂卫护飞船（衍生体同样无奖励）
      // 秒杀类通道（aiyiSelfDestruct / sweepKill）内禁召唤型亡语（统一规则见 07-player gachaMeteorImpact）
      if (e.type === 'prolifera' && !(state.aiyiSelfDestruct || state.sweepKill)) {
        const base = e._sideVel || { vx: 0, vy: 60 };
        const spd2 = Math.hypot(base.vx, base.vy) || 60;
        for (let k = 0; k < Math.floor(Math.random() * 4); k++) {
          const esc = makeEnemy('escort', e.x + rand(-10, 10), e.y + rand(-8, 8), { fireTimer: 1e9 });
          const dx2 = base.vx + rand(-16, 16), dy2 = base.vy + rand(-10, 14);
          const l2 = Math.hypot(dx2, dy2) || 1;
          esc._sideVel = { vx: dx2 / l2 * spd2, vy: dy2 / l2 * spd2 };
          esc._entryMul = 1; esc.noReward = true;
        }
      }
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
    // 暴鸰 / 暴鸰·G / 虚幻 亡语分派：炸弹在停车锁定瞬间即脱离（blWarn 与 blThrown 同帧置位，锁定后不存在「已预警未投弹」状态）——
    // 锁定后被击毁均无亡语、炸弹仍将抵达目标位置并爆炸（击杀无法终止）；预警区形成前（尚未锁定）被击毁 → 原地殉爆（虚幻另留对敌生效的寒冷区域）
    if (e.type === 'baoling' || e.type === 'baolingG' || e.type === 'unreal') {
      if (!e.blThrown) detonateBaoling(e);
    }
    spawnParticles(e.x, e.y, e.color, 22, 260);
    // BOSS 战强制波 1类（minionDrop）：击杀不加分（水晶不掉见下；道具掉率 ×0.3 照常，见 rollItemDrops）
    if (!testMode && !e.minionDrop) state.score += Math.round(e.score * diffMods().scoreMul * sdScoreMul);
    // 群星守望：击杀 1/2/3/4 类敌人时按概率消弹——
    // 常规战斗 5%/8%/15%/50% 清除离自身最近的一颗敌弹（无内置冷却）；
    // BOSS 战期间改用统一 40% 概率表，且改为清除该敌人发出的所有在场射弹
    // （每颗都带淡黄连线+迸粒演出，多弹齐清时视觉上如同一次射出多束粒子光束）；
    // 真我以下难度（虚象/具象；后续诗篇等更高难度不受影响）：清除概率 ×1.5（不超过 100%）
    const watchCls = ENEMY_CLASS[e.type];
    const bossFight = bossFlow.stage === 'fight';
    meiNoteKill(watchCls, e.type);   // 依：按敌人类别 1/2/3/4 增加击杀计数（BOSS 战 ×3 / 四精英 ×4，见 07-player）
    const watchTable = bossFight ? currentArmor.clearChanceBoss : currentArmor.clearChance;
    let watchChance = (watchCls && watchTable && !testMode) ? watchTable[watchCls] : 0;
    if (watchChance && !isHardTier()) watchChance = Math.min(1, watchChance * 1.5);
    if (watchChance && Math.random() < watchChance) {
      if (bossFight) achvNoteWatchClear(clearEnemyBulletsByOwner(e));
      else achvNoteWatchClear(clearNearestEnemyBullet(player.x, player.y));   // 成就：群星不灭——按实际消除数计数
    }
    // 七日澜心：BOSS 战期间击杀敌人直接给量表充能 1%~3%（随机；不依赖水晶拾取，量表满后按 F 释放）
    if (!testMode && bossFight && ARMOR_SKILLS[currentArmor.id]) {
      state.armorSkillGauge = Math.min(1, (state.armorSkillGauge || 0) + rand(0.01, 0.03));
    }
    // 所有非 BOSS 敌机被击毁均不再抖屏（仅保留 BOSS 的击毁震屏）
    // 增生侧翼艇：击毁后分裂出 0~3 个卫护飞船（深蓝紫渐变小三角，沿原航向大致继续飞行；均等随机，可能不分）
    // 秒杀类通道（埃逸自爆波 aiyiSelfDestruct / 金色陨石 sweepKill）内禁用该亡语——否则衍生体残留全场，
    // 违反「秒杀类直接秒杀一切场上敌人」的统一规则（见 07-player gachaMeteorImpact 注释）
    if (e.type === 'prolifera' && !(state.aiyiSelfDestruct || state.sweepKill)) {
      const n = Math.floor(Math.random() * 4);
      const base = e._sideVel || { vx: 0, vy: SIDE_SPEED_SLOW };
      const spd = Math.hypot(base.vx, base.vy) || SIDE_SPEED_SLOW;   // 母舰当前速度模长（两速体系内恒 200/150）
      for (let k = 0; k < n; k++) {
        const esc = makeEnemy('escort', e.x + rand(-10, 10), e.y + rand(-8, 8), { fireTimer: 1e9 });
        // 大致沿母舰原航向，带小幅方向散布后归一回母舰速度模长（两速体系内不引入中间速度）
        const dx = base.vx + rand(-16, 16), dy = base.vy + rand(-10, 14);
        const l = Math.hypot(dx, dy) || 1;
        esc._sideVel = { vx: dx / l * spd, vy: dy / l * spd };
        esc._entryMul = 1;   // 预置 1：无入场冲刺，平滑接续原航向
        esc.minionDrop = !!e.minionDrop;   // BOSS 战强制波：标记传播给衍生体（不加分 / 不掉水晶）
      }
      spawnParticles(e.x, e.y, '#9a7bff', 10, 180);
    }
    // 法术阵列亡语：死亡爆发震出一个法术矩阵——无盾（无虚化护盾），0.4s 内高速旋转随机 1~2 圈
    // （转速逐渐衰减），1s 后开始攻击，其余与常规法术矩阵逻辑一致（含 18s 胡乱移动后离场）；
    // 秒杀类通道（埃逸自爆波 aiyiSelfDestruct / 金色陨石 sweepKill）内禁用该亡语（与增生侧翼艇同规则：
    // 秒杀过处不留残党，统一规则见 07-player gachaMeteorImpact 注释）
    if (e.type === 'fashiArray' && !(state.aiyiSelfDestruct || state.sweepKill)) {
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
    // 暴鸰 / 暴鸰·G / 虚幻 击毁：机体爆碎演出（未投弹时 detonateBaoling 另有大型爆炸；不抖屏；虚幻为冰蓝碎片）
    if (e.type === 'baoling' || e.type === 'baolingG') {
      spawnParticles(e.x, e.y, '#ff7a45', 20, 280);
      spawnParticles(e.x, e.y, '#ffd166', 12, 220);
    }
    if (e.type === 'unreal') {
      spawnParticles(e.x, e.y, '#7fd4ff', 20, 280);
      spawnParticles(e.x, e.y, '#dff2ff', 12, 220);
    }
    // 焦香螺旋桨击毁：橙红黄三色火焰碎片演出（不抖屏）
    if (e.type === 'jiaoxiang') {
      spawnParticles(e.x, e.y, '#ff7a18', 30, 340);
      spawnParticles(e.x, e.y, '#ff4500', 20, 280);
      spawnParticles(e.x, e.y, '#ffd166', 14, 220);
    }
    // 奖励无人机击毁：进入死亡演出序列（盒子脱离迅速渐隐 → 本体快速渐隐；仅斗志昂扬追加淡黄光环 + 攻速/弹速翻倍增益）
    // 增益在演出中段（盒渐隐结束）由 updateDouzhiFx 激活；本体作为 douzhiFx 独立绘制、渐隐后移除；
    // 赞助系击毁改为授予奖励道具（grantRewardItem，已有道具则无法获得）
    if (e.type === 'douzhi' || e.type === 'sponsor' || e.type === 'sponsorDeluxe') {
      douzhiFx.push({ x: e.x, y: e.y, t: 0, wobble: e.wobble, kind: e.type, buffGiven: false, boxAlpha: 1, boxDy: 0, bodyAlpha: 1 });
      const pc = e.type === 'douzhi' ? '#8fd0ff' : e.type === 'sponsorDeluxe' ? '#ffe9a8' : '#ffffff';
      spawnParticles(e.x, e.y, pc, 18, 240);
      spawnParticles(e.x, e.y, '#f6ecb4', 12, 200);
      if (e.type !== 'douzhi') grantRewardItem(e.type, e.x, e.y);   // 赞助系击毁掉落奖励道具（测试模式同规则）
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
    // 水晶掉落：概率与数量逐型定义（怪物属性总表 2026-09 批次）；直接垂直下坠，不乱飘（测试模式不掉水晶、不掉道具）
    if (!testMode) {
      // 1类 60% 掉 1~3（紫电/大型龙卷不掉）；2类常规 70% 掉 4~5 + 10% 掉 6；幽暮 80% 掉 6~10；斗志昂扬必掉 6
      // A1 60% 掉 4~5 + 20% 掉 6~8；破片 80% 掉 5~7；矩阵 80% 掉 4~6；炮艇 80% 掉 9~11；先兆者 80% 掉 9~12
      // 威龙 80% 掉 16~22；寒霜/御4/铁砧 90% 掉 6~10；暴鸰 80% 掉 6~8；焦香/脉冲矩阵 90% 掉 12~14；A2 80% 掉 9~12
      // 4类（主力舰三变体 / 法术阵列）必掉：5% 掉 40~48、其余 24~35
      // BOSS 击败后固定首波（postBossWave 标记）的 1类：必定掉落且数量翻倍（2~6）
      const isDusk = e.type === 'striker' && e.skill === 'dusk';
      const r = Math.random();
      let cCount = 0;
      if (e.type === 'capital' || e.type === 'fashiArray') {
        cCount = r < 0.05 ? 40 + Math.floor(Math.random() * 9) : 24 + Math.floor(Math.random() * 12);
      } else if (e.type === 'weilong') {
        cCount = r < 0.80 ? 16 + Math.floor(Math.random() * 7) : 0;
      } else if (e.type === 'hanshuang' || e.type === 'yu4' || e.type === 'anvil') {
        cCount = r < 0.90 ? 6 + Math.floor(Math.random() * 5) : 0;
      } else if (e.type === 'jiaoxiang' || e.type === 'pulseMatrix') {
        cCount = r < 0.90 ? 12 + Math.floor(Math.random() * 3) : 0;   // 焦香 / 脉冲矩阵：水晶掉落等同
      } else if (e.type === 'fashiA2') {
        cCount = r < 0.80 ? 9 + Math.floor(Math.random() * 4) : 0;
      } else if (e.type === 'gunship') {
        cCount = r < 0.80 ? 9 + Math.floor(Math.random() * 3) : 0;
      } else if (e.type === 'harbinger') {
        cCount = r < 0.80 ? 9 + Math.floor(Math.random() * 4) : 0;
      } else if (e.type === 'baoling' || e.type === 'baolingG') {
        cCount = r < 0.80 ? 6 + Math.floor(Math.random() * 3) : 0;
      } else if (e.type === 'douzhi' || e.type === 'sponsor' || e.type === 'sponsorDeluxe') {
        cCount = 6;
      } else if (isDusk) {
        cCount = r < 0.80 ? 6 + Math.floor(Math.random() * 5) : 0;
      } else if (e.type === 'striker') {
        cCount = r < 0.70 ? 4 + Math.floor(Math.random() * 2) : r < 0.80 ? 6 : 0;
      } else if (e.type === 'fashiA1') {
        cCount = r < 0.60 ? 4 + Math.floor(Math.random() * 2) : r < 0.80 ? 6 + Math.floor(Math.random() * 3) : 0;
      } else if (e.type === 'popian') {
        cCount = r < 0.80 ? 5 + Math.floor(Math.random() * 3) : 0;
      } else if (e.type === 'fashiMatrix') {
        cCount = r < 0.80 ? 4 + Math.floor(Math.random() * 3) : 0;
      } else {
        cCount = r < 0.60 ? 1 + Math.floor(Math.random() * 3) : 0;   // 1类（side / prolifera）
      }
      if (e.postBossWave) cCount = 2 * (1 + Math.floor(Math.random() * 3));   // 固定首波 1类：必掉且翻倍
      const noDrop = (e.type === 'side' && (e.behavior === 'kamikaze' || e.behavior === 'swirl')) || e.type === 'tornado';   // 紫电/橙旋/大型龙卷不掉水晶
      // BOSS 战强制波 1类（minionDrop）：不掉水晶
      if (!noDrop && !e.minionDrop && cCount > 0) {
        // 水晶分档换算（三档 + 巨型，见 01-config convertCrystalDrop）：价值守恒，巨型逐颗掷概率转化
        const mix = convertCrystalDrop(cCount);
        const spawnTier = (tier) => {
          const def = CRYSTAL_TIERS[tier];
          const roll = rollCrystalGiant(tier);   // 巨型转化掷骰（萧杨概率 ×1.5；提升部分转出按原档计分——见 01-config rollCrystalGiant）
          const t2 = roll.tier2;
          const colorKey = roll.giant ? 'g0' : 'c' + Math.floor(Math.random() * CRYSTAL_COLORS_NORMAL.length);   // 日常掉落：双色均分（青 / 水蓝）——粉色仅 BOSS 掉落（2026-09-27 定稿）；转巨型固定青（粉巨型同为 BOSS 专属）
          crystals.push({
            x: clampDropX(e.x + rand(-10, 10), def.r), y: e.y + rand(-6, 6),
            vx: 0, vy: rand(150, 200),
            r: def.r, val: roll.val,
            tier: t2, colorKey, giant: roll.giant,
            phase: Math.random(),
            t: Math.random() * Math.PI * 2,
          });
        };
        for (let k = 0; k < mix.small; k++) spawnTier('small');
        for (let k = 0; k < mix.mid; k++) spawnTier('mid');
        for (let k = 0; k < mix.big; k++) spawnTier('big');
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
    detonateBaoling, updateFrostZones, updateDouzhiFx, enemyColorTags, rollItemDrops, anvilHealTick, jiaoxiangBurn,
    updateWgSlashes, updateXgLooseBombs, killEnemy, cancelBossWarns,
  };