// 08-entities：子弹 / 道具 / 水晶 / 粒子更新 + 全屏特效状态（state.flash / 冲击波）

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：04-spawn(1 名) 05-boss(1 名) 06-enemy(1 名) 07-player(7 名) 10-draw-world(4 名) 12-ui(4 名) 14-main(11 名)
  // 本文件写共享状态（state/bossFlow/levelFlow 属性赋值；新增属性先在 02-core 归域声明）：
  //   state.{bombs, score, txcSkillCd}
  //
  import { CANVAS_H, CANVAS_W } from './01-config-core.js';
  import { ARMOR_SKILLS, crystalShieldDur, BULWARK, MAX_BOMBS, PILOTS, PLAYER_CFG, PRINCE_STORM, SHIELD_DURATION, TXC, currentArmor, currentWingman, hasPilot, playerHitRadius, txcActive } from './01-config-loadout.js';
  import { BEYOND_WING, FASHI_MATRIX, GUILT_GRAIL, HANSHUANG, JIAOXIANG, ELITES, STASIS_UNREAL, THUNDER, enemyColorTags, enemyGrade } from './01-config-enemies.js';
  import { BOSS_LOWFIRE_BONUS, DARKHAND, STORM, STORM2, STORM_SHIP } from './01-config-boss.js';
  import { diffMods, enemyDmgMul, isRealme, isPoem, pxpfChargeHurtMul, constructAltHurtMul, xiayongBarAbsorb, xiayongHornDmgMul, HP_KIT_HEAL_PCT } from './01-config-difficulty.js';
  import { CHAOS_SMALL_DMG_MUL, CRYSTAL_ABSORB_DELAY, PIERCE_WEAKEN_MUL } from './01-config-spawn.js';
  import { bossEntranceActive, bossPhantom, bossFlow, clamp, dashKillFx, dhGuardActive, eBullets, enemies, enemyOnScreen, crystals, frostZones, hasteMul, timeflowMul, notePlayerDamage, pBullets, particles, phaseFx, player, powerups, rand, rewardOutMul, spawnParticles, state, trailGhosts, beamFx, wingmen, missiles, popianMissiles, blBombs, spellCubes, wgSlashes, canClearBullet, CLEAR_TIER } from './02-core.js';
  import { yu4AuraMul } from './04-spawn.js';
  import { killEnemy, grailRedirect, applyRainAttackDelay } from './06-enemy.js';
  import { armorSkillGain, currentBombCap, kingDmgBonusMul, noteGachaStone, princeStormKillGain, pickTisuRandom } from './07-player.js';
  import { bulwarkActive, clipAgainstShield, damagePlayer, pickupBerserk, pickupKit, rainApplyBerserk, rainApplyKit, shieldReflectHit, shieldSweepHit } from './07-player.js';
  import { achvNoteGiantCrystal, achvNoteLanxinAbsorb, achvNoteLanxinShieldStart, achvNotePickup, achvWingmanBlock, achvZidianHit } from './02-achievements.js';
  import { affixBulwarkAbsorbDmg, affixCrystalExtend, affixCrystalShieldDur, affixFreezeNote, affixHas, affixMainGunDamageMul, affixResetShieldExt } from './03b-affix.js';


  // ---------- 敌人受伤修正链（主武器弹幕 / 僚机弹幕 / 空间斩击共用）----------
  // 返回对敌人 e 的伤害倍率；isWing 标识该伤害是否来自僚机弹幕；
  // hitX/hitY = 弹体命中点坐标（可选——空间斩击等大范围伤害不传，不判部位）。
  function enemyDamageMul(e, isWing, capVuln, hitX, hitY) {
    let mul = 1;
    // 大无垠之王：BOSS 战累积的造成伤害提升（怒意蔓延，见 07-player updatePilotStatus 累积 / 06-enemy killEnemy 清算）
    mul *= kingDmgBonusMul();
    // 副武器·极夜流光：对 4类敌人（主力舰 / 法术阵列）增伤（capVuln 取自弹体 b.capVuln，注册表 1.5）
    if (capVuln && (e.type === 'capital' || e.type === 'fashiArray')) mul *= capVuln;
    // 词条（诗篇级 3:good:0）侧翼破防：所有自侧翼出现的敌人受到的伤害提高 150%（×2.5）。
    // 主武器/僚机/空间斩击链均生效（高能爆弹为真实伤害不经此处——同本函数其他词条口径）
    if (affixHas('3:good:0') && e.affixSideEntry) mul *= 2.5;
    // 词条（诗篇级 3:good:2）冰封：冻结期间敌人失去虚化护盾和所有减伤——提前返回，仅保留玩家侧
    // 增伤乘区（怒意 / 4类易伤 / 侧翼破防），其余敌人侧减伤与部位判定全部跳过（口径待定稿）
    if ((e.frozenT || 0) > 0) return mul;
    // 御4防御光环：光环内敌人受到的非真实伤害 -30%（高能爆弹为真实伤害，在 useBomb 直接结算、不经过此处）
    mul *= yu4AuraMul(e);
    if (e.type === 'tornado') {
      // 风团：主武器减伤 50%、僚机伤害 +150%（弱点：僚机火力）；真我/诗篇：僚机易伤额外 +150%（加算，不乘算；
      // stormTier 口径 = 05-boss stormTier()，诗篇沿用真我全套——2026-10-10 用户定稿）
      mul *= isWing
        ? (1 + STORM.tornadoWingVuln + ((isRealme() || isPoem()) ? STORM_SHIP.s2.wingVulnAdd : 0))
        : (1 - STORM.tornadoMainDR);
    }
    {   // 低火力补偿（2026-10-13 用户定稿改版）：火力 Lv1/2/3 对 BOSS 与 4S 敌人 ×1.30/×1.20/×1.10（原仅 Lv1 对 BOSS +20%；
      // 4S 判定 = ELITES 四精英 + 张华&张策，与 DROP_HP_ELITE 同口径——见 06-enemy 掉落链同名判定）
      const lf = BOSS_LOWFIRE_BONUS[player.weapon];
      if (lf && (e.type === 'boss' || ELITES[e.type] || e.type === 'zhangzhang')) mul *= (1 + lf);
    }
    // 法术矩阵：受到来自主战机（非僚机）的伤害 -30%（僚机弹幕正常）
    if (e.type === 'fashiMatrix' && !isWing) mul *= (1 - FASHI_MATRIX.mainDR);
    // BOSS 受到暴走（Lv5）伤害减免：风暴编织者专属 -30%（2026-10-11 用户定稿删除原「真我全体 BOSS -10%」，
    // 仅保留编织者 BOSS 专属档）。主炮/僚机弹幕/空间斩击均生效；高能爆弹为真实伤害不经此处
    if (e.type === 'boss' && player.weapon >= 5 && e.bossId === 'storm2') {
      mul *= (1 - STORM2.berserkDR);
    }
    // 暴风之眼技能4 漩涡弹幕的持续期间减伤 25% 已删除（2026-10-14 用户定稿：释放漩涡弹幕时不再拥有减伤）
    // 焦香螺旋桨：登场 2s 内受到的伤害 -30%（入场保护，主武器与僚机弹幕均生效）
    if (e.type === 'jiaoxiang' && (e.auraT || 0) < JIAOXIANG.entryDRT) mul *= (1 - JIAOXIANG.entryDR);
    // 寒霜：入场未减速阶段（距落点 ≥90px、未开始减速）受到的伤害 -20%（主武器与僚机弹幕均生效）
    if (e.type === 'hanshuang' && e.hsNoDecel) mul *= (1 - HANSHUANG.entryDR);
    // 坚垒护卫艇：登场后随时间易伤递增（2026-10-11 用户定稿）——每完整 1s 受到伤害 +10%，
    // 10s 起改为每完整 1s +20%（无上限：0~1s ×1.0 / 9~10s ×1.9 / 10~11s ×2.0 / 11~12s ×2.2 …）；
    // 主武器/僚机弹幕/空间斩击共用本链均生效（高能爆弹为真实伤害不经此处）；登场锚点 e.fortBorn 见 04-spawn
    if (e.type === 'striker' && e.variant === 'fortress' && e.fortBorn != null) {
      const fortAge = Math.max(0, state.time - e.fortBorn);
      mul *= fortAge < 10 ? 1 + 0.1 * Math.floor(fortAge) : 2 + 0.2 * Math.floor(fortAge - 10);
      // 词条（虚象级 0:bad:0）：坚垒护卫艇受到的所有伤害降低 25%
      if (affixHas('0:bad:0')) mul *= 0.75;
    }
    // 黑暗之手：本段击坠增伤优先于护卫减伤（2026-10-08 用户定稿）——当前血量窗口的精英被击坠（e.dhAmp，
    // 登记见 02-core dhOnLinkedEliteKilled）→ 减伤撤销、受到的普通伤害 +100%（至本段结束/下一窗口召唤止）；
    // 否则场上存在任意一名连携精英（dhLink，80/60/40/20% 血量阈值召唤）时减伤分档（2026-10-17 用户定稿）：
    // 在场连携精英全为辛国栋/韩希先（第二组）→ guardDRXinHan -60%；混有夏勇/朴学峰或仅第一组 → guardDR -65%
    //（主武器/僚机弹幕/斩击；高能爆弹/绷绷炸弹为真实伤害，两种修正均不受、连携精英亦同受爆弹伤害——2026-10-04 用户定稿；见 01-config DARKHAND.summon）
    if (e.type === 'boss' && e.bossId === 'darkhand') {
      if (e.dhAmp) mul *= 1 + DARKHAND.summon.guardAmp;
      else if (dhGuardActive()) {
        const xinHanOnly = enemies.every(el => !el || !el.dhLink || el.hp <= 0 ||
          el.type === 'xinguodong' || el.type === 'hanxixian');   // 在场连携精英全为第二组（辛国栋/韩希先）
        mul *= 1 - (xinHanOnly ? DARKHAND.summon.guardDRXinHan : DARKHAND.summon.guardDR);
      }
    }
    // 词条（具象级 1:bad:7）法师横移：法术大师A1/A2 在横移期间受到的所有伤害降低 60%
    //（主武器/僚机弹幕/空间斩击共用链均生效；高能爆弹为真实伤害不经此处）
    if ((e.type === 'fashiA1' && e.fa1State === 'strafe') || (e.type === 'fashiA2' && e.fa2State === 'strafe')) {
      if (affixHas('1:bad:7')) mul *= 0.4;
    }
    // 词条（具象级 1:bad:10）：所有炮火先兆者及其变体受到的伤害降低 10%（预警时长 -0.5s 在 06-enemy 生成侧生效）
    if (e.type === 'harbinger' || e.type === 'harbingerLead' || e.type === 'harbingerHub' || e.type === 'harbingerPolar') mul *= 0.9;
    // 铜皮夏勇·牛角减伤（被动常驻，2026-10-03 用户定稿）：命中点落在两翼折角（牛角）头部时 ×0.5——
    // 主炮/僚机弹幕传弹体坐标判定；空间斩击等大范围伤害不传命中点、不判部位（见 01-config xiayongHornDmgMul）
    mul *= xiayongHornDmgMul(e, hitX, hitY);
    return mul;
  }

  // ---------- 子弹 ----------
  // 坠星长枪对单敌伤害结算（首击 / 驻留穿刺共用一条链）：修正口径 = 通用碰撞区我方子弹的公共子集
  //（无穿透弱化 / 主炮小怪特化 / 风暴诗篇乘区 / llSword——长枪弹体不携带这些标记）。
  // 返回 false = 长枪本次应销毁：打进愧悔魂灵圣杯转移圈（「穿透弹打转移目标不触发穿透、一律销毁」同口径）。
  // 次数盾（2026-11-17 用户三次定稿）：耗 1 层挡本次伤害、弹体继续贯穿不销毁——次数盾语义=「伤害吸收券」，
  // 只挡伤害不清空贯穿弹价值（彻月/长枪/时流天梭共用；普通单发弹仍销毁=挡伤害，见通用命中区；极夜千星保留
  // 2026-11-16 专属 60/40 破盾口径不动）
  function lanceSettle(b, e, base) {
    if (e._deathSettled || e.hp <= 0) return true;   // 已击杀 / 结算中敌人跳过（inner 为快照——同帧早序击杀的敌人不再结算，防 indexOf -1 误删）
    if ((e.chargeShield || 0) > 0) {   // 青时战舰召唤体次数盾：耗 1 层挡本次伤害（本体不受伤）、弹体继续贯穿——白色浅盾挡击粒子反馈
      e.chargeShield--;
      spawnParticles(b.x, b.y, '#ffffff', 6, 150);
      return true;
    }
    let dmg = base * enemyDamageMul(e, false) * rewardOutMul();
    const gt = grailRedirect(e, 'bullet');
    if (gt) {
      gt.g.hp -= dmg * pxpfChargeHurtMul(gt.g) * constructAltHurtMul(gt.g);   // 易伤按承接方圣杯判定
      spawnParticles(b.x, b.y, '#ffe9b0', 4, 120);
      if (gt.g.hp <= 0) killEnemy(enemies.indexOf(gt.g));
      return false;
    }
    if (e.type === 'guiltGrail') dmg *= GUILT_GRAIL.directBulletMul;   // 圣杯本体直击 ×1.25（2026-11-10 用户定稿）
    if (e.barrier > 0) { const abs = Math.min(e.barrier, dmg); e.barrier -= abs; dmg -= abs; }   // 屏障优先吸收
    e.hp -= xiayongBarAbsorb(e, dmg * pxpfChargeHurtMul(e) * constructAltHurtMul(e));   // 朴学峰冲刺易伤等走通用通道
    affixFreezeNote(e, dmg);   // 词条（诗篇级 3:good:2）冰封：命中与伤害计数
    if (e.hp <= 0) killEnemy(enemies.indexOf(e));
    return true;
  }

  // ---------- 时流天梭对单敌伤害结算（2026-11-17 实装，同日二次定稿改口径）----------
  // 2026-11-17 用户二次定稿：穿透范围收窄——「无视屏障」仅指吸收型屏障（青时支援屏障 e.barrier 不吸收 /
  // 夏勇·黄金壁垒 xyBar 不经 xiayongBarAbsorb 直扣）；次数盾 chargeShield 挡本次伤害（本体不受伤）但弹体继续贯穿
  // 不销毁（同日三次定稿——次数盾语义=伤害吸收券，同彻月/长枪口径）；虚化 phase>0 在碰撞候选层过滤（全游戏相位免疫）。
  // 首击翻倍范围同步收窄：对「当前带可穿透屏障（e.barrier/xyBar）」敌人每颗弹首次伤害 ×2（b.tsBonus 跨段持久
  // ——同一敌人跨多段冲刺仅翻倍一次）；自身伤害 ×wpn.selfDmgMul（1.5 装备联动恒定生效）；
  // 其余走通用通道（enemyDamageMul(wing) / 奖励道具输出修正 / 圣杯转移（穿透弹打转移目标一律销毁——同彻月/长枪口径）/
  // 圣杯本体直击 ×1.25 / 朴学峰冲刺易伤 / 坍缩构造体随场高 / 冰封词条计数 / 击杀链）。返回 false = 弹体本次应销毁（圣杯转移——次数盾不再销毁弹体）
  function tisuSettle(b, e) {
    if (e._deathSettled || e.hp <= 0) return true;   // 已击杀 / 结算中敌人跳过（快照防御，同 lanceSettle 口径）
    if ((e.chargeShield || 0) > 0) {   // 次数盾（2026-11-17 三次定稿）：耗 1 层挡本次伤害（本体不受伤）、弹体继续贯穿不销毁——同彻月/长枪口径
      e.chargeShield--;
      spawnParticles(b.x, b.y, '#ffffff', 6, 150);
      return true;
    }
    const wpn = currentWingman.weapon;
    let dmg = b.dmg * (wpn && wpn.selfDmgMul ? wpn.selfDmgMul : 1);
    if ((e.barrier || 0) > 0) {   // 可穿透屏障首击翻倍（判定=当前带屏障——夏勇/黄金壁垒已并入 e.barrier 单通道）
      if (!b.tsBonus) b.tsBonus = new Set();
      if (!b.tsBonus.has(e)) { b.tsBonus.add(e); dmg *= 2; }
    }
    dmg = dmg * enemyDamageMul(e, true) * rewardOutMul();
    const gt = grailRedirect(e, 'bullet');
    if (gt) {   // 圣杯转移：穿透弹打转移目标不触发穿透、一律销毁（同通用命中区口径）
      gt.g.hp -= dmg * pxpfChargeHurtMul(gt.g) * constructAltHurtMul(gt.g);   // 易伤按承接方圣杯判定
      spawnParticles(b.x, b.y, '#ffe9b0', 4, 120);
      if (gt.g.hp <= 0) killEnemy(enemies.indexOf(gt.g));
      return false;
    }
    if (e.type === 'guiltGrail') dmg *= GUILT_GRAIL.directBulletMul;   // 圣杯本体直击 ×1.25（2026-11-10 用户定稿）
    // 吸收型屏障两通道全部跳过（本武器无视屏障直扣机体）：不吸收 e.barrier、不经过 xiayongBarAbsorb
    e.hp -= dmg * pxpfChargeHurtMul(e) * constructAltHurtMul(e);
    affixFreezeNote(e, dmg);   // 词条（诗篇级 3:good:2）冰封：僚机弹命中与伤害计数
    spawnParticles(b.x, b.y, '#bfe6ff', 4, 120);
    if (e.hp <= 0) killEnemy(enemies.indexOf(e));
    return true;
  }

  // ---------- 极夜千星瞬时激光炮（hitscan，2026-11-12 用户定稿改版）----------
  // 发射瞬间自僚机出舱口竖直向上全程结算：无飞行弹体、无限射程（扫至屏顶）——不存在「射速/弹速」概念；
  // 沿途敌人按「距僚机由近到远」依次结算，贯穿剩余伤害 beamRemain 每次命中按敌人命中前血量扣减
  //（用户口径：伤害100 打 hp10 敌 → 穿透、剩 90；打 hp200 敌 → 扣 min(100,200)=100 归零、光束截断无法穿透）；
  // 结算完毕生成 beamFx 视觉残留（快速消散——寿命推进在本文件 updateBullets 顶部、绘制见 10-draw-world drawJiyeBeamFx，
  // 消散期无伤害：全部伤害已在生成瞬间结算完毕）。
  // 修正口径 = 通用碰撞区我方子弹的公共子集（僚机弹 wing 口径）：enemyDamageMul(wing) / rewardOutMul /
  // 次数盾（2026-11-16 用户改版：耗 1 层破盾——消耗当前剩余伤害的 60%、40% 照常打到敌人、光束继续穿透）/
  // 圣杯转移（穿透类打转移目标一律截断）/ 屏障优先吸收 / 夏勇屏障 / 冰封词条计数；命中粒子照常迸出。
  function scanJiyeBeam(originX, originY, dmg, radius, isBerserk, side, shieldKeep) {
    const path = [];
    for (const e of enemies) {
      if (!enemyOnScreen(e) || e.dying || e.phase > 0) continue;   // 屏外 / 渐隐消逝 / 虚化：光束穿透不结算
      if (e.type === 'boss' && (bossEntranceActive() || bossPhantom(e))) continue;   // BOSS 登场虚化同口径
      if (e.y >= originY) continue;   // 仅结算僚机口上方的敌人（光束向上）
      if (Math.abs(e.x - originX) >= e.w / 2 + radius) continue;   // x 与光束相交判定
      path.push(e);
    }
    path.sort((a, b) => b.y - a.y);   // 由近到远（y 大 = 靠近僚机 = 先结算）
    let remain = dmg;
    let endY = 0;   // 光束末端 y（默认 0 = 无限射程扫至屏顶）
    for (const e of path) {
      if (remain <= 0) break;
      if (e.hp <= 0 || e._deathSettled) continue;   // 同帧已被其他伤害杀死的敌人跳过（快照防御，同 lanceSettle 口径）
      // 次数盾（2026-11-16 用户改版，2026-11-17 消耗改 65%）：耗 1 层破盾——消耗当前剩余伤害的 65%（保留 shieldKeep 35%），
      // 35% 作为光束剩余伤害继续结算该敌本体（按本体血量截断——血尽穿透、量足截断，同普通命中口径）
      if ((e.chargeShield || 0) > 0) {
        e.chargeShield--;
        remain *= shieldKeep;   // 剩余伤害扣 65%（盾消耗），35% 继续向下结算本体
        spawnParticles(e.x, e.y, '#ffffff', 6, 150);
        // 不截断、不跳出——落到下方普通命中路径结算该敌本体（含 grail/屏障/夏勇/冰封/击杀链）
      }
      const hpBefore = e.hp;   // 命中前血量（贯穿剩余伤害按敌人当前血量扣减）
      let hurt = remain * enemyDamageMul(e, true) * rewardOutMul();   // 基于当前剩余伤害（贯穿到后续敌人时按剩余结算）
      const gt = grailRedirect(e, 'bullet');
      if (gt) {   // 圣杯转移：穿透类打转移目标不触发穿透、一律截断（同通用命中区口径）
        gt.g.hp -= hurt * pxpfChargeHurtMul(gt.g) * constructAltHurtMul(gt.g);
        spawnParticles(e.x, e.y, '#ffe9b0', 4, 120);
        if (gt.g.hp <= 0) killEnemy(enemies.indexOf(gt.g));
        endY = e.y; remain = 0;
        break;
      }
      if (e.type === 'guiltGrail') hurt *= GUILT_GRAIL.directBulletMul;   // 圣杯本体直击 ×1.25（2026-11-10 用户定稿）
      if (e.barrier > 0) { const abs = Math.min(e.barrier, hurt); e.barrier -= abs; hurt -= abs; }   // 屏障优先吸收
      e.hp -= xiayongBarAbsorb(e, hurt * pxpfChargeHurtMul(e) * constructAltHurtMul(e));
      affixFreezeNote(e, hurt);   // 词条（诗篇级 3:good:2）冰封：僚机弹命中与伤害计数
      spawnParticles(e.x, e.y, '#ffffff', 4, 120);
      remain -= Math.min(remain, Math.max(hpBefore, 0));   // 贯穿剩余伤害扣减（用户口径）
      if (e.hp <= 0) killEnemy(enemies.indexOf(e));
      if (remain <= 0) { endY = e.y; break; }   // 剩余归零：光束截断于该敌（无法穿透）
    }
    // 视觉残留（2026-11-13 用户定稿）：发射后跟随玩家走（推进循环里 x/y0 跟随僚机——僚机 lerp 跟玩家）、0.8s 渐隐消失；
    // 暴走持续模式：刷新同侧已有光束寿命（t 重置 → 单条常驻，停止暴走后 0.8s 渐隐兜底）；常态每次生成新光束
    const prev = isBerserk ? beamFx.find(fx => fx.side === side && fx.berserk) : null;
    if (prev) { prev.t = 0; prev.y0 = originY; prev.y1 = endY; prev.remain = remain; }
    else beamFx.push({ x: originX, y0: originY, y1: endY, t: 0, dur: 0.8, berserk: !!isBerserk, remain, side: side || 0 });
  }

  function updateBullets(dt) {
  // 雷霆之怒雷电光环（4C，2026-11-16 用户定稿实装）：本帧场上雷霆之怒列表缓存——供敌弹循环逐弹
  // 判定过境加成（THUNDER.auraR 125 同径：弹速 +20%、伤害 +2/诗篇4、蓝色电光标记、命中麻痹 0.5s；
  // 光束生长速率同步 ×1.2）。对雷霆之怒自身射弹同样生效（发射者不限）
  const thunderWraths = [];
  for (const en of enemies) {
    if (en.type === 'thunderWrath' && !en.dying && en.hp > 0 && !en.leaving) thunderWraths.push(en);
  }
  // 玩家屏障（青时战舰支援弹）：持续 10s，末 1s 线性衰减至 0（可见的快速消散）；
  // 衰减按 Math.min 收敛——屏障被打掉的量不回填（衰减公式只封顶、不补偿）；
  // 重复命中叠加（barrier/barrierMax 同步增长，2026-10-12 用户定稿）并刷新持续时间，由支援弹命中处重置
  if (player.barrierT > 0) {
    player.barrierT -= dt;
    player.barrier = Math.min(player.barrier,
      player.barrierT >= 1 ? player.barrierMax : player.barrierMax * Math.max(0, player.barrierT));
    if (player.barrierT <= 0) { player.barrier = 0; player.barrierMax = 0; }
  }
    // 暗紫轨迹残影：留存一段时间后渐隐消失
    for (let i = trailGhosts.length - 1; i >= 0; i--) {
      trailGhosts[i].life -= dt;
      if (trailGhosts[i].life <= 0) trailGhosts.splice(i, 1);
    }
    // 碎盾特效推进：寿命尽即移除（独立于敌人存续，斩碎后敌人被毁仍继续播放）
    for (let i = phaseFx.length - 1; i >= 0; i--) {
      phaseFx[i].t -= dt;
      if (phaseFx[i].t <= 0) phaseFx.splice(i, 1);
    }
    // 许凯狗冲刺白光冲击推进：寿命尽即移除（生成于 14-main 冲刺秒杀循环）
    for (let i = dashKillFx.length - 1; i >= 0; i--) {
      dashKillFx[i].t += dt;
      if (dashKillFx[i].t >= dashKillFx[i].max) dashKillFx.splice(i, 1);
    }
    // 极夜千星瞬时激光残留：寿命尽即移除（消散期无伤害——全部结算已在生成瞬间完成）；
    // x/y0 跟随僚机（僚机 lerp 跟玩家——2026-11-13 用户定稿「光束发射后仍然跟着玩家走」），y1 保持结算末端
    for (let i = beamFx.length - 1; i >= 0; i--) {
      const fx = beamFx[i];
      fx.t += dt;
      const w = wingmen.find(ww => ww.side === fx.side);   // 僚机不在（切换/未展开）时保持最后位置
      if (w) { fx.x = w.x; fx.y0 = w.y - 8; }
      if (fx.t >= fx.dur) beamFx.splice(i, 1);
    }
    // 斗志昂扬增益：期间我方（含僚机）弹道飞行速度翻倍 —— 作用于所有在飞子弹，增益结束即恢复常速；
    // 时流状态（超越艇·时流绿环命中我方，2026-11-13）：射速/弹速 +50%——同口径独立乘算叠加
    const hm = hasteMul() * timeflowMul();
    for (let i = pBullets.length - 1; i >= 0; i--) {
      const b = pBullets[i];
      // ── 天秀混沌王子·我方雷环（2026-11-17 用户定稿实装）：hold 停驻 → 爆开状态机（镜像 eBullets 雷环）──
      // 停驻期（holdT>0）：不移动、不命中——停留生成位 1s 后按 burstAng 以 v0 爆开；爆开后线性减速至
      // 巡航下限（decelRate/decelTo 已在 07-player txcSpawnRing 生成端 ×1.4 折算），位移/出界/命中
      // 走下方通用块（弹体命中即销毁）
      if (b.txcRing) {
        if (b.holdT > 0) {
          b.holdT -= dt;
          if (b.holdT <= 0) {
            b.vx = Math.cos(b.burstAng) * b.v0;
            b.vy = Math.sin(b.burstAng) * b.v0;
          }
          continue;   // 停驻期：跳过移动与命中
        }
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > b.decelTo) {
          const ns = Math.max(b.decelTo, sp - b.decelRate * hm * dt);
          b.vx *= ns / sp; b.vy *= ns / sp;
        }
        // 落到下方通用位移与命中区
      }
      // 副武器·时流之雨：横向初速逐帧指数衰减归零（vx ×e^(−latDecay·dt)，连续函数无档位跳变——速度曲线铁律；
      // ≈1s 衰减到 5%），弹道由斜升渐弯为竖直上行（绘制朝向取弹速方向，弯曲弹道的视觉呈现）；
      // 触碰吸收：道具（弹体接触）与水晶（弹体周身 absorbR 小范围）由玩家直接结算
      if (b.rain) {
        b.vx *= Math.exp(-b.latDecay * dt);
        rainAbsorbAround(b);
      }
      // 静滞区域（静滞虚幻）：我方子弹中心过境（受该区生效的静滞区）→ 永久标记（一次性）：弹速 ×0.6（-40%）、
      // 伤害 ×0.75（-25%，直接乘 b.dmg——命中结算点无需另乘），此后不再恢复——
      // 用户定稿「经过静滞区域的双方子弹弹速此后均减少40%且伤害降低25%」；穿透弹 dmg 重算（pierceBase）会覆盖减伤（边缘情况，接受）
      if (!b.stasisHit) {
        for (const z of frostZones) {
          if (z.stasis && z.affectsPlayer && Math.hypot(b.x - z.x, b.y - z.y) <= z.r) {
            b.stasisHit = true;
            b.vx *= STASIS_UNREAL.bulletSpeedMul; b.vy *= STASIS_UNREAL.bulletSpeedMul;
            b.dmg *= STASIS_UNREAL.bulletDmgMul;
            if (b.lanceSpd != null) { b.lanceSpd *= STASIS_UNREAL.bulletSpeedMul; b.dwellSpd *= STASIS_UNREAL.bulletSpeedMul; }   // 坠星长枪：巡航/驻留速度快照同步减成（否则 lance 块置值会覆盖弹速减成）
            if (b.tsDashSpd != null) b.tsDashSpd *= STASIS_UNREAL.bulletSpeedMul;   // 时流天梭：冲刺速度快照同步减成（推进由 tisu 状态机接管、不吃通用位移——同 lanceSpd 先例）
            break;
          }
        }
      }
      // 副武器·坠星长枪：垂直直射 + 驻留穿刺（2026-11-11 用户定稿）——
      // · 中心进入任一敌人碰撞盒 → 弹速降至驻留速度，脱离恢复巡航速（直接置值：进/出盒是离散事件、
      //   位置逐帧积分严格连续无瞬跳；静滞区域减速已在上方通用块作用，此处按现值归一续走）；
      // · 首击：首次进入某敌人碰撞盒结算一次首击伤害（hits Set 防同敌重复——含抖动重复进入）；
      // · 穿刺：盒内期间每 tickIv（0.2s）对当时盒内所有敌人结算一次穿刺伤害（首击后 tickIv 起算；
      //   脱离盒期间计时冻结，防穿出再穿入瞬间白得 tick）；
      // · 无限穿透：不进下方通用碰撞区（无命中销毁/穿透计数）——首击与穿刺经 lanceSettle 专属结算；
      // · 敌机下坠会缩短驻留时长（相对速度叠加）——快降杂兵近乎只吃首击、悬停大机体吃满 tick（特攻语义）
      if (b.lance) {
        const inner = [];
        for (const e of enemies) {
          if (!enemyOnScreen(e) || e.dying || e.phase > 0) continue;
          if (e.type === 'boss' && (bossEntranceActive() || bossPhantom(e))) continue;   // 登场虚化同通用口径
          if (Math.abs(b.x - e.x) < e.w / 2 && Math.abs(b.y - e.y) < e.h / 2) inner.push(e);
        }
        b.vy = -(inner.length ? b.dwellSpd : b.lanceSpd);   // 盒内驻留低速 / 盒外巡航速（快照已含静滞减成）
        b.x += b.vx * hm * dt; b.y += b.vy * hm * dt;
        if (b.y < -10 || b.x < -20 || b.x > CANVAS_W + 20) { pBullets.splice(i, 1); continue; }
        if (inner.length) {
          if (!b.hits) b.hits = new Set();
          let destroyed = false;
          for (const e of inner) {   // 首击：每敌一次
            if (b.hits.has(e)) continue;
            b.hits.add(e);
            if (!lanceSettle(b, e, b.dmg)) { destroyed = true; break; }
          }
          if (!destroyed) {   // 穿刺计时（盒内递减；首击销毁则跳过）
            b.tickT -= dt;
            if (b.tickT <= 0) {
              b.tickT += b.tickIv;
              for (const e of inner) {
                if (!lanceSettle(b, e, b.tickDmg)) { destroyed = true; break; }
              }
            }
          }
          if (destroyed) { pBullets.splice(i, 1); continue; }
        }
        continue;   // 长枪走专属移动与结算，不进通用碰撞区
      }
      // ── 时流天梭贯穿弹（僚机，2026-11-17 实装）：相位状态机 0=move 冲刺 → 1=hold 悬停 → 2=turn 转向 → move（再射）……
      //    常规（tsMaxStops=1）：首段飞抵瞄准点后过冲 100~120%（停止点钳制距屏缘 ≥tsEdge）指数刹车刹停 →
      //    转向随机敌人（1 类低权重——pickTisuRandom 07-player）→ 末段贯穿直出离场；
      //    暴走（tsMaxStops=4）：除末段外 dash 过冲后再次刹停（停止-再射 ×4）、悬停 0.5s（2s 间隔叠加不门控——多颗同场）。
      //    冲刺段武装结算（tisuSettle：仅无视吸收型屏障 e.barrier/xyBar 直扣机体 + 带屏障敌首击 ×2；
      //    次数盾照常耗层销毁弹、虚化 phase>0 相位免疫）；悬停/转向武装解除不结算；
      //    每段冲刺独立命中集 tsHits（多段可对同敌多次伤害）；速度连续性：全速段步进封顶于剩距、刹车段 v=剩距×k
      //    （初速 = dashSpeed 无缝衔接、≈0.2s 平滑刹停——速度曲线铁律）；静滞区域减成在上通用块作用于 tsDashSpd
      if (b.tisu) {
        if (b.tsPhase === 0) {
          // ---- 冲刺段：沿 tsAng 直线飞行；末段 tsStop 为 NaN——直飞出屏 ----
          const hasStop = !isNaN(b.tsStopX);
          const rem = hasStop ? Math.hypot(b.tsStopX - b.x, b.tsStopY - b.y) : Infinity;
          const brakeR = b.tsDashSpd / b.tsDampK;   // 刹车切点：v=剩距×k=dashSpeed 处（全速→刹车速度连续）
          let step = b.tsDashSpd * hm * dt;
          let arrived = false;
          if (hasStop) {
            if (rem > brakeR) { if (step > rem) step = rem; }        // 全速段（步进封顶于剩距——越过即到位）
            else step = Math.min(rem, Math.max(rem * b.tsDampK * hm * dt, 30 * hm * dt));   // 刹车段：v = 剩距×k 指数逼近 + 30px/s 爬行下限（纯指数仅渐进、永不满足 arrived 判据；下限使末段有限帧精确到位——衔接点 rem×k=30px/s 速度连续无档位跳变）
            arrived = step >= rem - 1e-6;
          }
          if (arrived) {
            b.x = b.tsStopX; b.y = b.tsStopY;   // 位置严格连续（末帧步进封顶）
            b.tsStopsDone++;
            b.tsPhase = 1;
            b.tsHoldT = b.tsHoldDur;
            b.tsHits = null;   // 段命中集随段重置（悬停/转向不结算，下段冲刺起算新集）
          } else {
            b.x += Math.cos(b.tsAng) * step;
            b.y += Math.sin(b.tsAng) * step;
          }
          // 出屏移除（停止点已钳制屏内——仅末段直出与异常越界）
          if (b.y < -24 || b.y > CANVAS_H + 24 || b.x < -24 || b.x > CANVAS_W + 24) { pBullets.splice(i, 1); continue; }
          // 冲刺段武装：沿途碰撞结算（候选口径同通用命中区；每敌每段一次——tsHits 去重）
          if (!arrived) {
            for (let j = enemies.length - 1; j >= 0; j--) {
              const e = enemies[j];
              if (!enemyOnScreen(e) || e.phase > 0 || e.dying) continue;
              if (e.type === 'boss' && (bossEntranceActive() || bossPhantom(e))) continue;   // 登场虚化同通用口径
              if (b.tsHits && b.tsHits.has(e)) continue;
              const hsE = (e.type === 'hanshuang' && e.hsNoDecel) ? HANSHUANG.entryHitScale : 1;   // 寒霜入场未减速：判定箱略缩
              if (Math.abs(b.x - e.x) < e.w / 2 * hsE + b.r && Math.abs(b.y - e.y) < e.h / 2 * hsE + b.r) {
                if (!b.tsHits) b.tsHits = new Set();
                b.tsHits.add(e);
                if (!tisuSettle(b, e)) { pBullets.splice(i, 1); break; }   // 圣杯转移：弹体销毁（向下遍历，splice 安全）
              }
            }
          }
          continue;
        }
        if (b.tsPhase === 1) {
          // ---- 悬停段：武装解除（不结算碰撞——伤害只发生在冲刺段），倒计时 ×hm（斗酲/时流等射速增益照常加速）----
          b.tsHoldT -= dt * hm;
          if (b.tsHoldT <= 0) {
            // 悬停结束：掷下一目标（随机敌人——1 类低权重，位置锁定不追踪），进入转向段
            const tgt = pickTisuRandom(b.tsLowW);
            if (tgt) {
              b.tsTgtX = tgt.x; b.tsTgtY = tgt.y;
              b.tsTgtAng = Math.atan2(tgt.y - b.y, tgt.x - b.x);
            } else {
              // 无合格敌人兜底（2026-11-20 用户定稿 30°）：竖直向上 ±30° 朝外（按出膛僚机侧 tsSide）——末段化直飞离场
              //（tsStopsDone 置满 → 转满后走「末段贯穿直出」分支，不再进入任何停止/循环节奏）
              b.tsTgtX = NaN; b.tsTgtY = NaN;
              b.tsTgtAng = -Math.PI / 2 + (b.tsSide || 0) * 30 * Math.PI / 180;
              b.tsStopsDone = b.tsMaxStops;
            }
            let dA = b.tsTgtAng - b.tsAng;   // 最短路径差角（[-π,π]——转向角积分平滑）
            dA = ((dA + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
            b.tsTurnLeft = Math.abs(dA);
            b.tsTurnDir = Math.sign(dA) || 1;
            b.tsPhase = 2;
          }
          continue;
        }
        // ---- 转向段：角度积分快速旋转（tsTurn rad/s——不用向量 OU，方向连续无瞬跳）；转满进入下一段冲刺 ----
        const stepA = b.tsTurn * hm * dt;
        if (stepA >= b.tsTurnLeft) {
          b.tsAng = b.tsTgtAng;
          if (b.tsStopsDone >= b.tsMaxStops) {
            b.tsStopX = NaN; b.tsStopY = NaN;   // 末段：贯穿直出离场（常规 1 次停止后 / 暴走第 4 次停止后）
          } else if (!isNaN(b.tsTgtX)) {
            // 非末段：朝锁定位过冲 ×100~120% 距离（逐段独立随机），沿射线钳制距屏缘 ≥tsEdge 后再次刹停
            //（停止点必须严格落在瞄准射线上——X/Y 独立钳制会掰离射线，刹车段 rem 触底反弹永不抵达）
            const d = Math.max(1, Math.hypot(b.tsTgtX - b.x, b.tsTgtY - b.y));
            const ov = b.tsOvMin + Math.random() * (b.tsOvMax - b.tsOvMin);
            const s = tisuRayStop(b.x, b.y, b.tsAng, d * ov, b.tsEdge);
            b.tsStopX = b.x + Math.cos(b.tsAng) * s;
            b.tsStopY = b.y + Math.sin(b.tsAng) * s;
          } else {
            // 无合格目标且非末段：理论不可达（无目标兜底已在悬停结束点末段化）——防御性保留：沿当前朝向直飞 26% 屏高后刹停
            const s = tisuRayStop(b.x, b.y, b.tsAng, CANVAS_H * 0.26, b.tsEdge);
            b.tsStopX = b.x + Math.cos(b.tsAng) * s;
            b.tsStopY = b.y + Math.sin(b.tsAng) * s;
          }
          b.tsHits = null;   // 新段新命中集
          spawnTisuRings(b.x, b.y, b.tsAng);   // 停止后再射：发射环（2026-11-18 用户定稿——转向完成进入冲刺的瞬间）
          b.tsPhase = 0;
        } else {
          b.tsAng += b.tsTurnDir * stepA;
          b.tsTurnLeft -= stepA;
        }
        continue;
      }
      // 僚机·今宵水滴弹弧线段：恒定向上加速度（vy 连续积分，速度矢量无档位跳变——速度曲线铁律；
      // jxAy 为向上加速度幅值，+y 向下坐标系中向上 = vy 递减）；追踪段不作用（jxPhase 1 起由下方追踪块接管转向与限速）
      if (b.jxDrop && b.jxPhase === 0) b.vy -= b.jxAy * dt;
      b.x += b.vx * hm * dt; b.y += b.vy * hm * dt;
      // ── 天秀混沌王子·折线光束（2026-11-17 用户定稿实装）：触左右壁反弹 + 头部轨迹记录 ──
      // 反弹镜像 eBullets bounceX（触壁 vx 反向——入射角=反射角口径）；轨迹沿头部逐帧记录（beamTrail
      // 同款：pathLen 超 len 弹出尾段），供渲染折线与折线多段命中判定（见下方通用命中区 txcZig 分支）
      if (b.txcZig) {
        if ((b.x < b.r && b.vx < 0) || (b.x > CANVAS_W - b.r && b.vx > 0)) b.vx = -b.vx;
        const prev = b.path[b.path.length - 1];
        b.path.push({ x: b.x, y: b.y });
        b.pathLen += Math.hypot(b.x - prev.x, b.y - prev.y);
        while (b.path.length > 1 && b.pathLen > b.len) {
          const tail = b.path[0], nxt = b.path[1];
          const s0 = Math.hypot(nxt.x - tail.x, nxt.y - tail.y);
          if (b.pathLen - s0 < b.len) break;
          b.pathLen -= s0;
          b.path.shift();
        }
      }
      // 沿飞行方向加速至上限（友方大风暴风弹：暴风之眼技能6 同款风条弹道；其他我方弹无此字段不受影响）
      if (b.accel) {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const ns = Math.min(b.maxSpeed || Infinity, sp + b.accel * dt);
        b.vx *= ns / sp; b.vy *= ns / sp;
      }
      // 副武器·无界飞剑（装备迪奥驾驶员时）的微弱追踪：朝最近的合格敌人限角速度转向（turnRate rad/s），
      // 无目标时保持直飞。索敌规则与主炮/僚机一致：屏幕外 / 虚化 / 濒死 / 登场虚化 BOSS 不索敌
      // （极夜流光已改为"发射前标记目标位置、直射不转向"，不再走此逻辑）
      if (b.homing) {
        let tgt = null, bestD = Infinity;
        for (const e of enemies) {
        if (!enemyOnScreen(e) || e.phase > 0 || e.dying) continue;
        if (e.type === 'boss' && (bossEntranceActive() || bossPhantom(e))) continue;
          const dx = e.x - b.x, dy = e.y - b.y, d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; tgt = e; }
        }
        if (tgt) {
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const cur = Math.atan2(b.vy, b.vx), want = Math.atan2(tgt.y - b.y, tgt.x - b.x);
          let diff = want - cur;
          if (diff > Math.PI) diff -= Math.PI * 2;
          else if (diff < -Math.PI) diff += Math.PI * 2;
          const maxTurn = b.turnRate * dt;
          const na = cur + clamp(diff, -maxTurn, maxTurn);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }
      // 僚机·今宵水滴弹追踪段：弧线段下坠折返（vy 转负）即刻切换追踪——限角速度转向锁定目标 +
      // 沿当前方向加速逼近上限（方向/速度大小逐帧连续，发射→弧线→追踪全程无瞬跳；2026-11-13 用户反馈
      // 「根本没追击敌人」——追踪切换自「升回出舱高度」提前至折返点，转向窗口更长、追踪动作更醒目，
      // 折返后仍先沿僚机外侧上升再弯向目标，保留「从下往上上来，随后快速去追踪」的节奏）；
      // 锁定目标失效（被移除 / 离屏 / 虚化 / 濒死 / BOSS 登场虚化）自动重锁最近合格敌人，无目标保持直飞
      if (b.jxDrop) {
        b.jxT += dt;
        if (b.jxPhase === 0 && (b.vy < 0 || b.jxT > 1.0)) b.jxPhase = 1;   // 折返点（vy 转负）→追踪（1.0s 超时兜底）
        if (b.jxPhase === 1) {
          // 目标有效性：被移除（enemies 不含）/ 失效即弃锁（成员扫描与失效判定一趟完成）
          if (b.jxTarget) {
            let ok = false;
            for (const e of enemies) {
              if (e !== b.jxTarget) continue;
              ok = !e.dying && e.phase <= 0 && enemyOnScreen(e) && !(e.type === 'boss' && (bossEntranceActive() || bossPhantom(e)));
              break;
            }
            if (!ok) b.jxTarget = null;
          }
          // 重锁：最近合格敌人（索敌口径同上 homing 区）
          if (!b.jxTarget) {
            let bestD = Infinity;
            for (const e of enemies) {
              if (!enemyOnScreen(e) || e.phase > 0 || e.dying) continue;
              if (e.type === 'boss' && (bossEntranceActive() || bossPhantom(e))) continue;
              const dx = e.x - b.x, dy = e.y - b.y, d = dx * dx + dy * dy;
              if (d < bestD) { bestD = d; b.jxTarget = e; }
            }
          }
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const cur = Math.atan2(b.vy, b.vx);
          let na = cur;
          if (b.jxTarget) {
            const want = Math.atan2(b.jxTarget.y - b.y, b.jxTarget.x - b.x);
            let diff = want - cur;
            if (diff > Math.PI) diff -= Math.PI * 2;
            else if (diff < -Math.PI) diff += Math.PI * 2;
            na = cur + clamp(diff, -b.jxTurn * dt, b.jxTurn * dt);   // 限角速度转向（角度积分平滑）
          }
          const ns = Math.min(b.jxMaxSpd * hm, sp + b.jxAccel * hm * dt);   // 沿当前方向加速逼近上限（连续）
          b.vx = Math.cos(na) * ns; b.vy = Math.sin(na) * ns;
        }
      }
      // 风条生长：刚射出时很短，沿飞行方向随时间迅速长到全长
      if (b.lenTarget && b.len < b.lenTarget) b.len = Math.min(b.lenTarget, b.len + (b.growRate || 130) * dt);
      // 弹径生长：浮海飘航者长条弹出膛整体 20%（长宽同步；rTarget/rGrowRate 缺省无此字段不生长）
      if (b.rTarget && b.r < b.rTarget) b.r = Math.min(b.rTarget, b.r + (b.rGrowRate || 20) * dt);
      // 极夜流光出手生长：初始光束长 len0（40），以二次缓动（大加速度）在 growDur 内长到全长 lenFull
      if (b.growDur != null && b.growT < b.growDur) {
        b.growT += dt;
        const gp = clamp(b.growT / b.growDur, 0, 1);
        b.len = b.len0 + (b.lenFull - b.len0) * gp * gp;
      }
      // 极夜流光暴走：光束上金红光芒流动伴随的少量粒子撒落
      if (b.laserBolt && b.berserk && Math.random() < 0.25) {
        spawnParticles(b.x + rand(-4, 4), b.y + rand(-4, 4), Math.random() < 0.5 ? '#ffb060' : '#ff7a45', 1, 30);
      }
      // 警报 / BOSS 登场动画：飞行中的飞剑弹快速消散（常规位移照常，提前渐隐移除并停止命中）
      if (b.sword && b.dieT == null && (bossFlow.stage === 'warn' || bossEntranceActive())) b.dieT = 0.3;
      if (b.dieT != null) {
        b.dieT -= dt;
        if (b.dieT <= 0) pBullets.splice(i, 1);
        continue;   // 消散期间：跳过索敌与命中结算（常规位移已在上方完成）
      }
      // 出界移除：友方大风暴风弹可斜向/朝下方 240° 扇形内飞行，横向与下边界出界一并移除
      if (b.y < -10 || b.y > CANVAS_H + 10 || b.x < -20 || b.x > CANVAS_W + 20) { pBullets.splice(i, 1); continue; }
      // 消散中的飞剑弹不再命中敌人
      if (b.dieT != null) continue;

      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (!enemyOnScreen(e)) continue;   // 屏幕外敌人（尚未入场 / 已离场 / 侧翼界外）不受我方子弹伤害
        if (b.lastHit === e || (b.hits && b.hits.has(e))) continue;   // 穿透弹防同机重复结算（不再陵落飞剑：刚穿过的机体下一帧仍重叠；彻月贯穿弹：长弹逐帧穿越——hits Set 防同敌多帧重复结算）
        if (e.phase > 0) continue;   // 虚化：炮弹穿过护盾，可打到后面的敌人
        if (e.dying) continue;   // 渐隐消逝中的暴风之眼：死亡演出期间不再受击
        if (e.type === 'boss' && (bossEntranceActive() || bossPhantom(e))) continue;   // BOSS 登场虚化：警报/入场动画期间射弹穿透不结算；词条（0:bad:5）虚化护盾同规则
        const hsE = (e.type === 'hanshuang' && e.hsNoDecel) ? HANSHUANG.entryHitScale : 1;   // 寒霜入场未减速：判定箱略缩
        // ── 天秀混沌王子弹体三态判定（2026-11-17 用户定稿实装；仅新弹携带新字段，存量弹零影响）──
        // capsule（蛇形雷条 txcBolt）：长条轴向投影判定（镜像 eBullets 长条投影口径）；
        // txcZig（折线光束）：path 多段线段-点最近距判定；其余弹：原圆点 vs 盒 AABB
        let hitE = false;
        if (b.capsule) {
          const bsp = Math.hypot(b.vx, b.vy) || 1, bux = b.vx / bsp, buy = b.vy / bsp;
          const tp = clamp((e.x - b.x) * bux + (e.y - b.y) * buy, -(b.len || 0) / 2, (b.len || 0) / 2);
          hitE = Math.hypot(e.x - (b.x + bux * tp), e.y - (b.y + buy * tp)) < Math.max(e.w, e.h) / 2 * hsE + b.r;
        } else if (b.txcZig && b.path && b.path.length > 1) {
          let best = Infinity;
          for (let pi = 0; pi < b.path.length - 1; pi++) {
            const a = b.path[pi], c = b.path[pi + 1];
            const dx = c.x - a.x, dy = c.y - a.y, dd = dx * dx + dy * dy;
            const t = dd > 0 ? clamp(((e.x - a.x) * dx + (e.y - a.y) * dy) / dd, 0, 1) : 0;
            const d2 = Math.hypot(e.x - (a.x + dx * t), e.y - (a.y + dy * t));
            if (d2 < best) best = d2;
          }
          hitE = best < Math.max(e.w, e.h) / 2 * hsE + b.r;
        } else {
          hitE = Math.abs(b.x - e.x) < e.w / 2 * hsE + b.r && Math.abs(b.y - e.y) < e.h / 2 * hsE + b.r;
        }
        if (hitE) {
          const hpBefore = e.hp;   // 命中前血量（极夜千星贯穿剩余伤害按敌人当前血量扣减——见下方 beamBullet 分支）
          // 青时战舰召唤体次数盾：单次伤害抵御一次（耗 1 层、弹体销毁——穿透类弹同样被挡）；
          // 时空允诺暴走弹（僚机 b.wing + b.glow，群星守愿 oval 弹除外）无视次数盾直接伤害；
          // 天秀折线光束（2026-11-17 用户定稿「激光全部无限穿透」）：耗 1 层挡本次伤害（本体不受伤）+
          // 光束继续穿透不销毁——同彻月/长枪贯穿弹 2026-11-17 新口径（lanceSettle/tisuSettle 同构）
          if ((e.chargeShield || 0) > 0 && !(b.wing && b.glow && !b.oval)) {
            e.chargeShield--;
            spawnParticles(b.x, b.y, '#ffffff', 6, 150);
            if (b.txcZig) {
              if (!b.hits) b.hits = new Set();
              b.hits.add(e);   // 盾挡本次伤害：该敌对这束记一次（后续帧不再重复判）
              continue;   // 不销毁、本体不受伤——光束继续穿透
            }
            pBullets.splice(i, 1);
            break;
          }
          // 4类主力舰：对玩家 Lv4 / 暴走(Lv5) 火力减伤 15%；玩家 Lv1 时对 BOSS 武器伤害 +20%
          // 全部敌人减伤/易伤修正集中在 enemyDamageMul（与空间斩击共用）
          // mainPierce 穿透弱化：无衰减率弹（副武器·极夜流光激光）穿透后伤害减半（b.weakened 标记）
          // 混乱将至主炮（mainShot，2026-10-02 用户定稿：取消穿透改小怪特化）：对非 BOSS / 非 4S（四精英）敌人伤害 +80%（2026-11-13 用户定稿恢复 2026-10-10 下调前口径）
          // 奖励道具·哦哦！抽卡！：演出期间我方输出 -60%（主武器/僚机/副武器共用乘区）
          // 奖励道具·不再陵落：所有来自该道具的飞剑（llSword 标记）对 BOSS 减伤 20%（2026-10-18 用户定稿——原低弧 lowArc 50% 规则随螺旋改版删除）
          let dmg = b.dmg * (b.weakened ? PIERCE_WEAKEN_MUL : 1) * enemyDamageMul(e, b.wing, b.capVuln)
            * (b.mainShot && e.type !== 'boss' && enemyGrade(e.type) !== '4S' ? CHAOS_SMALL_DMG_MUL : 1)
            * (b.princeStorm && isPoem() && e.type !== 'boss' ? PRINCE_STORM.poemNonBossMul : 1)   // 天秀风弹：诗篇对非 BOSS 敌人 ×3（2026-10-17 用户定稿；按实际命中目标判定，BOSS 不乘）
            * (b.mainGun ? affixMainGunDamageMul() : 1)   // 词条保底正面（2026-11-11 用户定稿）：仅战机本体主炮弹乘算，僚机/副武器/转化导弹不乘
            * rewardOutMul();
          if (b.llSword && e.type === 'boss') dmg *= 0.8;
          // 愧悔魂灵圣杯（2026-11-10 实装）：150px 淡金光环——范围内敌人受到的子弹伤害转移至圣杯本体
          //（不修正，mul 1；转移结算为独立支线：光环目标不受伤，屏障/夏勇盾/冰封计数/原粒子全部跳过，
          // 命中粒子改淡金色表现圣杯承接）。圣杯本体被子弹直击 ×1.25（「转移的伤害不算」——仅本体直击乘算）。
          // 穿透弹打转移目标不触发穿透、一律销毁（简化口径，与次数盾挡弹同待遇）——例外：天秀折线光束
          // 转移照常结算但继续贯穿（2026-11-17 用户定稿「激光全部无限穿透」）
          const gt = grailRedirect(e, 'bullet');
          if (gt) {
            gt.g.hp -= dmg * pxpfChargeHurtMul(gt.g) * constructAltHurtMul(gt.g);   // 易伤按承接方圣杯判定
            spawnParticles(b.x, b.y, '#ffe9b0', 4, 120);
            if (gt.g.hp <= 0) killEnemy(enemies.indexOf(gt.g));
            if (b.txcZig) {
              // 天秀折线光束（2026-11-17 用户定稿「激光全部无限穿透」）：转移照常结算但光束继续贯穿不销毁
              //（覆盖旧「穿透弹打转移目标一律销毁」口径——仅对折线光束豁免，彻月/长枪/时流天梭口径不动）
              if (!b.hits) b.hits = new Set();
              b.hits.add(e);
              continue;
            }
            pBullets.splice(i, 1);
            break;
          }
          if (e.type === 'guiltGrail') dmg *= GUILT_GRAIL.directBulletMul;   // 圣杯本体直击 ×1.25（2026-11-10 用户定稿）
          if (e.barrier > 0) {
            const abs = Math.min(e.barrier, dmg);
            e.barrier -= abs; dmg -= abs;   // 屏障优先吸收（dmg 需可变：吸收后余量继续扣血）
          }
          // 铜皮夏勇·屏障（技能3，2026-10-03 用户定稿）：常规直击伤害先被红色护盾吸收（秒杀类/爆弹等
          // 真实伤害不经此处；破盾检测在 06-enemy advanceEliteMinions）
          e.hp -= xiayongBarAbsorb(e, dmg * pxpfChargeHurtMul(e) * constructAltHurtMul(e));   // 朴学峰冲刺易伤 ×2（群星守愿对大型龙卷双判定已删除——2026-10-11 用户定稿）
          // 我方伤害账本（循环刷怪测试页 DPS 统计，2026-11-24）：主炮 mainGun/mainShot / 副武器 sub / 僚机 wing——
          // 仅统计三条主通道（斩击/激光结算/导弹等独立路径不挂账，测试页 DPS 为弹道通道口径）
          notePlayerDamage(dmg, b.mainGun || b.mainShot ? 'main' : b.sub ? 'sub' : b.wing ? 'wing' : null);
          affixFreezeNote(e, dmg);   // 词条（诗篇级 3:good:2）冰封：主武器/僚机/副武器弹命中与伤害计数
          // 词条（具象级 1:good:7）极夜流光：光束直接击坠敌人 → 额外一次无衰减穿透（mainPierce +1；
          // noWeaken 标记该次穿透伤害不减半——下方 mainPierce 分支消费后清除；须在穿透分支判定前加次数，
          // 使穿透次数恰用尽时击坠的弹体也能获得额外穿透而不被销毁）
          if (e.hp <= 0 && b.laserBolt && affixHas('1:good:7')) { b.mainPierce = (b.mainPierce || 0) + 1; b.noWeaken = true; }
          // 词条（具象级 1:good:9）无界飞剑：10% 概率造成 200% 伤害，对黑色敌人概率提高到 30%（黑标走 enemyColorTags——已迁 01-config-enemies）
          if (b.sword && b.sub && affixHas('1:good:9') && Math.random() < (enemyColorTags(e).includes('black') ? 0.30 : 0.10)) dmg *= 2;
          // 时流之雨：下一次攻击间隔 +0.3s（每轮射弹对同一敌人仅一次——e.rainVid 记录轮次 id 去重，
          // BOSS 同样生效走 skillCd；应用全攻击计时通道见 06-enemy applyRainAttackDelay）
          if (b.rain && e.rainVid !== b.volley) { e.rainVid = b.volley; applyRainAttackDelay(e); }
          spawnParticles(b.x, b.y, '#ffffff', 4, 120);
          // 群星守愿弹：卫护飞船（escort）无限穿透——不销毁、不消耗次数；其余 1类（side / prolifera）穿透一次（每发限一次）
          // mainPierce 结算（副武器激光弹 / 无界飞剑·暴走概率穿透 / 不再陵落螺旋飞剑）：对非 BOSS / 4类（主力舰・法术阵列）敌人穿透，
          // 不再陵落飞剑（mainPierce 2 + pierceStep 线性衰减）：每次穿透伤害 -20% 基准（100% → 80% → 60%，
          // 2026-10-12 用户定稿改线性——原乘法 0.8 连乘 64% 作废；衰减按 pierceBase 重算进 b.dmg，并记 lastHit 防同机重复结算）；
          // 无 pierceStep 的弹穿透后伤害减半（b.weakened）
          let pierce = false;
          // 天秀混沌王子·折线光束：对同一敌人仅判一次（hits Set 生成端预置）、穿透全场不销毁——
          // 用户定稿「每个折线光束只能对同一敌人造成一次伤害判定」（判一次后 2000 伤害已全额结算）
          if (b.txcZig) { if (!b.hits) b.hits = new Set(); b.hits.add(e); pierce = true; }
          // 极夜千星激光炮（僚机 beamBullet）：贯穿剩余伤害——每次命中按「敌人命中前血量」扣减
          //（用户口径：伤害100 打 hp10 敌人 → 穿透、剩 90；打 hp200 敌人 → 扣 min(100,200)=100 归零、无法穿透）；
          // 剩余 >0 穿透（hits Set 已在上游去重），归零不穿透 → 走下方 !pierce 统一销毁（killEnemy 照常执行）
          if (b.beamBullet) {
            if (!b.hits) b.hits = new Set(); b.hits.add(e);
            b.beamRemain -= Math.min(b.beamRemain, Math.max(hpBefore, 0));
            if (b.beamRemain > 0) pierce = true;
          }
          // 彻月贯穿弹（僚机）：无限穿透任意敌人、对每个敌人仅结算一次（hits Set 已去重）——
          // 不销毁、不消耗次数
          else if (b.pierceAll) { if (!b.hits) b.hits = new Set(); b.hits.add(e); pierce = true; }
          else if (b.pierce != null && e.type === 'escort') { pierce = true; b.lastHit = e; }   // 无限穿透不耗次数，但仍记 lastHit 防重叠帧对同一机体重复结算（2026-10-12 bug 修复）
          else if (b.pierce > 0 && (e.type === 'side' || e.type === 'prolifera')) { pierce = true; b.pierce--; }
          else if (b.mainPierce > 0 && e.type !== 'boss' && e.type !== 'capital' && e.type !== 'fashiArray') {
            pierce = true; b.mainPierce--;
            if (b.pierceStep != null) { b.pierceHitN = (b.pierceHitN || 0) + 1; b.dmg = Math.max(0, b.pierceBase * (1 - b.pierceStep * b.pierceHitN)); b.lastHit = e; }   // Math.max(0,…) 下限：未来 mainPierce 调大到 ≥5 时防负伤害（负数即给敌人回血）
            else if (b.noWeaken) b.noWeaken = false;   // 词条（1:good:7）极夜流光：击坠触发的额外穿透——这一次不衰减（一次性消费）
            else b.weakened = true;
          }
          if (!pierce) pBullets.splice(i, 1);
          if (e.hp <= 0) {
            if (b.princeStorm) princeStormKillGain(e);   // 天秀：风暴风弹击杀 → 量表立刻充能
            killEnemy(j);
          }
          break;
        }
      }
    }

    for (let i = eBullets.length - 1; i >= 0; i--) {
      const b = eBullets[i];
      // 战机陨落定格（2026-10-02 用户报 bug）：失败结算（mode='gameover'）后残留敌方弹幕整体冻结——
      // 位置 / 巨大蛋挞自旋 / 弧线 / 寿命全部停止推进，战场画面定格。根因：14-main idle/gameover 分支的
      // updateBullets 演示弹道共用路径会把场上残留敌弹（蛋挞）继续推下屏
      if (state.mode === 'gameover') break;
      b.age = (b.age || 0) + dt;   // 存在时长（弧线弹出生色漂移 / 蛇行相位共用；weave 分支不再单独推进）
      // 雷霆之怒雷电光环 · 敌弹过境加成（4C，2026-11-16 用户定稿）：敌方射弹&光束首次进入光环（半径
      // THUNDER.auraR 125，逐帧判定直至命中——任一帧进入即触发，一次性）→ 弹速 +20%（沿当前方向加速，
      // 位移连续无瞬跳）、伤害 +2（诗篇 4）、附蓝色电光特效（b.thundered 渲染标记，见 10-draw-world）；
      // 光束（laser）无弹速概念——改生长速率 ×1.2；命中我方时麻痹 0.5s（下方 hitPlayer 块）。
      // 友好体（大蛋挞 affixTart）与支援弹绿环（support，伤害 0）不参与
      if (!b.thundered && !b.affixTart && !b.support && thunderWraths.length) {
        for (const tw of thunderWraths) {
          if (Math.hypot(b.x - tw.x, b.y - tw.y) <= THUNDER.auraR) {
            b.thundered = true;
            if (!b.laser) {
              const sp = Math.hypot(b.vx, b.vy) || 1;
              const ns = sp * THUNDER.bulletSpdMul;
              b.vx *= ns / sp; b.vy *= ns / sp;   // 方向不变、模长 ×1.2（逐帧连续，无方向/位置突变）
            } else {
              b.growRate = (b.growRate || 130) * THUNDER.bulletSpdMul;   // 光束：生长速率 +20%（等效「弹速」加快）
            }
            b.dmg += isPoem() ? THUNDER.bulletDmgAddPoem : THUNDER.bulletDmgAdd;
            break;
          }
        }
      }
      // 蛋挞消散管线（b.tart && tartHitT != null，2026-10-04 镰刀斩中引入；2026-10-12 起护盾碰触 /
      // 护盾扩散波消散共用）：颤动 hitShudderT → 碎裂（迸散粒子一次）→ 渐隐 hitFadeT → 移除；
      // 全程冻结移动 / 自旋 / 碰撞（continue 跳过本帧全部推进；颤动抖动与渐隐 alpha 由渲染端按 tartHitT 取值）
      if (b.tart && b.tartHitT != null) {
        b.tartHitT += dt;
        if (b.tartHitT < DARKHAND.s3.hitShudderT) continue;   // 颤动期：位置冻结
        if (!b.tartShattered) {   // 碎裂瞬间：迸散蛋挞碎屑（皮 + 芯双色）
          b.tartShattered = true;
          spawnParticles(b.x, b.y, '#c9a15a', 10, 200);
          spawnParticles(b.x, b.y, '#5a2d3a', 8, 240);
        }
        if (b.tartHitT < DARKHAND.s3.hitShudderT + DARKHAND.s3.hitFadeT) continue;   // 渐隐期
        eBullets.splice(i, 1);
        continue;
      }
      if (b.ax) b.vx += b.ax * dt;   // 弧线弹（1/4 双曲线弹道）
      if (b.tartSpin != null) {
        b.tartSpin += (b.tartSpinSpd || 0) * dt;   // 巨大蛋挞（黑暗之手技能3）：持续自旋相位（渲染用，见 10-draw-world）
        // 出生生长（2026-10-03 用户定稿）：从很小（tartFrom 缩放）easeOutCubic 平滑放大到全尺寸，
        // 判定半径同步缩放（b.r = tartR0 × 缩放——出生瞬间几乎无威胁、碰撞公平）；渲染黑紫剪影见 10-draw-world
        if (b.tartGrowDur) {
          b.tartGrow = Math.min(b.tartGrow + dt, b.tartGrowDur);
          const gp = b.tartGrow / b.tartGrowDur, eo = 1 - Math.pow(1 - gp, 3);
          b.r = b.tartR0 * (b.tartFrom + (1 - b.tartFrom) * eo);
        }
      }
      if (b.fadeIn > 0) b.fadeIn -= dt;   // 渐显剩余（技能5 暗影导弹雨：出现完全透明快速渐显，渲染端按 fadeIn0 比例取 alpha）
      // 黑暗之手技能5 抛物导弹（真我/诗篇，2026-10-03 用户定稿）：速度剖面每帧由解析式重算（不累加、无漂移）——
      // 垂直 = 向上初速 vy0 + 恒定向下重力 ay（先上升再下坠）；水平 = S 剖面 vx = A·t·(1-t/T)（线性变化的水平
      // 加速度 ax = A(1-2t/T)，速度先增后减、抵达 50% 屏高时刻 T 精确归 0 并保持；T/A 由 05-boss 发射时解出）
      if (b.dhMissile) {
        const m = b.dhMissile;
        m.t += dt;
        const tt = Math.min(m.t, m.T);
        b.vx = m.A * tt * (1 - tt / m.T);
        b.vy = m.vy0 + m.ay * m.t;
      }
      // 黑暗之手技能2 涟漪环减速（2026-10-03 用户定稿）：每秒线性减速 decay（该环初速的 0~30%，环级随机、
      // 同环所有弹一致），方向不变、衰减到 spdFloor 停（见 01-config DARKHAND.s2）
      if (b.decay) {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const ns = Math.max(DARKHAND.s2.spdFloor, sp - b.decay * dt);
        b.vx *= ns / sp; b.vy *= ns / sp;
      }
      // 旋转弹（真我·旧日之歌技能1 旋转弧线流）：速度方向按角速度逐帧旋转——
      // 当前指向水平以上（屏幕坐标 vy<0）时角速度大幅增加、水平以下较为减小（倍率由弹体自带，缺省见下）
      if (b.angVel) {
        const w = b.angVel * (b.vy < 0 ? (b.spinUp || 2.8) : (b.spinDown || 0.55));
        const rc = Math.cos(w * dt), rs = Math.sin(w * dt);
        const nvx = b.vx * rc - b.vy * rs, nvy = b.vx * rs + b.vy * rc;
        b.vx = nvx; b.vy = nvy;
      }
      // 寿命上限（旋转弧线弹可能长期滞留场上）：到期进入消散期——快速减速 + 渐隐，
      // 消散开始瞬间迸出一次同色粒子；自然出界的子弹不经过此流程（无消失动画）
      if (b.life != null) {
        if (b.fadeT == null) {
          b.life -= dt;
          if (b.life <= 0) {
            b.fadeT = b.lifeFade != null ? b.lifeFade : 0.28;
            b.life = 0;
            spawnParticles(b.x, b.y, b.color || '#a5ffd6', 8, 130);
          }
        } else {
          b.fadeT -= dt;
          const decay = Math.exp(-8 * dt);
          b.vx *= decay; b.vy *= decay;
          if (b.fadeT <= 0) { eBullets.splice(i, 1); continue; }
        }
      }
      // 沿飞行方向加速：初速低、快速增长至上限（4类红技能3 的 '/||\' 弹幕）
      if (b.accel) {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const nx = b.vx / sp, ny = b.vy / sp;
        let ns = sp + b.accel * dt;
        if (b.maxSpeed && ns > b.maxSpeed) ns = b.maxSpeed;
        b.vx = nx * ns; b.vy = ny * ns;
      }
      // 风条生长：刚射出时很短，沿飞行方向随时间迅速长到全长
      // 激光（b.laser）：无上限持续生长，直到尾端出界才消失（尾端锢定于 b.x/b.y）
      if (b.laser) {
        b.len += (b.growRate || 130) * dt;
      } else if (b.lenTarget && b.len < b.lenTarget) {
        b.len = Math.min(b.lenTarget, b.len + (b.growRate || 130) * dt);
      }
      // 弹径生长（同玩家弹侧：浮海飘航者出膛整体 20%，长宽同步长满）
      if (b.rTarget && b.r < b.rTarget) b.r = Math.min(b.rTarget, b.r + (b.rGrowRate || 20) * dt);
      // 分裂弹：飞行一段距离→短时间内减速（可选 frac：剩余速度比例 ≤ frac 即提前分裂，"快没速度就炸"不必减为 0）→分裂成 N 个小子弹（互相等角）
      if (b.split) {
        const s = b.split;
        if (!s.triggered) {
          b.traveled += Math.hypot(b.vx, b.vy) * dt;
          if (b.traveled >= s.dist) {
            s.triggered = true;
            s.baseSpeed = Math.hypot(b.vx, b.vy);   // 记录触发时速度，用于平滑减速
            s.decay = s.decayDur || 0.3;            // 减速时长（默认 0.3s；橙焰巨型弹 0.7s"减速一段时间后才分裂"）
            s.stopT = s.decay;
          }
        } else {
          s.stopT -= dt;
          const f = Math.max(0, s.stopT / s.decay);   // 1→0 线性衰减
          const sp = Math.hypot(b.vx, b.vy);
          if (sp > 0.001) { const ns = s.baseSpeed * f; b.vx = b.vx / sp * ns; b.vy = b.vy / sp * ns; }
          if (s.stopT <= s.decay * (1 - (s.frac || 0))) {
            const base = Math.random() * Math.PI * 2;   // 随机基准方向，各子弹间隔 360/N
            const bs = affixHas('sp1') ? 0.5 : 1;   // 词条（特殊对 sp1）弹速迟缓：分裂子弹弹速 ×0.5（同 pushEBullet/pushBossBullet 口径）
            for (let k = 0; k < s.count; k++) {
              const ang = base + k * (Math.PI * 2 / s.count);
              eBullets.push({
                x: b.x, y: b.y,
                vx: Math.cos(ang) * s.speed * bs, vy: Math.sin(ang) * s.speed * bs,
                ax: 0, accel: 0, maxSpeed: 0,
                r: s.r, len: s.len || 0, dmg: b.dmg, color: s.color, split: null, traveled: 0,
                grad: !!s.grad,   // 径向渐变圆弹（白核→主色→暗橙红边，见 10-draw-world）
              });
            }
            spawnParticles(b.x, b.y, s.color, 12, 180);
            eBullets.splice(i, 1); continue;
          }
        }
      }
      // 蛇行弹（紫晶 DNA 双螺旋）：朝向绕出射基准角正弦摆动、恒速前进——左右两束相位相反，全程持续交绕
      if (b.weave) {
        const wA = b.baseAng + b.weave.amp * Math.sin(b.weave.om * b.age + b.weave.ph);
        const wS = Math.hypot(b.vx, b.vy) || 1;
        b.vx = Math.cos(wA) * wS; b.vy = Math.sin(wA) * wS;
      }
      // 橙旋侧翼艇环绕弹：锚定宿主敌机公转（位置每帧由宿主实时推导，不自行位移）；
      // 宿主被击坠 / 离场（已不在 enemies 数组）→ 环绕弹立刻消失
      if (b.orbit) {
        const ow = b.orbit.owner;
        if (!ow || enemies.indexOf(ow) < 0) { eBullets.splice(i, 1); continue; }
        b.orbit.ang += b.orbit.om * dt;
        b.x = ow.x + Math.cos(b.orbit.ang) * b.orbit.dist;
        b.y = ow.y + Math.sin(b.orbit.ang) * b.orbit.dist;
      }
      // 风暴编织者雷环子弹：停留期原地不动（BOSS 移走也不跟随），到时向对应方向爆开（高初速 → 减速至巡航）
      else if (b.holdT != null && b.holdT > 0) {
        b.holdT -= dt;
        if (b.holdT <= 0) { b.vx = Math.cos(b.burstAng) * b.v0; b.vy = Math.sin(b.burstAng) * b.v0; }
      } else if (!b.shieldBlocked) {
        // 静滞区域（静滞虚幻，对敌生效的）：敌方子弹中心过境 → 永久标记（一次性）：弹速 ×0.6（-40%）、
        // 伤害 ×0.75（-25%，直接乘 b.dmg——命中结算点无需另乘），此后不再恢复（用户定稿「双方子弹」同款）；
        // 区域内的临时减速照常叠加（下方 fmZone，同寒冷区域先例）
        if (!b.stasisHit) {
          for (const z of frostZones) {
            if (z.stasis && z.affectsEnemies && Math.hypot(b.x - z.x, b.y - z.y) <= z.r) {
              b.stasisHit = true;
              b.vx *= STASIS_UNREAL.bulletSpeedMul; b.vy *= STASIS_UNREAL.bulletSpeedMul;
              b.dmg *= STASIS_UNREAL.bulletDmgMul;
              break;
            }
          }
        }
        // 奖励道具·寒霜发生器：弹道位于我方力场（160px）内时位移流速 ×0.7（弹速 -30%，2026-10-10 用户定稿由 -60% 下调；
        // 力场内敌机射速/移速仍维持 -60%，见 02-core enemyFieldFireMul / 04-spawn enemyFrostZoneMoveMul 同口径分支）
        const ffd = state.frostField;
        const fmField = (ffd && Math.hypot(b.x - ffd.x, b.y - ffd.y) <= ffd.r) ? 0.7 : 1;
        // 虚幻殉爆区域（frostZones，affectsEnemies = 殉爆 death 区 + 诗篇投弹双效区）：弹体【位于区域内】时位移流速 ×0.65
        //（弹速 -35%，2026-10-14 用户定稿：对区域内敌方子弹减速——与寒霜侧翼 -35% 同档；多重叠取最强，同值不叠加）
        let fmZone = 1;
        for (const z of frostZones) {
          if (z.affectsEnemies && Math.hypot(b.x - z.x, b.y - z.y) <= z.r) { fmZone = 0.65; break; }
        }
        const fm = fmField * fmZone;
        b.x += b.vx * fm * dt; b.y += b.vy * fm * dt;
      }
      // 反弹光束（技能3）/ 技能6 暗黑子弹：触左右边界反弹，实际弹道呈"<"形折线；
      // bounceMax > 0 时限制反弹次数（暗黑子弹每颗最多 3 次），达到上限后不再反弹、直飞出屏移除
      if (b.bounceX && ((b.x < b.r && b.vx < 0) || (b.x > CANVAS_W - b.r && b.vx > 0))) {
        b.vx *= -1;
        b.x = clamp(b.x, b.r, CANVAS_W - b.r);
        if (b.bounceMax && ++b.bounceN >= b.bounceMax) b.bounceX = false;
      }
      // 折线光束（技能3）：记录头部轨迹，光束沿轨迹从 0 增长至全长（b.len）；
      // 转折处轨迹自然弯折——头部转向后旧段仍沿原方向保留，随尾部裁剪逐段消失
      if (b.beamTrail) {
        if (!b.path) { b.path = [{ x: b.x, y: b.y }]; b.pathLen = 0; }
        const last = b.path[b.path.length - 1];
        const dseg = Math.hypot(b.x - last.x, b.y - last.y);
        if (dseg > 1) { b.path.push({ x: b.x, y: b.y }); b.pathLen += dseg; }
        while (b.path.length > 2 && b.pathLen > b.len) {
          const segLen = Math.hypot(b.path[1].x - b.path[0].x, b.path[1].y - b.path[0].y) || 1;
          if (b.pathLen - segLen <= 0) break;
          b.pathLen -= segLen;
          b.path.shift();
        }
      }
      // 减速子弹（雷环爆开）：初速较高，线性减速至巡航速度（不低于巡航）
      if (b.decelTo != null) {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        if (sp > b.decelTo) {
          const ns = Math.max(b.decelTo, sp - (b.decelRate || 300) * dt);
          b.vx *= ns / sp; b.vy *= ns / sp;
        }
      }
      // 织夜快速长条弹（超越艇，2026-11-13）：每 1s 弹速 ×timeGrow（指数加速 ×1.2/s，无上限——飞行窗口短增幅温和）
      if (b.timeGrow) {
        const g = Math.pow(b.timeGrow, dt);
        b.vx *= g; b.vy *= g;
      }
      // 浮梦弧线弹（超越艇，2026-11-13）：恒速圆弧段——逐帧按 om 旋转速度向量（模长不变，位置积分自然连续），
      // remain 用尽即过必经点 → 转直线飞出（残余角差 ≤ om·dt ≈0.3° 可忽略；「出界时除外」由出界移除兜底）
      if (b.arcTurn) {
        const dAng = b.arcTurn.om * dt;
        const cs = Math.cos(dAng), sn = Math.sin(dAng);
        const nvx = b.vx * cs - b.vy * sn, nvy = b.vx * sn + b.vy * cs;
        b.vx = nvx; b.vy = nvy;
        b.arcTurn.remain -= Math.abs(dAng);
        if (b.arcTurn.remain <= 0) b.arcTurn = null;
      }
      if (b.trail) {
        // 轨迹残影：记录帧间线段（缺省暗紫；b.trailCol 自定义色 + b.trailLife 短拖尾；
        // b.trailR 拖尾显示半径——大子弹等大弹径弹用较小半径绘制更纤细的锥形尾，缺省同弹体半径）。
        // 性能（2026-10-12 用户定稿方案C）：①采样降频——按时间每 1/30s 压 1 条（段长自动 ×2、视觉几乎不变，
        // 风暴编织者技能4 诗篇 9 圈雷环同屏百余枚时残影量减半）；②去零长——位移 <0.5px 不压
        //（雷环停留期静止弹不再产生零长残影白白 stroke；px/py 照常更新不积累）
        b.trailCd = (b.trailCd || 0) + dt;
        if (b.trailCd >= 1 / 30) {
          b.trailCd = 0;
          const gd = b.px != null ? Math.hypot(b.x - b.px, b.y - b.py) : 0;
          if (b.px != null && gd >= 0.5) {
            trailGhosts.push({
              x1: b.px, y1: b.py, x2: b.x, y2: b.y,
              life: b.trailLife || 1.0, max: b.trailLife || 1.0,
              r: b.trailR || b.r,
              seed: Math.random() * 10, spark: Math.random() < 0.2,
              col: b.trailCol || null,
            });
          }
          b.px = b.x; b.py = b.y;
        }
      }
      // 出界移除：折线光束（beamTrail，技能3 "<"弹）的可见轨迹自头部向后延伸 b.len——
      // 头部出界后整条"<"轨迹继续滑出屏幕，直至尾端也越过边界才消失（不再头部一出界就整条闪没）
      const trailPad = b.beamTrail ? (b.len || 0) : 0;
      // 蛋挞弹弹体完全出界才移除（默认 pad 会在弹体半截时消失）：巨大蛋挞按判定半径、登场长条蛋挞按半长+半径
      const bigPad = b.tart ? (b.len ? b.len / 2 + b.r : b.r) : 0;
      if (b.y > CANVAS_H + 20 + trailPad + bigPad || b.y < -40 - trailPad - bigPad || b.x < -20 - bigPad || b.x > CANVAS_W + 20 + bigPad) {
        eBullets.splice(i, 1); continue;
      }
      // 青时战舰支援弹：命中敌机 → 施加 200 屏障；命中玩家机身（全机身盒判定、无需核心）→ 加屏障 24（诗篇 28）
      // 持续 10s（2026-10-12 用户定稿：重复命中叠加——barrier/barrierMax 同步增长，被伤害消耗过的量不回填，并刷新持续时间）；对双方均无伤害
      // 时流绿环（超越艇·时流，2026-11-13，supportKind 'timeflow'）：命中我方机身（全机身判定、无需核心）→
      // 不受伤 +2s 时流状态（射速/弹速 +50%，右下角读条，重复命中刷新至 2s）；命中敌机 → 其下 n 次攻击间隔
      // 各 -0.3s（bwGapStacks 叠加、06-enemy resetEnemyFireTimer 逐次消费——不重复减免）
      if (b.support && b.supportKind === 'timeflow') {
        let hit = false;
        if (player.alive && Math.abs(b.x - player.x) < player.w / 2 + b.r && Math.abs(b.y - player.y) < player.h / 2 + b.r) {
          state.timeflowT = BEYOND_WING.cyan.buffDur;   // 刷新至 2s
          spawnParticles(b.x, b.y, '#7fffd4', 12, 180);
          hit = true;
        }
        if (!hit) for (const en of enemies) {
          if (en === b.owner || !enemyOnScreen(en) || en.dying) continue;
          if (Math.abs(b.x - en.x) < en.w / 2 + b.r && Math.abs(b.y - en.y) < en.h / 2 + b.r) {
            en.bwGapStacks = (en.bwGapStacks || 0) + 1;
            spawnParticles(b.x, b.y, '#7fffd4', 8, 140);
            hit = true; break;
          }
        }
        if (hit) eBullets.splice(i, 1);
        continue;
      }
      if (b.support) {
        let hit = false;
        if (player.alive && Math.abs(b.x - player.x) < player.w / 2 + b.r && Math.abs(b.y - player.y) < player.h / 2 + b.r) {
          const barrierAdd = isPoem() ? 28 : 24;   // 单枚支援弹屏障量（诗篇 28，《诗篇难度修正.md》#21）
          player.barrierMax += barrierAdd;         // 叠加：总量增长（原为固定覆写 24/28）
          player.barrier = Math.min(player.barrier + barrierAdd, player.barrierMax);
          player.barrierT = 10;                    // 每次命中刷新持续时间
          spawnParticles(b.x, b.y, '#9ff0e0', 10, 160);
          hit = true;
        }
        if (!hit) for (let j = enemies.length - 1; j >= 0; j--) {
          const en = enemies[j];
          if (en === b.owner || !enemyOnScreen(en) || en.dying) continue;
          if (Math.abs(b.x - en.x) < en.w / 2 + b.r && Math.abs(b.y - en.y) < en.h / 2 + b.r) {
            en.barrierMax = 200; en.barrier = 200;
            spawnParticles(b.x, b.y, '#9ff0e0', 10, 160);
            hit = true; break;
          }
        }
        if (hit) eBullets.splice(i, 1);
        continue;
      }
      // 群星守愿白盾拦截（位于玩家量子护盾之前：盾在主机前侧，直射弹先碰白盾）；仅非导弹直射弹生效；
      // 蛋挞弹（b.tart：巨大蛋挞 tartSpin）豁免——白盾对其无任何影响（不截断不吸收，2026-10-04 二次定稿恢复原设定）
      if (bulwarkActive() && !b.tart) {
        if (b.laser) {
          // 激光：截断裁切——不 splice，继续按原逻辑生长/推进；本帧计算 clipLen（无相交置 null），渲染与命中判定按此截断
          //   pad 含弹体半径 + 盾厚一半（零厚度轴线会让擦盾弧端点的激光漏过）；
          //   粘滞阻挡：一旦被盾咬住（shieldHold 记录僚机与接触点本地偏移），即使追踪旋转 / 僚机随玩家闪避
          //   导致某帧轴线与盾折线失去交点，也按“锚定在僚机上的接触点”继续截断——被挡住的激光不会中途漏出盾外
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const ux = b.vx / sp, uy = b.vy / sp;
          const clip = clipAgainstShield(b.x, b.y, ux, uy, b.len, b.r + BULWARK.thickness / 2 * BULWARK.scale);
          if (clip) {
            if (!b.shieldHold) affixBulwarkAbsorbDmg(b.dmg);   // 词条（2:good:6）群星守愿吸伤：激光首次被盾咬住按弹体伤害值记一次吸收（持续截断不重复计）
            b.clipLen = clip.d;
            b.shieldHold = true; b.shieldW = clip.w;
            b.shieldLX = clip.x - clip.w.x; b.shieldLY = clip.y - clip.w.y;
            if (Math.random() < 0.6) spawnParticles(clip.x, clip.y, '#eaf6ff', 2, 90);   // 交点节流迸火花
          } else if (b.shieldHold && b.shieldW && b.shieldW.shieldSegs && b.shieldW.shieldSegs.length) {
            const ax = b.shieldW.x + b.shieldLX, ay = b.shieldW.y + b.shieldLY;
            b.clipLen = clamp((ax - b.x) * ux + (ay - b.y) * uy, 0, b.len);
            if (Math.random() < 0.6) spawnParticles(ax, ay, '#eaf6ff', 2, 90);
          } else {
            b.clipLen = null;
          }
        } else if (b.beamTrail) {
          // 折线光束（技能3"<"弹）撞盾：头部钉在盾面被截断，尾端继续按原速前进逐帧"磨短"——
          //   光束整体缩向盾面后消散（修复：此前走普通弹吸收分支，整条"<"光束瞬间消失）；
          //   盾判定按弹体半径（b.r）：与其他射弹同一套白盾几何，无额外收窄
          if (!b.shieldBlocked) {
            const hit = shieldSweepHit(b.x - b.vx * dt, b.y - b.vy * dt, b.x, b.y, b.r);
            if (hit) {
              b.shieldBlocked = true; b.sbX = hit.x; b.sbY = hit.y;
              const over = Math.hypot(b.x - hit.x, b.y - hit.y);   // 本帧越过盾面的距离：从轨迹末端回退
              if (b.path && b.path.length > 1 && b.pathLen > over) b.pathLen -= over;
              b.x = hit.x; b.y = hit.y;
              if (b.path && b.path.length) b.path[b.path.length - 1] = { x: hit.x, y: hit.y };
            }
          }
          if (b.shieldBlocked) {
            const step = Math.hypot(b.vx, b.vy) * dt;
            const target = Math.max(0, b.pathLen - step);
            while (b.path.length > 1 && b.pathLen > target) {
              const segLen = Math.hypot(b.path[1].x - b.path[0].x, b.path[1].y - b.path[0].y) || 1;
              if (b.pathLen - segLen < target) break;
              b.pathLen -= segLen; b.path.shift();
            }
            if (b.path.length > 1 && b.pathLen > target) {
              const segLen = b.pathLen - target;   // 尾端点部分裁剪：精确磨到 target 长度
              const dx = b.path[1].x - b.path[0].x, dy = b.path[1].y - b.path[0].y;
              const L = Math.hypot(dx, dy) || 1;
              b.path[0] = { x: b.path[1].x - dx / L * segLen, y: b.path[1].y - dy / L * segLen };
              b.pathLen = target;
            }
            if (Math.random() < 0.5) spawnParticles(b.sbX, b.sbY, '#eaf6ff', 2, 90);   // 盾面节流迸火花
            if (b.pathLen <= 1 || b.path.length < 2) { affixBulwarkAbsorbDmg(b.dmg); eBullets.splice(i, 1); continue; }   // 被盾吃完（词条 2:good:6：吸收计伤）
          }
        } else if (b.len && b.oval) {
          // 椭圆风条：head 端先触盾，逐帧“磨短”（裁掉越盾部分、头端钉在盾面），尾端越盾（有效长度≤0）即消解
          //   pad 含弹体半径 + 盾厚一半（零厚度轴线会让擦盾弧端点的风条漏过）；
          //   粘滞阻挡：被盾咬住（shieldHold）的风条即使某帧轴线与盾折线失去交点（僚机随玩家闪避、
          //   尾端一帧跨过细折线、高速跳步），也按锚定接触点继续磨短——挡住一半的风条不会中途漏出盾面
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const ux = b.vx / sp, uy = b.vy / sp;
          const halfL = b.len / 2;
          const tx = b.x - ux * halfL, ty = b.y - uy * halfL;   // 尾端
          const clip = clipAgainstShield(tx, ty, ux, uy, b.len, b.r + BULWARK.thickness / 2 * BULWARK.scale);
          let d = clip ? clip.d : null, cx, cy;
          if (clip) {
            b.shieldHold = true; b.shieldW = clip.w;
            b.shieldLX = clip.x - clip.w.x; b.shieldLY = clip.y - clip.w.y;
            cx = clip.x; cy = clip.y;
          } else if (b.shieldHold && b.shieldW && b.shieldW.shieldSegs && b.shieldW.shieldSegs.length) {
            const ax = b.shieldW.x + b.shieldLX, ay = b.shieldW.y + b.shieldLY;
            d = clamp((ax - tx) * ux + (ay - ty) * uy, 0, b.len);
            cx = ax; cy = ay;
          }
          if (d != null) {
            spawnParticles(cx, cy, '#eaf6ff', 3, 110);
            if (d <= 0.5) { affixBulwarkAbsorbDmg(b.dmg); eBullets.splice(i, 1); continue; }   // 被吃完（词条 2:good:6：吸收计伤）
            b.len = d;                                   // 收缩到盾面
            b.x = tx + ux * d / 2; b.y = ty + uy * d / 2;   // 尾端不动、中心回移
          }
        } else if (b.swRef) {
          // 三类·特殊射弹（旧日之歌暗黑射弹，注册表见 01-config BULWARK 注释）：首次触盾按入射夹角镜像反弹
          //   （反射角=入射角，非原路弹回）；可墙壁反弹者（bounceX）反弹后失去该能力；
          //   同一射弹仅反弹一次，再次触盾白盾无任何效果（直接穿过、伤害不减）
          if (!b.swRefDone) {
            const pxp = b.x - b.vx * dt, pyp = b.y - b.vy * dt;
            const hit = shieldReflectHit(pxp, pyp, b.x, b.y, b.r);
            if (hit) {
              const vn = b.vx * hit.nx + b.vy * hit.ny;
              b.vx -= 2 * vn * hit.nx; b.vy -= 2 * vn * hit.ny;   // 关于盾面法线镜像反射
              b.swRefDone = true;
              b.bounceX = false;   // 反弹后失去墙壁反弹能力
              b.x = hit.x + b.vx * dt; b.y = hit.y + b.vy * dt;   // 置于盾面并沿反射方向推进，避免原地重复触盾
              spawnParticles(hit.x, hit.y, '#eaf6ff', 8, 170);
              spawnParticles(hit.x, hit.y, '#c8b0ff', 5, 130);
            }
          }
        } else {
          // 普通直射弹：扫掠(prev→cur)与盾相交则吸收；长条弹以弹头前缘扫掠（判定贴合视觉，不再沉入盾面后才消失）
          const pxp = b.x - b.vx * dt, pyp = b.y - b.vy * dt;
          let sx1 = pxp, sy1 = pyp, sx2 = b.x, sy2 = b.y;
          if (b.len) {
            const sp = Math.hypot(b.vx, b.vy) || 1, half = b.len / 2;
            const hx = b.vx / sp * half, hy = b.vy / sp * half;
            sx1 = pxp + hx; sy1 = pyp + hy; sx2 = b.x + hx; sy2 = b.y + hy;
          }
          const hit = shieldSweepHit(sx1, sy1, sx2, sy2, b.r);
          if (hit) {
            spawnParticles(hit.x, hit.y, '#eaf6ff', 6, 150);
            affixBulwarkAbsorbDmg(b.dmg);   // 词条（2:good:6）群星守愿吸伤：吸收的射弹伤害累计（下一轮 fan 发射加成）
            achvWingmanBlock();   // 成就：守愿加护——白盾挡弹计数
            eBullets.splice(i, 1); continue;
          }
        }
      }
      // 群星之扉黑洞吞噬（state.blackhole，中心持续跟随玩家；2026-11-11 用户定稿；清除等级 9 级——2026-11-24
      // 射弹清除等级体系）：圈内一切 eBullets 整颗吞——普通弹 / 长条弹 / 折线光束 / 巨大蛋挞（b.tart）；
      // 激光（b.laser）按覆盖段处理：「光束仅能吞噬覆盖的部分，其他部分还在」——尾段覆盖→尾端前移、
      // 头段覆盖→截短 len、中段覆盖→拆两段（本颗留靠尾段、克隆承接靠头段，倒序遍历下新弹下帧起参与）、
      // 整段覆盖→整颗吞。判定半径 rEff 与视觉同源（出现 0.15s 半径缓入）；不计数群星之歌清弹成就；
      // 友方词条蛋挞（b.affixTart）任何功能不可吞（2026-11-24）。非 eBullets 容器（敌方导弹/破片导弹/暴鸰炸弹/
      // 正方体/斩击流/回旋刃/长条蛋挞）的吞噬见本函数末尾黑洞跨容器扫掠块（等级均 ≤9）
      const bhSw = state.blackhole;
      if (bhSw && player.alive && !b.affixTart) {
        const rEff = bhSw.r * Math.min(1, bhSw.t / bhSw.growT);
        if (b.laser) {
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const ux = b.vx / sp, uy = b.vy / sp;
          const fx = b.x - player.x, fy = b.y - player.y;
          const A = fx * ux + fy * uy;                       // 线段参数化 |tail + t·u − C|² = rEff²：t² + 2At + B = 0
          const Bq = fx * fx + fy * fy - rEff * rEff;
          const D = A * A - Bq;
          if (D >= 0) {
            const sq = Math.sqrt(D);
            const t0 = -A - sq, t1 = -A + sq;                // 两交点参数（t0 ≤ t1）
            if (t1 >= 0 && t0 <= b.len) {
              if (t0 <= 0 && t1 >= b.len) {                  // 整段覆盖 → 整颗吞
                spawnParticles(b.x + ux * b.len * 0.5, b.y + uy * b.len * 0.5, '#8a97a8', 6, 150);
                eBullets.splice(i, 1); continue;
              } else if (t0 <= 0) {                          // 尾段覆盖 → 尾端前移到 t1（保留靠头段）
                spawnParticles(b.x + ux * t1 * 0.5, b.y + uy * t1 * 0.5, '#8a97a8', 4, 130);
                b.x += ux * t1; b.y += uy * t1; b.len -= t1;
              } else if (t1 >= b.len) {                      // 头段覆盖 → 截短到 t0（保留靠尾段）
                spawnParticles(b.x + ux * (t0 + b.len) * 0.5, b.y + uy * (t0 + b.len) * 0.5, '#8a97a8', 4, 130);
                b.len = t0;
              } else {                                       // 中段覆盖 → 拆两段：本颗保留靠尾段 [0,t0]，克隆承接靠头段 [t1,len]
                const seg = Object.assign({}, b, { x: b.x + ux * t1, y: b.y + uy * t1, len: b.len - t1 });
                spawnParticles(b.x + ux * t0, b.y + uy * t0, '#8a97a8', 3, 110);
                spawnParticles(b.x + ux * t1, b.y + uy * t1, '#8a97a8', 3, 110);
                b.len = t0;
                eBullets.push(seg);
              }
            }
          }
        } else if (Math.hypot(b.x - player.x, b.y - player.y) < rEff) {
          spawnParticles(b.x, b.y, '#8a97a8', 5, 130);
          eBullets.splice(i, 1); continue;
        }
      }
      // 护盾加持：碰到护盾气泡的敌弹直接消解（清除等级 3 级——2026-11-24 射弹清除等级体系：激光现可被气泡
      // 吸收整颗消解；巨大蛋挞（4级）不再被碰触消散——穿过气泡正常结算；友方蛋挞任何功能不清除）
      // 七日澜心水晶护盾：同样消解气泡内敌弹（粉色迸散）——成就「云心」按结晶护盾期间的消解数计数
      if (!b.affixTart && player.alive &&
          Math.hypot(b.x - player.x, b.y - player.y) < 36 + b.r &&
          (player.shield > 0 || player.crystalShield > 0)) {
        if (player.crystalShield > 0) achvNoteLanxinAbsorb();
        spawnParticles(b.x, b.y, player.crystalShield > 0 ? '#FFC0CB' : '#6fe3ff', 6, 140);
        eBullets.splice(i, 1);
        continue;
      }
      // 命中判定：长条弹按胶囊体（判定点到弹体线段的最近距离）计算，普通弹按圆计算
      // 词条（诗篇级 3:good:3）大蛋挞：友好体（affixTart）不与玩家判定（不伤不吃盾消解）
      let hitPlayer = false;
      if (player.alive && player.invuln <= 0 && !b.affixTart) {
        if (b.laser) {
          // 激光尾端锢定：胶囊体从 (b.x, b.y) 到 (b.x + ux*b.len, b.y + uy*b.len)
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const ux = b.vx / sp, uy = b.vy / sp;
          const py = player.y + PLAYER_CFG.hitOffsetY;
          // 群星守愿白盾截断：命中判定仅到 clipLen（盾前段），越盾部分不伤人
          const effLen = b.clipLen != null ? Math.min(b.len, b.clipLen) : b.len;
          const tproj = clamp((player.x - b.x) * ux + (py - b.y) * uy, 0, effLen);
          hitPlayer = Math.hypot(player.x - (b.x + ux * tproj), py - (b.y + uy * tproj)) < playerHitRadius() + b.r;
        } else if (b.path && b.path.length > 1) {
          // 折线光束（技能3）：判定点到头部轨迹折线段集的最近距离
          const py = player.y + PLAYER_CFG.hitOffsetY;
          let best = Infinity;
          for (let k = 0; k < b.path.length - 1; k++) {
            const ax = b.path[k].x, ay = b.path[k].y;
            const dx = b.path[k + 1].x - ax, dy = b.path[k + 1].y - ay;
            const L2 = dx * dx + dy * dy || 1;
            const tt = clamp(((player.x - ax) * dx + (py - ay) * dy) / L2, 0, 1);
            const dd = Math.hypot(player.x - (ax + dx * tt), py - (ay + dy * tt));
            if (dd < best) best = dd;
          }
          hitPlayer = best < playerHitRadius() + b.r;
        } else if (b.len) {
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const ux = b.vx / sp, uy = b.vy / sp;
          const py = player.y + PLAYER_CFG.hitOffsetY;
          const tproj = clamp((player.x - b.x) * ux + (py - b.y) * uy, -b.len / 2, b.len / 2);
          hitPlayer = Math.hypot(player.x - (b.x + ux * tproj), py - (b.y + uy * tproj)) < playerHitRadius() + b.r;
        } else {
          hitPlayer = Math.hypot(b.x - player.x, b.y - (player.y + PLAYER_CFG.hitOffsetY)) < playerHitRadius() + b.r;
        }
      }
      // 巨大蛋挞成型阶段免伤（全难度——2026-10-12 用户定稿，原仅虚象/具象——生成时打 tartGrowNoHit 标志）：
      // 生长未完成 → 命中无效（不伤害、不消失，弹继续前进成型后再正常判定）
      if (hitPlayer && b.tartGrowNoHit && b.tartGrow < b.tartGrowDur) hitPlayer = false;
      if (hitPlayer) {
        // 伤害来源标记（驾驶员效果挂点）：暴风之眼本体弹幕 / 其召唤的大型龙卷风弹 → src 'storm'
        const src = (b.owner && (b.owner.type === 'tornado' ||
                    (b.owner.type === 'boss' && b.owner.bossId === 'storm'))) ? 'storm' : null;
        // 成就死因：BOSS 弹幕按 owner 归属（往日梦魇——旧日之歌弹幕击杀）
        const achvCause = (b.owner && b.owner.type === 'boss') ? ('boss:' + b.owner.bossId) : null;
        // BOSS 及其召唤物（大型龙卷）伤害在发射时已乘 bossDmgMul，不吃非BOSS敌人增伤
        const bossOwned = b.owner && (b.owner.type === 'boss' || b.owner.type === 'tornado');
        const tookHit = damagePlayer(b.dmg * (bossOwned ? 1 : enemyDmgMul()), 1, false, false, src, achvCause);
        // 风暴编织者（2026-11-17 用户定稿）：其所有弹幕弹伤害附带麻痹——0.3s/真我 0.4s/诗篇 0.5s
        //（STORM2 三档，与 07-player damagePlayer cause 'storm2' 消费同口径；伤害结算成功才置位）
        if (tookHit && bossOwned && b.owner && b.owner.bossId === 'storm2') {
          state.paralyzeT = Math.max(state.paralyzeT || 0,
            isPoem() ? STORM2.paralyzePoem : isRealme() ? STORM2.paralyzeRealme : STORM2.paralyzeBase);
        }
        // 雷霆之怒雷电光环（4C，2026-11-16）：电光弹（过境加成弹）命中我方 → 麻痹 0.5s（伤害结算成功才麻痹——
        // 护盾/屏障吸收或无敌帧拦截不麻痹；不触发受击无敌帧由本次 damagePlayer 正常给帧，麻痹独立计时）
        if (tookHit && b.thundered) state.paralyzeT = Math.max(state.paralyzeT || 0, THUNDER.hitParalyze);
        // 成就：饿啊——被紫电侧翼艇亡语弹击中计数（仅实际造成伤害的命中）
        if (tookHit && b.owner && b.owner.deathShot) achvZidianHit();
        // 蛋挞弹（b.tart）穿透：击中我方战机不消失、继续前进（2026-10-04 用户定稿，与白盾豁免同口径）
        if (!b.laser && !b.tart) eBullets.splice(i, 1);   // 激光穿透：命中不消失，持续生长直到尾端出界
      }
    }

    // ---------- 非 eBullets 容器的射弹等级扫掠（2026-11-24 射弹清除等级体系，每帧一次） ----------
    // ① 群星之扉黑洞跨容器吞噬（9 级）：敌方导弹(4)/破片导弹(2)/暴鸰炸弹(2)/法术正方体(1)/战争幽灵斩击流(1)/
    //    夏勇回旋刃(2)/长条蛋挞(3)——进入 rEff 即吞（回旋刃置 done 由 06-enemy 收口；长条蛋挞任一节点入圈整条吞）
    // ② 量子/结晶护盾气泡碰触（3 级）：战争幽灵斩击流(1)/暴鸰炸弹(2)/夏勇回旋刃(2)/长条蛋挞(3)——碰触即消解；
    //    破片导弹/正方体的气泡碰触在 06-enemy 各自更新循环内（同 3 级口径）；敌方导弹 4 级 > 3 不再被气泡消解
    if (player.alive && (state.blackhole || player.shield > 0 || player.crystalShield > 0)) {
      const bh2 = state.blackhole;
      const bhR = bh2 ? bh2.r * Math.min(1, bh2.t / bh2.growT) : 0;
      const bubble = player.shield > 0 || player.crystalShield > 0;
      const absorbCol = () => (player.crystalShield > 0 ? '#FFC0CB' : '#6fe3ff');
      if (bh2) {   // 敌方导弹（4级）：仅黑洞吞噬
        for (let i = missiles.length - 1; i >= 0; i--) {
          const m = missiles[i];
          if (Math.hypot(m.x - player.x, m.y - player.y) < bhR) { spawnParticles(m.x, m.y, '#8a97a8', 5, 130); missiles.splice(i, 1); }
        }
        for (let i = popianMissiles.length - 1; i >= 0; i--) {   // 破片导弹（2级）：仅黑洞吞噬
          const m = popianMissiles[i];
          if (Math.hypot(m.x - player.x, m.y - player.y) < bhR) { spawnParticles(m.x, m.y, '#8a97a8', 5, 130); popianMissiles.splice(i, 1); }
        }
        for (let i = spellCubes.length - 1; i >= 0; i--) {   // 法术正方体（1级）：仅黑洞吞噬（白盾 swPen 穿透与气泡消解维持 06-enemy 既有口径）
          const c = spellCubes[i];
          if (Math.hypot(c.x - player.x, c.y - player.y) < bhR) { spawnParticles(c.x, c.y, '#8a97a8', 5, 130); spellCubes.splice(i, 1); }
        }
      }
      for (let i = wgSlashes.length - 1; i >= 0; i--) {   // 战争幽灵斩击流（1级）
        const s = wgSlashes[i];
        if (bh2 && Math.hypot(s.x - player.x, s.y - player.y) < bhR) { spawnParticles(s.x, s.y, '#8a97a8', 5, 130); wgSlashes.splice(i, 1); continue; }
        if (bubble && Math.hypot(s.x - player.x, s.y - player.y) < 36 + 16) {
          if (player.crystalShield > 0) achvNoteLanxinAbsorb();
          spawnParticles(s.x, s.y, absorbCol(), 6, 140); wgSlashes.splice(i, 1);
        }
      }
      for (let i = blBombs.length - 1; i >= 0; i--) {   // 暴鸰炸弹（2级）
        const b = blBombs[i];
        if (bh2 && Math.hypot(b.x - player.x, b.y - player.y) < bhR) { spawnParticles(b.x, b.y, '#8a97a8', 5, 130); blBombs.splice(i, 1); continue; }
        if (bubble && Math.hypot(b.x - player.x, b.y - player.y) < 36 + (b.r || 12)) {
          if (player.crystalShield > 0) achvNoteLanxinAbsorb();
          spawnParticles(b.x, b.y, absorbCol(), 6, 140); blBombs.splice(i, 1);
        }
      }
      for (const en of enemies) {
        if (!en) continue;
        if (en.xyBlades) {   // 夏勇回旋刃（2级）
          for (const bl of en.xyBlades) {
            if (bl.done) continue;
            if (bh2 && Math.hypot(bl.x - player.x, bl.y - player.y) < bhR) { spawnParticles(bl.x, bl.y, '#8a97a8', 5, 130); bl.done = true; continue; }
            if (bubble && Math.hypot(bl.x - player.x, bl.y - player.y) < 36 + 12) {
              if (player.crystalShield > 0) achvNoteLanxinAbsorb();
              spawnParticles(bl.x, bl.y, absorbCol(), 6, 140); bl.done = true;
            }
          }
        }
        if (bh2 && en.skill && en.skill.id === 3 && Array.isArray(en.skill.tarts)) {   // 长条蛋挞（3级）：黑洞吞
          for (let i = en.skill.tarts.length - 1; i >= 0; i--) {
            const tar = en.skill.tarts[i];
            let hit = false;
            for (const p of tar.pts) { if (Math.hypot(p.x - player.x, p.y - player.y) < bhR) { hit = true; break; } }
            if (!hit) continue;
            for (let k = 0; k < tar.pts.length; k += 2) spawnParticles(tar.pts[k].x, tar.pts[k].y, '#8a97a8', 3, 110);
            en.skill.tarts.splice(i, 1);
          }
        }
      }
    }
  }

  // ---------- 道具 ----------
  const POWERUP_MAGNET_RADIUS = 170;   // 道具磁吸半径（比水晶 150 更大，更易被吸引吃到）

  // 生成道具（非水晶类通用）：下落 + 随机左右漂移（碰边反弹）+ 易被磁吸
  function spawnPowerup(x, y, kind, r) {
    // 防御性守卫：非有限坐标的道具会在绘制端产生 NaN（真实画布静默不绘制 → 道具凭空消失），直接拒绝生成
    if (!Number.isFinite(x) || !Number.isFinite(y)) { console.error('spawnPowerup 拒绝非有限坐标：', kind, x, y); return; }
    // 词条（具象级 1:good:0）：量子护盾道具在生成层替换为回血道具（回复 25% 血量，不受掉落限制——
    // 生成层即替换，叠盾掉率惩罚自然失效；回复量在 applyPowerupPickup 'hp' 分支统一改 25%）。
    // 龚粥已删（2026-11-18 用户定稿）：护盾转回血效果由该词条承接
    let kind2 = kind, healPct;
    if (kind === 'shield' && affixHas('1:good:0')) {
      kind2 = 'hp';
      healPct = 0.25;
    }
    powerups.push({ x, y, kind: kind2, r, vy: rand(72, 99), vx: rand(-46, 46), healPct });   // 1.8x 原速(40~55)
  }

  // 道具拾取结算（本体碰撞与强制吸收近距离直吸共用）；
  // viaRain = 时流之雨射弹触碰吸收（08-entities rainAbsorbAround 调用）：升级 / 暴走 / 量子护盾 / 结晶护盾
  // 改「在剩余时长上直接增加」（突破常规重置式上限——2026-11-11 用户定稿）、回血超出上限部分转等额屏障；
  // 其余道具（磁力菇等即时生效类）走常规分支（加算/重置语义无差别），小艺拾取回血 / 「忘了」计数照常
  function applyPowerupPickup(p, viaRain) {
    achvNotePickup();   // 成就：UPUPUP——道具拾取计数（水晶不走本路径不计）
    // 小艺：拾取任意道具（水晶不走本路径）恢复生命——任意血量均回 5%，低于 40 改为 10%
    //（2026-10-12 用户定稿：取消原「血量低于 60 才回 5%、≥60 不回」门槛；阈值为血量点数、回复量按最大生命百分比）
    if (hasPilot('xiaoyi') && player.alive) {
      const maxHp = player.maxHp || PLAYER_CFG.maxHp;
      const heal = player.hp < PILOTS.xiaoyi.pickupHealHpGateLow ? maxHp * PILOTS.xiaoyi.pickupHealPctLow
        : maxHp * PILOTS.xiaoyi.pickupHealPct;
      if (heal > 0) {
        player.hp = Math.min(maxHp, player.hp + heal);
        spawnParticles(player.x, player.y - 12, '#8ce36b', 6, 120);
      }
    }
    // ── 天秀混沌王子（2026-11-17 用户定稿实装）：拾取特化分流（插在小艺回血之后、常规分支之前）──
    // 回血道具固定恢复 2000（非 40% 上限比例）；升级套件与任意护盾组件（量子护盾/结晶护盾）不获得
    // 任何效果 → 随机一个技能冷却归零；暴走组件不进入暴走 → 全部技能冷却归零；爆弹与其余道具
    // 走下方常规分支原样结算。归零仅覆盖四定时技能（state.txcSkillCd——折线光束 5s 准备周期
    // 不属冷却语义，不在池内）；随机归零实现 txcResetRandomSkill/txcResetAllSkills（本文件底部）
    if (txcActive() && p.kind !== 'bomb') {
      if (p.kind === 'hp') {
        player.hp = clamp(player.hp + TXC.hpHeal, 0, player.maxHp || TXC.maxHp);
        spawnParticles(p.x, p.y, '#66e39a', 12, 160);
      } else if (p.kind === 'shield' || p.kind === 'crystalShield') {
        txcResetRandomSkill();   // 护盾组件：无护盾效果 → 随机一个技能冷却归零
        spawnParticles(p.x, p.y, '#6fe3ff', 18, 200);
      } else if (p.kind === 'berserk') {
        txcResetAllSkills();   // 暴走组件：不进入暴走 → 全部技能冷却归零
        spawnParticles(p.x, p.y, '#ff5a1f', 18, 200);
      } else {
        txcResetRandomSkill();   // 升级套件：不受火力等级影响 → 随机一个技能冷却归零
        spawnParticles(p.x, p.y, '#7ce7ff', 12, 160);
      }
      if (affixHas('1:good:2') && Math.random() < 0.1) {
        spawnPowerup(rand(60, CANVAS_W - 60), 36, p.kind, 12);   // 词条（1:good:2）同类道具额外生成照常
      }
      return;
    }
    if (p.kind === 'hp') {
      // 全难度统一（2026-10-12 用户定稿）：回复量 = 当前血量上限 × 40%（四舍五入：迪奥 60→24 / 铜皮夏勇 140→56）——
      //   HP_KIT_HEAL_PCT（01-config-difficulty），取代原双轨「其他难度固定 +40 / 诗篇 ×35%」。
      //   小艺拾取回血（上方）为独立机制不受影响
      //   龚粥：量子护盾道具在生成层替换为回血道具（spawnPowerup），道具对象带 healPct 0.20（覆盖常规 40%）
      let healPct = p.healPct ?? (affixHas('1:good:0') ? 0.25 : HP_KIT_HEAL_PCT);   // 词条（具象级 1:good:0）：血量道具回复量改 25%
      const heal = Math.round((player.maxHp || PLAYER_CFG.maxHp) * healPct);
      if (viaRain) {
        // 时流之雨射弹吸收回血道具：回复照常，超出生命上限的部分转为等额屏障
        // （非永久——青时战舰支援弹同款临时屏障通道：barrier/barrierMax 同步增长、持续 10s，随伤害
        // 消耗 / 末 1s 衰减 / 到期消散；用户 2026-11-11 定稿）
        const maxHp = player.maxHp || PLAYER_CFG.maxHp;
        const healed = Math.min(heal, Math.max(0, maxHp - player.hp));
        player.hp += healed;
        const overflow = heal - healed;
        if (overflow > 0) {
          player.barrier += overflow;
          player.barrierMax += overflow;
          player.barrierT = 10;
        }
        spawnParticles(p.x, p.y, overflow > 0 ? '#cfe8ff' : '#66e39a', 12, 160);
      } else {
        player.hp = clamp(player.hp + heal, 0, player.maxHp || PLAYER_CFG.maxHp);   // 上限 = 当前装甲最大 HP
        spawnParticles(p.x, p.y, '#66e39a', 12, 160);
      }
    } else if (p.kind === 'bomb') {
      state.bombs = Math.min(state.bombs + 1, currentBombCap());   // 真我上限 2（mods.bombCap）+ 绷绷背包 +1（bombCapAdd）
      spawnParticles(p.x, p.y, '#ffb545', 12, 160);
    } else if (p.kind === 'shield') {
      // 量子护盾：6 秒无敌，敌弹碰盾即消解，解除时清屏
      // 许凯狗冲刺期间不读条：仅吸收（无得分），护盾效果跳过
      if (state.pilotDashT <= 0) {
        if (viaRain) {
          // 时流之雨射弹吸收量子护盾：在剩余时长上直接增加（突破 6s 重置式上限——2026-11-11 用户定稿）；
          // 读条分母同步抬升（12-ui 读条 = shield/shieldMax，超出部分仍满格显示）
          player.shield += SHIELD_DURATION;
          player.shieldMax = Math.max(player.shieldMax || 0, player.shield);
        } else {
          player.shield = SHIELD_DURATION;
          player.shieldMax = SHIELD_DURATION;   // 读条分母同步
        }
        spawnParticles(p.x, p.y, '#6fe3ff', 18, 200);
      }
    } else if (p.kind === 'crystalShield') {
      // 结晶护盾（炼金璃：BOSS 血量 70% 掉落，见 05-boss updateLovelyShieldMark）：
      // 七日澜心结晶护盾同款——环绕 6s（ARMOR_SKILLS.lanxin.dur，与量子护盾同时长），消失时清弹
      // 许凯狗冲刺期间不读条：仅吸收，护盾效果跳过（与量子护盾同口径）
      if (state.pilotDashT <= 0) {
        const hadShield = (player.crystalShield || 0) > 0;
        if (viaRain) {
          player.crystalShield += affixCrystalShieldDur();   // 时流之雨：在剩余时长上直接增加（突破常规封顶——2026-11-11 用户定稿）
        } else {
          player.crystalShield = Math.max(player.crystalShield || 0, affixCrystalShieldDur());   // 结晶护盾时长（炼金璃 5.2s / 基准 4s；词条 1:good:3 -0.5s，03b-affix 统一入口）
        }
        affixResetShieldExt();   // 词条（1:good:6）：重获结晶护盾时清零「拾取水晶延长」累计
        if ((!viaRain || !hadShield) && currentArmor.id === 'lanxin') achvNoteLanxinShieldStart(bossFlow.stage === 'fight');   // 成就：云心——常规拾取照常登记（原口径）；viaRain 加算续时不重复登记、不重置消弹计数
        spawnParticles(p.x, p.y, '#FFC0CB', 18, 200);
      }
    } else if (p.kind === 'berserk') {
      // 许凯狗冲刺期间不读条：仅吸收得分（+100），不进入暴走
      if (state.pilotDashT > 0) state.score += Math.round(100 * diffMods().scoreMul);
      else if (viaRain) rainApplyBerserk();   // 时流之雨：等级升满 + 时长加算（突破重置式上限）
      else pickupBerserk();
    } else {
      if (viaRain) rainApplyKit();   // 时流之雨：升级套件加算变体（已暴走时在剩余时长上增加）
      else pickupKit();
    }
    // 词条（具象级 1:good:2）：拾取任意道具时 10% 概率在顶部生成一个同类道具（文案「额外生成的爆弹不受掉落限制」
    // 指生成无需消耗掉落概率——固定 10% 触发即满足；爆弹拾取侧 currentBombCap 自然封顶）
    if (affixHas('1:good:2') && Math.random() < 0.1) {
      spawnPowerup(rand(60, CANVAS_W - 60), 36, p.kind, 12);
    }
  }

  // ── 天秀混沌王子：拾取归零实现（跨域写 state.txcSkillCd——归域 02-core「玩家装备与驾驶员技能」，
  //    跨域读写已在《并行任务认领.md》声明；消费点 07-player updateTxcSkills 递减到 0 即触发释放）──
  // 随机归零：四定时技能（电弧激光/四臂激涌/雷霆打击/重现光束）等概率取一；折线光束 5s 准备周期
  // 不属冷却语义不在池内。全部归零：暴走组件专用（用户定稿：不进入暴走、四冷却同时清零）
  function txcResetRandomSkill() {
    const cd = state.txcSkillCd;
    if (!cd) return;
    const cdKeys = ['arc', 'arms', 'thunder', 'replay'];
    cd[cdKeys[(Math.random() * cdKeys.length) | 0]] = 0;
  }
  function txcResetAllSkills() {
    const cd = state.txcSkillCd;
    if (!cd) return;
    cd.arc = 0; cd.arms = 0; cd.thunder = 0; cd.replay = 0;
  }

  // 时流之雨触碰吸收（08-entities updateBullets rain 分支逐帧调用）：
  //   道具 = 弹体接触（dist < 弹判定半径 + 道具半径）——applyPowerupPickup(p, viaRain) 玩家直接结算；
  //   水晶 = 弹体周身 absorbR（40px）小范围吸收——等同玩家拾取结算（得分/量表/成就/词条与 updateCrystals
  //   直吸分支同款；受 0.1s 出生吸收延迟门控，absorbDelay 强制吸收通道不适用——射弹为空间接触判定）
  function rainAbsorbAround(b) {
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + p.r) {
        applyPowerupPickup(p, true);
        powerups.splice(i, 1);
      }
    }
    for (let i = crystals.length - 1; i >= 0; i--) {
      const c = crystals[i];
      if ((c.age || 0) < CRYSTAL_ABSORB_DELAY) continue;   // 水晶掉出 0.1s 后才能被吸收（全部吸收途径统一门控）
      if (Math.hypot(c.x - b.x, c.y - b.y) < b.absorbR) {
        state.score += Math.round(c.val * diffMods().scoreMul);
        state.princeCrystalGain += Math.round(c.val * diffMods().scoreMul);   // 天秀忧郁王子：水晶得分不计入白色量表
        armorSkillGain(c.val, c.firstBoss);   // 七日澜心：按水晶得分等比填充技能量表
        if (c.tier === 'giant') { achvNoteGiantCrystal(); noteGachaStone(); }   // 原石：成就计数 + 萧杨收集计数
        affixCrystalExtend();   // 词条（具象级 1:good:6）：拾取水晶延长结晶护盾
        spawnParticles(c.x, c.y, '#9be7ff', 5, 120);
        crystals.splice(i, 1);
      }
    }
  }

  function updatePowerups(dt) {
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      // 许凯狗冲刺：道具无视距离立刻被自身吸收（量子护盾 / 暴走等读条效果在 applyPowerupPickup 内跳过）
      if (state.pilotDashT > 0 && player.alive) {
        applyPowerupPickup(p);
        powerups.splice(i, 1);
        continue;
      }
      // 磁吸：比水晶更易被吸引（半径更大、拉力更强），吸附后直奔机身
      // 强制吸收（absorbDelay，BOSS 清场道具 / 警报快速吸收）：先自由下落一小段，随后无视距离高速飞向战机
      let magnetized = false;
      if (p.absorbDelay != null && p.absorbDelay > 0) {
        p.absorbDelay -= dt;   // 下坠阶段：保持初始 vx/vy 飘落
      } else if (player.alive) {
        const dx = player.x - p.x;
        const dy = player.y - p.y;
        const dist = Math.hypot(dx, dy);
        const bossPull = p.absorbDelay != null;   // 下坠结束后强制吸收
        if (dist > 1 && (bossPull || dist < POWERUP_MAGNET_RADIUS)) {
          magnetized = true;
          const pull = bossPull ? (p.pullSpeed || 1150) : 520 + 640 * (1 - dist / POWERUP_MAGNET_RADIUS);
          p.vx = (dx / dist) * pull;
          p.vy = (dy / dist) * pull;
          // 近距直吸：本帧位移即可抵达玩家时直接结算（高速拉取一帧可能越过拾取窗口）
          if (bossPull && dist <= pull * dt + 8) {
            applyPowerupPickup(p);
            powerups.splice(i, 1);
            continue;
          }
        }
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // 未磁吸时随机左右漂移，碰到左右两边反弹
      if (!magnetized) {
        if (p.x < p.r) { p.x = p.r; p.vx = Math.abs(p.vx); }
        else if (p.x > CANVAS_W - p.r) { p.x = CANVAS_W - p.r; p.vx = -Math.abs(p.vx); }
      }
      if (p.y > CANVAS_H + 20) { powerups.splice(i, 1); continue; }
      if (player.alive &&
          Math.abs(p.x - player.x) < player.w / 2 + p.r &&
          Math.abs(p.y - player.y) < player.h / 2 + p.r) {
        applyPowerupPickup(p);
        powerups.splice(i, 1);
      }
    }
  }

  // ---------- 水晶 ----------
  function updateCrystals(dt) {
    // 有效磁吸半径：击败第一个 BOSS（旧日之歌）后永久 ×1.5（基础 150 → 225，2026-10-12 用户定稿 132→150）；
    // 奖励道具·磁力菇：叠加固定加成 +75px/个（state.magnetBonus，一整局可叠加，2026-10-12 用户定稿 +50→+75）
    const magR = PLAYER_CFG.magnetRadius * (state.crystalMagnetMul || 1) + (state.magnetBonus || 0);
    for (let i = crystals.length - 1; i >= 0; i--) {
      const c = crystals[i];
      c.t += dt * 4;
      c.age = (c.age || 0) + dt;   // 出生计时：掉出 CRYSTAL_ABSORB_DELAY(0.1s) 内不可被吸收（2026-10-14 用户定稿）
      const canAbsorb = c.age >= CRYSTAL_ABSORB_DELAY;
      // 许凯狗冲刺：水晶无视距离立刻被自身吸收（计入得分）；澜心 / 炼金璃等量表冻结不计（见 updatePilotStatus）
      if (state.pilotDashT > 0 && player.alive && canAbsorb) {
        state.score += Math.round(c.val * diffMods().scoreMul);
        state.princeCrystalGain += Math.round(c.val * diffMods().scoreMul);
        if (c.tier === 'giant') { achvNoteGiantCrystal(); noteGachaStone(); }   // 原石（巨型水晶）：成就计数 + 当局收集计数/16 颗里程碑
        affixCrystalExtend();   // 词条（具象级 1:good:6）：拾取水晶延长结晶护盾（+0.1s/颗，总延长至多 2s）
        spawnParticles(c.x, c.y, '#9be7ff', 5, 120);
        crystals.splice(i, 1);
        continue;
      }
      // 磁吸：靠近玩家时被吸附（吸附后直奔机身中心判定点）
      // 强制吸收（absorbDelay，警报快速吸收等）：先自由下落一小段，随后无视距离高速飞向战机
      //（两条吸收通道均受 0.1s 吸收延迟门控——出生水晶先自由下坠满延迟再进入吸附/拉取）
      if (!canAbsorb) {
        // 出生 0.1s 内：仅自由下坠，不进入任何吸收通道
      } else if (c.absorbDelay != null && c.absorbDelay > 0) {
        c.absorbDelay -= dt;   // 下坠阶段：保持初始 vx/vy 四散飘落
      } else if (player.alive) {
        const dx = player.x - c.x;
        const dy = player.y - c.y;
        const dist = Math.hypot(dx, dy);
        const bossPull = c.absorbDelay != null;   // 下坠结束后强制吸收
        if (dist > 1 && (bossPull || dist < magR)) {
          const pull = bossPull ? (c.pullSpeed || 1150) : 900 + 700 * (1 - dist / magR);
          c.vx = (dx / dist) * pull;
          c.vy = (dy / dist) * pull;
          // 近距直吸：本帧位移即可抵达玩家时直接结算（高速拉取一帧可能越过拾取窗口）
          if (bossPull && dist <= pull * dt + 8) {
            state.score += Math.round(c.val * diffMods().scoreMul);
        state.princeCrystalGain += Math.round(c.val * diffMods().scoreMul);   // 天秀忧郁王子：水晶得分不计入白色量表（updatePilotStatus 差分时扣除）
            // 七日澜心：按水晶【得分】等比填充技能量表（普通 +10 / 巨型 +500）——
            // 水晶系统后续重构将新增多种水晶，均按各自 val 自动等比计入（见 ARMOR_SKILLS.gaugeCrystalScore），无需改动此处
            // （firstBoss：首轮 BOSS 掉落水晶，量表收益额外加成；护盾期间量表停计，见 armorSkillGain）
            armorSkillGain(c.val, c.firstBoss);
            if (c.tier === 'giant') { achvNoteGiantCrystal(); noteGachaStone(); }   // 原石（巨型水晶）：成就计数 + 当局收集计数/16 颗里程碑
            affixCrystalExtend();   // 词条（具象级 1:good:6）：拾取水晶延长结晶护盾（+0.1s/颗，总延长至多 2s）
            spawnParticles(c.x, c.y, '#9be7ff', 5, 120);
            crystals.splice(i, 1);
            continue;
          }
        }
      }
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      // 左右边界回收：水晶不出两侧边界——贴边夹取位置并消去朝外的横向速度
      // （磁吸拉向玩家不会推出边界；只有坠出底边才移除，见下方 y 判定）
      if (c.x < c.r) { c.x = c.r; if (c.vx < 0) c.vx = 0; }
      else if (c.x > CANVAS_W - c.r) { c.x = CANVAS_W - c.r; if (c.vx > 0) c.vx = 0; }
      if (c.y > CANVAS_H + 20) { crystals.splice(i, 1); continue; }
      if (canAbsorb && player.alive &&
          Math.abs(c.x - player.x) < player.w / 2 + c.r &&
          Math.abs(c.y - player.y) < player.h / 2 + c.r) {
        state.score += Math.round(c.val * diffMods().scoreMul);
        state.princeCrystalGain += Math.round(c.val * diffMods().scoreMul);   // 天秀忧郁王子：水晶得分不计入白色量表（updatePilotStatus 差分时扣除）
        // 七日澜心：按水晶【得分】等比填充技能量表（同上，后续新增水晶类型自动计入）
        armorSkillGain(c.val, c.firstBoss);
        if (c.tier === 'giant') { achvNoteGiantCrystal(); noteGachaStone(); }   // 原石（巨型水晶）：成就计数 + 当局收集计数/16 颗里程碑
        affixCrystalExtend();   // 词条（具象级 1:good:6）：拾取水晶延长结晶护盾（+0.1s/颗，总延长至多 2s）
        spawnParticles(c.x, c.y, '#9be7ff', 5, 120);
        crystals.splice(i, 1);
      }
    }
  }

  // BOSS 警报触发：场上所有水晶 / 道具进入「快速吸收」——0.35s 飘落后无视距离高速飞向战机
  // （拉速 1800）；拾取判定照常逐个结算，不再瞬间清空全场
  function collectAllItems() {
    for (const c of crystals) {
      if (c.absorbDelay == null) c.absorbDelay = 0.35;   // 飘落阶段：保留可感知的「飞向战机」过程
      c.pullSpeed = 1800;
    }
    for (const p of powerups) {
      if (p.absorbDelay == null) p.absorbDelay = 0.35;
      p.pullSpeed = 1800;
    }
  }

  // 胜利结算前 0.8s 统一收集：场上全部未收集水晶（仅水晶、不含道具）——跳过 0.35s 飘落（absorbDelay = 0 直拉）、
  // 拉速 1500（2026-09-27 定稿放缓：典型距离 0.3~0.5s 抵达，最远 ≈0.75s 仍落在 0.8s 窗口内）；逐帧重复调用幂等
  function collectAllCrystals() {
    for (const c of crystals) {
      if (c.absorbDelay == null) c.absorbDelay = 0;
      c.pullSpeed = 1500;
    }
  }

  // ---------- 粒子 ----------
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
  }

  // ---------- 绘制 ----------

  // 护盾解除冲击波：从玩家位置迅速扩大到全屏，同时渐隐（视觉上解释为何清除全场敌弹）
  const shieldBurst = { active: false, t: 0, duration: 0.65, x: 0, y: 0 };

  // 暴走冲击波：粉橙双环自机体扩散（暴走触发的醒目特效，不遮挡画面）
  const berserkBursts = [];   // 暴走冲击波列表（元素 { t, duration, x, y, big }）——多道并存：暴走进入/陵落 Q 续按/演示各自成波互不清除（2026-10-11 用户定稿）；07-player 触发 push、14-main 推进、10-draw-world 绘制、12-ui 重开清空

  // 高能爆弹火圈：自场地中心急速扩大至全场的橙黄色火环（全部模式统一表现）
  const bombBursts = [];   // 高能爆弹/绷绷炸弹震荡波特效列表（元素 { t, duration, big }）——可多道并存：重复释放不再清除此前波（2026-10-11 用户定稿）；07-player 释放时 push、14-main 推进与过期移除、10-draw-world 绘制、12-ui 重开清空
  const tisuRings = [];    // 时流天梭发射环特效列表（元素 { x, y, ang, r0, t }）——发射瞬间（出膛+停止后再射）在弹体后方生成三环：越靠后越大、0.28s 原地扩散变淡（2026-11-18 用户定稿）；spawnTisuRings 生成（07-player 出膛 + 08-entities 再射共用）、14-main 推进与过期移除、10-draw-world 绘制、12-ui 重开清空
  // 发射环生成：沿 -ang 方向（弹体后方）依次排布三环，间距 9px，基准半径 7/11/15 递增（「越靠后越大」）
  function spawnTisuRings(x, y, ang) {
    for (let k = 0; k < 3; k++) {
      tisuRings.push({ x: x - Math.cos(ang) * (6 + k * 9), y: y - Math.sin(ang) * (6 + k * 9), ang, r0: 7 + k * 4, t: 0 });
    }
    if (tisuRings.length > 60) tisuRings.splice(0, tisuRings.length - 60);   // 容量兜底（暴走多颗同场不无限堆积）
  }

  // 时流天梭停止点沿射线钳制：返回自 (x,y) 沿 ang 方向的最大可行进距离，使落点距屏缘 ≥edge
  //（X/Y 独立 clamp 会把停止点掰离瞄准射线——刹车段 rem 触底反弹永不抵达，必须沿射线参数钳制）；
  // 07-player 出膛首段与 08-entities 转向重掷共用
  function tisuRayStop(x, y, ang, dist, edge) {
    const c = Math.cos(ang), s = Math.sin(ang);
    let smax = Infinity;
    if (c > 1e-6) smax = Math.min(smax, (CANVAS_W - edge - x) / c);
    else if (c < -1e-6) smax = Math.min(smax, (edge - x) / c);
    if (s > 1e-6) smax = Math.min(smax, (CANVAS_H - edge - y) / s);
    else if (s < -1e-6) smax = Math.min(smax, (edge - y) / s);
    return Math.max(1, Math.min(dist, smax));
  }

  export {
    enemyDamageMul, updateBullets, POWERUP_MAGNET_RADIUS, spawnPowerup, applyPowerupPickup, updatePowerups,
    updateCrystals, collectAllItems, collectAllCrystals, updateParticles, shieldBurst, berserkBursts, bombBursts,
    scanJiyeBeam, tisuRings, spawnTisuRings, tisuRayStop,
  };