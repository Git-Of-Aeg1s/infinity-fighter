// 09-draw-ships：战机 / 僚机 / 各敌机形体与子弹预警的绘制

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：10-draw-world(24 名) 12-ui(3 名) 13-encyclopedia(3 名)
  //
  import { ANVIL, BAOLING, BULWARK, CANVAS_H, CANVAS_W, DEMO_TOP, DOUZHI, DUSK, ENEMY_TYPES, FASHI_ARRAY, FASHI_MATRIX, HANSHUANG, HARBINGER, JIAOXIANG, PILOTS, POPIAN, STARSLAYER, YU4, currentPlane, currentWingman } from './01-config.js';
  import { armorGlyphFx, blBombs, clamp, ctx, cubeHitFx, dagouMissiles, douzhiFx, enemies, missileWarns, missiles, player, playerHitFx, popianMissiles, slashFx, spellCubes, state, wingmen } from './02-core.js';



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
      const fg = ctx.createLinearGradient(0, 8, 0, 8 + fl + (isBulwark && wkBerserk ? 8 : 5));
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
      ctx.moveTo(flameX - fw, 8);
      ctx.lineTo(flameX, 8 + fl + (isBulwark && wkBerserk ? 8 : 5));
      ctx.lineTo(flameX + fw, 8);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      if (isBulwark && wkBerserk) {
        // 过载白芯：焰体中央白热内焰（呼应弹体加焰的暴走输出状态）
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.beginPath();
        ctx.moveTo(flameX - 2, 8);
        ctx.lineTo(flameX, 8 + fl * 0.66);
        ctx.lineTo(flameX + 2, 8);
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

    // 铆钉：沿弧线内外两排小圆点
    g.fillStyle = 'rgba(160, 210, 245, 0.5)';
    const boltCount = segs * 2;
    for (let k = 0; k <= boltCount; k++) {
      const th = BULWARK.arcFrom + (BULWARK.arcTo - BULWARK.arcFrom) * (k / boltCount);
      const ang = up + side * (th * Math.PI / 180);
      const cx = Math.cos(ang), cy = Math.sin(ang);
      // 外排铆钉
      g.beginPath(); g.arc(cx * (R - 3.5), cy * (R - 3.5), 0.9, 0, Math.PI * 2); g.fill();
      // 内排铆钉
      g.beginPath(); g.arc(cx * (Ri + 3), cy * (Ri + 3), 0.7, 0, Math.PI * 2); g.fill();
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

    // ★ 本体六边形蜂巢流动特效
    g.save();
    hexPath(); g.clip();
    const cellR = 2.4;
    const cellH = cellR * Math.sqrt(3);
    const waveSpeed = 28;
    const waveLen = 18;
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

    // 装甲面板缝（2条横线，体现拼装结构；深蓝色——很深的藏蓝，避免读作黑色）
    g.strokeStyle = 'rgba(16, 48, 140, 0.8)';
    g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(-8, -3); g.lineTo(8, -3); g.stroke();
    g.beginPath(); g.moveTo(-8, 4); g.lineTo(8, 4); g.stroke();

    // 反应堆核心辉光（中央冷蓝光；暴走过载：白热扩大 + 高频闪烁）
    const rcR = berserk ? 7.5 + Math.sin(T * 21) * 1.2 : 5.5;
    const rc = g.createRadialGradient(0, 0, 0.8, 0, 0, rcR);
    rc.addColorStop(0, `rgba(220, 245, 255, ${(0.8 + flash * 0.2).toFixed(2)})`);   // 暴走仅核心变大闪烁，颜色不变（六边形内部不发金）
    rc.addColorStop(0.4, 'rgba(100, 180, 250, 0.4)');
    rc.addColorStop(1, 'rgba(30, 80, 160, 0)');
    g.fillStyle = rc;
    g.beginPath(); g.arc(0, 0, rcR, 0, Math.PI * 2); g.fill();

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
      // 白热外缘折线（锋利感）
      g.strokeStyle = `rgba(255,252,232,${(0.45 + 0.45 * sp).toFixed(3)})`;
      g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(P[0][0], P[0][1]);
      g.lineTo(P[1][0], P[1][1]); g.lineTo(P[2][0], P[2][1]); g.lineTo(P[3][0], P[3][1]); g.lineTo(P[4][0], P[4][1]);
      g.stroke();
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

    // 尾焰：自短颈向下（双腿之间），长度随时间闪动
    const flameLen = ((10 + Math.sin(T * 13) * 3 + sp * 3) * 2 + e * 10) * 1.4;   // 常态翻倍；暴走更长、闪动放慢
    const fg = g.createLinearGradient(0, 15, 0, 15 + flameLen);
    fg.addColorStop(0, 'rgba(255,232,170,0.98)');   // 金白根
    fg.addColorStop(0.42, 'rgba(150,132,255,0.85)');   // 蓝紫
    fg.addColorStop(1, 'rgba(78,62,236,0)');   // 深蓝紫尾
    g.fillStyle = fg;
    g.beginPath();
    g.moveTo(-3.2, 15);
    g.quadraticCurveTo(-1, 15 + flameLen * 0.6, 0, 15 + flameLen);
    g.quadraticCurveTo(1, 15 + flameLen * 0.6, 1.8, 15);
    g.closePath(); g.fill();
    const eg = g.createRadialGradient(0, 10, 0.4, 0, 10, 7);
    eg.addColorStop(0, `rgba(216,200,255,${((0.6 + e * 0.25) + 0.15 * Math.sin(T * 14)).toFixed(3)})`);
    eg.addColorStop(1, 'rgba(78,62,236,0)');
    g.fillStyle = eg;
    g.beginPath(); g.arc(0, 10, 7, 0, Math.PI * 2); g.fill();

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

  function paintShip(g, spreadT = 0, plane = currentPlane, berserkT = 0, still = false) {
    if (plane && plane.id === 'starslayer') { paintStarslayer(g, spreadT, plane, berserkT, still); return; }
    const DS = (plane && plane.drawScale) || 1;   // 机体整体绘制缩放（混乱将至 ×1.15；座舱核心逆向补偿保持原尺寸）
    g.save();
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

    // 座舱：白色核心 + 微黑外圈（核心不随机体放大：逆向缩放补偿，保持原尺寸与原位置）
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

    // 翼尖航行灯（左右各一个小亮点，红/绿）
    g.shadowBlur = 4;
    g.shadowColor = '#ff4444';
    g.fillStyle = '#ff6666';
    g.beginPath();
    g.arc(-21 * wingSpread, 10, 1.3, 0, Math.PI * 2);
    g.fill();
    g.shadowColor = '#44ff44';
    g.fillStyle = '#66ff66';
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

  // 装甲触发图标演出（祈星✧ / 澄月☾ 共用）：核心处字符图标快速渐显 → 明显放大 → 渐隐（0.8s）。
  // 逐帧在机体当前位置绘制（跟核心移动）；受击闪动帧也会调用（祈星在受击时触发，不能被闪烁吞没）。
  // 触发瞬间伴随震屏与受击白闪，故本演出刻意做大做强（30px 字符 + 大光晕 + 扩散环）保证可感知
  function drawArmorGlyphFx(x, y) {
    for (const f of armorGlyphFx) {
      const p = f.t / f.dur;                        // 0→1
      const envIn = clamp(p / 0.2, 0, 1);           // 前 20% 渐显
      const envOut = clamp((1 - p) / 0.55, 0, 1);   // 后 55% 渐隐
      const sc = 0.8 + p * 0.55;                    // 明显放大（0.8 → 1.35）
      const a = 0.9 * envIn * envOut;
      ctx.save();
      ctx.translate(x, y + 4);
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
      // 字符图标本体
      ctx.globalAlpha = a;
      ctx.font = '30px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 14;
      ctx.fillText(f.glyph, 0, 0);
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

    // 尾焰：粉(#FFC0CB) → 橙渐变（对称，动画）；群星之杀改为蓝→紫能量尾焰
    // 混乱将至机体放大（drawScale）：尾焰随同缩放保持贴住机尾
    const flame = 9 + Math.sin(state.time * 30) * 3;
    const pds = currentPlane.drawScale || 1;
    ctx.save();
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
    ctx.moveTo(-5, 14);
    ctx.lineTo(0, 14 + flame + 12);
    ctx.lineTo(5, 14);
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

    // 装甲触发图标演出（祈星✧ / 澄月☾）：以核心为中心渐显 → 微微放大 → 渐隐。
    // 逐帧在机体当前位置绘制（跟核心移动，不会留在原地）；图层位于核心白点之下、不盖住核心
    drawArmorGlyphFx(x, y);

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
    // 免死无敌不闪动机体，本菱形即无敌指示——结束时 0.3s 内迅速淡去
    if (player.bulwarkFxT > 0) {
      const a = clamp(player.bulwarkFxT / 0.3, 0, 1);
      const ph = clamp(0.5 + 0.5 * Math.sin(state.time * 2.2), 0, 1);   // 白色高光位置往复滑动（流动感）
      const grad = ctx.createLinearGradient(x, y - 46, x, y + 46);
      grad.addColorStop(0, '#ffb545');
      grad.addColorStop(ph, '#ffffff');
      grad.addColorStop(1, '#ffd98a');
      ctx.save();
      ctx.globalAlpha = a * (0.85 + Math.sin(state.time * 5) * 0.1);
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

  // 白色骷髅图标：头骨 + 下颚 + 双眼窝 + 鼻腔（hr 为头骨半径）
  function paintSkull(cx, cy, hr) {
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

  // 暴鸰：白灰色磨角方形自爆无人机（较威龙小 20%）——灰黑渐变横杠连接四角风扇（淡黄桨心、外环灰白渐变越靠边越白），
  // 中央灰黑渐变（较御4 更黑），前方搭载黑色圆炸弹（红道 + 白骷髅）
  function drawBaolingBody(e) {
    const TAU = Math.PI * 2;
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

    // ---- 四角风扇圆：淡黄桨心 + 灰白渐变外环（越往边上越白）----
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const cx0 = sx * FX, cy0 = sy * FY;
        const fg = ctx.createRadialGradient(cx0, cy0, 0, cx0, cy0, FR);
        fg.addColorStop(0, '#f6ecb4');    // 淡黄色桨心（占比加大，明确盖住横杠端点）
        fg.addColorStop(0.34, '#f2e7ac'); // 淡黄核心保持到约 1/3 半径
        fg.addColorStop(0.62, '#a8b0bb'); // 中段灰
        fg.addColorStop(1, '#f4f7fb');    // 外环灰白渐变：越靠边缘越白
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(cx0, cy0, FR, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(20, 22, 26, 0.55)';
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

    // ---- 中心偏上的白色骷髅标识（自爆警示，较炸弹上的更大）----
    paintSkull(0, -4, 3.4);

    // ---- 前方搭载的炸弹头（黑色圆形：红道 + 白骷髅）----
    // 投掷后本体不再绘制炸弹 —— 炸弹已分离为 blBombs 独立实体，绘制在暴鸰图层之上
    if (!e.blThrown) paintBaolingBomb(0, 17, 7, pulse);
  }

  // 暴鸰红色预警圈（爆炸半径）：红色脉动填充 + 外环 + 内缩瞄准虚环（intensity 0~1 越高越急迫）
  function drawBaolingWarn(tx, ty, intensity) {
    const TAU = Math.PI * 2;
    const R = BAOLING.blastR;
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

  // 暴鸰炸弹与预警区：停车锁定阶段（预警挂机身）+ 已投出的炸弹（低速下坠 / 极速冲刺）
  function drawBaolingBombs() {
    for (const e of enemies) {
      if (e.type !== 'baoling' || e.blPhase !== 1 || !e.blWarn) continue;
      drawBaolingWarn(e.blWarn.tx, e.blWarn.ty, e.blWarn.t / BAOLING.warnTime * 0.35);
    }
    for (const b of blBombs) {
      const intensity = b.phase === 'drop'
        ? 0.35 + Math.min(1, b.t / BAOLING.dropTime) * 0.3
        : 0.65 + Math.min(1, (b.spd - BAOLING.dropSpeed) / 900) * 0.35;
      drawBaolingWarn(b.tx, b.ty, intensity);
      ctx.save();
      ctx.translate(b.x, b.y);
      paintBaolingBomb(0, 0, 7, 1);
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

  // 破片特效：红圈预警（遍历 popian 敌人的 e.warn）+ 三连发导弹（弹头朝飞行方向、尾焰拖尾）
  function drawPopianFx() {
    for (const e of enemies) {
      if (e.type !== 'popian' || !e.warn) continue;
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

  // 法术矩阵发光正方体：柜式立体投影，本体按发射方向旋转（最前面的边垂直于发射方向）；挤出侧随水平运动方向(ux)，左发射见左面 / 右发射见右面；
  // 顶面最亮、侧面较暗、正面通体白 + 内部淡淡红光（柔和径向、无硬边界），最外缘轮廓向外散发红光；
  // 拖尾沿运动反方向从立方体质心发出（与主体对齐）；发射后 0.5s 内从 50% 成长到最大；随 glow 黯淡、随 alpha 渐隐
  function drawSpellCubes() {
    const path = (pts) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
    };
    for (const c of spellCubes) {
      const g = c.glow;                            // 黯淡程度（1 → glowFloor）
      const gg = c.big ? Math.min(1, g * FASHI_ARRAY.glowMul) : g;   // 法术阵列大正方体：红光更明显
      const s = (c.big ? FASHI_ARRAY.cubeHalf : FASHI_MATRIX.cubeHalf) * c.scale;   // 正面半边长（随生长缩放）
      const sx = c.ux >= 0 ? 1 : -1;               // 挤出侧 = 水平运动方向（左发射见左面 / 右发射见右面）
      const dx = s * 0.5 * sx;                     // 立体厚度水平分量
      const dy = -s * 0.38;                        // 立体厚度垂直分量（向上 → 顶面恒可见）
      // 本体按发射方向旋转：局部 +y（底边法向）对准速度方向 u → 最前面的那条边（底边）垂直于发射方向
      const alpha = Math.atan2(-c.ux, c.uy);
      const ca = Math.cos(alpha), sa = Math.sin(alpha);
      // 立方体几何质心（局部 (dx/2,dy/2) 经旋转映射到世界坐标）——拖尾起点，与旋转后主体对齐
      const ccx = c.x + (dx * 0.5) * ca - (dy * 0.5) * sa;
      const ccy = c.y + (dx * 0.5) * sa + (dy * 0.5) * ca;

      // ---- 光效拖尾（光带而非粒子）：沿运动反方向从质心发出，白热内芯 + 红光外带（带红色外发光）；仅飞行/减速阶段 ----
      //   减速段尾焰长度与当前速度挂钩（速度比 = spd/cruise 随减速指数下降 → 开始减速时尾焰迅速变短）
      if (c.alpha > 0.02) {
        // 尾焰长度系数：减速段随速度收短
        const spdMul = c.phase === 'brake' ? Math.max(0, c.spd / c.cruise) : 1;
        const tl = FASHI_MATRIX.cubeTrailLen * c.scale * spdMul;
        const tx = ccx - c.ux * tl, ty = ccy - c.uy * tl;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        // 红光外带（较宽 + 红色外发光）
        const rt = ctx.createLinearGradient(ccx, ccy, tx, ty);
        rt.addColorStop(0, `rgba(255, 70, 88, ${(0.55 * gg * c.alpha).toFixed(3)})`);
        rt.addColorStop(0.45, `rgba(255, 45, 65, ${(0.3 * gg * c.alpha).toFixed(3)})`);
        rt.addColorStop(1, 'rgba(255, 40, 60, 0)');
        ctx.strokeStyle = rt;
        ctx.lineWidth = s * 2.6;
        ctx.shadowColor = `rgba(255, 45, 62, ${(0.7 * gg * c.alpha).toFixed(3)})`;
        ctx.shadowBlur = 16 * g;
        ctx.beginPath(); ctx.moveTo(ccx, ccy); ctx.lineTo(tx, ty); ctx.stroke();
        // 白热内芯
        ctx.shadowBlur = 0;
        const tg = ctx.createLinearGradient(ccx, ccy, tx, ty);
        tg.addColorStop(0, `rgba(255, 252, 252, ${(0.85 * gg * c.alpha).toFixed(3)})`);
        tg.addColorStop(0.35, `rgba(255, 234, 236, ${(0.45 * gg * c.alpha).toFixed(3)})`);
        tg.addColorStop(1, 'rgba(255, 220, 226, 0)');
        ctx.strokeStyle = tg;
        ctx.lineWidth = s * 1.2;
        ctx.beginPath(); ctx.moveTo(ccx, ccy); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.restore();
      }

      // ---- 立方体本体（8 角柜式投影；前面 x∈[-s,s] y∈[-s,s]，后面 = 前面 +(dx,dy)）----
      const hx = sx * s, ox = -sx * s;   // 挤出侧 / 对侧的前面 x
      const hex = [ [ox, s], [hx, s], [hx + dx, s + dy], [hx + dx, -s + dy], [ox + dx, -s + dy], [ox, -s] ];   // 外轮廓剪影
      const topFace = [ [-s, -s], [s, -s], [s + dx, -s + dy], [-s + dx, -s + dy] ];                            // 顶面（恒可见）
      const sideFace = [ [hx, -s], [hx + dx, -s + dy], [hx + dx, s + dy], [hx, s] ];                           // 侧面（左/右随 sx）

      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(alpha);   // 旋转本体：使最前面的边垂直于发射方向（局部下边对准 u）
      ctx.globalAlpha = c.alpha;

      // 1) 剪影底：白色填充 + 强红外发光（范围更大）→ 最外缘的边向外散发红光（红光只在最外轮廓，不在内部）
      ctx.shadowColor = `rgba(255, 40, 58, ${(0.95 * gg).toFixed(3)})`;
      ctx.shadowBlur = 30 * gg;
      ctx.fillStyle = `rgba(255, 250, 250, ${(0.96 * gg).toFixed(3)})`;
      path(hex); ctx.fill();
      ctx.shadowBlur = 0;

      // 2) 顶面（最亮，接受上方光）
      ctx.fillStyle = `rgba(255, 255, 255, ${(0.99 * gg).toFixed(3)})`;
      path(topFace); ctx.fill();

      // 3) 侧面（较暗 → 与正面明暗对比产生立体感；随 sx 显示左面或右面）
      ctx.fillStyle = `rgba(228, 210, 218, ${(0.93 * gg).toFixed(3)})`;
      path(sideFace); ctx.fill();

      // 4) 正面：通体白 + 内部淡淡红光（柔和径向、从中心淡出、无硬边界）
      ctx.fillStyle = `rgba(255, 255, 255, ${(0.97 * gg).toFixed(3)})`;
      ctx.fillRect(-s, -s, s * 2, s * 2);
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 1.3);
      rg.addColorStop(0, `rgba(255, 92, 106, ${(0.26 * gg).toFixed(3)})`);
      rg.addColorStop(0.55, `rgba(255, 118, 130, ${(0.14 * gg).toFixed(3)})`);
      rg.addColorStop(1, `rgba(255, 140, 150, ${(0.05 * gg).toFixed(3)})`);
      ctx.fillStyle = rg;
      ctx.fillRect(-s, -s, s * 2, s * 2);

      // 5) 最外缘轮廓：红描边 + 强外发光（更明显、范围更大；仅描剪影、不描内部面界，强化边向外散发红光）
      ctx.strokeStyle = `rgba(255, 68, 84, ${(0.72 * gg).toFixed(3)})`;
      ctx.lineWidth = 1.8;
      ctx.shadowColor = `rgba(255, 40, 58, ${(0.95 * gg).toFixed(3)})`;
      ctx.shadowBlur = 22 * gg;
      path(hex); ctx.stroke();

      ctx.restore();

      // 法术阵列大正方体：分裂预警——红色收缩圈（0.5s 内从外向内收拢，越收越亮越粗）
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
  function paintDouzhiBox(cx, cy) {
    const hw = 10.5, hh = 8.6, r = 2.6;
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
    ctx.fillStyle = '#0a1830'; rr(cx - hw, cy - hh + 1.5, hw * 2, hh * 2, r); ctx.fill();
    // 蓝色渐变盒体
    const bg = ctx.createLinearGradient(cx - hw, cy - hh, cx + hw, cy + hh);
    bg.addColorStop(0, '#5aa8ff'); bg.addColorStop(0.5, '#2b6fd6'); bg.addColorStop(1, '#16386f');
    ctx.fillStyle = bg; rr(cx - hw, cy - hh, hw * 2, hh * 2, r); ctx.fill();
    // 顶部高光线
    ctx.strokeStyle = 'rgba(185, 222, 255, 0.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - hw + r, cy - hh + 0.9); ctx.lineTo(cx + hw - r, cy - hh + 0.9); ctx.stroke();
    // 黑描边
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'; ctx.lineWidth = 1; rr(cx - hw, cy - hh, hw * 2, hh * 2, r); ctx.stroke();
    // 盒子正中的淡黄色空心正方形图案
    const sq = 4.5;
    ctx.strokeStyle = '#f6ecb4'; ctx.lineWidth = 1.6;
    ctx.strokeRect(cx - sq, cy - sq, sq * 2, sq * 2);
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

    // ---- 四角风扇圆：淡黄桨心 + 灰白渐变外环，同暴鸰 ----
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const cx0 = sx * FX, cy0 = sy * FY;
        const fg = ctx.createRadialGradient(cx0, cy0, 0, cx0, cy0, FR);
        fg.addColorStop(0, '#f6ecb4');
        fg.addColorStop(0.34, '#f2e7ac');
        fg.addColorStop(0.62, '#a8b0bb');
        fg.addColorStop(1, '#f4f7fb');
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

    // ---- 中心标志：上扬双箭头（非骷髅）----
    paintDouzhiMark(0, -3.5, 4.6, pulse);

    // ---- 下方挂载：较大蓝色盒子（死亡演出中本体不画，蓝盒已脱离为独立 FX）----
    if (!opts.noBox) paintDouzhiBox(0, 18.5);
  }

  // 斗志昂扬死亡演出：脱离并迅速渐隐的蓝盒 → 淡黄色扩大光环 → 快速渐隐的本体
  function drawDouzhiFx() {
    const ds = ENEMY_TYPES.douzhi.drawScale;
    for (const f of douzhiFx) {
      const ht = f.t - DOUZHI.boxFade;
      // 掉落盒子的世界中心（光环以此为中心）
      const bcx = f.x, bcy = f.y + f.boxDy + 18.5 * ds;
      // 淡黄色扩大光环（蓝盒渐隐结束后触发，以掉落的盒子为中心）
      if (ht >= 0) {
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
        drawDouzhiBody({ wobble: f.wobble }, { noBox: true });
        ctx.restore();
      }
      // 脱离并迅速渐隐的蓝盒（向下漂离）
      if (f.boxAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = f.boxAlpha;
        ctx.translate(f.x, f.y + f.boxDy); ctx.scale(ds, ds);
        paintDouzhiBox(0, 18.5);
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

    // ---- 炮管（先画、垫于机身之下；粗壮 + 加强环 + 制退器；指向玩家，预览时朝正下）----
    const aim = e.waypoints ? Math.atan2(player.y - e.y, player.x - e.x) : Math.PI / 2;
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
      ctx.fillStyle = '#ff4d2b';
      ctx.shadowColor = '#ff4d2b';
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
  // 配色换为白蓝渐变（外带天蓝辉光 + 白热内芯，贴弹体尾焰与喷流同为白蓝系）
  function drawDagouMissiles() {
    for (const m of dagouMissiles) {
      if (m.delay > 0) continue;   // 未发射（错峰待发）不绘制
      ctx.save();
      ctx.translate(m.x, m.y);
      // ---- 光带拖尾：沿运动反方向（竖直向下）的光带，长度/亮度随时间闪动、轴线轻微摆动 ----
      const flick = 0.82 + 0.18 * Math.sin(state.time * 21 + m.x * 0.7);
      const tl = m.r * 11 * flick;
      const sway = Math.sin(state.time * 13 + m.x * 0.9) * 4;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      // 天蓝外带（根部最亮，向外渐隐）
      const og = ctx.createLinearGradient(0, m.r, 0, m.r + tl);
      og.addColorStop(0, 'rgba(140,200,255,0.55)');
      og.addColorStop(0.45, 'rgba(90,150,255,0.28)');
      og.addColorStop(1, 'rgba(70,120,255,0)');
      ctx.strokeStyle = og;
      ctx.lineWidth = m.r * 2.4;
      ctx.shadowColor = 'rgba(100,170,255,0.8)';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(0, m.r);
      ctx.quadraticCurveTo(sway * 0.5, m.r + tl * 0.55, sway, m.r + tl);
      ctx.stroke();
      // 白热内芯
      ctx.shadowBlur = 0;
      const cg = ctx.createLinearGradient(0, m.r, 0, m.r + tl * 0.8);
      cg.addColorStop(0, 'rgba(235,248,255,0.9)');
      cg.addColorStop(0.4, 'rgba(170,215,255,0.5)');
      cg.addColorStop(1, 'rgba(140,190,255,0)');
      ctx.strokeStyle = cg;
      ctx.lineWidth = m.r * 0.9;
      ctx.beginPath();
      ctx.moveTo(0, m.r);
      ctx.quadraticCurveTo(sway * 0.5, m.r + tl * 0.55, sway, m.r + tl * 0.8);
      ctx.stroke();
      // 下行喷流亮段：虚线沿拖尾向外流动（能量自弹体向后喷出）
      ctx.strokeStyle = `rgba(190,225,255,${(0.5 * flick).toFixed(3)})`;
      ctx.lineWidth = m.r * 0.55;
      ctx.setLineDash([7, 13]);
      ctx.lineDashOffset = -state.time * 300;
      ctx.beginPath();
      ctx.moveTo(0, m.r * 1.2);
      ctx.quadraticCurveTo(sway * 0.5, m.r + tl * 0.55, sway, m.r + tl);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'source-over';
      // ---- 贴弹体尾焰（白蓝渐变）----
      const tg = ctx.createLinearGradient(0, m.r * 4.5, 0, 0);
      tg.addColorStop(0, 'rgba(120,180,255,0)');
      tg.addColorStop(1, 'rgba(200,235,255,0.85)');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.moveTo(-m.r * 0.6, 0);
      ctx.lineTo(m.r * 0.6, 0);
      ctx.lineTo(m.r * 0.3, m.r * 4.5);
      ctx.lineTo(-m.r * 0.3, m.r * 4.5);
      ctx.closePath();
      ctx.fill();
      // 弹体：白蓝渐变尖头朝上（与先兆者导弹同轮廓）
      const bg = ctx.createLinearGradient(0, -m.r * 1.7, 0, m.r);
      bg.addColorStop(0, '#ffffff');
      bg.addColorStop(0.5, '#bfe0ff');
      bg.addColorStop(1, '#5b9cf0');
      ctx.fillStyle = bg;
      ctx.shadowColor = '#7fb8ff';
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

  export {
    drawWingmen, paintWingman, paintWingmanBulwark, paintStarslayer, paintShip, drawPlayer,
    drawStarslayerBeam, bladePath, drawSlashFx, drawHarbingerBody, drawHanshuangBody, drawAnvilBody,
    drawPopianBody, drawFashiMatrixBody, drawFashiArrayBody, drawJiaoxiangBody, drawFashiA1Body, drawFashiA2Body, drawYu4Body,
    drawDuskStrikerBody, paintSkull, paintBaolingBomb, drawBaolingBody, drawBaolingWarn, drawBaolingBombs,
    drawPopianWarn, drawPopianFx, drawSpellCubes, drawCubeHitFx, drawPlayerHitFx, paintDouzhiMark, paintDouzhiBox,
    drawDouzhiBody, drawDouzhiFx, drawWeilongBody, drawMissileWarns, drawMissiles, drawDagouMissiles,
  };