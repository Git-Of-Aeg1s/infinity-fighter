// 09-draw-ships：战机 / 僚机 / 各敌机形体与子弹预警的绘制

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：10-draw-world(38 名) 12-ui(3 名) 13-encyclopedia(4 名)
  //
  import { CANVAS_H, CANVAS_W, DEMO_TOP } from './01-config-core.js';
  import { ANVIL, BAOLING, BAOLING_G, BULWARK, CRYSTAL_COLORS, CRYSTAL_GIANT_COLORS, DOUZHI, DUSK, ENEMY_TYPES, FASHI_ARRAY, FASHI_MATRIX, HANSHUANG, HARBINGER, JIAOXIANG, PILOTS, POPIAN, PULSE_MATRIX, SPONSOR, STARSLAYER, UNREAL, WAR_GHOST, YU4, currentArmor, currentPlane, currentWingman } from './01-config.js';
  import { armorGlyphFx, blBombs, bossFlow, clamp, ctx, cubeHitFx, dagouMissiles, douzhiFx, enemies, frostZones, missileWarns, missiles, player, playerHitFx, popianMissiles, slashFx, spellCubes, state, wgSlashes, wingmen } from './02-core.js';



  // 绘制僚机（机体 + 星焰尾；暴走时星焰增强 + 机体辉光脉动 + 翼尖微光）
  //   群星允诺（volley）：蓝紫星焰；守愿者（fan）：冷蓝星焰 + 前方连体白盾
  function drawWingmen() {
    if (!player.alive) return;
    const wkBerserk = player.weapon === 5;
    const isBulwark = !!(currentWingman && currentWingman.weapon && currentWingman.weapon.kind === 'fan');
    for (const w of wingmen) {
      ctx.save();
      ctx.translate(w.x, w.y);
      if (isBulwark) ctx.scale(BULWARK.scale, BULWARK.scale);   // 守愿者整体（尾焰/机体/盾板/辉光/脉冲环）统一尺寸系数
      // 星焰尾：三角焰体，多频正弦叠加飘动模拟星焰；暴走时更长更亮（守愿者过载焰最盛；壁垒常态焰 +60%）
      const fl = (wkBerserk ? (isBulwark ? 17 : 9) : isBulwark ? 9.6 : 6) + Math.sin(w.flameT * 26) * 2.2 + Math.sin(w.flameT * 41) * 1.1;
      // 壁垒：焰体上移至与机体底尖重叠（尾焰图层最低，重叠段被机体覆盖、读作相连）并略微增长
      const flameY0 = isBulwark ? 5 : 8;
      const flameExt = isBulwark ? (wkBerserk ? 10 : 7) : 5;
      const fg = ctx.createLinearGradient(0, flameY0, 0, flameY0 + fl + flameExt);
      if (isBulwark) {
        if (wkBerserk) {
          fg.addColorStop(0, 'rgba(234, 248, 255, 0.95)');
          fg.addColorStop(0.5, 'rgba(150, 210, 255, 0.65)');
          fg.addColorStop(1, 'rgba(60, 140, 240, 0)');
        } else {
          fg.addColorStop(0, 'rgba(190, 225, 255, 0.9)');
          fg.addColorStop(0.5, 'rgba(120, 185, 255, 0.5)');
          fg.addColorStop(1, 'rgba(70, 140, 230, 0)');
        }
      } else if (wkBerserk) {
        fg.addColorStop(0, 'rgba(238, 228, 255, 0.95)');
        fg.addColorStop(0.5, 'rgba(168, 138, 255, 0.65)');
        fg.addColorStop(1, 'rgba(118, 88, 240, 0)');
      } else {
        fg.addColorStop(0, 'rgba(190, 170, 255, 0.9)');
        fg.addColorStop(0.5, 'rgba(140, 120, 255, 0.5)');
        fg.addColorStop(1, 'rgba(110, 90, 230, 0)');
      }
      ctx.fillStyle = fg;
      const flameX = isBulwark ? w.side * 3 : 0;   // 壁垒本体偏移(side*3,-3)：尾焰对齐本体中线
      const fw = isBulwark && wkBerserk ? 4.4 : 3;   // 壁垒暴走：焰体更宽
      if (isBulwark && wkBerserk) {
        ctx.shadowColor = 'rgba(160, 215, 255, 0.95)'; ctx.shadowBlur = 11;   // 过载焰光晕
      }
      ctx.beginPath();
      ctx.moveTo(flameX - fw, flameY0);
      ctx.lineTo(flameX, flameY0 + fl + flameExt);
      ctx.lineTo(flameX + fw, flameY0);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      if (isBulwark && wkBerserk) {
        // 过载白芯：焰体中央白热内焰（呼应弹体加焰的暴走输出状态）
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.beginPath();
        ctx.moveTo(flameX - 2, flameY0);
        ctx.lineTo(flameX, flameY0 + fl * 0.66);
        ctx.lineTo(flameX + 2, flameY0);
        ctx.closePath();
        ctx.fill();
      }
      if (isBulwark) {
        if (wkBerserk) {
          // 暴走金色背光：绘于机体之下（只作轮廓外辉光），不罩染六边形内部
          const pulse = 0.35 + Math.sin(state.time * 14) * 0.15;
          const aura = ctx.createRadialGradient(0, -1, 6, 0, -1, 36);
          aura.addColorStop(0, `rgba(255, 224, 150, ${(0.30 + pulse * 0.22).toFixed(3)})`);
          aura.addColorStop(0.55, `rgba(255, 205, 110, ${(0.14 + pulse * 0.10).toFixed(3)})`);
          aura.addColorStop(1, 'rgba(255, 205, 110, 0)');
          ctx.fillStyle = aura;
          ctx.beginPath(); ctx.arc(0, -1, 36, 0, Math.PI * 2); ctx.fill();
        }
        // 一体化盾卫机体：机体即盾（盾板外缘薄白亮边），命中时 shieldFlash 增亮
        paintWingmanBulwark(ctx, w.side, wkBerserk, w.shieldFlash || 0);
        if (wkBerserk) {
          // 金色双扩散脉冲环：与盾面同心、角域一致（arcFrom→arcTo 随 side 镜像），仅盾弧段外放
          const rup = -Math.PI / 2;
          const ra0 = rup + w.side * (BULWARK.arcFrom * Math.PI / 180);
          const ra1 = rup + w.side * (BULWARK.arcTo * Math.PI / 180);
          const rccw = w.side < 0;
          for (const off of [0, 0.45]) {
            const pt = ((state.time + off) % 0.9) / 0.9;   // 0→1 扩散进度（两环相位差半周期，无缝接力）
            const ra = (1 - pt) * 0.5;
            ctx.strokeStyle = `rgba(255, 228, 160, ${ra.toFixed(3)})`;
            ctx.lineWidth = 2.2 * (1 - pt) + 0.5;
            ctx.shadowColor = 'rgba(255, 200, 100, 0.8)';
            ctx.shadowBlur = 9 * ra;
            ctx.beginPath(); ctx.arc(0, 0, 30 + pt * 22, ra0, ra1, rccw); ctx.stroke();
          }
          ctx.shadowBlur = 0;
        }
        ctx.restore();
        continue;
      }
      // 机体
      paintWingman(ctx, w.side, wkBerserk);
      // 暴走：机体辉光脉动（星核过载）+ 翼尖微光
      if (wkBerserk) {
        const pulse = 0.35 + Math.sin(state.time * 14) * 0.15;
        // 机体辉光：以星核为中心的脉动光晕
        const aura = ctx.createRadialGradient(0, -1, 2, 0, -1, 17);
        aura.addColorStop(0, `rgba(186, 160, 255, ${(0.30 + pulse * 0.25).toFixed(3)})`);
        aura.addColorStop(1, 'rgba(186, 160, 255, 0)');
        ctx.fillStyle = aura;
        ctx.beginPath(); ctx.arc(0, -1, 17, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = pulse;
        ctx.shadowColor = '#b49bff'; ctx.shadowBlur = 10;
        ctx.fillStyle = '#cbb8ff';
        // 翼尖已随尾翼下旋 ~20°：尖端实际位置 (±12.3, 11.4)
        for (const t of [[12.3, 11.4]]) { ctx.beginPath(); ctx.arc(w.side < 0 ? -t[0] : t[0], t[1], 2.0, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      }
      ctx.restore();
    }
  }

  // 注：守愿者白盾已与机体一体化，统一在 paintWingmanBulwark 内绘制（盾板外缘那道薄白亮边即护盾）



  // 战机造型（关于原点严格对称）：主绘制与选机缩略图共用，确保两处一致
  // 蓝色机身 + 底部两个稍高的粉色(#FFC0CB)尾翼三角，粉与蓝之间做渐变衔接
  // berserk=true 时机体展开变形（翼展加宽、尾翼延伸）
    // 僚机造型（随 side 镜像：尾翼只在外侧）：飞行武器/悬浮炮台——朝上双叉炮口 + 装甲弹体 + 大型后掠双尾翼 + 星核；主绘制与选僚机缩略图共用
    // berserk=true：追加外侧纵向两片透明白紫三角机翼延伸（上小下大，顶角 120°、一腰竖直）
  function paintWingman(g, side = 1, berserk = false, still = false) {
    // 飞行武器（悬浮炮台/能量弹舱）：朝上双叉炮口 + 棱角装甲弹体 + 大型后掠双尾翼(一边两片、只在外侧) + 中央星核 + 底部推进环
    // —— 刻意去除机翼/座舱/尾翼等飞机语言，读作“一门会悬浮飞行的炮”
    // side：僚机所处侧（-1=左僚机→尾翼全在左；+1=右僚机→尾翼全在右；缩略图默认 +1）

    // (0) 大型后掠尾翼：先于舱体绘制（位于舱体图层之下），翼根藏进舱体内、由舱体压住衔接处，
    //     配色取舱体同系蓝紫但整体提亮一档（翼根中蓝紫、尖端亮淡紫），无需任何衔接描边即自然
    const out = side < 0 ? -1 : 1;   // 外侧方向（远离主机的一侧）
    g.save();
    g.rotate(out * 0.35);   // 整片尾翼向下旋 ~20°（左右镜像各自朝下指）：翼尖明显朝下
    const finGrd = g.createLinearGradient(out * 2, 0, out * 15.5, 0);
    finGrd.addColorStop(0, 'rgba(96, 94, 210, 0.97)');      // 翼根：中蓝紫（较舱体暗部提亮）
    finGrd.addColorStop(0.45, 'rgba(140, 155, 245, 0.95)'); // 中段：亮蓝紫
    finGrd.addColorStop(0.8, 'rgba(170, 162, 255, 0.85)');
    finGrd.addColorStop(1, 'rgba(192, 182, 255, 0.60)');    // 翼尖亮淡紫渐透
    g.fillStyle = finGrd;
    g.beginPath();
    g.moveTo(out * 1.5, -2);
    g.lineTo(out * 15.5, 6.5);
    g.lineTo(out * 2.5, 6.5);   // 底边与翼尖同高 → 下底边水平，露出的翼面读作干净的斜刃
    g.closePath();
    g.fill();
    // 尾缘暗色收边：水平底缘压深，上亮下暗读作受光面
    g.strokeStyle = 'rgba(46, 42, 120, 0.55)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(out * 15.5, 6.5);
    g.lineTo(out * 2.5, 6.5);
    g.stroke();
    // 前缘极淡高光（仅一笔、不包围轮廓）
    g.strokeStyle = 'rgba(214, 206, 255, 0.35)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(out * 1.5, -2);
    g.lineTo(out * 15.5, 6.5);
    g.stroke();
    // 翼面结构：两条平行于前缘的翼肋（同步提亮一档）
    g.strokeStyle = 'rgba(88, 82, 205, 0.42)';
    g.lineWidth = 0.7;
    for (const t of [0.45, 0.75]) {
      g.beginPath();
      g.moveTo(out * (1.5 + t), -2 + 8.5 * t);
      g.lineTo(out * (15.5 - 13 * t), 6.5);
      g.stroke();
    }
    // 翼尖能量点（微光，同步提亮）
    g.fillStyle = 'rgba(228, 220, 255, 0.95)';
    g.beginPath();
    g.arc(out * 15.5, 6.5, 1.0, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // (0.5) 暴走机翼延伸：外侧纵向排列两片透明白紫三角（上小下大），读作能量机翼展开；
    // 等腰三角形、顶角 120°：一条腰竖直（贴机身外缘为根边、竖直向上），另一腰向外下方展开 120°
    // 带呼吸动画：透明度与微光随时间脉动（与机体辉光同频），呈现能量流动感
    if (berserk) {
      g.save();
      const breathe = still ? 0.4 : Math.sin(state.time * 6);   // still：静态帧冻结相位（预览图确定性）
      g.fillStyle = `rgba(226, 218, 255, ${(0.26 + breathe * 0.09).toFixed(3)})`;
      g.strokeStyle = `rgba(238, 232, 255, ${(0.35 + breathe * 0.12).toFixed(3)})`;
      g.lineWidth = 0.8;
      g.shadowColor = 'rgba(186, 160, 255, 0.8)';
      g.shadowBlur = 4 + breathe * 3;
      for (const [vy, L] of [[0, 7], [9, 11]]) {    // 上片小、下片大，纵向排列
        const vx = out * 8;   // 竖直腰贴机身外缘（舱体随后压住衔接处）
        g.beginPath();
        g.moveTo(vx, vy);                              // 顶角（两腰夹角 120°，位于下端）
        g.lineTo(vx, vy - L);                          // 竖直腰：沿机身外侧竖直向上
        g.lineTo(vx + out * 0.866 * L, vy + 0.5 * L);  // 另一腰：向外下方展开
        g.closePath();
        g.fill();
        g.stroke();
      }
      g.restore();
    }

    // (1) 主炮：朝上的双叉能量炮管（子弹自 y≈-8 出膛，炮口辉光在顶端）
    const barrelGrd = g.createLinearGradient(0, -16, 0, -3);
    barrelGrd.addColorStop(0, '#e6ecff');
    barrelGrd.addColorStop(0.5, '#939ef2');
    barrelGrd.addColorStop(1, '#4a4fa8');
    g.fillStyle = barrelGrd;
    g.strokeStyle = 'rgba(200, 214, 255, 0.9)';
    g.lineWidth = 0.9;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(sx * 1.1, -3);
      g.lineTo(sx * 2.0, -14);
      g.lineTo(sx * 4.4, -15.5);
      g.lineTo(sx * 3.6, -4);
      g.closePath();
      g.fill();
      g.stroke();
    }
    // 炮口能量辉光（蓝紫）
    g.fillStyle = 'rgba(196, 176, 255, 0.95)';
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.arc(sx * 3.2, -14.4, 1.05, 0, Math.PI * 2);
      g.fill();
    }

    // (2) 装甲弹体：棱角八边形舱体（蓝紫垂直渐变），承载炮管与星核
    const hullGrd = g.createLinearGradient(0, -9, 0, 10);
    hullGrd.addColorStop(0, '#eaf2ff');
    hullGrd.addColorStop(0.4, '#a9c6ff');
    hullGrd.addColorStop(0.75, '#6f7fe0');
    hullGrd.addColorStop(1, '#3f3d94');
    g.fillStyle = hullGrd;
    g.strokeStyle = 'rgba(190, 210, 255, 0.85)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(5.5, -6);
    g.lineTo(8.5, 1);
    g.lineTo(5, 8);
    g.lineTo(0, 10);
    g.lineTo(-5, 8);
    g.lineTo(-8.5, 1);
    g.lineTo(-5.5, -6);
    g.closePath();
    g.fill();
    g.stroke();

    // (3) 装甲分块线（暗色，勾勒厚重机械结构）
    g.strokeStyle = 'rgba(28, 22, 66, 0.32)';
    g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(-5.5, -6); g.lineTo(-8.5, 1); g.stroke();
    g.beginPath(); g.moveTo(5.5, -6); g.lineTo(8.5, 1); g.stroke();
    g.beginPath(); g.moveTo(-5, 8); g.lineTo(0, 5.5); g.lineTo(5, 8); g.stroke();


    // (5) 中央星核：发光能量核心（白核 → 蓝紫晕）+ 能量约束环
    const coreGrd = g.createRadialGradient(0, -1, 0.4, 0, -1, 4.6);
    coreGrd.addColorStop(0, '#ffffff');
    coreGrd.addColorStop(0.35, 'rgba(216, 229, 255, 0.95)');
    coreGrd.addColorStop(0.7, 'rgba(150, 130, 255, 0.85)');
    coreGrd.addColorStop(1, 'rgba(58, 40, 128, 0.9)');
    g.fillStyle = coreGrd;
    g.beginPath();
    g.arc(0, -1, 3.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(224, 214, 255, 0.6)';
    g.lineWidth = 0.7;
    g.beginPath();
    g.arc(0, -1, 4.7, 0, Math.PI * 2);
    g.stroke();

    // (6) 底部推进环：星焰接口（与 drawWingmen 的蓝紫三角星焰衔接）
    g.fillStyle = 'rgba(150, 130, 255, 0.85)';
    g.beginPath();
    g.ellipse(0, 9, 3.3, 1.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(234, 226, 255, 0.92)';
    g.beginPath();
    g.ellipse(0, 9, 1.7, 0.8, 0, 0, Math.PI * 2);
    g.fill();
  }

  // 守愿者僚机造型 —— 方案A：重甲堡垒型（坦克反应装甲风格）
  //   正面是一块沿弧线排列的厚重钢板装甲（读作铁壁而非能量盾），可见铆钉、装甲缝、加强筋
  //   盾板外缘半径 = BULWARK.radius = 挡弹折线半径（视觉与碰撞一致）
  //   side：-1=左 / +1=右；flash(0~1)：命中时金属亮闪；berserk：暴走过热
  function paintWingmanBulwark(g, side = 1, berserk = false, flash = 0, still = false) {
    const R = BULWARK.radius;                 // 外缘半径（= 挡弹碰撞线）
    const Ri = 10;                            // 内缘半径（装甲板内表面，与本体相连）
    const up = -Math.PI / 2;
    const a0 = up + side * (BULWARK.arcFrom * Math.PI / 180);
    const a1 = up + side * (BULWARK.arcTo * Math.PI / 180);
    const ccw = side < 0;
    const segs = 5;                           // 装甲板分段数（读作独立钢板拼接）
    const T = still ? 1.7 : (typeof state !== 'undefined' && state.time) || 0;   // still：静态帧冻结相位（预览图确定性）

    // ---- (1) 装甲板主体：沿弧线的厚重钢板，深蓝→天蓝渐变 + 板间缝隙 ----
    g.save();
    // 底板（整体弧形，作为基底填色）
    const plateGrd = g.createRadialGradient(0, 0, Ri, 0, 0, R);
    plateGrd.addColorStop(0, '#162a5e');
    plateGrd.addColorStop(0.35, '#1e4090');
    plateGrd.addColorStop(0.7, '#3080d0');
    plateGrd.addColorStop(1, '#70c8f0');
    g.beginPath();
    g.arc(0, 0, R, a0, a1, ccw);
    g.arc(0, 0, Ri, a1, a0, !ccw);
    g.closePath();
    g.fillStyle = plateGrd;
    g.fill();

    // ★ 护盾流动光效：常态无流光；暴走时三道「仅边缘亮白金」的流光带沿弧奔涌（内部透明，透出蓝色底板）
    g.save();
    g.beginPath();
    g.arc(0, 0, R, a0, a1, ccw);
    g.arc(0, 0, Ri, a1, a0, !ccw);
    g.closePath();
    g.clip();
    if (berserk) {
      const arcSpan = BULWARK.arcTo - BULWARK.arcFrom;   // 总弧度范围
      for (let band = 0; band < 3; band++) {
        const phase = ((T * 120 + band * 55) % (arcSpan + 40)) - 20;   // 光带位置（度）
        const bandCenter = BULWARK.arcFrom + phase;
        const bw = 18;   // 光带宽度（度）
        const goldA = 0.55 + 0.18 * Math.sin(T * 9 + band * 2.1);   // 金边亮度轻微脉动
        g.save();
        g.strokeStyle = `rgba(255, 236, 190, ${goldA.toFixed(3)})`;   // 亮白金描边
        g.lineWidth = 1.8;
        g.shadowColor = 'rgba(255, 205, 110, 0.9)';   // 边缘金色光芒（仅沿描边外溢）
        g.shadowBlur = 9;
        g.beginPath();
        g.arc(0, 0, R - 1.5,
          up + side * ((bandCenter - bw / 2) * Math.PI / 180),
          up + side * ((bandCenter + bw / 2) * Math.PI / 180), ccw);
        g.arc(0, 0, Ri + 1.5,
          up + side * ((bandCenter + bw / 2) * Math.PI / 180),
          up + side * ((bandCenter - bw / 2) * Math.PI / 180), !ccw);
        g.closePath();
        g.stroke();
        g.restore();
      }
    }
    g.restore();

    // 中央竖直加强筋（最粗的一条，从内缘到外缘，凸起感）
    const midTh = (BULWARK.arcFrom + BULWARK.arcTo) / 2;
    const midAng = up + side * (midTh * Math.PI / 180);
    const mx = Math.cos(midAng), my = Math.sin(midAng);
    g.strokeStyle = 'rgba(80, 160, 220, 0.5)';
    g.lineWidth = 2.8;
    g.beginPath();
    g.moveTo(mx * (Ri + 1), my * (Ri + 1));
    g.lineTo(mx * (R - 1), my * (R - 1));
    g.stroke();
    g.strokeStyle = 'rgba(160, 220, 255, 0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(mx * (Ri + 2), my * (Ri + 2));
    g.lineTo(mx * (R - 2), my * (R - 2));
    g.stroke();

    // 铆钉：沿弧线外排小圆点（原贴机体侧的内排小点已移除——盾环内侧保持干净）
    g.fillStyle = 'rgba(160, 210, 245, 0.5)';
    const boltCount = segs * 2;
    for (let k = 0; k <= boltCount; k++) {
      const th = BULWARK.arcFrom + (BULWARK.arcTo - BULWARK.arcFrom) * (k / boltCount);
      const ang = up + side * (th * Math.PI / 180);
      const cx = Math.cos(ang), cy = Math.sin(ang);
      g.beginPath(); g.arc(cx * (R - 3.5), cy * (R - 3.5), 0.9, 0, Math.PI * 2); g.fill();
    }
    g.restore();

    // ---- (3) 盾缘亮边（挡弹线 = R 处，白蓝亮线 + 微光晕）----
    g.save();
    const edgeAlpha = 0.85 + flash * 0.15;
    g.strokeStyle = `rgba(200, 235, 255, ${edgeAlpha.toFixed(3)})`;
    g.lineWidth = 2;
    g.shadowColor = BULWARK.glow; g.shadowBlur = 4 + flash * 12;
    g.beginPath(); g.arc(0, 0, R, a0, a1, ccw); g.stroke();
    g.restore();

    // ---- (4) 核心机体：六边形装甲核心（本体相对盾往外上偏移，读作“机体探出盾后”）----
    g.save();
    g.translate(side * 3, -3);   // 左侧机体往左上、右侧往右上（盾位置不变）
    const coreGrd = g.createLinearGradient(0, -12, 0, 12);
    coreGrd.addColorStop(0, '#b8e0ff');
    coreGrd.addColorStop(0.35, '#6db4e8');
    coreGrd.addColorStop(0.75, '#3a7ec0');
    coreGrd.addColorStop(1, '#1e4a80');
    g.fillStyle = coreGrd;
    g.strokeStyle = 'rgba(130, 200, 250, 0.5)';
    g.lineWidth = 1;
    // 正六边形（竖放：上下尖、左右宽，外接半径 11）
    const hr = 11;
    const hexPath = () => {
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = -Math.PI / 2 + i * Math.PI / 3;
        const px = Math.cos(ang) * hr * 0.85, py = Math.sin(ang) * hr;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
    };
    hexPath();
    g.fill(); g.stroke();

    // ★ 本体六边形蜂巢流动特效（单位六边大幅增大：cellR 2.4 → 4.5，读作大块装甲单元的能量扫掠）
    g.save();
    hexPath(); g.clip();
    const cellR = 4.5;
    const cellH = cellR * Math.sqrt(3);
    const waveSpeed = 28;
    const waveLen = 22;
    for (let row = -3; row <= 3; row++) {
      for (let col = -3; col <= 3; col++) {
        const cx = col * cellR * 1.5;
        const cy = row * cellH + (col % 2 ? cellH * 0.5 : 0);
        const dist = cy - ((T * waveSpeed) % (waveLen * 3)) + waveLen * 1.5;
        const wave = Math.max(0, 1 - Math.abs(dist % (waveLen * 3) - waveLen * 1.5) / (waveLen * 0.6));
        g.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 6 + i * Math.PI / 3;
          const px = cx + Math.cos(a) * (cellR - 0.3), py = cy + Math.sin(a) * (cellR - 0.3);
          if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath();
        if (wave > 0.05) {
          g.fillStyle = `rgba(200, 240, 255, ${(wave * 0.45).toFixed(3)})`;
          g.fill();
          g.strokeStyle = `rgba(180, 230, 255, ${(wave * 0.7).toFixed(3)})`;
          g.lineWidth = 0.5;
          g.stroke();
        } else {
          g.strokeStyle = 'rgba(80, 160, 230, 0.2)';
          g.lineWidth = 0.35;
          g.stroke();
        }
      }
    }
    g.restore();

    // （原装甲面板缝两条深色横线已移除——机体表面保持整块渐变）

    // 反应堆核心：白色六边形能量核（无描边边界；光效微脉动；偶尔一道蓝光自下而上掠过核心；
    // 暴走过载：核心更大 + 光效高频闪烁、蓝光掠过更频繁）
    const coreR = berserk ? 6.2 : 5;
    const coreA = Math.min(1, (berserk ? 0.92 + Math.sin(T * 21) * 0.08 : 0.85 + Math.sin(T * 5) * 0.1) + flash * 0.2);
    const coreHex = () => {
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = -Math.PI / 2 + i * Math.PI / 3;
        const px = Math.cos(ang) * coreR * 0.85, py = Math.sin(ang) * coreR;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
    };
    g.save();
    g.shadowColor = 'rgba(140, 205, 255, 0.9)';
    g.shadowBlur = (berserk ? 12 : 8) + Math.sin(T * 5) * 3 + flash * 6;   // 光芒脉动（受击闪增亮）
    coreHex();
    g.fillStyle = `rgba(255, 255, 255, ${coreA.toFixed(2)})`;   // 纯白核心
    g.fill();
    g.shadowBlur = 0;
    // 偶发蓝光流动：每 ~4s 一道斜向蓝光带自下而上掠过（其余时间核心保持纯白）
    g.save();
    coreHex(); g.clip();
    const sweepPeriod = berserk ? 2.6 : 4.2;
    const sp = (T % sweepPeriod) / sweepPeriod;
    if (sp < 0.32) {
      const prog = sp / 0.32;                                  // 0→1 掠过进度
      const env = 1 - Math.abs(prog - 0.5) * 2;                // 中段最亮的三角包络
      const y0 = coreR + 2 - prog * (coreR * 2 + 4);           // 自下而上
      const x0 = (prog - 0.5) * coreR * 0.9;                   // 轻微斜向
      const band = g.createLinearGradient(x0 - 3, y0 - 2.5, x0 + 3, y0 + 2.5);
      band.addColorStop(0, 'rgba(120, 190, 255, 0)');
      band.addColorStop(0.5, `rgba(160, 215, 255, ${(0.8 * env).toFixed(2)})`);
      band.addColorStop(1, 'rgba(120, 190, 255, 0)');
      g.fillStyle = band;
      g.fillRect(-coreR - 2, y0 - 3, coreR * 2 + 4, 6);
    }
    g.restore();
    g.restore();

    // 炮口槽（顶部尖端内的窄缝）
    g.fillStyle = 'rgba(160, 220, 255, 0.75)';
    g.fillRect(-1.5, -12, 3, 2.5);
    g.restore();   // 结束本体偏移

    // ---- (7) 暴走：装甲能量过载——外缘金色亮线（脉动）----
    // 注：盾面泛光与板缝透光已移除——整盾发白会淹没装甲细节；暴走呈金色光芒（流光/脉冲环/外缘亮线），不再发白
    if (berserk) {
      const pulse = 0.3 + Math.sin(state.time * 12) * 0.12;
      g.save();
      g.strokeStyle = `rgba(255, 226, 150, ${(0.72 + pulse * 0.28).toFixed(3)})`;
      g.lineWidth = 3;
      g.shadowColor = '#ffd166'; g.shadowBlur = 12 + pulse * 8;
      g.beginPath(); g.arc(0, 0, R, a0, a1, ccw); g.stroke();
      g.restore();
    }
  }

  // ---------- 群星之杀造型（按机体构成示意图 · v15）----------
  // 构成：中央棱角多边形机身（下部双长腿，腿间引擎喷口尾焰）+ 连接臂 + 棱角金色双刃。
  // 机头核心样式与混乱将至座舱一致（白核径向渐变 + 深色外圈 + 反光点）。
  // 攻击特效：doSlash 置位 player.bladeFlashT → 双刃白金过载 + 刃前弯曲斩动波 + 刃上方金色动效。
  // 暴走（berserkT 0→1）：双刃顶点插值形变为巨大橙金帆翼（紫骨架），结束时收回。
  // spreadT 0→1：双刃沿连接臂向外滑出至全展位（开局展开动画 / 标题页预览=1）。
  function paintStarslayer(g, spreadT = 0, plane = currentPlane, berserkT = 0, still = false) {
    const T = still ? 2.2 : (typeof state !== 'undefined' && state.time) || 0;   // still：静态帧冻结相位（预览图确定性）
    const sp = clamp(spreadT, 0, 1);   // 0=双刃收拢 1=全展开
    const slide = (1 - sp) * 4;        // 收拢位：双刃向机身平移 4
    const atk = still ? 0 : clamp((player.bladeFlashT || 0) / 0.45, 0, 1);   // 攻击闪光强度 0~1（预览冻结为 0，避免抓到攻击帧）
    let e = clamp(berserkT, 0, 1);     // 暴走变形进度
    e = e * e * (3 - 2 * e);           // smoothstep 缓动
    const lerp = (a, b) => a + (b - a) * e;
    // 常态刃 → 暴走巨帆：顶点逐点插值（同一骨架，形态随 e 连续变形）
    const NB = [[14, -40], [23, -27.5], [32, -5], [24, 7], [19, 15], [16.5, -2.5], [14.5, -16]];
    const SB = [[13.3, -62.7], [28.9, -41], [41, -2.1], [30.6, 18.7], [21.9, 32.6], [17.6, 2.3], [14.1, -21.1]];   // 常态刃绕锚点(15,-9)均匀放大√3（面积×3）；外凸角稍内收
    const P = NB.map((p, i) => [lerp(p[0], SB[i][0]), lerp(p[1], SB[i][1])]);
    const NC = [[22, 2.5], [24, -7.5], [18, -27.5]];   // 金色新月内缘（常态）
    const SC = [[27.1, 10.9], [25.5, -14], [20.2, -41]];         // 金色帆缘内界（同比例放大；外凸角内收时同步内收保缘宽）
    const C = NC.map((p, i) => [lerp(p[0], SC[i][0]), lerp(p[1], SC[i][1])]);
    // 刃前部向内倾 10°（绕连接节点旋转，镜像侧经 scale 自动对称）
    const tilt = -4 * Math.PI / 180;
    const rotP = ([x, y]) => [15 + (x - 15) * Math.cos(tilt) - (y + 9) * Math.sin(tilt), -9 + (x - 15) * Math.sin(tilt) + (y + 9) * Math.cos(tilt)];
    for (let i = 0; i < P.length; i++) P[i] = rotP(P[i]);
    for (let i = 0; i < C.length; i++) C[i] = rotP(C[i]);
    const blade = () => {
      g.beginPath();
      g.moveTo(P[0][0], P[0][1]);
      for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]);
      g.closePath();
    };
    const crescent = () => {
      g.beginPath();
      g.moveTo(P[0][0], P[0][1]);
      g.lineTo(P[1][0], P[1][1]); g.lineTo(P[2][0], P[2][1]); g.lineTo(P[3][0], P[3][1]); g.lineTo(P[4][0], P[4][1]);
      g.lineTo(C[0][0], C[0][1]); g.lineTo(C[1][0], C[1][1]); g.lineTo(C[2][0], C[2][1]);
      g.closePath();
    };

    // ---- (1) 水平连接臂（垫层：置于双刃下方，双臂叉状 + 能量导管 + 末端连接节点）----
    for (const sx of [-1, 1]) {
      g.save(); g.scale(sx, 1);
      const arm = (y1, y2, x2) => {
        g.beginPath();
        g.moveTo(9.5, y1);
        g.lineTo(x2, y2);
        g.lineTo(x2, y2 + 3);
        g.lineTo(9.5, y1 + 3);
        g.closePath();
      };
      g.fillStyle = '#3d4258';
      arm(-7, -10.5, 21); arm(-2, -5.5, 20.5);       // 双臂加长，伸入刃体下方
      g.fill();
      g.strokeStyle = 'rgba(150,158,195,0.9)'; g.lineWidth = 0.7;
      arm(-7, -10.5, 21); g.stroke();
      arm(-2, -5.5, 20.5); g.stroke();
      // 能量导管：机身 → 刃的常亮深蓝紫流光细线（基底 + 沿线巡游亮段）
      g.strokeStyle = 'rgba(148,146,255,0.6)'; g.lineWidth = 1.1;
      g.shadowColor = '#6f63ff'; g.shadowBlur = 4;
      g.beginPath(); g.moveTo(10.5, -9.4 + 1.5); g.lineTo(20, -9.4 + 1.5); g.stroke();
      g.beginPath(); g.moveTo(10.5, -5.5 + 1.5); g.lineTo(19, -2.5 + 1.5); g.stroke();
      g.strokeStyle = 'rgba(198,194,255,0.95)'; g.lineWidth = 1.2;
      g.setLineDash([2.5, 9]);
      g.lineDashOffset = -T * 20;
      g.beginPath(); g.moveTo(10.5, -9.4 + 1.5); g.lineTo(20, -9.4 + 1.5); g.stroke();
      g.beginPath(); g.moveTo(10.5, -5.5 + 1.5); g.lineTo(19, -2.5 + 1.5); g.stroke();
      g.setLineDash([]);
      g.shadowBlur = 0;
      // 末端连接节点（圆盘铆接在刃内缘上）
      g.fillStyle = '#3a3f56';
      g.beginPath(); g.arc(15.8, -9.2, 2.6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(180,188,225,0.95)'; g.lineWidth = 0.9; g.stroke();
      g.fillStyle = '#d8ccff';
      g.beginPath(); g.arc(15.8, -9.2, 1, 0, Math.PI * 2); g.fill();
      // 暴走：金色能量沿连接臂流向双刃
      if (e > 0.01) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = `rgba(255,210,110,${(0.8 * e).toFixed(3)})`;
        g.lineWidth = 1.4;
        g.setLineDash([4, 6]);
        g.lineDashOffset = -T * 46;
        g.shadowColor = '#ffd44a'; g.shadowBlur = 6;
        g.beginPath(); g.moveTo(10, -8.4); g.lineTo(19.5, -8.4); g.stroke();
        g.beginPath(); g.moveTo(10, -4); g.lineTo(18.5, -2.5); g.stroke();
        g.setLineDash([]);
        g.restore();
      }
      g.restore();
    }

    // ---- (2) 双刃（常态：棱角切面金刃+紫芯；暴走：巨大橙金帆翼+紫骨架）----
    for (const sx of [-1, 1]) {
      g.save(); g.scale(sx, 1); g.translate(slide, 0);
      // (2a) 紫芯内体（暴走时淡出为帆底）——渐变流动的深蓝紫色：色相带沿刃体自尖向根巡游
      g.save();
      const fw = T * 2.0;   // 流动相位（各段相位滞后 → 色带持续下移）
      const h0 = 261 + 12 * Math.sin(fw);          // 刃尖：紫↔蓝紫
      const h1 = 249 + 11 * Math.sin(fw - 1.9);    // 中段：蓝紫
      const h2 = 233 + 8 * Math.sin(fw - 3.8);     // 刃根：深蓝
      g.shadowColor = `hsl(${h0 | 0}, 90%, 62%)`;
      g.shadowBlur = 9 + 6 * sp;
      const pg = g.createLinearGradient(14, -40, 19, 15);
      pg.addColorStop(0, `hsl(${h0 | 0}, 85%, 60%)`);
      pg.addColorStop(0.5, `hsl(${h1 | 0}, 82%, 40%)`);
      pg.addColorStop(1, `hsl(${h2 | 0}, 88%, 14%)`);
      g.globalAlpha = 1 - e;
      g.fillStyle = pg;
      blade(); g.fill();
      // 流光亮带：柔和高光带沿刃体循环巡游（两端渐入渐出，不生硬）
      const bp = (T * 0.42) % 1;
      const ea = Math.min(1, bp / 0.18, (1 - bp) / 0.18) * (1 - e);
      if (ea > 0.01) {
        const cl = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
        const fb = g.createLinearGradient(14, -40, 19, 15);
        fb.addColorStop(cl(bp - 0.24), 'rgba(196,188,255,0)');
        fb.addColorStop(cl(bp), `rgba(208,200,255,${(0.30 * ea).toFixed(3)})`);
        fb.addColorStop(cl(bp + 0.24), 'rgba(196,188,255,0)');
        g.fillStyle = fb;
        blade(); g.fill();
      }
      g.restore();
      // (2b) 暴走帆翼：橙红→金渐变（随 e 淡入）+ 紫骨架缝线
      if (e > 0.01) {
        g.save();
        g.shadowColor = '#ffc44d'; g.shadowBlur = still ? 0 : 12 + 9 * e;
        const sg = g.createLinearGradient(P[5][0], P[5][1], P[2][0], P[2][1]);
        sg.addColorStop(0, '#e8891c');
        sg.addColorStop(0.55, '#ffb838');
        sg.addColorStop(1, '#fff0b0');
        g.globalAlpha = e;
        g.fillStyle = sg;
        blade(); g.fill();
        g.globalAlpha = e * 0.5;
        g.strokeStyle = 'rgba(150,70,10,1)'; g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(P[6][0], P[6][1]); g.lineTo(P[2][0], P[2][1]);
        g.moveTo(P[5][0], P[5][1]); g.lineTo(P[3][0], P[3][1]);
        g.stroke();
        g.restore();
      }
      // (2c) 金色外刃新月（暴走时即帆翼金缘，随 e 增亮）
      g.save();
      g.shadowColor = '#ffd54a'; g.shadowBlur = still ? 0 : 12 + 11 * sp + 6 * e;
      const bg = g.createLinearGradient(P[0][0], P[0][1], P[4][0], P[4][1]);
      bg.addColorStop(0, '#fff6c8');
      bg.addColorStop(0.45, '#ffd44a');
      bg.addColorStop(1, '#eda32c');
      g.fillStyle = bg;
      crescent(); g.fill();
      g.restore();
      // 白热外缘折线（锋利感）——裁剪到刃体轮廓内：暴走刃尖极窄，折线平头端帽会凸出尖点形同线头
      g.save();
      blade(); g.clip();
      g.strokeStyle = `rgba(255,252,232,${(0.45 + 0.45 * sp).toFixed(3)})`;
      g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(P[0][0], P[0][1]);
      g.lineTo(P[1][0], P[1][1]); g.lineTo(P[2][0], P[2][1]); g.lineTo(P[3][0], P[3][1]); g.lineTo(P[4][0], P[4][1]);
      g.stroke();
      g.restore();
      // (2d) 攻击闪光：白金过载 + 弯曲斩动波（带曲率）+ 刃上方金色动效
      if (atk > 0.01) {
        const sweep = (T * 2.8) % 1;
        g.save();
        g.globalCompositeOperation = 'lighter';
        // 刃体白金过载
        g.globalAlpha = Math.min(1, atk * (0.6 + 0.25 * Math.sin(T * 30)));
        g.fillStyle = '#fff6d8';
        blade(); g.fill();
        // 弯曲斩动波：三道相位错开、带外凸曲率的斩痕
        for (let i = 0; i < 3; i++) {
          const ph = (sweep + i / 3) % 1;
          const k = 1 + ph * (0.3 + 0.3 * e);
          const px = (x) => 15 + (x - 15) * k;
          const py = (y) => -9 + (y + 9) * k;
          g.globalAlpha = (1 - ph) * atk * (0.85 + 0.25 * e);
          g.strokeStyle = 'rgba(255,240,190,1)';
          g.lineWidth = 2.4 + 1.6 * e - ph * 1.5;
          g.beginPath();
          g.moveTo(px(14), py(-40));
          g.quadraticCurveTo(px(42), py(-26), px(28), py(-2));   // 外凸曲率
          g.quadraticCurveTo(px(25), py(8), px(19), py(15));
          g.stroke();
        }
        // 刃上方金色动效：沿刃上缘升腾的金痕 + 上尖辉芒
        for (let i = 0; i < 4; i++) {
          const ph2 = (sweep + i / 4) % 1;
          const bx = [15, 21, 27, 31][i];
          const by = [-38, -29, -16, -8][i];
          g.globalAlpha = (1 - ph2) * atk * 0.9;
          g.strokeStyle = 'rgba(255,214,110,1)';
          g.lineWidth = 2.4 - ph2 * 1.6;
          g.beginPath();
          g.moveTo(bx, by - 2 - ph2 * 14);
          g.lineTo(bx + 3.5, by - 9 - ph2 * 14);
          g.stroke();
        }
        g.globalAlpha = atk * (0.7 + 0.3 * Math.sin(T * 32));
        g.fillStyle = 'rgba(255,225,140,1)';
        g.beginPath(); g.arc(14, -40, 3.2 + Math.sin(T * 32) * 0.8, 0, Math.PI * 2); g.fill();
        g.restore();
      }
      g.restore();
    }

    // 尾焰：自短颈向下（双腿之间），长度随时间闪动；根部增宽并对齐中线（原 -3.2/±1/1.8 不对称，现 ±3.2/±1.7 对称，腰位 0.6L→0.65L）
    const flameLen = ((10 + Math.sin(T * 13) * 3 + sp * 3) * 2 + e * 10) * 1.4;   // 常态翻倍；暴走更长、闪动放慢
    const fg = g.createLinearGradient(0, 15, 0, 15 + flameLen);
    fg.addColorStop(0, 'rgba(255,232,170,0.98)');   // 金白根
    fg.addColorStop(0.42, 'rgba(150,132,255,0.85)');   // 蓝紫
    fg.addColorStop(1, 'rgba(78,62,236,0)');   // 深蓝紫尾
    g.fillStyle = fg;
    g.beginPath();
    g.moveTo(-3.2, 15);
    g.quadraticCurveTo(-1.7, 15 + flameLen * 0.65, 0, 15 + flameLen);
    g.quadraticCurveTo(1.7, 15 + flameLen * 0.65, 3.2, 15);
    g.closePath(); g.fill();
    const eg = g.createRadialGradient(0, 10, 0.4, 0, 10, 8);
    eg.addColorStop(0, `rgba(216,200,255,${((0.6 + e * 0.25) + 0.15 * Math.sin(T * 14)).toFixed(3)})`);
    eg.addColorStop(1, 'rgba(78,62,236,0)');
    g.fillStyle = eg;
    g.beginPath(); g.arc(0, 10, 8, 0, Math.PI * 2); g.fill();

    // ---- (3) 中央机身：棱角多边形（切面风格）+ 下部双长腿 ----
    const trace = () => {
      g.beginPath();
      g.moveTo(-2.2, -25);         // 机头平切尖端（左）
      g.lineTo(2.2, -25);          // 机头平切尖端（右）
      g.lineTo(8.2, -20);          // 前折角（更锐）
      g.lineTo(12.5, -14);         // 肩角（最宽）
      g.lineTo(10, -7.5);          // 腰折角
      g.lineTo(8, -1.5);           // 下腰折角
      g.lineTo(8.5, 7);            // 胯角（尾部额外加宽）
      g.lineTo(6, 33);             // 右腿外缘（长腿直边，外撇）
      g.lineTo(1.8, 15);           // 右腿内缘（上行到裆）
      g.lineTo(-1.8, 15);          // 裆部横档
      g.lineTo(-6, 33);            // 左腿内缘（下行到左腿尖）
      g.lineTo(-8.5, 7);           // 左胯角（尾部额外加宽）
      g.lineTo(-8, -1.5);          // 左下腰折角
      g.lineTo(-10, -7.5);         // 左腰折角
      g.lineTo(-12.5, -14);        // 左肩角
      g.lineTo(-8.2, -20);         // 左前折角（更锐）
      g.lineTo(-2.2, -25);         // 左机头尖端
      g.closePath();
    };
    const body = g.createLinearGradient(0, -25, 0, 20);
    body.addColorStop(0, '#6a4de8');
    body.addColorStop(0.30, '#4629b8');
    body.addColorStop(0.62, '#2c1678');
    body.addColorStop(1, '#150a38');
    g.fillStyle = body;
    trace(); g.fill();
    g.strokeStyle = 'rgba(185,175,255,0.7)'; g.lineWidth = 1;
    trace(); g.stroke();

    // ---- 暴走：机头边缘金色覆盖 + 肩部向下双金拖尾（静态概览不画）----
    if (e > 0.01 && !still) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      // 机头边缘金色光芒覆盖（平切尖端 → 前折角 → 肩角）
      g.strokeStyle = `rgba(255,215,120,${(0.85 * e).toFixed(3)})`;
      g.lineWidth = 2.2;
      g.shadowColor = '#ffd44a'; g.shadowBlur = 9;
      g.beginPath();
      g.moveTo(-7.5, -20.6); g.lineTo(-2.2, -25); g.lineTo(2.2, -25); g.lineTo(8.2, -20); g.lineTo(12.4, -14.2);
      g.stroke();
      // 两道金色拖尾：自肩部最宽处外弓下掠，收束成尖（长度约 60% 机体）
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(sx * 12.4, -13.5);                                  // 肩部起点（宽端）
        g.quadraticCurveTo(sx * 14.6, 2, sx * 6.2, 21);              // 外缘：外弓后收束到尖
        g.quadraticCurveTo(sx * 9.6, 6, sx * 10.2, -12);             // 内缘（收窄）
        g.closePath();
        const tg = g.createLinearGradient(sx * 12.4, -13.5, sx * 6.2, 21);
        tg.addColorStop(0, `rgba(255,215,120,${(0.85 * e).toFixed(3)})`);
        tg.addColorStop(0.75, `rgba(255,190,90,${(0.4 * e).toFixed(3)})`);
        tg.addColorStop(1, 'rgba(255,180,80,0)');
        g.fillStyle = tg;
        g.fill();
        // 流动亮段（沿拖尾中线下奔，止于 70% 长度）
        g.strokeStyle = `rgba(255,240,190,${(0.75 * e).toFixed(3)})`;
        g.lineWidth = 1.6;
        g.setLineDash([6, 22]);
        g.lineDashOffset = -T * 55;
        g.beginPath();
        g.moveTo(sx * 11.4, -12);
        g.quadraticCurveTo(sx * 11.8, 3, sx * 7.6, 17);
        g.stroke();
        g.setLineDash([]);
      }
      g.shadowBlur = 0;
      g.restore();
    }

    // 装甲 + 流光（裁剪到机身）
    g.save();
    trace(); g.clip();
    // 额甲（亮蓝紫）
    g.fillStyle = 'rgba(205,195,255,0.45)';
    g.beginPath(); g.moveTo(0, -25); g.lineTo(8.2, -18.5); g.lineTo(4.3, -12); g.lineTo(-4.3, -12); g.lineTo(-8.2, -18.5); g.closePath(); g.fill();
    // 面颊通风槽（取代原两侧圆形亮斑）：单条较粗斜向刻线（左\右/ 镜像，V 字收向下方）
    for (const sx of [-1, 1]) {
      g.lineCap = 'round';
      // 槽体暗底 + 槽缘亮边（金属开槽质感）
      g.strokeStyle = 'rgba(10,6,34,0.9)';
      g.lineWidth = 2.0;
      g.beginPath();
      g.moveTo(sx * 4.0, -5.4);
      g.lineTo(sx * 9.8, -13.4);
      g.stroke();
      g.strokeStyle = 'rgba(205,195,255,0.75)';
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(sx * 4.0, -5.9);
      g.lineTo(sx * 9.8, -13.9);
      g.stroke();
      g.lineCap = 'butt';
    }
    // 通气特效：白色气流自通风槽沿槽向外上方逸出、渐现渐隐（静态概览不画）
    if (!still) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.shadowColor = '#e8f0ff'; g.shadowBlur = 3;
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const cyc = (T * 0.9 + i * 0.37 + (sx > 0 ? 0.17 : 0)) % 1;   // 四股错相循环
          const px = sx * (4.0 + 5.8 * cyc);
          const py = -5.4 - 8.0 * cyc;
          const a = Math.sin(cyc * Math.PI) * 0.75;
          g.fillStyle = `rgba(240,244,255,${a.toFixed(3)})`;
          g.beginPath();
          g.arc(px, py, 0.9 + 0.5 * Math.sin(cyc * Math.PI), 0, Math.PI * 2);
          g.fill();
        }
      }
      g.shadowBlur = 0;
      g.restore();
    }
    // 中面深甲
    g.fillStyle = 'rgba(8,4,36,0.55)';
    g.beginPath(); g.moveTo(0, -10.5); g.lineTo(6.6, -2); g.lineTo(0, 4); g.lineTo(-6.6, -2); g.closePath(); g.fill();
    // 暴走：尾翼（双腿）向腿尖渐变金色
    if (e > 0.01) {
      for (const sx of [-1, 1]) {
        const lg = g.createLinearGradient(sx * 6.4, 10, sx * 5.2, 33);
        lg.addColorStop(0, 'rgba(255,200,90,0)');
        lg.addColorStop(1, `rgba(255,215,120,${(0.75 * e).toFixed(3)})`);
        g.strokeStyle = lg;
        g.lineWidth = 3.6;
        g.beginPath(); g.moveTo(sx * 6.6, 11); g.lineTo(sx * 5.2, 32); g.stroke();
      }
    }
    // 中央脊线
    g.strokeStyle = 'rgba(222,216,255,0.95)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(0, -22); g.lineTo(0, 6); g.stroke();
    // 流光带（蓝紫 ×2 组错相流动，特效明显）
    for (const off of [0, 32, 64]) {
      const yy = ((T * 42 + off) % 96) - 48;
      const sg = g.createLinearGradient(0, yy - 16, 0, yy + 16);
      sg.addColorStop(0, 'rgba(120,130,255,0)');
      sg.addColorStop(0.5, 'rgba(150,160,255,0.34)');
      sg.addColorStop(1, 'rgba(120,130,255,0)');
      g.fillStyle = sg;
      g.fillRect(-15, yy - 16, 30, 32);
    }
    for (const off of [16, 48, 80]) {
      const yy = ((T * 30 + off) % 96) - 48;
      const sg = g.createLinearGradient(0, yy - 14, 0, yy + 14);
      sg.addColorStop(0, 'rgba(148,126,255,0)');
      sg.addColorStop(0.5, 'rgba(158,132,255,0.32)');
      sg.addColorStop(1, 'rgba(148,126,255,0)');
      g.fillStyle = sg;
      g.fillRect(-15, yy - 14, 30, 28);
    }
    // 暴走：金色能量沿机体流动（脊线流向机头 + 轮廓金边流动）
    if (e > 0.01) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = `rgba(255,210,110,${(0.65 * e).toFixed(3)})`;
      g.lineWidth = 1.5;
      g.setLineDash([5, 7]);
      g.lineDashOffset = -T * 40;
      g.shadowColor = '#ffd44a'; g.shadowBlur = 5;
      g.beginPath(); g.moveTo(0, 6); g.lineTo(0, -22); g.stroke();
      g.strokeStyle = `rgba(255,190,90,${(0.4 * e).toFixed(3)})`;
      g.lineWidth = 1.2;
      g.lineDashOffset = T * 34;
      trace(); g.stroke();
      g.setLineDash([]);
      g.restore();
    }
    g.restore();

    // ---- (3b) 机头核心（样式与混乱将至座舱一致：白核径向渐变 + 深色外圈 + 反光点）----
    // 核心已落在统一核心位 (0, -14)（全机型核心世界坐标约定，见 paintShip 顶部 SHIP_CORE_Y 注释）
    // 置于裁剪之外绘制，避免被机身渐变吃掉亮度
    const coreGrd = g.createRadialGradient(0, -14, 0.5, 0, -14, 5);
    coreGrd.addColorStop(0, '#ffffff');
    coreGrd.addColorStop(0.45, '#ffffff');
    coreGrd.addColorStop(0.7, 'rgba(210,200,255,0.9)');
    coreGrd.addColorStop(1, 'rgba(30,16,60,0.95)');
    g.fillStyle = coreGrd;
    g.beginPath(); g.arc(0, -14, 3.6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(20,10,30,0.8)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); g.ellipse(-0.9, -15.9, 0.9, 1.4, -0.2, 0, Math.PI * 2); g.fill();

    // ---- (4) 引擎（双腿之间：圆舱 + 短颈）+ 中央尾焰 ----
    g.fillStyle = '#1b1440';
    g.beginPath(); g.arc(0, 9.5, 3.2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(170,160,255,0.8)'; g.lineWidth = 0.9; g.stroke();
    g.fillStyle = '#2c1f66';
    g.beginPath();
    g.moveTo(-1.5, 11); g.lineTo(1.5, 11); g.lineTo(0.9, 15.5); g.lineTo(-0.9, 15.5);
    g.closePath(); g.fill();

    // ---- (5) 全展开炽亮脉冲（金色切面白热呼吸）----
    if (sp > 0.5 && !still) {
      const pulse = 0.7 + Math.sin(T * 10) * 0.3;
      g.save();
      g.globalAlpha = (sp - 0.5) * 2 * 0.30 * pulse;
      for (const sx of [-1, 1]) {
        g.save(); g.scale(sx, 1); g.translate(slide, 0);
        g.fillStyle = '#fffbe8';
        blade(); g.fill();
        g.restore();
      }
      g.restore();
    }
  }

  // 全机型核心统一落位（核心世界坐标固定 (0, -14)，相对 player 中心 / 僚机锚点）：
  // 座舱局部坐标不同的机型【整体平移机体对齐】——机体 + 核心一起动，核心在机体上的构图不变，
  // 禁止单独挪动核心位置；后续新机遵循同一规则（见 01-config PLANES 注释）
  const SHIP_CORE_Y = -14;         // 统一核心世界 y
  const CHAOS_CORE_LOCAL_Y = -7;   // 混乱将至座舱核心局部 y（机体局部坐标）

  function paintShip(g, spreadT = 0, plane = currentPlane, berserkT = 0, still = false) {
    if (plane && plane.id === 'starslayer') { paintStarslayer(g, spreadT, plane, berserkT, still); return; }
    const DS = (plane && plane.drawScale) || 1;   // 机体整体绘制缩放（混乱将至 ×1.15；座舱核心逆向补偿保持原尺寸）
    g.save();
    g.translate(0, SHIP_CORE_Y - CHAOS_CORE_LOCAL_Y);   // 整体平移（先于缩放 = 世界坐标位移）：核心落位到 (0, -14)
    if (DS !== 1) g.scale(DS, DS);
    // 尾焰（仅静态预览 still：游戏内由 drawPlayer 绘制动画尾焰，这里补画否则预览图缺尾焰）
    // 形状 / 配色与 drawPlayer 的 chaos 尾焰一致（粉 → 橙渐变），固定长度静帧
    if (still) {
      const pfg = g.createLinearGradient(0, 14, 0, 14 + 9 + 12);
      pfg.addColorStop(0, 'rgba(255, 192, 203, 0.95)');
      pfg.addColorStop(0.5, 'rgba(255, 150, 190, 0.6)');
      pfg.addColorStop(1, 'rgba(255, 90, 40, 0)');
      g.fillStyle = pfg;
      g.beginPath();
      g.moveTo(-5, 14);
      g.lineTo(0, 14 + 9 + 12);
      g.lineTo(5, 14);
      g.closePath();
      g.fill();
    }
    const wingSpread = 1 + spreadT * 0.2;   // 暴走时翼展加宽 20%（渐进）
    const finExtend = 1 + spreadT * 0.25;   // 暴走时尾翼延伸 25%（渐进）

    // 暴走：机身背后粉金柔光垫（环状光环已移除，涌动光效见机体上层光点）
    //   still 静态概览（选机卡预览图）不画——预览图不要背后光芒
    let bt = clamp(berserkT, 0, 1);
    bt = bt * bt * (3 - 2 * bt);
    if (bt > 0.01 && !still) {
      const breathe = 0.75 + Math.sin(state.time * 3) * 0.25;
      g.save();
      g.globalCompositeOperation = 'lighter';
      const ag = g.createRadialGradient(0, -4, 4, 0, -4, 36);
      ag.addColorStop(0, `rgba(255,170,200,${(0.2 * bt).toFixed(3)})`);
      ag.addColorStop(0.6, `rgba(255,190,120,${(0.12 * bt).toFixed(3)})`);
      ag.addColorStop(1, 'rgba(255,180,120,0)');
      g.fillStyle = ag;
      g.beginPath(); g.ellipse(0, -4, 30, 42, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    // 暴走：粉金环绕光点（双椭圆轨道公转，粉金交替；静态概览不画）
    if (bt > 0.01 && !still) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 8; i++) {
        const a = state.time * (1.5 + (i % 2) * 0.6) + i * Math.PI / 4;
        const ox = Math.cos(a) * (20 + Math.sin(state.time * 2 + i) * 3);
        const oy = 12 + Math.sin(a) * (13 + Math.cos(state.time * 1.6 + i) * 3);
        const col = i % 2 ? '255,205,110' : '255,150,195';
        const swell = 0.5 + 0.5 * Math.sin(state.time * 3.2 + i * 1.9);   // 涌动：胀缩相位
        const rr = 3.5 + swell * 1.4;
        const sg2 = g.createRadialGradient(ox, oy, 0, ox, oy, rr);
        sg2.addColorStop(0, `rgba(${col},${((0.38 + swell * 0.2) * bt).toFixed(3)})`);
        sg2.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = sg2;
        g.beginPath(); g.arc(ox, oy, rr, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }

    // 机身主体：蓝色垂直渐变（顶亮 → 底深），非平涂
    const bodyGrd = g.createLinearGradient(0, -24, 0, 16);
    bodyGrd.addColorStop(0, '#f2fbff');
    bodyGrd.addColorStop(0.35, '#d4eeff');
    bodyGrd.addColorStop(0.6, '#7cc4f0');
    bodyGrd.addColorStop(0.85, '#4a9fd8');
    bodyGrd.addColorStop(1, '#2e7ab8');
    g.fillStyle = bodyGrd;
    g.strokeStyle = '#a8e4ff';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, -24);       // 机头
    g.lineTo(6, -6);
    g.lineTo(22 * wingSpread, 10);       // 右翼尖
    g.lineTo(8, 8);
    g.lineTo(5, 15);        // 右尾
    g.lineTo(0, 11);
    g.lineTo(-5, 15);       // 左尾
    g.lineTo(-8, 8);
    g.lineTo(-22 * wingSpread, 10);      // 左翼尖
    g.lineTo(-6, -6);
    g.closePath();
    g.fill();
    g.stroke();

    // 机翼面板线（左右对称细线，增加机械感）
    g.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    g.lineWidth = 0.6;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(sx * 7, -2);
      g.lineTo(sx * 18 * wingSpread, 9);
      g.stroke();
      // 翼根短横线
      g.beginPath();
      g.moveTo(sx * 9, 4);
      g.lineTo(sx * 14 * wingSpread, 7);
      g.stroke();
    }

    // 机头上缘 + 机翼上缘平行光效：沿“机头尖端 → 翼肩 → 翼尖”整条上轮廓略偏外侧的一道淡淡光带
    // （两端渐隐的能量巡光；暴走翼展加宽时光带随之保持平行）
    for (const sx of [-1, 1]) {
      // 上轮廓折线：起点前伸越过机头尖端；末端沿翼上缘方向再延伸 6px（下端更长、越过翼尖）
      const wdx = 22 * wingSpread - 6, wdy = 16, wl = Math.hypot(wdx, wdy);   // 翼上缘方向
      const extX = sx * 22 * wingSpread + wdx / wl * 6, extY = 10 + wdy / wl * 6;
      const pts = [[0, -28], [sx * 6, -6], [sx * 22 * wingSpread, 10], [extX, extY]];
      // 各段外法线（朝机外上方）：由段方向取 y 分量为负（向上）的那条
      const norms = pts.slice(0, -1).map((p, i) => {
        const q = pts[i + 1];
        const dx = q[0] - p[0], dy = q[1] - p[1];
        const l = Math.hypot(dx, dy);
        return [sx * dy / l, -sx * dx / l];
      });
      const off = 3;   // 向外侧偏移量
      // 顶点偏移：起点（中线上）两侧共用同一法线 (0,-1) → 左右光带在机头上方完全重合相接；
      // 翼肩拐点用相邻两段法线的平均 → 光带圆滑折过
      const op = pts.map((p, i) => {
        let n;
        if (i === 0) n = [0, -1];
        else if (i === pts.length - 1) n = norms[norms.length - 1];
        else {
          const mx = norms[i - 1][0] + norms[i][0], my = norms[i - 1][1] + norms[i][1];
          const ml = Math.hypot(mx, my);
          n = [mx / ml, my / ml];
        }
        return [p[0] + n[0] * off, p[1] + n[1] * off];
      });
      const last = op[op.length - 1];
      const lg = g.createLinearGradient(op[0][0], op[0][1], last[0], last[1]);
      lg.addColorStop(0, 'rgba(200, 240, 255, 0.28)');   // 起端保留可见亮度 → 机头尖有光
      lg.addColorStop(0.4, 'rgba(200, 240, 255, 0.4)');
      lg.addColorStop(0.8, 'rgba(200, 240, 255, 0.22)'); // 翼尖段仍保持亮度
      lg.addColorStop(1, 'rgba(200, 240, 255, 0)');
      g.strokeStyle = lg;
      g.lineWidth = 1.6;
      g.shadowColor = '#9fdcff';
      g.shadowBlur = 4;
      g.beginPath();
      g.moveTo(op[0][0], op[0][1]);
      for (let k = 1; k < op.length; k++) g.lineTo(op[k][0], op[k][1]);
      g.stroke();
      g.shadowBlur = 0;
    }

    // 引擎喷口（左右各一个，深蓝色椭圆 + 内发光）
    for (const sx of [-1, 1]) {
      const engGrd = g.createRadialGradient(sx * 4, 14, 0.5, sx * 4, 14, 3.5);
      engGrd.addColorStop(0, '#ffffff');
      engGrd.addColorStop(0.3, '#8adcff');
      engGrd.addColorStop(1, '#1a4a6e');
      g.fillStyle = engGrd;
      g.beginPath();
      g.ellipse(sx * 4, 14, 2.8, 1.8, 0, 0, Math.PI * 2);
      g.fill();
    }

    // 底部两个粉色尾翼三角（稍高、伸出机身；蓝色快速过渡到粉色，粉色区域更大）
    //   整体上移 3px（y: 6/23/15 → 3/20/12）
    for (const sx of [-1, 1]) {
      const finGrd = g.createLinearGradient(sx * 3, 3, sx * 11 * finExtend, 20 * finExtend);
      finGrd.addColorStop(0, '#57d4ff');      // 靠机身：蓝
      finGrd.addColorStop(0.2, '#FFC0CB');    // 更早过渡到粉色
      finGrd.addColorStop(1, '#ff8fa8');      // 尖端：深粉（更有层次）
      g.fillStyle = finGrd;
      g.strokeStyle = 'rgba(255, 192, 203, 0.5)';
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(sx * 3, 3);
      g.lineTo(sx * 11 * finExtend, 20 * finExtend);
      g.lineTo(sx * 3, 12);
      g.closePath();
      g.fill();
      g.stroke();
    }

    // 中央脊线高光：白 → 粉(#FFC0CB)渐变（对称菱形，粉色更浓）
    const spineGrd = g.createLinearGradient(0, -20, 0, 12);
    spineGrd.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
    spineGrd.addColorStop(0.3, 'rgba(255, 240, 245, 0.95)');
    spineGrd.addColorStop(0.55, 'rgba(255, 192, 203, 0.9)');
    spineGrd.addColorStop(1, 'rgba(255, 192, 203, 0)');
    g.fillStyle = spineGrd;
    g.beginPath();
    g.moveTo(0, -20);
    g.lineTo(3.2, -2);
    g.lineTo(2.5, 6);
    g.lineTo(0, 12);
    g.lineTo(-2.5, 6);
    g.lineTo(-3.2, -2);
    g.closePath();
    g.fill();

    // 座舱：白色核心 + 微黑外圈（核心不随机体放大：逆向缩放补偿，保持原尺寸与原位置——
    // 核心在机体上的构图不变，对齐全机型核心位靠上面的整体平移完成）
    g.save();
    if (DS !== 1) g.scale(1 / DS, 1 / DS);
    const cockGrd = g.createRadialGradient(0, -7, 0.5, 0, -7, 5);
    cockGrd.addColorStop(0, '#ffffff');
    cockGrd.addColorStop(0.45, '#ffffff');
    cockGrd.addColorStop(0.7, 'rgba(200, 200, 210, 0.9)');
    cockGrd.addColorStop(1, 'rgba(30, 20, 40, 0.95)');
    g.fillStyle = cockGrd;
    g.beginPath();
    g.arc(0, -7, 3.5, 0, Math.PI * 2);
    g.fill();
    // 座舱外圈黑色描边
    g.strokeStyle = 'rgba(20, 10, 30, 0.8)';
    g.lineWidth = 1;
    g.stroke();
    // 座舱玻璃反光点
    g.fillStyle = 'rgba(255, 255, 255, 0.95)';
    g.beginPath();
    g.ellipse(-0.8, -9, 0.9, 1.4, -0.2, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // 粉色机身装饰线（两侧对称，从机身向翼尖延伸）
    g.strokeStyle = 'rgba(255, 192, 203, 0.6)';
    g.lineWidth = 0.9;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(sx * 3, -2);
      g.lineTo(sx * 10 * wingSpread, 3);
      g.lineTo(sx * 17 * wingSpread, 8);
      g.stroke();
    }
    // 粉色机身点缀（小菱形光点）
    g.fillStyle = 'rgba(255, 160, 180, 0.7)';
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(sx * 6, 0);
      g.lineTo(sx * 7.5, 2);
      g.lineTo(sx * 6, 4);
      g.lineTo(sx * 4.5, 2);
      g.closePath();
      g.fill();
    }

    // ===== 前翼三角片（机翼上方左右各 2 片，共 4 片）：常态即存在 =====
    // 常态：小型前掠三角贴于机翼上方（解决常态机体过素）；暴走：随 spreadT 平滑放大、尖端外扫，
    // 形成醒目的“张机翼”轮廓（全开尺寸较旧版整体 ×0.8 缩小）
    // 动画：尖端位置 / 透明度均随 spreadT（机翼展开进度 0~1）插值，与机翼展开动画同步
    {
      const pulse = still ? 0.8 : 0.7 + Math.sin(state.time * 10) * 0.1;   // still：静态帧冻结（预览图确定性）
      const alpha = pulse * (0.72 + 0.28 * spreadT);   // 常态即高可见（悬于翼上暗色空域），暴走满强度
      g.shadowColor = '#ff69b4';
      g.shadowBlur = 3 + 3 * spreadT;
      for (const sx of [-1, 1]) {
        // 暴走时大型展开翼片：从机翼外缘向外展开的三角形能量片（左右各 4 片，仅暴走出现）
        if (spreadT > 0.01) {
          // 翼片 1（最外）：从翼尖向外上方展开（大三角）
          const tipX1 = sx * 22 * wingSpread;
          const extX1 = tipX1 + sx * 16 * spreadT;
          g.fillStyle = `rgba(255, 80, 160, ${(alpha * 0.8).toFixed(3)})`;
          g.beginPath();
          g.moveTo(tipX1, 4);
          g.lineTo(extX1, 2 - 4 * spreadT);
          g.lineTo(tipX1, 12);
          g.closePath();
          g.fill();

          // 翼片 2（中外）：从翼中外侧向外展开
          const tipX2 = sx * 18 * wingSpread;
          const extX2 = tipX2 + sx * 13 * spreadT;
          g.fillStyle = `rgba(255, 110, 180, ${(alpha * 0.7).toFixed(3)})`;
          g.beginPath();
          g.moveTo(tipX2, 6);
          g.lineTo(extX2, 10 + 2 * spreadT);
          g.lineTo(tipX2, 14);
          g.closePath();
          g.fill();

          // 翼片 3（中内）：从翼中部向外展开
          const tipX3 = sx * 14 * wingSpread;
          const extX3 = tipX3 + sx * 11 * spreadT;
          g.fillStyle = `rgba(255, 140, 200, ${(alpha * 0.65).toFixed(3)})`;
          g.beginPath();
          g.moveTo(tipX3, 7);
          g.lineTo(extX3, 13 + 3 * spreadT);
          g.lineTo(tipX3, 16);
          g.closePath();
          g.fill();

          // 翼片 4（最内）：从翼根外侧向外下方展开（稍小三角）
          const tipX4 = sx * 10 * wingSpread;
          const extX4 = tipX4 + sx * 9 * spreadT;
          g.fillStyle = `rgba(255, 160, 210, ${(alpha * 0.55).toFixed(3)})`;
          g.beginPath();
          g.moveTo(tipX4, 8);
          g.lineTo(extX4, 15 + 3 * spreadT);
          g.lineTo(tipX4, 17);
          g.closePath();
          g.fill();
        }

        // 前翼主片（外侧）：沿机翼斜向伏于翼面（外+下），根部贴机身肩；暴走时沿翼向尖端外扫放大
        const fwRootFx = sx * 9, fwRootFy = -3;
        const fwTipX = sx * (16 + 13.5 * spreadT);    // 尖端 x：常态 16 → 暴走 29.5
        const fwTipY = -5.5 - 2.5 * spreadT;          // 尖端 y：常态 -5.5（高度 +30%）→ 暴走 -8
        const fwRootBx = sx * 15.5 * wingSpread, fwRootBy = 3;
        const fwGrd = g.createLinearGradient(fwRootFx, fwRootFy, fwTipX, fwTipY);
        fwGrd.addColorStop(0, `rgba(255, 245, 252, ${(alpha * 0.95).toFixed(3)})`);  // 根部近白热
        fwGrd.addColorStop(0.4, `rgba(255, 120, 195, ${(alpha * 0.9).toFixed(3)})`);  // 中段亮粉
        fwGrd.addColorStop(1, `rgba(255, 55, 145, ${(alpha * 0.8).toFixed(3)})`);     // 尖端深粉
        g.fillStyle = fwGrd;
        g.beginPath();
        g.moveTo(fwRootFx, fwRootFy);
        g.lineTo(fwTipX, fwTipY);
        g.lineTo(fwRootBx, fwRootBy);
        g.closePath();
        g.fill();
        // 前缘能量刃（高亮描边，强化“张开”锐利感）
        g.strokeStyle = `rgba(255, 235, 248, ${(alpha * 0.95).toFixed(3)})`;
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(fwRootFx, fwRootFy);
        g.lineTo(fwTipX, fwTipY);
        g.stroke();

        // 次前翼片（内侧、靠上一档，与主翼片错位形成两片独立三角）
        const fw2TipX = sx * (11.5 + 9.5 * spreadT);  // 尖端 x：常态 11.5 → 暴走 21
        const fw2TipY = -10.5 - 2 * spreadT;          // 尖端 y：常态 -10.5（高度 +30%）→ 暴走 -12.5
        const fw2Grd = g.createLinearGradient(sx * 6.5, -7.5, fw2TipX, fw2TipY);
        fw2Grd.addColorStop(0, `rgba(255, 210, 235, ${(alpha * 0.75).toFixed(3)})`);
        fw2Grd.addColorStop(1, `rgba(255, 90, 165, ${(alpha * 0.6).toFixed(3)})`);
        g.fillStyle = fw2Grd;
        g.beginPath();
        g.moveTo(sx * 6.5, -7.5);
        g.lineTo(fw2TipX, fw2TipY);
        g.lineTo(sx * 10 * wingSpread, 0.5);
        g.closePath();
        g.fill();
      }
      g.shadowBlur = 0;
    }

    // 翼尖航行灯（左右各一个小亮点）：统一为机翼同款粉色（原为左红 / 右绿航空灯）
    g.shadowBlur = 4;
    g.shadowColor = '#ff69b4';
    g.fillStyle = '#ffc0cb';
    g.beginPath();
    g.arc(-21 * wingSpread, 10, 1.3, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(21 * wingSpread, 10, 1.3, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;

    // 机头尖端高光
    g.fillStyle = 'rgba(255, 255, 255, 0.9)';
    g.beginPath();
    g.moveTo(0, -24);
    g.lineTo(1.5, -19);
    g.lineTo(0, -17);
    g.lineTo(-1.5, -19);
    g.closePath();
    g.fill();
    g.restore();   // 对应函数开头的机体缩放 save（drawScale）
  }

  // '#rrggbb' → 'rgba(r, g, b, a)'（仅演出用本地小工具，色值均来自 ARMORS 注册表的 6 位 hex）
  function hexToRgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a.toFixed(3)})`;
  }

  // 装甲触发图标演出（祈星✧ / 澄月◉ 共用）：核心处字符图标快速渐显 → 明显放大 → 渐隐（0.8s）。
  // 逐帧在机体当前位置绘制（跟核心移动）；受击闪动帧也会调用（祈星在受击时触发，不能被闪烁吞没）。
  // 触发瞬间伴随震屏与受击白闪，故本演出刻意做大做强（30px 字符 + 大光晕 + 扩散环）保证可感知。
  // mode：'pulse' 渐显-放大-渐隐（默认）/ 'flash' 高亮闪现后快速消失（天枢圣卫触发）/
  //       'fade' 原位渐隐不放大（天枢圣卫过期收尾）；hex=true 时以六边环绕轮廓绘制（天枢圣卫常驻图标同构）
  function drawArmorGlyphFx(x, y) {
    for (const f of armorGlyphFx) {
      const p = f.t / f.dur;                        // 0→1
      let a, sc;
      if (f.mode === 'flash') {
        a = 1 - p * 0.85;                           // 满亮度起步，快速衰减（明亮一下然后消失）
        sc = 1 + p * 0.35;                          // 伴随轻微外扩
      } else if (f.mode === 'fade') {
        a = 0.85 * (1 - p);                         // 原位渐隐（常驻环绕图标的收尾形态）
        sc = 1;
      } else {
        const envIn = clamp(p / 0.2, 0, 1);         // 前 20% 渐显
        const envOut = clamp((1 - p) / 0.55, 0, 1); // 后 55% 渐隐
        a = 0.9 * envIn * envOut;
        sc = 0.8 + p * 0.55;                        // 明显放大（0.8 → 1.35）
      }
      ctx.save();
      // hex（天枢圣卫）对准战机视觉核心（coreY 逐机型定义：混乱将至 -7 / 群星之杀 -14），其余装甲对准判定点
      ctx.translate(x, y + (f.hex ? (currentPlane.coreY || 0) : 4));
      // 同色径向光晕（大而亮，保证在震屏/白闪中仍可读）
      const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 28 * sc);
      glow.addColorStop(0, hexToRgba(f.color, a * 0.55));
      glow.addColorStop(0.6, hexToRgba(f.color, a * 0.22));
      glow.addColorStop(1, hexToRgba(f.color, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 28 * sc, 0, Math.PI * 2);
      ctx.fill();
      // 快速外扩的细描边环：一圈"触发脉冲"的直觉反馈
      ctx.globalAlpha = a * 0.5;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 20 + p * 22, 0, Math.PI * 2);
      ctx.stroke();
      if (f.hex) {
        // 六边环绕轮廓（天枢圣卫 ⬡）：与常驻环绕图标同构（半径减半、不旋转）
        ctx.globalAlpha = a;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const ang = k * Math.PI / 3 - Math.PI / 6;
          const px = Math.cos(ang) * 6.5 * sc, py = Math.sin(ang) * 6.5 * sc;
          k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      } else {
        // 字符图标本体
        ctx.globalAlpha = a;
        ctx.font = '30px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = f.color;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 14;
        ctx.fillText(f.glyph, 0, 0);
      }
      ctx.restore();
    }
  }

  function drawPlayer() {
    if (!player.alive) return;
    const { x, y } = player;

    // 许凯狗冲刺：机体前方强烈白色特效（覆盖约 80% 屏宽 + 加法混合 + 持续流动）——
    // 风幕光晕 + 向前推移的弧形风波 + 两侧横掠高速流线 + 向上奔涌的纵向风线
    if (state.pilotDashT > 0) {
      const t = state.time;
      const halfW = CANVAS_W * 0.4;   // 特效横向覆盖约 80% 屏宽
      // 收尾段（dashTail 0.8s）：周身特效整体透明度平滑衰减至 0，逐渐消散而非瞬间消失
      const fxAlpha = Math.min(1, state.pilotDashT / PILOTS.xukaigou.dashTail);
      ctx.save();
      ctx.globalAlpha = fxAlpha;
      ctx.globalCompositeOperation = 'lighter';
      // ① 风幕光晕：机体正前方（上方）的大范围白色亮核光团（呼吸脉动，直径约 80% 屏宽）；
      //    渐变在 85% 半径处衰减至 0，避免椭圆填充边缘出现明显的亮暗分界
      const pulse = 1 + Math.sin(t * 9) * 0.08;
      const gy = ctx.createRadialGradient(x, y - 64, 12, x, y - 64, 192 * pulse);
      gy.addColorStop(0, 'rgba(255, 255, 255, 0.62)');
      gy.addColorStop(0.35, 'rgba(235, 247, 255, 0.32)');
      gy.addColorStop(0.62, 'rgba(228, 244, 255, 0.14)');
      gy.addColorStop(0.85, 'rgba(228, 244, 255, 0)');
      gy.addColorStop(1, 'rgba(228, 244, 255, 0)');
      ctx.fillStyle = gy;
      ctx.beginPath(); ctx.ellipse(x, y - 64, 192 * pulse, 164 * pulse, 0, 0, Math.PI * 2); ctx.fill();
      ctx.lineCap = 'round';
      // ② 弧形风波：白色圆弧自机体前方逐层向外（向上）推移消散，半径/亮度/摆动错落流动（推开空气的波前）
      for (let i = 0; i < 5; i++) {
        const cyc = (t * (2.1 + i * 0.23) + i * 0.31) % 1;
        const rr = 56 + cyc * 226;
        const a = (1 - cyc) * (0.52 - i * 0.05);
        const wob = Math.sin(t * 5 + i * 1.7) * 16;
        ctx.strokeStyle = `rgba(245, 251, 255, ${a.toFixed(3)})`;
        ctx.lineWidth = 3.6 - cyc * 1.8;
        ctx.beginPath();
        ctx.arc(x + wob, y + 16, rr, Math.PI * 1.06, Math.PI * 1.94);
        ctx.stroke();
      }
      // ③ 高速横掠流线：白色长线自机体两侧向外加速掠过（覆盖至 80% 屏宽，长度/高度/速度错落）
      for (let i = 0; i < 18; i++) {
        const seed = i * 61.7;
        const cyc = (t * (3.2 + (i % 4) * 1.1) + seed * 0.017) % 1;
        const ly = y - 8 - ((seed * 7.3) % 196);
        const dir = (i % 2 === 0) ? 1 : -1;
        const lx = x + dir * (12 + ((seed * 3.1) % 118) + cyc * (halfW - 12 - (i % 4) * 22));
        const ln = 38 + ((seed * 5.7) % 78);
        const a = Math.sin(cyc * Math.PI) * 0.88;
        ctx.strokeStyle = `rgba(255, 255, 255, ${a.toFixed(3)})`;
        ctx.lineWidth = 1.7 + (i % 3) * 0.6;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx - dir * ln, ly);
        ctx.stroke();
      }
      // ④ 纵向奔涌风线：细长白线自机体前方高速向上奔涌（体现气流快速流过机身）
      for (let i = 0; i < 10; i++) {
        const seed = i * 97.3;
        const cyc = (t * (3.4 + (i % 3) * 1.3) + seed * 0.013) % 1;
        const lx = x + Math.sin(seed) * (20 + (i % 5) * 32);
        const ly = y - 16 - cyc * 230;
        const ln = 54 + ((seed * 4.3) % 82);
        const a = Math.sin(cyc * Math.PI) * 0.62;
        ctx.strokeStyle = `rgba(240, 249, 255, ${a.toFixed(3)})`;
        ctx.lineWidth = 1.5 + (i % 2) * 0.8;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx, ly + ln);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 斗志昂扬：我方周身白色光辉——加亮光核 + 上升光粒 + 扩散光环 + 环绕光点（最后 1.2s 渐弱）
    if (state.hasteT > 0) {
      const fade = clamp(state.hasteT / 1.2, 0, 1);
      const gp = 0.5 + Math.sin(state.time * 5) * 0.5;

      // ① 光核 + 光晕（加亮）
      const gr = 34 + gp * 7;
      const gg = ctx.createRadialGradient(x, y, 4, x, y, gr);
      gg.addColorStop(0, `rgba(255, 255, 255, ${(0.55 * fade).toFixed(3)})`);
      gg.addColorStop(0.4, `rgba(235, 245, 255, ${(0.22 * fade).toFixed(3)})`);
      gg.addColorStop(1, 'rgba(235, 245, 255, 0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(x, y, gr, 0, Math.PI * 2); ctx.fill();

      // ② 上升光粒：周身不断升起消散的白色小光条（错峰循环）
      ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const sd = i * 47.3;
        const cyc = (state.time * 0.55 + i * 0.147) % 1;
        const px = x + Math.sin(sd) * (16 + (i % 3) * 7);
        const py = y + 16 - cyc * 34;
        const a = Math.sin(cyc * Math.PI) * 0.5 * fade;
        const ln = 3.5 + Math.sin(sd * 2) * 1.6;
        ctx.strokeStyle = `rgba(255, 255, 255, ${a.toFixed(3)})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(px, py + ln); ctx.lineTo(px, py - ln * 0.4); ctx.stroke();
      }

      // ③ 扩散光环：每 1.3s 一道白环自机体向外扩散淡出
      const ringCyc = (state.time % 1.3) / 1.3;
      const rr = 16 + ringCyc * 26;
      ctx.strokeStyle = `rgba(255, 255, 255, ${(0.3 * (1 - ringCyc) * fade).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();

      // ④ 环绕光点：两颗白色光点绕机体公转（带上下浮沉）
      for (const dir of [0, Math.PI]) {
        const oa = state.time * 2.6 + dir;
        const ox = x + Math.cos(oa) * 25;
        const oy = y + Math.sin(oa) * 12 + Math.sin(state.time * 7 + dir) * 3;
        ctx.fillStyle = `rgba(255, 255, 255, ${(0.85 * fade).toFixed(3)})`;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(ox, oy, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // 暴走时翼尖微光（取代原来的金色光环，避免与护盾混淆）——仅 chaos；群星之杀的侧角光已在 paintStarslayer 内绘制
    if (player.weapon === 5 && !currentPlane.slashWeapon) {
      const pulse = 0.3 + Math.sin(state.time * 14) * 0.12;
      ctx.save();
      const wds = currentPlane.drawScale || 1;   // 翼尖光随机体缩放贴住翼尖
      ctx.translate(x, y);
      ctx.translate(0, SHIP_CORE_Y - CHAOS_CORE_LOCAL_Y);   // 随机体整体平移（核心落位对齐）同步位移
      if (wds !== 1) ctx.scale(wds, wds);
      ctx.globalAlpha = pulse;
      ctx.shadowColor = '#ff69b4';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ff69b4';
      // 两侧翼尖点状光芹
      ctx.beginPath();
      ctx.arc(-22, 8, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(22, 8, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 受击无敌（invulnBlink）时每秒隐/显 10 次；登场/重生无敌（invulnBlink=false）不闪动。
    // 闪动帧同样绘制装甲图标演出——祈星在受击时触发，若随闪烁吞没则基本看不见
    const blink = player.invuln > 0 && player.invulnBlink && player.weapon !== 5 && Math.floor(player.invuln * 20) % 2 === 0;
    if (blink) {
      drawArmorGlyphFx(x, y);
      return;
    }

    ctx.save();
    ctx.translate(x, y);
    // 黑暗之手登场阴影掠过击飞：机体自旋演出（恰好 1 整圈，easeOutCubic 收尾——终角 = spinDir×2π 与 0 重合，无 snap；
    // 旋转仅作用于尾焰 + 机身块，判定点白点与受击特效保持不转）
    if (player.spinT > 0) {
      const sp = 1 - player.spinT / (player.spinDur || 1);
      ctx.rotate(player.spinDir * Math.PI * 2 * (1 - Math.pow(1 - sp, 3)));
    }
    // 奖励道具·酒客之影：机体透明化加深（闪避窗口内整机体半透明；剩余 <1.5s 逐渐恢复以便读剩余时间）
    if (state.jiukeT > 0) ctx.globalAlpha = state.jiukeT < 1.5 ? 0.45 + 0.35 * (1 - state.jiukeT / 1.5) : 0.45;

    // 尾焰：粉(#FFC0CB) → 橙渐变（对称，动画）；群星之杀改为蓝→紫能量尾焰
    // 混乱将至机体放大（drawScale）：尾焰随同缩放保持贴住机尾；并随机体整体平移（核心落位对齐）同步位移
    const flame = 9 + Math.sin(state.time * 30) * 3;
    const pds = currentPlane.drawScale || 1;
    ctx.save();
    if (!currentPlane.slashWeapon) ctx.translate(0, SHIP_CORE_Y - CHAOS_CORE_LOCAL_Y);
    if (pds !== 1) ctx.scale(pds, pds);
    const grd = ctx.createLinearGradient(0, 14, 0, 14 + flame + 12);
    if (currentPlane.slashWeapon) {
      grd.addColorStop(0, 'rgba(190, 205, 255, 0.95)');
      grd.addColorStop(0.5, 'rgba(140, 120, 240, 0.6)');
      grd.addColorStop(1, 'rgba(80, 50, 160, 0)');
    } else {
      grd.addColorStop(0, 'rgba(255, 192, 203, 0.95)');
      grd.addColorStop(0.5, 'rgba(255, 150, 190, 0.6)');
      grd.addColorStop(1, 'rgba(255, 90, 40, 0)');
    }
    ctx.fillStyle = grd;
    ctx.beginPath();
    const flW = currentPlane.slashWeapon ? 6.5 : 5;   // 群星之杀尾焰根部增宽（±5 → ±6.5）；混乱将至维持原宽
    ctx.moveTo(-flW, 14);
    ctx.lineTo(0, 14 + flame + 12);
    ctx.lineTo(flW, 14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();   // 尾焰随机体缩放完毕：恢复后再画原尺寸判定相关元素与机身（paintShip 内部自行处理 drawScale）

    // 机身（与选机缩略图共用同一造型，传入展开进度 0~1）
    const spreadPulse = player.wingSpread > 0.9
      ? 1 + Math.sin(state.time * 10) * 0.02 : 1;   // 完全展开后微微脉动
    ctx.scale(spreadPulse, spreadPulse);
    paintShip(ctx, player.wingSpread, currentPlane, player.berserkSpread || 0);

    ctx.restore();

    // 受击闪白：机体泛白 + 红缘光晕（damagePlayer 置位 hitFxT，updatePlayer 衰减）
    if (player.hitFxT > 0) {
      const k = clamp(player.hitFxT / 0.28, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const hf = ctx.createRadialGradient(x, y, 2, x, y, 30);
      hf.addColorStop(0, `rgba(255, 255, 255, ${(0.8 * k).toFixed(3)})`);
      hf.addColorStop(0.5, `rgba(255, 130, 130, ${(0.42 * k).toFixed(3)})`);
      hf.addColorStop(1, 'rgba(255, 60, 70, 0)');
      ctx.fillStyle = hf;
      ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // 装甲触发图标演出（祈星✧ / 澄月◉）：以核心为中心渐显 → 微微放大 → 渐隐。
    // 逐帧在机体当前位置绘制（跟核心移动，不会留在原地）；图层位于核心白点之下、不盖住核心
    drawArmorGlyphFx(x, y);

    // 天枢圣卫：圣守窗口存续期间——白色六边形环绕机体（注册表 ⬡ 图标的轮廓放大版，不旋转，
    // 透明度/尺寸轻微呼吸；图层在核心白点之下）；颜色为纯白（ARMORS.tianshu.hexWhite）；
    // 触发消耗时六边形直接消失（核心处另留 ⬡ 扩散演出）、过期未触发则原位渐隐（见 updatePlayer spawnArmorGlyphFx fade）
    if (currentArmor.id === 'tianshu' && player.tianshuArmedT > 0) {
      const hexWhite = currentArmor.hexWhite || currentArmor.color;
      const pul = 0.55 + Math.sin(state.time * 5) * 0.2;                     // 透明度呼吸
      const breathe = 1 + Math.sin(state.time * 4) * 0.025;                  // 尺寸微呼吸（不旋转）
      ctx.save();
      ctx.translate(x, y + (currentPlane.coreY || 0));
      ctx.globalAlpha = pul;
      ctx.strokeStyle = hexWhite;
      ctx.shadowColor = hexWhite;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const ang = k * Math.PI / 3 - Math.PI / 6;
        const px = Math.cos(ang) * 48 * breathe, py = Math.sin(ang) * 48 * breathe;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // 判定点：机身中心发光白点（下移 4px，真实反映判定范围）
    ctx.save();
    ctx.translate(x, y + 4);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // 量子护盾气泡（绘制于机体/群星之杀刃之上，确保护盾图层最高）
    if (player.shield > 0) {
      const sp = 0.5 + Math.sin(state.time * 10) * 0.2;
      ctx.save();
      ctx.globalAlpha = player.shield < 2 ? sp * (player.shield / 2) : sp;   // 最后 2s 渐弱
      ctx.strokeStyle = '#6fe3ff';
      ctx.shadowColor = '#6fe3ff';
      ctx.shadowBlur = 16;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha *= 0.35;
      ctx.fillStyle = '#6fe3ff';
      ctx.fill();
      ctx.restore();
    }

    // 七日澜心结晶护盾：量子护盾同款气泡样式（粉色 #FFC0CB）+ 律动晶体网格特效，最后 1s 渐弱
    // （消失时另有小范围粉色冲击波——见 10-draw-world crystalBurst，范围对应其 250px 消弹半径）
    if (player.crystalShield > 0) {
      const fade = player.crystalShield < 1 ? player.crystalShield : 1;
      const sp = 0.5 + Math.sin(state.time * 10) * 0.2;   // 与量子护盾同款呼吸脉动
      ctx.save();
      // 气泡：粉色发光圆环 + 淡粉填充（描边/填充结构与量子护盾一致）
      ctx.globalAlpha = fade * sp;
      ctx.strokeStyle = '#FFC0CB';
      ctx.shadowColor = '#FFC0CB';
      ctx.shadowBlur = 16;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = fade * sp * 0.35;
      ctx.fillStyle = '#FFC0CB';
      ctx.fill();
      // 律动晶体网格：两枚三角形反向旋转叠成六芒晶格，线宽与透明度按节律脉动
      ctx.globalAlpha = fade * (0.22 + 0.14 * Math.sin(state.time * 6));
      ctx.lineWidth = 1.2 + Math.sin(state.time * 6) * 0.5;
      ctx.strokeStyle = '#ffd9e2';
      ctx.shadowBlur = 6;
      for (const dir of [1, -1]) {
        const rot = state.time * 0.8 * dir + (dir > 0 ? 0 : Math.PI / 3);
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const a = rot + k * Math.PI * 2 / 3 - Math.PI / 2;
          const px = x + Math.cos(a) * 30, py = y + Math.sin(a) * 30;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }

    // 最终壁垒免死演出：淡金色（#ffb545 系）较粗菱形环绕机体，白黄渐变沿菱形往复流动；
    // 免死无敌不闪动机体，本菱形即无敌指示——无敌期间稳定显示（不提前淡出），
    // 无敌结束后进入 0.35s 收尾：微微扩大（scale 1→1.15）渐隐（07-player updatePlayer 置 bulwarkEndT）
    if (player.bulwarkFxT > 0) {
      const ph = clamp(0.5 + 0.5 * Math.sin(state.time * 2.2), 0, 1);   // 白色高光位置往复滑动（流动感）
      const grad = ctx.createLinearGradient(x, y - 46, x, y + 46);
      grad.addColorStop(0, '#ffb545');
      grad.addColorStop(ph, '#ffffff');
      grad.addColorStop(1, '#ffd98a');
      ctx.save();
      ctx.globalAlpha = 0.85 + Math.sin(state.time * 5) * 0.1;
      ctx.strokeStyle = grad;
      ctx.shadowColor = '#ffb545';
      ctx.shadowBlur = 14;
      ctx.lineWidth = 3.5;
      const breathe = 1 + Math.sin(state.time * 4) * 0.02;   // 微微呼吸
      ctx.beginPath();
      ctx.moveTo(x, y - 46 * breathe);
      ctx.lineTo(x + 32 * breathe, y);
      ctx.lineTo(x, y + 46 * breathe);
      ctx.lineTo(x - 32 * breathe, y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    } else if (player.bulwarkEndT > 0) {
      // 收尾演出：菱形微微扩大渐隐（0.35s，scale 1→1.15、alpha 1→0；时长与 07-player 置位处一致）
      const p = 1 - player.bulwarkEndT / 0.35;              // 0→1
      const sc = 1 + p * 0.15;                              // 微微扩大 15%
      const a = player.bulwarkEndT / 0.35;                  // 渐隐
      const ph = clamp(0.5 + 0.5 * Math.sin(state.time * 2.2), 0, 1);
      const grad = ctx.createLinearGradient(x, y - 46 * sc, x, y + 46 * sc);
      grad.addColorStop(0, '#ffb545');
      grad.addColorStop(ph, '#ffffff');
      grad.addColorStop(1, '#ffd98a');
      ctx.save();
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = grad;
      ctx.shadowColor = '#ffb545';
      ctx.shadowBlur = 14 * a;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(x, y - 46 * sc);
      ctx.lineTo(x + 32 * sc, y);
      ctx.lineTo(x, y + 46 * sc);
      ctx.lineTo(x - 32 * sc, y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // “暴走”字样已移至 render() 顶层绘制（位于所有游戏实体之上，不被子弹/敌机遮挡）
  }

  // 群星之杀：机头直射的淡白锁定光束（不造成伤害，故刻意很淡）——命中目标则止于目标，否则直射至屏顶；
  // 主菜单演示模式（state.demo）无目标时光束止于演示屏顶部，避免穿过 DOM 边框画到标题区
  function drawStarslayerBeam() {
    if (currentPlane.id !== 'starslayer' || !player.alive) return;
    const t = player.slashTarget;
    const noseY = player.y - 23;   // 群星之杀箭形机头（paintStarslayer y=-25，光束从尖端略内出）   // 群星之杀箭形机头尖端（paintStarslayer 造型 y=-32，光束从尖端略内出）
    const yTop = t ? t.y : (state.demo ? DEMO_TOP + 8 : -20);
    if (yTop >= noseY) return;
    const x = player.x;
    const pulse = 0.6 + Math.sin(state.time * 9) * 0.18;
    // 光束沿长度渐变：机头端实色 → 命中端(yTop)透明消隐，避免在命中点生硬截断
    const bg = ctx.createLinearGradient(x, noseY, x, yTop);
    bg.addColorStop(0, STARSLAYER.beamColor);
    bg.addColorStop(0.65, STARSLAYER.beamColor);
    bg.addColorStop(1, 'rgba(234,242,255,0)');
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = bg;
    ctx.shadowColor = STARSLAYER.beamColor;
    // 外发光（极淡）
    ctx.globalAlpha = 0.04 + 0.06 * pulse;
    ctx.shadowBlur = 6;
    ctx.lineWidth = STARSLAYER.beamHalfW * 2.4;
    ctx.beginPath(); ctx.moveTo(x, noseY); ctx.lineTo(x, yTop); ctx.stroke();
    // 内核（淡）
    ctx.globalAlpha = 0.3;
    ctx.shadowBlur = 4;
    ctx.lineWidth = STARSLAYER.beamHalfW * 0.85;
    ctx.beginPath(); ctx.moveTo(x, noseY); ctx.lineTo(x, yTop); ctx.stroke();

    // 命中点处理：仅保留锁定目标处微微的能量汇聚光斑（去掉准星环）；光束末端已渐变消隐，不生硬截断
    if (t) {
      ctx.globalCompositeOperation = 'lighter';
      // 汇聚光斑（柔和辉光，随 pulse 呼吸）——命中点微微的光晕反馈
      const gr = 4.5 + 2 * pulse;
      const gg = ctx.createRadialGradient(x, yTop, 0, x, yTop, gr);
      gg.addColorStop(0, 'rgba(255,255,255,0.5)');
      gg.addColorStop(0.35, 'rgba(210,230,255,0.26)');
      gg.addColorStop(1, 'rgba(180,210,255,0)');
      ctx.globalAlpha = 0.45 + 0.22 * pulse;
      ctx.shadowBlur = 0;
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(x, yTop, gr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // 斩击刀刃形状（局部坐标：长轴沿 y）——顶部收为一个尖角(apex)、向下展宽至底部，
  // 底边为向上凹的弧线（形似“（”顺时针旋转 90°），非直线。w = 底部半宽。
  function bladePath(len, w) {
    const belly = w * 0.62;           // 底边中点上提幅度（凹弧：尾部视觉收束）
    ctx.beginPath();
    ctx.moveTo(0, -len);              // 顶部尖角
    ctx.lineTo(w, len);               // 右缘直边
    ctx.quadraticCurveTo(0, len - belly, -w, len);   // 底边凹弧（尾部收窄）
    ctx.closePath();                  // 左缘回尖角
  }

  // 群星之杀：空间斩击特效——单条顶部尖角、底宽、底边凹弧的斩痕，刀锋自下端(+L)向上端(-L)扫 cut
  // （裁剪逐段显现，非缩放）；尾部先现、逐渐快速浮现；不抖屏，改为斩击位置扩散的发光涟漪环（纯光效，不放大背景）。
  function drawSlashFx() {
    for (const f of slashFx) {
      const a = Math.max(0, f.t / f.max);        // 1→0 渐隐
      const p = 1 - a;                            // 0→1 进度
      const L = f.halfLen * 0.92, W = f.halfW * 0.88;   // 视觉缩小一档（判定不变：halfLen/halfW 仍为原值）
      const edge = f.berserk ? '#ffd44a' : '#8fb8ff';
      // 挥砍推进：尾部(下端)先现，刀锋在 34% 生命周期内自下端(+L)逐渐快速浮现至上端(-L)（不再一次性出现）
      const sweep = Math.min(1, p / 0.34);
      const se = 1 - Math.pow(1 - sweep, 2.0);
      const headY = L - se * 2 * L;               // +L → -L
      const flash = Math.max(0, 1 - p / 0.16);    // 命中瞬间过曝白闪（前 16% 衰减）
      const bend = 0;   // 曲率设定已移除（直线斩痕）                       // 斩痕曲率（与 bladePath 内 bx 同比例）
      const gMid = bend * 0.5;                     // 渐变中心随弯曲脊线整体右移

      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.lineJoin = 'round';

      // ① 单条斩痕：裁剪到 [headY, 底端] 逐段显现，整体随 a 渐隐
      ctx.save();
      ctx.beginPath();
      ctx.rect(-W * 3.4, headY, W * 6.8 + bend * 1.3 + W * 2.4, L * 1.5 - headY);
      ctx.clip();
      // 外辉光
      ctx.globalAlpha = a * 0.55;
      const gGlow = ctx.createLinearGradient(gMid - W * 2.4, 0, gMid + W * 2.4, 0);
      gGlow.addColorStop(0, 'rgba(255,180,60,0)');
      gGlow.addColorStop(0.5, f.berserk ? 'rgba(255,210,110,0.65)' : 'rgba(140,185,255,0.55)');
      gGlow.addColorStop(1, 'rgba(255,180,60,0)');
      ctx.fillStyle = gGlow;
      ctx.shadowColor = edge; ctx.shadowBlur = 30;
      bladePath(L * 1.03, W * 2.0); ctx.fill();
      // 主刀锋：白热核 → 边缘色渐变
      ctx.globalAlpha = a;
      const gCore = ctx.createLinearGradient(gMid - W, 0, gMid + W, 0);
      gCore.addColorStop(0, 'rgba(255,255,255,0)');
      gCore.addColorStop(0.34, edge);
      gCore.addColorStop(0.5, '#ffffff');
      gCore.addColorStop(0.66, edge);
      gCore.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gCore;
      ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 22;
      bladePath(L, W); ctx.fill();
      // 锋刃高亮线（沿刀锋中心）
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2 + 2.2 * a;
      ctx.shadowColor = edge; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.moveTo(0, -L); ctx.quadraticCurveTo(bend * 0.5, 0, bend * 0.95, L - W * 0.3); ctx.stroke();
      ctx.restore();   // 结束裁剪

      // ② 行进中的刀锋头（明亮彗星，仅挥砍期间）
      if (sweep < 1) {
        const headX = bend * ((headY + L) / (2 * L));   // 刀锋头跟随弯曲脊线
        ctx.globalAlpha = Math.min(1, (1 - sweep) * a + 0.25);
        const hg = ctx.createRadialGradient(headX, headY, 0, headX, headY, W * 2.4);
        hg.addColorStop(0, 'rgba(255,255,255,0.98)');
        hg.addColorStop(0.35, f.berserk ? 'rgba(255,225,150,0.72)' : 'rgba(195,225,255,0.68)');
        hg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hg;
        ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 26;
        ctx.beginPath(); ctx.arc(headX, headY, W * 2.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      // ②b 命中过曝白闪：斩击出现瞬间中心炸开的强白光（突然出现的力量感）
      if (flash > 0.01) {
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.globalCompositeOperation = 'lighter';
        const fr = W * (2.6 + 3.6 * (1 - flash));   // 快速膨胀
        const fg = ctx.createRadialGradient(0, 0, 0, 0, 0, fr);
        fg.addColorStop(0, `rgba(255,255,255,${(0.95 * flash).toFixed(3)})`);
        fg.addColorStop(0.4, f.berserk ? `rgba(255,220,130,${(0.6 * flash).toFixed(3)})` : `rgba(205,228,255,${(0.55 * flash).toFixed(3)})`);
        fg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(0, 0, fr, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // ②c 被切中的幸存敌机：闪白 + 贯穿细斩线（跟随敌机当前位置，快速衰减）
      const hf = Math.max(0, 1 - p / 0.2);          // 前 20% 衰减
      if (hf > 0.01 && f.hits) {
        for (const h of f.hits) {
          if (enemies.indexOf(h.ref) < 0) continue;  // 已被移除（击杀）则跳过
          const rad = h.rad;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.translate(h.ref.x, h.ref.y);
          const hgr = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
          hgr.addColorStop(0, `rgba(255,255,255,${(0.9 * hf).toFixed(3)})`);
          hgr.addColorStop(0.55, h.main ? `rgba(215,230,255,${(0.5 * hf).toFixed(3)})` : `rgba(205,180,255,${(0.45 * hf).toFixed(3)})`);
          hgr.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = hgr;
          ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill();
          // 贯穿敌机的细斩线（与斩击同向）
          ctx.rotate(f.rot);
          ctx.globalAlpha = hf;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.shadowColor = edge; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.moveTo(0, -rad); ctx.lineTo(0, rad); ctx.stroke();
          ctx.restore();
        }
      }

      // ③ 空间波动涟漪：纯发光同心环向外扩散（不再自采样放大画布——那会把环内敌人放大成“变大幻象”）。
      // 圆形涟漪与旋转无关，故在未旋转的世界坐标下绘制。
      const TAU = Math.PI * 2;
      const ripP = clamp(p / 0.82, 0, 1);            // 前 82% 生命周期向外扩散（更长可见）
      if (ripP < 1) {
        const bandW = 20;                            // 环带更宽
        for (let i = 0; i < 3; i++) {
          const t = clamp(ripP * 1.15 - i * 0.16, 0, 1);   // 三环错峰扩散
          if (t <= 0.015 || t >= 0.985) continue;
          const rr = 12 + t * L * 2.0;               // 半径更大
          const fade = (1 - t) * a;
          // 纯发光涟漪环（不再自采样放大画布，避免把环内敌人放大成“变大幻象”）
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = f.berserk ? 'rgba(214,190,255,1)' : 'rgba(185,218,255,1)';
          ctx.shadowColor = edge; ctx.shadowBlur = 12;
          ctx.globalAlpha = fade * 0.68;
          ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, TAU); ctx.stroke();
          ctx.globalAlpha = fade * 0.42;
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(f.x, f.y, Math.max(0.5, rr - bandW), 0, TAU); ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  // 炮火先兆者形体：小圆 + 外环 + 左右两条横杠；中心红色随充能从中心扩展、随后灰黑从中心覆盖
  function drawHarbingerBody(e) {
    const TAU = Math.PI * 2;
    const R = 24, RIN = 19, RC = 9;
    const GRAY = '#3a3f4a', DARK = '#22262e', RED = '#ff2b2b';
    const shape = () => {
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, TAU);
      ctx.arc(0, 0, RIN, 0, TAU, true);
      ctx.moveTo(RC, 0); ctx.arc(0, 0, RC, 0, TAU);
      ctx.rect(-22, -2.6, 13, 5.2);
      ctx.rect(9, -2.6, 13, 5.2);
    };
    // 首波：1.5s 变红 + 3s 灰黑覆盖；后续波：2s 变红 + 1s 复位(灰黑覆盖红) + 1.5s 保持全灰黑。两波均 4.5s
    const first = (e.chargeWave || 0) === 0;
    const chargeDur = first ? HARBINGER.chargeFirst : HARBINGER.charge;
    const coverDur = first ? HARBINGER.coverFirst : HARBINGER.reset;
    const t = (e.chargeT || 0) % HARBINGER.cycle;   // 入场即充能：视觉不再等待就位（预览对象无 chargeT 时回退 0）
    const coverR = R + 8;
    let redR = 0, grayR = 0;
    if (t < chargeDur) {
      redR = (t / chargeDur) * coverR;   // 变红：红色从中心扩展
    } else if (t < chargeDur + coverDur) {
      redR = coverR; grayR = ((t - chargeDur) / coverDur) * coverR;   // 复位：灰黑从中心覆盖红
    } else {
      redR = coverR; grayR = coverR;   // 保持灰黑：完全灰静止（仅后续波有此段）
    }
    // 基础灰黑
    shape();
    ctx.fillStyle = GRAY;
    ctx.fill();
    // 裁剪到形体，绘制从中心扩展的红色 / 覆盖的灰黑
    ctx.save();
    shape();
    ctx.clip();
    if (redR > 0) {
      ctx.fillStyle = RED;
      ctx.shadowColor = RED;
      ctx.shadowBlur = redR >= coverR ? 20 : 6;
      ctx.beginPath(); ctx.arc(0, 0, redR, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    }
    if (grayR > 0) {
      ctx.fillStyle = GRAY;
      ctx.beginPath(); ctx.arc(0, 0, grayR, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // 描边勾勒形体
    shape();
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // 威龙形体：俯视四旋翼【重甲】无人机 —— 四角厚环护圈(螺栓) + 内部高速旋翼 + 磨角矩形重装机身(装甲板缝/铆钉/斜切高光/暗底盘) + 纤细炮管(加强环/制退器)；明亮橙黄渐变（黄占比大）

  // 寒霜机体绘制（局部坐标已含 drawScale）：四角平滑圆角矩形旋翼舱 + 灰黑渐变机身 + 天蓝霜纹边缘；
   // 登场 1s 后周身渐显冰蓝寒霜光圈（同心霜环 + 环布雪晶 + 缓慢流转），不绘制炮管（不攻击）
  function drawHanshuangBody(e) {
    const TAU = Math.PI * 2;
    const rx = 15, ry = 13;          // 四角旋翼舱中心偏移（与威龙一致，紧凑重装）
    const DARK = '#23262e', GRAY = '#4a4f5c', LIGHT = '#767e8d';
    const ICE = '#7fd4ff', ICE_SOFT = 'rgba(143, 216, 255, 0.58)';   // 边框霜纹稍暗（避免过亮刺眼）
    const pulse = 0.6 + Math.sin(state.time * 3 + (e.wobble || 0)) * 0.4;

    // ---- 冰蓝寒霜光圈：登场 1s 后渐显（0.8s 渐入），呼吸 + 双向流转霜环 + 环布雪晶 ----
    const ap = clamp((e.auraT - HANSHUANG.auraDelay) / HANSHUANG.auraFadeIn, 0, 1);   // 渐显进度
    if (ap > 0) {
      const ar = HANSHUANG.auraR / ENEMY_TYPES.hanshuang.drawScale;   // 世界半径还原到局部坐标
      ctx.save();
      ctx.globalAlpha *= ap * (0.78 + 0.22 * Math.sin(state.time * 2.2));
      // 主体光环：外缘亮、内部渐透明的径向渐变（冰圈质感）
      const halo = ctx.createRadialGradient(0, 0, ar * 0.30, 0, 0, ar);
      halo.addColorStop(0, 'rgba(143, 216, 255, 0)');
      halo.addColorStop(0.55, 'rgba(143, 216, 255, 0.10)');
      halo.addColorStop(0.82, 'rgba(170, 226, 255, 0.22)');
      halo.addColorStop(0.96, 'rgba(224, 246, 255, 0.30)');
      halo.addColorStop(1, 'rgba(143, 216, 255, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(0, 0, ar, 0, TAU); ctx.fill();
      // 白色雾气：自中心向外喷发的雾团（各雾团错相循环：自中心沿随机方位外扩、边扩散边长大、首尾淡出）
      // + 中心常驻雾核（喷发源头）
      const coreR = ar * 0.34;
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
      core.addColorStop(0, 'rgba(255, 255, 255, 0.20)');
      core.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(0, 0, coreR, 0, TAU); ctx.fill();
      for (let k = 0; k < 8; k++) {
        const cyc = (state.time * 0.20 + k * 0.31) % 1;   // 0→1 循环（各雾团错相，持续喷发）
        const ma = k * TAU / 8 + k * 1.7 + Math.sin(state.time * 0.55 + k * 2.1) * 0.28;   // 方位角（含缓慢摆动）
        const mr = ar * (0.08 + 0.55 * cyc);              // 自中心向外扩散（最远至 0.63R）
        const mrad = ar * (0.09 + 0.21 * cyc);            // 雾团随扩散逐渐变大（最大 0.30R）
        const mistA = Math.sin(cyc * Math.PI) * 0.22;     // 中段最浓、首尾淡出（峰值较旧环内白雾 0.14 更浓）
        const mx = Math.cos(ma) * mr, my = Math.sin(ma) * mr;
        const mist = ctx.createRadialGradient(mx, my, 0, mx, my, mrad);
        mist.addColorStop(0, `rgba(255, 255, 255, ${mistA.toFixed(3)})`);
        mist.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = mist;
        ctx.beginPath(); ctx.arc(mx, my, mrad, 0, TAU); ctx.fill();
      }
      // 喷发雾粒层：自中心沿随机方位喷出的雾粒（确定性伪随机种子——不依赖实体状态，
      // 图鉴预览每帧新建 mock 对象也能保持粒子方位稳定不闪烁；时间驱动外扩+变大，首尾淡出循环再生，
      // 首尾透明度≈0 故循环衔接无跳变）——表现「雾气从中心持续喷出」
      const prand = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
      for (let k = 0; k < 10; k++) {
        const ang0 = prand(k * 3 + 1) * TAU;              // 喷发方位角（逐粒伪随机）
        const spd = 0.34 + prand(k * 3 + 2) * 0.30;       // 外扩速度（占光圈半径比例/秒，最远约 0.34~0.64R）
        const off = prand(k * 3 + 3) * 2.6;               // 出生错相（不同时喷发）
        const sway = (prand(k * 7 + 4) - 0.5) * 1.1;      // 飞行途中方位缓慢摆动幅度
        const life = 1.7 + prand(k * 7 + 5) * 1.0;        // 单次喷发存活时长（s）
        const tt = (state.time + off) % life;
        const pr = tt / life;
        const fade = Math.sin(pr * Math.PI);              // 中段最浓、出生/消散淡出
        const ma = ang0 + Math.sin(state.time * 0.7 + off * 3.1) * sway * 0.5;
        const rr = ar * (0.05 + spd * tt);                // 距中心的喷发距离
        const prad = ar * (0.07 + 0.13 * pr);             // 雾粒随喷发逐渐变大
        const px = Math.cos(ma) * rr, py = Math.sin(ma) * rr;
        const puff = ctx.createRadialGradient(px, py, 0, px, py, prad);
        puff.addColorStop(0, `rgba(255, 255, 255, ${(0.26 * fade).toFixed(3)})`);
        puff.addColorStop(0.6, `rgba(230, 248, 255, ${(0.10 * fade).toFixed(3)})`);
        puff.addColorStop(1, 'rgba(230, 248, 255, 0)');
        ctx.fillStyle = puff;
        ctx.beginPath(); ctx.arc(px, py, prad, 0, TAU); ctx.fill();
      }
      // 外侧虚线霜环（缓慢流转，冰面纹路感）
      ctx.strokeStyle = 'rgba(190, 232, 255, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([14, 10]);
      ctx.lineDashOffset = state.time * 9;
      ctx.beginPath(); ctx.arc(0, 0, ar * 0.84, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      // 内圈霜刺环（替代旧虚线，更有冰晶表现力）：18 根径向冰刺 + 端点冰珠，缓慢正转、长短交错
      ctx.save();
      ctx.rotate(state.time * 0.25);
      ctx.strokeStyle = 'rgba(205, 238, 255, 0.55)';
      ctx.fillStyle = 'rgba(230, 248, 255, 0.8)';
      ctx.lineWidth = 1.1;
      for (let k = 0; k < 18; k++) {
        const ta = k * TAU / 18;
        const r1 = ar * (k % 3 === 0 ? 0.61 : 0.63);   // 每 3 根一根略长（长度减半：0.05/0.03R），制造节奏感
        const r2 = ar * 0.66;
        const cx1 = Math.cos(ta) * r1, cy1 = Math.sin(ta) * r1;
        const cx2 = Math.cos(ta) * r2, cy2 = Math.sin(ta) * r2;
        ctx.beginPath();
        ctx.moveTo(cx1, cy1);
        ctx.lineTo(cx2, cy2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx2, cy2, 1.2, 0, TAU);   // 冰刺端点冰珠
        ctx.fill();
      }
      ctx.restore();
      // 雪晶（6 芒星，环上均布 + 整体缓慢旋转，霜花凝结感）
      ctx.rotate(state.time * 0.35);
      ctx.strokeStyle = 'rgba(226, 246, 255, 0.75)';
      ctx.lineWidth = 1.1;
      for (let k = 0; k < 6; k++) {
        const fa = k * TAU / 6;
        const fx = Math.cos(fa) * ar * 0.92, fy = Math.sin(fa) * ar * 0.92;
        for (let m = 0; m < 6; m++) {
          const ma = m * TAU / 6;
          ctx.beginPath();
          ctx.moveTo(fx, fy);
          ctx.lineTo(fx + Math.cos(ma) * 3.2, fy + Math.sin(ma) * 3.2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // ---- 四条机臂（灰黑重装 + 亮灰高光条）----
    ctx.lineCap = 'round';
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        ctx.strokeStyle = DARK;
        ctx.lineWidth = 6.5;
        ctx.beginPath();
        ctx.moveTo(sx * 6, sy * 5);
        ctx.lineTo(sx * rx, sy * ry);
        ctx.stroke();
        ctx.strokeStyle = GRAY;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx * 6, sy * 5);
        ctx.lineTo(sx * rx, sy * ry);
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';

    // ---- 四角：平滑圆角矩形旋翼舱（灰黑金属 + 天蓝霜纹描边，替代威龙的环状护圈）----
    const pw = 13, ph = 10, pr = 3.2;
    const podPath = () => {
      ctx.beginPath();
      ctx.moveTo(-pw / 2 + pr, -ph / 2);
      ctx.arcTo(pw / 2, -ph / 2, pw / 2, ph / 2, pr);
      ctx.arcTo(pw / 2, ph / 2, -pw / 2, ph / 2, pr);
      ctx.arcTo(-pw / 2, ph / 2, -pw / 2, -ph / 2, pr);
      ctx.arcTo(-pw / 2, -ph / 2, pw / 2, -ph / 2, pr);
      ctx.closePath();
    };
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        ctx.save();
        ctx.translate(sx * rx, sy * ry);
        // 暗底盘（下移一圈制造厚度）
        ctx.save(); ctx.translate(0, 1.4); podPath(); ctx.fillStyle = DARK; ctx.fill(); ctx.restore();
        // 舱体灰黑渐变
        podPath();
        const podGrd = ctx.createLinearGradient(0, -ph / 2, 0, ph / 2);
        podGrd.addColorStop(0, LIGHT);
        podGrd.addColorStop(0.5, GRAY);
        podGrd.addColorStop(1, DARK);
        ctx.fillStyle = podGrd;
        ctx.fill();
        // 舱盖下低速旋转的暗色桨叶剪影（保留无人机身份）
        ctx.save();
        podPath(); ctx.clip();
        ctx.rotate(state.time * 4 + (e.wobble || 0));
        ctx.strokeStyle = 'rgba(18, 20, 26, 0.55)';
        ctx.lineWidth = 1.6;
        for (let b = 0; b < 2; b++) {
          const ba = b * Math.PI;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(ba) * 5.4, Math.sin(ba) * 5.4);
          ctx.stroke();
        }
        ctx.restore();
        // 天蓝霜纹边缘（寒霜能力外露：发光圆角描边）
        podPath();
        ctx.strokeStyle = ICE_SOFT;
        ctx.lineWidth = 1.3;
        ctx.shadowColor = ICE;
        ctx.shadowBlur = 3 + pulse * 2.5;
        ctx.stroke();
        ctx.shadowBlur = 0;
        // 霜白高光点
        ctx.fillStyle = 'rgba(230, 248, 255, 0.9)';
        ctx.beginPath(); ctx.arc(-pw * 0.22, -ph * 0.22, 0.9, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }

    // ---- 中央机身：圆角矩形（灰黑渐变 + 装甲缝 + 天蓝霜纹边缘 + 霜白铆钉）----
    const bw = 25, bh = 30, r = 6;
    const bodyPath = () => {
      ctx.beginPath();
      ctx.moveTo(-bw / 2 + r, -bh / 2);
      ctx.arcTo(bw / 2, -bh / 2, bw / 2, bh / 2, r);
      ctx.arcTo(bw / 2, bh / 2, -bw / 2, bh / 2, r);
      ctx.arcTo(-bw / 2, bh / 2, -bw / 2, -bh / 2, r);
      ctx.arcTo(-bw / 2, -bh / 2, bw / 2, -bh / 2, r);
      ctx.closePath();
    };
    // 暗底盘（装甲厚度）
    ctx.save();
    ctx.translate(0, 1.6);
    bodyPath();
    ctx.fillStyle = DARK;
    ctx.fill();
    ctx.restore();
    // 机身灰黑渐变（上亮灰 → 中灰黑 → 下深黑，顶部受光）
    bodyPath();
    const bodyGrd = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
    bodyGrd.addColorStop(0, '#5a6272');
    bodyGrd.addColorStop(0.45, '#3a3f4c');
    bodyGrd.addColorStop(1, '#20232b');
    ctx.fillStyle = bodyGrd;
    ctx.fill();
    // 装甲板缝 + 斜切受光高光（裁剪到机身内）
    ctx.save();
    bodyPath();
    ctx.clip();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    for (const yy of [-9, 0, 9]) { ctx.beginPath(); ctx.moveTo(-bw / 2, yy); ctx.lineTo(bw / 2, yy); ctx.stroke(); }
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(190, 232, 255, 0.22)';
    for (const yy of [-7.8, 1.2, 10.2]) { ctx.beginPath(); ctx.moveTo(-bw / 2, yy); ctx.lineTo(bw / 2, yy); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(226, 246, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-bw / 2 + 1.5, bh / 2 - 3);
    ctx.lineTo(-bw / 2 + 1.5, -bh / 2 + r);
    ctx.lineTo(bw / 2 - r, -bh / 2 + 1.5);
    ctx.stroke();
    ctx.restore();
    // 天蓝霜纹边缘描边（能力外露：机身边缘天蓝发光）
    bodyPath();
    ctx.strokeStyle = ICE_SOFT;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = ICE;
    ctx.shadowBlur = 4 + pulse * 3;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 霜白铆钉
    ctx.fillStyle = 'rgba(235, 250, 255, 0.85)';
    for (const [rxx, ryy] of [[-9, -12], [9, -12], [-9, 12], [9, 12], [-10.5, -3], [10.5, -3], [-10.5, 6], [10.5, 6]]) {
      ctx.beginPath(); ctx.arc(rxx, ryy, 0.95, 0, TAU); ctx.fill();
    }

    // ---- 冰蓝脉动核心（寒霜反应炉：暗环嵌入 + 发光冰核）----
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, -3.5, 5.8, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#eaf8ff';
    ctx.shadowColor = ICE;
    ctx.shadowBlur = 7 + pulse * 5;
    ctx.beginPath(); ctx.arc(0, -3.5, 4, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = ICE_SOFT;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, -3.5, 5, 0, TAU); ctx.stroke();
  }

  // 御4：防御无人机 —— 介于圆形与正方形之间的超椭圆机体（暖灰渐变）+ “X”形金色条纹指向四角风扇圆 + 中央淡黄反应核
  // （圆心黑、边缘暖灰渐变）+ 登场 0.5s 后展开的金色六边力场（光环内敌人非真实伤害 -30%；金色系与寒霜冰蓝光环强区分）
  // 铁砧（治疗无人机）：菱形黑灰框架 + 中央灰黑正方形 + 上下左右连接横杠 + 中心朝下两条凸出白杠 + 框架白条纹；
  // 登场 0.5s 后展开正方形淡青绿治疗光环（呼吸 + 四角节点）
  function drawAnvilBody(e) {
    const TAU = Math.PI * 2;
    const Dx = 24, Dy = 20;                 // 菱形框架半宽/半高（局部坐标）
    const DARK = '#2b2f38', GRAY = '#4a4f5c', LIGHT = '#767e8d';
    const GREEN = '#8ce36b';
    const pulse = 0.6 + Math.sin(state.time * 2.4 + (e.wobble || 0)) * 0.4;

    // ---- 正方形淡青绿治疗光环：登场 0.5s 后渐显，呼吸 ----
    const ap = clamp((e.auraT - ANVIL.auraDelay) / ANVIL.auraFadeIn, 0, 1);
    if (ap > 0) {
      const ar = ANVIL.auraR / ENEMY_TYPES.anvil.drawScale;   // 世界半边长还原到局部坐标
      ctx.save();
      ctx.globalAlpha *= ap * (0.72 + 0.28 * Math.sin(state.time * 2.1));
      // 极淡青绿内衬
      const inner = ctx.createLinearGradient(0, -ar, 0, ar);
      inner.addColorStop(0, 'rgba(140, 227, 107, 0.10)');
      inner.addColorStop(0.5, 'rgba(140, 227, 107, 0.03)');
      inner.addColorStop(1, 'rgba(140, 227, 107, 0.10)');
      ctx.fillStyle = inner;
      ctx.fillRect(-ar, -ar, ar * 2, ar * 2);
      // 正方形双描边（外亮内暗）
      ctx.strokeStyle = 'rgba(160, 235, 130, 0.55)';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(-ar * 0.97, -ar * 0.97, ar * 1.94, ar * 1.94);
      ctx.strokeStyle = 'rgba(140, 227, 107, 0.26)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-ar * 0.88, -ar * 0.88, ar * 1.76, ar * 1.76);
      // 四角节点亮点（呼吸微光）
      ctx.fillStyle = 'rgba(190, 245, 160, ' + (0.45 + pulse * 0.3).toFixed(3) + ')';
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sx * ar * 0.97, sy * ar * 0.97, 2.2, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    // ---- 内部结构先绘制（横杠/正方形/核心），菱形边框最后盖在其上 ----
    const diaPath = () => {
      ctx.beginPath();
      ctx.moveTo(0, -Dy); ctx.lineTo(Dx, 0); ctx.lineTo(0, Dy); ctx.lineTo(-Dx, 0);
      ctx.closePath();
    };
    // 菱形内腔暗底（横杠与核心的深色背景）
    diaPath();
    ctx.fillStyle = '#20242c';
    ctx.fill();

    // ---- 上下左右连接横杠（中心正方形 → 边框内缘）：线宽降 30%、颜色略偏黑 ----
    ctx.strokeStyle = '#5e6675';
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(0, -Dy + 2);
    ctx.moveTo(0, 9);  ctx.lineTo(0, Dy - 2);
    ctx.moveTo(-9, 0); ctx.lineTo(-Dx + 2, 0);
    ctx.moveTo(9, 0);  ctx.lineTo(Dx - 2, 0);
    ctx.stroke();

    // ---- 中心灰黑正方形 ----
    const sq = 9;
    const coreGrd = ctx.createLinearGradient(0, -sq, 0, sq);
    coreGrd.addColorStop(0, '#565d6b');
    coreGrd.addColorStop(1, '#2b2f38');
    ctx.fillStyle = coreGrd;
    ctx.fillRect(-sq, -sq, sq * 2, sq * 2);
    ctx.strokeStyle = '#15181e';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(-sq, -sq, sq * 2, sq * 2);

    // ---- 中央治疗核心（青绿脉动光斑）----
    ctx.save();
    ctx.shadowColor = GREEN;
    ctx.shadowBlur = 6 + pulse * 5;
    const cGrd = ctx.createRadialGradient(0, 0, 0, 0, 0, 5);
    cGrd.addColorStop(0, '#eaffdd');
    cGrd.addColorStop(0.55, GREEN);
    cGrd.addColorStop(1, 'rgba(140, 227, 107, 0)');
    ctx.fillStyle = cGrd;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, TAU);
    ctx.fill();
    ctx.restore();

    // ---- 菱形黑灰边框（环带收窄；最后绘制，图层高于横杠与核心）----
    const rimT = 7.2;  // 边框厚度（原 12 收窄 40%：环带变细、内缘开口变大）
    ctx.beginPath();
    ctx.moveTo(0, -Dy); ctx.lineTo(Dx, 0); ctx.lineTo(0, Dy); ctx.lineTo(-Dx, 0); ctx.closePath();
    ctx.moveTo(0, -(Dy - rimT)); ctx.lineTo(Dx - rimT, 0); ctx.lineTo(0, Dy - rimT); ctx.lineTo(-(Dx - rimT), 0); ctx.closePath();
    const frameGrd = ctx.createLinearGradient(0, -Dy, 0, Dy);
    frameGrd.addColorStop(0, GRAY);
    frameGrd.addColorStop(0.5, '#333844');
    frameGrd.addColorStop(1, DARK);
    ctx.fillStyle = frameGrd;
    ctx.fill('evenodd');
    // 边框外缘深色描边（勾出金属边）
    ctx.strokeStyle = '#15181e';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, -Dy); ctx.lineTo(Dx, 0); ctx.lineTo(0, Dy); ctx.lineTo(-Dx, 0); ctx.closePath();
    ctx.stroke();
    // 框架白色条纹（沿边框中线）
    const mx = Dx - rimT / 2, my = Dy - rimT / 2;
    ctx.strokeStyle = 'rgba(235, 240, 246, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -my); ctx.lineTo(mx, 0); ctx.lineTo(0, my); ctx.lineTo(-mx, 0);
    ctx.closePath();
    ctx.stroke();

    // ---- 中心朝下两条白杠（折线：上段向内侧 45° 斜、下段竖直；收尾约与菱形底部齐高，绘于边框之上）----
    ctx.save();
    ctx.strokeStyle = '#f2fbff';
    ctx.lineWidth = 2.6;
    ctx.lineJoin = 'round';
    ctx.shadowColor = GREEN;
    ctx.shadowBlur = 3 + pulse * 3;
    ctx.beginPath();
    // 左杠：顶部向右内侧 45° 斜出折点（dx=dy=2），再竖直下行到菱形底部高度
    ctx.moveTo(-4.5, 2); ctx.lineTo(-2.5, 4); ctx.lineTo(-2.5, Dy);
    // 右杠：镜像，顶部向左内侧 45° 斜出折点
    ctx.moveTo(4.5, 2);  ctx.lineTo(2.5, 4);  ctx.lineTo(2.5, Dy);
    ctx.stroke();
    ctx.restore();
  }

  // 破片机体：类铁砧但更小、宽-15%（横向伸缩）、上下半高均较原收窄 30%；灰白金属主导（边框+核心）；
  // 中心两条黑杠（仅下端边缘裹微微一截细红边）；图层最底两根金属灰炮管（前部加粗、位于横杠下方靠外）；飞行时按 faceAng 倾斜朝向
  function drawPopianBody(e) {
    const TAU = Math.PI * 2;
    const Dx = 22, DyT = 13.3;               // 菱形半宽 / 上半高（较原 19 收窄 30%）
    const DyB = 13.3;                        // 下半高（同样较原 19 收窄 30%，与上半一致）
    const STEEL_D = '#8b93a1', STEEL_M = '#c3cad6', STEEL_L = '#eef2f7';
    const RED = '#ff3b30';
    const pulse = 0.6 + Math.sin(state.time * 3.0 + (e.wobble || 0)) * 0.4;

    ctx.save();
    ctx.rotate(e.faceAng || 0);   // 飞行时机身倾斜对齐飞行方向（就位后头部平滑转向玩家方向）
    ctx.scale(0.85, 1);   // 宽度减小 15%（横向伸缩）

    // ---- 机尾小尾焰（图层最底）：随飞行速度显现，减速/急停后熄灭；暖橙小水滴焰带脉动抖动 ----
    const spdF = clamp(Math.hypot(e.vx || 0, e.vy || 0) / POPIAN.speed, 0, 1);
    if (spdF > 0.05) {
      const fl = (8 + pulse * 4) * spdF;            // 焰长随速度与脉动变化
      const fg2 = ctx.createLinearGradient(0, -DyT, 0, -DyT - fl);
      fg2.addColorStop(0, `rgba(255, 170, 80, ${(0.75 * spdF).toFixed(3)})`);
      fg2.addColorStop(0.5, `rgba(255, 120, 50, ${(0.4 * spdF).toFixed(3)})`);
      fg2.addColorStop(1, 'rgba(255, 90, 40, 0)');
      ctx.fillStyle = fg2;
      ctx.beginPath();
      ctx.moveTo(-2.6, -DyT + 1);
      ctx.lineTo(2.6, -DyT + 1);
      ctx.lineTo(0, -DyT - fl);
      ctx.closePath();
      ctx.fill();
    }

    // ---- 图层最底：两根炮管（提亮为可见金属灰，前部加粗，位于横杠下方靠外一点）----
    for (const sx of [-1, 1]) {
      const bx = sx * 6.5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#8f97a3';            // 后段：亮金属灰（原近黑看不清）
      ctx.lineWidth = 3.0;
      ctx.beginPath(); ctx.moveTo(bx, 4); ctx.lineTo(bx, DyB + 2); ctx.stroke();
      ctx.strokeStyle = '#aeb6c2';            // 前部（炮口）加粗、更亮（增粗长度减半：9→4.5）
      ctx.lineWidth = 4.6;
      ctx.beginPath(); ctx.moveTo(bx, DyB - 1); ctx.lineTo(bx, DyB + 3.5); ctx.stroke();
      ctx.strokeStyle = '#3a3f4a';            // 炮口暗孔（点缀层次）
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(bx, DyB + 1.5); ctx.lineTo(bx, DyB + 3.5); ctx.stroke();
    }
    ctx.lineCap = 'butt';

    const diaPath = () => {
      ctx.beginPath();
      ctx.moveTo(0, -DyT); ctx.lineTo(Dx, 0); ctx.lineTo(0, DyB); ctx.lineTo(-Dx, 0);
      ctx.closePath();
    };
    // 菱形内腔暗底
    diaPath();
    ctx.fillStyle = '#2a2e36';
    ctx.fill();

    // ---- 上下左右连接横杠（灰白金属）----
    ctx.strokeStyle = STEEL_D;
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(0, -DyT + 2);
    ctx.moveTo(0, 7);  ctx.lineTo(0, DyB - 2);
    ctx.moveTo(-8, 0); ctx.lineTo(-Dx + 2, 0);
    ctx.moveTo(8, 0);  ctx.lineTo(Dx - 2, 0);
    ctx.stroke();

    // ---- 中心灰白金属正方形核心 ----
    const sq = 8;
    const coreGrd = ctx.createLinearGradient(0, -sq, 0, sq);
    coreGrd.addColorStop(0, STEEL_L);
    coreGrd.addColorStop(1, STEEL_M);
    ctx.fillStyle = coreGrd;
    ctx.fillRect(-sq, -sq, sq * 2, sq * 2);
    ctx.strokeStyle = STEEL_D;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-sq, -sq, sq * 2, sq * 2);
    // 中央红色瞄准核心（脉动光斑，呼应导弹锁定）
    ctx.save();
    ctx.shadowColor = RED;
    ctx.shadowBlur = 5 + pulse * 4;
    const cGrd = ctx.createRadialGradient(0, 0, 0, 0, 0, 4);
    cGrd.addColorStop(0, '#ffd9d4');
    cGrd.addColorStop(0.55, RED);
    cGrd.addColorStop(1, 'rgba(255, 59, 48, 0)');
    ctx.fillStyle = cGrd;
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
    ctx.restore();

    // ---- 菱形灰白金属边框（最后绘制，盖在横杠与核心之上）----
    const rimT = 6.6;
    ctx.beginPath();
    ctx.moveTo(0, -DyT); ctx.lineTo(Dx, 0); ctx.lineTo(0, DyB); ctx.lineTo(-Dx, 0); ctx.closePath();
    ctx.moveTo(0, -(DyT - rimT)); ctx.lineTo(Dx - rimT, 0); ctx.lineTo(0, DyB - rimT); ctx.lineTo(-(Dx - rimT), 0); ctx.closePath();
    const frameGrd = ctx.createLinearGradient(0, -DyT, 0, DyB);
    frameGrd.addColorStop(0, STEEL_L);
    frameGrd.addColorStop(0.5, STEEL_M);
    frameGrd.addColorStop(1, STEEL_D);
    ctx.fillStyle = frameGrd;
    ctx.fill('evenodd');
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -DyT); ctx.lineTo(Dx, 0); ctx.lineTo(0, DyB); ctx.lineTo(-Dx, 0); ctx.closePath();
    ctx.stroke();

    // ---- 中心朝下两条杠：通体黑色，外侧（下端）透出微微红光 ----
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // 先铺一层红色辉光垫底：略长于棍身外端、晕开（较淡）
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.strokeStyle = RED;
    ctx.shadowColor = RED;
    ctx.shadowBlur = 4 + pulse * 3;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(-2.4, DyB - 8); ctx.lineTo(-2.4, DyB - 1.5);
    ctx.moveTo(2.4, DyB - 8);  ctx.lineTo(2.4, DyB - 1.5);
    ctx.stroke();
    ctx.restore();
    ctx.shadowBlur = 0;
    // 再覆盖通体黑色棍身（顶部 45° 斜段 + 竖直杠身，止于 DyB-3）——红光仅从外端边缘微微透出
    ctx.strokeStyle = '#15181e';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-4.2, 2); ctx.lineTo(-2.4, 3.8); ctx.lineTo(-2.4, DyB - 3);
    ctx.moveTo(4.2, 2);  ctx.lineTo(2.4, 3.8);  ctx.lineTo(2.4, DyB - 3);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  // 破片U型机体（诗篇新敌）：与破片（drawPopianBody）同构，五处差异——
  // ① 菱形外框四角短段改红（核心正方形描边同时改红）；② 中心两条杠为黑色底杠 + 黑红渐变流动（红色能量带沿杠身循环下扫）；
  // ③ 炮口暗孔改红；
  // ④ 尾焰不再随机身朝向（faceAng），始终沿移动方向拖尾——U型飞行途中即旋转瞄准玩家，机身朝向与移动方向解耦
  function drawPopianUBody(e) {
    const TAU = Math.PI * 2;
    const Dx = 22, DyT = 13.3;               // 菱形半宽 / 上半高（同破片）
    const DyB = 13.3;                        // 下半高（同破片）
    const STEEL_D = '#8b93a1', STEEL_M = '#c3cad6', STEEL_L = '#eef2f7';
    const RED = '#ff3b30';
    const pulse = 0.6 + Math.sin(state.time * 3.0 + (e.wobble || 0)) * 0.4;

    ctx.save();
    // ---- 机尾小尾焰（图层最底）：独立于机身朝向，局部 +Y 对齐移动方向、焰向 -Y 后方拖尾；减速/急停后熄灭 ----
    const spdF = clamp(Math.hypot(e.vx || 0, e.vy || 0) / POPIAN.speed, 0, 1);
    if (spdF > 0.05) {
      ctx.save();
      ctx.rotate(Math.atan2(e.vy || 0, e.vx || 0) - Math.PI / 2);
      ctx.scale(0.85, 1);
      const fl = (8 + pulse * 4) * spdF;            // 焰长随速度与脉动变化
      const fg2 = ctx.createLinearGradient(0, -DyT, 0, -DyT - fl);
      fg2.addColorStop(0, `rgba(255, 170, 80, ${(0.75 * spdF).toFixed(3)})`);
      fg2.addColorStop(0.5, `rgba(255, 120, 50, ${(0.4 * spdF).toFixed(3)})`);
      fg2.addColorStop(1, 'rgba(255, 90, 40, 0)');
      ctx.fillStyle = fg2;
      ctx.beginPath();
      ctx.moveTo(-2.6, -DyT + 1);
      ctx.lineTo(2.6, -DyT + 1);
      ctx.lineTo(0, -DyT - fl);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.rotate(e.faceAng || 0);   // 飞行途中旋转瞄准玩家（移动方向无关）
    ctx.scale(0.85, 1);   // 宽度减小 15%（横向伸缩，同破片）

    // ---- 图层最底：两根炮管（同破片金属灰，炮口暗孔改红）----
    for (const sx of [-1, 1]) {
      const bx = sx * 6.5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#8f97a3';            // 后段：亮金属灰
      ctx.lineWidth = 3.0;
      ctx.beginPath(); ctx.moveTo(bx, 4); ctx.lineTo(bx, DyB + 2); ctx.stroke();
      ctx.strokeStyle = '#aeb6c2';            // 前部（炮口）加粗、更亮
      ctx.lineWidth = 4.6;
      ctx.beginPath(); ctx.moveTo(bx, DyB - 1); ctx.lineTo(bx, DyB + 3.5); ctx.stroke();
      ctx.strokeStyle = RED;                  // 炮口暗孔（破片为近黑，U型改红）
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(bx, DyB + 1.5); ctx.lineTo(bx, DyB + 3.5); ctx.stroke();
    }
    ctx.lineCap = 'butt';

    const diaPath = () => {
      ctx.beginPath();
      ctx.moveTo(0, -DyT); ctx.lineTo(Dx, 0); ctx.lineTo(0, DyB); ctx.lineTo(-Dx, 0);
      ctx.closePath();
    };
    // 菱形内腔暗底
    diaPath();
    ctx.fillStyle = '#2a2e36';
    ctx.fill();

    // ---- 上下左右连接横杠（灰白金属，同破片）----
    ctx.strokeStyle = STEEL_D;
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(0, -DyT + 2);
    ctx.moveTo(0, 7);  ctx.lineTo(0, DyB - 2);
    ctx.moveTo(-8, 0); ctx.lineTo(-Dx + 2, 0);
    ctx.moveTo(8, 0);  ctx.lineTo(Dx - 2, 0);
    ctx.stroke();

    // ---- 中心灰白金属正方形核心（描边改红——U型标识；破片为灰钢色描边）----
    const sq = 8;
    const coreGrd = ctx.createLinearGradient(0, -sq, 0, sq);
    coreGrd.addColorStop(0, STEEL_L);
    coreGrd.addColorStop(1, STEEL_M);
    ctx.fillStyle = coreGrd;
    ctx.fillRect(-sq, -sq, sq * 2, sq * 2);
    ctx.strokeStyle = RED;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-sq, -sq, sq * 2, sq * 2);
    // 中央红色瞄准核心（脉动光斑，同破片）
    ctx.save();
    ctx.shadowColor = RED;
    ctx.shadowBlur = 5 + pulse * 4;
    const cGrd = ctx.createRadialGradient(0, 0, 0, 0, 0, 4);
    cGrd.addColorStop(0, '#ffd9d4');
    cGrd.addColorStop(0.55, RED);
    cGrd.addColorStop(1, 'rgba(255, 59, 48, 0)');
    ctx.fillStyle = cGrd;
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
    ctx.restore();

    // ---- 菱形灰白金属边框（同破片）----
    const rimT = 6.6;
    ctx.beginPath();
    ctx.moveTo(0, -DyT); ctx.lineTo(Dx, 0); ctx.lineTo(0, DyB); ctx.lineTo(-Dx, 0); ctx.closePath();
    ctx.moveTo(0, -(DyT - rimT)); ctx.lineTo(Dx - rimT, 0); ctx.lineTo(0, DyB - rimT); ctx.lineTo(-(Dx - rimT), 0); ctx.closePath();
    const frameGrd = ctx.createLinearGradient(0, -DyT, 0, DyB);
    frameGrd.addColorStop(0, STEEL_L);
    frameGrd.addColorStop(0.5, STEEL_M);
    frameGrd.addColorStop(1, STEEL_D);
    ctx.fillStyle = frameGrd;
    ctx.fill('evenodd');
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -DyT); ctx.lineTo(Dx, 0); ctx.lineTo(0, DyB); ctx.lineTo(-Dx, 0); ctx.closePath();
    ctx.stroke();
    // U型标识：菱形四角边框短段改红——每角沿两侧邻边各覆盖约 5.5px（角点起、向边内）
    const corners = [[0, -DyT], [Dx, 0], [0, DyB], [-Dx, 0]];
    const segK = 5.5 / Math.hypot(Dx, DyT);
    ctx.strokeStyle = RED;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (const [i, P] of corners.entries()) {
      const Q = corners[(i + 1) % 4], R = corners[(i + 3) % 4];
      ctx.moveTo(P[0], P[1]);
      ctx.lineTo(P[0] + (Q[0] - P[0]) * segK, P[1] + (Q[1] - P[1]) * segK);
      ctx.moveTo(P[0], P[1]);
      ctx.lineTo(P[0] + (R[0] - P[0]) * segK, P[1] + (R[1] - P[1]) * segK);
    }
    ctx.stroke();

    // ---- 中心朝下两条杠：黑色底杠 + 黑红渐变流动（红色能量带沿杠身循环下扫）----
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const BAR_Y0 = 2, BAR_Y1 = DyB - 3;             // 杠身 y 范围（45° 斜段起点 → 竖杠末端）
    const barPath = () => {
      ctx.beginPath();
      ctx.moveTo(-4.2, 2); ctx.lineTo(-2.4, 3.8); ctx.lineTo(-2.4, BAR_Y1);
      ctx.moveTo(4.2, 2);  ctx.lineTo(2.4, 3.8);  ctx.lineTo(2.4, BAR_Y1);
    };
    // 先铺一层暗红宽光晕垫底（细黑杠在暗内腔中保持可读，兼作能量带的底色）
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#6e1712';
    ctx.shadowColor = 'rgba(200, 40, 30, 0.75)';
    ctx.shadowBlur = 2.5;
    ctx.lineWidth = 3.2;
    barPath();
    ctx.stroke();
    ctx.restore();
    // 黑色底杠（覆盖在光晕中央，两侧露出暗红细边）
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#0d0707';
    ctx.lineWidth = 2.6;
    barPath();
    ctx.stroke();
    // 红色能量带下扫：渐变沿 y 方向相位循环——32px/s，约 0.55s 扫过一条杠
    const span = BAR_Y1 - BAR_Y0, half = 4.0, cycle = span + half * 2;
    const cy = BAR_Y0 - half + (state.time * 32) % cycle;
    const flow = ctx.createLinearGradient(0, cy - half, 0, cy + half);
    flow.addColorStop(0, 'rgba(255, 59, 48, 0)');
    flow.addColorStop(0.35, 'rgba(212, 42, 34, 0.55)');
    flow.addColorStop(0.5, 'rgba(255, 112, 92, 0.95)');
    flow.addColorStop(0.65, 'rgba(212, 42, 34, 0.55)');
    flow.addColorStop(1, 'rgba(255, 59, 48, 0)');
    ctx.strokeStyle = flow;
    ctx.shadowColor = 'rgba(255, 60, 45, 0.9)';
    ctx.shadowBlur = 5;
    barPath();
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  // 法术矩阵机体：竖菱形（高为宽 1.8 倍）—— 白红渐变外体 + 一圈很细的黑色菱形环 + 环内亮白红渐变核心
  function drawFashiMatrixBody(e) {
    const AW = 13, AH = AW * 1.8;   // 外层菱形半宽 / 半高（高=宽×1.8；配 drawScale 1.02 → 视觉 ≈26.5×47.7，匹配碰撞盒 27×48）
    const pulse = 0.6 + Math.sin(state.time * 3.2 + (e.wobble || 0)) * 0.4;
    // 菱形路径 helper：k=1 为外层，向内按比例缩放
    const dia = (k) => {
      ctx.beginPath();
      ctx.moveTo(0, -AH * k); ctx.lineTo(AW * k, 0); ctx.lineTo(0, AH * k); ctx.lineTo(-AW * k, 0);
      ctx.closePath();
    };

    ctx.save();
    ctx.rotate(e.rot || 0);   // 机体本体自旋（菱形绕中心旋转；旋转的是机体而非发射的正方体）
    // ---- 外层白红渐变机体（环外侧仍是白红色）+ 外发光 ----
    ctx.shadowColor = 'rgba(255, 90, 110, 0.9)';
    ctx.shadowBlur = 10 + pulse * 6;
    const bodyGrd = ctx.createLinearGradient(0, -AH, 0, AH);
    bodyGrd.addColorStop(0, '#fff2f2');
    bodyGrd.addColorStop(0.5, '#ff9a9a');
    bodyGrd.addColorStop(1, '#ff4d5e');
    dia(1);
    ctx.fillStyle = bodyGrd;
    ctx.fill();
    ctx.shadowBlur = 0;
    // 外缘白细描边（提亮轮廓）
    dia(1);
    ctx.strokeStyle = 'rgba(255, 240, 240, 0.85)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // ---- 核心外一圈很细的黑色菱形环（不要太厚）----
    dia(0.6);
    ctx.strokeStyle = 'rgba(12, 7, 9, 0.92)';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // ---- 核心：亮白红色径向渐变 + 脉动发光 ----
    ctx.save();
    ctx.shadowColor = '#ff5566';
    ctx.shadowBlur = 6 + pulse * 5;
    const coreGrd = ctx.createRadialGradient(0, 0, 0, 0, 0, AH * 0.5);
    coreGrd.addColorStop(0, '#ffffff');
    coreGrd.addColorStop(0.5, '#ffd6d6');
    coreGrd.addColorStop(1, '#ff5566');
    dia(0.5);
    ctx.fillStyle = coreGrd;
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  // 脉冲矩阵造型（2026-09-30 拓扑定稿，测试3 页五档全实装；2026-10-02 配色改版暗红流光）：三座法术矩阵
  //   菱形「骑边拼合」——每座长对角线恰好骑在等边三角形的一条边上（矩阵中心=边中点），6 个长轴端点
  //   两两重合于三角形 3 个顶点（拼合连接点）；短轴沿边法线：外 B 尖朝外鼓出、内 B 尖朝中心。
  //   机体为暗红系渐变（内深红 → 外亮红），菱形表面有两道沿长轴循环漂移、带宽起伏的亮红光带（不规则流动感）。
  // 五档充能表现（纯视觉）：每个攻击周期循环一遍——闭合（ratio 0.45）随充能进度逐档张开
  //   （0.42/0.39/0.36）到全开露出核心（0.33）；释放瞬间保持全开，随后随冲击波扩散（0.45s）
  //   平滑回缩闭合、开始下一轮充能。充能进度 p = 1 - fireTimer / pmCycleIv（周期时长由
  //   04-spawn 出生 / 06-enemy 释放时记录）；档位间保留 25% 时长线性过渡带（≈0.11s），全程无跳变。
  // 本体自转（e.rot，转速与法术矩阵等同）；
  // 脉冲预警：释放前 0.6s 微微红圈收缩（半径由 pulseR 收缩到 0，按 fireTimer 剩余值推导）；
  // 释放瞬间：自身略微放大（正弦鼓包动效，pmScaleT）+ 暗红冲击波扩散（pmWaveT，双波纹增强）
  //   + 短命暗红烟雾残留（pmSmokeT）——计时器见 06-enemy updateEnemyFire
  function drawPulseMatrixBody(e) {
    const R = 44;   // 等边三角形外接半径 = 顶点距中心（外轮廓半径；外 B 尖略短于 R）
    const CHARGE = [0.45, 0.42, 0.39, 0.36, 0.33];   // 五档充能 ratio（短半轴/长半轴；测试3 页 P2 系列：闭合→全开）
    // 充能进度 p（0 闭合 → 1 全开）→ 目标 ratio：五档阶梯 + 档间 25% 时长线性过渡带（无跳变）
    const chargeRatio = p => {
      const stage = Math.min(4, Math.max(0, Math.floor(p * 5)));
      const frac = p * 5 - stage;
      if (stage === 0 || frac >= 0.25) return CHARGE[stage];
      return CHARGE[stage - 1] + (CHARGE[stage] - CHARGE[stage - 1]) * (frac / 0.25);
    };
    // 当前 ratio：正常按充能进度推导；释放后过渡期（pmWaveT）从全开平滑回缩到当期进度值（衔接连续）
    let ratio;
    const iv = e.pmCycleIv || PULSE_MATRIX.fireInterval;
    if ((e.pmWaveT || 0) > 0) {
      const rec = e.pmWaveT / PULSE_MATRIX.pulseWaveDur;   // 1 → 0
      const pFlow = clamp(PULSE_MATRIX.pulseWaveDur * (1 - rec) / iv, 0, 1);
      ratio = chargeRatio(pFlow) + (CHARGE[4] - chargeRatio(pFlow)) * rec;
    } else if (e.leaving || e.fireTimer == null) {
      ratio = CHARGE[0];   // 离场 / 计时未初始化：闭合
    } else {
      ratio = chargeRatio(clamp(1 - e.fireTimer / iv, 0, 1));
    }
    const charge = clamp((CHARGE[0] - ratio) / (CHARGE[0] - CHARGE[4]), 0, 1);   // 充能量 0~1（核心亮度联动）
    const pulse = 0.6 + Math.sin(state.time * 3.2 + (e.wobble || 0)) * 0.4;
    // 释放瞬间放大动效：pmScaleT 由满到 0，正弦鼓包（放大后回缩，纯动效不影响碰撞盒）
    let scale = 1;
    if ((e.pmScaleT || 0) > 0) {
      const q = 1 - e.pmScaleT / PULSE_MATRIX.scaleBumpDur;
      scale = 1 + PULSE_MATRIX.scaleBump * Math.sin(q * Math.PI);
    }
    ctx.save();
    ctx.scale(scale, scale);
    // 自爆倒计时颤动（2026-10-02）：登场 17s 起微微颤动（~1.2px）、19s 起明显颤动（~3px）——
    // 高频 sin 组合确定性抖动（无随机闪跳），机体坐标系整体位移（特效随动）
    const ageT = e.pmAgeT || 0;
    if (ageT >= 17) {
      const amp = ageT >= 19 ? 3 : 1.2;
      const sh = amp * (0.6 + 0.4 * Math.sin(state.time * 2.1));
      ctx.translate(Math.sin(state.time * 47) * sh, Math.cos(state.time * 39) * sh * 0.8);
    }
    // 暗红收缩预警圈：释放前 0.6s 半径由外圈收缩到核心（微微透明；出生即计时，入场途中同样预警）；
    // 半径按「即将释放的波」推算——自爆模式下预告 160px 自爆波
    if (e.fireTimer != null && e.fireTimer > 0 && e.fireTimer <= PULSE_MATRIX.warnTime) {
      const wp = 1 - e.fireTimer / PULSE_MATRIX.warnTime;   // 0→1 收缩进度
      const nextR = e.pmSelfDestruct ? PULSE_MATRIX.selfDestructR : PULSE_MATRIX.pulseR;
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = '#ff2233';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, nextR * (1 - wp) + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 暗红冲击波（2026-10-02 增强）：主波更粗带辉光 + 半径滞后的次级波纹，波动层次更汹涌
    // （扩散目标半径 e.pmWaveR：普通波 132 / 自爆波 160，未释放过时兜底 pulseR）
    if ((e.pmWaveT || 0) > 0) {
      const waveR = e.pmWaveR || PULSE_MATRIX.pulseR;
      const wp = 1 - e.pmWaveT / PULSE_MATRIX.pulseWaveDur;
      const ease = 1 - Math.pow(1 - wp, 2);
      const rr = 18 + ease * (waveR - 18);
      ctx.save();
      ctx.shadowColor = '#ff2038';
      ctx.shadowBlur = 14;
      ctx.globalAlpha = (1 - wp) * 0.9;
      ctx.strokeStyle = '#a01828';
      ctx.lineWidth = 18 * (1 - wp) + 6;   // 主波：显著增宽的波前
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = (1 - wp) * 0.45;   // 次级波纹：半径略滞后、更细更淡
      ctx.lineWidth = 5 * (1 - wp) + 2;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(4, rr - 22), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // 暗红雾气（2026-10-02）：震荡波扫过之处留下短命暗红雾——
    //   ① 区域雾：雾区半径跟随震荡波扩散（波到哪雾铺到哪），波扩完后整体渐隐消散；
    //   ② 波前浓雾环：贴着当前波半径的环形浓雾，随波推进；③ 数团烟尘自波圈内漂散上浮（不规则感）
    if ((e.pmSmokeT || 0) > 0) {
      const sp = 1 - e.pmSmokeT / PULSE_MATRIX.smokeDur;   // 0→1 消散进度
      const elapsed = PULSE_MATRIX.smokeDur - e.pmSmokeT;
      // 雾区半径 = 震荡波扩散曲线在 elapsed 时刻的半径（与冲击波同 ease），波扩完后固定在脉冲半径
      const wprog = Math.min(1, elapsed / PULSE_MATRIX.pulseWaveDur);
      const wr = 18 + (1 - Math.pow(1 - wprog, 2)) * ((e.pmWaveR || PULSE_MATRIX.pulseR) - 18);
      // ① 区域雾（震荡过的地方整体蒙一层，随消散进度渐隐）
      const fogA = 0.26 * (1 - sp);
      if (fogA > 0.01) {
        const fog = ctx.createRadialGradient(0, 0, wr * 0.2, 0, 0, wr);
        fog.addColorStop(0, `rgba(112, 22, 34, ${fogA * 0.45})`);
        fog.addColorStop(0.7, `rgba(112, 22, 34, ${fogA})`);
        fog.addColorStop(1, 'rgba(112, 22, 34, 0)');
        ctx.fillStyle = fog;
        ctx.beginPath();
        ctx.arc(0, 0, wr, 0, Math.PI * 2);
        ctx.fill();
      }
      // ② 波前浓雾环（波扩散期间贴波推进；波扩完后随余雾渐隐）
      const ringA = 0.34 * Math.min(1 - sp, 1 - wprog * 0.6);
      if (ringA > 0.01) {
        const ring = ctx.createRadialGradient(0, 0, Math.max(0, wr - 20), 0, 0, wr + 12);
        ring.addColorStop(0, 'rgba(112, 22, 34, 0)');
        ring.addColorStop(0.6, `rgba(130, 26, 40, ${ringA})`);
        ring.addColorStop(1, 'rgba(112, 22, 34, 0)');
        ctx.fillStyle = ring;
        ctx.beginPath();
        ctx.arc(0, 0, wr + 12, 0, Math.PI * 2);
        ctx.fill();
      }
      // ③ 漂散烟尘：方位由机体种子 + 低频 sin 摆动决定（逐帧确定性无抖动）
      const seed = (e.wobble || 0) * 10;
      for (let i = 0; i < 6; i++) {
        const a = seed + i * 1.047 + Math.sin(state.time * 0.9 + i * 2.3) * 0.35;
        const dist = wr * (0.45 + (i % 3) * 0.18);
        const sx = Math.cos(a) * dist;
        const sy = Math.sin(a) * dist - sp * 14;
        const sr = 8 + (i % 3) * 3 + sp * 16;
        const g2 = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
        g2.addColorStop(0, `rgba(112, 22, 34, ${0.34 * (1 - sp)})`);
        g2.addColorStop(1, 'rgba(112, 22, 34, 0)');
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 三座菱形骑边拼合 + 本体自转：每座菱形四顶点 = 长轴两端 A（= 三角形顶点，两两重合）
    // + 外 B 尖（朝外）+ 内 B 尖（朝中心）；填充沿内 B → 外 B 渐变（暗红回调版：内红中玫外浅粉红）
    ctx.rotate(e.rot || 0);
    const L = Math.sqrt(3) * R;   // 三角形边长 = 菱形长对角线（L 恰为边长时 6 个 A 点两两重合）
    const AH = L / 2;
    for (const aDeg of [-90, 30, 150]) {   // 三条边中点方位（屏幕 y 向下）：上 / 右下 / 左下
      const a = aDeg * Math.PI / 180;
      const ux = Math.cos(a + Math.PI / 2), uy = Math.sin(a + Math.PI / 2);   // 长轴切向
      const vx = Math.cos(a), vy = Math.sin(a);                               // 短轴法线（朝三角形外）
      const cx = vx * R / 2, cy = vy * R / 2;                                 // 矩阵中心 = 边中点（距中心 R/2）
      const AW = AH * ratio;
      const boX = cx + vx * AW, boY = cy + vy * AW;      // 外 B 尖（朝外鼓出）
      const biX = cx - vx * AW, biY = cy - vy * AW;      // 内 B 尖（朝中心，闭合档三尖近汇于一点）
      // 机体配色（2026-10-02 二次回调：暗红但不压抑）——内红中玫外浅粉红，明显亮于暗红初版；
      // 流动光带反向压暗：非常暗红的深色光带在偏亮机体上流动（暗红光芒感）
      const grd = ctx.createLinearGradient(biX, biY, boX, boY);
      grd.addColorStop(0, '#b82030');
      grd.addColorStop(0.5, '#d0404a');
      grd.addColorStop(1, '#ee8f8f');
      ctx.beginPath();
      ctx.moveTo(cx + ux * AH, cy + uy * AH); ctx.lineTo(boX, boY);
      ctx.lineTo(cx - ux * AH, cy - uy * AH); ctx.lineTo(biX, biY);
      ctx.closePath();
      ctx.shadowColor = 'rgba(230, 60, 78, 0.8)';
      ctx.shadowBlur = 8 + pulse * 5;
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(240, 150, 152, 0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // 暗红光芒不规则流动（2026-10-02 新增）：裁剪在菱形内、沿长轴循环漂移的两道非常暗红的光带——
      // 双带速度错拍 + 带宽随低频 sin 起伏（多频叠加 → 无规则流动感）；相位含机体种子，逐台不同
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx + ux * AH, cy + uy * AH); ctx.lineTo(boX, boY);
      ctx.lineTo(cx - ux * AH, cy - uy * AH); ctx.lineTo(biX, biY);
      ctx.closePath();
      ctx.clip();
      const seed2 = (e.wobble || 0) * 7;
      for (let b = 0; b < 2; b++) {
        const flow = (state.time * (0.06 + b * 0.025) + seed2 * 0.13 + b * 0.47) % 1;   // 沿长轴 0→1 循环（大幅减速：单程约 11~17s，2026-10-02 由 0.26/0.37 降速）
        const fc = -AH + flow * 2 * AH;   // 光带中心（-AH→AH）
        const fw = 9 + Math.sin(state.time * 1.7 + b * 2.1 + seed2) * 5;   // 带宽起伏（不规则）
        ctx.strokeStyle = b === 0 ? 'rgba(118, 10, 22, 0.55)' : 'rgba(88, 6, 16, 0.42)';
        ctx.lineWidth = Math.max(2, fw * 2);
        ctx.beginPath();
        ctx.moveTo(cx + ux * (fc - AH * 0.35) - vx * AW, cy + uy * (fc - AH * 0.35) - vy * AW);
        ctx.lineTo(cx + ux * (fc + AH * 0.35) + vx * AW, cy + uy * (fc + AH * 0.35) + vy * AW);
        ctx.stroke();
      }
      ctx.restore();
      // 内细黑菱形环（法术矩阵同款，中心在边中点）
      ctx.beginPath();
      ctx.moveTo(cx + ux * AH * 0.5, cy + uy * AH * 0.5); ctx.lineTo(cx + vx * AW * 0.6, cy + vy * AW * 0.6);
      ctx.lineTo(cx - ux * AH * 0.5, cy - uy * AH * 0.5); ctx.lineTo(cx - vx * AW * 0.6, cy - vy * AW * 0.6);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(12, 7, 9, 0.92)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    // 中央暗红核心（覆盖三内 B 尖交汇处；充能越满呼吸越亮，全开档核心外露感最强）——
    // 竖直菱形、不随本体自转（2026-10-02：反向旋转抵消本体 rotate，保持屏幕正立朝向；配色不变），
    // 周身环绕一圈暗红雾气：径向渐变雾晕自核心边缘向外消散，随呼吸微微涨落
    ctx.rotate(-(e.rot || 0));
    const fogR = 34 + pulse * 3 + charge * 4;
    const aura = ctx.createRadialGradient(0, 0, 12, 0, 0, fogR);
    aura.addColorStop(0, 'rgba(150, 18, 32, 0.38)');
    aura.addColorStop(0.55, 'rgba(130, 16, 28, 0.20)');
    aura.addColorStop(1, 'rgba(112, 14, 24, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(0, 0, fogR, 0, Math.PI * 2); ctx.fill();
    const coreGrd = ctx.createRadialGradient(0, 0, 0, 0, 0, 15);
    coreGrd.addColorStop(0, '#7a1020');
    coreGrd.addColorStop(1, '#3a0810');
    ctx.shadowColor = '#a01828';
    ctx.shadowBlur = 6 + pulse * 4 + charge * 5;
    ctx.fillStyle = coreGrd;
    ctx.beginPath();
    ctx.moveTo(0, -17); ctx.lineTo(11, 0); ctx.lineTo(0, 17); ctx.lineTo(-11, 0);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
    ctx.beginPath();   // 清空路径：尾部公共 fill/stroke 空跑（本体已在分支内绘制完毕）
  }

  // 法术阵列造型：三座法术矩阵样式的菱形 + 灰黑底座——
  //   中央菱形较大、血红色（带血红流动特效：循环移动的亮红光带 + 沿边缘流动的亮红虚线），
  //   两侧较小菱形保持矩阵白红配色、与中央成 ±0.45 rad 夹角；底座为灰黑色磨角装甲平台
  function drawFashiArrayBody(e) {
    const T = state.time;
    const pulse = 0.6 + Math.sin(T * 3.2 + (e.wobble || 0)) * 0.4;

    // ---- 血红雾气：到达悬停位置（arrived）后周身散发（0.8s 渐显）——大范围辉光 + 绕体漂移的雾团 ----
    const ap = clamp((e.auraT || 0) / 0.8, 0, 1);
    if (ap > 0) {
      ctx.save();
      ctx.globalAlpha *= ap;
      const mist = ctx.createRadialGradient(0, 0, 6, 0, 0, 42);
      mist.addColorStop(0, 'rgba(200, 24, 46, 0.16)');
      mist.addColorStop(0.6, 'rgba(170, 20, 40, 0.10)');
      mist.addColorStop(1, 'rgba(150, 16, 36, 0)');
      ctx.fillStyle = mist;
      ctx.beginPath(); ctx.arc(0, 0, 42, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 6; k++) {
        const seed = k * 2.399;
        const a = seed + T * (0.35 + (k % 3) * 0.14) * (k % 2 ? 1 : -1);
        const rr = 16 + 9 * Math.sin(T * 0.6 + seed * 1.7);
        const mx = Math.cos(a) * rr, my = Math.sin(a * 0.8 + seed) * rr * 0.75;
        const mr = Math.max(1, 7 + 3.5 * Math.sin(T * 0.9 + seed));
        const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
        mg.addColorStop(0, 'rgba(225, 40, 66, 0.20)');
        mg.addColorStop(1, 'rgba(190, 24, 48, 0)');
        ctx.fillStyle = mg;
        ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // ---- 黑雾：入场/退场阶段底座散发出诡异的浓厚黑雾（mistI 1→0，到位后已生成的雾逐渐消散）----
    const mi = e.mistI || 0;
    if (mi > 0.02) {
      ctx.save();
      // 底座周围大范围近实心暗雾底（深色背景上仍清晰可辨）
      const fog = ctx.createRadialGradient(0, 12, 4, 0, 12, 50);
      fog.addColorStop(0, `rgba(1, 2, 6, ${(0.85 * mi).toFixed(3)})`);
      fog.addColorStop(0.5, `rgba(3, 4, 10, ${(0.55 * mi).toFixed(3)})`);
      fog.addColorStop(0.8, `rgba(16, 10, 30, ${(0.3 * mi).toFixed(3)})`);
      fog.addColorStop(1, 'rgba(20, 14, 36, 0)');
      ctx.fillStyle = fog;
      ctx.beginPath(); ctx.arc(0, 12, 50, 0, Math.PI * 2); ctx.fill();
      // 翻滚雾团：10 团绕底座游移、向上升腾的重黑雾（不同速异相 + 紫黑边缘，读作"诡异"）
      for (let k = 0; k < 10; k++) {
        const seed = k * 2.399 + 1.3;
        const ang = seed + T * (0.5 + (k % 3) * 0.22) * (k % 2 ? 1 : -1);
        const rr = 14 + 11 * Math.sin(T * 0.7 + seed * 2.1);
        const mx = Math.cos(ang) * rr * 1.2;
        const my = 10 + Math.sin(T * (0.8 + (k % 2) * 0.3) + seed * 3.1) * 10 - (k % 3) * 7;
        const mr = Math.max(2, 12 + 5 * Math.sin(T * 1.1 + seed));
        const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
        mg.addColorStop(0, `rgba(1, 2, 6, ${(0.72 * mi).toFixed(3)})`);
        mg.addColorStop(0.6, `rgba(6, 4, 14, ${(0.42 * mi).toFixed(3)})`);
        mg.addColorStop(0.85, `rgba(34, 22, 60, ${(0.18 * mi).toFixed(3)})`);
        mg.addColorStop(1, 'rgba(40, 26, 70, 0)');
        ctx.fillStyle = mg;
        ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // ---- 召唤红光闪动：每 4s 召唤法术矩阵时周身红光快速闪一下（summonFlash 0.3→0）----
    if (e.summonFlash > 0) {
      const fp = e.summonFlash / FASHI_ARRAY.summonFlashDur;   // 1→0
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const sfg = ctx.createRadialGradient(0, 0, 4, 0, 0, 46);
      sfg.addColorStop(0, `rgba(255, 70, 92, ${(0.45 * fp).toFixed(3)})`);
      sfg.addColorStop(0.6, `rgba(220, 30, 52, ${(0.22 * fp).toFixed(3)})`);
      sfg.addColorStop(1, 'rgba(190, 20, 44, 0)');
      ctx.fillStyle = sfg;
      ctx.beginPath(); ctx.arc(0, 0, 46, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // 菱形绘制 helper（局部坐标，仿 drawFashiMatrixBody 的分层结构）
    const diamond = (aw, ah, grd, ringAlpha, coreMid, coreEdge) => {
      const dia = (k) => {
        ctx.beginPath();
        ctx.moveTo(0, -ah * k); ctx.lineTo(aw * k, 0); ctx.lineTo(0, ah * k); ctx.lineTo(-aw * k, 0);
        ctx.closePath();
      };
      ctx.shadowColor = 'rgba(255, 90, 110, 0.9)';
      ctx.shadowBlur = 8;
      dia(1); ctx.fillStyle = grd; ctx.fill();
      ctx.shadowBlur = 0;
      dia(1); ctx.strokeStyle = 'rgba(255, 240, 240, 0.85)'; ctx.lineWidth = 1; ctx.stroke();
      dia(0.6); ctx.strokeStyle = `rgba(12, 7, 9, ${ringAlpha})`; ctx.lineWidth = 1.2; ctx.stroke();
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, ah * 0.5);
      cg.addColorStop(0, '#ffffff');
      cg.addColorStop(0.5, coreMid);
      cg.addColorStop(1, coreEdge);
      dia(0.5); ctx.fillStyle = cg; ctx.fill();
    };

    // ---- 本体震动：入场阶段（黑雾缭绕时）机体极其轻微的颤动（几乎不可察觉），到位后停止 ----
    const vib = (!e.arrived && !e.leaving) ? mi : 0;
    ctx.save();
    if (vib > 0.02) {
      const vt = T * 43;
      ctx.translate((Math.sin(vt) * 0.8 + Math.sin(vt * 1.7) * 0.5) * 0.35 * vib, Math.cos(vt * 1.13) * 0.28 * vib);
    }

    // ---- 底座：灰黑磨角装甲平台（梯形轮廓 + 板缝 + 两侧菱形卡座）----
    const baseGrd = ctx.createLinearGradient(0, 4, 0, 22);
    baseGrd.addColorStop(0, '#4a5060');
    baseGrd.addColorStop(0.5, '#2b303c');
    baseGrd.addColorStop(1, '#14171e');
    ctx.beginPath();
    ctx.moveTo(-13, 4); ctx.lineTo(13, 4); ctx.lineTo(21, 11); ctx.lineTo(15, 21);
    ctx.lineTo(-15, 21); ctx.lineTo(-21, 11);
    ctx.closePath();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'; ctx.shadowBlur = 6;
    ctx.fillStyle = baseGrd; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(140, 150, 170, 0.4)'; ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(10, 12, 18, 0.7)';
    ctx.beginPath(); ctx.moveTo(-18, 11); ctx.lineTo(18, 11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-13, 16.5); ctx.lineTo(13, 16.5); ctx.stroke();
    ctx.fillStyle = 'rgba(16, 19, 26, 0.9)';
    ctx.beginPath(); ctx.moveTo(-14, -1); ctx.lineTo(-10, 4); ctx.lineTo(-18, 4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(14, -1); ctx.lineTo(18, 4); ctx.lineTo(10, 4); ctx.closePath(); ctx.fill();

    // ---- 两侧菱形：法术矩阵同款白红配色，与中央成 ±0.45 rad 夹角 ----
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * 13.5, -4);
      ctx.rotate(s * 0.45);
      const grd = ctx.createLinearGradient(0, -12.6, 0, 12.6);
      grd.addColorStop(0, '#fff2f2'); grd.addColorStop(0.5, '#ff9a9a'); grd.addColorStop(1, '#ff4d5e');
      diamond(7, 12.6, grd, 0.92, 'rgba(255, 214, 214, 0.95)', '#ff5566');
      ctx.restore();
    }

    // ---- 中央菱形：更大、血红色 + 血红流动特效 ----
    ctx.save();
    const AW = 12.5, AH = 22.5;
    const dia = (k) => {
      ctx.beginPath();
      ctx.moveTo(0, -AH * k); ctx.lineTo(AW * k, 0); ctx.lineTo(0, AH * k); ctx.lineTo(-AW * k, 0);
      ctx.closePath();
    };
    ctx.shadowColor = 'rgba(220, 30, 52, 0.95)';
    ctx.shadowBlur = 12 + pulse * 8;
    const bodyGrd = ctx.createLinearGradient(0, -AH, 0, AH);
    bodyGrd.addColorStop(0, '#ff9fa8');
    bodyGrd.addColorStop(0.45, '#d9243e');
    bodyGrd.addColorStop(1, '#7e0f1f');
    dia(1); ctx.fillStyle = bodyGrd; ctx.fill();
    ctx.shadowBlur = 0;
    dia(1); ctx.strokeStyle = 'rgba(255, 214, 218, 0.8)'; ctx.lineWidth = 1; ctx.stroke();

    // 血红流动：裁剪进菱形后叠加上下循环移动的亮红光带
    ctx.save();
    dia(1); ctx.clip();
    const bandY = ((T * 46) % (AH * 3)) - AH * 1.5;
    const band = ctx.createLinearGradient(0, bandY - 7, 0, bandY + 7);
    band.addColorStop(0, 'rgba(255, 120, 136, 0)');
    band.addColorStop(0.5, 'rgba(255, 138, 150, 0.4)');
    band.addColorStop(1, 'rgba(255, 120, 136, 0)');
    ctx.fillStyle = band;
    ctx.fillRect(-AW, -AH, AW * 2, AH * 2);
    ctx.restore();
    // 沿边缘流动的亮红虚线（血红色能量沿菱形轮廓环流）
    ctx.save();
    ctx.strokeStyle = `rgba(255, 96, 116, ${(0.5 + pulse * 0.4).toFixed(3)})`;
    ctx.lineWidth = 1.4;
    ctx.shadowColor = 'rgba(255, 60, 84, 0.9)'; ctx.shadowBlur = 6;
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -T * 26;
    dia(0.92); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // 细黑菱形环 + 血红核心
    dia(0.6); ctx.strokeStyle = 'rgba(16, 6, 9, 0.92)'; ctx.lineWidth = 1.3; ctx.stroke();
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, AH * 0.5);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.5, '#ffb3bc');
    core.addColorStop(1, '#d9243e');
    dia(0.5); ctx.fillStyle = core; ctx.fill();
    ctx.restore();

    // ---- 前景雾丝：少量黑雾飘在机体前，增强"浓雾包裹"的层次（不遮蔽核心识别）----
    if (mi > 0.02) {
      for (let k = 0; k < 3; k++) {
        const seed = k * 4.1 + 0.7;
        const mx = Math.sin(T * (0.6 + k * 0.17) + seed) * 16;
        const my = 14 - ((T * (14 + k * 5) + seed * 9) % 30) - 2;   // 自底座向上飘散循环
        const mr = Math.max(2, 9 + 3.5 * Math.sin(T * 1.3 + seed));
        const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
        mg.addColorStop(0, `rgba(1, 2, 6, ${(0.6 * mi).toFixed(3)})`);
        mg.addColorStop(0.75, `rgba(6, 4, 14, ${(0.3 * mi).toFixed(3)})`);
        mg.addColorStop(1, 'rgba(10, 8, 22, 0)');
        ctx.fillStyle = mg;
        ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();   // 结束本体震动偏移
  }

  function drawJiaoxiangBody(e) {
    const TAU = Math.PI * 2;
    const Ro = 22, ringW = 4, Ri = Ro - ringW;   // 环外半径/宽度/内半径
    const pulse = 0.6 + Math.sin(state.time * 2.8 + (e.wobble || 0)) * 0.4;
    const dS = ENEMY_TYPES.jiaoxiang.drawScale;

    // ---- 火焰光环：登场延迟后渐显；三层波形火舌 + 暖光辉光 + 上升火星 + 稳定边界环 ----
    const delay = e.jxFlank ? JIAOXIANG.auraDelayFlank : JIAOXIANG.auraDelay;
    const ap = clamp((e.auraT - delay) / JIAOXIANG.auraFadeIn, 0, 1);
    if (ap > 0) {
      const ar = JIAOXIANG.auraR / dS;   // 世界半径→局部坐标
      ctx.save();
      ctx.globalAlpha *= ap;

      // 暖光辉光（从中心向外淡出的径向渐变）
      const glow = ctx.createRadialGradient(0, 0, ar * 0.15, 0, 0, ar);
      glow.addColorStop(0, 'rgba(255, 100, 20, 0.10)');
      glow.addColorStop(0.5, 'rgba(255, 60, 10, 0.07)');
      glow.addColorStop(0.85, 'rgba(255, 40, 0, 0.04)');
      glow.addColorStop(1, 'rgba(255, 30, 0, 0)');
      ctx.beginPath(); ctx.arc(0, 0, ar, 0, TAU);
      ctx.fillStyle = glow; ctx.fill();

      // 三层波形火舌（各层不同半径/振幅/速度/相位，产生火焰跳动感）
      const tongues = 40;
      const layers = [
        { lr: ar * 0.92, amp: 4.0, spd: 2.2, ph: 0,    color: 'rgba(255, 60, 10, 0.42)', lw: 2.4 },
        { lr: ar * 0.96, amp: 3.0, spd: -1.6, ph: 1.3, color: 'rgba(255, 140, 30, 0.32)', lw: 1.8 },
        { lr: ar * 0.88, amp: 5.0, spd: 3.0, ph: 2.7,  color: 'rgba(255, 200, 60, 0.20)', lw: 1.2 },
      ];
      for (const L of layers) {
        ctx.beginPath();
        for (let k = 0; k <= tongues; k++) {
          const a = (k / tongues) * TAU;
          const wave = Math.sin(a * 6 + state.time * L.spd + L.ph) * L.amp
                     + Math.sin(a * 11 - state.time * L.spd * 0.7 + L.ph * 2) * L.amp * 0.5;
          const r = L.lr + wave;
          if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.strokeStyle = L.color;
        ctx.lineWidth = L.lw;
        ctx.stroke();
      }

      // 上升火星（12 颗小亮点沿光环内随机位置缓慢上飘，循环重置）
      ctx.fillStyle = 'rgba(255, 220, 80, 0.7)';
      for (let k = 0; k < 12; k++) {
        const seed = k * 137.508;   // 黄金角分布
        const sa = (seed % TAU);
        const sr = ar * (0.4 + 0.5 * ((seed * 0.618) % 1));
        const rise = ((state.time * 28 + seed * 3) % 50) - 25;   // 循环上升偏移
        const sx = Math.cos(sa) * sr + Math.sin(state.time * 1.2 + k) * 2;
        const sy = Math.sin(sa) * sr - rise;
        const sparkR = 1.0 + Math.sin(state.time * 4 + k * 2) * 0.4;
        if (Math.hypot(sx, sy) < ar) {
          ctx.beginPath(); ctx.arc(sx, sy, sparkR, 0, TAU); ctx.fill();
        }
      }

      // 稳定边界环（最外层淡橙描边，标识光环范围）
      ctx.beginPath(); ctx.arc(0, 0, ar, 0, TAU);
      ctx.strokeStyle = 'rgba(255, 120, 30, 0.34)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, ar * 0.97, 0, TAU);
      ctx.strokeStyle = 'rgba(255, 80, 10, 0.18)';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.restore();
    }

    // ---- 环主体：橙火红渐变 stroke ----
    ctx.save();
    ctx.shadowColor = '#ff5500';
    ctx.shadowBlur = 9 + pulse * 6;
    const ringGrd = ctx.createLinearGradient(-Ro, -Ro, Ro, Ro);
    ringGrd.addColorStop(0, '#ff4500');
    ringGrd.addColorStop(0.35, '#ff7a18');
    ringGrd.addColorStop(0.65, '#ff5722');
    ringGrd.addColorStop(1, '#e63900');
    ctx.beginPath(); ctx.arc(0, 0, Ro - ringW / 2, 0, TAU);
    ctx.strokeStyle = ringGrd;
    ctx.lineWidth = ringW;
    ctx.stroke();
    ctx.restore();

    // 环内外细描边
    ctx.beginPath(); ctx.arc(0, 0, Ro, 0, TAU);
    ctx.strokeStyle = 'rgba(255, 200, 100, 0.4)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, Ri, 0, TAU);
    ctx.strokeStyle = 'rgba(200, 60, 0, 0.5)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // ---- 横杠 A：从核心穿过中心连接到环（直径），旋转 ----
    ctx.save();
    ctx.rotate(e.jxSpinA || 0);
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1.4;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 2;
    ctx.beginPath();
    ctx.moveTo(-Ri, 0); ctx.lineTo(Ri, 0);
    ctx.stroke();
    ctx.restore();

    // ---- 黑色核心 ----
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU);
    ctx.fillStyle = '#1a1a1a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 120, 40, 0.5)';
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // ---- 横杠 B：从白圆边缘向外延伸（半径方向），末端白色小圆，旋转 ----
    const wR = 2.8;   // 白圆半径
    ctx.save();
    ctx.rotate(e.jxSpinB || 0);
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1.2;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 2;
    ctx.beginPath();
    ctx.moveTo(wR, 0); ctx.lineTo(wR + JIAOXIANG.armB, 0);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(wR + JIAOXIANG.armB, 0, 1.9, 0, TAU);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();

    // ---- 横杠 C：另一根半径方向横杠（较短），旋转 ----
    ctx.save();
    ctx.rotate(e.jxSpinC || 0);
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1.2;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 2;
    ctx.beginPath();
    ctx.moveTo(wR, 0); ctx.lineTo(wR + JIAOXIANG.armC, 0);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(wR + JIAOXIANG.armC, 0, 1.6, 0, TAU);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();

    // ---- 白色圆形（在黑核上方，最上层绘制）----
    ctx.beginPath(); ctx.arc(0, 0, wR, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 4 + pulse * 3;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // 法术大师A1：四角风扇圆（白灰渐变+黑圆心）+ 灰黑磨角矩形(1:3:1 紫光条+中心紫点) + 底部深紫炮管
  function drawFashiA1Body(e) {
    const TAU = Math.PI * 2;
    const pulse = 0.6 + Math.sin(state.time * 3.2 + (e.wobble || 0)) * 0.4;
    // 圆角矩形辅助（arcTo）
    const rrect = (x, y, w, h, rad) => {
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + w, y, x + w, y + h, rad);
      ctx.arcTo(x + w, y + h, x, y + h, rad);
      ctx.arcTo(x, y + h, x, y, rad);
      ctx.arcTo(x, y, x + w, y, rad);
      ctx.closePath();
    };

    // 整机旋转：炮管（局部 +y）始终朝向玩家（faceAng 由移动状态机以最大角速度平滑追踪）
    ctx.save();
    ctx.rotate(e.faceAng || 0);

    // ---- 图层最底：炮管（深紫，较细，从矩形下方中心伸出）----
    const bw = 2.8, bt = 5, bb = 14;
    ctx.save();
    ctx.shadowColor = '#7c3aed';
    ctx.shadowBlur = 5 + pulse * 3;
    ctx.fillStyle = '#6b21a8';
    rrect(-bw / 2, bt, bw, bb - bt, 1.2);
    ctx.fill();
    // 炮管口高光
    ctx.fillStyle = `rgba(192, 132, 252, ${0.5 + pulse * 0.3})`;
    ctx.fillRect(-bw / 2 + 0.5, bb - 2.5, bw - 1, 2);
    ctx.restore();

    // ---- 中心矩形机身（磨平棱角灰黑色，灰色偏多）----
    const rw = 20, rh = 13, rr = 3;
    const rx = -rw / 2, ry = -rh / 2 - 0.5;
    const bg = ctx.createLinearGradient(rx, ry, rx + rw, ry + rh);
    bg.addColorStop(0, '#5c6270');
    bg.addColorStop(0.5, '#4b5060');
    bg.addColorStop(1, '#3d4250');
    rrect(rx, ry, rw, rh, rr);
    ctx.fillStyle = bg;
    ctx.fill();
    // 白色渐变边框（上下亮、左右深→透明）：不要明显的深色框
    ctx.save();
    rrect(rx, ry, rw, rh, rr);
    ctx.clip();
    const edge = ctx.createLinearGradient(rx, ry, rx, ry + rh);
    edge.addColorStop(0, 'rgba(255,255,255,0.85)');
    edge.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    edge.addColorStop(0.65, 'rgba(255,255,255,0.20)');
    edge.addColorStop(1, 'rgba(255,255,255,0.55)');
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.1;
    rrect(rx + 0.55, ry + 0.55, rw - 1.1, rh - 1.1, rr - 0.4);
    ctx.stroke();
    ctx.restore();

    // ---- 1:3:1 分割：左右“1”充满鲜亮炫紫发光长条（无暗底框）----
    const secW = rw / 5;   // 每份 "1" 宽度 = 4.8
    const pad = 0.9;       // 内边距（减小→紫条更大）
    const lw = secW - pad * 1.2, lh = rh - pad * 2.2;
    const ly = ry + pad * 1.1;
    const drawStrip = (sx) => {
      ctx.save();
      ctx.shadowColor = '#c084fc';
      ctx.shadowBlur = 10 + pulse * 7;
      // 鲜亮紫渐变：中心白亮→边缘绚紫
      const g = ctx.createLinearGradient(sx, ly, sx, ly + lh);
      g.addColorStop(0, `rgba(233, 213, 255, ${(0.92 + pulse * 0.08).toFixed(2)})`);
      g.addColorStop(0.5, `rgba(192, 132, 252, ${(0.95 + pulse * 0.05).toFixed(2)})`);
      g.addColorStop(1, `rgba(168, 85, 247, ${(0.92 + pulse * 0.08).toFixed(2)})`);
      ctx.fillStyle = g;
      rrect(sx, ly, lw, lh, 1.4);
      ctx.fill();
      // 白色渐变细边（不要明显的深色框）
      ctx.shadowBlur = 0;
      const eg = ctx.createLinearGradient(sx, ly, sx + lw, ly);
      eg.addColorStop(0, 'rgba(255,255,255,0.7)');
      eg.addColorStop(0.5, 'rgba(255,255,255,0.15)');
      eg.addColorStop(1, 'rgba(255,255,255,0.7)');
      ctx.strokeStyle = eg;
      ctx.lineWidth = 0.7;
      rrect(sx + 0.35, ly + 0.35, lw - 0.7, lh - 0.7, 1.2);
      ctx.stroke();
      ctx.restore();
    };
    drawStrip(rx + pad);                       // 左側
    drawStrip(rx + rw - secW + pad * 0.2);     // 右側

    // ---- 中心炫紫光芒圆点 ----
    const dotR = 2.8, dotY = -0.5;
    ctx.save();
    ctx.shadowColor = '#c084fc';
    ctx.shadowBlur = 9 + pulse * 7;
    const dg = ctx.createRadialGradient(0, dotY, 0, 0, dotY, dotR);
    dg.addColorStop(0, '#ffffff');
    dg.addColorStop(0.35, '#d8b4fe');
    dg.addColorStop(0.7, '#a855f7');
    dg.addColorStop(1, '#7c3aed');
    ctx.beginPath();
    ctx.arc(0, dotY, dotR, 0, TAU);
    ctx.fillStyle = dg;
    ctx.fill();
    ctx.restore();

    // ---- 图层最顶：四角风扇圆（白灰渐变 + 黑色小圆心，无转动特效）----
    const fanR = 5.8, fcx = 10, fcy = 6.8;   // 往中间靠拢（原 fcx:12, fcy:7.5）
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [sx, sy] of corners) {
      const fx = sx * fcx, fy = sy * fcy;
      const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, fanR);
      fg.addColorStop(0, '#1a1a1a');      // 圆心黑色
      fg.addColorStop(0.28, '#2a2a2a');   // 黑色小圆边界
      fg.addColorStop(0.34, '#b8bfc8');   // 突变到白灰
      fg.addColorStop(0.65, '#dfe4ea');   // 白灰渐变
      fg.addColorStop(1, '#8b929c');      // 边缘略暗
      ctx.beginPath();
      ctx.arc(fx, fy, fanR, 0, TAU);
      ctx.fillStyle = fg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.restore();   // 结束整机旋转
  }

  // 法术大师A2：A1 强化版 —— 炫紫更发光白亮 + 四角风扇圆心紫色（A1 为黑色）+ 更粗更长的炮管
  function drawFashiA2Body(e) {
    const TAU = Math.PI * 2;
    const pulse = 0.6 + Math.sin(state.time * 3.6 + (e.wobble || 0)) * 0.4;
    // 圆角矩形辅助（arcTo）
    const rrect = (x, y, w, h, rad) => {
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + w, y, x + w, y + h, rad);
      ctx.arcTo(x + w, y + h, x, y + h, rad);
      ctx.arcTo(x, y + h, x, y, rad);
      ctx.arcTo(x, y, x + w, y, rad);
      ctx.closePath();
    };

    // 整机旋转：炮管（局部 +y）始终朝向玩家（faceAng 由移动状态机以最大角速度平滑追踪）
    ctx.save();
    ctx.rotate(e.faceAng || 0);

    // ---- 图层最底：炮管（深紫，更粗更长：A1 2.8×[5,14] → 3.8×[5,18]）----
    const bw = 3.8, bt = 5, bb = 18;
    ctx.save();
    ctx.shadowColor = '#8b5cf6';
    ctx.shadowBlur = 7 + pulse * 4;
    ctx.fillStyle = '#6b21a8';
    rrect(-bw / 2, bt, bw, bb - bt, 1.6);
    ctx.fill();
    // 炮管口高光（更亮）
    ctx.fillStyle = `rgba(216, 180, 254, ${0.65 + pulse * 0.3})`;
    ctx.fillRect(-bw / 2 + 0.6, bb - 2.8, bw - 1.2, 2.4);
    ctx.restore();

    // ---- 中心矩形机身（磨平棱角灰黑色，灰色偏多）----
    const rw = 20, rh = 13, rr = 3;
    const rx = -rw / 2, ry = -rh / 2 - 0.5;
    const bg = ctx.createLinearGradient(rx, ry, rx + rw, ry + rh);
    bg.addColorStop(0, '#5c6270');
    bg.addColorStop(0.5, '#4b5060');
    bg.addColorStop(1, '#3d4250');
    rrect(rx, ry, rw, rh, rr);
    ctx.fillStyle = bg;
    ctx.fill();
    // 白色渐变边框（上下亮、左右深→透明）：不要明显的深色框
    ctx.save();
    rrect(rx, ry, rw, rh, rr);
    ctx.clip();
    const edge = ctx.createLinearGradient(rx, ry, rx, ry + rh);
    edge.addColorStop(0, 'rgba(255,255,255,0.85)');
    edge.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    edge.addColorStop(0.65, 'rgba(255,255,255,0.20)');
    edge.addColorStop(1, 'rgba(255,255,255,0.55)');
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.1;
    rrect(rx + 0.55, ry + 0.55, rw - 1.1, rh - 1.1, rr - 0.4);
    ctx.stroke();
    ctx.restore();

    // ---- 1:3:1 分割：左右"1"充满炫紫发光长条——A2 更白亮（近白紫芯 + 更强辉光）----
    const secW = rw / 5;   // 每份 "1" 宽度 = 4.8
    const pad = 0.9;       // 内边距
    const lw = secW - pad * 1.2, lh = rh - pad * 2.2;
    const ly = ry + pad * 1.1;
    const drawStrip = (sx) => {
      ctx.save();
      ctx.shadowColor = '#d8b4fe';
      ctx.shadowBlur = 15 + pulse * 9;   // 辉光更强（A1 10+7）
      // 更白亮的紫渐变：近白紫芯 → 白亮 → 绚紫边缘
      const g = ctx.createLinearGradient(sx, ly, sx, ly + lh);
      g.addColorStop(0, `rgba(250, 243, 255, ${(0.96 + pulse * 0.04).toFixed(2)})`);
      g.addColorStop(0.4, `rgba(233, 213, 255, ${(0.98).toFixed(2)})`);
      g.addColorStop(0.7, `rgba(192, 132, 252, ${(0.96).toFixed(2)})`);
      g.addColorStop(1, `rgba(168, 85, 247, ${(0.94).toFixed(2)})`);
      ctx.fillStyle = g;
      rrect(sx, ly, lw, lh, 1.4);
      ctx.fill();
      // 白色渐变细边（不要明显的深色框）
      ctx.shadowBlur = 0;
      const eg = ctx.createLinearGradient(sx, ly, sx + lw, ly);
      eg.addColorStop(0, 'rgba(255,255,255,0.85)');
      eg.addColorStop(0.5, 'rgba(255,255,255,0.25)');
      eg.addColorStop(1, 'rgba(255,255,255,0.85)');
      ctx.strokeStyle = eg;
      ctx.lineWidth = 0.7;
      rrect(sx + 0.35, ly + 0.35, lw - 0.7, lh - 0.7, 1.2);
      ctx.stroke();
      ctx.restore();
    };
    drawStrip(rx + pad);                       // 左側
    drawStrip(rx + rw - secW + pad * 0.2);     // 右側

    // ---- 中心炫紫光芒圆点（更白亮）----
    const dotR = 2.8, dotY = -0.5;
    ctx.save();
    ctx.shadowColor = '#d8b4fe';
    ctx.shadowBlur = 12 + pulse * 8;
    const dg = ctx.createRadialGradient(0, dotY, 0, 0, dotY, dotR);
    dg.addColorStop(0, '#ffffff');
    dg.addColorStop(0.35, '#f3e8ff');
    dg.addColorStop(0.7, '#c084fc');
    dg.addColorStop(1, '#8b5cf6');
    ctx.beginPath();
    ctx.arc(0, dotY, dotR, 0, TAU);
    ctx.fillStyle = dg;
    ctx.fill();
    ctx.restore();

    // ---- 图层最顶：四角风扇圆（白灰渐变 + 亮紫小圆心——A2 专属，比 A1 黑心更亮；无转动特效）----
    const fanR = 5.8, fcx = 10, fcy = 6.8;
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [sx, sy] of corners) {
      const fx = sx * fcx, fy = sy * fcy;
      const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, fanR);
      fg.addColorStop(0, '#e9d5ff');      // 圆心亮紫（较 A1 黑心更亮、更醒目）
      fg.addColorStop(0.28, '#c084fc');   // 紫色小圆边界
      fg.addColorStop(0.34, '#b8bfc8');   // 突变到白灰
      fg.addColorStop(0.65, '#dfe4ea');   // 白灰渐变
      fg.addColorStop(1, '#8b929c');      // 边缘略暗
      ctx.save();
      ctx.shadowColor = '#d8b4fe';
      ctx.shadowBlur = 4 + pulse * 3;   // 紫心微光
      ctx.beginPath();
      ctx.arc(fx, fy, fanR, 0, TAU);
      ctx.fillStyle = fg;
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.restore();   // 结束整机旋转
  }

  function drawYu4Body(e) {
    const TAU = Math.PI * 2;
    const S = 18;                    // 机体半边长（超椭圆基半宽；四角风扇圆位于机体四角）
    const CR = 8;                    // 四角风扇圆半径
    const GOLD = '#ffd166', GOLD_SOFT = 'rgba(255, 214, 102, 0.6)';
    const pulse = 0.6 + Math.sin(state.time * 2.4 + (e.wobble || 0)) * 0.4;

    // ---- 金色六边力场：登场 0.5s 后渐显；静态六边形描边 + 六角节点亮点 + 极淡暖色内衬，缓慢呼吸 ----
    const ap = clamp((e.auraT - YU4.auraDelay) / YU4.auraFadeIn, 0, 1);   // 渐显进度
    if (ap > 0) {
      const ar = YU4.auraR / ENEMY_TYPES.yu4.drawScale;   // 世界半径还原到局部坐标
      const hexPath = (r) => {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = k * TAU / 6 + TAU / 12;   // 尖顶朝上
          if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
      };
      ctx.save();
      ctx.globalAlpha *= ap * (0.72 + 0.28 * Math.sin(state.time * 2.1));   // 呼吸
      // 极淡暖色内衬（力场内部几乎透明，仅留氛围，区别于寒霜的实感冰圈）
      hexPath(ar * 0.97);
      const inner = ctx.createRadialGradient(0, 0, ar * 0.2, 0, 0, ar);
      inner.addColorStop(0, 'rgba(255, 214, 102, 0)');
      inner.addColorStop(0.8, 'rgba(255, 214, 102, 0.03)');
      inner.addColorStop(1, 'rgba(255, 214, 102, 0.10)');
      ctx.fillStyle = inner;
      ctx.fill();
      // 六边形力场双描边（外亮内暗；静态不旋转，凸显“稳定力场”，与寒霜的旋转霜环动效区分）
      hexPath(ar * 0.97);
      ctx.strokeStyle = 'rgba(255, 226, 130, 0.55)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      hexPath(ar * 0.90);
      ctx.strokeStyle = 'rgba(255, 214, 102, 0.26)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // 六角节点亮点（呼吸微光）
      ctx.fillStyle = `rgba(255, 240, 190, ${(0.45 + pulse * 0.3).toFixed(3)})`;
      for (let k = 0; k < 6; k++) {
        const a = k * TAU / 6 + TAU / 12;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * ar * 0.97, Math.sin(a) * ar * 0.97, 2.2, 0, TAU);
        ctx.fill();
      }
      // 四角风扇到力场的金色能量连线（X 形条纹的能量延伸）
      ctx.strokeStyle = `rgba(255, 214, 102, ${(0.14 + pulse * 0.12).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(sx * S * 0.5, sy * S * 0.5);
          ctx.lineTo(sx * ar * 0.62, sy * ar * 0.62);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // ---- 机体路径（介于圆形与正方形之间的超椭圆/方圆形：圆中带方、无尖棱）----
    const bodyPath = () => {
      const n = 3.2;    // 超椭圆指数：2=正圆、∞=正方形，3.2 介于两者之间
      const steps = 72;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const a = i / steps * TAU;
        const c = Math.cos(a), s = Math.sin(a);
        const x = S * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
        const y = S * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };
    // 暗底盘（装甲厚度）
    ctx.save();
    ctx.translate(0, 1.4);
    bodyPath();
    ctx.fillStyle = '#262a32';
    ctx.fill();
    ctx.restore();
    // 机体暖灰渐变（上亮暖灰 → 中灰 → 下深灰，顶部受光；暖色调与寒霜的冷灰区分）
    bodyPath();
    const bodyGrd = ctx.createLinearGradient(0, -S, 0, S);
    bodyGrd.addColorStop(0, '#b2ac9f');
    bodyGrd.addColorStop(0.5, '#716c62');
    bodyGrd.addColorStop(1, '#413e37');
    ctx.fillStyle = bodyGrd;
    ctx.fill();
    // 内圈暗色描边（装甲轮廓）
    bodyPath();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 顶部受光高光线（内收以贴合方圆轮廓）
    ctx.strokeStyle = 'rgba(235, 240, 246, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-10, -15.6);
    ctx.lineTo(10, -15.6);
    ctx.stroke();

    // ---- "X"形金色条纹：从中心指向四个角的风扇圆（暗金描底 + 发光金条）----
    const xEnd = S * 0.92;   // 略缩进，端点被风扇圆覆盖衔接
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(88, 62, 14, 0.45)';   // 暗金描底（调淡，避免中心淤成暗块）
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-xEnd, -xEnd); ctx.lineTo(xEnd, xEnd);
    ctx.moveTo(xEnd, -xEnd); ctx.lineTo(-xEnd, xEnd);
    ctx.stroke();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    ctx.shadowColor = GOLD;
    ctx.shadowBlur = 3 + pulse * 3;
    ctx.beginPath();
    ctx.moveTo(-xEnd, -xEnd); ctx.lineTo(xEnd, xEnd);
    ctx.moveTo(xEnd, -xEnd); ctx.lineTo(-xEnd, xEnd);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // ---- 中央淡黄色反应核（小片暖黄光斑替代原先中心暗色区域，随 pulse 呼吸）----
    ctx.save();
    ctx.shadowColor = '#ffe98a';
    ctx.shadowBlur = 6 + pulse * 4;
    const coreGrd = ctx.createRadialGradient(0, 0, 0, 0, 0, 5);
    coreGrd.addColorStop(0, '#fff6cf');
    coreGrd.addColorStop(0.55, '#ffe27a');
    coreGrd.addColorStop(1, 'rgba(255, 214, 90, 0.25)');
    ctx.fillStyle = coreGrd;
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
    ctx.restore();

    // ---- 四角风扇圆：中心淡青 → 边缘暖灰 渐变 + 暖灰描边 + 低速旋转扇叶剪影 ----
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const cx0 = sx * S, cy0 = sy * S;
        const cg = ctx.createRadialGradient(cx0, cy0, 0, cx0, cy0, CR);
        cg.addColorStop(0, '#d8f6f0');
        cg.addColorStop(0.42, '#8ce0d5');
        cg.addColorStop(0.78, '#615c50');
        cg.addColorStop(1, '#a89e8c');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(cx0, cy0, CR, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(20, 24, 30, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx0, cy0, CR, 0, TAU); ctx.stroke();
        // 暗色扇叶剪影（低速旋转，保留无人机身份）
        ctx.save();
        ctx.translate(cx0, cy0);
        ctx.rotate(state.time * 3 + (e.wobble || 0) + sx * sy);
        ctx.strokeStyle = 'rgba(8, 10, 14, 0.45)';
        ctx.lineWidth = 2;
        for (let b = 0; b < 3; b++) {
          const ba = b * TAU / 3;
          ctx.beginPath();
          ctx.moveTo(Math.cos(ba) * 3, Math.sin(ba) * 3);
          ctx.lineTo(Math.cos(ba) * (CR - 1.4), Math.sin(ba) * (CR - 1.4));
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  // 幽暮突击艇机体：2类菱形的黑色版本 —— 暗黑渐变菱形 + 微亮描边（暗背景下勾勒轮廓）+ 中央白色发光核心；
  // 浮现渐显 / 离场渐隐的透明度由 e.duskFade 控制（乘到 globalAlpha）
  function drawDuskStrikerBody(e) {
    const TAU = Math.PI * 2;
    ctx.save();
    ctx.globalAlpha *= (e.duskFade != null ? e.duskFade : 1);
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(15, -4);
    ctx.lineTo(0, -13);
    ctx.lineTo(-15, -4);
    ctx.closePath();
    const hull = ctx.createLinearGradient(0, -13, 0, 14);
    hull.addColorStop(0, '#23262e');
    hull.addColorStop(0.5, '#101319');
    hull.addColorStop(1, '#07080c');
    ctx.fillStyle = hull;
    ctx.fill();
    ctx.strokeStyle = 'rgba(150, 158, 180, 0.45)';   // 微亮描边：纯黑机体在星空背景下仍可辨识
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 瞄准预警环（仅“瞄准停顿”阶段）：白环从核心散发、快速掠过机体，被裁剪在机体轮廓内 ——
    // 越出机体的区域不显示；环扩散到边缘消失的同时（停顿计时结束）发出环射子弹
    if (e.duskPhase === 2 && e.duskFade > 0) {
      const p = Math.min(1, (e.duskT || 0) / DUSK.aimWait);
      // 机体轮廓距核心最远约 15.3（侧顶点），rr 终值 16 恰好令白环在停顿结束（开火帧）的瞬间越过边缘完全消失 —— 与开火同帧对齐
      // （此前扩散到 19，环在 p≈0.77 就被裁剪殆尽，之后到开火前有 3~4 帧空档）
      const rr = 3 + 13 * p;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.lineTo(15, -4);
      ctx.lineTo(0, -13);
      ctx.lineTo(-15, -4);
      ctx.closePath();
      ctx.clip();   // 白环只在机体内可见
      ctx.globalAlpha *= 1 - p * 0.55;   // 接近边缘逐渐变弱，消失更柔和
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.arc(0, -1, rr, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    // 中央白色核心（微微脉动辉光）
    const pulse = 0.6 + Math.sin(state.time * 3.2 + (e.wobble || 0)) * 0.4;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 4 + pulse * 4;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, -1, 3.2, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // 坚垒护卫艇机体：2类菱形的黄色倒置版（霜白突击艇上下翻转身形：长尖尾朝上、短钝前端朝下）+ 前置能量盾 ——
  // 盾 = 机体前方（朝向玩家一侧）两条边框线的平行线：增粗、沿外法线略微外移，端点沿边线方向延伸少许
  // 盖过机体顶点（消除悬浮断口感）；盾线上有沿边流动的亮色光效（虚线相位随时间推进）
  function drawFortressStrikerBody(e) {
    const TAU = Math.PI * 2;
    // 上下倒置的菱形顶点：普通 2类 (0,14)(15,-4)(0,-13)(-15,-4) 的 y 取反（长尖机尾朝上、短钝机头朝下）
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(15, 4);
    ctx.lineTo(0, 13);
    ctx.lineTo(-15, 4);
    ctx.closePath();
    const hull = ctx.createLinearGradient(0, -14, 0, 13);
    hull.addColorStop(0, '#8a6408');    // 机尾（上）暗金
    hull.addColorStop(0.5, '#ffd166');  // 中段主黄
    hull.addColorStop(1, '#fff0b0');    // 机头（下）亮黄
    ctx.fillStyle = hull;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 中央核心：白色发光核心 + 金色辉光脉动（明黄色机体上通用半透明座舱点对比度不足，参照幽暮自带高对比核心）
    const pulse = 0.6 + Math.sin(state.time * 3.2 + (e.wobble || 0)) * 0.4;
    ctx.save();
    ctx.shadowColor = '#ffbf47';
    ctx.shadowBlur = 3 + pulse * 4;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, TAU); ctx.fill();
    ctx.restore();

    // 能量盾：与机头两侧边框线（(0,13)→(±15,4)）平行的两条直线 ——
    // 沿外法线外移 3.5px（右缘外法线 (0.515, 0.858)、左缘镜像，= 边向量 (±15,-9) 旋转 90° 归一取朝外一侧），
    // 两端沿边线单位方向 u = (±0.858, -0.515) 各延伸 2px 盖过机体顶点（线帽圆头 + 微光，读作"边框增粗外移"的盾）
    const NX = 0.515, NY = 0.858, UX = 0.858, UY = 0.515, OFF = 3.5, EXT = 2;
    const edge = sx => {
      ctx.beginPath();
      ctx.moveTo(sx * (NX * OFF - UX * EXT), 13 + NY * OFF + UY * EXT);        // 机头端（沿 -u 越过顶点）
      ctx.lineTo(sx * (15 + NX * OFF + UX * EXT), 4 + NY * OFF - UY * EXT);    // 翼端（沿 +u 越过顶点）
    };
    // 底层盾线：半透明黄 + 轻微金辉（厚度 3，较机体描边 1.2 明显增粗）
    ctx.save();
    ctx.shadowColor = '#ffd166';
    ctx.shadowBlur = 4;
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.6)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const sx of [-1, 1]) { edge(sx); ctx.stroke(); }
    // 流动光效：亮色短划沿盾线循环流动（虚线相位由 state.time 驱动；路径方向翼→机头，
    // lineDashOffset 取负使相位沿路径正向推进 → 光点自两翼流向机头）
    ctx.strokeStyle = '#fff6cf';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 10]);
    ctx.lineDashOffset = -state.time * 26;
    for (const sx of [-1, 1]) { edge(sx); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.restore();
    ctx.beginPath();   // 清空路径：尾部公共 fill/stroke 空跑（同赤月侧翼艇分支约定）
  }

  // 白色骷髅图标：头骨 + 下颚 + 双眼窝 + 鼻腔（hr 为头骨半径）
  // redRim：沿头骨外圈描一圈暗红窄边（暴鸰·G 机身骷髅，配色同 G 胶囊弹描边 rgba(150,35,35)）
  function paintSkull(cx, cy, hr, redRim = false) {
    const TAU = Math.PI * 2;
    ctx.fillStyle = '#f2f4f7';
    ctx.beginPath(); ctx.arc(cx, cy, hr, 0, TAU); ctx.fill();                  // 头骨
    ctx.fillRect(cx - hr * 0.55, cy + hr * 0.45, hr * 1.1, hr * 0.62);          // 下颚
    ctx.fillStyle = '#0c0e12';
    ctx.beginPath(); ctx.arc(cx - hr * 0.4, cy, hr * 0.26, 0, TAU); ctx.fill(); // 左眼窝
    ctx.beginPath(); ctx.arc(cx + hr * 0.4, cy, hr * 0.26, 0, TAU); ctx.fill(); // 右眼窝
    ctx.beginPath();
    ctx.moveTo(cx, cy + hr * 0.2);
    ctx.lineTo(cx - hr * 0.16, cy + hr * 0.5);
    ctx.lineTo(cx + hr * 0.16, cy + hr * 0.5);
    ctx.closePath(); ctx.fill();                                               // 鼻腔
    if (redRim) {
      ctx.strokeStyle = 'rgba(150, 35, 35, 0.9)';
      ctx.lineWidth = Math.max(0.6, hr * 0.18);
      ctx.beginPath(); ctx.arc(cx, cy, hr, 0, TAU); ctx.stroke();              // 头骨暗红边框
    }
  }

  // 白色雪花图标（虚幻机体标识，替换暴鸰骷髅）：六向主臂 + 每臂两根 V 形分叉 + 中心小六边核（r 为雪花半径）
  function paintSnowflake(cx, cy, r, alpha = 1) {
    const TAU = Math.PI * 2;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.strokeStyle = '#eef6ff';
    ctx.lineWidth = Math.max(0.8, r * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 - Math.PI / 2;   // 主臂方向（竖直向上起始）
      const ux = Math.cos(a), uy = Math.sin(a);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + ux * r, cy + uy * r);
      // 每臂两根 V 形分叉（位于 55% / 80% 半径处，斜向 ±45°）
      for (const f of [0.55, 0.8]) {
        const bx = cx + ux * r * f, by = cy + uy * r * f;
        const bl = r * 0.3;
        for (const s of [-1, 1]) {
          const ba = a + s * Math.PI / 4;
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl);
        }
      }
    }
    ctx.stroke();
    // 中心小六边核（冰蓝点题）
    ctx.fillStyle = '#bfe8ff';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.22, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // 暴鸰炸弹：通体黑色圆形，45%~60% 高度一道水平红道（两侧留黑色边框），上部白色骷髅图标
  function paintBaolingBomb(cx, cy, r, pulse = 0.5) {
    const TAU = Math.PI * 2;
    // 底部暗盘（厚度）
    ctx.fillStyle = '#0c0e12';
    ctx.beginPath(); ctx.arc(cx, cy + 1, r, 0, TAU); ctx.fill();
    // 黑色弹体（微弱冷光渐变避免死黑一片）
    const bg3 = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.15, cx, cy, r);
    bg3.addColorStop(0, '#3a3f48');
    bg3.addColorStop(0.55, '#1a1d23');
    bg3.addColorStop(1, '#0a0c10');
    ctx.fillStyle = bg3;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    // 红道：从上到下 45%~60% 高度（y ∈ [-0.1r, +0.2r]），宽度 72% 直径（两侧留黑色边框）
    ctx.fillStyle = '#e03a3a';
    ctx.fillRect(cx - r * 0.72, cy - r * 0.10, r * 1.44, r * 0.30);
    // 顶部红色高光弧（“红色炸弹头”点题，随脉动呼吸）
    ctx.strokeStyle = `rgba(224, 58, 58, ${(0.35 + pulse * 0.35).toFixed(3)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, r - 0.8, -2.4, -0.7); ctx.stroke();
    // 白色骷髅图标（上部黑色区域）
    paintSkull(cx, cy - r * 0.45, r * 0.26);
    // 弹体描边
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  }

  // 暴鸰·G 炸弹：胶囊形（上半圆 + 矩形 + 下半圆）——矩形高度 = 半圆半径 ×1.5，
  // 矩形段上三道红色横杠（暴鸰圆弹红道同款配色；初版两道，2026-09-29 用户反馈加至三道），
  // 弹体描边为较窄红色边框（同日反馈，原黑描边），顶部半圆保留白骷髅与红色高光弧
  // （cx, cy）= 胶囊整体中心；r = 半圆半径，总高 3.5r、宽 2r
  function paintBaolingGBomb(cx, cy, r, pulse = 0.5) {
    const TAU = Math.PI * 2;
    const halfH = r * 0.75;   // 矩形半高（矩形高 1.5r）
    // 胶囊路径（可复用：主体 / 底盘偏移 / 描边）
    const capPath = (oy = 0) => {
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - halfH + oy);
      ctx.arc(cx, cy - halfH + oy, r, Math.PI, 0);        // 顶部半圆
      ctx.lineTo(cx + r, cy + halfH + oy);                 // 右侧矩形边
      ctx.arc(cx, cy + halfH + oy, r, 0, Math.PI);         // 底部半圆
      ctx.closePath();
    };
    // 底部暗盘（厚度）
    ctx.fillStyle = '#0c0e12';
    capPath(1);
    ctx.fill();
    // 黑色弹体（微弱冷光渐变避免死黑一片；沿胶囊纵向）
    const bg3 = ctx.createLinearGradient(cx, cy - halfH - r, cx, cy + halfH + r);
    bg3.addColorStop(0, '#3a3f48');
    bg3.addColorStop(0.55, '#1a1d23');
    bg3.addColorStop(1, '#0a0c10');
    ctx.fillStyle = bg3;
    capPath();
    ctx.fill();
    // 矩形段红色横杠 ×3（暴鸰圆弹红道同款：宽度 72% 直径、两侧留黑色边框；上/中/下均匀排布）
    ctx.fillStyle = '#e03a3a';
    ctx.fillRect(cx - r * 0.72, cy - r * 0.63, r * 1.44, r * 0.30);
    ctx.fillRect(cx - r * 0.72, cy - r * 0.15, r * 1.44, r * 0.30);
    ctx.fillRect(cx - r * 0.72, cy + r * 0.33, r * 1.44, r * 0.30);
    // 顶部红色高光弧（随脉动呼吸）
    ctx.strokeStyle = `rgba(224, 58, 58, ${(0.35 + pulse * 0.35).toFixed(3)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy - halfH, r - 0.8, -2.4, -0.7); ctx.stroke();
    // 白色骷髅图标（顶部半圆）
    paintSkull(cx, cy - halfH - r * 0.42, r * 0.26);
    // 弹体描边（暗红窄边：2026-09-29 用户反馈由亮红减细改暗）
    ctx.strokeStyle = 'rgba(150, 35, 35, 0.9)';
    ctx.lineWidth = 0.7;
    capPath();
    ctx.stroke();
  }

  // 虚幻炸弹：青蓝渐变圆柱弹（侧视，俯视角度）——整体大小与暴鸰·G 胶囊弹相当
  // （筒身直径 2r = 14、筒高 3.5r = 24.5，2026-09-29 用户反馈由 7×14 加大）；
  // 只画【上端椭圆圆面】（俯视时底端圆面不可见），底部以与顶面同扁率的椭圆下半弧收形、不加底端盖——
  // 上下都画椭圆端盖会像鼓形而不立体（2026-09-29 用户反馈）；底部原为小圆角收形被用户指「直角不像
  // 圆柱底」（2026-10-03）→ 改为下弯椭圆弧（俯视圆柱底缘轮廓，透视扁率与顶面一致）；
  // 色彩偏向冰青 #23F3F3（受光部/顶面），筒身下半保留深蓝（非全弹青色）；侧面两道浅青半圆弧线（纬环）均分筒高。
  function paintUnrealBomb(cx, cy, r, pulse = 0.5) {
    const w = r * 2;        // 筒身直径（水平）
    const h = r * 3.5;      // 筒身高（竖直）
    const ryT = r * 0.42;   // 上端盖椭圆短半轴（可见顶面）
    const ryB = ryT;        // 底缘椭圆短半轴（下弯弧，与顶面同扁率——同一俯角透视）
    // 总高 = 筒身 + 上端盖上凸 + 底缘下弯；以 cy 为视觉中心
    const totalH = h + ryT + ryB;
    const yTop = cy - totalH / 2;
    const x0 = cx - w / 2;
    const y0 = yTop + ryT;              // 筒顶 / 端盖椭圆中心
    const yB = y0 + h;                  // 筒底（底缘椭圆中心）
    // 筒身路径：平顶（与端盖相接）+ 两侧竖边 + 底部椭圆下弯弧（圆柱底缘轮廓）
    const bodyPath = () => {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + w, y0);
      ctx.lineTo(x0 + w, yB);                                            // 右侧竖边到筒底右端
      ctx.ellipse(cx, yB, w / 2, ryB, 0, 0, Math.PI, false);             // 右端 → 下弯弧 → 左端
      ctx.closePath();                                                   // 左端 → 左侧竖边闭合
    };
    // 筒身：冰青（上）→ 青蓝 → 深蓝（下）——受光部偏图色，底部保留蓝色纵深
    const g = ctx.createLinearGradient(cx, y0, cx, yB);
    g.addColorStop(0, '#2fd6dd');
    g.addColorStop(0.4, '#1fa3c6');
    g.addColorStop(0.72, '#1d5f9b');
    g.addColorStop(1, '#123a72');
    bodyPath();
    ctx.fillStyle = g;
    ctx.fill();
    // 后续筒身层次全部裁剪在圆角路径内（横杠/明暗不溢出收形边缘）
    ctx.save();
    bodyPath();
    ctx.clip();
    // 圆柱面横向明暗：两侧压暗、中轴提亮（冷青高光，读作圆柱而非平面矩形）
    const cyl = ctx.createLinearGradient(x0, 0, x0 + w, 0);
    cyl.addColorStop(0, 'rgba(4, 20, 44, 0.55)');
    cyl.addColorStop(0.3, 'rgba(4, 20, 44, 0)');
    cyl.addColorStop(0.5, 'rgba(200, 250, 252, 0.3)');
    cyl.addColorStop(0.7, 'rgba(4, 20, 44, 0)');
    cyl.addColorStop(1, 'rgba(4, 20, 44, 0.55)');
    ctx.fillStyle = cyl;
    ctx.fillRect(x0, y0, w, h + ryB);
    // 两道环线（2026-09-29 用户反馈：颜色再淡一点→alpha 0.95 降至 0.6；线宽 1.9）：
    // 与端盖同 rx/ry 的椭圆下移、只画下半弧（圆柱面上的纬环前半缘），均分侧面高度（1/3、2/3 处）；
    // 椭圆半径内收约半个线宽，避免线条超出筒身两侧/顶边（裁剪区内）
    ctx.strokeStyle = 'rgba(196, 230, 235, 0.6)';
    ctx.lineWidth = 1.9;
    for (const k of [1 / 3, 2 / 3]) {
      const yc = y0 + h * k;
      ctx.beginPath();
      ctx.ellipse(cx, yc, w / 2 - 1.0, ryT - 0.4, 0, 0, Math.PI, false);   // 右端 → 下半弧 → 左端
      ctx.stroke();
    }
    // 底部收形暗带：软压暗表现筒面转入不可见底缘（延伸覆盖底缘下弯弧，不是椭圆端面）
    const bb = ctx.createLinearGradient(0, yB - h * 0.22, 0, yB + ryB);
    bb.addColorStop(0, 'rgba(5, 16, 40, 0)');
    bb.addColorStop(1, 'rgba(5, 16, 40, 0.4)');
    ctx.fillStyle = bb;
    ctx.fillRect(x0, yB - h * 0.22, w, h * 0.22 + ryB);
    ctx.restore();
    // 上端圆面（俯视可见的顶面）：冰青系渐变，远缘稍暗、近缘提亮但不发白
    const lidT = ctx.createLinearGradient(0, y0 - ryT, 0, y0);
    lidT.addColorStop(0, '#15bdc6');
    lidT.addColorStop(0.65, '#23d6dd');
    lidT.addColorStop(1, '#3ee5e9');
    ctx.fillStyle = lidT;
    ctx.beginPath();
    ctx.ellipse(cx, y0, w / 2, ryT, 0, 0, Math.PI * 2);
    ctx.fill();
    // 顶面近缘（椭圆下半弧）= 盖-身交界的可见棱线：极淡暗色，不再画贯穿亮白线
    ctx.strokeStyle = 'rgba(6, 30, 48, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx, y0, w / 2 - 0.2, ryT - 0.2, 0, 0, Math.PI, false); ctx.stroke();
    // 顶面弧顶随脉动的冰青受光弧（一小段，不贯穿）
    ctx.strokeStyle = `rgba(190, 252, 252, ${(0.15 + pulse * 0.2).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(cx, y0, w / 2 - 1, ryT - 0.5, 0, Math.PI * 1.18, Math.PI * 1.82); ctx.stroke();
    // 轮廓：顶端盖完整椭圆（顶面外缘）→ 右侧竖边 → 底部椭圆下弯弧 → 左侧竖边，统一暗色低对比
    ctx.strokeStyle = 'rgba(4, 12, 28, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, y0, w / 2, ryT, 0, Math.PI, Math.PI * 2, false);   // 左端 → 上半弧 → 右端
    ctx.lineTo(x0 + w, yB);
    ctx.ellipse(cx, yB, w / 2, ryB, 0, 0, Math.PI, false);             // 右端 → 下弯底弧 → 左端
    ctx.closePath();
    ctx.stroke();
  }

  // 暴鸰：白灰色磨角方形自爆无人机（较威龙小 20%）——灰黑渐变横杠连接四角风扇（淡黄桨心、外环灰白渐变越靠边越白），
  // 中央灰黑渐变（较御4 更黑），前方搭载黑色圆炸弹（红道 + 白骷髅）
  function drawBaolingBody(e) {
    drawBaolingBodyCore(e, 1, paintBaolingBomb);
  }

  // 暴鸰·G：同暴鸰机体，本体尺寸 ×1.05，前方搭载胶囊形炸弹（半圆+矩形+半圆，矩形上三道横杠）；四角风扇外红内黄涂装、机身骷髅带暗红边框；
  // 炸弹挂点较暴鸰略微下移 1.5（2026-09-29 用户反馈，仅挂机展示；飞行中的胶囊弹绘制不受影响）
  function drawBaolingGBody(e) {
    drawBaolingBodyCore(e, 1.05, (x, y, r, p) => paintBaolingGBomb(x, y + 1.5, r, p), null, 'redYellow');
  }

  // 虚幻：同暴鸰机体（模型类似暴鸰），桨心改冰青、机身标识换成雪花，前方搭载青蓝渐变圆柱炸弹（椭圆顶面 + 两道半圆弧线）
  function drawUnrealBody(e) {
    // 炸弹挂点较暴鸰略微下移 1.5（2026-09-29 用户反馈，仅挂机展示；飞行中的圆柱弹以自身中心绘制不受影响）
    drawBaolingBodyCore(e, 1, (x, y, rr, p) => paintUnrealBomb(x, y + 1.5, rr, p), 'flake');
  }

  // 暴鸰系机体绘制核心（drawBaolingBody / drawBaolingGBody / drawUnrealBody 共用）：scale 为本体缩放，bombPainter 为挂载炸弹画法；
  // centerIcon：机身中央标识——缺省骷髅（自爆警示），'flake' 为雪花（虚幻冰霜涂装）；
  // fanStyle：四角风扇配色——缺省淡黄桨心白外环，'redYellow' 为内圈红黄渐变（暴鸰·G 涂装，外圆白环/描边不动；同时机身骷髅加暗红边框）
  function drawBaolingBodyCore(e, scale, bombPainter, centerIcon, fanStyle) {
    const TAU = Math.PI * 2;
    ctx.save();
    ctx.scale(scale, scale);     // 本体尺寸缩放（暴鸰·G ×1.05，绘制与碰撞盒解耦）
    const S = 12.5;              // 方形机体半边长
    const FR = 5;                // 风扇圆半径
    const FX = 17.5, FY = 14.5;  // 风扇中心偏移（四角）
    const pulse = 0.5 + Math.sin(state.time * 5 + (e.wobble || 0)) * 0.5;   // 自爆机体：警示脉动更快

    // ---- 四条连接横杠（机体 → 风扇，最底层）：灰黑渐变（机体端灰、风扇端黑），加粗提升辨识度 ----
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const bx = sx * S * 0.72, by = sy * S * 0.72;
        const barG = ctx.createLinearGradient(bx, by, sx * FX, sy * FY);
        barG.addColorStop(0, '#8f98a4');   // 机体端：亮灰（暗色机身上清晰可辨）
        barG.addColorStop(0.55, '#565d67');
        barG.addColorStop(1, '#171a1f');   // 风扇端：黑（端点被风扇圆覆盖衔接）
        ctx.strokeStyle = barG;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(sx * FX, sy * FY);
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';

    // ---- 四角风扇圆：桨心 + 灰白渐变外环（越往边上越白）----
    // 虚幻（frost 涂装）：桨心由淡黄改为冰青 #23E3E3 系（2026-09-29 用户取色定稿），外环带冷青
    const frostHub = centerIcon === 'flake';
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const cx0 = sx * FX, cy0 = sy * FY;
        const fg = ctx.createRadialGradient(cx0, cy0, 0, cx0, cy0, FR);
        if (frostHub) {
          fg.addColorStop(0, '#5cf0f0');    // 冰青桨心（亮芯）
          fg.addColorStop(0.34, '#23e3e3'); // 取色定稿：#23F3F3 同系
          fg.addColorStop(0.62, '#7fa9b5'); // 中段灰青
          fg.addColorStop(1, '#e6f9fb');    // 外环青白
        } else if (fanStyle === 'redYellow') {
          // 红黄渐变仅在内部桨心（≤约 60% 半径）；外缘白环恢复原版——外圈不改动
          fg.addColorStop(0, '#ffe98a');    // 亮黄桨心（内黄）
          fg.addColorStop(0.34, '#f6d25c'); // 黄核心
          fg.addColorStop(0.46, '#f08a3c'); // 橙过渡
          fg.addColorStop(0.56, '#d62f28'); // 红（红黄渐变内圈的外缘）
          fg.addColorStop(0.68, '#a8b0bb'); // 接回中段灰（原版外环同色）
          fg.addColorStop(1, '#f4f7fb');    // 外环白（外圆不变）
        } else {
          fg.addColorStop(0, '#f6ecb4');    // 淡黄色桨心（占比加大，明确盖住横杠端点）
          fg.addColorStop(0.34, '#f2e7ac'); // 淡黄核心保持到约 1/3 半径
          fg.addColorStop(0.62, '#a8b0bb'); // 中段灰
          fg.addColorStop(1, '#f4f7fb');    // 外环灰白渐变：越靠边缘越白
        }
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(cx0, cy0, FR, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(20, 22, 26, 0.55)';   // 外圈描边恢复原版（外圆不改动）
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx0, cy0, FR, 0, TAU); ctx.stroke();
      }
    }

    // ---- 磨角方形机体：灰黑渐变（较御4 更黑）----
    const bodyPath = () => {
      const r = 4;
      ctx.beginPath();
      ctx.moveTo(-S + r, -S);
      ctx.arcTo(S, -S, S, S, r);
      ctx.arcTo(S, S, -S, S, r);
      ctx.arcTo(-S, S, -S, -S, r);
      ctx.arcTo(-S, -S, S, -S, r);
      ctx.closePath();
    };
    // 暗底盘（装甲厚度）
    ctx.save();
    ctx.translate(0, 1.2);
    bodyPath();
    ctx.fillStyle = '#14161b';
    ctx.fill();
    ctx.restore();
    bodyPath();
    const bgrd = ctx.createLinearGradient(0, -S, 0, S);
    bgrd.addColorStop(0, '#67707c');
    bgrd.addColorStop(0.5, '#3c424c');
    bgrd.addColorStop(1, '#191c22');
    ctx.fillStyle = bgrd;
    ctx.fill();
    bodyPath();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 顶部受光高光线
    ctx.strokeStyle = 'rgba(220, 226, 234, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-S + 4, -S + 1);
    ctx.lineTo(S - 4, -S + 1);
    ctx.stroke();

    // ---- 中心偏上的机身标识：暴鸰系骷髅（自爆警示，较炸弹上的更大）/ 虚幻雪花（冰霜涂装）----
    if (centerIcon === 'flake') paintSnowflake(0, -4, 4.4);
    else paintSkull(0, -4, 3.4, fanStyle === 'redYellow');   // G 涂装：骷髅加暗红边框

    // ---- 前方搭载的炸弹头（黑色圆形：红道 + 白骷髅）----
    // 投掷后本体不再绘制炸弹 —— 炸弹已分离为 blBombs 独立实体，绘制在暴鸰图层之上
    if (!e.blThrown) bombPainter(0, 17, 7, pulse);
    ctx.restore();
  }

  // 暴鸰红色预警圈（爆炸半径）：红色脉动填充 + 外环 + 内缩瞄准虚环（intensity 0~1 越高越急迫）
  // R = 预警圈半径（暴鸰 BAOLING.blastR 73 / 暴鸰·G BAOLING_G.blastR 94.9，缺省暴鸰）
  function drawBaolingWarn(tx, ty, intensity, R = BAOLING.blastR) {
    const TAU = Math.PI * 2;
    const p = 0.5 + Math.sin(state.time * 10) * 0.5;   // 快速脉动
    ctx.save();
    ctx.globalAlpha = 0.55 + intensity * 0.45;
    ctx.fillStyle = `rgba(255, 46, 46, ${(0.10 + intensity * 0.12 + p * 0.05).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(tx, ty, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255, 60, 60, ${(0.65 + p * 0.35).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(tx, ty, R, 0, TAU); ctx.stroke();
    const ir = R * (0.85 - intensity * 0.55);   // 内缩瞄准环
    ctx.strokeStyle = 'rgba(255, 120, 90, 0.8)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -state.time * 30;
    ctx.beginPath(); ctx.arc(tx, ty, ir, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 虚幻深蓝预警圈（爆炸半径）：深蓝脉动填充 + 外环 + 内缩瞄准虚环（intensity 0~1 越高越急迫）
  // 同构于 drawBaolingWarn 的红色系，配色换为深蓝冰霜系（R = UNREAL.blastR 73）
  function drawUnrealWarn(tx, ty, intensity, R = UNREAL.blastR) {
    const TAU = Math.PI * 2;
    const p = 0.5 + Math.sin(state.time * 10) * 0.5;   // 快速脉动
    ctx.save();
    ctx.globalAlpha = 0.55 + intensity * 0.45;
    ctx.fillStyle = `rgba(40, 90, 235, ${(0.10 + intensity * 0.12 + p * 0.05).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(tx, ty, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(70, 120, 255, ${(0.65 + p * 0.35).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(tx, ty, R, 0, TAU); ctx.stroke();
    const ir = R * (0.85 - intensity * 0.55);   // 内缩瞄准环
    ctx.strokeStyle = 'rgba(120, 170, 255, 0.8)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -state.time * 30;
    ctx.beginPath(); ctx.arc(tx, ty, ir, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 暴鸰 / 暴鸰·G / 虚幻 炸弹与预警区：停车锁定阶段（预警挂机身）+ 已投出的炸弹（低速下坠 / 极速冲刺）
  // （暴鸰·G：预警圈半径 ×1.3、炸弹为胶囊形；虚幻：预警圈深蓝色、炸弹为青蓝渐变圆柱弹）
  function drawBaolingBombs() {
    for (const e of enemies) {
      if ((e.type !== 'baoling' && e.type !== 'baolingG' && e.type !== 'unreal') || e.blPhase !== 1 || !e.blWarn) continue;
      const R = e.type === 'baolingG' ? BAOLING_G.blastR : e.type === 'unreal' ? UNREAL.blastR : BAOLING.blastR;
      if (e.type === 'unreal') drawUnrealWarn(e.blWarn.tx, e.blWarn.ty, e.blWarn.t / BAOLING.warnTime * 0.35, R);
      else drawBaolingWarn(e.blWarn.tx, e.blWarn.ty, e.blWarn.t / BAOLING.warnTime * 0.35, R);
    }
    for (const b of blBombs) {
      const intensity = b.phase === 'drop'
        ? 0.35 + Math.min(1, b.t / (b.dropDur || BAOLING.dropTime)) * 0.3
        : 0.65 + Math.min(1, (b.spd - BAOLING.dropSpeed) / 900) * 0.35;
      if (b.u) drawUnrealWarn(b.tx, b.ty, intensity, UNREAL.blastR);
      else drawBaolingWarn(b.tx, b.ty, intensity, b.g ? BAOLING_G.blastR : BAOLING.blastR);
      ctx.save();
      ctx.translate(b.x, b.y);
      if (b.u) {
        // 虚幻圆柱弹：筒轴对准飞行方向（冰青顶面端盖朝向锁定目标）——下坠段保持竖直（rot 0 旧观感），
        // 进入冲刺段后 0.25s smoothstep 平滑转向（仅视觉旋转，不改变运动轨迹；2026-10-04 用户反馈）；
        // 目标角规范到 (−π, π]，保证从竖直姿态度转最短路径（向左冲刺转 −90° 而非绕行 270°）
        let tgt = Math.atan2(b.uy, b.ux) + Math.PI / 2;
        if (tgt > Math.PI) tgt -= Math.PI * 2;
        const ka = clamp((b.t - (b.dropDur || 0)) / 0.25, 0, 1);
        const krot = ka * ka * (3 - 2 * ka);
        ctx.rotate(tgt * krot);
      }
      if (b.u) paintUnrealBomb(0, 0, 7, 1);
      else if (b.g) paintBaolingGBomb(0, 0, 7, 1);
      else paintBaolingBomb(0, 0, 7, 1);
      ctx.restore();
    }
  }

  // 虚幻寒冷区域：样式改为与寒霜冰蓝光圈同款（2026-10-04 用户反馈）——外缘亮的冰圈渐变 + 中心白雾核 +
  // 自中心喷发的雾团/雾粒 + 外侧虚线霜环 + 霜刺环 + 雪晶环布；渐入渐出（z.t/z.dur）与微呼吸保留。
  // 调用点：10-draw-world（drawBaolingBombs 之前，预警圈/炸弹之下的地面层）
  function drawFrostZones() {
    const TAU = Math.PI * 2;
    const prand = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
    for (const z of frostZones) {
      const fadeIn = clamp(z.t / 0.25, 0, 1);
      const fadeOut = clamp((z.dur - z.t) / 0.5, 0, 1);
      const base = Math.min(fadeIn, fadeOut);
      const ar = z.r;   // 世界半径（寒霜光圈在机体局部坐标绘制，此处为世界坐标层直接用区域半径）
      ctx.save();
      ctx.translate(z.x, z.y);
      ctx.globalAlpha = base * (0.78 + 0.22 * Math.sin(state.time * 2.2 + z.seed));
      // 主体光环：外缘亮、内部渐透明的径向渐变（冰圈质感，同寒霜）
      const halo = ctx.createRadialGradient(0, 0, ar * 0.30, 0, 0, ar);
      halo.addColorStop(0, 'rgba(143, 216, 255, 0)');
      halo.addColorStop(0.55, 'rgba(143, 216, 255, 0.10)');
      halo.addColorStop(0.82, 'rgba(170, 226, 255, 0.22)');
      halo.addColorStop(0.96, 'rgba(224, 246, 255, 0.30)');
      halo.addColorStop(1, 'rgba(143, 216, 255, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(0, 0, ar, 0, TAU); ctx.fill();
      // 白色雾气：中心常驻雾核（喷发源头）+ 8 个雾团自中心沿随机方位外扩（错相循环，同寒霜）
      const coreR = ar * 0.34;
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
      core.addColorStop(0, 'rgba(255, 255, 255, 0.20)');
      core.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(0, 0, coreR, 0, TAU); ctx.fill();
      for (let k = 0; k < 8; k++) {
        const cyc = (state.time * 0.20 + k * 0.31 + z.seed) % 1;   // 0→1 循环（各雾团错相，持续喷发）
        const ma = k * TAU / 8 + k * 1.7 + z.seed + Math.sin(state.time * 0.55 + k * 2.1) * 0.28;
        const mr = ar * (0.08 + 0.55 * cyc);              // 自中心向外扩散（最远至 0.63R）
        const mrad = ar * (0.09 + 0.21 * cyc);            // 雾团随扩散逐渐变大
        const mistA = Math.sin(cyc * Math.PI) * 0.22;     // 中段最浓、首尾淡出
        const mx = Math.cos(ma) * mr, my = Math.sin(ma) * mr;
        const mist = ctx.createRadialGradient(mx, my, 0, mx, my, mrad);
        mist.addColorStop(0, `rgba(255, 255, 255, ${mistA.toFixed(3)})`);
        mist.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = mist;
        ctx.beginPath(); ctx.arc(mx, my, mrad, 0, TAU); ctx.fill();
      }
      // 喷发雾粒层：10 粒确定性伪随机雾粒（方位含区域种子错相；时间驱动外扩+变大，首尾淡出循环再生，同寒霜）
      for (let k = 0; k < 10; k++) {
        const ang0 = prand(k * 3 + 1 + z.seed * 7) * TAU;
        const spd = 0.34 + prand(k * 3 + 2) * 0.30;       // 外扩速度（占半径比例/秒）
        const off = prand(k * 3 + 3) * 2.6;               // 出生错相
        const sway = (prand(k * 7 + 4) - 0.5) * 1.1;      // 飞行途中方位缓慢摆动幅度
        const life = 1.7 + prand(k * 7 + 5) * 1.0;        // 单次喷发存活时长（s）
        const tt = (state.time + off) % life;
        const pr = tt / life;
        const fade = Math.sin(pr * Math.PI);              // 中段最浓、出生/消散淡出
        const ma = ang0 + Math.sin(state.time * 0.7 + off * 3.1) * sway * 0.5;
        const rr = ar * (0.05 + spd * tt);
        const prad = ar * (0.07 + 0.13 * pr);
        const px = Math.cos(ma) * rr, py = Math.sin(ma) * rr;
        const puff = ctx.createRadialGradient(px, py, 0, px, py, prad);
        puff.addColorStop(0, `rgba(255, 255, 255, ${(0.26 * fade).toFixed(3)})`);
        puff.addColorStop(0.6, `rgba(230, 248, 255, ${(0.10 * fade).toFixed(3)})`);
        puff.addColorStop(1, 'rgba(230, 248, 255, 0)');
        ctx.fillStyle = puff;
        ctx.beginPath(); ctx.arc(px, py, prad, 0, TAU); ctx.fill();
      }
      // 外侧虚线霜环（缓慢流转，冰面纹路感）
      ctx.strokeStyle = 'rgba(190, 232, 255, 0.5)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([14, 10]);
      ctx.lineDashOffset = state.time * 9;
      ctx.beginPath(); ctx.arc(0, 0, ar * 0.84, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      // 内圈霜刺环：18 根径向冰刺 + 端点冰珠，缓慢正转、长短交错（同寒霜）
      ctx.save();
      ctx.rotate(state.time * 0.25 + z.seed);
      ctx.strokeStyle = 'rgba(205, 238, 255, 0.55)';
      ctx.fillStyle = 'rgba(230, 248, 255, 0.8)';
      ctx.lineWidth = 1.2;
      for (let k = 0; k < 18; k++) {
        const ta = k * TAU / 18;
        const r1 = ar * (k % 3 === 0 ? 0.61 : 0.63);
        const r2 = ar * 0.66;
        const cx1 = Math.cos(ta) * r1, cy1 = Math.sin(ta) * r1;
        const cx2 = Math.cos(ta) * r2, cy2 = Math.sin(ta) * r2;
        ctx.beginPath();
        ctx.moveTo(cx1, cy1);
        ctx.lineTo(cx2, cy2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx2, cy2, 1.2, 0, TAU);   // 冰刺端点冰珠
        ctx.fill();
      }
      ctx.restore();
      // 雪晶（6 芒星 ×6，环上均布 + 整体缓慢旋转，霜花凝结感，同寒霜）
      ctx.save();
      ctx.rotate(state.time * 0.35 + z.seed);
      ctx.strokeStyle = 'rgba(226, 246, 255, 0.75)';
      ctx.lineWidth = 1.2;
      for (let k = 0; k < 6; k++) {
        const fa = k * TAU / 6;
        const fx = Math.cos(fa) * ar * 0.92, fy = Math.sin(fa) * ar * 0.92;
        for (let m = 0; m < 6; m++) {
          const ma = m * TAU / 6;
          ctx.beginPath();
          ctx.moveTo(fx, fy);
          ctx.lineTo(fx + Math.cos(ma) * 3.2, fy + Math.sin(ma) * 3.2);
          ctx.stroke();
        }
      }
      ctx.restore();
      ctx.restore();
    }
  }

  // 破片红圈预警（挂在锁定的玩家位置）：快速脉动 + 内缩虚线瞄准环
  function drawPopianWarn(tx, ty, intensity) {
    const TAU = Math.PI * 2;
    const R = POPIAN.blastR;
    const p = 0.5 + Math.sin(state.time * 12) * 0.5;
    ctx.save();
    ctx.globalAlpha = 0.5 + intensity * 0.5;
    ctx.fillStyle = `rgba(255, 40, 40, ${(0.08 + intensity * 0.12 + p * 0.05).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(tx, ty, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255, 55, 55, ${(0.6 + p * 0.4).toFixed(3)})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(tx, ty, R, 0, TAU); ctx.stroke();
    const ir = R * (0.9 - intensity * 0.6);
    ctx.strokeStyle = 'rgba(255, 110, 90, 0.85)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([9, 7]);
    ctx.lineDashOffset = -state.time * 34;
    ctx.beginPath(); ctx.arc(tx, ty, ir, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 破片特效：红圈预警（遍历 popian / popianU 敌人的 e.warn）+ 三连发导弹（弹头朝飞行方向、尾焰拖尾）
  function drawPopianFx() {
    for (const e of enemies) {
      if ((e.type !== 'popian' && e.type !== 'popianU') || !e.warn) continue;
      drawPopianWarn(e.warn.tx, e.warn.ty, e.warn.t / POPIAN.warnTime);
    }
    for (const m of popianMissiles) {
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(Math.atan2(m.uy, m.ux) + Math.PI / 2);   // 令局部 -y（弹头）对齐飞行方向
      // 微弱尾焰（暗橙、低透明，不刺眼）
      const tg = ctx.createLinearGradient(0, 0, 0, m.r * 3.4);
      tg.addColorStop(0, 'rgba(150, 92, 52, 0.45)');
      tg.addColorStop(1, 'rgba(120, 70, 40, 0)');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.moveTo(-m.r * 0.4, 0); ctx.lineTo(m.r * 0.4, 0);
      ctx.lineTo(m.r * 0.18, m.r * 3.4); ctx.lineTo(-m.r * 0.18, m.r * 3.4);
      ctx.closePath(); ctx.fill();
      // 弹体：金属细长三角镖（破片专用，不复用炮火先兆者导弹、不发光；整体提亮一档）
      const bg = ctx.createLinearGradient(-m.r, 0, m.r, 0);
      bg.addColorStop(0, '#4a515c');
      bg.addColorStop(0.5, '#8b95a3');
      bg.addColorStop(1, '#4a515c');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(0, -m.r * 1.9);          // 弹头（朝飞行方向）
      ctx.lineTo(m.r * 0.72, m.r * 0.9);
      ctx.lineTo(m.r * 0.3, m.r * 1.2);
      ctx.lineTo(-m.r * 0.3, m.r * 1.2);
      ctx.lineTo(-m.r * 0.72, m.r * 0.9);
      ctx.closePath();
      ctx.fill();
      // 红弹尖（提亮 + 微光）
      ctx.fillStyle = '#c2473a';
      ctx.shadowColor = 'rgba(220, 80, 62, 0.6)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(0, -m.r * 1.9);
      ctx.lineTo(m.r * 0.34, -m.r * 0.6);
      ctx.lineTo(-m.r * 0.34, -m.r * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  /* ---------- 战争幽灵：机体 / 预警 / 斩击流绘制 ---------- */
  // 局部坐标约定同各机体：faceAng 0 = 机头朝下（+y）。金白配色：核心 #fff6d8 / 主金 #ffd24a / 深金 #c8901f。
  // 预览兼容：图鉴预览传最小假 spec（无 wg* 字段）——所有相位特效按 undefined 跳过，仅绘制常态机体。
  // ---------- 战争幽灵正式机体（2026-10-01 十轮完全对齐：用户反馈「游戏里的跟测试1图完全不一样」→
  //             主体直接采用测试1候选绘制集 wgCandBHull(WG_B_HULL/WG_B_LINES) + wgCandB2NoseFrame +
  //             候选帆配置 1:1 + wgCandBFinish 前半（导管/节点）+ wgCandCore(12,5)，与图鉴预览同源；
  //             正式专有仅存：尾焰三态（spdF 连续驱动 + phase 门控）与镰刃抵达演出（wgGhostSickle alpha 版） ----------

  // B2 移植：单侧巨镰（定稿形状 66/9.5，沿 +y 前指）+ 根部辉光球盖接缝（wgCandBlades 拆装版：
  // alpha 可控——供抵达演出旋转化淡 / 翼上归鞘淡入复用；候选常态双刃仍走 wgCandBlades）
  function wgGhostSickle(g, t, alpha, len) {
    wgCandSickle(g, len, 9.5, t * 0.7, alpha);   // 双刃流光同相位
    g.shadowColor = WG_C1; g.shadowBlur = 10;
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, 8);
    rg.addColorStop(0, `rgba(255, 246, 216, ${(0.9 * alpha).toFixed(3)})`);
    rg.addColorStop(1, 'rgba(255, 210, 74, 0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill();
  }

  /* ---------- 战争幽灵重绘候选（测试1页评选用）：paintWarGhostCandidate(g, t, idx) ----------
     局部坐标同 drawWarGhostBody：原点=机体中心、机头朝下(+y)；相位全部由传入 t（秒）驱动，不读 state.time。
     金白家族配色不变（核心 #fff6d8 / 主金 #ffd24a / 深金 #c8901f / 暗金 #8a5f10）。
     2026-09-30 四轮：按用户指令清除机身 A/C/D；现评选机身 B 及其 4 个「机翼增长 + 尾翼/侧翼」增翼变体：
     2026-09-30 五轮：增翼方案全部重做——参考玩家机「混乱将至」暴走尾翼/刃帆语言（窄长三角鳍、尖端侧后远扫、
                    渐变能量片质感，见本文件 paintShip 暴走分支），金白化配色：
     2026-10-01 六轮：用户选定 B2 为迭代基底——机头外侧框架白银渐变（wgCandB2NoseFrame）/ 能量核改正五边形
                    （一角竖直朝下，wgCandCore sides=5）/ 尾焰三道。
     2026-10-01 七轮：候选收敛为 B2 单体（B/B1/B3/B4 绘制函数与卡片已按用户指令删除）——机头白银框架加宽一倍
                    （lineWidth 2→4）/ 五边形核心银白包边 + 中心红点 / 三道尾焰分离至三个喷口
                    （中央机尾 [0,-20] + 两舷后角 [±13,-26]，wgCandFlame）。
     2026-10-01 八轮：机头框架整体提白 + 金属高光带反弹（消除死灰感）/ 核心包边改白金渐变（白热→主金）
                    + 删除中心红点 / 巨镰中脊线增粗（1.6→3.2）且根部亮白热渐入、与相连机翼平滑融合 /
                    双刃流光同相位 + 行程延伸至刃尖（0.05→0.96）/ 三喷口间距两度增大（±13→±17→±20）/
                    机头框架二度提白 + 宽度缩短 20%（4→3.2）+ 白银边框延伸至两翼前缘（与鼻锥外缘连成一条）。
                    确认后连同巨镰双刃移植进正式机体 drawWarGhostBody。
     2026-10-01 九轮（移植）：B2 定稿 → 正式机体移植（白银边框正式轮廓版 / 帆等比放大 / 五边形核 / 巨镰双刃
                    wgGhostSickle 替换旧 drawWarGhostBlade，抵达演出/离场拉长适配；尾焰三态 spdF 驱动）。
     2026-10-01 十轮（完全对齐）：用户反馈游戏内与测试1图差异过大 → 正式主体整体换用候选绘制集
                    （wgCandBHull + WG_B_HULL/WG_B_LINES + wgCandB2NoseFrame + 候选帆 1:1 + 导管节点 +
                    wgCandCore 12,5；镰挂载 ±22,-12、尾焰喷口 (0,-20)/(±20,-28) 同测试1图），
                    wgB2FrameLive/wgB2Sails 删除；正式专有仅存尾焰三态与镰刃抵达演出。 */
  const WG_C0 = '#fff6d8', WG_C1 = '#ffd24a', WG_C2 = '#c8901f', WG_C3 = '#8a5f10';

  // 候选通用：镰形刃（根部窄→中段宽→尖端收锋）+ 白热脊线 + 流光带沿刃身循环下扫（flowT 以 1 为周期）
  function wgCandSickle(g, len, midW, flowT, alpha) {
    g.save();
    g.globalAlpha = alpha;
    const bg = g.createLinearGradient(0, 0, 0, len);
    bg.addColorStop(0, WG_C2);
    bg.addColorStop(0.45, WG_C1);
    bg.addColorStop(1, WG_C0);
    g.fillStyle = bg;
    g.shadowColor = 'rgba(255, 210, 74, 0.9)';
    g.shadowBlur = 12;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(midW, len * 0.35, 0, len);
    g.quadraticCurveTo(-midW, len * 0.35, 0, 0);
    g.fill();
    // 中脊线（八轮：增粗 + 平滑融入机翼）——根部亮白热渐入（衔接根部辉光球，全程不暗淡）→ 中段主金 → 前段白热；
    // 宽度两段式：根部 2.2 渐入跟窄刃身 → 主段 3.2 定宽
    g.shadowBlur = 0;
    g.lineCap = 'round';
    const spRoot = g.createLinearGradient(0, len * 0.02, 0, len * 0.34);
    spRoot.addColorStop(0, 'rgba(255, 246, 216, 0.72)');  // 根端亮白热（与根部辉光球同色衔接，不暗淡）
    spRoot.addColorStop(1, 'rgba(255, 210, 74, 0.9)');    // 过渡到主金
    g.strokeStyle = spRoot;
    g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(0, len * 0.02); g.lineTo(0, len * 0.34); g.stroke();
    const spMid = g.createLinearGradient(0, len * 0.3, 0, len * 0.52);
    spMid.addColorStop(0, 'rgba(255, 210, 74, 0.9)');     // 主金
    spMid.addColorStop(1, 'rgba(255, 246, 216, 0.92)');   // 过渡到白热
    g.strokeStyle = spMid;
    g.lineWidth = 3.2;
    g.beginPath(); g.moveTo(0, len * 0.3); g.lineTo(0, len * 0.52); g.stroke();
    g.strokeStyle = 'rgba(255, 246, 216, 0.92)';
    g.beginPath(); g.moveTo(0, len * 0.5); g.lineTo(0, len * 0.93); g.stroke();
    // 刃身流光带：白亮小段沿脊线循环下扫（行程延伸至刃尖，0.05→0.96）
    const fy = len * (0.05 + (flowT % 1) * 0.91);
    g.strokeStyle = WG_C0;
    g.lineWidth = 2.6;
    g.shadowColor = WG_C0;
    g.shadowBlur = 6;
    g.globalAlpha = alpha * 0.85;
    g.beginPath(); g.moveTo(0, fy - 5); g.lineTo(0, fy + 5); g.stroke();
    g.restore();
  }

  // 候选通用：机身多边形（金白流光渐变，止点随 flow 平移）+ 深金描边
  function wgCandHull(g, pts, flow, strokeW) {
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.closePath();
    const hull = g.createLinearGradient(0, -24 - flow * 6, 0, 36 + flow * 6);
    hull.addColorStop(0, WG_C3);
    hull.addColorStop(0.35 + flow * 0.1, WG_C1);
    hull.addColorStop(0.62 + flow * 0.08, WG_C0);
    hull.addColorStop(1, WG_C2);
    g.fillStyle = hull;
    g.shadowColor = 'rgba(255, 210, 74, 0.55)';
    g.shadowBlur = 14;
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(90, 62, 8, 0.9)';
    g.lineWidth = strokeW || 1.2;
    g.stroke();
  }

  // 候选通用：机尾喷焰（静态预览装饰，长度随 t 高频抖动）；B2 三喷口分离布置——中央机尾主焰 +
  // 两舷后角副焰（喷口 [0,-20] / [±20,-28]，八轮两度增大间距），相位随喷口错开防同步抖动
  function wgCandFlame(g, t) {
    const streams = [[0, -20, 5, 1], [-20, -28, 3.5, 0.72], [20, -28, 3.5, 0.72]];   // [喷口x, 喷口y, 半宽, 长度系数]
    for (const [ox, oy, w, lf] of streams) {
      const fl = (13 + Math.sin(t * 26 + ox * 1.7) * 2.5) * lf;
      const fg = g.createLinearGradient(0, oy, 0, oy - fl);
      fg.addColorStop(0, 'rgba(255, 240, 190, 0.7)');
      fg.addColorStop(0.4, 'rgba(255, 210, 74, 0.4)');
      fg.addColorStop(1, 'rgba(200, 144, 31, 0)');
      g.fillStyle = fg;
      g.beginPath();
      g.moveTo(ox - w, oy); g.lineTo(ox + w, oy); g.lineTo(ox, oy - fl);
      g.closePath();
      g.fill();
    }
  }

  // 候选通用：中央能量核（白热脉动；r 为渐变半径）——默认纵长菱形；sides=5 时为正五边形
  // （一枚角竖直朝下 + 白金渐变包边 + 核心 (0,2) 略后移，B2 八轮定稿形态）
  function wgCandCore(g, pulse, r, sides) {
    const cy = 2;   // 核心中心 y（+y 朝机头，正值偏前；2 = 较原 4 略后移，八轮微调）
    g.save();
    g.shadowColor = WG_C0;
    g.shadowBlur = 6 + pulse * 6;
    const core = g.createRadialGradient(0, cy, 0, 0, cy, r);
    core.addColorStop(0, WG_C0);
    core.addColorStop(0.55, 'rgba(255, 210, 74, 0.85)');
    core.addColorStop(1, 'rgba(255, 210, 74, 0)');
    g.fillStyle = core;
    g.beginPath();
    if (sides === 5) {
      // 正五边形：外接圆半径 0.85r、中心 (0,cy)，首角 90°（竖直朝下），其余每 72° 一枚
      const R = r * 0.85;
      for (let k = 0; k < 5; k++) {
        const a = Math.PI / 2 + k * (Math.PI * 2 / 5);
        const px = Math.cos(a) * R, py = cy + Math.sin(a) * R;
        k ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
      g.fill();
      // 白金渐变包边：五边形核心外圈描边（顶部白热 → 底部主金，随脉动微光），B2 八轮定稿
      const rim = g.createLinearGradient(0, cy - R, 0, cy + R);
      rim.addColorStop(0, '#fff6d8');
      rim.addColorStop(1, '#ffd24a');
      g.shadowColor = WG_C1;
      g.shadowBlur = 2 + pulse * 3;
      g.strokeStyle = rim;
      g.lineWidth = 2;
      g.stroke();
      g.shadowBlur = 0;
    } else {
      g.moveTo(0, cy - r * 0.73); g.lineTo(r * 0.45, cy); g.lineTo(0, cy + r * 1.09); g.lineTo(-r * 0.45, cy);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  // 候选统一：巨镰双刃（定稿形状：长 66 / 中宽 9.5；方向与机头一致——沿机头轴向 +y 前指、与机身平行），根部辉光球盖接缝
  function wgCandBlades(g, t, mx, my) {
    for (const s of [-1, 1]) {
      g.save();
      g.translate(s * mx, my);
      g.scale(s, 1);         // 左右镜像：镰刃中段外凸一致朝外缘（左刃镜像后方向仍与机头同向）
      wgCandSickle(g, 66, 9.5, t * 0.7, 0.96);   // 双刃流光同相位（八轮：用户要求两条同时进行）
      g.restore();
      g.save();
      g.translate(s * mx, my);
      g.shadowColor = WG_C1; g.shadowBlur = 10;
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, 8);
      rg.addColorStop(0, 'rgba(255, 246, 216, 0.9)');
      rg.addColorStop(1, 'rgba(255, 210, 74, 0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }

  // B 系公共：机身主体（hull 轮廓 + 肩部装甲块 + 中脊/自定义结构线 + 炮口热点）
  // pts=hull 轮廓点集；lines=随翼形变化的结构线段 [x1,y1,x2,y2][]；(hotX,hotY)=炮口白热点位置（两舷前角）
  function wgCandBHull(g, t, pts, lines, hotX, hotY) {
    const flow = Math.sin(t * 2.0) * 0.5 + Math.sin(t * 3.1 + 0.7) * 0.5;
    wgCandHull(g, pts, flow, 1.4);
    // 肩部装甲斜面块（半透明白金覆盖 + 镜像，重甲体积感）
    const armor = [[3, 18], [12, 12], [19, 0], [13, -1], [4, 9]];
    for (const s of [-1, 1]) {
      g.beginPath();
      armor.forEach((p, i) => (i ? g.lineTo(s * p[0], p[1]) : g.moveTo(s * p[0], p[1])));
      g.closePath();
      g.fillStyle = `rgba(255, 246, 216, ${(0.08 + 0.04 * Math.sin(t * 2.6)).toFixed(3)})`;
      g.fill();
    }
    // 中脊 + 自定义结构线（舷侧 / 翼后缘 / 翼尖，随翼形传入）
    g.strokeStyle = `rgba(255, 246, 216, ${(0.26 + 0.2 * Math.sin(t * 2.2)).toFixed(3)})`;
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, 32); g.lineTo(0, -16);
    for (const L of lines) { g.moveTo(L[0], L[1]); g.lineTo(L[2], L[3]); }
    g.stroke();
    // 炮口白热点（两舷前角，亮度呼吸）
    for (const s of [-1, 1]) {
      g.save();
      g.shadowColor = WG_C0; g.shadowBlur = 6;
      g.fillStyle = `rgba(255, 246, 216, ${(0.6 + 0.4 * Math.sin(t * 4.2)).toFixed(3)})`;
      g.beginPath(); g.arc(s * hotX, hotY, 2.2, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }

  // B 系公共尾部：翼面供能导管（舷侧→双刃挂载井）+ 翼尖节点 + 巨镰双刃（挂载 ±22,-12 贴舷前指）+ 中央能量核（coreSides=5 时为正五边形）
  function wgCandBFinish(g, t, tipX, tipY, coreSides) {
    g.strokeStyle = `rgba(255, 210, 74, ${(0.3 + 0.25 * Math.sin(t * 3.2)).toFixed(3)})`;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(15, -6); g.quadraticCurveTo(21, -6, 20.5, -11);
    g.moveTo(-15, -6); g.quadraticCurveTo(-21, -6, -20.5, -11);
    g.stroke();
    g.fillStyle = `rgba(255, 246, 216, ${(0.55 + 0.35 * Math.sin(t * 3.4)).toFixed(3)})`;
    for (const s of [-1, 1]) {
      g.beginPath(); g.arc(s * tipX, tipY, 1.6, 0, Math.PI * 2); g.fill();
    }
    wgCandBlades(g, t, 22, -12);
    wgCandCore(g, 0.6 + Math.sin(t * 2.6) * 0.4, 12, coreSides);
  }

  // B 系基线 hull / 结构线常量（翼展 34 三轮微调版，各变体共用）
  const WG_B_HULL = [
    [0, 38], [12, 14], [15, 2], [26, -2], [34, -18], [28, -30], [13, -26], [0, -20],
    [-13, -26], [-28, -30], [-34, -18], [-26, -2], [-15, 2], [-12, 14],
  ];
  const WG_B_LINES = [
    [15, 2, 26, -2], [-15, 2, -26, -2],
    [28, -30, 13, -26], [-28, -30, -13, -26],
    [34, -18, 28, -30], [-34, -18, -28, -30],
  ];

  // B 系公共：刃帆三角鳍（参考「混乱将至」暴走尾翼/刃帆语言，金白化）——窄长三角、根部贴机身/翼面、
  // 尖端向侧后远扫；根部深金 → 0.25 主金 → 尖端白热渐变 + 细金描边 + 主金辉光；alpha 控制层级亮度，轻微呼吸
  // base=[x1,y1,x2,y2] 鳍根两点（位于机身/翼面上），tip=[tx,ty] 尖端
  function wgCandSail(g, t, base, tip, alpha) {
    const bg = g.createLinearGradient(base[0], base[1], tip[0], tip[1]);
    bg.addColorStop(0, WG_C2);
    bg.addColorStop(0.25, WG_C1);
    bg.addColorStop(1, WG_C0);
    g.save();
    g.globalAlpha = alpha * (0.92 + 0.08 * Math.sin(t * 2.6));   // 轻微呼吸
    g.fillStyle = bg;
    g.strokeStyle = 'rgba(255, 210, 74, 0.55)';
    g.lineWidth = 0.9;
    g.shadowColor = WG_C1;
    g.shadowBlur = 7;
    g.beginPath();
    g.moveTo(base[0], base[1]);
    g.lineTo(tip[0], tip[1]);
    g.lineTo(base[2], base[3]);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  // 机身 B2 · 四帆展开（2026-10-01 用户选定基底）：暴走 4 刃帆语言 + 机头外侧白银渐变框架 + 正五边形能量核（一角竖直朝下）+ 三喷口分离尾焰
  // B2 专属：机头外侧框架 + 两翼前缘——白银金属渐变描边（整体偏白 + 高光带反弹）+ 微呼吸；
  // 八轮：机翼前方（翼前缘 (±15,2)→(±26,-2)→(±34,-18)）与鼻锥外缘 (0,38)→(±12,14)→(±15,2) 连成一条，
  // 渐变沿全长（y 38→-18）分布：鼻尖白热 → 高光带 → 微暗反差 → 翼尖亮白银
  function wgCandB2NoseFrame(g, t) {
    const fg = g.createLinearGradient(0, 38, 0, -18);
    fg.addColorStop(0, '#ffffff');     // 鼻尖白热
    fg.addColorStop(0.25, '#f2f7fb');  // 鼻锥亮白银
    fg.addColorStop(0.45, '#fbfdfe');  // 金属高光带（反弹提亮）
    fg.addColorStop(0.7, '#e2eaef');   // 翼前缘微暗反差（金属感来源，已提白）
    fg.addColorStop(1, '#f4f9fc');     // 翼尖回亮白银
    g.save();
    g.strokeStyle = fg;
    g.lineWidth = 3.2;   // 八轮：宽度缩短 20%（4→3.2）
    g.lineCap = 'round';
    g.shadowColor = 'rgba(248, 252, 254, 0.95)';
    g.shadowBlur = 5;
    g.globalAlpha = 0.9 + 0.1 * Math.sin(t * 2.4);   // 微呼吸
    g.beginPath();
    g.moveTo(0, 38); g.lineTo(12, 14); g.lineTo(15, 2); g.lineTo(26, -2); g.lineTo(34, -18);
    g.moveTo(0, 38); g.lineTo(-12, 14); g.lineTo(-15, 2); g.lineTo(-26, -2); g.lineTo(-34, -18);
    g.stroke();
    g.restore();
  }
  function wgCandB2(g, t) {
    wgCandFlame(g, t);
    wgCandBHull(g, t, WG_B_HULL, WG_B_LINES, 25, -1);
    wgCandB2NoseFrame(g, t);
    for (const s of [-1, 1]) {
      wgCandSail(g, t, [s * 30, -16, s * 30, -24], [s * 44, -30], 0.8);   // 帆1（翼尖，最大）
      wgCandSail(g, t, [s * 24, -12, s * 24, -19], [s * 38, -28], 0.72);  // 帆2
      wgCandSail(g, t, [s * 18, -8, s * 18, -14], [s * 30, -24], 0.66);   // 帆3
      wgCandSail(g, t, [s * 12, -4, s * 12, -9], [s * 22, -19], 0.6);     // 帆4（舷侧，最小）
    }
    wgCandBFinish(g, t, 31, -19, 5);
  }

  // 统一入口：测试1页唯一候选（B2 · 四帆展开）；确认后连同巨镰双刃移植回 drawWarGhostBody
  function paintWarGhostCandidate(g, t) {
    wgCandB2(g, t);
  }

  function drawWarGhostBody(e) {
    const TAU = Math.PI * 2;
    const t = state.time;
    const pulse = 0.6 + Math.sin(t * 3.0 + (e.wobble || 0)) * 0.4;
    const phase = e.wgPhase;
    ctx.save();
    ctx.rotate(e.wgFace != null ? e.wgFace : (e.faceAng || 0));   // 机头朝向（驻留追踪玩家 / 入离场对齐航向）

    // ---- 尾焰（图层最底）：中央主焰常燃，长度/亮度由 spdF 连续驱动（常态短焰 22 → 冲刺满速 114，B2 移植略增）；
    // 入场冲刺（phase 1）/ 离场斩出（phase 5）两舷副焰点火（三焰态，喷口贴尾角外缘）；挑战预览（无速度）仅常态短焰 ----
    const spdF = clamp((e.wgSpd || 0) / WAR_GHOST.exitMaxSpeed, 0, 1);
    const drawGhostFlame = (ox, oy, w, boost) => {
      const fl = (22 + 92 * spdF) * boost * (0.85 + Math.sin(t * 40 + ox * 2.1) * 0.15);   // 抖动相位随喷口错开
      const fg = ctx.createLinearGradient(0, oy, 0, oy - fl);
      fg.addColorStop(0, `rgba(255, 240, 190, ${Math.min(1, (0.5 + 0.3 * spdF) * boost).toFixed(3)})`);
      fg.addColorStop(0.4, `rgba(255, 210, 74, ${((0.35 + 0.25 * spdF) * boost).toFixed(3)})`);
      fg.addColorStop(1, 'rgba(200, 144, 31, 0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(ox - w, oy);
      ctx.lineTo(ox + w, oy);
      ctx.lineTo(ox, oy - fl);
      ctx.closePath();
      ctx.fill();
    };
    drawGhostFlame(0, -20, 5, 1);   // 中央主焰（常燃，喷口同测试1图机尾凹口）
    if ((e.wgPhase === 1 || e.wgPhase === 5) && spdF > 0.03) {
      drawGhostFlame(-20, -28, 3.5, 0.72);   // 两舷后角副焰（冲刺态三焰点火，喷口同测试1图）
      drawGhostFlame(20, -28, 3.5, 0.72);
    }

    // ---- 主体（B2 定稿同款绘制集，与测试1图 1:1）：hull 金黄渐变流动 + 肩部装甲块 + 结构线 + 炮口白热点 ----
    wgCandBHull(ctx, t, WG_B_HULL, WG_B_LINES, 25, -1);

    // ---- 白银连续边框（鼻锥外缘 + 翼前缘连成一条，候选同款）----
    wgCandB2NoseFrame(ctx, t);

    // ---- 四帆刃帆（候选同款配置：帆1 翼尖最大 → 帆4 舷侧最小，根贴翼面尖向侧后远扫）----
    for (const s of [-1, 1]) {
      wgCandSail(ctx, t, [s * 30, -16, s * 30, -24], [s * 44, -30], 0.8);   // 帆1（翼尖，最大）
      wgCandSail(ctx, t, [s * 24, -12, s * 24, -19], [s * 38, -28], 0.72);  // 帆2
      wgCandSail(ctx, t, [s * 18, -8, s * 18, -14], [s * 30, -24], 0.66);   // 帆3
      wgCandSail(ctx, t, [s * 12, -4, s * 12, -9], [s * 22, -19], 0.6);     // 帆4（舷侧，最小）
    }

    // ---- 翼面供能导管（舷侧→镰刃挂载井 ±22,-12）+ 翼尖节点（取自 wgCandBFinish 前半，镰/核按演出需求另绘）----
    ctx.strokeStyle = `rgba(255, 210, 74, ${(0.3 + 0.25 * Math.sin(t * 3.2)).toFixed(3)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(15, -6); ctx.quadraticCurveTo(21, -6, 20.5, -11);
    ctx.moveTo(-15, -6); ctx.quadraticCurveTo(-21, -6, -20.5, -11);
    ctx.stroke();
    ctx.fillStyle = `rgba(255, 246, 216, ${(0.55 + 0.35 * Math.sin(t * 3.4)).toFixed(3)})`;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(s * 31, -19, 1.6, 0, TAU); ctx.fill();
    }

    // ---- 中央能量核（B2 定稿：正五边形白金包边 + 核心 (0,2) 后移，白热脉动）----
    wgCandCore(ctx, pulse, 12, 5);

    // ---- 巨镰双刃（B2 定稿形状 66/9.5，贴舷前指与机头同向）：常态挂载于舷侧挂载井（±22,-12，同测试1图）；
    // 抵达演出期双刃向外侧旋转扫斩 150°（白金刃气拖尾）后交回挂载井；技能1「两刃斩击」扫斩期
    // 复用同款动画（e.wgSweepT 驱动，2026-10-02 用户定稿登场两侧斩击动作即「两刃斩击」并入技能循环）----
    const wingIn = { x: -22, y: -12 };   // 左舷挂载点（右舷镜像）
    // 演出进度时钟源：phase 2 抵达演出用 wgT（三段完整动画）；技能1「两刃斩击」伸长已并入预警期
    //（2026-10-02 用户定稿「预警开始两刃就伸长、预警结束时已最长、结束直接开始斩击」）——
    // 预警期（wgSkill kind1 且 sweepT==null）用 s.t/fanWarn 平滑伸长、贴舷前指不旋转；
    // 扫斩期用 wgSweepT 且时间轴前移 growEnd（跳过增长段，预警一结束直接进入扫斩段）
    const skill1Warn = phase !== 2 && e.wgSkill && e.wgSkill.kind === 1 && e.wgSkill.sweepT == null;
    const arriveP = phase === 2
      ? clamp(e.wgT / WAR_GHOST.arriveFxDur, 0, 1)
      : (e.wgSweepT != null ? clamp((WAR_GHOST.arriveGrowDur + e.wgSweepT) / WAR_GHOST.arriveFxDur, 0, 1)
      : (skill1Warn ? clamp(e.wgSkill.t / WAR_GHOST.fanWarn, 0, 1) : -1));
    if (arriveP >= 0) {
      // 抵达演出四段完整动画（2026-10-02 第八轮定稿「先增长、再斩击」+ 第十轮定稿「斩后停持、随后缩短并缓速转回」；
      // 2026-10-03 定稿停持 0.40→0.15s、扫斩特效扫斩结束即快速消散、扫斩峰值角速度 +70%）：
      // ① 刃增长段：双刃 66→斩击刃长快速伸长（二次 easeOut），保持贴舷前指、不旋转（仅抵达演出；
      //    技能1 伸长已并入预警期，不走本段）；
      // ② 扫斩段：角速度 0 起步（二次 easeIn 加速，大角加速度）→ 峰值 ≈1170°/s（2026-10-03 用户定稿 +70%：
      //    曲线形状不变、总角 150° 不变、时长等比缩短 0.315→0.185s）→ 65% 行程后 smoothstep 减速到 0（快结束时开始减速），
      //    左刃向左外、右刃向右外各扫 150°，
      //    扫过路径拖白金刃气弧（弧头白热亮斑、尾渐隐、辉光）+ 金色爆发扩散环；
      // ③ 斩后停持段（0.10s）：双刃在斩后位置（150° 全开）停留，刃气弧/弧头亮斑已在扫斩结束 0.06s 内快速消散；
      // ④ 归鞘段（0.5s 缓速）：刃转回贴舷前指并缩回 66（smoothstep 起停平滑），舷上镰接管
      const tAbs = Math.min(phase === 2 ? e.wgT : WAR_GHOST.arriveGrowDur + (e.wgSweepT != null ? e.wgSweepT : 0), WAR_GHOST.arriveFxDur);   // 演出绝对时钟（s）
      const growEnd = WAR_GHOST.arriveGrowDur;
      const sweepEnd = growEnd + WAR_GHOST.arriveSweepDur;
      const holdEnd = sweepEnd + WAR_GHOST.arriveHoldDur;
      const arcR = phase === 2 ? 92 : 110.4;                              // 斩击态刃长（66→92；技能1 两刃斩击复用时 ×1.2 = 110.4，与判定 sweepReach 180 同倍率）
      let sweep = 0, sm = 0, len = 66, swProg = 0;                        // swProg：扫斩进度（刃气强度用；停持/归鞘段保持 1 随 sm 淡出）
      // 扫斩特效（刃气弧 + 弧头白热亮斑）消散因子：扫斩结束后 ≈0.06s 快速淡出（2026-10-03 用户定稿「停留阶段不再有刃尖特效」；
      // 窗口 0.06s < 停持 0.10s——停持缩短后同步收紧，保证停持后段完全无特效）
      const fxFade = tAbs <= sweepEnd ? 1 : Math.max(0, 1 - (tAbs - sweepEnd) / 0.06);
      if (skill1Warn) {
        // 技能1 预警伸长：smoothstep 66→arcR（起停均平滑无瞬变），预警结束时恰为最长；贴舷前指不旋转、无刃气无爆发环
        const u = clamp(e.wgSkill.t / WAR_GHOST.fanWarn, 0, 1);
        len = 66 + (arcR - 66) * (u * u * (3 - 2 * u));
      } else if (tAbs <= growEnd) {
        // ① 刃增长段：二次 easeOut 伸长，角度保持贴舷前指
        const gu = clamp(tAbs / growEnd, 0, 1);
        len = 66 + (arcR - 66) * (1 - (1 - gu) * (1 - gu));
      } else if (tAbs <= sweepEnd) {
        // ② 扫斩段：θ(u) 为角速度曲线的积分（加速段 0~20% 二次 easeIn / 巡航段 20%~65% 峰值 /
        //    减速段 65%~100% smoothstep 到 0）；I 为归一化角位移，总面积 0.6917
        const u = clamp((tAbs - growEnd) / WAR_GHOST.arriveSweepDur, 0, 1);
        let I;
        if (u <= 0.2) I = (u * u * u) / 0.12;
        else if (u <= 0.65) I = 0.0667 + (u - 0.2);
        else { const s2 = (u - 0.65) / 0.35; I = 0.5167 + 0.35 * (s2 * s2 * s2 - (s2 * s2 * s2 * s2) / 2); }
        sweep = (I / 0.6917) * (150 * Math.PI / 180);
        len = arcR;
        swProg = u;
      } else if (tAbs <= holdEnd) {
        // ③ 斩后停持段：保持扫斩末帧姿态（150° 全开、全长），无运动
        sweep = 150 * Math.PI / 180;
        len = arcR;
        swProg = 1;
      } else {
        // ④ 归鞘段（缓速）：刃转回贴舷（rotate 回 0）+ 长度收回 66，smoothstep 起停平滑
        sweep = 150 * Math.PI / 180;
        const mix = clamp((tAbs - holdEnd) / (WAR_GHOST.arriveFxDur - holdEnd), 0, 1);
        sm = mix * mix * (3 - 2 * mix);
        len = arcR + (66 - arcR) * sm;
        swProg = 1;
      }
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(s * -wingIn.x, wingIn.y);
        ctx.scale(s, 1);
        // 白金刃气弧（扫过路径拖尾）：刃指向角自 π/2（贴舷前指）扫向 π/2-sweep（镜像后即向外侧展开）
        if (sweep > 0.03) {
          const a1 = Math.PI / 2 - sweep;                      // 当前刃指向角
          const tailA = a1 + Math.min(1.35, sweep) * 0.75;     // 拖尾角（朝旧路径回卷，弧长上限 ≈58°）
          const ga = (1 - sm) * (0.45 + swProg * 0.55) * fxFade;   // 刃气强度（归鞘期淡出；扫斩结束 0.1s 内随 fxFade 快速消散）
          const gx0 = Math.cos(tailA) * len, gy0 = Math.sin(tailA) * len;
          const gx1 = Math.cos(a1) * len, gy1 = Math.sin(a1) * len;
          // 刃身流光拖尾（2026-10-03 用户定稿重做：整片环形扇区填充观感敷衍，改 3 道错落弧形流光——
          // 半径/相位/弧长错开：内道滞后长弧、外道贴刃最亮短弧，各道沿弧向「亮头→透明尾」线性渐变 +
          // 金芒辉光，乘 ga 含 fxFade 消散——与主刃气弧同语言、随扫转持续更新）
          const streams = [
            { r: 0.52, off: 0.30, span: 0.95, w: 5, al: 0.26 },   // 内道：半径比 / 头部滞后（×sweep）/ 弧长 / 线宽 / 强度
            { r: 0.74, off: 0.18, span: 0.80, w: 6, al: 0.34 },
            { r: 0.95, off: 0.08, span: 0.62, w: 7, al: 0.42 },   // 外道贴近刃体最亮
          ];
          ctx.lineCap = 'round';
          ctx.shadowColor = 'rgba(255, 236, 180, 0.75)';
          ctx.shadowBlur = 9;
          for (const st of streams) {
            const rr = len * st.r;
            const sa1 = a1 + st.off * Math.min(1, sweep / (150 * Math.PI / 180)) * 0.9;   // 流光头（相对已扫进度滞后）
            const sa2 = sa1 + st.span * Math.min(1, sweep / (150 * Math.PI / 180)) * 0.9; // 流光尾（随扫转逐渐拉长）
            const hxs = Math.cos(sa1) * rr, hys = Math.sin(sa1) * rr;
            const txs = Math.cos(sa2) * rr, tys = Math.sin(sa2) * rr;
            const lg = ctx.createLinearGradient(hxs, hys, txs, tys);
            lg.addColorStop(0, `rgba(255, 248, 226, ${(st.al * ga).toFixed(3)})`);
            lg.addColorStop(0.5, `rgba(255, 240, 205, ${(st.al * ga * 0.5).toFixed(3)})`);
            lg.addColorStop(1, 'rgba(255, 232, 170, 0)');
            ctx.strokeStyle = lg;
            ctx.lineWidth = st.w;
            ctx.beginPath(); ctx.arc(0, 0, rr, sa1, sa2); ctx.stroke();
          }
          ctx.shadowBlur = 0;
          const ga2 = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
          ga2.addColorStop(0, 'rgba(255, 210, 74, 0)');
          ga2.addColorStop(0.5, `rgba(255, 238, 200, ${(0.6 * ga).toFixed(3)})`);
          ga2.addColorStop(1, `rgba(255, 255, 255, ${Math.min(1, 0.95 * ga).toFixed(3)})`);
          ctx.strokeStyle = ga2;
          ctx.lineWidth = 11;
          ctx.lineCap = 'round';
          ctx.shadowColor = 'rgba(255, 244, 214, 0.95)';
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.arc(0, 0, len, a1, tailA);   // a1 < tailA：顺时针弧 = 扫过路径
          ctx.stroke();
          // 弧头白热亮斑
          const hg = ctx.createRadialGradient(gx1, gy1, 0, gx1, gy1, 16);
          hg.addColorStop(0, `rgba(255, 255, 255, ${(0.9 * ga).toFixed(3)})`);
          hg.addColorStop(1, 'rgba(255, 240, 205, 0)');
          ctx.fillStyle = hg;
          ctx.beginPath(); ctx.arc(gx1, gy1, 16, 0, TAU); ctx.fill();
          ctx.shadowBlur = 0;
        }
        // 旋转中的镰刃（增长 → 外扫 → 归鞘回转缩回）
        ctx.rotate(-sweep * (1 - sm));
        wgGhostSickle(ctx, t, 1 - sm * 0.85, len);
        ctx.restore();
      }
      // 金色爆发扩散环（扫斩开始时展开、渐隐）
      const rp = clamp((tAbs - growEnd) / (WAR_GHOST.arriveFxDur - growEnd), 0, 1);
      if (rp > 0 && rp < 1) {
        ctx.strokeStyle = `rgba(255, 230, 140, ${((1 - rp) * 0.8).toFixed(3)})`;
        ctx.lineWidth = 3 * (1 - rp) + 0.8;
        ctx.beginPath(); ctx.arc(0, 0, 10 + rp * 54, 0, TAU); ctx.stroke();
      }
      // 空间涟漪（2026-10-03 用户定稿「斩击时掀起一定空间涟漪」）：扫斩激发 2 道错相（延迟 0.09s）扩散涟漪环，
      // 自机体中心荡开（26→144px、alpha 平方渐隐、白金细环+辉光）——场效应随扫斩激发后自然荡开至演出末
      // 消散（与爆发环同生命周期语义，非刃尖特效、不受 fxFade 门控；技能1 原地扫斩同享）
      for (let k = 0; k < 2; k++) {
        const pr = clamp((tAbs - growEnd - k * 0.09) / 0.5, 0, 1);
        if (pr <= 0 || pr >= 1) continue;
        ctx.strokeStyle = `rgba(255, 246, 224, ${((1 - pr) * (1 - pr) * 0.42).toFixed(3)})`;
        ctx.lineWidth = 2.4 * (1 - pr) + 0.6;
        ctx.shadowColor = 'rgba(255, 240, 210, 0.8)';
        ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(0, 0, 26 + pr * 118, 0, TAU); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      if (sm > 0.02) {   // 舷上镰淡入（归鞘完成态由挂载井接管）
        for (const s of [-1, 1]) {
          ctx.save();
          ctx.translate(s * -wingIn.x, wingIn.y);
          ctx.scale(s, 1);
          wgGhostSickle(ctx, t, sm * 0.96, 66);
          ctx.restore();
        }
      }
    } else {
      // 常态：双镰贴舷前指挂载（离场斩出时刃沿航向微拉长 66→74）
      const bladeLen = phase === 5 ? 74 : 66;
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(s * -wingIn.x, wingIn.y);
        ctx.scale(s, 1);
        wgGhostSickle(ctx, t, 0.96, bladeLen);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // 战争幽灵世界坐标层预警（挂在 drawEnemy 本体 translate 之前）：入场风波（来向路径流带自远端延伸 + 停留点机体等大预警圈）、
  // 离场直线风波（纯直线无落点）、技能1扇形预警、技能2双斩线预警；预览假 spec（无 wg 字段）整体跳过
  function drawWarGhostWarns(e) {
    const phase = e.wgPhase;
    const TAU = Math.PI * 2;
    // 风波流带公共段（2026-10-02 用户定稿：参照暴风之眼血条风流语言重做，替换纯虚线）——
    // 从 (x,y) 沿 (dx,dy) 画长 L 流带：柔光带体 + 沿行进方向循环移动的亮带流光 + 带内数道渐隐尾
    // 风痕高速掠过（几何不动、只有亮度流动，同 drawStormBar 设计语言）；hw 覆盖冲刺时机体全展；
    // fadeTail=true 时带前端（行进端）260px 渐隐——入场用（避免白色区域怼进停留点预警圈），离场不用
    const windBand = (x, y, dx, dy, L, prog, fadeTail, hwMul = 1, edgeFlow = false, cutFrom = 0) => {
      const a = 0.25 + prog * 0.55;
      const hw = 72 * hwMul;               // 带半宽：机体视觉半展 ≈62.7px + 余量（用户反馈旧 16px 太窄）；入场 2026-10-03 用户定稿宽度缩短 10%（hwMul 0.9 → 64.8，仍覆盖全展）
      const c01 = (v) => Math.max(0, Math.min(1, v));
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(dy, dx));
      // cutFrom > 0：裁掉身后段（2026-10-03 用户定稿「冲刺到哪、哪段预警熄灭」，黑暗之手阴影掠过同口径）——
      // 带体/特效全部锚定屏外原点（世界坐标与相位不动），仅可见窗口收缩；本体恰好压在裁切线上
      if (cutFrom > 0) {
        ctx.beginPath();
        ctx.rect(cutFrom, -hw - 40, Math.max(0, L - cutFrom), hw * 2 + 80);
        ctx.clip();
      }
      // ① 带体：沿带向渐变柔光（远端透明 → 行进端柔和白青；fadeTail 时行进端渐隐）
      const body = ctx.createLinearGradient(0, 0, L, 0);
      body.addColorStop(0, 'rgba(220, 240, 255, 0)');
      body.addColorStop(0.25, `rgba(220, 240, 255, ${(0.10 * a).toFixed(3)})`);
      body.addColorStop(0.78, `rgba(225, 243, 255, ${(0.17 * a).toFixed(3)})`);
      body.addColorStop(1, `rgba(225, 243, 255, ${(0.17 * a * (fadeTail ? 0.15 : 1)).toFixed(3)})`);
      ctx.fillStyle = body;
      ctx.fillRect(0, -hw, L, hw * 2);
      // ②③ 带内风流（流光亮带 + 风痕掠过）：仅离场带保留——2026-10-03 用户定稿「入场矩形预警区域
      // 除了白芒流动，不应当再有风流」：edgeFlow=true 的入场带跳过，带内只留柔光带体 + 边缘白芒
      if (!edgeFlow) {
        // ② 流光亮带：4 道亮带沿行进方向循环移动（位置随时间循环，亮→隐→亮）
        const flow = ctx.createLinearGradient(0, 0, L, 0);
        for (let k = 0; k < 4; k++) {
          const pos = ((state.time * 0.5 + k / 4) % 1 + 1) % 1;
          const w = 0.05;
          flow.addColorStop(c01(pos - w), 'rgba(240, 251, 255, 0)');
          flow.addColorStop(c01(pos), `rgba(240, 251, 255, ${(0.45 * a).toFixed(3)})`);
          flow.addColorStop(c01(pos + w), 'rgba(240, 251, 255, 0)');
        }
        ctx.fillStyle = flow;
        ctx.fillRect(0, -hw, L, hw * 2);
        // ③ 风痕掠过：带内数道带渐隐尾的短弧线，高速沿行进方向横移循环（弓背上下交替、速度/相位错开）
        const gusts = [
          { v: 620, off: 0, len: 130, bow: -26, y: -40 },
          { v: 520, off: 400, len: 180, bow: 30, y: 34 },
          { v: 760, off: 900, len: 95, bow: -34, y: -12 },
          { v: 580, off: 1500, len: 160, bow: 22, y: 55 },
        ];
        for (const gs of gusts) {
          const span = L + 240;
          const head = -120 + (((state.time * gs.v + gs.off) % span) + span) % span;
          const fade = c01(head / 90) * c01((L + 100 - head) / 90) * a;   // 两端淡入淡出
          if (fade <= 0.01) continue;
          const tail = head - gs.len;
          const yg = ctx.createLinearGradient(tail, 0, head, 0);
          yg.addColorStop(0, 'rgba(225, 246, 255, 0)');
          yg.addColorStop(0.7, `rgba(225, 246, 255, ${(0.45 * fade).toFixed(3)})`);
          yg.addColorStop(1, `rgba(255, 255, 255, ${(0.85 * fade).toFixed(3)})`);
          ctx.strokeStyle = yg;
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(tail, gs.y + gs.bow * 0.5);
          ctx.quadraticCurveTo((tail + head) / 2, gs.y + gs.bow * 1.6, head, gs.y);
          ctx.stroke();
        }
      }
      // ④ 边缘白芒流动（2026-10-03 用户二稿定稿：淡白细边不明显，整块替换为边缘白芒流动）——
      // 每条长边 3 道白芒流光段沿行进方向流动：宽幅柔光晕（白芒外晕）+ 亮白内核双层描边 + 白辉光，
      // 亮头渐隐尾、两端淡入淡出，左右边相位错开（同带内风痕语言）
      if (edgeFlow) {
        for (const sy of [-hw, hw]) {
          for (let k = 0; k < 3; k++) {
            // 相位跨度固定 1700（2026-10-03 修「增长期异常闪动」根因：旧 span=L+200 每帧随生长长度
            // 变化 → 取模相位逐帧抖动；固定跨度后相位稳定，前端浮现改由 (L+60-head)/60 淡出窗口承担）
            const span = 1700;
            const head = -100 + (((state.time * 640 + k * span / 3 + (sy > 0 ? span / 6 : 0)) % span) + span) % span;
            const fade = c01(head / 80) * c01((L + 60 - head) / 60) * a;
            if (fade <= 0.01) continue;
            const tail = head - 130;
            const lg = ctx.createLinearGradient(tail, 0, head, 0);
            lg.addColorStop(0, 'rgba(255, 255, 255, 0)');
            lg.addColorStop(0.55, `rgba(240, 250, 255, ${(0.4 * fade).toFixed(3)})`);
            lg.addColorStop(1, `rgba(255, 255, 255, ${(0.95 * fade).toFixed(3)})`);
            ctx.strokeStyle = lg;
            ctx.lineCap = 'round';
            ctx.lineWidth = 7;                       // 宽幅柔光晕：白芒外晕（低透明度宽线）
            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.moveTo(tail, sy);
            ctx.lineTo(head, sy);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.lineWidth = 2.6;                     // 亮白内核 + 白辉光
            ctx.shadowColor = 'rgba(255, 255, 255, 0.85)';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(tail, sy);
            ctx.lineTo(head, sy);
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }
      }
      ctx.restore();
    };
    if ((phase === 0 || phase === 1) && e.wgStay && e.wgDir) {
      // 入场两段式预警（2026-10-01 用户定稿）：先「从远处出现」——流带自屏外远端沿来向朝停留点延伸而来
      //（前 55% 时长），抵达后「出现预警圈」——与机体等大的双环预警圈在停留点浮现（后 45% 时长）；
      // 相位 1 冲刺期预警不整体消失——「冲刺到哪、哪段预警熄灭」（2026-10-03 用户定稿，黑暗之手
      // 阴影掠过同口径）：流带以 cutFrom=已冲距离 裁掉身后段、白芒继续流动，预警圈保持至本体抵达
      const L = 1300;                                  // 流带全长：覆盖任意停留点 → 屏外来向全程（屏高 0.92 + 横向余量）
      let cp = 0;                                      // 预警圈显示进度（相位 1 恒完全体，本体抵达进相位 2 即消失）
      ctx.save();
      if (phase === 0) {
        const p = clamp(e.wgWarnT / WAR_GHOST.entryWarn, 0, 1);
        const sweep = clamp(p / 0.55, 0, 1);            // 流带自远端向停留点生长进度
        cp = clamp((p - 0.55) / 0.45, 0, 1);            // 预警圈浮现进度
        if (sweep > 0.01) {
          // 流带：起点 = 停留点沿来向回退全长，长度随 sweep 向停留点生长（自远端出现）；带内无箭头（用户指令）
          const fx = e.wgStay.x - e.wgDir.x * L, fy = e.wgStay.y - e.wgDir.y * L;
          // fadeTail=true：前端 260px 渐隐，避免带体白色怼进停留点预警圈（用户指令）；预警圈浮现后带体同步淡出；
          // hwMul 0.9 = 宽度缩短 10%、edgeFlow=true = 两长边白芒流动（均 2026-10-03 用户定稿，仅入场矩形）
          windBand(fx, fy, e.wgDir.x, e.wgDir.y, L * sweep, Math.min(1, p * 1.4) * (1 - cp * 0.9), true, 0.9, true);
        }
      } else {
        // 相位 1 冲刺：剩余段 = 本体沿来向到停留点的投影距离；带体锚定屏外原点（世界坐标/相位不动），
        // 身后段被 cutFrom 裁掉（本体压线恰好遮住裁切口）。prog 0.36s 线性回升全亮——相位 0 末带体已
        // 淡至 prog≈0.1（让位预警圈），冲刺期透明度连续衔接无跳变
        const remain = clamp((e.wgStay.x - e.x) * e.wgDir.x + (e.wgStay.y - e.y) * e.wgDir.y, 0, L);
        cp = 1;
        if (remain > 2) {
          const fx = e.wgStay.x - e.wgDir.x * L, fy = e.wgStay.y - e.wgDir.y * L;
          windBand(fx, fy, e.wgDir.x, e.wgDir.y, L, Math.min(1, 0.1 + (e.wgDashT || 0) * 2.5), true, 0.9, true, L - remain);
        }
      }
      if (cp > 0) {
        // 预警圈（2026-10-02 用户二稿定稿）：边框特效增大、内部淡一点；不收缩圈——
        // 圈周环绕风流 + 圈内旋转风流汇聚（暴风之眼血条同款「几何不动、亮度流动」语言）
        const R = 70 * ENEMY_TYPES.warGhost.drawScale;
        const a = cp * 0.9;
        // ① 底描边圆（加粗提亮：1.5→3px）
        ctx.strokeStyle = `rgba(170, 220, 252, ${(0.55 * a).toFixed(3)})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(e.wgStay.x, e.wgStay.y, R, 0, TAU); ctx.stroke();
        // ② 3 道渐隐尾亮弧沿圆周流动（加粗至 3.2px、尾长 1.15→1.5，风绕圈感增强）
        for (let k = 0; k < 3; k++) {
          const head = state.time * 1.7 + k * TAU / 3;
          const tail = head - 1.5;
          const tx = e.wgStay.x + Math.cos(tail) * R, ty = e.wgStay.y + Math.sin(tail) * R;
          const hx = e.wgStay.x + Math.cos(head) * R, hy = e.wgStay.y + Math.sin(head) * R;
          const ag = ctx.createLinearGradient(tx, ty, hx, hy);
          ag.addColorStop(0, 'rgba(225, 246, 255, 0)');
          ag.addColorStop(0.65, `rgba(225, 246, 255, ${(0.5 * a).toFixed(3)})`);
          ag.addColorStop(1, `rgba(255, 255, 255, ${(0.9 * a).toFixed(3)})`);
          ctx.strokeStyle = ag;
          ctx.lineWidth = 3.2;
          ctx.lineCap = 'round';
          ctx.shadowColor = 'rgba(190, 234, 255, 0.8)';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(e.wgStay.x, e.wgStay.y, R, tail, head);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        // ③ 圈周环绕风流：R+12 外圈 3 道渐隐尾亮弧更高速度绕行（圈外风环）
        for (let k = 0; k < 3; k++) {
          const head = state.time * 2.6 + k * TAU / 3 + 0.5;
          const tail = head - 1.05;
          const tx = e.wgStay.x + Math.cos(tail) * (R + 12), ty = e.wgStay.y + Math.sin(tail) * (R + 12);
          const hx = e.wgStay.x + Math.cos(head) * (R + 12), hy = e.wgStay.y + Math.sin(head) * (R + 12);
          const ag = ctx.createLinearGradient(tx, ty, hx, hy);
          ag.addColorStop(0, 'rgba(225, 246, 255, 0)');
          ag.addColorStop(0.7, `rgba(225, 246, 255, ${(0.4 * a).toFixed(3)})`);
          ag.addColorStop(1, `rgba(255, 255, 255, ${(0.8 * a).toFixed(3)})`);
          ctx.strokeStyle = ag;
          ctx.lineWidth = 2.4;
          ctx.lineCap = 'round';
          ctx.shadowColor = 'rgba(190, 234, 255, 0.7)';
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(e.wgStay.x, e.wgStay.y, R + 12, tail, head);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        // ④ 圈内旋转风流汇聚：3 道内螺旋亮弧自边缘向圈心收卷（半径渐小 + 角速度旋转，读作「风流汇聚成眼」）
        for (let k = 0; k < 3; k++) {
          const ph = ((state.time * 0.55 + k / 3) % 1 + 1) % 1;          // 收卷相位 0→1（边缘→圈心）
          const rr = R * (0.85 - 0.63 * ph);
          const spin = state.time * 2.2 + ph * 3.6 + k * TAU / 3;        // 边旋边收
          const fa = Math.sin(ph * Math.PI) * 0.55 * a;                  // 中段最亮、始终两端淡
          if (fa <= 0.01) continue;
          const st = spin - 0.9, en = spin;
          const tx = e.wgStay.x + Math.cos(st) * rr, ty = e.wgStay.y + Math.sin(st) * rr;
          const hx = e.wgStay.x + Math.cos(en) * rr, hy = e.wgStay.y + Math.sin(en) * rr;
          const ag = ctx.createLinearGradient(tx, ty, hx, hy);
          ag.addColorStop(0, 'rgba(225, 246, 255, 0)');
          ag.addColorStop(0.65, `rgba(225, 246, 255, ${(fa * 0.75).toFixed(3)})`);
          ag.addColorStop(1, `rgba(255, 255, 255, ${(fa).toFixed(3)})`);
          ctx.strokeStyle = ag;
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(e.wgStay.x, e.wgStay.y, rr, st, en);
          ctx.stroke();
        }
        // ⑤ 圈内白色波动（2026-10-02 用户三轮定稿：冲刺流带**中间**那片整片柔和白色波动区域内也要有——
        // 删除旧 3 道弓背细线风痕，改为与流带②「流光亮带」同源同语言的一片柔和白浪：沿冲刺方向缓缓
        // 漂移穿过预警圈（clip 限圈内、几何不动只有亮度流动），2 道错相循环，两端经渐变自然淡入淡出）
        {
          const dir = e.wgDir || { x: 0, y: 1 };
          ctx.save();
          ctx.beginPath();
          ctx.arc(e.wgStay.x, e.wgStay.y, R - 1, 0, TAU);
          ctx.clip();
          ctx.translate(e.wgStay.x, e.wgStay.y);
          ctx.rotate(Math.atan2(dir.y, dir.x));
          const wv = R * 0.5;                                  // 波区半宽（沿行进方向；整片软波，非细线）
          const span = R * 2 + wv * 2;
          for (let k = 0; k < 2; k++) {
            const pos = ((state.time * 0.5 + k / 2) % 1 + 1) % 1;   // 与流带②流光亮带同速（0.5 周期/s）同步漂移
            const cx = -R - wv + pos * span;                        // 波区中心：自入圈侧向出圈侧循环
            const fg = ctx.createLinearGradient(cx - wv, 0, cx + wv, 0);
            fg.addColorStop(0, 'rgba(240, 251, 255, 0)');
            fg.addColorStop(0.5, `rgba(240, 251, 255, ${(0.34 * a).toFixed(3)})`);
            fg.addColorStop(1, 'rgba(240, 251, 255, 0)');
            ctx.fillStyle = fg;
            ctx.fillRect(cx - wv, -R, wv * 2, R * 2);
          }
          ctx.restore();
        }
        // ⑥ 圈心淡白呼吸闪光（压淡：0.05+0.03sin、半径缩至 0.45R）
        const gg = ctx.createRadialGradient(e.wgStay.x, e.wgStay.y, 0, e.wgStay.x, e.wgStay.y, R * 0.45);
        gg.addColorStop(0, `rgba(200, 236, 255, ${((0.05 + 0.03 * Math.sin(state.time * 6)) * cp).toFixed(3)})`);
        gg.addColorStop(1, 'rgba(200, 236, 255, 0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(e.wgStay.x, e.wgStay.y, R * 0.45, 0, TAU); ctx.fill();
      }
      ctx.restore();
    } else if (phase === 4 && e.wgExit) {
      // 离场：纯直线风波（无落点标记），从本体沿锁定方向铺到屏外
      const p = clamp(e.wgT / WAR_GHOST.exitWarn, 0, 1);
      windBand(e.x, e.y, e.wgExit.x, e.wgExit.y, 1500, p);
    }
    if (e.wgSkill && e.wgSkill.kind === 1) {
      // 技能1 两刃斩击：扇面预警（2026-10-02 用户定稿——扫斩覆盖范围=正前方两侧各 150°、合计 300°、
      // 尾后 ±30° 缺口，半径 sweepReach）：白金扇面淡填充随预警进度增强 + 外弧/边界亮线 + 金色辉光，
      // 样式语言与技能2 双斩线增强版一致；扫斩期（sweepT 非空）预警撤除、由本体扫斩动画接管
      const s = e.wgSkill, g = WAR_GHOST;
      if (s.sweepT == null) {
        const p = clamp(s.t / g.fanWarn, 0, 1);
        const fwd = e.wgFace + Math.PI / 2;   // 机头方向（世界系，同 06-enemy 判定口径）
        const half = 150 * Math.PI / 180;     // 每侧扇区张角
        const a = 0.6 + p * 0.4;              // 随预警进度增强（同技能2 锁定期）
        ctx.save();
        // 扇形淡填充（白金刃气语言：刃气色由内向外变亮）
        ctx.globalAlpha = a * 0.2;
        const fg = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, g.sweepReach);
        fg.addColorStop(0, 'rgba(255, 244, 214, 0)');
        fg.addColorStop(0.55, 'rgba(255, 238, 200, 0.6)');
        fg.addColorStop(1, 'rgba(255, 255, 255, 0.95)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.arc(e.x, e.y, g.sweepReach, fwd - half, fwd + half);
        ctx.closePath();
        ctx.fill();
        // 外弧 + 两条边界亮线（虚线随进度流动，同双斩线语言）+ 金色辉光
        ctx.globalAlpha = a;
        ctx.strokeStyle = '#fff6d8';
        ctx.lineWidth = 2.6;
        ctx.shadowColor = 'rgba(255, 230, 140, 0.85)';
        ctx.shadowBlur = 5;
        ctx.setLineDash([16, 10]);
        ctx.lineDashOffset = -state.time * 60;
        ctx.beginPath();
        ctx.arc(e.x, e.y, g.sweepReach, fwd - half, fwd + half);
        ctx.stroke();
        for (const sd of [-1, 1]) {
          const ea = fwd + sd * half;
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(e.x + Math.cos(ea) * g.sweepReach, e.y + Math.sin(ea) * g.sweepReach);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    } else if (e.wgSkill && e.wgSkill.kind === 2) {
      // 技能2：双斩线预警（双平行线，出射点在法线两侧 ±slashGap/2、方向共用锁定方向）
      // 2026-10-02 用户报「预警线有时不显示」：排查无硬逻辑缺失（wgSkill 存续期绘制必然执行），
      // 根因为细虚线在亮背景上对比不足的时隐时现感知——增强：alpha 0.55/0.6+p*0.4、线宽 2.6、
      // 虚线 [16,10] 加粗 + 金色辉光 shadowBlur
      const s = e.wgSkill, g = WAR_GHOST;
      const p = s.locked ? clamp(s.t / g.slashLockWarn, 0, 1) : 0;
      const nx0 = -Math.sin(s.ang), ny0 = Math.cos(s.ang);
      const ux0 = Math.cos(s.ang), uy0 = Math.sin(s.ang);
      const a = s.locked ? 0.6 + p * 0.4 : 0.55;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#fff6d8';
      ctx.lineWidth = 4;                     // 2026-10-03 用户定稿「发射刃气时的预警线加粗一些」：2.6→4（虚线/辉光同步增强）
      ctx.shadowColor = 'rgba(255, 230, 140, 0.85)';
      ctx.shadowBlur = 5;
      ctx.setLineDash([16, 10]);
      ctx.lineDashOffset = -state.time * 60;
      for (const sd of [-1, 1]) {
        const ang2 = s.ang;
        const ux = ux0, uy = uy0;
        const ox = e.x + nx0 * g.slashGap / 2 * sd, oy = e.y + ny0 * g.slashGap / 2 * sd;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox + ux * 1500, oy + uy * 1500);
        ctx.stroke();
        if (s.locked) {   // 锁定期：出射点三角标记（预警结束弹出的位置）
          ctx.setLineDash([]);
          ctx.fillStyle = `rgba(255, 230, 140, ${0.5 + p * 0.5})`;
          ctx.save();
          ctx.translate(ox + ux * 26, oy + uy * 26);
          ctx.rotate(ang2);
          ctx.beginPath();
          ctx.moveTo(7, 0); ctx.lineTo(-4, 5); ctx.lineTo(-4, -5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          ctx.setLineDash([16, 10]);
          ctx.lineDashOffset = -state.time * 60;
        }
      }
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // 技能2 斩击流绘制：白色带金芒的高速斩击（刃体白热渐变 + 金色辉光，沿飞行方向拖尾拉长），略带闪烁
  //（2026-10-02 用户定稿：白身金芒重绘——刃体 rgba(255,244,214,0.95)→#ffffff 白热渐变 + 金色
  //  shadowBlur 12 辉光；增大增长：前缘 14→20、尾 -34/-46→-46/-62、宽 ±10→±12；拖尾再加长
  //  -110→-150（第六轮 -20% 减速后拖尾增长）；判定 26 见 06-enemy updateWgSlashes；速度 slashSpeed 1456（-20%），
  //  见 01-config WAR_GHOST.slashSpeed；出射 0.18s 金芒闪动读作「两刃同出迸发」）
  function drawWarGhostSlashes() {
    for (const s of wgSlashes) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(Math.atan2(s.uy, s.ux));
      const flick = 0.85 + Math.sin(state.time * 42 + s.t * 30) * 0.15;
      // 拖尾（-x 后方长距离渐隐白雾，-110→-150 加长）
      const tg = ctx.createLinearGradient(-150, 0, 10, 0);
      tg.addColorStop(0, 'rgba(255, 244, 214, 0)');
      tg.addColorStop(1, `rgba(255, 244, 214, ${(0.45 * flick).toFixed(3)})`);
      ctx.fillStyle = tg;
      ctx.fillRect(-150, -12, 160, 24);
      // 刃体：前缘锐收的白色长条（白热渐变 + 金芒辉光，增宽 ±12）
      ctx.shadowColor = 'rgba(255, 210, 74, 0.9)';
      ctx.shadowBlur = 12;
      const bg = ctx.createLinearGradient(-46, 0, 18, 0);
      bg.addColorStop(0, 'rgba(255, 222, 130, 0.9)');
      bg.addColorStop(0.55, 'rgba(255, 244, 214, 0.95)');
      bg.addColorStop(1, '#ffffff');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(-46, -12);
      ctx.lineTo(-62, 0);
      ctx.lineTo(-46, 12);
      ctx.closePath();
      ctx.fill();
      // 白热刃脊（金色辉光描边）
      ctx.strokeStyle = `rgba(255, 248, 232, ${(0.95 * flick).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(15, 0); ctx.lineTo(-50, 0);
      ctx.stroke();
      ctx.shadowBlur = 0;
      // 出射闪动（0.18s 内叠画金芒刃体高频明暗，读作「双刃迸发」）
      if (s.t < 0.18) {
        const fp = clamp(1 - s.t / 0.18, 0, 1);
        ctx.fillStyle = `rgba(255, 220, 120, ${(fp * (0.35 + 0.35 * Math.sin(s.t * 90))).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(20, 0);
        ctx.lineTo(-46, -12);
        ctx.lineTo(-62, 0);
        ctx.lineTo(-46, 12);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ---------- 法术正方体精灵烘焙（性能改造，方案 A） ----------
  // 旧实现每颗每帧 5~6 次 shadowBlur + ~10 次光栅化，场上堆积时帧率大跌。现全部预烘焙：
  //   大正方体：三轴角速度比改为有理数 1 : 3/4 : 1/2（原 1 : 0.73 : 0.47，肉眼无感）→ 翻滚以 4 圈为周期循环，
  //     预烘 96 帧（24 步/圈，对齐水晶方案的低帧口径）供所有大正方体共享——c.spinSeed → 循环起始相位、
  //     c.spinMul（0.8~1.25）→ 播放速率，随机性保留；运行时每颗每帧 1 次 drawImage。
  //   小正方体：柜式投影姿态只随发射方向整体旋转（本体形状恒定）→ 烘 1 张（sx=+1 基准，左发射镜像），运行时 rotate+镜像贴图。
  //   拖尾：红光带 / 白热内芯分两层烘焙（保留 lighter 叠加语义），运行时 rotate+scale 贴图，替代逐帧渐变+shadowBlur。
  // 烘焙一律按 gg=1 / alpha=1 / scale=1 基准；运行时以 globalAlpha = c.alpha·gg 一并还原黯淡与渐隐（原绘制各元素 alpha 均匀乘 gg·alpha，等价）。
  const XTUMBLE_FRAMES = 96;       // 大正方体烘焙帧数（4 圈循环 × 24 步/圈）
  const XTUMBLE_REVS = 4;          // 每循环 rx 转过圈数（ry 3 圈、rz 2 圈 → 比 1 : 3/4 : 1/2）
  let xtumble = null;              // { frames: [canvas × 96], size, s }（懒烘焙：首颗大正方体出现时一次性构建）
  let xcubeSmall = null;           // { cv, size, s } 小正方体贴图
  let xtrailBig = null, xtrailSmall = null;   // { red, core, len, bodyS, margin } 拖尾双层贴图

  function frac01(x) { return x - Math.floor(x); }

  // 大正方体翻滚渲染核心：u ∈ [0,1) 循环相位——rx = u·4·2π、ry = u·3·2π、rz = u·2·2π；
  // 投影 / 背面剔除 / 逐面朗伯着色 / 剪影红外发光 / 内部淡红光 / 棱线双层描边与原实时刻画逐行一致（烘焙专用，gg=1）
  function xtumbleRender(g, u, s, gg) {
    const rx = u * XTUMBLE_REVS * 2 * Math.PI;
    const ry = u * XTUMBLE_REVS * 0.75 * 2 * Math.PI;
    const rz = u * XTUMBLE_REVS * 0.5 * 2 * Math.PI;
    const cxr = Math.cos(rx), sxr = Math.sin(rx), cyr = Math.cos(ry), syr = Math.sin(ry), czr = Math.cos(rz), szr = Math.sin(rz);
    // 三轴旋转（Rz·Rx·Ry），返回未投影的旋转后向量
    const rot3 = (x, y, z) => {
      const y1 = y * cxr - z * sxr, z1 = y * sxr + z * cxr;
      const x2 = x * cyr + z1 * syr, z2 = -x * syr + z1 * cyr;
      return [x2 * czr - y1 * szr, x2 * szr + y1 * czr, z2];
    };
    const P = [];
    for (let i = 0; i < 8; i++) {
      const [x3, y3, z3] = rot3(i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1);
      const w = 1 / (1 - z3 * 0.09);   // 轻透视：z 越朝画面外越大（近大远小）
      P.push([x3 * w * s, y3 * w * s]);
    }
    // 6 个面：外法线（未旋转空间）+ 顶点索引（bit0=x+ / bit1=y+ / bit2=z+）
    const FACES = [
      { n: [0, 0, 1],  v: [4, 5, 7, 6] },
      { n: [0, 0, -1], v: [0, 1, 3, 2] },
      { n: [1, 0, 0],  v: [1, 5, 7, 3] },
      { n: [-1, 0, 0], v: [0, 4, 6, 2] },
      { n: [0, 1, 0],  v: [2, 3, 7, 6] },
      { n: [0, -1, 0], v: [0, 1, 5, 4] },
    ];
    const L = [-0.3, -0.55, 0.78];   // 光源方向（左上前方，canvas y 向下 → -y 为上方），近似单位向量
    const vis = [];
    for (const f of FACES) {
      const [nx, ny, nz] = rot3(f.n[0], f.n[1], f.n[2]);
      if (nz <= 0.02) continue;   // 背面剔除（凸多面体 → 可见面互不遮挡）
      const b = 0.45 + 0.55 * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);   // 法线受光亮度
      const k = 1 - b;
      vis.push({ idx: f.v, pts: f.v.map(ix => P[ix]), col: `${Math.round(255 - 70 * k)}, ${Math.round(255 - 115 * k)}, ${Math.round(255 - 95 * k)}` });
    }
    const path = (pts) => {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.closePath();
    };
    g.save();

    // 1) 剪影底：所有可见面填白 + 强红外发光（红光只出现在最外轮廓）
    g.shadowColor = `rgba(255, 40, 58, ${(0.95 * gg).toFixed(3)})`;
    g.shadowBlur = 30 * gg;
    g.fillStyle = `rgba(255, 250, 250, ${(0.96 * gg).toFixed(3)})`;
    g.beginPath();
    for (const f of vis) { g.moveTo(f.pts[0][0], f.pts[0][1]); for (let i = 1; i < f.pts.length; i++) g.lineTo(f.pts[i][0], f.pts[i][1]); g.closePath(); }
    g.fill();
    g.shadowBlur = 0;

    // 2) 逐面明暗着色（面向光源亮、背向转暗 → 翻滚时立体感随姿态流转）
    for (const f of vis) {
      g.fillStyle = `rgba(${f.col}, ${(0.97 * gg).toFixed(3)})`;
      path(f.pts); g.fill();
    }

    // 3) 内部淡红光：裁剪到可见面并集内画径向渐变（柔和、无硬边界）
    g.save();
    g.beginPath();
    for (const f of vis) { g.moveTo(f.pts[0][0], f.pts[0][1]); for (let i = 1; i < f.pts.length; i++) g.lineTo(f.pts[i][0], f.pts[i][1]); g.closePath(); }
    g.clip();
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, s * 1.3);
    rg.addColorStop(0, `rgba(255, 92, 106, ${(0.26 * gg).toFixed(3)})`);
    rg.addColorStop(0.55, `rgba(255, 118, 130, ${(0.14 * gg).toFixed(3)})`);
    rg.addColorStop(1, `rgba(255, 140, 150, ${(0.05 * gg).toFixed(3)})`);
    g.fillStyle = rg;
    g.fillRect(-s * 1.6, -s * 1.6, s * 3.2, s * 3.2);
    g.restore();

    // 4) 棱线分两类（外轮廓剪影边 → 红描边 + 强外发光；内部棱线 → 两端渐隐的柔和红色渐变淡描）
    const edgeCount = new Map();
    for (const f of vis) {
      for (let i = 0; i < f.idx.length; i++) {
        const a = f.idx[i], b = f.idx[(i + 1) % f.idx.length];
        const key = a < b ? a + '_' + b : b + '_' + a;
        edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
      }
    }
    const edgePts = (key) => key.split('_').map(n => P[+n]);
    g.lineWidth = 1.8;
    g.shadowColor = `rgba(255, 40, 58, ${(0.95 * gg).toFixed(3)})`;
    g.shadowBlur = 22 * gg;
    g.strokeStyle = `rgba(255, 68, 84, ${(0.72 * gg).toFixed(3)})`;
    g.beginPath();
    for (const [key, n] of edgeCount) {
      if (n !== 1) continue;   // 仅剪影边
      const [pa, pb] = edgePts(key);
      g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]);
    }
    g.stroke();
    g.shadowBlur = 6 * gg;
    g.lineWidth = 1.2;
    for (const [key, n] of edgeCount) {
      if (n !== 2) continue;   // 内部棱线
      const [pa, pb] = edgePts(key);
      const lg = g.createLinearGradient(pa[0], pa[1], pb[0], pb[1]);
      lg.addColorStop(0, 'rgba(255, 130, 145, 0)');
      lg.addColorStop(0.5, `rgba(255, 130, 145, ${(0.22 * gg).toFixed(3)})`);
      lg.addColorStop(1, 'rgba(255, 130, 145, 0)');
      g.strokeStyle = lg;
      g.beginPath(); g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]); g.stroke();
    }

    g.restore();
  }

  function bakeXtumble() {
    const s = FASHI_ARRAY.cubeHalf;
    const size = Math.ceil(s * 4.2 + 64);   // 角点投影 ~2.06s + 大半径辉光 ~32px 余量
    const frames = [];
    for (let f = 0; f < XTUMBLE_FRAMES; f++) {
      const cv = document.createElement('canvas');
      cv.width = size;
      cv.height = size;
      const bg = cv.getContext('2d');
      bg.translate(size / 2, size / 2);
      xtumbleRender(bg, f / XTUMBLE_FRAMES, s, 1);
      frames.push(cv);
    }
    xtumble = { frames, size, s };
  }

  // 小正方体柜式投影渲染核心（局部空间，sx=+1 基准：右挤出；左发射经镜像得到，几何严格等价）
  function xcubeSmallRender(g, s, gg) {
    const dx = s * 0.5, dy = -s * 0.38;   // 立体厚度（右挤出基准）
    const hex = [[-s, s], [s, s], [s + dx, s + dy], [s + dx, -s + dy], [-s + dx, -s + dy], [-s, -s]];   // 外轮廓剪影
    const topFace = [[-s, -s], [s, -s], [s + dx, -s + dy], [-s + dx, -s + dy]];                          // 顶面（恒可见）
    const sideFace = [[s, -s], [s + dx, -s + dy], [s + dx, s + dy], [s, s]];                             // 右侧面
    const path = (pts) => {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.closePath();
    };
    // 1) 剪影底：白色填充 + 强红外发光
    g.shadowColor = `rgba(255, 40, 58, ${(0.95 * gg).toFixed(3)})`;
    g.shadowBlur = 30 * gg;
    g.fillStyle = `rgba(255, 250, 250, ${(0.96 * gg).toFixed(3)})`;
    path(hex); g.fill();
    g.shadowBlur = 0;
    // 2) 顶面（最亮）
    g.fillStyle = `rgba(255, 255, 255, ${(0.99 * gg).toFixed(3)})`;
    path(topFace); g.fill();
    // 3) 侧面（较暗）
    g.fillStyle = `rgba(228, 210, 218, ${(0.93 * gg).toFixed(3)})`;
    path(sideFace); g.fill();
    // 4) 正面：通体白 + 内部淡红光
    g.fillStyle = `rgba(255, 255, 255, ${(0.97 * gg).toFixed(3)})`;
    g.fillRect(-s, -s, s * 2, s * 2);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, s * 1.3);
    rg.addColorStop(0, `rgba(255, 92, 106, ${(0.26 * gg).toFixed(3)})`);
    rg.addColorStop(0.55, `rgba(255, 118, 130, ${(0.14 * gg).toFixed(3)})`);
    rg.addColorStop(1, `rgba(255, 140, 150, ${(0.05 * gg).toFixed(3)})`);
    g.fillStyle = rg;
    g.fillRect(-s, -s, s * 2, s * 2);
    // 5) 最外缘轮廓：红描边 + 强外发光
    g.strokeStyle = `rgba(255, 68, 84, ${(0.72 * gg).toFixed(3)})`;
    g.lineWidth = 1.8;
    g.shadowColor = `rgba(255, 40, 58, ${(0.95 * gg).toFixed(3)})`;
    g.shadowBlur = 22 * gg;
    path(hex); g.stroke();
  }

  function bakeXcubeSmall() {
    const s = FASHI_MATRIX.cubeHalf;
    const size = Math.ceil(s * 3 + 64);   // 外缘 ~1.5s + 大半径辉光余量
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const bg = cv.getContext('2d');
    bg.translate(size / 2, size / 2);
    xcubeSmallRender(bg, s, 1);
    xcubeSmall = { cv, size, s };
  }

  // 拖尾烘焙：沿 +x 的双层条带（红光带含 shadowBlur 外发光 / 白热内芯），运行时 lighter 逐层叠加保持原加算语义
  function bakeXtrail(len, bodyS) {
    const margin = 34;   // round 端帽（红带宽一半 ~26px）+ 辉光余量
    const mk = (lw, blur, stops) => {
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(len + margin * 2);
      cv.height = Math.ceil(lw + blur * 2 + 8);
      const g = cv.getContext('2d');
      g.translate(margin, cv.height / 2);
      g.lineCap = 'round';
      const gr = g.createLinearGradient(0, 0, len, 0);
      for (const [off, col] of stops) gr.addColorStop(off, col);
      g.strokeStyle = gr;
      g.lineWidth = lw;
      if (blur) { g.shadowColor = 'rgba(255, 45, 62, 0.7)'; g.shadowBlur = blur; }
      g.beginPath(); g.moveTo(0, 0); g.lineTo(len, 0); g.stroke();
      return cv;
    };
    return {
      len, bodyS, margin,
      red: mk(bodyS * 2.6, 16, [[0, 'rgba(255, 70, 88, 0.55)'], [0.45, 'rgba(255, 45, 65, 0.3)'], [1, 'rgba(255, 40, 60, 0)']]),
      core: mk(bodyS * 1.2, 0, [[0, 'rgba(255, 252, 252, 0.85)'], [0.35, 'rgba(255, 234, 236, 0.45)'], [1, 'rgba(255, 220, 226, 0)']]),
    };
  }

  // 法术矩阵发光正方体 / 法术阵列大正方体：全部走预烘焙贴图（烘焙区见上方"法术正方体精灵烘焙"注释）——
  // 每颗每帧 = 2 次拖尾贴图（lighter 逐层叠加）+ 1 次本体贴图；黯淡（gg）与渐隐（alpha）经 globalAlpha 一次还原
  function drawSpellCubes() {
    for (const c of spellCubes) {
      const g = c.glow;                            // 黯淡程度（1 → glowFloor）
      const gg = c.big ? Math.min(1, g * FASHI_ARRAY.glowMul) : g;   // 法术阵列大正方体：红光更明显
      const s = (c.big ? FASHI_ARRAY.cubeHalf : FASHI_MATRIX.cubeHalf) * c.scale;   // 半边长（随生长缩放）
      const sx = c.ux >= 0 ? 1 : -1;               // 挤出侧 = 水平运动方向（左发射见左面 / 右发射见右面）
      // 本体按发射方向旋转：局部 +y（底边法向）对准速度方向 u → 最前面的那条边（底边）垂直于发射方向
      const alpha = Math.atan2(-c.ux, c.uy);
      const ca = Math.cos(alpha), sa = Math.sin(alpha);
      // 立方体几何质心——拖尾起点，与旋转后主体对齐
      //   小正方体：局部挤出中点 (dx/2,dy/2) 经旋转映射到世界坐标；大正方体三轴翻滚 → 质心即本体中心
      const dx = s * 0.5 * sx, dy = -s * 0.38;
      const ccx = c.big ? c.x : c.x + (dx * 0.5) * ca - (dy * 0.5) * sa;
      const ccy = c.big ? c.y : c.y + (dx * 0.5) * sa + (dy * 0.5) * ca;

      // ---- 光效拖尾（烘焙贴图 ×2 层）：沿运动反方向从质心发出，白热内芯 + 红光外带；仅飞行/减速阶段 ----
      //   减速段尾焰长度与当前速度挂钩（速度比 = spd/cruise 随减速指数下降 → 开始减速时尾焰迅速变短）
      if (c.alpha > 0.02) {
        const spdMul = c.phase === 'brake' ? Math.max(0, c.spd / c.cruise) : 1;
        const tl = (c.big ? FASHI_MATRIX.cubeTrailLen : FASHI_MATRIX.cubeTrailLenSmall) * c.scale * spdMul;
        if (tl >= 2) {
          const tr = c.big
            ? (xtrailBig ||= bakeXtrail(FASHI_MATRIX.cubeTrailLen, FASHI_ARRAY.cubeHalf))
            : (xtrailSmall ||= bakeXtrail(FASHI_MATRIX.cubeTrailLenSmall, FASHI_MATRIX.cubeHalf));
          const tx = ccx - c.ux * tl, ty = ccy - c.uy * tl;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.translate(ccx, ccy);
          ctx.rotate(Math.atan2(ty - ccy, tx - ccx));
          ctx.scale(tl / tr.len, s / tr.bodyS);   // 长度随速度/生长收缩、宽度随本体尺寸
          ctx.globalAlpha = Math.min(1, Math.max(0, c.alpha * gg));
          ctx.drawImage(tr.red, -tr.margin, -tr.red.height / 2);
          ctx.drawImage(tr.core, -tr.margin, -tr.core.height / 2);
          ctx.restore();
        }
      }

      // ---- 立方体本体：大正方体 = 周期化翻滚精灵条逐帧贴图；常规正方体 = 柜式投影贴图 rotate+镜像 ----
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, c.alpha * gg));
      if (c.big) {
        if (!xtumble) bakeXtumble();
        // 循环相位：基准角速度 cubeSpin·spinMul ÷ 每循环 rx 转过的 4·2π；spinSeed → 起始相位（随机翻滚姿态 / 速度抖动保留）
        const u = frac01(state.time * FASHI_ARRAY.cubeSpin * c.spinMul / (XTUMBLE_REVS * 2 * Math.PI) + c.spinSeed / (2 * Math.PI));
        const f = Math.floor(u * XTUMBLE_FRAMES) % XTUMBLE_FRAMES;
        const k = s / xtumble.s;
        ctx.translate(c.x, c.y);
        ctx.scale(k, k);
        ctx.drawImage(xtumble.frames[f], -xtumble.size / 2, -xtumble.size / 2);
      } else {
        if (!xcubeSmall) bakeXcubeSmall();
        const k = s / xcubeSmall.s;
        ctx.translate(c.x, c.y);
        ctx.rotate(alpha);      // 旋转本体：使最前面的边垂直于发射方向（局部下边对准 u）
        ctx.scale(sx * k, k);   // 先镜像挤出侧再旋转（与原逐点几何严格等价）；k 含生长缩放
        ctx.drawImage(xcubeSmall.cv, -xcubeSmall.size / 2, -xcubeSmall.size / 2);
      }
      ctx.restore();

      // 法术阵列大正方体：分裂预警——红色收缩圈（0.5s 内从外向内收拢，越收越亮越粗；仅预警期存在，保持实时）
      if (c.big && c.warnT >= 0) {
        const wp = 1 - Math.max(0, c.warnT) / FASHI_ARRAY.splitWarn;   // 0→1 收拢进度
        const rr = c.r * (2.2 - 1.05 * wp);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255, 60, 80, ${(0.35 + 0.5 * wp).toFixed(3)})`;
        ctx.lineWidth = 1.6 + 1.2 * wp;
        ctx.shadowColor = 'rgba(255, 40, 58, 0.9)';
        ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(c.x, c.y, rr, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
  }

  // 法术矩阵正方体命中战机特效：白热爆闪（突出白光）+ 白热主环 + 红光内环层次，随 t 扩散渐隐
  //   （撞上守愿者被阻挡不放此特效，仅粒子，避免与命中战机混淆）
  function drawCubeHitFx() {
    for (const f of cubeHitFx) {
      const p = 1 - f.t / f.max;                 // 0→1 进度
      const ease = 1 - Math.pow(1 - p, 3);        // easeOut：起手最快
      const a = 1 - p;                            // 渐隐
      const k = f.k || 1;                         // 特效缩放（法术阵列正方体分裂的微弱冲击波 k<1）
      const R = (f.r * 1.1 + ease * (54 + f.r * 2.4)) * k;   // 扩散半径（随正方体尺寸）
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // 白热主环：更粗更亮，白光为主体
      ctx.globalAlpha = a;
      ctx.strokeStyle = 'rgba(255, 246, 248, 1)';
      ctx.shadowColor = 'rgba(255, 240, 244, 1)';
      ctx.shadowBlur = 26 * a;
      ctx.lineWidth = 6.2 * (1 - ease) + 1.6;
      ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, Math.PI * 2); ctx.stroke();
      // 红光内环（层次衬托）
      ctx.globalAlpha = a * 0.85;
      ctx.strokeStyle = 'rgba(255, 58, 76, 1)';
      ctx.shadowColor = 'rgba(255, 40, 58, 1)';
      ctx.shadowBlur = 20 * a;
      ctx.lineWidth = 4.4 * (1 - ease) + 1.1;
      ctx.beginPath(); ctx.arc(f.x, f.y, R * 0.86, 0, Math.PI * 2); ctx.stroke();
      // 外圈白热细环（层次）
      ctx.globalAlpha = a * 0.65;
      ctx.strokeStyle = 'rgba(255, 240, 243, 1)';
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, 2.6 * (1 - ease));
      ctx.beginPath(); ctx.arc(f.x, f.y, R * 1.18, 0, Math.PI * 2); ctx.stroke();
      // 起始白热爆闪（前 45% 快速衰减，白光为主、红光仅边缘晕染）
      if (p < 0.45) {
        const q = p / 0.45;
        ctx.globalAlpha = 1 - q;
        const fr = (f.r * 2.6 + 18) * (0.75 + 0.55 * q) * k;
        const cg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, fr);
        cg.addColorStop(0, 'rgba(255, 255, 255, 1)');
        cg.addColorStop(0.38, 'rgba(255, 244, 246, 0.9)');
        cg.addColorStop(0.66, 'rgba(255, 128, 140, 0.42)');
        cg.addColorStop(1, 'rgba(255, 60, 78, 0)');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(f.x, f.y, fr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  // 命中玩家特效：白热闪核 + 红橙双冲击环 + 外圈白细环 + 迸溅火花线（damagePlayer 生成，14-main 推进，10-draw-world 调用）
  function drawPlayerHitFx() {
    for (const f of playerHitFx) {
      const p = clamp(f.t / f.max, 0, 1);           // 0→1 进度
      const ease = 1 - Math.pow(1 - p, 3);           // easeOut：起手最快
      const a = 1 - p;                               // 渐隐
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // 红色主冲击环
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = 'rgba(255, 64, 84, 1)';
      ctx.shadowColor = 'rgba(255, 50, 70, 1)';
      ctx.shadowBlur = 18 * a;
      ctx.lineWidth = 4.6 * (1 - ease) + 1.2;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.6 + ease * 52, 0, Math.PI * 2); ctx.stroke();
      // 橙色内环（层次衬托）
      ctx.globalAlpha = a * 0.7;
      ctx.strokeStyle = 'rgba(255, 154, 77, 1)';
      ctx.shadowColor = 'rgba(255, 120, 60, 1)';
      ctx.shadowBlur = 12 * a;
      ctx.lineWidth = 3 * (1 - ease) + 1;
      ctx.beginPath(); ctx.arc(f.x, f.y, (f.r * 0.6 + ease * 52) * 0.8, 0, Math.PI * 2); ctx.stroke();
      // 外圈白色细环（层次）
      ctx.globalAlpha = a * 0.5;
      ctx.strokeStyle = 'rgba(255, 240, 240, 1)';
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, 2.2 * (1 - ease));
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.6 + ease * 62, 0, Math.PI * 2); ctx.stroke();
      // 起始白热爆闪（前 40% 快速衰减）
      if (p < 0.4) {
        const q = p / 0.4;
        ctx.globalAlpha = 1 - q;
        const fr = (f.r * 1.8 + 12) * (0.7 + 0.6 * q);
        const cg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, fr);
        cg.addColorStop(0, 'rgba(255, 255, 255, 1)');
        cg.addColorStop(0.4, 'rgba(255, 220, 210, 0.85)');
        cg.addColorStop(0.7, 'rgba(255, 120, 110, 0.4)');
        cg.addColorStop(1, 'rgba(255, 60, 70, 0)');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(f.x, f.y, fr, 0, Math.PI * 2); ctx.fill();
      }
      // 迸溅火花线：固定随机方向的短亮线向外窜出（角度序列由 seed 确定，逐帧稳定）
      let s = (f.seed * 9973) | 0;
      const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      ctx.shadowBlur = 0;
      for (let i = 0; i < 7; i++) {
        const ang = rnd() * Math.PI * 2;
        const r0 = f.r * 0.5 + ease * (26 + rnd() * 26);
        const len = (1 - p) * (7 + rnd() * 9);
        ctx.globalAlpha = a * 0.8;
        ctx.strokeStyle = i % 2 ? 'rgba(255, 214, 120, 1)' : 'rgba(255, 120, 120, 1)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(f.x + Math.cos(ang) * r0, f.y + Math.sin(ang) * r0);
        ctx.lineTo(f.x + Math.cos(ang) * (r0 + len), f.y + Math.sin(ang) * (r0 + len));
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // 斗志昂扬中心标志：双层上扬箭头（替代暴鸰的骷髅），呼应“斗志昂扬”
  function paintDouzhiMark(cx, cy, s, pulse) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(255, 214, 102, ${(0.72 + pulse * 0.28).toFixed(3)})`;
    ctx.shadowColor = '#ffbf47'; ctx.shadowBlur = 4 + pulse * 5; ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(cx - s, cy - s * 0.05); ctx.lineTo(cx, cy - s * 0.95); ctx.lineTo(cx + s, cy - s * 0.05);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - s, cy + s * 0.75); ctx.lineTo(cx, cy - s * 0.15); ctx.lineTo(cx + s, cy + s * 0.75);
    ctx.stroke();
    ctx.restore();
  }

  // 斗志昂扬下方挂载：较大蓝色盒子 + 盒上方淡黄空心正方形图案（替代暴鸰的炸弹）
  // 斗志昂扬系挂载盒子：cyan 蓝渐变（斗志昂扬）/ 白渐变（赞助无人机）/ 淡黄渐变（豪华赞助无人机）；
  // 赞助系盒子高度 ×0.85（SPONSOR.boxHMul，略微降低）；中空正方形图案与描边保持同构
  const DOUZHI_BOX_STYLES = {
    douzhi:        { light: '#5aa8ff', mid: '#2b6fd6', dark: '#16386f', base: '#0a1830', hi: 'rgba(185, 222, 255, 0.55)', mark: '#f6ecb4' },
    sponsor:       { light: '#ffffff', mid: '#dfe6ee', dark: '#aeb9c6', base: '#1a1d23', hi: 'rgba(255, 255, 255, 0.65)', mark: '#eab308' },
    sponsorDeluxe: { light: '#fff3c4', mid: '#ffe08a', dark: '#e8b84a', base: '#3a2c08', hi: 'rgba(255, 244, 200, 0.7)', mark: '#ffffff' },
  };
  function paintDouzhiBox(cx, cy, kind = 'douzhi') {
    const st = DOUZHI_BOX_STYLES[kind] || DOUZHI_BOX_STYLES.douzhi;
    const hh = 8.6 * (kind === 'douzhi' ? 1 : SPONSOR.boxHMul);   // 赞助系盒子高度 -15%
    const hw = 10.5, r = 2.6;
    const rr = (x, y, w, h, rad) => {
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + w, y, x + w, y + h, rad);
      ctx.arcTo(x + w, y + h, x, y + h, rad);
      ctx.arcTo(x, y + h, x, y, rad);
      ctx.arcTo(x, y, x + w, y, rad);
      ctx.closePath();
    };
    // 暗底盘（盒子厚度）
    ctx.fillStyle = st.base; rr(cx - hw, cy - hh + 1.5, hw * 2, hh * 2, r); ctx.fill();
    // 渐变盒体
    const bg = ctx.createLinearGradient(cx - hw, cy - hh, cx + hw, cy + hh);
    bg.addColorStop(0, st.light); bg.addColorStop(0.5, st.mid); bg.addColorStop(1, st.dark);
    ctx.fillStyle = bg; rr(cx - hw, cy - hh, hw * 2, hh * 2, r); ctx.fill();
    // 顶部高光线
    ctx.strokeStyle = st.hi; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - hw + r, cy - hh + 0.9); ctx.lineTo(cx + hw - r, cy - hh + 0.9); ctx.stroke();
    // 黑描边
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'; ctx.lineWidth = 1; rr(cx - hw, cy - hh, hw * 2, hh * 2, r); ctx.stroke();
    // 盒子正中图案（盒色反差色）：斗志昂扬 = 空心正方形；赞助系 = 小圆环（2026-09-29 定稿）
    if (kind === 'douzhi') {
      const sq = 4.5;
      ctx.strokeStyle = st.mark; ctx.lineWidth = 1.6;
      ctx.strokeRect(cx - sq, cy - sq, sq * 2, sq * 2);
    } else {
      ctx.strokeStyle = st.mark; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(cx, cy, 4.2, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // ── 赞助无人机核心标志备选（机体中心图案，供测试2页面对比选稿）──
  // 每套签名统一：(cx, cy, s, pulse) —— s 为半边长，pulse ∈ [0,1] 脉动
  function paintMarkA(cx, cy, s, pulse) {   // A: 交叉闪电（⚡×2）
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(255, 214, 102, ${(0.72 + pulse * 0.28).toFixed(3)})`;
    ctx.shadowColor = '#ffbf47'; ctx.shadowBlur = 4 + pulse * 5; ctx.lineWidth = 1.6;
    const z = s * 0.85;
    // 左闪电
    ctx.beginPath();
    ctx.moveTo(cx - z * 0.3, cy - z);
    ctx.lineTo(cx - z * 0.7, cy - z * 0.2);
    ctx.lineTo(cx - z * 0.3, cy - z * 0.2);
    ctx.lineTo(cx - z * 0.7, cy + z * 0.8);
    ctx.stroke();
    // 右闪电（镜像）
    ctx.beginPath();
    ctx.moveTo(cx + z * 0.3, cy - z);
    ctx.lineTo(cx + z * 0.7, cy - z * 0.2);
    ctx.lineTo(cx + z * 0.3, cy - z * 0.2);
    ctx.lineTo(cx + z * 0.7, cy + z * 0.8);
    ctx.stroke();
    ctx.restore();
  }
  function paintMarkB(cx, cy, s, pulse) {   // B: 六边形宝石
    ctx.save();
    const r = s * 0.9;
    ctx.strokeStyle = `rgba(255, 214, 102, ${(0.72 + pulse * 0.28).toFixed(3)})`;
    ctx.shadowColor = '#ffbf47'; ctx.shadowBlur = 4 + pulse * 5; ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i - Math.PI / 2;
      const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
    // 内部十字
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx - r * 0.5, cy); ctx.lineTo(cx + r * 0.5, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.35); ctx.lineTo(cx, cy + r * 0.35); ctx.stroke();
    ctx.restore();
  }
  function paintMarkC(cx, cy, s, pulse) {   // C: 五角星辉光
    ctx.save();
    const r = s * 0.92;
    ctx.fillStyle = `rgba(255, 214, 102, ${(0.72 + pulse * 0.28).toFixed(3)})`;
    ctx.shadowColor = '#ffbf47'; ctx.shadowBlur = 5 + pulse * 6;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 5 * i - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.42;
      const px = cx + rad * Math.cos(a), py = cy + rad * Math.sin(a);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function paintMarkD(cx, cy, s, pulse, color = '255, 214, 102', glow = '#ffbf47') {   // D: 菱形钻石
    ctx.save();
    const w = s * 0.9, h = s * 1.05;
    ctx.strokeStyle = `rgba(${color}, ${(0.72 + pulse * 0.28).toFixed(3)})`;
    ctx.shadowColor = glow; ctx.shadowBlur = 4 + pulse * 5; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - h); ctx.lineTo(cx + w, cy); ctx.lineTo(cx, cy + h * 0.7); ctx.lineTo(cx - w, cy);
    ctx.closePath(); ctx.stroke();
    // 内部切割线
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - w * 0.5, cy - h * 0.5); ctx.lineTo(cx + w * 0.5, cy - h * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - h); ctx.lineTo(cx, cy + h * 0.7); ctx.stroke();
    ctx.restore();
  }
  function paintMarkE(cx, cy, s, pulse) {   // E: 礼物蝴蝶结
    ctx.save();
    ctx.fillStyle = `rgba(255, 214, 102, ${(0.72 + pulse * 0.28).toFixed(3)})`;
    ctx.shadowColor = '#ffbf47'; ctx.shadowBlur = 4 + pulse * 5;
    // 上方翅膀
    const r = s * 0.75;
    ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.15);
    ctx.bezierCurveTo(cx - r * 0.8, cy - r, cx - r, cy - r * 0.4, cx - r * 0.15, cy + s * 0.1);
    ctx.bezierCurveTo(cx - r * 0.4, cy - r * 0.1, cx - r * 0.3, cy - r * 0.6, cx, cy - s * 0.15);
    ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.15);
    ctx.bezierCurveTo(cx + r * 0.8, cy - r, cx + r, cy - r * 0.4, cx + r * 0.15, cy + s * 0.1);
    ctx.bezierCurveTo(cx + r * 0.4, cy - r * 0.1, cx + r * 0.3, cy - r * 0.6, cx, cy - s * 0.15);
    ctx.fill();
    // 中心结
    ctx.beginPath(); ctx.arc(cx, cy - s * 0.05, s * 0.22, 0, Math.PI * 2); ctx.fill();
    // 下垂丝带
    ctx.strokeStyle = `rgba(255, 214, 102, ${(0.6 + pulse * 0.3).toFixed(3)})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.1); ctx.quadraticCurveTo(cx - s * 0.4, cy + s * 0.7, cx - s * 0.2, cy + s * 0.95); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.1); ctx.quadraticCurveTo(cx + s * 0.4, cy + s * 0.7, cx + s * 0.2, cy + s * 0.95); ctx.stroke();
    ctx.restore();
  }

  // ── 赞助无人机道具箱图案备选（盒子中心标记，供测试2页面对比选稿）──
  // 每套签名统一：(cx, cy, size, color) —— size 为半边长，color 为反差色字符串
  function paintBoxMark1(cx, cy, size, color) {   // 1: 问号 ?
    ctx.save();
    ctx.fillStyle = color; ctx.strokeStyle = color;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.35;
    const r = size * 0.65;
    ctx.beginPath();
    ctx.arc(cx, cy - size * 0.15, r, -Math.PI * 0.75, Math.PI * 0.15);
    ctx.lineTo(cx + size * 0.15, cy + size * 0.35);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy + size * 0.6, size * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function paintBoxMark2(cx, cy, size, color) {   // 2: 小闪电
    ctx.save();
    ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.3;
    const s2 = size * 0.9;
    ctx.beginPath();
    ctx.moveTo(cx - s2 * 0.15, cy - s2);
    ctx.lineTo(cx - s2 * 0.55, cy - s2 * 0.25);
    ctx.lineTo(cx - s2 * 0.15, cy - s2 * 0.25);
    ctx.lineTo(cx - s2 * 0.55, cy + s2 * 0.65);
    ctx.stroke();
    ctx.restore();
  }
  function paintBoxMark3(cx, cy, size, color) {   // 3: 礼物蝴蝶结（小）
    ctx.save();
    ctx.fillStyle = color;
    const r = size * 0.7;
    // 左翅
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.bezierCurveTo(cx - r * 0.7, cy - r, cx - r, cy - r * 0.3, cx - r * 0.1, cy + size * 0.1);
    ctx.bezierCurveTo(cx - r * 0.3, cy - r * 0.05, cx - r * 0.25, cy - r * 0.5, cx, cy);
    ctx.fill();
    // 右翅
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.bezierCurveTo(cx + r * 0.7, cy - r, cx + r, cy - r * 0.3, cx + r * 0.1, cy + size * 0.1);
    ctx.bezierCurveTo(cx + r * 0.3, cy - r * 0.05, cx + r * 0.25, cy - r * 0.5, cx, cy);
    ctx.fill();
    // 中心结
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function paintBoxMark4(cx, cy, size, color) {   // 4: 六角星（大卫之星风格）
    ctx.save();
    ctx.fillStyle = color;
    const r = size * 0.85;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i - Math.PI / 2;
      const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    // 内部镂空小六角
    ctx.globalCompositeOperation = 'destination-out';
    const r2 = r * 0.45;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i - Math.PI / 2;
      const px = cx + r2 * Math.cos(a), py = cy + r2 * Math.sin(a);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function paintBoxMark5(cx, cy, size, color) {   // 5: 钻石切割（菱形 + 内部线）
    ctx.save();
    ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.22;
    const w = size * 0.8, h = size;
    ctx.beginPath();
    ctx.moveTo(cx, cy - h); ctx.lineTo(cx + w, cy); ctx.lineTo(cx, cy + h * 0.6); ctx.lineTo(cx - w, cy);
    ctx.closePath(); ctx.stroke();
    ctx.lineWidth = size * 0.15;
    ctx.beginPath(); ctx.moveTo(cx - w * 0.5, cy - h * 0.5); ctx.lineTo(cx + w * 0.5, cy - h * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - h); ctx.lineTo(cx, cy + h * 0.6); ctx.stroke();
    ctx.restore();
  }

  // 斗志昂扬机体（造型类暴鸰）：opts.noBox 用于死亡演出中本体不再画蓝盒（蓝盒已脱离为独立 FX）
  function drawDouzhiBody(e, opts = {}) {
    const TAU = Math.PI * 2;
    const S = 12.5;              // 方形机体半边长
    const FR = 5;                // 风扇圆半径
    const FX = 17.5, FY = 14.5;  // 风扇中心偏移（四角）
    const pulse = 0.5 + Math.sin(state.time * 4 + (e.wobble || 0)) * 0.5;

    // ---- 四条连接横杠（机体 → 风扇，最底层）：灰黑渐变，同暴鸰 ----
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const bx = sx * S * 0.72, by = sy * S * 0.72;
        const barG = ctx.createLinearGradient(bx, by, sx * FX, sy * FY);
        barG.addColorStop(0, '#8f98a4');
        barG.addColorStop(0.55, '#565d67');
        barG.addColorStop(1, '#171a1f');
        ctx.strokeStyle = barG;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(sx * FX, sy * FY);
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';

    // ---- 四角风扇圆：淡黄桨心 + 灰白渐变外环；赞助系外环向红色微微渐变（2026-09-29 用户定稿）----
    const sponsorFan = e.type === 'sponsor' || e.type === 'sponsorDeluxe';
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const cx0 = sx * FX, cy0 = sy * FY;
        const fg = ctx.createRadialGradient(cx0, cy0, 0, cx0, cy0, FR);
        fg.addColorStop(0, '#f6ecb4');
        fg.addColorStop(0.34, '#f2e7ac');
        fg.addColorStop(0.62, sponsorFan ? '#c2a8a4' : '#a8b0bb');   // 赞助系中段微微偏红
        fg.addColorStop(1, '#f4f7fb');                               // 外缘保持灰白（不要红）
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(cx0, cy0, FR, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(20, 22, 26, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx0, cy0, FR, 0, TAU); ctx.stroke();
      }
    }

    // ---- 四轮中心红色间歇闪光（微弱的红色闪光，尖峰式间歇）----
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    let wi = 0;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const cx0 = sx * FX, cy0 = sy * FY;
        const ph = state.time * 2.4 + (e.wobble || 0) + wi * 1.9;
        const fl = Math.pow(Math.max(0, Math.sin(ph)), 8);   // 尖峰间歇：大部分时间微弱，周期性亮起
        const rg = ctx.createRadialGradient(cx0, cy0, 0, cx0, cy0, FR * 0.95);
        rg.addColorStop(0, `rgba(255, 66, 56, ${(0.14 + fl * 0.5).toFixed(3)})`);
        rg.addColorStop(1, 'rgba(255, 40, 40, 0)');
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(cx0, cy0, FR * 0.95, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(255, 96, 84, ${(0.3 + fl * 0.6).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(cx0, cy0, 1.4 + fl * 1.2, 0, TAU); ctx.fill();
        wi++;
      }
    }
    ctx.restore();

    // ---- 磨角方形机体：灰黑渐变，同暴鸰 ----
    const bodyPath = () => {
      const r = 4;
      ctx.beginPath();
      ctx.moveTo(-S + r, -S);
      ctx.arcTo(S, -S, S, S, r);
      ctx.arcTo(S, S, -S, S, r);
      ctx.arcTo(-S, S, -S, -S, r);
      ctx.arcTo(-S, -S, S, -S, r);
      ctx.closePath();
    };
    ctx.save();
    ctx.translate(0, 1.2);
    bodyPath();
    ctx.fillStyle = '#14161b';
    ctx.fill();
    ctx.restore();
    bodyPath();
    const bgrd = ctx.createLinearGradient(0, -S, 0, S);
    bgrd.addColorStop(0, '#6b7480');
    bgrd.addColorStop(0.5, '#40464f');
    bgrd.addColorStop(1, '#1b1e24');
    ctx.fillStyle = bgrd;
    ctx.fill();
    bodyPath();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 顶部受光高光线
    ctx.strokeStyle = 'rgba(220, 226, 234, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-S + 4, -S + 1);
    ctx.lineTo(S - 4, -S + 1);
    ctx.stroke();

    // ---- 中心标志：斗志昂扬 = 上扬双箭头（非骷髅）；赞助系 = 菱形钻石（2026-09-29 定稿，paintMarkD；赞助白色 / 豪华赞助淡黄）----
    if ((e.type || 'douzhi') === 'douzhi') paintDouzhiMark(0, -3.5, 4.6, pulse);
    else if (e.type === 'sponsor') paintMarkD(0, -2.0, 4.6, pulse, '235, 240, 250', '#c8d8f0');
    else paintMarkD(0, -2.0, 4.6, pulse);

    // ---- 下方挂载：较大盒子（死亡演出中本体不画，盒已脱离为独立 FX）；盒色/高度按类型（斗志蓝 / 赞助白 / 豪华淡黄）----
    if (!opts.noBox) paintDouzhiBox(0, 18.5, e.type || 'douzhi');
  }

  // 斗志昂扬死亡演出：脱离并迅速渐隐的蓝盒 → 淡黄色扩大光环 → 快速渐隐的本体
  function drawDouzhiFx() {
    const ds = ENEMY_TYPES.douzhi.drawScale;
    for (const f of douzhiFx) {
      const kind = f.kind || 'douzhi';
      const ht = f.t - DOUZHI.boxFade;
      // 掉落盒子的世界中心（光环以此为中心）
      const bcx = f.x, bcy = f.y + f.boxDy + 18.5 * ds;
      // 淡黄色扩大光环（仅斗志昂扬：盒渐隐结束后触发，以掉落的盒子为中心；赞助系无光环——无增益）
      if (kind === 'douzhi' && ht >= 0) {
        const p = clamp(ht / DOUZHI.haloDur, 0, 1);
        const r = 18 + p * 155;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(246, 236, 180, ${((1 - p) * 0.85).toFixed(3)})`;
        ctx.shadowColor = '#f6ecb4'; ctx.shadowBlur = 26 * (1 - p); ctx.lineWidth = 9 * (1 - p) + 2;
        ctx.beginPath(); ctx.arc(bcx, bcy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = (1 - p) * 0.5; ctx.strokeStyle = '#fffbe6'; ctx.shadowBlur = 0; ctx.lineWidth = Math.max(1, 3 * (1 - p));
        ctx.beginPath(); ctx.arc(bcx, bcy, r * 0.8, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      // 本体快速渐隐（不含蓝盒）
      if (f.bodyAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = f.bodyAlpha;
        ctx.translate(f.x, f.y); ctx.scale(ds, ds);
        drawDouzhiBody({ wobble: f.wobble, type: f.kind }, { noBox: true });
        ctx.restore();
      }
      // 脱离并迅速渐隐的盒子（向下漂离；颜色按类型）
      if (f.boxAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = f.boxAlpha;
        ctx.translate(f.x, f.y + f.boxDy); ctx.scale(ds, ds);
        paintDouzhiBox(0, 18.5, kind);
        ctx.restore();
      }
    }
  }

  function drawWeilongBody(e) {
    const TAU = Math.PI * 2;
    const rx = 15, ry = 10;          // 四角旋翼中心偏移（竖直方向再向中心靠拢：ry 13→10，rx 水平不变）
    const ringR = 8;                 // 环状护圈外半径
    const spin = state.time * 26 + (e.wobble || 0);   // 旋翼高速旋转（弧度）
    // 橙黄渐变配色（边框/暗部改为黑色）：黑(描边/暗部) → 橙 → 中橙 → 黄 → 亮黄高光
    const DARK = '#000000', BRONZE = '#e0690f', ORANGE = '#f08c1c', BRASS = '#ffd24a', SHEEN = '#fff0b8';
    const pulse = 0.6 + Math.sin(state.time * 4 + (e.wobble || 0)) * 0.4;

    // ---- 炮管（先画、垫于机身之下；粗壮 + 加强环 + 制退器；指向 muzzleAng（限速追踪），预览时朝正下）----
    const aim = e.waypoints ? (e.muzzleAng != null ? e.muzzleAng : Math.atan2(player.y - e.y, player.x - e.x)) : Math.PI / 2;
    ctx.save();
    ctx.rotate(aim - Math.PI / 2);   // 默认炮管朝下(+y=π/2)，旋转到瞄准方向
    const barrelGrd = ctx.createLinearGradient(-2, 0, 2, 0);
    barrelGrd.addColorStop(0, BRONZE);
    barrelGrd.addColorStop(0.42, BRASS);
    barrelGrd.addColorStop(0.62, SHEEN);
    barrelGrd.addColorStop(1, BRONZE);
    ctx.fillStyle = barrelGrd;
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.rect(-2, 6, 4, 20);   // 炮管主体（宽度减半：8→4，更纤细）
    ctx.fill();
    ctx.stroke();
    // 加强环（两道，宽度随炮管减半）
    for (const yy of [16, 20]) {
      ctx.fillStyle = BRASS;
      ctx.beginPath(); ctx.rect(-2.6, yy, 5.2, 2.4); ctx.fill();
      ctx.strokeStyle = DARK; ctx.lineWidth = 0.8; ctx.stroke();
    }
    // 炮口制退器 + 辉光（宽度随炮管减半；改青铜底 + 黑描边，减少黑块）
    ctx.fillStyle = BRONZE;
    ctx.beginPath(); ctx.rect(-2.8, 23, 5.6, 3.6); ctx.fill();
    ctx.strokeStyle = DARK; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = BRASS;
    ctx.shadowColor = ORANGE;
    ctx.shadowBlur = 7;
    ctx.beginPath(); ctx.arc(0, 26.6, 2, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // ---- 四条机臂（粗壮重装支撑：深金属底 + 青铜高光条）----
    ctx.lineCap = 'round';
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        ctx.strokeStyle = DARK;
        ctx.lineWidth = 6.5;
        ctx.beginPath();
        ctx.moveTo(sx * 6, sy * 5);
        ctx.lineTo(sx * rx, sy * ry);
        ctx.stroke();
        ctx.strokeStyle = BRONZE;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx * 6, sy * 5);
        ctx.lineTo(sx * rx, sy * ry);
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';

    // ---- 四角：厚环状护圈(含螺栓) + 内部高速旋转旋翼 ----
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        ctx.save();
        ctx.translate(sx * rx, sy * ry);
        // 厚护圈（更宽的圆环带）
        ctx.beginPath();
        ctx.arc(0, 0, ringR, 0, TAU);
        ctx.arc(0, 0, ringR - 3.4, 0, TAU, true);
        const ringGrd = ctx.createLinearGradient(-ringR, -ringR, ringR, ringR);
        ringGrd.addColorStop(0, '#7a5c10');
        ringGrd.addColorStop(0.45, '#b3861c');
        ringGrd.addColorStop(0.75, '#d0a42e');
        ringGrd.addColorStop(1, '#7a5c10');
        ctx.fillStyle = ringGrd;
        ctx.fill();
        ctx.strokeStyle = DARK;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        // 护圈螺栓（4 颗，凸显重装）
        ctx.fillStyle = SHEEN;
        for (let b = 0; b < 4; b++) {
          const ba = b * TAU / 4 + Math.PI / 4;
          ctx.beginPath();
          ctx.arc(Math.cos(ba) * (ringR - 1.7), Math.sin(ba) * (ringR - 1.7), 0.9, 0, TAU);
          ctx.fill();
        }
        // 内部高速旋转的旋翼（3 片桨叶 + 残影圆盘）；对角同向、相邻反向
        ctx.rotate(spin * (sx * sy > 0 ? 1 : -1));
        ctx.strokeStyle = 'rgba(255, 236, 190, 0.8)';
        ctx.lineWidth = 1.8;
        for (let b = 0; b < 3; b++) {
          const ba = b * TAU / 3;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(ba) * (ringR - 3.6), Math.sin(ba) * (ringR - 3.6));
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255, 226, 130, 0.18)';   // 残影（黄色调，强化高速感）
        ctx.beginPath();
        ctx.arc(0, 0, ringR - 3.6, 0, TAU);
        ctx.fill();
        ctx.fillStyle = BRASS;   // 轴心
        ctx.beginPath();
        ctx.arc(0, 0, 2, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = DARK; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.restore();
      }
    }

    // ---- 中央机身：磨角矩形重装装甲（暗底盘 + 金属渐变 + 装甲板缝 + 斜切高光 + 铆钉 + 厚描边）----
    const bw = 25, bh = 30, r = 6;
    const bodyPath = () => {
      ctx.beginPath();
      ctx.moveTo(-bw / 2 + r, -bh / 2);
      ctx.arcTo(bw / 2, -bh / 2, bw / 2, bh / 2, r);
      ctx.arcTo(bw / 2, bh / 2, -bw / 2, bh / 2, r);
      ctx.arcTo(-bw / 2, bh / 2, -bw / 2, -bh / 2, r);
      ctx.arcTo(-bw / 2, -bh / 2, bw / 2, -bh / 2, r);
      ctx.closePath();
    };
    // 暗底盘（下移一圈，制造装甲厚度/层次）
    ctx.save();
    ctx.translate(0, 1.6);
    bodyPath();
    ctx.fillStyle = DARK;
    ctx.fill();
    ctx.restore();
    // 机身金属渐变（上暗青铜 → 橙 → 下黄铜，做旧厚重）
    bodyPath();
    const bodyGrd = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
    bodyGrd.addColorStop(0, BRONZE);
    bodyGrd.addColorStop(0.26, ORANGE);
    bodyGrd.addColorStop(0.5, BRASS);
    bodyGrd.addColorStop(1, '#ffe27a');
    ctx.fillStyle = bodyGrd;
    ctx.fill();
    // 装甲板缝 + 凸起高光 + 斜切受光边（裁剪到机身内）
    ctx.save();
    bodyPath();
    ctx.clip();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = 'rgba(160, 66, 6, 0.5)';   // 装甲板缝暗槽（深橙，配合明亮橙黄配色）
    for (const yy of [-9, 0, 9]) { ctx.beginPath(); ctx.moveTo(-bw / 2, yy); ctx.lineTo(bw / 2, yy); ctx.stroke(); }
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 230, 163, 0.30)';
    for (const yy of [-7.8, 1.2, 10.2]) { ctx.beginPath(); ctx.moveTo(-bw / 2, yy); ctx.lineTo(bw / 2, yy); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255, 240, 200, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-bw / 2 + 1.5, bh / 2 - 3);
    ctx.lineTo(-bw / 2 + 1.5, -bh / 2 + r);
    ctx.lineTo(bw / 2 - r, -bh / 2 + 1.5);
    ctx.stroke();
    ctx.restore();
    // 厚描边
    bodyPath();
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // 铆钉（沿机身四角与边缘，重装感）
    ctx.fillStyle = SHEEN;
    for (const [rxx, ryy] of [[-9, -12], [9, -12], [-9, 12], [9, 12], [-10.5, -3], [10.5, -3], [-10.5, 6], [10.5, 6]]) {
      ctx.beginPath(); ctx.arc(rxx, ryy, 0.95, 0, TAU); ctx.fill();
    }

    // ---- 脉动能量核心（重甲中央反应炉：暗环嵌入 + 发光核）----
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, -3.5, 5.8, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#fff6d0';
    ctx.shadowColor = BRASS;
    ctx.shadowBlur = 7 + pulse * 5;
    ctx.beginPath(); ctx.arc(0, -3.5, 4, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = BRONZE;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, -3.5, 4, 0, TAU); ctx.stroke();
  }

  // 导弹垂直预警线：红↔橙闪动 + 顶部警告图标
  function drawMissileWarns() {
    for (const w of missileWarns) {
      const flash = Math.sin(state.time * 18) >= 0;
      const col = flash ? '#ff2b2b' : '#ff9a2b';
      const prog = clamp(w.t / w.dur, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 14;
      ctx.lineWidth = 2 + prog * 3;
      ctx.beginPath();
      ctx.moveTo(w.x, 0);
      ctx.lineTo(w.x, CANVAS_H);
      ctx.stroke();
      ctx.globalAlpha = 0.1 + prog * 0.12;
      ctx.fillStyle = col;
      ctx.fillRect(w.x - 9, 0, 18, CANVAS_H);
      ctx.shadowBlur = 0;
      // 顶部警告图标（三角 + !）
      ctx.globalAlpha = 1;
      ctx.translate(w.x, 30);
      ctx.fillStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(0, -12); ctx.lineTo(11, 9); ctx.lineTo(-11, 9); ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#200000';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', 0, 2);
      ctx.restore();
    }
  }

  // 下落导弹：宽于常规子弹，尖头朝下 + 向上尾焰 + 高速火光拖尾（橙红外带 + 白热内芯 + 上行喷流亮段）
  function drawMissiles() {
    for (const m of missiles) {
      ctx.save();
      ctx.translate(m.x, m.y);
      // ---- 火光拖尾：沿运动反方向（竖直向上）的光带，长度/亮度随时间闪动、轴线轻微摆动 ----
      const flick = 0.82 + 0.18 * Math.sin(state.time * 21 + m.x * 0.7);
      const tl = m.r * 11 * flick;   // 拖尾长度（高速下落的长火带）
      const sway = Math.sin(state.time * 13 + m.x * 0.9) * 4;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      // 橙红外带（根部最亮，向外渐隐 + 红色外发光）
      const og = ctx.createLinearGradient(0, -m.r, 0, -m.r - tl);
      og.addColorStop(0, 'rgba(255,120,45,0.55)');
      og.addColorStop(0.45, 'rgba(255,70,40,0.28)');
      og.addColorStop(1, 'rgba(255,50,35,0)');
      ctx.strokeStyle = og;
      ctx.lineWidth = m.r * 2.4;
      ctx.shadowColor = 'rgba(255,80,40,0.8)';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(0, -m.r);
      ctx.quadraticCurveTo(sway * 0.5, -m.r - tl * 0.55, sway, -m.r - tl);
      ctx.stroke();
      // 白热内芯
      ctx.shadowBlur = 0;
      const cg = ctx.createLinearGradient(0, -m.r, 0, -m.r - tl * 0.8);
      cg.addColorStop(0, 'rgba(255,236,190,0.9)');
      cg.addColorStop(0.4, 'rgba(255,190,110,0.5)');
      cg.addColorStop(1, 'rgba(255,170,90,0)');
      ctx.strokeStyle = cg;
      ctx.lineWidth = m.r * 0.9;
      ctx.beginPath();
      ctx.moveTo(0, -m.r);
      ctx.quadraticCurveTo(sway * 0.5, -m.r - tl * 0.55, sway, -m.r - tl * 0.8);
      ctx.stroke();
      // 上行喷流亮段：虚线沿拖尾向外流动（能量自弹体向后喷出）
      ctx.strokeStyle = `rgba(255,214,130,${(0.5 * flick).toFixed(3)})`;
      ctx.lineWidth = m.r * 0.55;
      ctx.setLineDash([7, 13]);
      ctx.lineDashOffset = -state.time * 300;
      ctx.beginPath();
      ctx.moveTo(0, -m.r * 1.2);
      ctx.quadraticCurveTo(sway * 0.5, -m.r - tl * 0.55, sway, -m.r - tl);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'source-over';
      // ---- 贴弹体尾焰 ----
      const tg = ctx.createLinearGradient(0, -m.r * 4.5, 0, 0);
      tg.addColorStop(0, 'rgba(255,120,40,0)');
      tg.addColorStop(1, 'rgba(255,200,90,0.85)');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.moveTo(-m.r * 0.6, 0);
      ctx.lineTo(m.r * 0.6, 0);
      ctx.lineTo(m.r * 0.3, -m.r * 4.5);
      ctx.lineTo(-m.r * 0.3, -m.r * 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = m.dk ? '#c22030' : '#ff4d2b';   // dk = 辛国栋导弹弹体略压暗（2026-10-03 用户定稿「略微黑一点点」，黑红系）
      ctx.shadowColor = m.dk ? '#8a1420' : '#ff4d2b';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(0, m.r * 1.7);
      ctx.lineTo(m.r, -m.r * 0.4);
      ctx.lineTo(m.r * 0.45, -m.r);
      ctx.lineTo(-m.r * 0.45, -m.r);
      ctx.lineTo(-m.r, -m.r * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // 大狗导弹雨：炮火先兆者同款导弹的自下而上版——弹头朝上 + 向下尾焰 + 高速光带拖尾，
  // 配色换为白蓝渐变（外带天蓝辉光 + 白热内芯，贴弹体尾焰与喷流同为白蓝系）；
  // m.berserk（副武器捣蛋来袭暴走 Lv5）换金红渐变涂装（仅视觉，数值与规则不变）
  function drawDagouMissiles() {
    for (const m of dagouMissiles) {
      if (m.delay > 0) continue;   // 未发射（错峰待发）不绘制
      const gold = m.berserk;
      ctx.save();
      ctx.translate(m.x, m.y);
      if (m.rot) ctx.rotate(m.rot);   // 捣蛋来袭（副武器直射弹）：按弹道方向倾斜（0 = 竖直向上的大狗导弹雨）
      if (m.dieT != null) ctx.globalAlpha = clamp(m.dieT / 0.3, 0, 1);   // 警报 / BOSS 登场：快速消散渐隐
      // BOSS 战期间大狗召唤的导弹整体半透明（0.7）：与消散渐隐相乘，避免覆盖 dieT 动画；
      // 捣蛋来袭（副武器直射弹，m.sub 标记）不适用、保持不透明
      if (bossFlow.stage === 'fight' && !m.sub) ctx.globalAlpha *= 0.7;
      // ---- 光带拖尾：沿运动反方向（竖直向下）的光带，长度/亮度随时间闪动、轴线轻微摆动 ----
      // 相位源 m.flameT（updateDagouMissiles 推进）：gameover 后停止更新 → 尾焰冻结静止（此前用 state.time，失败页面弹出后仍每帧抖动）
      const ft = m.flameT || 0;
      const flick = 0.82 + 0.18 * Math.sin(ft * 21 + m.x * 0.7);
      const tl = m.r * 11 * flick;
      const sway = Math.sin(ft * 13 + m.x * 0.9) * 4;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      // 外带（根部最亮，向外渐隐）：天蓝 / 金红
      const og = ctx.createLinearGradient(0, m.r, 0, m.r + tl);
      og.addColorStop(0, gold ? 'rgba(255,200,130,0.55)' : 'rgba(140,200,255,0.55)');
      og.addColorStop(0.45, gold ? 'rgba(255,150,70,0.28)' : 'rgba(90,150,255,0.28)');
      og.addColorStop(1, gold ? 'rgba(255,120,50,0)' : 'rgba(70,120,255,0)');
      ctx.strokeStyle = og;
      ctx.lineWidth = m.r * 2.4;
      ctx.shadowColor = gold ? 'rgba(255,170,90,0.8)' : 'rgba(100,170,255,0.8)';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(0, m.r);
      ctx.quadraticCurveTo(sway * 0.5, m.r + tl * 0.55, sway, m.r + tl);
      ctx.stroke();
      // 白热内芯
      ctx.shadowBlur = 0;
      const cg = ctx.createLinearGradient(0, m.r, 0, m.r + tl * 0.8);
      cg.addColorStop(0, gold ? 'rgba(255,244,228,0.9)' : 'rgba(235,248,255,0.9)');
      cg.addColorStop(0.4, gold ? 'rgba(255,205,150,0.5)' : 'rgba(170,215,255,0.5)');
      cg.addColorStop(1, gold ? 'rgba(255,180,110,0)' : 'rgba(140,190,255,0)');
      ctx.strokeStyle = cg;
      ctx.lineWidth = m.r * 0.9;
      ctx.beginPath();
      ctx.moveTo(0, m.r);
      ctx.quadraticCurveTo(sway * 0.5, m.r + tl * 0.55, sway, m.r + tl * 0.8);
      ctx.stroke();
      // 下行喷流亮段：虚线沿拖尾向外流动（能量自弹体向后喷出）
      ctx.strokeStyle = gold ? `rgba(255,220,170,${(0.5 * flick).toFixed(3)})` : `rgba(190,225,255,${(0.5 * flick).toFixed(3)})`;
      ctx.lineWidth = m.r * 0.55;
      ctx.setLineDash([7, 13]);
      ctx.lineDashOffset = -ft * 300;
      ctx.beginPath();
      ctx.moveTo(0, m.r * 1.2);
      ctx.quadraticCurveTo(sway * 0.5, m.r + tl * 0.55, sway, m.r + tl);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'source-over';
      // ---- 贴弹体尾焰（白蓝 / 金红渐变）----
      const tg = ctx.createLinearGradient(0, m.r * 4.5, 0, 0);
      tg.addColorStop(0, gold ? 'rgba(255,160,90,0)' : 'rgba(120,180,255,0)');
      tg.addColorStop(1, gold ? 'rgba(255,225,185,0.85)' : 'rgba(200,235,255,0.85)');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.moveTo(-m.r * 0.6, 0);
      ctx.lineTo(m.r * 0.6, 0);
      ctx.lineTo(m.r * 0.3, m.r * 4.5);
      ctx.lineTo(-m.r * 0.3, m.r * 4.5);
      ctx.closePath();
      ctx.fill();
      // 弹体：尖头朝上（与先兆者导弹同轮廓），白蓝 / 金红渐变
      const bg = ctx.createLinearGradient(0, -m.r * 1.7, 0, m.r);
      bg.addColorStop(0, '#ffffff');
      bg.addColorStop(0.5, gold ? '#ffd9ae' : '#bfe0ff');
      bg.addColorStop(1, gold ? '#f0955b' : '#5b9cf0');
      ctx.fillStyle = bg;
      ctx.shadowColor = gold ? '#ffb545' : '#7fb8ff';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(0, -m.r * 1.7);
      ctx.lineTo(m.r, m.r * 0.4);
      ctx.lineTo(m.r * 0.45, m.r);
      ctx.lineTo(-m.r * 0.45, m.r);
      ctx.lineTo(-m.r, m.r * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // ---------- 掉落水晶 3D 精灵（水晶系统改版）：三档模型 × 三色 + 巨型双色，24 帧自转烘焙 ----------
  // 模型与测试页「雷译正视图」同源：小＝四棱锥+腰带+四棱锥（正视投影 = 尖顶六边形）；
  // 中＝长方体核心 + 八角白框（框厚 = 核心厚 40%）；大＝正方板 + 菱形白框（框厚 = 核心厚 25%）；
  // 巨型 = 原石（四芒星双锥专用模型，全局纵向色标渐变：上粉 / 下蓝、赤道交汇近白，色标见 STAR_STOPS）。
  // 颜色直接分配到面上（小档顶亮底暗 / 中档中央白高光减半 / 大档淡色玻璃感 / 原石色标渐变 + 刻面交替），底光 / 间隙光 / 内孔高亮全部烘焙进帧内；
  // 运行时每颗水晶每帧仅 1 次 drawImage（1:1 整数位贴图）。
  const CRYSTAL3D_FRAMES = 24;                 // 自转一周 24 帧（15°/帧，12 帧/半圈，对齐 QQ雷电老动画口径）
  const CRYSTAL3D_BAKE = { small: 40, mid: 48, big: 90, giant: 52 };   // 大档 2026-09-28 长宽 ×1.6（56 → 90 含光晕余量）；原石宽度不变   // 烘焙底板边长（含光晕余量）
  const CRYSTAL3D_R = { small: 6, mid: 10, big: 25.6, giant: 14 };   // 2026-09-28：大档长宽 +60%（16 → 25.6），原石宽度不变（giant 仍为 14，星模纵向芒尖 1.15R ≈ 16）；2026-09-27 定稿：giant = 星模芒尖对齐大档旧口径
  const CRYSTAL3D_COLORS = ['#39c5bb', '#46aaff', '#ffc0cb'];   // 普通水晶三色（原青 + 水蓝 + 粉；与 01-config CRYSTAL_COLORS 一致；当前无引用，保留备用）
  const crystal3DSprites = new Map();          // key: `${tier}:${colorKey}` → { frames: [canvas × 24], size }

  // 薄棱柱 / 板 / 框 实体注册表（单位空间，渲染时 × 各档 R；法线由绕序保证，框体 strict 跳过质心翻向）
  const CRYSTAL3D_SOLIDS = {
    small: {   // 小：腰带长方体 + 上下四棱锥（正视投影 = 尖顶六边形 H1.2 / W0.58）
      verts: [
        [-0.58, -0.54, -0.25], [0.58, -0.54, -0.25], [0.58, -0.54, 0.25], [-0.58, -0.54, 0.25],   // 顶环
        [-0.58, 0.54, -0.25], [0.58, 0.54, -0.25], [0.58, 0.54, 0.25], [-0.58, 0.54, 0.25],       // 底环
        [0, -1.2, 0],                                                                              // 顶锥尖（单顶点）
        [0, 1.2, 0],                                                                               // 底锥尖
      ],
      scale: [1, 1, 1],
      faces: [
        [8, 0, 1], [8, 1, 2], [8, 2, 3], [8, 3, 0],   // 顶锥（亮 / 镜面）
        [9, 5, 4], [9, 6, 5], [9, 7, 6], [9, 4, 7],   // 底锥（暗）
        [3, 2, 6, 7],                                  // 腰带前面
        [1, 0, 4, 5],                                  // 腰带后面
        [2, 1, 5, 6],                                  // 腰带右面
        [0, 3, 7, 4],                                  // 腰带左面
      ],
      strict: false,
    },
    mid: {   // 中：长方体核心（半宽 0.56 / 半高 0.72 / 半厚 0.225——正视为竖长矩形）
      verts: [
        [-0.56, -0.72, -0.225], [0.56, -0.72, -0.225], [0.56, 0.72, -0.225], [-0.56, 0.72, -0.225],
        [-0.56, -0.72, 0.225], [0.56, -0.72, 0.225], [0.56, 0.72, 0.225], [-0.56, 0.72, 0.225],
      ],
      scale: [1, 1, 1],
      faces: [
        [4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6], [0, 4, 7, 3], [7, 6, 2, 3], [4, 5, 1, 0],
      ],
      strict: false,
    },
    big: {   // 大：正方板（半边 0.42 / 半厚 0.25——正视为正方形）
      verts: [
        [-0.42, -0.42, 0.25], [0.42, -0.42, 0.25], [0.42, 0.42, 0.25], [-0.42, 0.42, 0.25],
        [-0.42, -0.42, -0.25], [0.42, -0.42, -0.25], [0.42, 0.42, -0.25], [-0.42, 0.42, -0.25],
      ],
      scale: [1, 1, 1],
      faces: [
        [0, 1, 2, 3], [5, 4, 7, 6], [5, 1, 2, 6], [0, 4, 7, 3], [3, 2, 6, 7], [0, 5, 4, 1],
      ],
      strict: false,
    },
  };

  // 白框实体（非凸、绕序手工修正 → strict 跳过质心自动翻向）：中 = 八角框（厚 = 核心厚 40%）；
  // 大 = 菱形框（外 1 / 内 0.8，厚 = 核心厚 25%）
  const CRYSTAL3D_WASHER = {
    mid: (() => {
      const w0 = 0.78, hh0 = 1, ch = 0.36, s = 0.72, t = 0.09;
      const o = [
        [-(w0 - ch), -hh0], [w0 - ch, -hh0], [w0, -(hh0 - ch)], [w0, hh0 - ch],
        [w0 - ch, hh0], [-(w0 - ch), hh0], [-w0, hh0 - ch], [-w0, -(hh0 - ch)],
      ];
      const i = o.map(p => [p[0] * s, p[1] * s]);
      const verts = [
        ...o.map(p => [p[0], p[1], t]), ...o.map(p => [p[0], p[1], -t]),
        ...i.map(p => [p[0], p[1], t]), ...i.map(p => [p[0], p[1], -t]),
      ];
      const faces = [];
      for (let k = 0; k < 8; k++) {
        const k2 = (k + 1) % 8;
        faces.push([k + 8, k2 + 8, k2, k]);                 // 外壁
        faces.push([16 + k, 16 + k2, 24 + k2, 24 + k]);     // 内壁（法线朝孔内 = 实体外侧）
        faces.push([k, k2, 16 + k2, 16 + k]);               // 前环带
        faces.push([8 + k, 24 + k, 24 + k2, 8 + k2]);       // 后环带
      }
      return { verts, scale: [1, 1, 1], faces, strict: true };
    })(),
    big: (() => {
      const o = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      const i = o.map(p => [p[0] * 0.8, p[1] * 0.8]);
      const t = 0.125;
      const verts = [
        ...o.map(p => [p[0], p[1], t]), ...o.map(p => [p[0], p[1], -t]),
        ...i.map(p => [p[0], p[1], t]), ...i.map(p => [p[0], p[1], -t]),
      ];
      const faces = [];
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4;
        faces.push([k + 4, k2 + 4, k2, k]);                 // 外壁
        faces.push([8 + k, 8 + k2, 12 + k2, 12 + k]);       // 内壁
        faces.push([k, k2, 8 + k2, 8 + k]);                 // 前环带
        faces.push([4 + k, 12 + k, 12 + k2, 4 + k2]);       // 后环带
      }
      return { verts, scale: [1, 1, 1], faces, strict: true };
    })(),
  };

  function xtalC3Rgb(base) {   // hex → [r, g, b]
    return [parseInt(base.slice(1, 3), 16), parseInt(base.slice(3, 5), 16), parseInt(base.slice(5, 7), 16)];
  }
  function xtalC3Shade(base, k, to) {   // hex 向白 / 黑推进（返回 hex）
    const A = xtalC3Rgb(base);
    const t = to === 'w' ? 255 : 0;
    return '#' + [0, 1, 2].map(i => Math.round(A[i] + (t - A[i]) * k).toString(16).padStart(2, '0')).join('');
  }
  function xtalC3MixHex(a, b, k) {   // 两个 hex 插值（返回 hex）
    const A = xtalC3Rgb(a), B = xtalC3Rgb(b);
    return '#' + [0, 1, 2].map(i => Math.round(A[i] + (B[i] - A[i]) * k).toString(16).padStart(2, '0')).join('');
  }
  function xtalC3Mix(lo, hi, k) {   // rgb 数组插值（返回 rgb() 字符串）
    return 'rgb(' + Math.round(lo[0] + (hi[0] - lo[0]) * k) + ',' + Math.round(lo[1] + (hi[1] - lo[1]) * k) + ',' + Math.round(lo[2] + (hi[2] - lo[2]) * k) + ')';
  }

  // 单帧渲染：底光 / 间隙光 / 框内高亮 / 实体（白框 + 核心），按深度排序（框与核心穿插处图层正确）
  function crystal3DDrawFrame(g, tier, base, R, th, flip) {
    if (tier === 'giant') { crystal3DStarDraw(g, th, flip); return; }   // 原石：四芒星双锥（巨型专用样式）
    const sn = Math.sin(th), cs = Math.cos(th);
    const proj = v => {
      const X = v[0] * cs + v[2] * sn, Z = -v[0] * sn + v[2] * cs;
      const pw = 1 / (1 - Z * 0.06);
      return [X * pw * R, v[1] * pw * R, Z];
    };
    const gr = xtalC3Rgb(base);
    const rgba = a => `rgba(${gr[0]},${gr[1]},${gr[2]},${a})`;
    // 底光：lighter 叠加、垫在实体后面（用户定稿 2026-09-27：大档本体降亮、周围光效提亮——alpha 0.1 → 0.16、中心 0.45 → 0.65；small/mid 不动）
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = tier === 'big' ? 0.16 : 0.2;
    const auraR = R * 1.5;
    const ag = g.createRadialGradient(0, 0, 0, 0, 0, auraR);
    ag.addColorStop(0, rgba(tier === 'big' ? '0.65' : '0.8'));
    ag.addColorStop(0.55, rgba(tier === 'big' ? '0.28' : '0.32'));
    ag.addColorStop(1, rgba('0'));
    g.fillStyle = ag;
    g.fillRect(-auraR, -auraR, auraR * 2, auraR * 2);
    g.restore();
    // 大档缝隙填光（黑线根因：板对角 0.594R 与白框内孔菱形 0.8R 间缝隙露出深色背景，正视时左右呈竖向黑带）：
    // 按白框内孔前/后开口两组四边形（WASHER.big verts 8~11 / 12~15，含旋转投影）填 lighter 径向光，
    // 板面随后盖住中心、白框体盖住外缘，光只在框-板缝隙透出（峰值 ≈0.7）。
    // 2026-09-27 备注：曾试改 source-over 不透明垫底（饱和版 / 近白版）均被否决回滚，加色方案为定稿
    if (tier === 'big') {
      g.save();
      g.globalCompositeOperation = 'lighter';
      const gg2 = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.85);
      gg2.addColorStop(0, rgba('0.7'));
      gg2.addColorStop(0.85, rgba('0.6'));
      gg2.addColorStop(1, rgba('0.4'));
      g.fillStyle = gg2;
      for (const lo of [8, 12]) {
        g.beginPath();
        CRYSTAL3D_WASHER.big.verts.slice(lo, lo + 4).map(proj).forEach((p, i2) => (i2 ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        g.closePath();
        g.fill();
      }
      g.restore();
    }
    // 实体面收集 + 深度排序（白框 lo/hi 白系；核心 faceColors 设计色）
    const faces = [];
    const pushSolid = (s, lo, hi, faceColors, noShadow) => {
      const rot = s.verts.map(v => {
        const X = v[0] * cs + v[2] * sn, Z = -v[0] * sn + v[2] * cs;
        const pw = 1 / (1 - Z * 0.06);
        return [X * pw * R, v[1] * pw * R, Z];
      });
      for (let fi = 0; fi < s.faces.length; fi++) {
        const f = s.faces[fi];
        const a = rot[f[0]], b = rot[f[1]], cc = rot[f[2]];
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const e2 = [cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]];
        let nx = e1[1] * e2[2] - e1[2] * e2[1];
        let ny = e1[2] * e2[0] - e1[0] * e2[2];
        let nz = e1[0] * e2[1] - e1[1] * e2[0];
        const mx = (a[0] + b[0] + cc[0]) / 3, my = (a[1] + b[1] + cc[1]) / 3, mz = (a[2] + b[2] + cc[2]) / 3;
        if (!s.strict && nx * mx + ny * my + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        if (nz <= 0.02) continue;
        const nl = Math.hypot(nx, ny, nz) || 1;
        const shade = 0.38 + 0.62 * Math.max(0, (nx * -0.4 + ny * -0.55 + nz * 0.75) / nl);
        let fill;
        const fc = faceColors ? faceColors[fi] : null;
        if (fc && typeof fc === 'object' && fc.grad) {
          const xs = f.map(idx => rot[idx][0]), ys = f.map(idx => rot[idx][1]);
          const gx0 = Math.min(...xs), gy0 = Math.min(...ys), gx1 = Math.max(...xs), gy1 = Math.max(...ys);
          fill = { gx0, gy0, gx1, gy1, stops: fc.grad, radial: fc.radial };
        } else fill = xtalC3MixHex(fc || lo, '#000000', 0.06 - 0.06 * shade) || xtalC3Mix(xtalC3Rgb(lo), xtalC3Rgb(hi), shade);
        faces.push({ pts: f.map(idx => [rot[idx][0], rot[idx][1]]), depth: f.reduce((acc, idx) => acc + rot[idx][2], 0) / f.length, fill, noShadow });
      }
    };
    if (tier === 'small') {
      const hi = xtalC3Shade(base, 0.5, 'w'), hm = xtalC3MixHex(hi, base, 0.5);
      const lo = xtalC3Shade(base, 0.3, 'b'), lm = xtalC3MixHex(lo, base, 0.5);
      pushSolid(CRYSTAL3D_SOLIDS.small, base, base, [hi, hm, hi, hm, lo, lm, lo, lm, hm, hm, lm, lm], false);
    } else {
      const white = tier === 'mid' ? '#f0f6fc' : '#eef4fb';
      // 白框亮度次序：中档提白提亮（0.12/0.02 → 0.05/0）后于 2026-09-27 二次定稿回撤——中档白框减白（0.05/0 → 0.22/0.1，避免过于显眼）；
      // 大档减白加彩（0.4/0.25 → 0.18/0.08，边框基本全白、仅略微颜色偏移）
      const wLoK = tier === 'mid' ? 0.22 : 0.18, wHiK = tier === 'mid' ? 0.1 : 0.08;
      const washerLo = xtalC3MixHex(white, base, wLoK), washerHi = xtalC3MixHex(white, base, wHiK);
      const core = xtalC3MixHex(base, '#ffffff', tier === 'mid' ? 0.4 : 0.78);
      const faceColors = tier === 'mid'
        ? [
            // 白高光更多更亮（radial 白心 0.5 → 0.6、中心 0.92 → 0.96，用户定稿）；白心范围 0.6 → 0.64（2026-09-27 粉中定稿：0.68 回调，仍大于原 0.6）
            { grad: [[0, 'rgba(255,255,255,0.96)'], [0.64, xtalC3MixHex(base, '#ffffff', 0.3)], [1, xtalC3MixHex(base, '#000000', 0.28)]], radial: true },
            { grad: [[0, 'rgba(255,255,255,0.96)'], [0.64, xtalC3MixHex(base, '#ffffff', 0.3)], [1, xtalC3MixHex(base, '#000000', 0.28)]], radial: true },
            xtalC3MixHex(base, '#000000', 0.12), xtalC3MixHex(base, '#000000', 0.12), base, base,
          ]
        : [
            // 大档板面（用户定稿 2026-09-27：本体降亮显色——三色大水晶过去近乎全白无法区分）：radial 居中锚点、白心减弱、边缘露出本色
            { grad: [[0, 'rgba(255,255,255,0.75)'], [0.6, xtalC3MixHex(base, '#ffffff', 0.45)], [1, xtalC3MixHex(base, '#ffffff', 0.18)]], radial: 'center' },
            { grad: [[0, 'rgba(255,255,255,0.75)'], [0.6, xtalC3MixHex(base, '#ffffff', 0.45)], [1, xtalC3MixHex(base, '#ffffff', 0.18)]], radial: 'center' },
            xtalC3MixHex(base, '#ffffff', 0.18), xtalC3MixHex(base, '#ffffff', 0.18), xtalC3MixHex(base, '#ffffff', 0.18), xtalC3MixHex(base, '#ffffff', 0.18),
          ];
      const model = tier;
      pushSolid(CRYSTAL3D_WASHER[model], washerLo, washerHi, null, tier === 'big');   // 大档白框不投辉光阴影（2026-09-27 定稿：边框少受光效影响）
      pushSolid(CRYSTAL3D_SOLIDS[model], base, base, faceColors, true);
    }
    faces.sort((p, q) => p.depth - q.depth);
    for (const f of faces) {
      // 大档面光晕再压（用户定稿）：blur 5 → 4、alpha 0.32 → 0.2（small/mid 不动）
      g.shadowBlur = f.noShadow ? 0 : (tier === 'big' ? 4 : 7);
      g.shadowColor = rgba(tier === 'big' ? '0.2' : '0.5');
      if (f.fill && f.fill.stops) {
        let grd;
        if (f.fill.radial) {
          // radial: true = 左上光源锚点(0.3,0.26)；'center' = 面几何中心（大档板面用：纯白居中、四边均匀渐变无单边深线）
          const rkx = f.fill.radial === 'center' ? 0.5 : 0.3, rky = f.fill.radial === 'center' ? 0.5 : 0.26;
          const cxr = f.fill.gx0 + (f.fill.gx1 - f.fill.gx0) * rkx, cyr = f.fill.gy0 + (f.fill.gy1 - f.fill.gy0) * rky;
          grd = g.createRadialGradient(cxr, cyr, 0, cxr, cyr, Math.max(f.fill.gx1 - f.fill.gx0, f.fill.gy1 - f.fill.gy0) * 0.95);
        } else {
          grd = g.createLinearGradient(f.fill.gx0, f.fill.gy0, f.fill.gx1, f.fill.gy1);
        }
        for (const [o, c2] of f.fill.stops) grd.addColorStop(o, c2);
        g.fillStyle = grd;
      } else g.fillStyle = f.fill;
      g.beginPath();
      f.pts.forEach((p, i2) => (i2 ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.closePath();
      g.fill();
      // 板面同色描边收缝（noShadow = 大档正方板）：相邻面共享边的抗锯齿缝隙会露出深色底（竖向黑线），同色描 1px 补缝
      if (f.noShadow) {
        g.strokeStyle = g.fillStyle;
        g.lineWidth = 1;
        g.stroke();
      }
    }
    g.shadowBlur = 0;
  }

  // ---------- 原石（巨型改版）：四芒星双锥 ----------
  // 赤道 8 顶点（4 芒尖 N/E/S/W + 4 凹谷斜角）+ 前后锥尖，16 三角面；厚 ≈ 0.32R；
  // 面色走全局纵向色标渐变（参考图定稿）：上粉（尖端深粉→赤道粉白）/ 下蓝（赤道白青→亮青→尖端深蓝），
  // 赤道交汇处近白 = 晶莹透亮的关键；刻面交替轻微明暗（偶面提亮 / 奇面压暗），shadow 随面主色，g1 = 色标上下翻转
  const STAR_STOPS = [
    [0.00, '#f2a8c9'], [0.20, '#f9c2d8'], [0.40, '#ffdfe9'], [0.50, '#fff3f7'],
    [0.52, '#eefaff'], [0.66, '#8fe4dc'], [0.74, '#39c5bb'], [0.88, '#4a8ad0'], [1.00, '#3a72c8'],
  ];
  function xtalC3StarStop(u) {   // 采样原石全局色标（线性插值，返回 hex；u 越界夹取）
    const v = Math.max(0, Math.min(1, u));
    for (let k = 1; k < STAR_STOPS.length; k++) {
      if (v <= STAR_STOPS[k][0]) {
        const [u0, c0] = STAR_STOPS[k - 1], [u1, c1] = STAR_STOPS[k];
        return xtalC3MixHex(c0, c1, (v - u0) / Math.max(1e-6, u1 - u0));
      }
    }
    return STAR_STOPS[STAR_STOPS.length - 1][1];
  }
  const CRYSTAL3D_STAR = (() => {
    const t = 0.32, rv = 0.55, ry = 1.15;
    const eq = [
      [0, -ry], [rv * 0.707, -rv * 0.707], [1, 0], [rv * 0.707, rv * 0.707],
      [0, ry], [-rv * 0.707, rv * 0.707], [-1, 0], [-rv * 0.707, -rv * 0.707],
    ];
    const verts = [...eq.map(p => [p[0], p[1], 0]), [0, 0, t], [0, 0, -t]];   // 0-7 赤道环 8=前锥尖 9=后锥尖
    const faces = [];
    for (let k = 0; k < 8; k++) {
      const k2 = (k + 1) % 8;
      faces.push([8, k, k2]);        // 前锥八三角
      faces.push([9, k2, k]);        // 后锥八三角
    }
    return { verts, scale: [1, 1, 1], faces, strict: true };   // 绕序已保证朝外，strict 跳过质心翻向
  })();

  function crystal3DStarDraw(g, th, flip, R, tw) {
    R = R || CRYSTAL3D_R.giant;   // R 可选：预览测试页实时矢量绘制传大半径（位图烘焙帧放大发糊，故预览走 live）
    const sn = Math.sin(th), cs = Math.cos(th);
    const s = CRYSTAL3D_STAR;
    const fl = flip ? -1 : 1;
    const rot = s.verts.map(v => [v[0] * cs + v[2] * sn, v[1], -v[0] * sn + v[2] * cs]);
    const P = rot.map(p => {
      const pw = 1 / (1 - p[2] * 0.06);
      return [p[0] * pw * R, p[1] * pw * R];
    });
    // 双色底光：上粉下蓝两团 radial（lighter，垫在实体后；翻转配色时对调）
    // tw（时间秒）传入时底光闪动（预览实时 / 游戏内运行时叠加用；烘焙不传 → 静态 0.3）
    const twk = tw == null ? 0 : Math.sin(tw * 5.2) * 0.5 + Math.sin(tw * 9.1) * 0.5;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.3 + twk * 0.1;
    for (const [cy2, col] of [[-0.5 * fl, [255, 170, 200]], [0.5 * fl, [70, 130, 230]]]) {
      const ag = g.createRadialGradient(0, cy2 * R, 0, 0, cy2 * R, R * 1.15);
      ag.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${(0.55 + twk * 0.12).toFixed(3)})`);
      ag.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      g.fillStyle = ag;
      g.fillRect(-R * 1.3, -R * 1.3, R * 2.6, R * 2.6);
    }
    g.restore();
    // 星体外圈光效（仅 tw 传入时画 = 预览实时 / 运行时叠加；烘焙帧不画，游戏内由 10-draw-world 垫同款光环）：
    // 用户定稿 2026-09-27（二次）：去掉最外圈光环，仅保留本体与光环之间的脉冲光带 + 绕行光斑（图层低于原石 = 画在实体之前）：
    // 一层脉冲光带（0.55~1.12R，星谷处露出、星尖处隐入本体后方）+ 四团绕行光斑（轨道 0.88~1.02R）脉冲式明暗/尺寸呼吸
    if (tw != null) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.5 + twk * 0.15;
      const pg = g.createRadialGradient(0, 0, R * 0.55, 0, 0, R * 1.12);
      pg.addColorStop(0, 'rgba(255,225,242,0)');
      pg.addColorStop(0.6, `rgba(255,215,240,${(0.16 + 0.14 * twk).toFixed(3)})`);
      pg.addColorStop(1, 'rgba(150,180,255,0)');
      g.fillStyle = pg;
      g.fillRect(-R * 1.15, -R * 1.15, R * 2.3, R * 2.3);
      // 四团光斑贴本体边缘绕行（轨道 0.88~1.02R = 本体与光环之间），脉冲式明暗（sin² 突峰）+ 尺寸呼吸，星尖处隐入本体后方
      const ORB = [[0.98, 0.28, 2.1], [1.02, 0.22, -1.6], [0.88, 0.24, -2.6], [0.95, 0.18, 3.0]];
      for (let k = 0; k < ORB.length; k++) {
        const [orr, osz, osp] = ORB[k];
        const pulse = 0.5 + 0.5 * Math.sin(tw * 4.2 + k * 1.7);
        const ang = tw * osp + k * 1.9;
        const ox = Math.cos(ang) * R * orr, oy = Math.sin(ang) * R * orr * 0.92;
        const osz2 = R * osz * (1 + 0.15 * pulse);
        const og = g.createRadialGradient(ox, oy, 0, ox, oy, osz2);
        const oa = (0.1 + 0.26 * pulse * pulse).toFixed(3);
        og.addColorStop(0, k % 2 ? `rgba(160,190,255,${oa})` : `rgba(255,220,240,${oa})`);
        og.addColorStop(1, k % 2 ? 'rgba(160,190,255,0)' : 'rgba(255,220,240,0)');
        g.fillStyle = og;
        g.fillRect(ox - osz2 - 2, oy - osz2 - 2, (osz2 + 2) * 2, (osz2 + 2) * 2);
      }
      g.restore();
    }
    const faces = [];
    for (let fi = 0; fi < s.faces.length; fi++) {
      const f = s.faces[fi];
      const a = rot[f[0]], b = rot[f[1]], cc = rot[f[2]];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]];
      let nx = e1[1] * e2[2] - e1[2] * e2[1];
      let ny = e1[2] * e2[0] - e1[0] * e2[2];
      let nz = e1[0] * e2[1] - e1[1] * e2[0];
      if (nz <= 0.02) continue;   // strict：绕序已保证朝外
      // 面内纵向渐变（晶莹质感）：模型 y（±1.15）→ 全局色标 t（0=上尖 1=下尖），
      // 截取该面 y 区间内的停靠点建线性渐变（屏幕 y 与模型 y 同序）；g1 翻转配色 = 色标 u 取反、渐变方向不变
      const ys3 = [a[1], b[1], cc[1]];
      const tLo = (Math.min(...ys3) + 1.15) / 2.3, tHi = (Math.max(...ys3) + 1.15) / 2.3;
      const samp = u => xtalC3StarStop(flip ? 1 - u : u);
      // 面间光影（棱线感由明暗对比表达，参考图光源偏左上）：受光面更强提亮、背光面减淡压暗（暗面保持透亮晶莹），
      // 光向量 z 分量加大 = 更多面受光、整体更亮；刻面交替减弱为辅
      const nl3 = Math.hypot(nx, ny, nz) || 1;
      const lit = (nx * -0.5 + ny * -0.3 + nz * 0.82) / nl3;
      const adj = h => {
        const c = lit >= 0 ? xtalC3Shade(h, Math.min(0.55, lit * 0.5), 'w') : xtalC3Shade(h, Math.min(0.22, -lit * 0.2), 'b');
        return fi % 2 === 0 ? xtalC3Shade(c, 0.08, 'w') : xtalC3Shade(c, 0.05, 'b');
      };
      const stops = [[0, adj(samp(tLo))], [1, adj(samp(tHi))]];
      for (const [u, cS] of STAR_STOPS) {
        if (u > tLo + 1e-6 && u < tHi - 1e-6) stops.splice(1, 0, [(u - tLo) / (tHi - tLo), adj(cS)]);
      }
      faces.push({
        pts: f.map(idx => [P[idx][0], P[idx][1]]),
        depth: f.reduce((acc, idx) => acc + rot[idx][2], 0) / f.length,
        stops,
        shadow: xtalC3MixHex(samp((tLo + tHi) / 2), '#ffffff', 0.35),   // 面辉光增强（晶莹感）
      });
    }
    faces.sort((p, q) => p.depth - q.depth);
    for (const f of faces) {
      g.shadowColor = f.shadow;
      g.shadowBlur = 10;
      const grd = g.createLinearGradient(0, Math.min(...f.pts.map(p => p[1])), 0, Math.max(...f.pts.map(p => p[1])));
      for (const [o, c2] of f.stops) grd.addColorStop(o, c2);
      g.fillStyle = grd;
      g.beginPath();
      f.pts.forEach((p, i2) => (i2 ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.closePath();
      g.fill();
      // 晶体棱线（用户定稿）：内部不描白线——棱线感由面间光影对比（上方 lit 明暗）表达；
      // 仅沿两条径向棱（pts[0] 恒为锥尖）留几乎看不到的极淡白边（alpha 0.12、宽 R×0.07），赤道边不描
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.lineWidth = Math.max(1, R * 0.07);
      g.beginPath();
      g.moveTo(f.pts[0][0], f.pts[0][1]);
      g.lineTo(f.pts[1][0], f.pts[1][1]);
      g.moveTo(f.pts[0][0], f.pts[0][1]);
      g.lineTo(f.pts[2][0], f.pts[2][1]);
      g.stroke();
    }
    // 玻璃反光条已移除（用户反馈：原石一面发光一面不发光——该条只在 cs>0.15 的半圈自转内出现）
    g.shadowBlur = 0;
  }

  // 烘焙单帧（幂等）：对应组不存在则先建占位画布组；烘焙失败标记已烘并打日志，避免反复重试
  function bakeCrystal3DFrame(tier, colorKey, f) {
    const key = tier + ':' + colorKey;
    let set = crystal3DSprites.get(key);
    if (!set) {
      const R = CRYSTAL3D_R[tier];      // 原石 R 已折算芒尖系数（13/1.15≈11.3），绘制尺寸与大型宝石一致
      const size = Math.ceil(CRYSTAL3D_BAKE[tier]);
      const frames = [];
      for (let i = 0; i < CRYSTAL3D_FRAMES; i++) {
        const cv = document.createElement('canvas');
        cv.width = size;
        cv.height = size;
        cv.__baked = false;
        frames.push(cv);
      }
      set = { frames, size };
      crystal3DSprites.set(key, set);
    }
    const cv = set.frames[f];
    if (cv.__baked) return;
    try {
      const base = colorKey[0] === 'g'
        ? CRYSTAL_GIANT_COLORS[Number(colorKey.slice(1))]
        : CRYSTAL_COLORS[Number(colorKey.slice(1))];
      const g = cv.getContext('2d');
      g.translate(set.size / 2, set.size / 2);
      crystal3DDrawFrame(g, tier, base, CRYSTAL3D_R[tier], (f * Math.PI * 2) / CRYSTAL3D_FRAMES, colorKey === 'g1');
      cv.__baked = true;
    } catch (err) {
      cv.__baked = true;   // 失败也标记：宁缺勿反复重试（控制台留根因）
      console.error('[crystal3D] 烘焙失败', tier, colorKey, f, err);
    }
  }
  // 异步预取队列：全部 档位×颜色×24 帧分小块后台烘焙，运行时只做按需单帧补烘（≈0.3ms，无感）
  // 启动卡顿优化（实测）：原实现 80ms 后即开始、每块 3 帧、setTimeout(0) 链式推进——
  // 刷新后 1~2s 内与主循环抢主线程，弱机/内嵌预览上造成可感掉帧（"刷新后卡一下"）。
  // 现改为：延迟 600ms（让首帧/主菜单先稳定渲染）+ 每块只烘 1 帧（单帧 ≈0.5~1ms，低于一帧预算）
  // + 优先走 requestIdleCallback（浏览器空闲期推进，不与 rAF 抢时间）。
  const CRYSTAL3D_BAKE_QUEUE = [];
  for (const tier of ['small', 'mid', 'big', 'giant']) {
    for (const ck of (tier === 'giant' ? ['g0', 'g1'] : ['c0', 'c1', 'c2'])) {
      for (let f = 0; f < CRYSTAL3D_FRAMES; f++) CRYSTAL3D_BAKE_QUEUE.push([tier, ck, f]);
    }
  }
  const crystal3DBakeStep = () => {
    const n = 1;
    for (let i = 0; i < n && CRYSTAL3D_BAKE_QUEUE.length; i++) {
      const [tier, ck, f] = CRYSTAL3D_BAKE_QUEUE.shift();
      try {
        bakeCrystal3DFrame(tier, ck, f);
      } catch (err) {
        console.error('[crystal3D] 预烘焙异常', tier, ck, f, err);
      }
    }
    if (CRYSTAL3D_BAKE_QUEUE.length) crystal3DBakeSchedule();
  };
  const crystal3DBakeSchedule = () => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(crystal3DBakeStep, { timeout: 500 });
    else setTimeout(crystal3DBakeStep, 16);
  };
  setTimeout(crystal3DBakeSchedule, 600);

  // 取帧：按需同步补烘缺失的单帧（单帧 ≈0.3ms 无感；异步队列只负责预取其余帧）
  function getCrystal3DSprite(tier, colorKey, phaseFrac) {
    const f = Math.floor((((phaseFrac % 1) + 1) % 1) * CRYSTAL3D_FRAMES) % CRYSTAL3D_FRAMES;
    bakeCrystal3DFrame(tier, colorKey, f);
    return crystal3DSprites.get(tier + ':' + colorKey).frames[f];
  }

  // 道具获得特效（2026-10-01 改版：击坠赞助无人机立刻生效时的获得提示，无槽位概念）。
  // 数据：07-player pushItemPickFx 推入 {x, y, glyph, rare, t, max} / updateRewardFx 逐帧推进（t 累加、y 每秒 -18 上浮）。
  // 表现：机体前方一道扩散波（easeOut 扩张圆环 + 内层白细环）+ 道具 emoji 图标，整体渐隐消失；
  // 稀有道具金色波、普通道具白色波。顶层绘制（10-draw-world render，drawGachaFx 之后）
  function drawItemPickFx() {
    for (const f of state.itemPickFx) {
      const p = clamp(f.t / f.max, 0, 1);
      const ease = 1 - Math.pow(1 - p, 3);   // easeOutCubic：初快末慢
      const col = f.rare ? '#ffd166' : '#f0f0f5';
      ctx.save();
      ctx.translate(f.x, f.y);
      // 扩散波：外环随进度扩张渐隐变细
      ctx.globalAlpha = (1 - p) * 0.8;
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 12 * (1 - p);
      ctx.lineWidth = 3 * (1 - p) + 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, 8 + ease * 38, 0, Math.PI * 2);
      ctx.stroke();
      // 内层白色细环（层次）
      ctx.globalAlpha = (1 - p) * 0.45;
      ctx.strokeStyle = '#ffffff';
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, (8 + ease * 38) * 0.86, 0, Math.PI * 2);
      ctx.stroke();
      // 道具图标 emoji：前段快速淡入、后段渐隐
      ctx.globalAlpha = Math.min(1, p / 0.1) * (1 - p * p);
      ctx.shadowColor = col;
      ctx.shadowBlur = 8;
      ctx.font = '20px "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(f.glyph, 0, 0);
      ctx.restore();
    }
  }

  export {
    drawWingmen, paintWingman, paintWingmanBulwark, paintStarslayer, paintShip, drawPlayer,
    drawStarslayerBeam, bladePath, drawSlashFx, drawHarbingerBody, drawHanshuangBody, drawAnvilBody,
    drawPopianBody, drawPopianUBody, drawFashiMatrixBody, drawFashiArrayBody, drawPulseMatrixBody, drawJiaoxiangBody, drawFashiA1Body, drawFashiA2Body, drawYu4Body,
    drawDuskStrikerBody, drawFortressStrikerBody, paintSkull, paintSnowflake, paintBaolingBomb, paintUnrealBomb, drawBaolingBody, drawBaolingGBody, drawUnrealBody, drawBaolingWarn, drawUnrealWarn, drawBaolingBombs, drawFrostZones,
    drawPopianWarn, drawPopianFx, drawSpellCubes, drawCubeHitFx, drawPlayerHitFx, paintDouzhiMark, paintDouzhiBox,
    paintMarkA, paintMarkB, paintMarkC, paintMarkD, paintMarkE, paintBoxMark1, paintBoxMark2, paintBoxMark3, paintBoxMark4, paintBoxMark5,
    drawDouzhiBody, drawDouzhiFx, drawWeilongBody, drawMissileWarns, drawMissiles, drawDagouMissiles, getCrystal3DSprite, crystal3DStarDraw,
    drawWarGhostBody, drawWarGhostWarns, drawWarGhostSlashes, paintWarGhostCandidate, drawItemPickFx,
  };