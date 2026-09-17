// 09-draw-ships：战机 / 僚机 / 各敌机形体与子弹预警的绘制
'use strict';


  // 绘制僚机（机体 + 蓝紫星焰尾；暴走时星焰增强 + 机体辉光脉动 + 翼尖微光）
  function drawWingmen() {
    if (!player.alive) return;
    const wkBerserk = player.weapon === 5;
    for (const w of wingmen) {
      ctx.save();
      ctx.translate(w.x, w.y);
      // 星焰尾：很小的蓝紫三角，多频正弦叠加飘动模拟星焰；暴走时焰体更长更亮（白紫）
      const fl = (wkBerserk ? 9 : 6) + Math.sin(w.flameT * 26) * 2.2 + Math.sin(w.flameT * 41) * 1.1;
      const fg = ctx.createLinearGradient(0, 8, 0, 8 + fl + 5);
      if (wkBerserk) {
        fg.addColorStop(0, 'rgba(238, 228, 255, 0.95)');
        fg.addColorStop(0.5, 'rgba(168, 138, 255, 0.65)');
        fg.addColorStop(1, 'rgba(118, 88, 240, 0)');
      } else {
        fg.addColorStop(0, 'rgba(190, 170, 255, 0.9)');
        fg.addColorStop(0.5, 'rgba(140, 120, 255, 0.5)');
        fg.addColorStop(1, 'rgba(110, 90, 230, 0)');
      }
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(-3, 8);
      ctx.lineTo(0, 8 + fl + 5);
      ctx.lineTo(3, 8);
      ctx.closePath();
      ctx.fill();
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


  // 战机造型（关于原点严格对称）：主绘制与选机缩略图共用，确保两处一致
  // 蓝色机身 + 底部两个稍高的粉色(#FFC0CB)尾翼三角，粉与蓝之间做渐变衔接
  // berserk=true 时机体展开变形（翼展加宽、尾翼延伸）
    // 僚机造型（随 side 镜像：尾翼只在外侧）：飞行武器/悬浮炮台——朝上双叉炮口 + 装甲弹体 + 大型后掠双尾翼 + 星核；主绘制与选僚机缩略图共用
    // berserk=true：追加外侧纵向两片透明白紫三角机翼延伸（上小下大，顶角 120°、一腰竖直）
  function paintWingman(g, side = 1, berserk = false) {
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
      const breathe = Math.sin(state.time * 6);
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

function paintShip(g, spreadT = 0) {
    const wingSpread = 1 + spreadT * 0.2;   // 暴走时翼展加宽 20%（渐进）
    const finExtend = 1 + spreadT * 0.25;   // 暴走时尾翼延伸 25%（渐进）

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
    for (const sx of [-1, 1]) {
      const finGrd = g.createLinearGradient(sx * 3, 6, sx * 11 * finExtend, 23 * finExtend);
      finGrd.addColorStop(0, '#57d4ff');      // 靠机身：蓝
      finGrd.addColorStop(0.2, '#FFC0CB');    // 更早过渡到粉色
      finGrd.addColorStop(1, '#ff8fa8');      // 尖端：深粉（更有层次）
      g.fillStyle = finGrd;
      g.strokeStyle = 'rgba(255, 192, 203, 0.5)';
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(sx * 3, 6);
      g.lineTo(sx * 11 * finExtend, 23 * finExtend);
      g.lineTo(sx * 3, 15);
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

    // 座舱：白色核心 + 微黑外圈
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

    // 暴走时大型展开翼片：从机翼外缘向外展开的三角形能量片（左右各 4 片）
    // spreadT 控制展开程度：0=完全收起，1=完全展开
    if (spreadT > 0.01) {
      const alpha = spreadT * (0.7 + Math.sin(state.time * 10) * 0.1);
      g.shadowColor = '#ff69b4';
      g.shadowBlur = 6 * spreadT;
      for (const sx of [-1, 1]) {
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

        // ===== 前翼：暴走时向前外方大幅展开，形成醒目的“机翼张开”轮廓 =====
        // fwOpen 驱动尖端从机身侧向外前方扫出（x:13→36），直观呈现“张开”动画
        const fwOpen = spreadT;
        // 主前翼片（大三角、前掠）：根部靠机身肩，尖端向外前方大幅扫出
        const fwRootFx = sx * 5, fwRootFy = -8;
        const fwTipX = sx * (13 + 23 * fwOpen);       // 尖端 x：13 → 36（大幅外展）
        const fwTipY = -6 - 10 * fwOpen;              // 尖端 y：向前（上）扫出
        const fwRootBx = sx * 15 * wingSpread, fwRootBy = 4;
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
        g.lineWidth = 1.3;
        g.beginPath();
        g.moveTo(fwRootFx, fwRootFy);
        g.lineTo(fwTipX, fwTipY);
        g.stroke();

        // 次前翼片（叠在主翼片上方、更靠前缘，增加层次与张开密度）
        const fw2TipX = sx * (10 + 16 * fwOpen);
        const fw2TipY = -11 - 8 * fwOpen;
        const fw2Grd = g.createLinearGradient(sx * 4, -10, fw2TipX, fw2TipY);
        fw2Grd.addColorStop(0, `rgba(255, 210, 235, ${(alpha * 0.75).toFixed(3)})`);
        fw2Grd.addColorStop(1, `rgba(255, 90, 165, ${(alpha * 0.6).toFixed(3)})`);
        g.fillStyle = fw2Grd;
        g.beginPath();
        g.moveTo(sx * 4, -10);
        g.lineTo(fw2TipX, fw2TipY);
        g.lineTo(sx * 11 * wingSpread, -1);
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
  }

  function drawPlayer() {
    if (!player.alive) return;
    const { x, y } = player;

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

    // 量子护盾气泡
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

    // 暴走时翼尖微光（取代原来的金色光环，避免与护盾混淆）
    if (player.weapon === 5) {
      const pulse = 0.3 + Math.sin(state.time * 14) * 0.12;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.shadowColor = '#ff69b4';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ff69b4';
      // 两侧翼尖点状光芹
      ctx.beginPath();
      ctx.arc(x - 22, y + 8, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 22, y + 8, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 受击无敌（invulnBlink）时每秒隐/显 10 次；登场/重生无敌（invulnBlink=false）不闪动
    const blink = player.invuln > 0 && player.invulnBlink && player.weapon !== 5 && Math.floor(player.invuln * 20) % 2 === 0;
    if (blink) return;

    ctx.save();
    ctx.translate(x, y);

    // 尾焰：粉(#FFC0CB) → 橙渐变（对称，动画）
    const flame = 9 + Math.sin(state.time * 30) * 3;
    const grd = ctx.createLinearGradient(0, 14, 0, 14 + flame + 12);
    grd.addColorStop(0, 'rgba(255, 192, 203, 0.95)');
    grd.addColorStop(0.5, 'rgba(255, 150, 190, 0.6)');
    grd.addColorStop(1, 'rgba(255, 90, 40, 0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(-5, 14);
    ctx.lineTo(0, 14 + flame + 12);
    ctx.lineTo(5, 14);
    ctx.closePath();
    ctx.fill();

    // 机身（与选机缩略图共用同一造型，传入展开进度 0~1）
    const spreadPulse = player.wingSpread > 0.9
      ? 1 + Math.sin(state.time * 10) * 0.02 : 1;   // 完全展开后微微脉动
    ctx.scale(spreadPulse, spreadPulse);
    paintShip(ctx, player.wingSpread);

    ctx.restore();

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

    // “暴走”字样已移至 render() 顶层绘制（位于所有游戏实体之上，不被子弹/敌机遮挡）
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
      // 白色雾气：数团柔和白雾在环内缓慢绕行（漂移 + 呼吸）
      for (let k = 0; k < 5; k++) {
        const ma = k * TAU / 5 + state.time * 0.5;
        const mr = ar * (0.46 + 0.10 * Math.sin(state.time * 0.9 + k * 1.7));
        const mx = Math.cos(ma) * mr, my = Math.sin(ma) * mr;
        const mrad = ar * 0.24;
        const mist = ctx.createRadialGradient(mx, my, 0, mx, my, mrad);
        mist.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
        mist.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = mist;
        ctx.beginPath(); ctx.arc(mx, my, mrad, 0, TAU); ctx.fill();
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

  // 下落导弹：宽于常规子弹，尖头朝下 + 向上尾焰
  function drawMissiles() {
    for (const m of missiles) {
      ctx.save();
      ctx.translate(m.x, m.y);
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
