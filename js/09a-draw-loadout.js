// 09a-draw-loadout.js：玩家 / 僚机 / 装甲形体与玩家武器·拾取特效绘制（《并行开发改造设计.md》批次 2b 自 09-draw-ships.js 拆出）

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：10-draw-world(9 名) 12-ui(3 名) 13-encyclopedia(3 名)
  // 渲染层只读：只进 01x 配置域 / 02-core / 09x 兄弟文件；09x 之间禁止互相 import

  import { armorGlyphFx, bossFlow, clamp, ctx, dagouMissiles, frostZones, missileWarns, missiles, player, playerHitFx, state, wingmen } from './02-core.js';
  import { CANVAS_H, CANVAS_W, DEMO_TOP } from './01-config-core.js';
  import { BULWARK, PILOTS, STARSLAYER, currentArmor, currentPlane, currentWingman } from './01-config-loadout.js';




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

  // 装甲触发图标演出（祈星✧ / 澄月◉ 共用）：字符图标快速渐显 → 明显放大 → 渐隐（0.8s）；祈星/澄月位于机头上方（dy=-38），天枢位于核心。
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
      // hex（天枢圣卫）对准战机视觉核心（coreY 逐机型定义：混乱将至 -7 / 群星之杀 -14），其余装甲对准判定点；
      // dy 为可选纵向偏移（澄月 ◉ -38 → 图标悬于机头上方，同测试2 卡3/卡4 布局）
      ctx.translate(x, y + (f.hex ? (currentPlane.coreY || 0) : 4) + (f.dy || 0));
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

  // 叮咚鸡导弹雨：炮火先兆者同款导弹的自下而上版——弹头朝上 + 向下尾焰 + 高速光带拖尾，
  // 配色换为白蓝渐变（外带天蓝辉光 + 白热内芯，贴弹体尾焰与喷流同为白蓝系）；
  // m.berserk（副武器捣蛋来袭暴走 Lv5）换金红渐变涂装（仅视觉，数值与规则不变）
  function drawDagouMissiles() {
    for (const m of dagouMissiles) {
      if (m.delay > 0) continue;   // 未发射（错峰待发）不绘制
      const gold = m.berserk;
      ctx.save();
      ctx.translate(m.x, m.y);
      if (m.rot) ctx.rotate(m.rot);   // 捣蛋来袭（副武器直射弹）：按弹道方向倾斜（0 = 竖直向上的叮咚鸡导弹雨）
      if (m.dieT != null) ctx.globalAlpha = clamp(m.dieT / 0.3, 0, 1);   // 警报 / BOSS 登场：快速消散渐隐
      // BOSS 战期间叮咚鸡召唤的导弹整体半透明（0.7）：与消散渐隐相乘，避免覆盖 dieT 动画；
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
    drawWingmen, paintWingman, paintWingmanBulwark, paintStarslayer,
    paintShip, drawPlayer, drawStarslayerBeam, drawFrostZones,
    drawPlayerHitFx, drawMissileWarns, drawMissiles, drawDagouMissiles,
    drawItemPickFx,
  };
