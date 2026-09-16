// 11-draw-boss：双 BOSS 视觉（暴风之眼区域标记/涡流/风暴/血条 + 旧日之歌黑洞/组装/血条）+ 警报演出 + 大型龙卷绘制
'use strict';

    // ---------- 暴风之眼：绘制（区域标记 / 风流 / 风柱 / 风暴本体 / 大型龙卷） ----------
    function drawZoneMarks() {
      // 白色区域标记：风流（曲线带）/ 风柱（垂直带），倒计时闪烁 + 白色风流特效
      // 等宽风带路径：沿曲线 [p0, p1] 采样，全程同宽、两端平切（无圆头、不收窄）
      const spindle = (f, p0, p1, R) => {
        const N = 26;
        const pts = [];
        for (let k = 0; k <= N; k++) pts.push(stormFlowPoint(f, p0 + (p1 - p0) * (k / N)));
        const hw = () => R;   // 等宽：全程同宽
        const nrm = (k) => {
          const a = pts[Math.max(0, k - 1)], b = pts[Math.min(N, k + 1)];
          const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
          return [-dy / L, dx / L];
        };
        ctx.beginPath();
        for (let k = 0; k <= N; k++) {          // 上缘：尾→头
          const [nx, ny] = nrm(k), h = hw(k);
          k === 0 ? ctx.moveTo(pts[k].x + nx * h, pts[k].y + ny * h) : ctx.lineTo(pts[k].x + nx * h, pts[k].y + ny * h);
        }
        for (let k = N; k >= 0; k--) {          // 下缘反向回描
          const [nx, ny] = nrm(k), h = hw(k);
          ctx.lineTo(pts[k].x - nx * h, pts[k].y - ny * h);
        }
        ctx.closePath();
      };
      for (const z of zoneMarks) {
        const prog = clamp(z.t / z.dur, 0, 1);
        const pulse = clamp(0.5 + Math.sin(state.time * 14) * 0.22 + prog * 0.35, 0, 0.92);   // 越接近落下越亮
        ctx.save();
        ctx.globalAlpha = pulse;
        if (z.kind === 'flow') {
          // 风流标记：整条纺锤形风带预览（两端收尖、无圆头）+ 流动的白色风流短线
          ctx.fillStyle = 'rgba(255, 255, 255, 0.30)';
          spindle(z, 0, 1, STORM.flowR);
          ctx.fill();
          // 流动风纹：沿曲线滑动的细短线
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.lineWidth = 2;
          for (let s = 0; s < 5; s++) {
            const base = (state.time * 0.9 + s * 0.23) % 1;
            ctx.beginPath();
            for (let k = 0; k <= 6; k++) {
              const p = clamp(base + k * 0.015, 0, 1);
              const pt = stormFlowPoint(z, p);
              k === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
          }
        } else {
          // 风柱标记：自天而降的风柱预兆——柔和风带 + 顶部蓄能光楔（随倒计时下压） +
          // 弯曲上升风痕（越近落下越快越亮）+ 落点地面渐亮，充满“风正在聚集”的动势
          const w = STORM.pillarW;
          const cxp = z.x;
          // ① 柔和风带：中心亮两侧渐隐（整体亮度提高，醒目预警）
          const band = ctx.createLinearGradient(cxp - w / 2, 0, cxp + w / 2, 0);
          band.addColorStop(0, 'rgba(223, 243, 255, 0)');
          band.addColorStop(0.5, `rgba(223, 243, 255, ${(0.22 + prog * 0.24).toFixed(3)})`);
          band.addColorStop(1, 'rgba(223, 243, 255, 0)');
          ctx.fillStyle = band;
          ctx.fillRect(cxp - w / 2, 0, w, CANVAS_H);
          // ② 顶部蓄能光楔：亮区自天顶向下压，随倒计时推进越来越低（预示风柱自上而降）
          const wedgeH = CANVAS_H * (0.10 + prog * 0.32);
          const wedge = ctx.createLinearGradient(0, 0, 0, wedgeH);
          wedge.addColorStop(0, `rgba(240, 251, 255, ${(0.62 + prog * 0.33).toFixed(3)})`);
          wedge.addColorStop(1, 'rgba(240, 251, 255, 0)');
          ctx.fillStyle = wedge;
          ctx.fillRect(cxp - w / 2, 0, w, wedgeH);
          // ③ 弯曲上升风痕：6 道带渐隐尾的弧线自下而上涌动，速度随倒计时加快
          ctx.lineCap = 'round';
          ctx.lineWidth = 1.6;
          const span = CANVAS_H + 90;
          for (let s = 0; s < 6; s++) {
            const spd = 150 + prog * 300;
            const head = (state.time * spd + s * (span / 6)) % span;
            const hy = CANVAS_H + 45 - head;
            const a = (0.42 + prog * 0.55) * clamp(head / 60, 0, 1) * clamp((span - head) / 90, 0, 1);
            if (a <= 0.02) continue;
            const bx = cxp + Math.sin(s * 2.7) * w * 0.30;
            const yg = ctx.createLinearGradient(0, hy, 0, hy + 56);
            yg.addColorStop(0, `rgba(255, 255, 255, ${a.toFixed(3)})`);
            yg.addColorStop(1, 'rgba(223, 243, 255, 0)');
            ctx.strokeStyle = yg;
            ctx.beginPath();
            ctx.moveTo(bx + 5, hy + 56);
            ctx.quadraticCurveTo(bx - 6, hy + 26, bx + 4, hy);
            ctx.stroke();
          }
          // ④ 落点蓄光：地面处光斑随倒计时渐亮（打击即将到来）
          const gl = ctx.createRadialGradient(cxp, CANVAS_H, 0, cxp, CANVAS_H, w * 0.85);
          gl.addColorStop(0, `rgba(240, 251, 255, ${(0.22 + prog * 0.45).toFixed(3)})`);
          gl.addColorStop(1, 'rgba(240, 251, 255, 0)');
          ctx.fillStyle = gl;
          ctx.fillRect(cxp - w, CANVAS_H - w, w * 2, w);
        }
        ctx.restore();
      }
      // 风流打击：浓白等宽风带呼啸而过——实体感填充 + 内部奔流亮线 + 风头亮核与辉光
      for (const f of windFlows) {
        ctx.save();
        const tail = Math.max(0, f.prog - 0.3);
        const head = Math.min(f.prog, 1);
        // ① 风带主体：高不透明度风白填充（不再是淡影），带青辉光
        ctx.fillStyle = 'rgba(223, 243, 255, 0.82)';
        ctx.shadowColor = '#bfe6ff';
        ctx.shadowBlur = 16;
        spindle(f, tail, head, STORM.flowR);
        ctx.fill();
        ctx.shadowBlur = 0;
        // ② 内部奔流亮线：3 条沿曲线快速滑动的白色流线（风在带内奔涌，流速感）
        ctx.lineCap = 'round';
        const span = head - tail;
        if (span > 0.01) {
          for (let s = 0; s < 3; s++) {
            const ph = ((state.time * 1.4 + s * 0.37) % 1);
            const p0 = tail + ph * span * 0.62;
            const p1 = Math.min(head, p0 + span * 0.24);
            if (p1 <= p0) continue;
            ctx.strokeStyle = `rgba(255, 255, 255, ${(0.38 + s * 0.16).toFixed(3)})`;
            ctx.lineWidth = 1.6 + s * 0.5;
            ctx.beginPath();
            for (let k = 0; k <= 6; k++) {
              const pt = stormFlowPoint(f, p0 + (p1 - p0) * (k / 6));
              k === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
          }
        }
        // ③ 风头亮核：跟随尖端的大亮团（核心纯白 + 青色外晕，风头最亮最实）
        const hg = ctx.createRadialGradient(f.px, f.py, 0, f.px, f.py, STORM.flowR * 1.1);
        hg.addColorStop(0, 'rgba(255, 255, 255, 1)');
        hg.addColorStop(0.4, 'rgba(240, 251, 255, 0.78)');
        hg.addColorStop(1, 'rgba(223, 243, 255, 0)');
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(f.px, f.py, STORM.flowR * 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // 风柱打击：垂直白色光柱（迅速变亮后消散）
      for (const p of pillarStrikes) {
        const life = p.t / p.dur;
        const a = life < 0.25 ? life / 0.25 : 1 - (life - 0.25) / 0.75;
        const w = STORM.pillarW * (0.7 + life * 0.5);
        ctx.save();
        ctx.globalAlpha = clamp(a, 0, 1);
        const g = ctx.createLinearGradient(p.x - w / 2, 0, p.x + w / 2, 0);
        g.addColorStop(0, 'rgba(255, 255, 255, 0)');
        g.addColorStop(0.5, 'rgba(255, 255, 255, 0.9)');
        g.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(p.x - w / 2, 0, w, CANVAS_H);
        ctx.restore();
      }
    }

    // 涡流风旋（技能7）绘制：预警双环脉动 → 白色自转风旋（渐变底盘 + 3 内卷旋臂 + 风眼亮核）→ 消散
    function drawStormVortex() {
      if (!stormVortex) return;
      // 防残留兜底：技能6 中断（BOSS 被击坠/重试/状态切换）后 runStormSkill 不再推进，
      // 预警圈会永远留在原地——只要没有任何暴风之眼正在释放技能6，立即清除
      if (!enemies.some(en => en.type === 'boss' && en.bossId === 'storm' && en.skill && en.skill.id === 6)) {
        stormVortex = null;
        return;
      }
      const v = stormVortex;
      ctx.save();
      if (v.phase === 'warn' || v.phase === 'move') {
        // 落点预警：持续到风旋真正飞抵才消失（warn+move 共 1.9s）——
        // 落点微光渐亮 + 内卷汇聚风痕（风正在此汇聚，转速渐快）+ 旋转虚线落位环，替代旧的双环脉动
        const p = clamp((v.t + (v.phase === 'move' ? 0.5 : 0)) / 1.9, 0, 1);
        // 浮现渐入：预警前 0.5s 各层特效从 0 淡入（用累计时间，避免 warn→move 重置 v.t 时二次闪烁）
        const born = clamp((v.t + (v.phase === 'move' ? 0.5 : 0)) / 0.5, 0, 1);
        const R = v.r;
        ctx.save();
        ctx.translate(v.tx, v.ty);
        // ① 落点微光：风旋正在逼近落位，光随进度渐亮（浅红警示色调，更醒目）
        const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.6);
        gg.addColorStop(0, `rgba(255, 150, 128, ${((0.30 + p * 0.42) * born).toFixed(3)})`);
        gg.addColorStop(0.6, `rgba(255, 170, 150, ${((0.14 + p * 0.20) * born).toFixed(3)})`);
        gg.addColorStop(1, 'rgba(255, 170, 150, 0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(0, 0, R * 1.6, 0, Math.PI * 2); ctx.fill();
        // ② 内卷汇聚风痕：4 条手臂自外向内螺旋收拢，转速随进度加快，营造“风正在聚集”（浅红高亮）
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#ffc9b8';
        ctx.shadowColor = '#ff9c85';
        ctx.shadowBlur = 10;
        const swp = state.time * (1.6 + p * 2.6);
        for (let a = 0; a < 4; a++) {
          ctx.globalAlpha = (0.50 + p * 0.48) * born;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          for (let k = 0; k <= 10; k++) {
            const q = k / 10;
            const aa = a * Math.PI / 2 + swp - q * 2.4;
            const rad = R * (2.35 - q * 1.95);
            const px = Math.cos(aa) * rad, py = Math.sin(aa) * rad;
            k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        // ③ 落位虚线环：缓慢旋转的浅红虚线圆，随进度收拢、增亮
        ctx.globalAlpha = (0.75 + p * 0.25) * born;
        ctx.setLineDash([9, 7]);
        ctx.lineDashOffset = -state.time * 26;
        ctx.strokeStyle = '#ff9f8a';
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.arc(0, 0, R * (1.5 - p * 0.35), 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        return;
      }
      ctx.translate(v.x, v.y);
      // 白色浓度：喷射期缓慢变淡（1.0 → 0.85，速率很低，几乎全程浓白）；消散期 0.35s 快速衰减并缩小
      let w = 1, scale = 1;
      if (v.phase === 'spin') w = 1 - (v.t / 5) * 0.15;
      else if (v.phase === 'fade') { const fp = clamp(v.t / 0.35, 0, 1); w = 0.85 * (1 - fp); scale = 1 - fp * 0.4; }
      ctx.scale(scale, scale);
      const R = v.r;
      // 底盘：浓白风旋径向渐变（核心纯白）
      const bg = ctx.createRadialGradient(0, 0, R * 0.08, 0, 0, R);
      bg.addColorStop(0, `rgba(255, 255, 255, ${(1.0 * w).toFixed(3)})`);
      bg.addColorStop(0.55, `rgba(223, 243, 255, ${(0.65 * w).toFixed(3)})`);
      bg.addColorStop(1, 'rgba(223, 243, 255, 0)');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      // 2 条内卷旋臂（对称双臂，随发射角同步自转，与风条旋向一致）
      ctx.rotate(v.ang);
      ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(1, 1.0 * w).toFixed(3)})`;
      ctx.lineWidth = R * 0.16;
      ctx.lineCap = 'round';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 10;
      for (let a = 0; a < 2; a++) {
        ctx.beginPath();
        for (let k = 0; k <= 14; k++) {
          const q = k / 14;
          const aa = a * Math.PI + q * 2.8;
          const rad = R * (0.95 - q * 0.65);
          const px = Math.cos(aa) * rad, py = Math.sin(aa) * rad;
          k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      // 风眼亮核
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.32);
      cg.addColorStop(0, `rgba(255, 255, 255, ${(1.0 * w).toFixed(3)})`);
      cg.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  
    // BOSS：暴风之眼（第一阶段）—— 白色龙卷风暴（俯视旋涡：多层旋臂 + 风暴眼），逆时针旋转
    function drawStormBoss(e) {
      // 顶部血条已移至函数末尾绘制（drawStormBar）→ 图层高于暴风之眼本体；图鉴预览 phase='preview' 跳过
  
      ctx.save();
      ctx.translate(e.x, e.y);
      const R = e.w / 2;
      const rot = e.rot || 0;

      // 风聚阶段：12 道巨型气流自四周沿逆时针螺旋「射入」中心（动态飞驰的流线，非静态贴图）；
      // 离中心越远颜色越淡、线条越宽；尾迹拖带 + 风头亮点 + 横向摆动营造风流感。
      // 气流持续播放到旋胀中段（gt ≈ 3.85s），各自流入中心后自然消失，不做整体清场；
      // 本体矢量旋臂在风聚期间逐渐浮现（背景图仍不出现，旋胀起才复现）
      if (e.phase === 'gather' || e.phase === 'swirl') {
        // 统一时间轴：风聚 2.7s + 旋胀已进行时间（末道气流恰在旋胀中段抵达中心）
        const gt = e.phase === 'gather' ? e.phaseT : 2.7 + e.phaseT;
        // 开场渐入：警报刚起时气流/风痕从 0 淡入（≈0.7s），避免登场瞬间满屏特效
        const born = clamp(gt / 0.7, 0, 1);
        ctx.lineCap = 'round';
        ctx.shadowColor = '#9fd8ff';
        ctx.shadowBlur = 10;
        // 12 道射入气流：头部沿逆时针螺旋自屏幕边缘（≈3.1R）飞驰向中心；
        // 头部抵达后停驻汇入，尾迹继续跟进滑动直至完全没入中心才消失（无瞬间清空）
        for (let i = 0; i < 12; i++) {
          const a0 = (i / 12) * Math.PI * 2;
          const raw = (gt - i * 0.10) / 1.96;   // 头部行程（不截断：>1 后进入「尾迹跟进」阶段）
          const trail = 0.4;                    // 尾迹长度（占路径比例）
          if (raw <= 0 || raw - trail >= 1) continue;   // 未出发 / 尾迹已完全汇入中心
          const qHead = Math.min(raw, 1);       // 绘制窗口 [尾端, 风头]，头部抵达后封顶在中心
          const qTail = raw - trail;
          const SEGS = 9;
          let px0 = 0, py0 = 0;
          for (let k = 0; k <= SEGS; k++) {
            const q = qTail + (k / SEGS) * (qHead - qTail);   // 窗口整体随时间滑向中心
            const rad = R * (3.1 - q * 2.95);       // 路径：屏幕边缘 3.1R → 中心 0.15R
            const ang = a0 + rot * 2 - q * 2.1;     // 逆时针螺旋（与风暴自转同向）
            const wob = Math.sin(q * 8 - gt * 7 + i * 1.3) * R * 0.035;   // 风的横向摆动
            const px = Math.cos(ang) * rad - Math.sin(ang) * wob;
            const py = Math.sin(ang) * rad + Math.cos(ang) * wob;
            if (k === 0) { px0 = px; py0 = py; continue; }
            const fade = clamp((q - qTail) / (qHead - qTail), 0, 1);   // 尾端渐隐
            const alpha = (0.15 + 0.55 * q) * fade * born;   // 越近中心越亮 × 开场渐入
            ctx.strokeStyle = `rgba(223, 243, 255, ${alpha.toFixed(3)})`;
            ctx.lineWidth = 1.5 + (1 - q) * 9;         // 越远离中心越宽
            ctx.beginPath();
            ctx.moveTo(px0, py0);
            ctx.lineTo(px, py);
            ctx.stroke();
            px0 = px; py0 = py;
          }
          // 风头亮点：气流「射入」的运动焦点（抵达中心汇入后不再绘制）
          if (raw < 1) {
            const hrad = R * (3.1 - raw * 2.95);
            const hang = a0 + rot * 2 - raw * 2.1;
            ctx.fillStyle = `rgba(255, 255, 255, ${(0.9 * born).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(Math.cos(hang) * hrad, Math.sin(hang) * hrad, 2.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // 白色风痕：短流线错峰循环飞驰（逆时针螺旋拖尾，连绵不绝）
        for (let i = 0; i < 26; i++) {
          const seed = i * 2.399963;                        // 黄金角均匀散布
          const cyc = (gt * 0.6 + i * 0.137) % 1;           // 各风痕错峰循环
          const rad = R * (3.2 - cyc * 2.9);                // 自屏幕边缘向中心收缩
          const ang = seed + rot * 2.2 - cyc * 2.6;         // 边飞边逆时针螺旋偏转
          const a = Math.sin(cyc * Math.PI) * clamp((3.85 - gt) / 0.6, 0, 1) * born;   // 起止淡入淡出（开场渐入 + 末段渐隐）
          const len = R * (0.14 + 0.10 * Math.abs(Math.sin(i * 1.7 + 3)));
          const nx = Math.cos(ang), ny = Math.sin(ang);
          const tx = nx * rad, ty = ny * rad;
          const hx = nx * (rad + len) - ny * len * 0.5;     // 尾端在 +角向 → 与逆时针飞行同向
          const hy = ny * (rad + len) + nx * len * 0.5;
          ctx.strokeStyle = `rgba(255, 255, 255, ${(0.8 * a).toFixed(3)})`;
          ctx.lineWidth = 1.4 + a * 1.4;
          ctx.beginPath();
          ctx.moveTo(hx, hy);
          ctx.lineTo(tx, ty);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }

      // 入场透明度：按总入场时间连续渐变（各转场点两侧数值相等，避免阶段切换时闪烁）——
      // 风聚 1.6s 渐显至 0.85 → 旋胀缓慢升至 0.90 → 成形升至 1.0 → 战斗维持全亮
      if (e.phase === 'gather' || e.phase === 'swirl' || e.phase === 'form') {
        const et = e.phaseT + (e.phase === 'swirl' ? 2.7 : e.phase === 'form' ? 5.0 : 0);
        ctx.globalAlpha = et < 1.6 ? (et / 1.6) * 0.85
          : et < 5.0 ? 0.85 + ((et - 1.6) / 3.4) * 0.05
          : 0.90 + clamp((et - 5.0) / 1.0, 0, 1) * 0.10;
      }
      ctx.scale(e.scale, e.scale);

      // 成形震荡波：有厚度的白青波带自风暴中心急速向外扩散（径向渐变实体环，非细描边）
      if (e.shock) {
        const pr = clamp(e.shock.t / e.shock.dur, 0, 1);
        const wr = R * (0.4 + pr * 2.4);
        const bw = R * (0.30 + pr * 0.25);   // 波带宽度：随扩散增厚，冲击更有分量
        ctx.save();
        // ① 波带主体：径向渐变圆环填充——前缘最亮、尾迹渐散，实体感强
        const band = ctx.createRadialGradient(0, 0, Math.max(0, wr - bw), 0, 0, wr + bw * 0.4);
        band.addColorStop(0, 'rgba(223, 243, 255, 0)');
        band.addColorStop(0.55, `rgba(190, 228, 252, ${(0.38 * (1 - pr)).toFixed(3)})`);
        band.addColorStop(0.85, `rgba(255, 255, 255, ${(0.62 * (1 - pr)).toFixed(3)})`);
        band.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = band;
        ctx.beginPath();
        ctx.arc(0, 0, wr + bw * 0.4, 0, Math.PI * 2);
        ctx.fill();
        // ② 前缘亮线：波前锐利亮边 + 青白辉光，强化冲击方向感
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.9 * (1 - pr)).toFixed(3)})`;
        ctx.lineWidth = 4;
        ctx.shadowColor = '#bfe9ff';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(0, 0, wr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 成形阶段：双圈聚能光环向本体收缩（内外两圈错速收拢，蓄力感更明显）
      if (e.phase === 'form') {
        const fp = clamp(e.phaseT / 1.0, 0, 1);
        ctx.shadowColor = '#7cd8ff';
        for (const cfg of [{ sp: 1.0, w: 4.5, blur: 16 }, { sp: 0.72, w: 2.5, blur: 9 }]) {
          const p = clamp(fp / cfg.sp, 0, 1);
          ctx.strokeStyle = `rgba(223, 243, 255, ${(0.65 * (1 - p)).toFixed(3)})`;
          ctx.lineWidth = cfg.w;
          ctx.shadowBlur = cfg.blur;
          ctx.beginPath();
          ctx.arc(0, 0, R * (1.9 - p * 0.9), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }
  
      // 台风本体图：垫于矢量层之下 + 淡紫辉光包裹，绕校准后的旋转中心缓慢自转；
      // 累计偏移（眼半径采用修正值 0.065D）：上移 0.05D、左移 0.0125D、
      // 下移 0.0843D、右移 0.0226D
      if (stormEyeImg && e.phase !== 'gather') {   // 背景图风聚阶段不出现，旋胀起逐渐复现
        const D = R * 2.6;   // 云盘直径约碰撞盒的 1.3 倍，向外溢出更显庞大
        const offX = -D / 2 - D * 0.0125 + D * 0.0226;   // 左移 0.0125D 后累计右移 0.0226D
        const offY = -D / 2 - D * 0.05 + D * 0.0843;     // 上移 0.05D 后累计下移 0.0843D
        ctx.save();
        ctx.rotate(rot * 0.55);   // 与矢量旋臂同向（逆时针）但更慢，形成内外层次
        let imgA = 0.88;
        if (e.phase === 'swirl') imgA *= clamp(e.phaseT / 2.3, 0, 1);   // 旋胀期间随进度淡入复现
        ctx.globalAlpha *= imgA;
        ctx.shadowColor = 'rgba(167, 139, 250, 0.55)';
        ctx.shadowBlur = R * 0.35;
        ctx.drawImage(stormEyeImg, offX, offY, D, D);
        ctx.restore();
      }
  
      // 多层旋臂云带：外层宽、内层窄，各层以不同速度逆时针旋转
      for (let ring = 0; ring < 4; ring++) {
        const rr = R * (1 - ring * 0.2);
        const aRot = rot * (1 + ring * 0.28);
        ctx.save();
        ctx.rotate(aRot);
        ctx.strokeStyle = ring % 2 === 0 ? 'rgba(240, 250, 255, 0.75)' : 'rgba(190, 222, 245, 0.6)';
        ctx.lineWidth = R * (0.16 - ring * 0.02);
        ctx.lineCap = 'round';
        // 每层 2 条对称旋臂（螺旋弧线）
        for (let arm = 0; arm < 2; arm++) {
          ctx.beginPath();
          const a0 = arm * Math.PI + ring * 0.7;
          for (let k = 0; k <= 16; k++) {
            const p = k / 16;
            const ang = a0 + p * 2.4;   // 螺旋展开约 137°
            const rad = rr * (0.35 + p * 0.65);
            const px = Math.cos(ang) * rad;
            const py = Math.sin(ang) * rad;
            k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
      // 外缘风雾光环
      const rim = ctx.createRadialGradient(0, 0, R * 0.55, 0, 0, R);
      rim.addColorStop(0, 'rgba(210, 235, 255, 0)');
      rim.addColorStop(0.75, 'rgba(225, 244, 255, 0.28)');
      rim.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();
      // 风暴眼：中心平静空洞（微亮核 + 深色环）
      const eye = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.22);
      eye.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      eye.addColorStop(0.55, 'rgba(140, 180, 210, 0.55)');
      eye.addColorStop(1, 'rgba(30, 50, 70, 0)');
      ctx.fillStyle = eye;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.22, 0, Math.PI * 2);
      ctx.fill();
      // 环绕风粒子
      for (let i = 0; i < 14; i++) {
        const ang = rot * 1.6 + (i / 14) * Math.PI * 2;
        const rad = R * (0.45 + 0.4 * ((Math.sin(state.time * 1.7 + i * 1.9) + 1) / 2));
        const sz = 1.5 + Math.sin(i * 2.3 + state.time * 5) * 0.8;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillRect(Math.cos(ang) * rad - sz / 2, Math.sin(ang) * rad - sz / 2, sz, sz);
      }
      ctx.restore();

      // 顶部血条：最后绘制 → 图层高于暴风之眼本体
      if (e.phase === 'combat') drawStormBar(e);
    }
  
    // 暴风之眼顶部专用血条：长六边形风蓝主题（同旧日之歌设计语言）+ 登场横向展开 +
    // 残血余像/能量前线/刻度 + 边框循环流光与上下掠过的风痕（风流涌动不息）
    function drawStormBar(e) {
      const revealP = clamp(e.barT / 0.8, 0, 1);
      const reveal = 1 - Math.pow(1 - revealP, 3);   // easeOutCubic：以中心为基准横向展开
      const flash = 1 - revealP;                      // 登场瞬间的青白爆闪

      const bw = 360, bh = 13;
      const cx = CANVAS_W / 2, top = 8, mid = top + bh / 2, bot = top + bh;
      const taper = 15;
      const x0 = cx - bw / 2, x1 = cx + bw / 2;
      // 长六边形轮廓（与旧日之歌同款：左右两端各收出一个尖点）
      const hexPath = () => {
        ctx.beginPath();
        ctx.moveTo(x0, mid);
        ctx.lineTo(x0 + taper, top);
        ctx.lineTo(x1 - taper, top);
        ctx.lineTo(x1, mid);
        ctx.lineTo(x1 - taper, bot);
        ctx.lineTo(x0 + taper, bot);
        ctx.closePath();
      };

      ctx.save();
      ctx.translate(cx, 0); ctx.scale(reveal, 1); ctx.translate(-cx, 0);

      // 底座 + 风青呼吸辉光（登场爆闪增强）
      ctx.shadowColor = '#7cd8ff';
      ctx.shadowBlur = 14 + Math.sin(state.time * 2.8) * 4 + flash * 22;
      hexPath();
      ctx.fillStyle = `rgba(8, 24, 44, ${(0.88 + flash * 0.12).toFixed(3)})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(190, 235, 255, ${Math.min(1, 0.55 + flash * 0.45).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 内部裁剪：残血余像 → 主血量 → 能量前线 → 刻度 → 风青罩染
      ctx.save();
      hexPath();
      ctx.clip();
      const ratio = clamp(e.hp / e.maxHp, 0, 1);
      const trail = Math.max(ratio, clamp((e.hpTrail != null ? e.hpTrail : e.hp) / e.maxHp, 0, 1));
      if (trail > ratio + 0.002) {          // 刚扣除的血量以白色余条缓慢消退
        ctx.fillStyle = 'rgba(240, 250, 255, 0.5)';
        ctx.fillRect(x0, top, (x1 - x0) * trail, bh);
      }
      const hg = ctx.createLinearGradient(x0, 0, x1, 0);   // 主血量：深海蓝 → 风青 → 风白
      hg.addColorStop(0, '#164e78');
      hg.addColorStop(0.3, '#4da3dc');
      hg.addColorStop(1, '#dff3ff');
      ctx.fillStyle = hg;
      ctx.fillRect(x0, top + 1.2, (x1 - x0) * ratio, bh - 2.4);
      if (ratio > 0.005 && ratio < 1) {     // 能量前线：填充最前端的发光亮线
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.shadowColor = '#bfeaff';
        ctx.shadowBlur = 6;
        ctx.fillRect(x0 + (x1 - x0) * ratio - 1, top + 1.2, 2, bh - 2.4);
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';          // 顶部高光
      ctx.fillRect(x0, top + 1.2, (x1 - x0) * ratio, 2.5);
      ctx.fillStyle = 'rgba(4, 14, 28, 0.55)';              // 每 10% 一道刻度
      for (let i = 1; i < 10; i++) ctx.fillRect(x0 + (x1 - x0) * i / 10, top + 1.2, 1, bh - 2.4);
      const tint = ctx.createLinearGradient(0, top, 0, bot); // 风青罩染
      tint.addColorStop(0, 'rgba(124, 216, 255, 0.28)');
      tint.addColorStop(0.55, 'rgba(124, 216, 255, 0.05)');
      tint.addColorStop(1, 'rgba(20, 60, 110, 0.30)');
      ctx.fillStyle = tint;
      ctx.fillRect(x0, top, x1 - x0, bh);
      ctx.restore();

      // 边框风流涌动不息：几何完全不动、只有亮度沿边框循环流动（流光），
      // 叠加上下两侧高速掠过的带尾风痕（渐隐尾巴的短弧线，经典风力线条）——不扭动、不爬行
      const c01 = (v) => Math.max(0, Math.min(1, v));
      // ① 流光描边：柔和底色描边 + 沿条宽循环移动的 4 道亮带
      hexPath();
      ctx.strokeStyle = 'rgba(140, 205, 245, 0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
      const flowGrad = () => {
        const fg = ctx.createLinearGradient(x0, 0, x1, 0);
        for (let k = 0; k < 4; k++) {
          const pos = ((state.time * 0.16 + k / 4) % 1 + 1) % 1;
          const w = 0.055;
          fg.addColorStop(c01(pos - w), 'rgba(235, 250, 255, 0)');
          fg.addColorStop(c01(pos), 'rgba(240, 251, 255, 0.95)');
          fg.addColorStop(c01(pos + w), 'rgba(235, 250, 255, 0)');
        }
        return fg;
      };
      hexPath();
      ctx.strokeStyle = flowGrad();
      ctx.lineWidth = 2;
      ctx.shadowColor = '#aee4ff';
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // ② 风痕掠过：上下各 4 道带渐隐尾的短弧线，高速横移循环（位于框外缘，风掠过感）
      const gust = (yBase, cfg) => {
        const span = (x1 - x0) + 120;
        const head = x0 - 60 + (((state.time * cfg.v + cfg.off) % span) + span) % span;
        const fade = c01(head - (x0 - 55)) * c01((x1 + 55) - head) * 0.9;   // 两端淡入淡出
        if (fade <= 0.01) return;
        const tail = head - cfg.len;
        const yg = ctx.createLinearGradient(tail, 0, head, 0);
        yg.addColorStop(0, 'rgba(225, 246, 255, 0)');
        yg.addColorStop(0.7, `rgba(225, 246, 255, ${(0.5 * fade).toFixed(3)})`);
        yg.addColorStop(1, `rgba(255, 255, 255, ${(0.95 * fade).toFixed(3)})`);
        ctx.strokeStyle = yg;
        ctx.lineWidth = 1.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tail, yBase + cfg.bow * 0.5);
        ctx.quadraticCurveTo((tail + head) / 2, yBase + cfg.bow * 1.6, head, yBase);
        ctx.stroke();
      };
      for (const s of [   // 上缘：弓背朝上
        { v: 340, off: 0, len: 30, bow: -4 },
        { v: 260, off: 240, len: 46, bow: -3 },
        { v: 420, off: 520, len: 24, bow: -5 },
        { v: 300, off: 760, len: 38, bow: -3.5 },
      ]) gust(top - 4.5, s);
      for (const s of [   // 下缘：弓背朝下，相位/速度全部错开
        { v: 360, off: 120, len: 34, bow: 4 },
        { v: 250, off: 430, len: 50, bow: 3 },
        { v: 440, off: 640, len: 22, bow: 5 },
        { v: 310, off: 880, len: 40, bow: 3.5 },
      ]) gust(bot + 4.5, s);

      ctx.restore();

      // 登场瞬间：光环自血条中心椭圆扩散 + 数道风流自中心向两侧掠出（配合横向展开）
      if (revealP < 1) {
        ctx.save();
        ctx.globalAlpha = (1 - revealP) * 0.85;
        ctx.strokeStyle = '#bfeaff';
        ctx.shadowColor = '#7cd8ff';
        ctx.shadowBlur = 16;
        ctx.lineWidth = 2.5 * (1 - revealP) + 0.5;
        ctx.beginPath();
        ctx.ellipse(cx, mid, (bw / 2) * (0.35 + revealP * 0.85), bh * (1.2 + revealP * 3.2), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (flash > 0.02) {
        ctx.save();
        ctx.strokeStyle = 'rgba(220, 244, 255, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#aee4ff';
        ctx.shadowBlur = 8;
        ctx.globalAlpha = flash * 0.8;
        for (let i = 0; i < 6; i++) {
          const yy = top + (i + 0.5) * (bh / 6);
          const dir = i % 2 ? 1 : -1;
          const len = 34 + (i % 3) * 24 + reveal * 46;
          ctx.beginPath();
          ctx.moveTo(cx + dir * 16, yy);
          ctx.lineTo(cx + dir * (16 + len), yy);
          ctx.stroke();
        }
        ctx.restore();
      }

      ctx.restore();

      // 名称与数值（展开完成后淡入）
      const txtA = clamp((e.barT - 0.45) / 0.35, 0, 1);
      if (txtA > 0.01) {
        ctx.globalAlpha = txtA;
        ctx.fillStyle = '#d9f2ff';
        ctx.shadowColor = '#7cd8ff';
        ctx.shadowBlur = 6;
        ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${e.name} · ${Math.ceil(e.hp)} / ${e.maxHp}`, CANVAS_W / 2, 35);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
    }

    // 大型龙卷（技能2）：俯视白色风暴旋涡 —— 以 assets/storm-eye.png 原图为本体（同 BOSS 手法），
    // 矢量特效降为低透明度点缀（旋臂/柔光），不再用暗底盘与纯黑眼遮盖原图；中心仅微光提亮
    // 外形为正圆（碰撞体 w=h），整体逆时针旋转
    function drawTornado(e) {
      ctx.save();
      ctx.translate(e.x, e.y);
      const R = e.w * 0.5;
      const rot = -state.time * 1.9;   // 逆时针（canvas 角度递减）
      const pulse = 1 + Math.sin(state.time * 3.1) * 0.015;   // 轻微呼吸缩放
      ctx.scale(pulse, pulse);

      // 矢量旋臂（原图/兜底共用）：多道渐细渐隐的细柔臂 + 更细的漂移风须。
      // 旧版等宽圆头粗臂（粗、圆头、匀速弯曲）是“蛆感”根因，改成分段变宽、根亮尾淡
      const paintArms = () => {
        ctx.save();
        ctx.rotate(rot);
        ctx.lineCap = 'round';
        // 主臂 ×4：根亮尾淡、根粗尾细的分段弧线（云带丝缕感，不再是一根粗虫）
        for (let arm = 0; arm < 4; arm++) {
          const a0 = arm * (Math.PI / 2) + 0.5;
          const SEGS = 12;
          let qx = 0, qy = 0;
          for (let k = 0; k <= SEGS; k++) {
            const p = k / SEGS;
            const ang = a0 + p * 3.0;
            const rad = R * (0.26 + p * 0.70);
            const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
            if (k > 0) {
              const fade = 0.9 - p * 0.75;                             // 根亮尾淡
              ctx.strokeStyle = `rgba(255, 255, 255, ${(0.42 * fade + 0.05).toFixed(3)})`;
              ctx.lineWidth = R * (0.070 * (1 - p * 0.82) + 0.010);    // 根 ~6px 渐细至 ~1px
              ctx.beginPath();
              ctx.moveTo(qx, qy);
              ctx.lineTo(px, py);
              ctx.stroke();
            }
            qx = px; qy = py;
          }
        }
        // 细风须 ×6：更细更淡、相对主臂缓慢漂移的丝缕，织出风流感
        ctx.save();
        ctx.rotate(state.time * 0.55);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
        ctx.lineWidth = 1.1;
        for (let arm = 0; arm < 6; arm++) {
          const a0 = arm * (Math.PI / 3) + 1.1;
          ctx.beginPath();
          for (let k = 0; k <= 14; k++) {
            const p = k / 14;
            const ang = a0 + p * 2.5;
            const rad = R * (0.20 + p * 0.76);
            const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
            k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        ctx.restore();
        ctx.restore();
      };

      if (stormEyeImg) {
        // 白色实体底盘：先铺一层高不透明白盘，风暴不再是「透明幽灵」
        const body = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.04);
        body.addColorStop(0, 'rgba(248, 252, 255, 0.88)');
        body.addColorStop(0.62, 'rgba(228, 240, 252, 0.72)');
        body.addColorStop(0.9, 'rgba(208, 228, 246, 0.38)');
        body.addColorStop(1, 'rgba(208, 228, 246, 0)');
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(0, 0, R * 1.04, 0, Math.PI * 2);
        ctx.fill();

        // 原图纹理：低不透明度叠在白盘上（仅隐约可辨旋涡轮廓与暗色云隙）；圆形裁剪去除照片黑角
        const D = R * 2.08;
        ctx.save();
        ctx.rotate(rot * 0.55);   // 与矢量点缀同向但更慢，形成内外层次
        ctx.globalAlpha *= 0.26;
        ctx.shadowColor = 'rgba(210, 235, 255, 0.5)';
        ctx.shadowBlur = R * 0.3;
        ctx.beginPath();
        ctx.arc(0, 0, D / 2 - 1, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(stormEyeImg, -D / 2, -D / 2, D, D);
        ctx.restore();

        // 矢量旋臂：渐细渐隐细臂 + 漂移风须（共用 paintArms）
        paintArms();

        // 外缘柔光：白色气旋轮廓
        const rim = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 1.06);
        rim.addColorStop(0, 'rgba(225, 244, 255, 0)');
        rim.addColorStop(0.8, 'rgba(235, 248, 255, 0.30)');
        rim.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = rim;
        ctx.beginPath();
        ctx.arc(0, 0, R * 1.06, 0, Math.PI * 2);
        ctx.fill();

        // 风暴眼：仅微光提亮（照片中心已足够深，不再叠纯黑）
        const eyeGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.20);
        eyeGlow.addColorStop(0, 'rgba(255, 255, 255, 0.30)');
        eyeGlow.addColorStop(0.6, 'rgba(200, 224, 246, 0.12)');
        eyeGlow.addColorStop(1, 'rgba(200, 224, 246, 0)');
        ctx.fillStyle = eyeGlow;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.20, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 原图未加载兜底：简化矢量风暴（同样无暗底盘、中心减淡）
        paintArms();
        ctx.save();
        const eye = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.22);
        eye.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
        eye.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = eye;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.restore();
    }
  
  // BOSS：旧日之歌 —— 灰黑渐变舰体 + 流动彩色光泽 + 音核涟漪 + 双炮管
  function drawBoss(e) {
      if (e.bossId === 'storm') { drawStormBoss(e); return; }   // 暴风之眼专用绘制
    const isEntering = (e.phase === 'blackhole' || e.phase === 'emerge' || e.phase === 'assemble');

    // 顶部专用血条：两端收尖的长六边形 + 暗紫光芒笼罩 + 登场横向展开演出（仅战斗阶段）
    if (e.phase === 'combat') {
      const revealP = clamp(e.barT / 0.8, 0, 1);
      const reveal = 1 - Math.pow(1 - revealP, 3);   // easeOutCubic：以中心为基准横向展开
      const flash = 1 - revealP;                      // 登场瞬间的紫光爆闪

      const bw = 360, bh = 13;   // 高度缩短 20%（16 → 13）
      const cx = CANVAS_W / 2, top = 8, mid = top + bh / 2, bot = top + bh;
      const taper = 15;
      const x0 = cx - bw / 2, x1 = cx + bw / 2;
      // 长六边形轮廓（左右两端各收出一个尖点）
      const hexPath = () => {
        ctx.beginPath();
        ctx.moveTo(x0, mid);
        ctx.lineTo(x0 + taper, top);
        ctx.lineTo(x1 - taper, top);
        ctx.lineTo(x1, mid);
        ctx.lineTo(x1 - taper, bot);
        ctx.lineTo(x0 + taper, bot);
        ctx.closePath();
      };

      ctx.save();
      ctx.translate(cx, 0); ctx.scale(reveal, 1); ctx.translate(-cx, 0);

      // 底座 + 暗紫光芒笼罩（呼吸辉光 + 登场爆闪）
      ctx.shadowColor = '#8b5cf6';
      ctx.shadowBlur = 14 + Math.sin(state.time * 2.5) * 4 + flash * 22;
      hexPath();
      ctx.fillStyle = `rgba(26, 10, 48, ${(0.88 + flash * 0.12).toFixed(3)})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(167, 139, 250, ${Math.min(1, 0.5 + flash * 0.5).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 内部裁剪：残血余像 → 主血量 → 刻度 → 暗紫罩染
      ctx.save();
      hexPath();
      ctx.clip();
      const ratio = clamp(e.hp / e.maxHp, 0, 1);
      const trail = Math.max(ratio, clamp((e.hpTrail != null ? e.hpTrail : e.hp) / e.maxHp, 0, 1));
      if (trail > ratio + 0.002) {          // 刚扣除的血量以白色余条缓慢消退
        ctx.fillStyle = 'rgba(255, 230, 240, 0.5)';
        ctx.fillRect(x0, top, (x1 - x0) * trail, bh);
      }
      const hg = ctx.createLinearGradient(x0, 0, x1, 0);   // 主血量：幽紫 → 猩红 → 金橙
      hg.addColorStop(0, '#6d28d9');
      hg.addColorStop(0.3, '#ff4d6d');
      hg.addColorStop(1, '#ffb545');
      ctx.fillStyle = hg;
      ctx.fillRect(x0, top + 1.2, (x1 - x0) * ratio, bh - 2.4);
      // 能量前线：血量填充最前端的发光亮线，随血量减少而滑动
      if (ratio > 0.005 && ratio < 1) {
        ctx.fillStyle = 'rgba(240, 225, 255, 0.9)';
        ctx.shadowColor = '#c4b5fd';
        ctx.shadowBlur = 6;
        ctx.fillRect(x0 + (x1 - x0) * ratio - 1, top + 1.2, 2, bh - 2.4);
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.20)';          // 顶部高光
      ctx.fillRect(x0, top + 1.2, (x1 - x0) * ratio, 2.5);
      ctx.fillStyle = 'rgba(10, 4, 24, 0.55)';              // 每 10% 一道刻度
      for (let i = 1; i < 10; i++) ctx.fillRect(x0 + (x1 - x0) * i / 10, top + 1.2, 1, bh - 2.4);
      const tint = ctx.createLinearGradient(0, top, 0, bot); // 暗紫罩染：血量也蒙上紫气
      tint.addColorStop(0, 'rgba(139, 92, 246, 0.30)');
      tint.addColorStop(0.55, 'rgba(139, 92, 246, 0.05)');
      tint.addColorStop(1, 'rgba(46, 16, 84, 0.30)');
      ctx.fillStyle = tint;
      ctx.fillRect(x0, top, x1 - x0, bh);
      ctx.restore();

      ctx.restore();

      // 破碎感主题：泛白紫碎块在血条周围持续剥落、漂移、消散（旧日之歌 = 空间异物）
      if (!e.shards) {
        e.shards = [];
        const SHARD_COLS = ['#ece6fa', '#dcd0f6', '#cdc0f0', '#f4f0fc'];
        for (let i = 0; i < 10; i++) {
          const vn = 3 + Math.floor(Math.random() * 2);   // 3~4 边不规则碎形
          const pts = [];
          for (let k = 0; k < vn; k++) {
            const a = (k / vn) * Math.PI * 2 + Math.random() * 0.9;
            const rr = 0.6 + Math.random() * 0.6;
            pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
          }
          e.shards.push({
            bx: rand(-bw / 2 - 26, bw / 2 + 26),   // 沿血条及两端外侧散布
            by: rand(-14, 14),
            sz: rand(1.6, 4.2),
            amp: rand(2, 5),
            fs: rand(0.5, 1.1),                    // 漂浮速度
            ph: Math.random() * Math.PI * 2,       // 生命周期相位
            spd: rand(0.05, 0.14),                 // 生命周期速度
            dx: rand(-12, 12),                     // 单周期水平漂移
            rspd: rand(-1.2, 1.2),                 // 自转速度
            col: SHARD_COLS[Math.floor(Math.random() * SHARD_COLS.length)],
            pts,
          });
        }
      }
      for (const s of e.shards) {
        const cyc = (state.time * s.spd + s.ph) % 1;              // 0→1 生命周期
        const a = Math.sin(cyc * Math.PI) * 0.85 * revealP;       // 淡入→淡出（随血条展开浮现）
        const x = s.bx + (cyc - 0.5) * s.dx;                      // 缓慢漂移
        const y = s.by + Math.sin(state.time * s.fs + s.ph * 3) * s.amp;
        ctx.save();
        ctx.translate(cx + x, mid + y);
        ctx.rotate(state.time * s.rspd + s.ph);
        ctx.globalAlpha = a;
        ctx.fillStyle = s.col;
        ctx.shadowColor = '#b9a8f5';
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.moveTo(s.pts[0][0] * s.sz, s.pts[0][1] * s.sz);
        for (let k = 1; k < s.pts.length; k++) ctx.lineTo(s.pts[k][0] * s.sz, s.pts[k][1] * s.sz);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      // 登场瞬间：碎块自血条向四周迸散（破碎感开场）
      if (flash > 0.02) {
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2 + 0.35;
          const dist = 18 + reveal * 95;
          const px2 = cx + Math.cos(ang) * dist * 1.35;   // 横向飞得更远（血条为横长条）
          const py2 = mid + Math.sin(ang) * dist * 0.45;
          const sz2 = 2 + (i % 3) * 0.9;
          ctx.save();
          ctx.translate(px2, py2);
          ctx.rotate(state.time * 3 + i);
          ctx.globalAlpha = flash * (0.85 - (i % 4) * 0.1);
          ctx.fillStyle = i % 2 ? '#e8e2f8' : '#cfc0f2';
          ctx.shadowColor = '#b9a8f5';
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.moveTo(sz2, 0);
          ctx.lineTo(-sz2 * 0.5, sz2 * 0.7);
          ctx.lineTo(-sz2 * 0.4, -sz2 * 0.8);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }

      // 名称与数值（展开完成后淡入）
      const txtA = clamp((e.barT - 0.45) / 0.35, 0, 1);
      if (txtA > 0.01) {
        ctx.globalAlpha = txtA;
        ctx.fillStyle = '#e6d5ff';
        ctx.shadowColor = '#8b5cf6';
        ctx.shadowBlur = 6;
        ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${e.name} · ${Math.ceil(e.hp)} / ${e.maxHp}`, CANVAS_W / 2, 35);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
    }

    // ---------- 黑洞特效（进场演出期间始终绘制） ----------
    if (isEntering) {
      const BH_DUR = 2.7, EM_DUR = 2.3, AS_DUR = 1.0;
      let bhScale = 1, bhAlpha = 1;
      if (e.phase === 'blackhole') {
        const p = clamp(e.phaseT / BH_DUR, 0, 1);
        bhScale = 0.2 + p * 0.8;   // 黑洞从小变大
        bhAlpha = clamp(p * 3, 0, 1);
      } else if (e.phase === 'emerge') {
        bhScale = 1.0;
        bhAlpha = 1.0;
      } else {
        // assemble：黑洞逐渐收缩消失
        const p = clamp(e.phaseT / AS_DUR, 0, 1);
        bhScale = 1.0 - p * 0.7;
        bhAlpha = 1.0 - p;
      }
      if (bhAlpha > 0.01) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.globalAlpha = bhAlpha;
        const bR = 120 * bhScale;
        // 外层吸积盘：紫色/橙色渐变旋转光环
        for (let ring = 0; ring < 3; ring++) {
          const rr = bR * (1.3 + ring * 0.35);
          const rot = state.time * (1.8 - ring * 0.4) * (ring % 2 === 0 ? 1 : -1);
          ctx.save();
          ctx.rotate(rot);
          ctx.globalAlpha = bhAlpha * (0.5 - ring * 0.12);
          const rg = ctx.createLinearGradient(-rr, 0, rr, 0);
          const hue1 = 270 + ring * 30;
          rg.addColorStop(0, `hsla(${hue1}, 80%, 50%, 0)`);
          rg.addColorStop(0.3, `hsla(${hue1}, 80%, 60%, 0.7)`);
          rg.addColorStop(0.5, `hsla(${hue1 + 40}, 90%, 70%, 0.9)`);
          rg.addColorStop(0.7, `hsla(${hue1}, 80%, 60%, 0.7)`);
          rg.addColorStop(1, `hsla(${hue1}, 80%, 50%, 0)`);
          ctx.strokeStyle = rg;
          ctx.lineWidth = 3 - ring * 0.6;
          ctx.beginPath();
          ctx.ellipse(0, 0, rr, rr * 0.35, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        // 内层漩涡粒子（12 个点绕中心旋转内缩）
        ctx.globalAlpha = bhAlpha * 0.8;
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2 + state.time * 3.5;
          const dist = bR * (0.4 + 0.5 * ((Math.sin(state.time * 2 + i * 1.3) + 1) / 2));
          const px = Math.cos(ang) * dist;
          const py = Math.sin(ang) * dist * 0.45;
          const sz = 2 + Math.sin(i + state.time * 5) * 1;
          ctx.fillStyle = i % 3 === 0 ? '#ff9040' : '#c070ff';
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 6;
          ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
        }
        ctx.shadowBlur = 0;
        // 中心纯黑洞口：径向渐变（全黑核 + 边缘微光）
        const coreG = ctx.createRadialGradient(0, 0, 0, 0, 0, bR);
        coreG.addColorStop(0, 'rgba(0, 0, 0, 1)');
        coreG.addColorStop(0.55, 'rgba(0, 0, 0, 0.95)');
        coreG.addColorStop(0.8, 'rgba(20, 5, 40, 0.6)');
        coreG.addColorStop(1, 'rgba(60, 20, 100, 0)');
        ctx.fillStyle = coreG;
        ctx.beginPath();
        ctx.arc(0, 0, bR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // ---------- 机体绘制（blackhole 阶段不显示，emerge/assemble 渐显） ----------
    if (e.phase === 'blackhole') return;

    ctx.save();
    ctx.translate(e.x, e.y);
    // emerge 阶段渐显：随浮现进度从全透明渐显至完全不透明（覆盖整个浮现过程 2.3s）
    if (e.phase === 'emerge') {
      ctx.globalAlpha = clamp(e.phaseT / 2.3, 0, 1);
    }
    ctx.scale(e.scale, e.scale);
    const encyFix = !!e.ency;   // 图鉴预览：边缘流彩锁定为血条碎块同款泛白紫（不再彩虹转色）
    const hue = encyFix ? 254 : (state.time * 36) % 360;

    // 舰体：灰黑垂直渐变，边缘泛流动彩光
    const pts = [[0, 62], [58, 52], [110, 30], [144, 4], [126, -26], [84, -46], [40, -62]];
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    for (let k = pts.length - 1; k >= 0; k--) ctx.lineTo(-pts[k][0], pts[k][1]);
    ctx.closePath();
    const body = ctx.createLinearGradient(0, -e.h / 2, 0, e.h / 2);
    body.addColorStop(0, '#4a4f57');
    body.addColorStop(0.5, '#1a1d22');
    body.addColorStop(1, '#05070b');
    ctx.fillStyle = body;
    ctx.strokeStyle = encyFix ? 'hsla(254, 70%, 80%, 0.9)' : `hsla(${hue}, 60%, 62%, 0.9)`;
    ctx.lineWidth = 2;
    ctx.shadowColor = encyFix ? 'hsla(254, 75%, 80%, 0.8)' : `hsla(${hue}, 70%, 60%, 0.8)`;
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 流动彩色光泽：一条随时间左右游走的色带（裁剪在舰体内）
    ctx.save();
    ctx.clip();
    const sweep = Math.sin(state.time * 0.7) * 90;
    const sheen = ctx.createLinearGradient(sweep - 80, 0, sweep + 80, 0);
    sheen.addColorStop(0, `hsla(${hue}, 55%, 60%, 0)`);
    sheen.addColorStop(0.5, `hsla(${hue}, 55%, 60%, 0.30)`);
    sheen.addColorStop(1, `hsla(${encyFix ? hue : (hue + 90) % 360}, 55%, 55%, 0)`);   // 图鉴同色系
    ctx.fillStyle = sheen;
    ctx.fillRect(-e.w / 2, -e.h / 2, e.w, e.h);
    ctx.restore();

    // 翼板展开动画：emerge 收起，assemble 渐展开，combat 全展开
    const up = e.phase === 'emerge' ? 0
      : e.phase === 'assemble' ? clamp(e.phaseT / 0.9, 0, 1)
      : 1;
    const wingX = 30 + (e.w * 0.38 - 30) * (1 - Math.pow(1 - up, 3));
    for (const sx of [-1, 1]) {
      ctx.fillStyle = '#23272e';
      ctx.strokeStyle = `hsla(${hue}, 45%, 55%, 0.7)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx * (wingX - 18), -8);
      ctx.lineTo(sx * (wingX + 16), -20);
      ctx.lineTo(sx * (wingX + 20), 8);
      ctx.lineTo(sx * (wingX - 14), 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 技能3蓄能：未打完的四个发射部位紫光高亮
    if (e.skill && e.skill.id === 2) {
      const pulse = 0.45 + Math.sin(state.time * 12) * 0.3;
      for (const p of e.skill.parts) {
        if (p.shots >= 3) continue;   // 已打完的部位熄灭
        const pg = ctx.createRadialGradient(p.dx, p.dy, 1, p.dx, p.dy, 16);
        pg.addColorStop(0, `rgba(220, 150, 255, ${pulse.toFixed(3)})`);
        pg.addColorStop(1, 'rgba(150, 60, 255, 0)');
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(p.dx, p.dy, 16, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 双炮管
    for (const sx of [-1, 1]) {
      const bx = sx * e.w * 0.22;
      ctx.fillStyle = '#2a2e35';
      ctx.strokeStyle = '#565d68';
      ctx.lineWidth = 1.2;
      ctx.fillRect(bx - 8, 34, 16, 30);
      ctx.strokeRect(bx - 8, 34, 16, 30);
      ctx.fillStyle = BOSS_BULLET.long;
      ctx.shadowColor = BOSS_BULLET.long;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(bx, 66, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 音核：脉冲核心 + 三圈声波涟漪（呼应“旧日之歌”）
    const coreR = 16 + Math.sin(state.time * 5) * 3;
    const cg = ctx.createRadialGradient(0, -6, 2, 0, -6, coreR);
    cg.addColorStop(0, '#eaffff');
    cg.addColorStop(0.5, `hsla(${hue}, 70%, 60%, 0.9)`);
    cg.addColorStop(1, 'rgba(10, 14, 24, 0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(0, -6, coreR, 0, Math.PI * 2);
    ctx.fill();
    for (let k = 0; k < 3; k++) {
      const ph = (state.time * 0.8 + k / 3) % 1;
      ctx.globalAlpha = (1 - ph) * 0.35;
      ctx.strokeStyle = `hsla(${(hue + k * 60) % 360}, 70%, 65%, 1)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -6, 18 + ph * 46, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // ---------- 组装阶段：飞行中的部件（世界坐标） ----------
    if (e.phase === 'assemble' && e.parts) {
      for (const pt of e.parts) {
        if (pt.attached) {
          // 已镶接：在机体上绘制装甲板高光闪烁（短暂）
          if (pt.flyT < 0.8) {
            const glow = 1 - (pt.flyT - 0.55) / 0.25;
            if (glow > 0) {
              ctx.save();
              ctx.globalAlpha = glow * 0.7;
              ctx.translate(e.x + pt.tx * e.scale, e.y + pt.ty * e.scale);
              ctx.fillStyle = '#c8b0ff';
              ctx.shadowColor = '#c8b0ff';
              ctx.shadowBlur = 12;
              ctx.beginPath();
              ctx.arc(0, 0, 8 * e.scale, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
          }
          continue;
        }
        if (e.phaseT < pt.delay) continue;   // 还没轮到
        // 绘制飞行中的部件：暗色装甲块 + 紫色尾焰
        const px = e.x + pt.x * e.scale;
        const py = e.y + pt.y * e.scale;
        ctx.save();
        ctx.translate(px, py);
        const flyAng = Math.atan2(pt.ty - pt.y, pt.tx - pt.x);
        ctx.rotate(flyAng);
        // 尾焰（朝后拖尾）
        const tGrd = ctx.createLinearGradient(-22, 0, 6, 0);
        tGrd.addColorStop(0, 'rgba(160, 80, 255, 0)');
        tGrd.addColorStop(1, 'rgba(200, 140, 255, 0.8)');
        ctx.fillStyle = tGrd;
        ctx.fillRect(-22, -3, 28, 6);
        // 装甲块本体
        ctx.fillStyle = '#2a2e35';
        ctx.strokeStyle = `hsla(${hue}, 50%, 60%, 0.8)`;
        ctx.lineWidth = 1.2;
        ctx.shadowColor = '#a060ff';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(3, -7);
        ctx.lineTo(-10, -5);
        ctx.lineTo(-10, 5);
        ctx.lineTo(3, 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }
  }

  // 警报横杠：半透明红 + 暗红平行四边形装饰 + 上下亮边
  function drawWarnBar(x, y, w, h, dir) {
    ctx.fillStyle = 'rgba(205, 20, 45, 0.42)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(115, 6, 26, 0.85)';
    const step = 34;
    for (let px = x + 8; px + 16 < x + w - 6; px += step) {
      const sk = 7 * dir;
      ctx.beginPath();
      ctx.moveTo(px + sk, y);
      ctx.lineTo(px + 14 + sk, y);
      ctx.lineTo(px + 14 - sk, y + h);
      ctx.lineTo(px - sk, y + h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255, 96, 118, 0.9)';
    ctx.fillRect(x, y - 2, w, 2);
    ctx.fillRect(x, y + h, w, 2);
  }

  // BOSS 警报演出：双横杠滑入 → 中间红色区域 + Lv 徽标 + BOSS 名（流动渐变艺术字）→ 淡出
  function drawBossWarning(t) {
    const { slide, hold, fade } = BOSS_WARN;
    const B = BOSSES[state.pendingBoss] || BOSSES.song;
    const alpha = t > slide + hold ? clamp(1 - (t - slide - hold) / fade, 0, 1) : 1;
    const ease = (p) => 1 - Math.pow(1 - clamp(p, 0, 1), 3);
    const pz = ease((t - slide) / 0.35);   // 红色区域淡入进度

    ctx.save();
    ctx.globalAlpha = alpha;

    // 左侧偏上横杠从左向右滑入；右侧偏下横杠从右向左滑入（均贯穿全屏）
    const bw = CANVAS_W, bh = 16;
    const p = ease(t / slide);
    drawWarnBar(-bw - 20 + (bw + 20) * p, 296, bw, bh, 1);
    drawWarnBar(CANVAS_W + 20 - (CANVAS_W + 20) * p, 384, bw, bh, -1);

    // 两杠到位：中间红色区域淡入（半透明 + 描边）
    if (pz > 0) {
      ctx.save();
      ctx.globalAlpha = alpha * pz * 0.30;
      ctx.fillStyle = '#e01030';
      ctx.fillRect(56, 288, 368, 128);
      ctx.globalAlpha = alpha * pz * 0.85;
      ctx.strokeStyle = 'rgba(255, 96, 118, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(56, 288, 368, 128);
      ctx.restore();
    }

    // 横杠左侧：Lv 徽标
    const pLv = clamp((t - slide * 0.55) / 0.3, 0, 1);
    if (pLv > 0) {
      ctx.globalAlpha = alpha * pLv;
      ctx.fillStyle = '#ff8a9a';
      ctx.shadowColor = '#ff4d6d';
      ctx.shadowBlur = 10;
      ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Lv.${B.lv}`, 104, 342);
      ctx.shadowBlur = 0;
    }

    // BOSS 名：逐字入场（旋转缩放+辉光衰减）→ 落定冲击波/白闪 → 流动渐变艺术字
    const nameStart = slide + 0.15, nameDur = 0.55;
    const pn = clamp((t - nameStart) / nameDur, 0, 1);
    if (pn > 0) {
      const chars = B.name.split('');
      const cw = 52;   // 每字步进
      const impact = clamp((t - nameStart - nameDur) / 0.4, 0, 1);   // 落定冲击进度
      const isStorm = state.pendingBoss === 'storm';   // 暴风之眼：专属配色与入场动画

      ctx.save();
      ctx.translate(CANVAS_W / 2, 358);
      ctx.font = '46px "华文行楷", "STXingkai", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 落定瞬间：旧日之歌 = 扩散光环 + 横向光刃；暴风之眼 = 多道横向罛风纹向两侧扫过
      if (impact > 0 && impact < 1) {
        if (isStorm) {
          for (let k = 0; k < 4; k++) {
            // 四道罛风纹：奇偶交替向两侧伸展，起点亮尾端透明，长度随冲击扩散
            const dir = k % 2 === 0 ? 1 : -1;
            const yy = [-16, -5, 6, 17][k];
            const len = (55 + impact * 170) * (0.75 + 0.25 * Math.sin(k * 2.4 + impact * 6));
            const wg = ctx.createLinearGradient(0, 0, dir * len, 0);
            wg.addColorStop(0, `rgba(214, 228, 252, ${(0.85 * (1 - impact)).toFixed(3)})`);
            wg.addColorStop(1, 'rgba(214, 228, 252, 0)');
            ctx.strokeStyle = wg;
            ctx.lineWidth = 2 - k * 0.3;
            ctx.beginPath();
            ctx.moveTo(dir * 12, yy);
            ctx.lineTo(dir * (12 + len), yy + (1 - impact) * Math.sin(k * 3.1) * 4);
            ctx.stroke();
          }
        } else {
          ctx.globalAlpha = alpha * (1 - impact) * 0.7;
          ctx.strokeStyle = '#c8b0ff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(0, 0, 46 + impact * 150, 26 + impact * 60, 0, 0, Math.PI * 2);
          ctx.stroke();
          const sw = 40 + impact * 220;
          const sg = ctx.createLinearGradient(-sw / 2, 0, sw / 2, 0);
          sg.addColorStop(0, 'rgba(180, 140, 255, 0)');
          sg.addColorStop(0.5, 'rgba(200, 180, 255, 0.9)');
          sg.addColorStop(1, 'rgba(180, 140, 255, 0)');
          ctx.globalAlpha = alpha * (1 - impact) * 0.9;
          ctx.fillStyle = sg;
          ctx.fillRect(-sw / 2, -1.5, sw, 3);
        }
      }

      // 逐字入场：旧日之歌 = 从上方旋转坠落；暴风之眼 = 被罛风横向卷入（左右交替漂入 + 风摆，无旋转）
      // 颜色主题：旧日之歌 灰→黑→深紫 流动；暴风之眼 灰→白→灰带蓝 流动
      for (let i = 0; i < chars.length; i++) {
        const ci = clamp((pn - i * 0.10) / 0.45, 0, 1);
        if (ci <= 0) continue;
        const eo = 1 - Math.pow(1 - ci, 3);
        ctx.save();
        if (isStorm) {
          // 横向罛风卷入：奇偶字从左右两侧漂向归位，伴随轻微风摆与缩放收拢
          const dir = i % 2 === 0 ? -1 : 1;
          const drift = (1 - eo) * dir * 92;
          const sway = Math.sin(state.time * 7 + i * 1.7) * (1 - eo) * 6;
          const scale = 1 + (1 - eo) * 0.35;
          ctx.translate((i - (chars.length - 1) / 2) * cw + drift, sway);
          ctx.scale(scale, scale);
        } else {
          const scale = 1 + (1 - eo) * 1.5;
          const rot = (1 - eo) * (i % 2 === 0 ? -0.45 : 0.45);
          ctx.translate((i - (chars.length - 1) / 2) * cw, (1 - eo) * -26);
          ctx.rotate(rot);
          ctx.scale(scale, scale);
        }
        ctx.globalAlpha = alpha * ci;
        // 流动相位：每字略有偏移，产生波浪感（暴风之眼流速更快，似罛风疾吹）
        const phase = state.time * (isStorm ? 2.6 : 1.8) + i * 0.6;
        // 渐变起点随时间左右移动，产生流动效果
        const flowX = Math.sin(phase) * cw * 0.7;
        let g;
        if (isStorm) {
          g = ctx.createLinearGradient(-cw / 2 + flowX, -30, cw / 2 + flowX, 30);
          g.addColorStop(0, '#8a93a3');    // 灰
          g.addColorStop(0.35, '#f7faff'); // 白
          g.addColorStop(0.65, '#93a8cc'); // 灰带蓝
          g.addColorStop(1, '#7d8aa5');    // 灰
        } else {
          g = ctx.createLinearGradient(-cw / 2 + flowX, -30, cw / 2 + flowX, 30);
          g.addColorStop(0, '#9898b4');     // 浅灰蓝
          g.addColorStop(0.3, '#3d1f6e');   // 深紫
          g.addColorStop(0.6, '#110d18');   // 近黑
          g.addColorStop(0.85, '#5a3080');  // 中紫
          g.addColorStop(1, '#808098');     // 灰
        }
        ctx.fillStyle = g;
        ctx.shadowColor = isStorm
          ? `rgba(150, 172, 214, ${0.7 + Math.sin(phase) * 0.2})`
          : `rgba(90, 40, 140, ${0.75 + Math.sin(phase) * 0.2})`;
        ctx.shadowBlur = 18 + (1 - eo) * 26;
        ctx.fillText(chars[i], 0, 0);
        ctx.restore();
      }

      // 落定白闪：整名短暂泛白后回归流动渐变（暴风之眼偏蓝白）
      if (impact > 0 && impact < 1) {
        ctx.globalAlpha = alpha * (1 - impact) * 0.85;
        ctx.fillStyle = isStorm ? '#e2ecfa' : '#ffffff';
        ctx.shadowColor = isStorm ? 'hsla(215, 55%, 55%, 1)' : 'hsla(275, 60%, 45%, 1)';
        ctx.shadowBlur = 22;
        ctx.fillText(B.name, 0, 0);
      }
      ctx.restore();
    }

    ctx.restore();
  }

