// 11-draw-boss：双 BOSS 视觉（暴风之眼区域标记/涡流/风暴/血条 + 旧日之歌黑洞/组装/血条）+ 警报演出 + 大型龙卷绘制

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：10-draw-world(5 名) 13-encyclopedia(1 名)
  // 本文件写共享状态（state/bossFlow/levelFlow 属性赋值；新增属性先在 02-core 归域声明）：
  //   state.{stormVortex}
  //
  import { BOSSES, BOSS_BULLET, BOSS_WARN, CANVAS_H, CANVAS_W, ENERGY_ORB, STORM, STORM2, STORM2_SHIP, energyOrbSheet, lightningImg, lightningImgAlt, lightningImgBig, lightningImgRing, lightningImgThin, stormEyeImg } from './01-config.js';
  import { bossFlow, clamp, ctx, enemies, pillarStrikes, rand, state, windFlows, zoneMarks } from './02-core.js';
  import { stormWaveBand, stormWavePoint, storm2BallPos, storm2Nozzle, S2_STRIKE_R } from './05-boss.js';


    // ---------- 暴风之眼：绘制（区域标记 / 风波 / 风柱 / 风暴本体 / 大型龙卷） ----------
  function drawZoneMarks() {
      // 白色区域标记：风波（竖向弯曲带）/ 风柱（垂直带）+ 白色风流特效
      // 风波标记随倒计时闪烁渐亮；风柱标记（全难度）不闪烁——整体亮度随倒计时单调攀升
      for (const z of zoneMarks) {
        const prog = clamp(z.t / z.dur, 0, 1);
        const pulse = clamp(0.5 + Math.sin(state.time * 14) * 0.22 + prog * 0.35, 0, 0.92);   // 越接近落下越亮
        ctx.save();
        ctx.globalAlpha = pulse;
        if (z.kind === 'wave') {
          // 风波标记（仿风柱预警风格）：柔和平弯风带 + 入射侧蓄能光楔（随倒计时向内压） +
          // 沿带入射方向涌动的风痕 + 入射侧蓄光，亮度随倒计时攀升
          const fromRight = z.dirX < 0;   // 入射侧：dirX=-1 → 从右向左
          const edgeX = fromRight ? CANVAS_W : 0;
          // ① 柔和平弯风带（同打击带形，透明度随进度上升）
          ctx.fillStyle = `rgba(223, 243, 255, ${(0.20 + prog * 0.20).toFixed(3)})`;
          stormWaveBand(z, STORM.waveHalfW);
          ctx.fill();
          // ② 入射侧蓄能光楔：亮区自入射边缘向内压进（裁剪在风波带内、随带弯曲），预示风自该侧灌入
          const wedgeW = CANVAS_W * (0.10 + prog * 0.32);
          const wedge = ctx.createLinearGradient(
            fromRight ? CANVAS_W : 0, 0,
            fromRight ? CANVAS_W - wedgeW : wedgeW, 0);
          wedge.addColorStop(0, `rgba(240, 251, 255, ${(0.55 + prog * 0.35).toFixed(3)})`);
          wedge.addColorStop(1, 'rgba(240, 251, 255, 0)');
          ctx.save();
          stormWaveBand(z, STORM.waveHalfW);
          ctx.clip();
          ctx.fillStyle = wedge;
          ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
          ctx.restore();
          // ③ 入射方向涌动的风痕：短亮线沿带从入射侧涌入，速度随进度加快
          ctx.lineCap = 'round';
          ctx.lineWidth = 1.6;
          for (let s = 0; s < 6; s++) {
            const head = (state.time * (0.55 + prog * 0.75) + s * 0.19) % 1;
            const bx = z.x0 + z.dirX * z.L * head;
            const p1 = stormWavePoint(z, bx);
            const p2 = stormWavePoint(z, bx + z.dirX * 18);
            ctx.strokeStyle = `rgba(255, 255, 255, ${(0.32 + prog * 0.45).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
          // ④ 入射侧蓄光：入射边缘光斑随倒计时渐亮（打击即将到来）
          const gl = ctx.createRadialGradient(edgeX, z.y0, 0, edgeX, z.y0, 140);
          gl.addColorStop(0, `rgba(240, 251, 255, ${(0.22 + prog * 0.45).toFixed(3)})`);
          gl.addColorStop(1, 'rgba(240, 251, 255, 0)');
          ctx.fillStyle = gl;
          ctx.fillRect(edgeX - 140, z.y0 - 140, 280, 280);
        } else {
          // 风柱标记（全难度）：预警不再闪烁——外层亮度随倒计时线性攀升，起始更暗（0.25）结尾更亮（0.95），
          // 叠加内部各层自身的渐亮，整体自暗向明单调变化
          ctx.globalAlpha = 0.25 + prog * 0.7;
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
      // 风波打击：横向弯曲风带整条瞬时显现——浓白实体填充 + 内核亮带 + 三条纵向流线，快速亮起后渐隐
      for (const f of windFlows) {
        const life = f.t / f.dur;
        const a = life < 0.18 ? life / 0.18 : 1 - (life - 0.18) / 0.82;   // 快速亮起 → 渐隐消散
        ctx.save();
        ctx.globalAlpha = clamp(a, 0, 1);
        // ① 风带主体：高不透明度风白填充，带青辉光
        ctx.fillStyle = 'rgba(223, 243, 255, 0.82)';
        ctx.shadowColor = '#bfe6ff';
        ctx.shadowBlur = 16;
        stormWaveBand(f, STORM.waveHalfW);
        ctx.fill();
        ctx.shadowBlur = 0;
        // ② 内核亮带：更窄的纯白核心（风波最实的中脊）
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        stormWaveBand(f, STORM.waveHalfW * 0.45);
        ctx.fill();
        // ③ 纵向流线：三条沿带走向的白色流线（风在带内奔涌）
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 1.6;
        for (const s of [-0.55, 0, 0.55]) {
          ctx.beginPath();
          for (let k = 0; k <= 16; k++) {
            const pt = stormWavePoint(f, f.x0 + f.dirX * f.L * (k / 16));
            k === 0 ? ctx.moveTo(pt.x, pt.y + s * STORM.waveHalfW) : ctx.lineTo(pt.x, pt.y + s * STORM.waveHalfW);
          }
          ctx.stroke();
        }
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
      if (!state.stormVortex) return;
      // 防残留兜底：技能6 中断（BOSS 被击坠/重试/状态切换）后 runStormSkill 不再推进，
      // 预警圈会永远留在原地——只要没有任何暴风之眼正在释放技能6，立即清除
      if (!enemies.some(en => en.type === 'boss' && en.bossId === 'storm' && en.skill && en.skill.id === 6)) {
        state.stormVortex = null;
        return;
      }
      const v = state.stormVortex;
      ctx.save();

      // 风旋本体绘制（飞行段 / 悬停段 / 消散段共用）：alphaMul × scaleMul 供飞行渐入过渡使用
      function drawVortexBody(alphaMul, scaleMul) {
        ctx.save();
        ctx.translate(v.x, v.y);
        let w = 1, scale = 1;
        if (v.phase === 'spin') w = 1 - (v.t / 5) * 0.15;
        else if (v.phase === 'fade') { const fp = clamp(v.t / 0.35, 0, 1); w = 0.85 * (1 - fp); scale = 1 - fp * 0.4; }
        w *= alphaMul; scale *= scaleMul;
        ctx.scale(scale, scale);
        const R = v.r;
        // 底盘：浓白风旋径向渐变（核心纯白）
        const bg = ctx.createRadialGradient(0, 0, R * 0.08, 0, 0, R);
        bg.addColorStop(0, `rgba(255, 255, 255, ${(1.0 * w).toFixed(3)})`);
        bg.addColorStop(0.55, `rgba(223, 243, 255, ${(0.65 * w).toFixed(3)})`);
        bg.addColorStop(1, 'rgba(223, 243, 255, 0)');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
        // 最外层强白光环：贴涡旋外缘的高亮风环（宽光带 + 亮环描边 + 两段旋转高亮弧），粗而略淡，强度随白量 w 衰减
        const rim = ctx.createRadialGradient(0, 0, R * 0.68, 0, 0, R * 1.22);
        rim.addColorStop(0, 'rgba(255, 255, 255, 0)');
        rim.addColorStop(0.55, `rgba(255, 255, 255, ${(0.34 * w).toFixed(3)})`);
        rim.addColorStop(0.80, `rgba(255, 255, 255, ${(0.68 * w).toFixed(3)})`);
        rim.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = rim;
        ctx.beginPath(); ctx.arc(0, 0, R * 1.22, 0, Math.PI * 2); ctx.fill();
        ctx.save();
        ctx.rotate(v.ang * 0.5);
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.72 * w).toFixed(3)})`;
        ctx.lineWidth = R * 0.16;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(0, 0, R * 0.99, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
        // 旋转高亮弧：随旋臂数分段（真我双臂相隔 180° / 诗篇三旋臂相隔 120°，与喷臂数一致）
        const rimArms = v.arms || 2;
        for (let a = 0; a < rimArms; a++) {
          const step = Math.PI * 2 / rimArms;
          ctx.strokeStyle = `rgba(255, 255, 255, ${(0.60 * w).toFixed(3)})`;
          ctx.lineWidth = R * 0.09;
          ctx.beginPath();
          ctx.arc(0, 0, R * 1.08, a * step + 0.25, a * step + step - 0.25);
          ctx.stroke();
        }
        ctx.restore();
        // 外缘漂浮白光：环绕涡旋最外侧的淡淡光效——极淡外层光晕 + 6 团柔光沿轨道绕行（呼吸明灭）
        const halo = ctx.createRadialGradient(0, 0, R * 1.10, 0, 0, R * 1.58);
        halo.addColorStop(0, `rgba(255, 255, 255, ${(0.10 * w).toFixed(3)})`);
        halo.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(0, 0, R * 1.58, 0, Math.PI * 2); ctx.fill();
        for (let k = 0; k < 6; k++) {
          const oa = v.ang * 0.8 + k * Math.PI / 3 + state.time * 0.35;
          const orad = R * (1.18 + 0.16 * Math.sin(state.time * 1.3 + k * 1.9));
          const ox = Math.cos(oa) * orad * 1.06, oy = Math.sin(oa) * orad * 0.92;   // 略扁轨道
          const orr = R * (0.10 + 0.035 * Math.sin(state.time * 2.2 + k * 2.4));
          const oa2 = Math.max(0, 0.15 + 0.09 * Math.sin(state.time * 1.7 + k * 1.3)) * w;
          const og = ctx.createRadialGradient(ox, oy, 0, ox, oy, orr);
          og.addColorStop(0, `rgba(255, 255, 255, ${oa2.toFixed(3)})`);
          og.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = og;
          ctx.beginPath(); ctx.arc(ox, oy, orr, 0, Math.PI * 2); ctx.fill();
        }
        // 2 条内卷旋臂（对称双臂，随发射角同步自转，与风条旋向一致）——粗而略淡
        ctx.rotate(v.ang);
        ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(1, 0.72 * w).toFixed(3)})`;
        ctx.lineWidth = R * 0.24;
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

      if (v.phase === 'warn' || v.phase === 'move') {
        // 落点预警：持续到风旋真正飞抵才消失（warn+move 共 1.9s）——
        // 落点微光渐亮 + 内卷汇聚风痕（风正在此汇聚，转速渐快）+ 旋转虚线落位环 + 快速收缩淡红圈；
        // move 后段（70%~100%）预警层整体渐淡，让位给飞抵的风旋本体（到达瞬间无硬切换）
        const mp = v.phase === 'move' ? clamp(v.t / 1.4, 0, 1) : 0;
        const telFade = 1 - 0.65 * clamp((mp - 0.7) / 0.3, 0, 1);
        const p = clamp((v.t + (v.phase === 'move' ? 0.5 : 0)) / 1.9, 0, 1);
        // 浮现渐入：预警前 0.5s 各层特效从 0 淡入（用累计时间，避免 warn→move 重置 v.t 时二次闪烁）
        const born = clamp((v.t + (v.phase === 'move' ? 0.5 : 0)) / 0.5, 0, 1);
        const R = v.r;
        ctx.save();
        ctx.translate(v.tx, v.ty);
        ctx.globalAlpha = telFade;   // ① 落点微光：整体淡出随 telFade（渐变本身含 born 渐入）
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
          ctx.globalAlpha = telFade * (0.50 + p * 0.48) * born;
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
        ctx.globalAlpha = telFade * (0.75 + p * 0.25) * born;
        ctx.setLineDash([9, 7]);
        ctx.lineDashOffset = -state.time * 26;
        ctx.strokeStyle = '#ff9f8a';
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.arc(0, 0, R * (1.5 - p * 0.35), 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        // ④ 快速收缩预警圈：淡红色圆环自大范围周期性急速收缩至落点（每 0.6s 一轮，收得越拢越亮越粗），
        //    与既有微光 / 风痕 / 虚线环叠加，强化“风旋即将在此成形”的紧迫感
        const cyc = ((v.t + (v.phase === 'move' ? 0.5 : 0)) % 0.6) / 0.6;   // 0→1 循环（累计时间，warn→move 不跳变）
        const scp = 1 - Math.pow(1 - cyc, 3);                               // easeOutCubic：起步极快、收尾略缓
        const shrinkR = R * (16 - 14.95 * scp);                             // 约 307px → 21px 收缩到落点半径
        ctx.globalAlpha = telFade * born * (0.15 + 0.42 * scp);
        ctx.strokeStyle = '#ff9f8a';
        ctx.lineWidth = 1.8 + 1.8 * scp;
        ctx.beginPath(); ctx.arc(0, 0, shrinkR, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        // 飞行中的风旋本体：自 BOSS 位置平滑飞向落点，尺寸 / 透明度随行程长大（到位即满，无突现）
        if (v.phase === 'move') {
          const ease = mp < 0.5 ? 4 * mp * mp * mp : 1 - Math.pow(-2 * mp + 2, 3) / 2;
          drawVortexBody(0.30 + 0.70 * mp, 0.35 + 0.65 * ease);
        }
        ctx.restore();
        return;
      }
      // 悬停喷射 / 快速消散：本体照常绘制
      drawVortexBody(1, 1);
    }
  
    // BOSS：暴风之眼（第一阶段）—— 白色龙卷风暴（俯视旋涡：多层旋臂 + 风暴眼），逆时针旋转
  function drawStormBoss(e) {
      // 顶部血条已移至函数末尾绘制（drawStormBar）→ 图层高于暴风之眼本体；图鉴预览 phase='preview' 跳过
  
      ctx.save();
      ctx.translate(e.x, e.y);
      // 死亡渐隐消逝（暴风之眼被击败后 0.8s）：整体变淡 + 缓慢收缩，风暴"散去"而非瞬间消失
      if (e.dying) {
        const dp = clamp(e.dying.t / e.dying.dur, 0, 1);
        ctx.globalAlpha = 1 - dp;
        ctx.scale(1 - 0.18 * dp, 1 - 0.18 * dp);
      }
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
            const ang = a0 + (e.windRot || 0) * 2 - q * 2.1;   // 逆时针螺旋（恒速自转，不随阶段加速）
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
            const hang = a0 + (e.windRot || 0) * 2 - raw * 2.1;
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
          const ang = seed + (e.windRot || 0) * 2.2 - cyc * 2.6;   // 边飞边逆时针螺旋偏转（恒速自转）
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
        // 双圈聚能光环：收缩速度放缓 30%（到达时间不变 → 初始半径由 1.9R 缩至 1.63R），整体更淡；
        // 随后的成形震荡波（白圈爆发）保持不变
        for (const cfg of [{ sp: 1.0, w: 4.5, blur: 16 }, { sp: 0.72, w: 2.5, blur: 9 }]) {
          const p = clamp(fp / cfg.sp, 0, 1);
          ctx.strokeStyle = `rgba(223, 243, 255, ${(0.42 * (1 - p)).toFixed(3)})`;
          ctx.lineWidth = cfg.w;
          ctx.shadowBlur = cfg.blur;
          ctx.beginPath();
          ctx.arc(0, 0, R * (1.63 - p * 0.63), 0, Math.PI * 2);
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
      if (e.phase === 'combat' && !e.dying) drawStormBar(e);
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
  function drawTornado(e, spinMul = 1) {
      ctx.save();
      ctx.translate(e.x, e.y);
      const R = e.w * 0.5;
      const rot = -state.time * 1.9 * spinMul;   // 逆时针（canvas 角度递减）；spinMul：友方大风暴 ×2
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
  
  // ---------- 风暴编织者（二阶段本体：雷电飞舰） ----------
  // 技能已实装（状态机见 05-boss runStorm2Skill，演出见 drawStorm2SkillFx）；
  //   入场动画（重制版）：暴风之眼轰然消散（冲击波环+白雾爆发）→ 雷电风暴轰鸣（中央落雷 + 电球序列帧凝聚）
  //   → 现身（电球汇入机体）（状态机见 05-boss updateBossStorm2 的 entrance 阶段）
  // 概念：操纵雷电的飞舰搅动宇宙能量卷起一阶段风暴；风暴血量归零轰然消散后，由此机体从中现身。
  // 造型（参考逆战「暴风之眼」陷阱的机械风）：X 形四臂 + 中央灰色装甲机体 + 中下方电弧能量球。
  // 四臂夹角：左上-右上 120° / 右上-右下 60° / 右下-左下 120° / 左下-左上 60°（上臂较短、下臂较长）；
  // 四臂末端为加宽的发射端头（蓝色辉光缝隙），臂干穿出机体处两侧带核心延伸连接件；
  // 机体凹槽内的电弧能量球整体颜色快速流动（白核→白蓝→亮蓝→深蓝 + 等离子斑块旋转），
  // 球面/球外电弧使用闪电素材图（assets/lightning-bolt.png，未加载回退程序化弧线），能量沿导管泵向四臂。
  function drawStormBossII(e) {
    const T = state.time;
    const ex = e.x || 0, ey = e.y || 0;

    ctx.save();
    ctx.translate(ex, ey);
    // 视觉尺寸与判定箱解耦：固有臂展 206 × 1.008 ≈ 208（约 43% 屏宽；基础 36% ×1.2 整体扩大）
    const S = 1.008;
    ctx.scale((e.scale || 1) * S, (e.scale || 1) * S);
    // 登场显形窗口：电球出现后不久（雷暴开始 0.3s 后）即开始渐显，贯穿雷暴段与现身段（长渐显）
    let bodyA = 1;
    if (e.phase === 'entrance' && !e.ency) {
      const ENP = STORM2.entrance;
      const gT = ENP.dissipate + 0.3, gEnd = ENP.dissipate + ENP.storm + ENP.reveal;
      const rT = (e.phaseT || 0) - gT;
      bodyA = rT <= 0 ? 0 : clamp(rT / (gEnd - gT), 0, 1);
    }
    if (bodyA < 1) ctx.globalAlpha = Math.max(0, bodyA);

    // ---- 几何常量（固有尺寸）----
    const BX = 0, BY = -4;                        // 机体中心
    const ARM_ANG = [-150, -30, 150, 30];         // 四臂朝向（度，屏幕坐标）：左上 / 右上 / 左下 / 右下
    //                                            （左上-右上、左下-右下夹角 120°；同侧上下臂夹角 60°）
    const ARM_LEN = [63, 63, 96, 96];             // 臂长（臂根 → 端头末端）：上短下长（上臂较下臂短 35%）
    const ROOT_R = 15;                            // 臂根嵌入机体的深度
    const HOOK_SIDE = [1, -1, 1, -1];             // 钩形尾镜像朝向：四个钩一律垂向屏幕下方（UL / UR / LL / LR）
    // 稳定伪随机：同一 seed 序列稳定（电弧按 1/12s 步进闪频，预览单帧亦自然）
    const seeded = (seed) => {
      let s = (seed * 9973 + 479) % 233280;
      return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    };

    // ---- (1) 四臂（垫在机体下层；轻微嗡振暗示搅动能量的蓄势）----
    for (let i = 0; i < 4; i++) {
      const ang = ARM_ANG[i] * Math.PI / 180;
      const sway = Math.sin(T * 1.2 + i * 1.9) * 0.028;
      const L = ARM_LEN[i];
      ctx.save();
      ctx.translate(BX + Math.cos(ang) * ROOT_R, BY + Math.sin(ang) * ROOT_R);
      ctx.rotate(ang - Math.PI / 2 + sway);   // 局部 +y = 臂伸出方向（含轻微嗡振）
      ctx.scale(HOOK_SIDE[i], 1);             // 镜像：使钩形尾一律垂向屏幕下方
      // 核心延伸连接件：臂干穿出机体处两侧的夹持板（核心能量延伸段，内缘能量亮线 + 连接节点）
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sd * 6.4, 12);
        ctx.lineTo(sd * 16, 16.5);
        ctx.lineTo(sd * 14, 28);
        ctx.lineTo(sd * 6.2, 25);
        ctx.closePath();
        const kg = ctx.createLinearGradient(sd * 6, 12, sd * 15, 28);
        kg.addColorStop(0, '#4d5876');
        kg.addColorStop(1, '#232c44');
        ctx.fillStyle = kg; ctx.fill();
        ctx.strokeStyle = '#1c2130'; ctx.lineWidth = 1; ctx.stroke();
        // 内缘能量亮线（球体能量延伸的辉光缝）
        ctx.strokeStyle = '#8fd4ff';
        ctx.shadowColor = '#6fb8ff'; ctx.shadowBlur = 6;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(sd * 7, 14);
        ctx.lineTo(sd * 13.6, 18);
        ctx.lineTo(sd * 11.8, 26);
        ctx.stroke();
        ctx.shadowBlur = 0;
        // 与臂身连接的能量节点
        ctx.fillStyle = '#cfeaff';
        ctx.beginPath(); ctx.arc(sd * 6.8, 18.5, 1.7, 0, Math.PI * 2); ctx.fill();
      }
      // ---- 臂干 + 钩形尾：一体成形轮廓（单路径填充描边，全程无合缝；尾部不额外增长，仅此一钩）----
      const ty0 = L * 0.70 + 6;                    // 尾根位置
      const arcL = L * 0.36;                       // 钩腹纵向跨度（占臂长 36%）
      const cxh = -6.6, cyh = L - arcL;            // 钩腹椭圆弧：圆心 / 半径
      const rxh = 30, ryh = arcL;
      const ag = ctx.createLinearGradient(-10.5, 0, 24, 0);
      ag.addColorStop(0, '#eef1f5');
      ag.addColorStop(0.14, '#b9bfc9');
      ag.addColorStop(0.42, '#6a6f7a');
      ag.addColorStop(0.75, '#454a53');
      ag.addColorStop(1, '#31353d');
      ctx.beginPath();
      ctx.moveTo(-8.2, -3);                        // 臂根背侧
      ctx.lineTo(8.2, -3);                         // 臂根腹侧
      ctx.lineTo(6.4, ty0);                        // 腹缘至尾根
      ctx.lineTo(6.6, L - arcL);                   // 腹缘直段
      ctx.lineTo(cxh + rxh, cyh);                  // 垂步至钩尖
      ctx.bezierCurveTo(                           // 钩腹弧线：钩尖 → 背缘远端（凸向钩侧）
        cxh + rxh, cyh + ryh * 0.5523,
        cxh + rxh * 0.5523, cyh + ryh,
        cxh, cyh + ryh
      );
      ctx.lineTo(-6.4, ty0);                       // 背缘回根
      ctx.closePath();
      ctx.fillStyle = ag; ctx.fill();
      ctx.strokeStyle = '#262a33'; ctx.lineWidth = 1;
      ctx.stroke();
      // 臂内能量细线（基底常亮 + 流动亮段：能量自机体泵向尾部）
      ctx.strokeStyle = 'rgba(130,200,255,0.38)'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, ty0); ctx.stroke();
      ctx.strokeStyle = 'rgba(190,230,255,0.7)';
      ctx.setLineDash([2.5, 8]);
      ctx.lineDashOffset = -T * 26;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, ty0); ctx.stroke();
      ctx.setLineDash([]);
      // 背缘能量描边（蓝色辉光沿臂背直贯钩尖，随嗡振错相呼吸——轮廓发光）
      ctx.strokeStyle = `rgba(140, 200, 255, ${(0.42 + 0.2 * Math.sin(T * 5 + i * 1.3)).toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.shadowColor = '#6fb8ff'; ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.moveTo(-7.6, -2.2);
      ctx.lineTo(-6.4, ty0);
      ctx.lineTo(-6.6, L);
      ctx.stroke();
      ctx.shadowBlur = 0;
      // 受光棱线（沿腹缘的细亮边，金属切削质感）
      ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(6.8, -1.5); ctx.lineTo(5.2, ty0); ctx.stroke();
      // 能量槽：臂干中段的蓝色辉光嵌槽（与尾部光圈呼应，随嗡振错相明灭）
      const esA = 0.55 + 0.35 * Math.sin(T * 6 + i * 1.7);
      ctx.fillStyle = `rgba(143, 212, 255, ${esA.toFixed(3)})`;
      ctx.shadowColor = '#6fb8ff'; ctx.shadowBlur = 5;
      ctx.fillRect(-1.6, L * 0.44, 3.2, 7);
      ctx.shadowBlur = 0;
      // 蓝色光圈：闪电发射口（钩腹中部偏下，蓄能脉动；后续技能由此喷出雷电）
      const ringP = 0.75 + 0.25 * Math.sin(T * 6.5 + i * 2.1);
      const rgX = 12.5, rgY = L - arcL * 0.40;
      ctx.fillStyle = 'rgba(10, 25, 60, 0.85)';
      ctx.beginPath(); ctx.arc(rgX, rgY, 3.4, 0, Math.PI * 2); ctx.fill();
      const rg = ctx.createRadialGradient(rgX, rgY, 0.5, rgX, rgY, 2.8);
      rg.addColorStop(0, `rgba(235, 249, 255, ${(0.95 * ringP).toFixed(3)})`);
      rg.addColorStop(0.6, `rgba(120, 195, 255, ${(0.7 * ringP).toFixed(3)})`);
      rg.addColorStop(1, 'rgba(60, 120, 255, 0.12)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(rgX, rgY, 2.8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(160, 220, 255, ${(0.9 * ringP).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.shadowColor = '#6fb8ff'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(rgX, rgY, 3.4, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
      // 电弧反光：钩腹弧线泛光 + 弧线后方一段金属的蓝白反光（随电弧噼啪闪动）
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const arcGl = 0.5 + 0.3 * Math.sin(T * 11 + i * 2.4) + 0.15 * Math.sin(T * 27 + i);
      ctx.strokeStyle = `rgba(205, 235, 255, ${(0.55 * arcGl).toFixed(3)})`;
      ctx.lineWidth = 1.8;
      ctx.shadowColor = '#8fd4ff'; ctx.shadowBlur = 7;
      ctx.beginPath();
      ctx.moveTo(6.6, L - arcL);
      ctx.bezierCurveTo(
        cxh + rxh, cyh + ryh * 0.5523,
        cxh + rxh * 0.5523, cyh + ryh,
        cxh, cyh + ryh
      );
      ctx.stroke();
      // 弧线后方区域的反光 wash（裁剪到钩形尾，自弧线向臂根衰减）
      ctx.beginPath();
      ctx.moveTo(6.4, ty0);
      ctx.lineTo(6.6, L - arcL);
      ctx.lineTo(cxh + rxh, cyh);
      ctx.bezierCurveTo(cxh + rxh, cyh + ryh * 0.5523, cxh + rxh * 0.5523, cyh + ryh, cxh, cyh + ryh);
      ctx.lineTo(-6.4, ty0);
      ctx.closePath();
      ctx.clip();
      const refl = 0.75 + 0.25 * Math.sin(T * 9 + i * 2.4);
      const rgf = ctx.createLinearGradient(23, 0, -7, 0);
      rgf.addColorStop(0, `rgba(170, 215, 255, ${(0.32 * refl).toFixed(3)})`);
      rgf.addColorStop(0.5, `rgba(150, 200, 255, ${(0.13 * refl).toFixed(3)})`);
      rgf.addColorStop(1, 'rgba(150, 200, 255, 0)');
      ctx.fillStyle = rgf;
      ctx.fillRect(-8, cyh - 2, 34, arcL + 4);
      ctx.restore();
      ctx.restore();
    }

    // ---- (2) 中央机体：拉丝金属装甲椭圆（高对比切面 + 曲率明暗弧 + 左上高光）----
    ctx.save();
    ctx.translate(BX, BY);
    const bg = ctx.createLinearGradient(0, -30, 0, 24);
    bg.addColorStop(0, '#eef2f7');
    bg.addColorStop(0.22, '#c2c8d2');
    bg.addColorStop(0.48, '#878d99');
    bg.addColorStop(0.72, '#4a505c');
    bg.addColorStop(1, '#292d36');
    ctx.beginPath();
    ctx.ellipse(0, 0, 34, 25, 0, 0, Math.PI * 2);
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = '#23262e'; ctx.lineWidth = 1.2; ctx.stroke();
    // 拉丝金属：随曲率的细明暗弧 + 左上受光高光晕（裁剪到舰体）
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, 34, 25, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.ellipse(0, -1, 30, 21.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.beginPath(); ctx.ellipse(0, 1, 31.5, 23, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.beginPath(); ctx.ellipse(0, 2.5, 29, 20, 0, 0, Math.PI * 2); ctx.stroke();
    const spec = ctx.createRadialGradient(-12, -13, 1, -12, -13, 22);
    spec.addColorStop(0, 'rgba(255, 255, 255, 0.30)');
    spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = spec;
    ctx.fillRect(-34, -25, 68, 50);
    ctx.restore();
    // 内圈装甲缝线
    ctx.strokeStyle = 'rgba(35,38,46,0.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, -2, 27, 19, 0, 0, Math.PI * 2); ctx.stroke();
    // 上部舷窗带（低平嵌入舱带，取代旧装甲凸块）：沿舰体曲率的暗色舱带 + 三枚蓝色指示灯
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, 34, 25, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(14, 18, 28, 0.8)';
    ctx.fillRect(-22, -20.5, 44, 7.5);
    ctx.restore();
    ctx.strokeStyle = 'rgba(96, 104, 122, 0.85)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-18.6, -20.5); ctx.lineTo(18.6, -20.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-20, -13); ctx.lineTo(20, -13); ctx.stroke();
    for (let sx = -1; sx <= 1; sx++) {
      ctx.fillStyle = `rgba(143, 212, 255, ${(0.5 + 0.4 * Math.sin(T * 5 + sx * 1.8)).toFixed(3)})`;
      ctx.shadowColor = '#6fb8ff'; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.arc(sx * 8, -17, 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    // 侧向闪电纹章（左右对称一对）：上端白色、电弧色快速流动
    for (const sx of [-1, 1]) {
      const flick = 0.75 + 0.25 * Math.sin(T * 17 + sx * 2.2);
      const lg = ctx.createLinearGradient(0, -12, 0, 12);
      lg.addColorStop(0, `rgba(255, 255, 255, ${(0.95 * flick).toFixed(3)})`);
      lg.addColorStop(0.35, `hsla(${(200 + 30 * Math.sin(T * 8)).toFixed(0)}, 100%, 78%, ${(0.9 * flick).toFixed(3)})`);
      lg.addColorStop(0.7, `hsla(${(222 + 30 * Math.sin(T * 8 + 2.1)).toFixed(0)}, 100%, 62%, ${(0.9 * flick).toFixed(3)})`);
      lg.addColorStop(1, `hsla(${(248 + 26 * Math.sin(T * 8 + 4.2)).toFixed(0)}, 95%, 55%, ${(0.85 * flick).toFixed(3)})`);
      ctx.save();
      ctx.translate(sx * 21, -4);
      ctx.scale(sx, 1);
      ctx.fillStyle = lg;
      ctx.shadowColor = '#8fd4ff'; ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(2.4, -11);
      ctx.lineTo(-3.6, -0.5);
      ctx.lineTo(-0.5, -0.2);
      ctx.lineTo(-3.0, 11);
      ctx.lineTo(3.6, 1.2);
      ctx.lineTo(0.4, 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    // 环体铆钉
    ctx.fillStyle = 'rgba(28,31,38,0.8)';
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.31;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 30.5, Math.sin(a) * 21.5, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ---- (2b) 连接件头部连线："┌||┐" 式方括号能量线——同侧相邻臂对（右：UR-LR / 左：UL-LL）----
    // 自内侧夹持板头部沿臂法向引出短埠，再以直线相连，方正地环抱臂间开口（不再对角交叉）
    const armSway = (i) => Math.sin(T * 1.2 + i * 1.9) * 0.028;
    const headW = (i, sd) => {
      const ang = ARM_ANG[i] * Math.PI / 180 + armSway(i);
      const th = ang - Math.PI / 2;
      const px = sd * 14.5 * Math.cos(th) - 26.5 * Math.sin(th);   // 夹持板头部（局部坐标）
      const py = sd * 14.5 * Math.sin(th) + 26.5 * Math.cos(th);
      return [BX + Math.cos(ang) * ROOT_R + px, BY + Math.sin(ang) * ROOT_R + py];
    };
    const ARM_INNER = [1, -1, 1, -1];   // 各臂内侧夹持板（朝臂间开口的一侧）：UL / UR / LR / LL
    for (const [i0, i1] of [[1, 2], [0, 3]]) {
      const s0 = ARM_INNER[i0], s1 = ARM_INNER[i1];
      const [ax, ay] = headW(i0, s0);
      const [bx2, by2] = headW(i1, s1);
      const th0 = ARM_ANG[i0] * Math.PI / 180 + armSway(i0) - Math.PI / 2;
      const th1 = ARM_ANG[i1] * Math.PI / 180 + armSway(i1) - Math.PI / 2;
      const p1x = ax + Math.cos(th0) * s0 * 5, p1y = ay + Math.sin(th0) * s0 * 5;   // 臂法向短埠
      const p2x = bx2 + Math.cos(th1) * s1 * 5, p2y = by2 + Math.sin(th1) * s1 * 5;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(p1x, p1y);
      ctx.lineTo(p2x, p2y);
      ctx.lineTo(bx2, by2);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(90, 160, 255, 0.5)';
      ctx.lineWidth = 2.4;
      ctx.shadowColor = '#4d9fff'; ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(220, 244, 255, 0.75)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      // 流动亮段（能量沿方括号回路环流）
      ctx.strokeStyle = 'rgba(190, 232, 255, 0.8)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 14]);
      ctx.lineDashOffset = -T * 34;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
      // 白色流光涌动：两道白热流光沿方括号回路奔行（蓝晕衬底 + 白热内芯，行进中明灭闪动）
      const segs = [[ax, ay, p1x, p1y], [p1x, p1y, p2x, p2y], [p2x, p2y, bx2, by2]];
      const segLen = segs.map(sg2 => Math.hypot(sg2[2] - sg2[0], sg2[3] - sg2[1]));
      const total = segLen[0] + segLen[1] + segLen[2];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (let pl2 = 0; pl2 < 2; pl2++) {
        const dist = (T * 130 + pl2 * total / 2) % total;
        let acc = 0, pt = null, dir = [1, 0];
        for (let si = 0; si < 3; si++) {
          if (dist <= acc + segLen[si]) {
            const tt = (dist - acc) / (segLen[si] || 1);
            pt = [segs[si][0] + (segs[si][2] - segs[si][0]) * tt, segs[si][1] + (segs[si][3] - segs[si][1]) * tt];
            const sl = segLen[si] || 1;
            dir = [(segs[si][2] - segs[si][0]) / sl, (segs[si][3] - segs[si][1]) / sl];
            break;
          }
          acc += segLen[si];
        }
        if (!pt) continue;
        const flick2 = 0.6 + 0.4 * Math.sin(T * 21 + pl2 * 3.1);
        const half = 6;
        // 蓝晕衬底
        ctx.strokeStyle = `rgba(120, 190, 255, ${(0.5 * flick2).toFixed(3)})`;
        ctx.lineWidth = 4.2;
        ctx.shadowColor = '#6fb8ff'; ctx.shadowBlur = 9;
        ctx.beginPath();
        ctx.moveTo(pt[0] - dir[0] * half, pt[1] - dir[1] * half);
        ctx.lineTo(pt[0] + dir[0] * half, pt[1] + dir[1] * half);
        ctx.stroke();
        // 白热流光
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.85 * flick2).toFixed(3)})`;
        ctx.lineWidth = 1.7;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    }

    // ---- (3) 能量球凹槽 + 导管（核心无明确边界：不设卡环，凹槽隐于球体之下）----
    const RX = 0, RY = 3;
    // 导管：核心 → 四臂根部（能量泵送路径；基底 + 流动亮段）
    for (let i = 0; i < 4; i++) {
      const ang = ARM_ANG[i] * Math.PI / 180;
      const sx0 = RX + Math.cos(ang) * 12, sy0 = RY + Math.sin(ang) * 12;
      const ex2 = BX + Math.cos(ang) * 32, ey2 = BY + Math.sin(ang) * 23;
      const cx2 = BX + Math.cos(ang) * 27, cy2 = BY + Math.sin(ang) * 13;
      ctx.strokeStyle = 'rgba(130,200,255,0.45)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx0, sy0);
      ctx.quadraticCurveTo(cx2, cy2, ex2, ey2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(195,235,255,0.7)';
      ctx.setLineDash([2.5, 8]);
      ctx.lineDashOffset = -T * 26;
      ctx.beginPath();
      ctx.moveTo(sx0, sy0);
      ctx.quadraticCurveTo(cx2, cy2, ex2, ey2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // 凹槽（深暗底：完全隐于能量球不透明内芯之下，不构成可见边界）
    const rec = ctx.createRadialGradient(RX, RY, 2, RX, RY, 13);
    rec.addColorStop(0, '#0d1526');
    rec.addColorStop(1, '#04060c');
    ctx.beginPath(); ctx.arc(RX, RY, 13, 0, Math.PI * 2);
    ctx.fillStyle = rec; ctx.fill();

    // ---- (4) 电弧能量球（无明确边界：整体渐隐；中心深邃暗蓝、多色混合快速流动、外缘渐亮渐隐）----
    const pulse = 1 + 0.045 * Math.sin(T * 5.2);
    const R0 = 15 * pulse;
    // 外辉光（色相高频流动）
    const gh = 205 + 22 * Math.sin(T * 7.5);
    const gg = ctx.createRadialGradient(RX, RY, R0 * 0.4, RX, RY, R0 * 2.3);
    gg.addColorStop(0, `hsla(${gh.toFixed(0)}, 100%, 70%, ${(0.30 + 0.08 * Math.sin(T * 7.5)).toFixed(3)})`);
    gg.addColorStop(1, 'rgba(120,190,255,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(RX, RY, R0 * 2.3, 0, Math.PI * 2); ctx.fill();
    // 球体：中心灰黑深邃（较外侧臂体更暗、低饱和），多色相错相快速变化，向外渐亮并无线性边界渐隐
    const t8 = T * 7.5;
    const sg = ctx.createRadialGradient(RX, RY, 0, RX, RY, R0 * 1.25);
    sg.addColorStop(0.00, `hsla(${(242 + 18 * Math.sin(t8 + 2.4)).toFixed(0)}, 42%, 9%, 0.97)`);    // 中心：灰黑深邃
    sg.addColorStop(0.28, `hsla(${(236 + 20 * Math.sin(t8 + 1.2)).toFixed(0)}, 55%, 17%, 0.94)`);   // 内层：暗蓝灰
    sg.addColorStop(0.55, `hsla(${(218 + 24 * Math.sin(t8)).toFixed(0)}, 80%, 40%, 0.85)`);         // 中层：蓝
    sg.addColorStop(0.74, `hsla(${(198 + 24 * Math.sin(t8 - 1.5)).toFixed(0)}, 95%, 60%, 0.5)`);    // 外层：淡青
    sg.addColorStop(0.90, `hsla(${(205 + 20 * Math.sin(t8 - 2.8)).toFixed(0)}, 100%, 78%, 0.25)`);  // 淡白蓝
    sg.addColorStop(1.00, 'rgba(160, 210, 255, 0)');                                                // 无边界渐隐
    ctx.beginPath(); ctx.arc(RX, RY, R0 * 1.25, 0, Math.PI * 2);
    ctx.fillStyle = sg; ctx.fill();
    // 表面等离子斑块：白闪 / 较透明青 / 半透明蓝紫三色系快速环绕流动（裁剪到球体范围）
    ctx.save();
    ctx.beginPath(); ctx.arc(RX, RY, R0 * 1.15, 0, Math.PI * 2); ctx.clip();
    const blotCols = [
      (k) => `rgba(236, 248, 255, ${(0.26 + 0.18 * Math.sin(T * 9 + k * 2)).toFixed(3)})`,   // 白闪（少量）
      () => 'rgba(150, 235, 255, 0.22)',   // 较透明的青
      () => 'rgba(172, 190, 255, 0.20)',   // 较透明的蓝紫
    ];
    for (let k = 0; k < 6; k++) {
      const a = T * (2.2 + k * 0.7) * (k % 2 ? -1 : 1) + k * 2.1;
      const bx = RX + Math.cos(a) * R0 * 0.55;
      const by = RY + Math.sin(a * 1.27 + k) * R0 * 0.5;
      const br = R0 * (0.42 + 0.15 * Math.sin(T * 6.5 + k * 1.7));
      const bg2 = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      bg2.addColorStop(0, blotCols[k % 3](k));
      bg2.addColorStop(0.55, 'rgba(168, 216, 255, 0.12)');
      bg2.addColorStop(1, 'rgba(168, 216, 255, 0)');
      ctx.fillStyle = bg2;
      ctx.fillRect(RX - R0 * 1.2, RY - R0 * 1.2, R0 * 2.4, R0 * 2.4);
    }
    // 淡白蓝光晕层（半透明覆盖：高频涌动的淡白蓝光）
    const pl = ctx.createRadialGradient(RX - R0 * 0.2, RY - R0 * 0.3, 0, RX, RY, R0 * 1.05);
    pl.addColorStop(0, `rgba(232, 247, 255, ${(0.20 + 0.14 * Math.sin(T * 8.5)).toFixed(3)})`);
    pl.addColorStop(1, 'rgba(232, 247, 255, 0)');
    ctx.fillStyle = pl;
    ctx.fillRect(RX - R0 * 1.2, RY - R0 * 1.2, R0 * 2.4, R0 * 2.4);
    // 边缘白色能量涌动：环缘白光带 + 沿缘巡游的白色亮斑（边缘发白、能量沿缘奔流）
    const rimR = R0 * 0.95;
    const rimA = 0.15 + 0.10 * Math.sin(T * 6.3);
    const ring = ctx.createRadialGradient(RX, RY, rimR * 0.7, RX, RY, rimR * 1.3);
    ring.addColorStop(0, 'rgba(240, 250, 255, 0)');
    ring.addColorStop(0.55, `rgba(240, 250, 255, ${rimA.toFixed(3)})`);
    ring.addColorStop(1, 'rgba(240, 250, 255, 0)');
    ctx.fillStyle = ring;
    ctx.fillRect(RX - R0 * 1.2, RY - R0 * 1.2, R0 * 2.4, R0 * 2.4);
    for (let k = 0; k < 4; k++) {
      const a = T * (1.9 + k * 0.5) * (k % 2 ? -1 : 1) + k * 1.7;
      const wx = RX + Math.cos(a) * rimR, wy = RY + Math.sin(a) * rimR;
      const wr = R0 * (0.34 + 0.10 * Math.sin(T * 7 + k * 2.3));
      const wa = 0.30 + 0.22 * Math.sin(T * 8.5 + k * 2.6);
      const wg = ctx.createRadialGradient(wx, wy, 0, wx, wy, wr);
      wg.addColorStop(0, `rgba(248, 252, 255, ${wa.toFixed(3)})`);
      wg.addColorStop(1, 'rgba(248, 252, 255, 0)');
      ctx.fillStyle = wg;
      ctx.fillRect(wx - wr, wy - wr, wr * 2, wr * 2);
    }
    ctx.restore();
    // 球体无明确边界：不画球缘亮环，外层渐隐即边界
    // 球面电弧（闪电素材：主电弧 / 备用电弧按步进交替，随机朝向快速闪动；素材未加载回退程序化弧线）
    const boltStep = Math.floor(T * 9);
    if (lightningImg) {
      const aspA = (lightningImg.naturalWidth / lightningImg.naturalHeight) || 0.125;
      const aspB = lightningImgAlt ? ((lightningImgAlt.naturalWidth / lightningImgAlt.naturalHeight) || 0.375) : 0.375;
      const rndA = seeded(boltStep * 31 + 7);
      for (let k = 0; k < 2; k++) {
        const useAlt = lightningImgAlt && rndA() < 0.4;
        const im = useAlt ? lightningImgAlt : lightningImg;
        const asp = useAlt ? aspB : aspA;
        const tilt = rndA() * Math.PI;
        const flip = rndA() < 0.5 ? 1 : -1;
        const len = R0 * (2.05 + rndA() * 0.5);
        const w2 = len * asp * 1.5;
        ctx.save();
        ctx.translate(RX, RY);
        ctx.rotate(tilt);
        ctx.scale(1, flip);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = bodyA * (0.45 + 0.5 * rndA());
        ctx.drawImage(im, -w2 / 2, -len / 2, w2, len);
        ctx.restore();
      }
      // 球外放电：一道自球缘向外劈出的闪电（球周光效）
      const rndC = seeded(boltStep * 17 + 3);
      const oa = rndC() * Math.PI * 2;
      const olen = R0 * (1.5 + rndC() * 0.8);
      ctx.save();
      ctx.translate(RX + Math.cos(oa) * R0 * 0.95, RY + Math.sin(oa) * R0 * 0.95);
      ctx.rotate(oa - Math.PI / 2);   // 素材为竖向闪电 → 旋转对准放电方向
      ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = bodyA * (0.5 + 0.4 * rndC());
      ctx.drawImage(lightningImg, -olen * aspA * 0.7, 0, olen * aspA * 1.4, olen);
      ctx.restore();
    } else {
      // 回退：2 条程序化球面弧
      const rndA = seeded(Math.floor(T * 7) + 3);
      for (let k = 0; k < 2; k++) {
        const tilt = rndA() * Math.PI * 2;
        const span = 0.9 + rndA() * 0.7;
        ctx.strokeStyle = `rgba(190,235,255,${(0.4 + 0.3 * rndA()).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#9fd8ff'; ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.ellipse(RX, RY, R0 * 1.12, R0 * 1.12, tilt, 0, span);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
    // 球内闪电（1/12s 步进闪频的锯齿电弧；蓝晕宽线 + 白热内芯双层描线，参考电弧图配色）
    const rndB = seeded(Math.floor(T * 12) + 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let k = 0; k < 3; k++) {
      let a = rndB() * Math.PI * 2;
      let px = RX + Math.cos(a) * R0 * 0.15, py = RY + Math.sin(a) * R0 * 0.15;
      const pts2 = [[px, py]];
      for (let seg = 1; seg <= 4; seg++) {
        const rr = R0 * (0.15 + (seg / 4) * 0.77);
        a += (rndB() - 0.5) * 1.1;
        px = RX + Math.cos(a) * rr;
        py = RY + Math.sin(a) * rr;
        pts2.push([px, py]);
      }
      const ba = 0.45 + 0.5 * rndB();
      // 蓝晕宽线
      ctx.strokeStyle = `rgba(90, 160, 255, ${(0.7 * ba).toFixed(3)})`;
      ctx.lineWidth = 3.2;
      ctx.shadowColor = '#4d9fff'; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(pts2[0][0], pts2[0][1]);
      for (let i2 = 1; i2 < pts2.length; i2++) ctx.lineTo(pts2[i2][0], pts2[i2][1]);
      ctx.stroke();
      // 白热内芯
      ctx.strokeStyle = `rgba(255, 255, 255, ${ba.toFixed(3)})`;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    // 球周光效：3 团环绕柔光（错相明灭）+ 5 颗环绕火花
    for (let k = 0; k < 3; k++) {
      const a = T * 1.4 + k * 2.094;
      const gx = RX + Math.cos(a) * R0 * 1.55, gy = RY + Math.sin(a) * R0 * 1.55;
      const gal = 0.22 + 0.16 * Math.sin(T * 5 + k * 2.4);
      const gg3 = ctx.createRadialGradient(gx, gy, 0, gx, gy, R0 * 0.55);
      gg3.addColorStop(0, `rgba(190, 230, 255, ${gal.toFixed(3)})`);
      gg3.addColorStop(1, 'rgba(190, 230, 255, 0)');
      ctx.fillStyle = gg3;
      ctx.beginPath(); ctx.arc(gx, gy, R0 * 0.55, 0, Math.PI * 2); ctx.fill();
    }
    for (let k = 0; k < 5; k++) {
      const a = T * 2.4 + k * 2.399963;
      const rr = R0 * 1.5 + Math.sin(T * 3 + k * 1.7) * 2;
      const al = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(T * 6 + k * 2.1));
      ctx.fillStyle = `rgba(200,235,255,${al.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(RX + Math.cos(a) * rr, RY + Math.sin(a) * rr * 0.9, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // 旋转能量弧环：两道反向环绕的倾斜辉光弧——自转 + 轴向进动 + 倾角开合 + 上下起伏（立体轨道，非平面旋转）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 2; k++) {
      const dir = k ? -1 : 1;
      const spin = T * (3.4 + k * 1.5) * dir;                              // 环绕自转（高速）
      const tilt = 0.9 + 0.55 * Math.sin(T * (1.6 + k * 0.5) + k * 2.1);   // 倾角振荡：环面开合翻转（立体感核心）
      const precess = Math.sin(T * (1.1 + k * 0.4) + k) * 0.9;             // 轴向进动：椭圆方位摆动
      const rx = R0 * (1.42 + 0.12 * Math.sin(T * 1.9 + k * 1.4));         // 半长轴微缩放（呼吸）
      const ry = rx * (0.16 + 0.5 * Math.abs(Math.sin(tilt)));             // 半短轴随倾角开合
      const bob = Math.sin(T * (2.1 + k * 0.7) + k * 1.3) * 2.5;           // 环面上下起伏（视差）
      const rot = spin * 0.55 + precess;                                   // 椭圆方位角（转速直接驱动旋转）
      const col = 0.34 + 0.16 * Math.sin(T * 7 + k * 2);
      // 远半环（暗、细）：背侧被核心遮挡感
      ctx.strokeStyle = `rgba(130, 190, 255, ${(col * 0.45).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(RX, RY + bob, rx, ry, rot, Math.PI, Math.PI * 2);
      ctx.stroke();
      // 近半环（亮、粗）：朝向玩家的一侧
      ctx.strokeStyle = `rgba(160, 215, 255, ${col.toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.shadowColor = '#6fb8ff'; ctx.shadowBlur = 7;
      ctx.beginPath();
      ctx.ellipse(RX, RY + bob, rx, ry, rot, 0, Math.PI);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();

    // ---- (5) 周身闪电风暴：贴身风暴辉光 + 机体轮廓随机位置间噼啪作响的小闪电 ----
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 辉光按椭圆等比渐隐（多段平滑衰减 + 短轴等比缩放，杜绝填充边缘的硬边界）
    const auraA = 0.09 + 0.045 * Math.sin(T * 9) + 0.03 * Math.sin(T * 23);
    ctx.save();
    ctx.translate(0, -4);
    ctx.scale(1, 0.705);   // 86 / 122
    const aura = ctx.createRadialGradient(0, 0, 12, 0, 0, 122);
    aura.addColorStop(0.00, `rgba(140, 200, 255, ${auraA.toFixed(3)})`);
    aura.addColorStop(0.45, `rgba(140, 200, 255, ${(auraA * 0.52).toFixed(3)})`);
    aura.addColorStop(0.75, `rgba(140, 200, 255, ${(auraA * 0.2).toFixed(3)})`);
    aura.addColorStop(1.00, 'rgba(140, 200, 255, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(0, 0, 122, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 小闪电：7Hz 重排随机起止点（机体边缘 / 臂身），细弧素材贴附或程序化锯齿
    const stStep = Math.floor(T * 7);
    const rndS = seeded(stStep * 53 + 11);
    const anchor = () => {
      if (rndS() < 0.4) {
        const a = rndS() * Math.PI * 2;
        return [BX + Math.cos(a) * 32, BY + Math.sin(a) * 23];
      }
      const i = Math.floor(rndS() * 4) % 4;
      const ang = ARM_ANG[i] * Math.PI / 180 + armSway(i);
      const t = 15 + rndS() * (ARM_LEN[i] * 0.8);
      return [BX + Math.cos(ang) * t, BY + Math.sin(ang) * t];
    };
    for (let k = 0; k < 3; k++) {
      const [x1, y1] = anchor();
      const [x2, y2] = anchor();
      const d = Math.hypot(x2 - x1, y2 - y1);
      if (d < 16 || d > 130) continue;
      const useThin = lightningImgThin && (rndS() < 0.6 || !lightningImg);
      const im = useThin ? lightningImgThin : lightningImg;
      if (im) {
        const asp = (im.naturalWidth / im.naturalHeight) || 0.135;
        ctx.save();
        ctx.translate((x1 + x2) / 2, (y1 + y2) / 2);
        ctx.rotate(Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = bodyA * (0.4 + 0.45 * rndS());
        ctx.drawImage(im, -d * asp * 0.65, -d * 0.58, d * asp * 1.3, d * 1.16);
        ctx.restore();
      } else {
        ctx.strokeStyle = `rgba(150, 205, 255, ${(0.35 + 0.4 * rndS()).toFixed(3)})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        let px = x1, py = y1;
        for (let s2 = 1; s2 <= 5; s2++) {
          const tt = s2 / 5;
          px = x1 + (x2 - x1) * tt + (rndS() - 0.5) * 12;
          py = y1 + (y2 - y1) * tt + (rndS() - 0.5) * 12;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
    ctx.restore();

    ctx.restore();

    // ---- (6) 技能演出（仅战斗；图鉴预览不绘制）----
    if (e.skill && !e.ency) drawStorm2SkillFx(e);
    // 技能6 重现光束：独立于技能状态绘制（技能 4.6s 收束后飞行光束继续存活）
    if (e.s6Beams && e.s6Beams.length && !e.ency) drawS6Beams(e);

    // ---- (7) 入场演出（重制版）：轰然消散冲击波环 + 雷电风暴落雷 + 中央电球（energy-orb-sheet 序列帧）----
    if (e.phase === 'entrance' && !e.ency) {
      const EN = STORM2.entrance;
      const p = e.phaseT || 0;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // 冲击波环（消散阶段）：两道错峰外扩的青白椭圆环（带内侧残影），呈现"轰然"爆散
      if (p < EN.dissipate && e.entranceRings) {
        for (const r of e.entranceRings) {
          const rt = p - r.t;
          if (rt < 0 || rt > r.dur) continue;
          const rp = rt / r.dur;
          const rad = r.r1 + (r.r2 - r.r1) * (1 - Math.pow(1 - rp, 2));
          ctx.globalAlpha = 0.55 * (1 - rp);
          ctx.strokeStyle = '#bfe6ff';
          ctx.lineWidth = 3.5 * (1 - rp) + 1;
          ctx.beginPath();
          ctx.ellipse(ex, ey, rad, rad * 0.72, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 0.25 * (1 - rp);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(ex, ey, rad * 0.86, rad * 0.62, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // 现身冲击环：现身瞬间自机身外扩的雷电冲击波（快外扩 + 内侧残影环）
      const rp0 = p - EN.dissipate - EN.storm;
      if (rp0 >= 0 && e.revealRing) {
        const rq = clamp(rp0 / e.revealRing.dur, 0, 1);
        if (rq < 1) {
          const rad = 40 + 320 * (1 - Math.pow(1 - rq, 2));
          ctx.globalAlpha = 0.6 * (1 - rq);
          ctx.strokeStyle = '#bfe6ff';
          ctx.lineWidth = 4 * (1 - rq) + 1;
          ctx.beginPath();
          ctx.ellipse(ex, ey, rad, rad * 0.72, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 0.28 * (1 - rq);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(ex, ey, rad * 0.85, rad * 0.61, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // 落雷（lightning-4 素材 / 程序化回退）：周身白光衬托 + 紫调归入主色调（hue-rotate）
      if (e.bolts && e.bolts.length) {
        for (const b of e.bolts) {
          const bp = 1 - b.t / b.dur;
          const gl = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, 130);
          gl.addColorStop(0, `rgba(240, 250, 255, ${(0.5 * bp).toFixed(3)})`);
          gl.addColorStop(0.4, `rgba(190, 232, 255, ${(0.22 * bp).toFixed(3)})`);
          gl.addColorStop(1, 'rgba(120, 190, 255, 0)');
          ctx.fillStyle = gl;
          ctx.beginPath();
          ctx.ellipse(b.x, b.y, 130, 165, 0, 0, Math.PI * 2);
          ctx.fill();
          if (lightningImgBig) {
            const asp = (lightningImgBig.naturalWidth / lightningImgBig.naturalHeight) || 0.3;
            const bl = 260 + (b.seed % 120);
            ctx.globalAlpha = clamp(bp * 1.2, 0, 1) * 0.85;
            ctx.filter = S2_BOLT_FILTER;
            ctx.drawImage(lightningImgBig, b.x - bl * asp / 2, b.y - bl / 2, bl * asp, bl);
            ctx.filter = 'none';
          } else {
            ctx.strokeStyle = `rgba(205, 235, 255, ${(0.8 * bp).toFixed(3)})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(b.x, b.y - 130);
            ctx.lineTo(b.x + 8, b.y - 60);
            ctx.lineTo(b.x - 6, b.y);
            ctx.lineTo(b.x + 4, b.y + 60);
            ctx.lineTo(b.x - 2, b.y + 130);
            ctx.stroke();
          }
        }
      }
      // 中央电弧球（energy-orb-sheet 10×6 序列帧，黑底 lighter 融合，未加载跳过）：
      //   轰鸣阶段按 24fps 循环播放凝聚成形；现身阶段骤亮、微胀后收缩渐隐汇入机体
      if (energyOrbSheet && e.orbScale > 0.01) {
        const fw = energyOrbSheet.naturalWidth / ENERGY_ORB.cols;
        const fh = energyOrbSheet.naturalHeight / ENERGY_ORB.rows;
        const fi = Math.floor(T * ENERGY_ORB.fps) % ENERGY_ORB.frames;
        const fcol = fi % ENERGY_ORB.cols, frow = Math.floor(fi / ENERGY_ORB.cols);
        const baseD = ENERGY_ORB.baseD * e.orbScale * (1 + 0.05 * Math.sin(T * 9));
        const alpha = (e.orbFade != null ? e.orbFade : 1) * (0.72 + 0.2 * Math.sin(T * 17));
        // 绘制中心对齐机体电弧能量球核心（RX=0, RY=3；素材球在帧内偏右，offX 左移补偿）
        const ocx = ex + ENERGY_ORB.offX, ocy = ey + ENERGY_ORB.offY;
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.drawImage(energyOrbSheet, fcol * fw, frow * fh, fw, fh, ocx - baseD / 2, ocy - baseD / 2, baseD, baseD);
        const og = ctx.createRadialGradient(ocx, ocy, 2, ocx, ocy, baseD * 0.62);
        og.addColorStop(0, `rgba(160, 215, 255, ${(0.3 * clamp(alpha, 0, 1)).toFixed(3)})`);
        og.addColorStop(1, 'rgba(120, 190, 255, 0)');
        ctx.fillStyle = og;
        ctx.beginPath();
        ctx.arc(ocx, ocy, baseD * 0.62, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // ---- (8) 顶部 BOSS 血条（风暴编织者版：青金白热电浆——区别于暴风之眼的深海蓝）----
    // 两端收尖长六边形 + 中央 lightning-ring 电核 + 锯齿电弧沿条游走 + 边缘环绕电弧 + 名字/血量计数
    if (e.phase === 'combat' && !e.ency) {
      const revealP = clamp(e.barT / 0.8, 0, 1);
      const reveal = 1 - Math.pow(1 - revealP, 3);
      const bw = 300, bh = 13;
      const cx = CANVAS_W / 2, top = 8, mid = top + bh / 2, bot = top + bh;
      const taper = 15;
      const x0 = cx - bw / 2, x1 = cx + bw / 2;
      const hex = () => {
        ctx.beginPath();
        ctx.moveTo(x0, mid);
        ctx.lineTo(x0 + taper, top);
        ctx.lineTo(x1 - taper, top);
        ctx.lineTo(x1, mid);
        ctx.lineTo(x1 - taper, bot);
        ctx.lineTo(x0 + taper, bot);
        ctx.closePath();
      };
      const ratio = clamp(e.hp / e.maxHp, 0, 1);
      const trail = Math.max(ratio, clamp((e.hpTrail != null ? e.hpTrail : e.hp) / e.maxHp, 0, 1));
      const flash = clamp((trail - ratio) / 0.05, 0, 1);   // 受击闪白强度（残像领先主条的量）
      ctx.save();
      ctx.translate(cx, 0); ctx.scale(reveal, 1); ctx.translate(-cx, 0);
      // 底座 + 青金辉光笼罩（登场横向展开）
      ctx.shadowColor = '#3fd4ff';
      ctx.shadowBlur = 14 + Math.sin(T * 2.5) * 4;
      hex();
      ctx.fillStyle = 'rgba(6, 24, 34, 0.92)';
      ctx.fill();
      // 静态底框（淡，供辨识）
      ctx.strokeStyle = 'rgba(160, 220, 255, 0.35)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // 边框本身 = 持续奔流的白蓝电弧：六边形周长锯齿重描（1/12s 步进换形，双 pass 辉光 + 白芯）
      {
        const pts = [
          [x0, mid], [x0 + taper, top], [x1 - taper, top], [x1, mid],
          [x1 - taper, bot], [x0 + taper, bot], [x0, mid],
        ];
        const segs = [];
        let per = 0;
        for (let i = 0; i < pts.length - 1; i++) {
          const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
          segs.push(l); per += l;
        }
        const pt = (t) => {
          let d = clamp(t, 0, 1) * per;
          for (let i = 0; i < segs.length; i++) {
            if (d <= segs[i] || i === segs.length - 1) {
              const k = segs[i] ? d / segs[i] : 0;
              return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
            }
            d -= segs[i];
          }
          return pts[0];
        };
        const N = 46;
        const rnd = s2Seeded(Math.floor(T * 12) * 7 + 3);
        const jit = [];
        for (let i2 = 0; i2 <= N; i2++) {
          const [px, py] = pt(i2 / N);
          const [qx, qy] = pt(i2 / N + 0.008);
          let nx = -(qy - py), ny = qx - px;
          const nl = Math.hypot(nx, ny) || 1;
          const j = (rnd() - 0.5) * 3.6;
          jit.push([px + nx / nl * j, py + ny / nl * j]);
        }
        for (const [w2, col, blur] of [[3, 'rgba(150, 215, 255, 0.75)', 12], [1.3, 'rgba(248, 253, 255, 1)', 0]]) {
          ctx.strokeStyle = col;
          ctx.lineWidth = w2;
          if (blur) { ctx.shadowColor = '#7cd8ff'; ctx.shadowBlur = blur; }
          ctx.beginPath();
          jit.forEach(([px, py], i2) => (i2 ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        // 高强度电流脉冲沿边框奔流（亮白激光涌动段，持续绕行）
        {
          const pulseT = (T * 0.5) % 1;
          const pl = 0.12;   // 脉冲长度（周长占比）
          const i0 = Math.floor((pulseT - pl / 2) * N), i1 = Math.floor((pulseT + pl / 2) * N);
          for (const pass of [[6, 'rgba(170, 225, 255, 0.5)', 16], [2.6, 'rgba(255, 255, 255, 0.95)', 4]]) {
            ctx.strokeStyle = pass[1];
            ctx.lineWidth = pass[0];
            ctx.shadowColor = '#bfe6ff';
            ctx.shadowBlur = pass[2];
            let started = false, prevW = null;
            for (let i2 = i0; i2 <= i1; i2++) {
              const w = ((i2 % N) + N) % N;
              const [px, py] = jit[w];
              if (!started) { ctx.moveTo(px, py); started = true; }
              else if (prevW !== null && w === 0) ctx.moveTo(px, py);   // 跨越 0/1 接缝断笔
              else ctx.lineTo(px, py);
              prevW = w;
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }
      }
      // 内部：残血余像 → 主血量（青金渐变：深青 → 电青 → 冰白）→ 高光 → 刻度
      ctx.save();
      hex(); ctx.clip();
      if (trail > ratio + 0.002) {
        ctx.fillStyle = 'rgba(240, 252, 255, 0.5)';
        ctx.fillRect(x0, top, (x1 - x0) * trail, bh);
      }
      const bgh = ctx.createLinearGradient(x0, 0, x1, 0);
      bgh.addColorStop(0, '#2f9dff');
      bgh.addColorStop(0.5, '#5fd0ff');
      bgh.addColorStop(0.85, '#bfeaff');
      bgh.addColorStop(1, '#ffffff');
      ctx.fillStyle = bgh;
      ctx.fillRect(x0, top + 1.2, (x1 - x0) * ratio, bh - 2.4);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.fillRect(x0, top + 1.2, (x1 - x0) * ratio, 2.5);
      ctx.fillStyle = 'rgba(4, 18, 26, 0.55)';
      for (let i = 1; i < 10; i++) ctx.fillRect(x0 + (x1 - x0) * i / 10, top + 1.2, 1, bh - 2.4);
      // 70% 刻度线（雷环强化 / 暴走道具节点，亮白小竖线）
      ctx.fillStyle = 'rgba(240, 252, 255, 0.9)';
      ctx.fillRect(x0 + (x1 - x0) * 0.70 - 1, top + 1.2, 2, bh - 2.4);
      // 受击闪白（整条覆盖，快速衰减）
      if (flash > 0.01) {
        ctx.fillStyle = `rgba(240, 252, 255, ${(0.45 * flash).toFixed(3)})`;
        ctx.fillRect(x0, top, x1 - x0, bh);
      }
      ctx.restore();
      // 向外散发的放电电弧（1/12s 步进爆闪，非常狂野）：已充能段密集向外炸出分叉锯齿闪电
      //   （上下双向、主弧 + 1~2 道分叉 + 飞散电花）；位于 hex 裁剪之外绘制，电弧越出条外
      {
        const fillW = (x1 - x0) * ratio;
        if (fillW > 24) {
          const rnd = s2Seeded(Math.floor(T * 12) * 131 + 17);
          const bolts = 7;
          for (let k = 0; k < bolts; k++) {
            const px = x0 + ((k + rnd() * 0.7) / bolts) * fillW;
            const down = rnd() < 0.5;
            const edgeY = down ? bot : top;
            const dir = down ? 1 : -1;
            const len = 12 + rnd() * 18;
            const seg = 4;
            ctx.strokeStyle = k % 3 === 0 ? 'rgba(248, 253, 255, 0.95)' : 'rgba(170, 235, 255, 0.9)';
            ctx.lineWidth = 1.7;
            ctx.shadowColor = '#bfe6ff';
            ctx.shadowBlur = 9;
            ctx.beginPath();
            ctx.moveTo(px, edgeY);
            let cx2 = px, cy2 = edgeY;
            const branchAt = 1 + Math.floor(rnd() * (seg - 1));
            let bx = px, by = edgeY;
            for (let s2 = 1; s2 <= seg; s2++) {
              cx2 += (rnd() - 0.5) * 9;
              cy2 = edgeY + (len * s2 / seg) * dir;
              ctx.lineTo(cx2, cy2);
              if (s2 === branchAt) { bx = cx2; by = cy2; }
            }
            ctx.stroke();
            // 分叉电弧（1~2 道）
            const branches = 1 + (rnd() < 0.5 ? 1 : 0);
            for (let b2 = 0; b2 < branches; b2++) {
              const bdirX = rnd() < 0.5 ? -1 : 1;
              ctx.strokeStyle = 'rgba(170, 235, 255, 0.75)';
              ctx.lineWidth = 1.1;
              ctx.beginPath();
              ctx.moveTo(bx, by);
              let bxc = bx, byc = by;
              const blen = len * (0.35 + rnd() * 0.4);
              for (let s3 = 1; s3 <= 2; s3++) {
                bxc += bdirX * (2 + rnd() * 5);
                byc = by + blen * (s3 / 2) * dir;
                ctx.lineTo(bxc, byc);
              }
              ctx.stroke();
            }
            ctx.shadowBlur = 0;
            // 散发点亮星
            ctx.fillStyle = 'rgba(240, 251, 255, 0.95)';
            ctx.beginPath();
            ctx.arc(px, edgeY, 1.6, 0, Math.PI * 2);
            ctx.fill();
            // 飞散电花
            for (let sp = 0; sp < 2; sp++) {
              const sa = (down ? Math.PI / 2 : -Math.PI / 2) + (rnd() - 0.5) * 1.6;
              const sd = len * (0.5 + rnd() * 0.8);
              ctx.fillStyle = `rgba(220, 245, 255, ${(0.4 + rnd() * 0.5).toFixed(2)})`;
              ctx.beginPath();
              ctx.arc(px + Math.cos(sa) * sd * 0.7, edgeY + Math.sin(sa) * sd, 0.8 + rnd() * 1.2, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
      // （边缘环绕电弧已移除：放电电弧本身承担"狂野"视觉）
      // 中央电核：lightning-ring 素材小环（缓慢脉动，呼应机体电球；横跨血条形成"表盘轴心"）
      if (lightningImgRing) {
        const d = 27 + Math.sin(T * 4) * 2;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.9;
        ctx.drawImage(lightningImgRing, cx - d / 2, mid - d / 2, d, d);
        ctx.restore();
      }
      ctx.restore();
      // 名称与血量计数（展开完成后淡入，青金白字 + 辉光）
      {
        const txtA = clamp((e.barT - 0.45) / 0.35, 0, 1);
        if (txtA > 0.01) {
          ctx.save();
          ctx.globalAlpha = txtA;
          ctx.fillStyle = '#d9f6ff';
          ctx.shadowColor = '#3fd4ff';
          ctx.shadowBlur = 6;
          ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${e.name} · ${Math.ceil(e.hp)} / ${e.maxHp}`, cx, bot + 15);
          ctx.shadowBlur = 0;
          ctx.restore();
        }
      }
    }
  }

  // ---------- 风暴编织者：技能演出（世界坐标；状态机见 05-boss runStorm2Skill） ----------
  // 落雷素材调色：lightning-4 主色调偏紫，经 hue-rotate 归入游戏主色调（青蓝）并轻微提亮
  const S2_BOLT_FILTER = 'hue-rotate(-30deg) saturate(1.15) brightness(1.06)';
  function s2Seeded(seed) {
    let s = (seed * 9973 + 479) % 233280;
    return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  }
  // 电弧光束：自 (x,y) 沿 ang 延伸 len 的光柱——外辉光 + 蓝体淡白芯主体 + 沿主轴锯齿电弧（默认绘制）；
  // 主体不再纯白（电弧感由锯齿内芯承担），锯齿 1/12s 步进换形（seed 稳定伪随机）；
  // root：根部收束——起点宽度收为细点并在短距离内平滑展开至全宽，叠加核心辉光，
  //       消除起点处生硬的矩形截断（技能1 激光自电弧能量球核心发出时使用）
  function drawS2Beam(x, y, ang, len, halfW, alpha, root, tailCap) {
    if (len <= 0.5) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.globalAlpha = alpha;
    const w0 = root ? halfW * 0.22 : halfW;   // 根部宽度（root 时收为细点）
    const tw = root ? Math.min(len * 0.6, halfW * 3.2) : 0;   // 收束段长度（至全宽）
    const g = ctx.createLinearGradient(0, -halfW * 1.9, 0, halfW * 1.9);
    g.addColorStop(0, 'rgba(111, 184, 255, 0)');
    g.addColorStop(0.5, 'rgba(111, 184, 255, 0.45)');
    g.addColorStop(1, 'rgba(111, 184, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -w0 * 1.9);
    if (root) ctx.lineTo(tw, -halfW * 1.9);
    ctx.lineTo(len, -halfW * 1.9);
    ctx.lineTo(len, halfW * 1.9);
    if (root) ctx.lineTo(tw, halfW * 1.9);
    ctx.lineTo(0, w0 * 1.9);
    ctx.closePath();
    ctx.fill();
    // 头端圆帽（外辉光层）：外层端面此前为平截竖边、超出内层圆帽裸露在外，呈"被截断"感——补同心半圆收圆
    ctx.beginPath();
    ctx.arc(len, 0, halfW * 1.9, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
    if (tailCap) {
      // 尾端圆帽（外辉光层）：半圆向后凸出，消除尾端平截（技能6 重现光束尾部悬在场地中）
      ctx.beginPath();
      ctx.arc(0, 0, w0 * 1.9, Math.PI / 2, Math.PI * 1.5);
      ctx.fill();
    }
    const g2 = ctx.createLinearGradient(0, -halfW, 0, halfW);
    g2.addColorStop(0, 'rgba(120, 190, 255, 0.85)');
    g2.addColorStop(0.5, '#d8ecff');
    g2.addColorStop(1, 'rgba(120, 190, 255, 0.85)');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.moveTo(0, -w0);
    if (root) ctx.lineTo(tw, -halfW);
    ctx.lineTo(len, -halfW);
    ctx.lineTo(len, halfW);
    if (root) ctx.lineTo(tw, halfW);
    ctx.lineTo(0, w0);
    ctx.closePath();
    ctx.fill();
    if (tailCap) {
      // 尾端圆帽（内芯层）
      ctx.beginPath();
      ctx.arc(0, 0, w0, Math.PI / 2, Math.PI * 1.5);
      ctx.fill();
    }
    if (root) {
      // 核心辉光：起点处白蓝热斑，光束看起来自核心（电弧能量球）喷涌而出
      const rg = ctx.createRadialGradient(0, 0, 1, 0, 0, halfW * 1.6);
      rg.addColorStop(0, 'rgba(235, 249, 255, 0.9)');
      rg.addColorStop(0.45, 'rgba(170, 220, 255, 0.45)');
      rg.addColorStop(1, 'rgba(120, 190, 255, 0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, halfW * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // 头端圆帽 + 白蓝热斑：矩形端头收为圆头，避免生硬截断感
    ctx.beginPath();
    ctx.arc(len, 0, halfW, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
    const hgl = ctx.createRadialGradient(len, 0, 1, len, 0, halfW * 1.7);
    hgl.addColorStop(0, 'rgba(235, 249, 255, 0.95)');
    hgl.addColorStop(0.45, 'rgba(170, 220, 255, 0.5)');
    hgl.addColorStop(1, 'rgba(120, 190, 255, 0)');
    ctx.fillStyle = hgl;
    ctx.beginPath();
    ctx.arc(len, 0, halfW * 1.7, 0, Math.PI * 2);
    ctx.fill();
    if (len > 12) {
      // 锯齿电弧：沿光束主轴双 pass（蓝辉外弧 + 白热细芯），每 1/12s 换一次形状
      const seg = Math.max(4, Math.floor(len / 26));
      const rnd = s2Seeded(Math.floor(state.time * 12) * 31 + seg * 17 + ((x * 7 + y * 3) | 0) % 97);
      for (const [w2, col] of [[2.6, 'rgba(143, 212, 255, 0.55)'], [1.1, 'rgba(255, 255, 255, 0.9)']]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w2;
        ctx.shadowColor = '#bfe6ff';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (let k = 1; k <= seg; k++) {
          const px = (k / seg) * len;
          const py = (rnd() * 2 - 1) * halfW * 1.4 * Math.sin(Math.PI * k / seg);
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  // 蓝色预警波（技能1/2 蓄力）：自半径 r0 处向中心收缩的圆环波——
  // 带两圈拖尾残影（收缩方向的后像在外侧）、亮度随收缩进度从不明显渐增；t0 为收缩起始时刻
  function drawS2WarnWave(x, y, r0, t0, dur, t) {
    if (t < t0) return;
    const p = clamp((t - t0) / dur, 0, 1);
    const r = r0 * (1 - p);
    if (r < 2) return;
    ctx.save();
    ctx.shadowColor = '#7cd8ff';
    for (const [mul, w2, a] of [[1.10, 1.4, 0.16], [1.05, 2.2, 0.34], [1, 3, 1]]) {
      ctx.strokeStyle = `rgba(159, 216, 255, ${(a * (0.18 + 0.82 * p)).toFixed(3)})`;
      ctx.lineWidth = w2;
      ctx.beginPath();
      ctx.arc(x, y, r * mul, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStorm2SkillFx(e) {
    const s = e.skill, T = state.time;

    if (s.id === 0) {
      // 技能1：电弧球蓄力预警 → 向下强力电弧激光（诗篇：移动中连射 5 次，预警跨发重叠）
      const ball = storm2BallPos(e);
      const firing = s.shipian ? s.st === 1 : s.fired;
      if (!firing) {
        const p = s.shipian
          ? (s.shot === 0 ? clamp(s.pt / STORM2.s1Charge, 0, 1) : clamp(s.pt / STORM2_SHIP.s1.charge2, 0, 1))
          : clamp(s.t / STORM2.s1Charge, 0, 1);
        const tEl = s.shipian ? s.pt : s.t;   // 蓄力段已进行时间
        ctx.save();
        if (s.shipian && s.shot > 0) {
          // 诗篇第 2~5 次：小预警环（自 150px 收缩 0.4s）
          drawS2WarnWave(ball.x, ball.y, STORM2_SHIP.s1.ring2R0, 0, STORM2_SHIP.s1.ring2Dur, s.pt);
        } else {
          // 首发大环：蓝色收缩圆环波（自 300px 向中心收缩 0.8s，带拖尾残影、越收越明显）
          drawS2WarnWave(ball.x, ball.y, STORM2.s1RingR0, 0, STORM2.s1RingDur, tEl);
          // 预警柱：淡蓝色竖直参考带（收缩完成后显现；仅向下方延伸，不越过能量球）
          if (tEl >= STORM2.s1RingDur) {
            ctx.globalAlpha = clamp((tEl - STORM2.s1RingDur) / (STORM2.s1Charge - STORM2.s1RingDur), 0, 1) * 0.9;
            ctx.fillStyle = 'rgba(143, 212, 255, 0.12)';
            ctx.fillRect(ball.x - STORM2.s1R, ball.y, STORM2.s1R * 2, CANVAS_H - ball.y);
          }
          ctx.globalAlpha = 1;
        }
        // 球体增亮罩（电弧球随蓄力增亮）
        const gg = ctx.createRadialGradient(ball.x, ball.y, 2, ball.x, ball.y, 30);
        gg.addColorStop(0, `rgba(235, 249, 255, ${(0.35 + 0.45 * p).toFixed(3)})`);
        gg.addColorStop(1, 'rgba(160, 210, 255, 0)');
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, 30, 0, Math.PI * 2);
        ctx.fill();
        // 汇聚小电弧（外缘 → 球心）
        const rnd = s2Seeded(Math.floor(T * 14) + 5);
        ctx.strokeStyle = 'rgba(190, 232, 255, 0.85)';
        ctx.lineWidth = 1.4;
        for (let k = 0; k < 4; k++) {
          const a = rnd() * Math.PI * 2, r0 = 40 + rnd() * 26;
          ctx.beginPath();
          ctx.moveTo(ball.x + Math.cos(a) * r0, ball.y + Math.sin(a) * r0);
          ctx.lineTo(ball.x + Math.cos(a) * 8, ball.y + Math.sin(a) * 8);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        // 强力电弧激光：竖直光柱（亮起 → 渐隐）+ 雷电素材贴片（lightning-4）+ 边缘狂乱电流
        const life = s.shipian ? s.pt : s.t - STORM2.s1Charge;
        const vis = life < 0.12 ? life / 0.12 : 1 - (life - 0.12) / (STORM2.s1BeamDur - 0.12);
        const a = clamp(vis, 0, 1) * 0.95;
        drawS2Beam(ball.x, ball.y, Math.PI / 2, CANVAS_H - ball.y + 30, STORM2.s1R, a, true);   // root：自能量球核心收束发出，避免顶部截断
        // 周身狂乱电流（lightning-2 细流光弧）：10 枚沿光束左右边缘高速环绕游走、剧烈明灭
        if (lightningImgThin) {
          const asp = (lightningImgThin.naturalWidth / lightningImgThin.naturalHeight) || 0.2;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          for (let k = 0; k < 10; k++) {
            const side = k % 2 === 0 ? -1 : 1;
            const ph = T * 2.6 + k * 1.9;
            const yy = ball.y + 26 + ((ph * 130) % Math.max(60, (CANVAS_H - ball.y + 30) - 52));
            const wob = Math.sin(ph * 3.1);
            const xx = ball.x + side * (STORM2.s1R + 8 + 7 * wob);
            const sl = 46 + 16 * Math.sin(ph * 2.3);
            ctx.save();
            ctx.translate(xx, yy);
            ctx.rotate(side * (0.6 + 0.5 * wob));
            ctx.globalAlpha = 0.5 + 0.35 * Math.sin(ph * 3.7);
            ctx.drawImage(lightningImgThin, -sl * asp / 2, -sl / 2, sl * asp, sl);
            ctx.restore();
          }
          ctx.restore();
        }
        if (lightningImgBig) {
          const asp = (lightningImgBig.naturalWidth / lightningImgBig.naturalHeight) || 0.3;
          const rnd = s2Seeded(Math.floor(T * 11) * 13 + 3);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          for (let k = 0; k < 2; k++) {
            const w2 = STORM2.s1R * (2.4 + rnd() * 1.2) * asp * 2;
            const yOff = Math.max(0, rnd() * 30 - 15) * 0.5;   // 贴片顶端不越过能量球上方
            const top = ball.y + yOff;
            ctx.globalAlpha = a * (0.4 + 0.4 * rnd());
            ctx.drawImage(lightningImgBig, ball.x - w2 / 2, top, w2, CANVAS_H - ball.y - yOff + 50);
          }
          ctx.restore();
        }
        // 诗篇：当前发光束期间，下一发的小预警环提前亮起（跨发重叠）
        if (s.shipian && s.shot < STORM2_SHIP.s1.shots - 1 && s.t >= s.nextAt - STORM2_SHIP.s1.charge2) {
          drawS2WarnWave(ball.x, ball.y, STORM2_SHIP.s1.ring2R0, 0, STORM2_SHIP.s1.ring2Dur, s.t - (s.nextAt - STORM2_SHIP.s1.charge2));
        }
      }
    } else if (s.id === 1) {
      // 技能2 蓄力预警：四喷口各一圈蓝色预警波（中心在各自喷口位置，自 200px 收缩）——
      //   按发射顺序先后出现（第 k 发的喷口光环晚 k×0.13s 开始收缩，完成后留 0.2s 该喷口发射）；
      //   蓄力/收缩时长随技能实例（s.charge / s.ringDur）——诗篇连携时 1.6s / 1.2s，收缩速度变慢
      if (s.t < s.charge + 3 * STORM2.s2Gap) {
        for (let k = 0; k < 4; k++) {
          const nz = storm2Nozzle(e, s.order[k]);
          drawS2WarnWave(nz.x, nz.y, STORM2.s2RingR0, 0.2 + k * STORM2.s2Gap, s.ringDur, s.t);
        }
      }
      for (const b of s.beams) {
        const vis = b.t < 0.10 ? b.t / 0.10 : 1 - (b.t - 0.10) / b.dur;
        const fullLen = CANVAS_H - b.y + 30;
        const len = b.clipD != null ? Math.min(fullLen, b.clipD) : fullLen;   // 守愿者白盾截断
        drawS2Beam(b.x, b.y, Math.PI / 2, len, STORM2.s2R, clamp(vis, 0, 1));
      }
      // 诗篇：连携的技能6 汇聚预兆（子状态随行，连携窗口 ×1.5；光束本体由 drawS6Beams 绘制）
      if (s.s6 && s.s6.pointsAt && s.s6.ptT > 0) {
        const glow = 1 - s.s6.ptT / (s.s6.warnDur || 0.3);
        for (const px of [10, CANVAS_W - 10]) {
          const py = e.y - 26;
          const gg = ctx.createRadialGradient(px, py, 1, px, py, 14);
          gg.addColorStop(0, `rgba(235, 249, 255, ${(0.3 + 0.6 * glow).toFixed(3)})`);
          gg.addColorStop(1, 'rgba(120, 190, 255, 0)');
          ctx.fillStyle = gg;
          ctx.beginPath();
          ctx.arc(px, py, 14, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (s.id === 4) {
      // 技能5：周身雷电环（lightning-ring 素材，黑底经 lighter 混合融入画面）+ 雷击预警（同款雷电环恒定大小渐显，
      // 先慢后快）+ 打击爆闪（周围白光 + 蓝点光闪现）
      const R = S2_STRIKE_R;
      const fullD = R / 0.30;   // 素材亮环带半径 ≈ 绘制边长 ×0.30：满蓄力时亮环带对齐打击区域半径
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // 周身雷电环：缓慢旋转 + 明暗脉动，下方衬一层淡径向光晕
      const haloA = clamp(s.t / 0.4, 0, 1) * (0.5 + 0.14 * Math.sin(T * 11));
      const hg = ctx.createRadialGradient(e.x, e.y, 30, e.x, e.y, 96);
      hg.addColorStop(0, `rgba(190, 232, 255, ${(haloA * 0.5).toFixed(3)})`);
      hg.addColorStop(1, 'rgba(120, 190, 255, 0)');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 96, 0, Math.PI * 2);
      ctx.fill();
      if (lightningImgRing) {
        const d0 = 180;   // 周身雷电环（半径较初版 -40%）
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(T * 0.6);
        ctx.globalAlpha = Math.min(1, haloA * 1.6);
        ctx.drawImage(lightningImgRing, -d0 / 2, -d0 / 2, d0, d0);
        ctx.restore();
      }
      ctx.restore();
      for (const st of s.strikes) {
        if (st.fired) {
          // 打击爆闪：周围白光 + 环带蓝点光闪现（雷电轰击感）；flash 由逻辑层逐帧衰减（0.35s）
          if (st.flash > 0) {
            const fp = st.flash / 0.35;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const fg = ctx.createRadialGradient(st.x, st.y, 2, st.x, st.y, R * 0.85);
            fg.addColorStop(0, `rgba(245, 251, 255, ${(0.8 * fp).toFixed(3)})`);
            fg.addColorStop(0.55, `rgba(190, 232, 255, ${(0.35 * fp).toFixed(3)})`);
            fg.addColorStop(1, 'rgba(120, 190, 255, 0)');
            ctx.fillStyle = fg;
            ctx.beginPath();
            ctx.arc(st.x, st.y, R * 0.85, 0, Math.PI * 2);
            ctx.fill();
            const rnd = s2Seeded((Math.floor(st.x * 3) + Math.floor(st.y)) * 17 + 5);
            for (let k = 0; k < 10; k++) {
              const a = rnd() * Math.PI * 2, rr = R * (0.45 + rnd() * 0.5);
              const sz = 1.6 + rnd() * 2.6;
              const tw = 0.5 + 0.5 * Math.sin(T * 40 + k * 2.4);
              ctx.globalAlpha = fp * (0.35 + 0.65 * tw);
              ctx.fillStyle = k % 3 ? '#bfe6ff' : '#ffffff';
              ctx.beginPath();
              ctx.arc(st.x + Math.cos(a) * rr, st.y + Math.sin(a) * rr, sz, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }
          continue;
        }
        if (st.t < 0) continue;   // 尚未开始积聚
        // 雷电积聚预警：lightning-ring 亮环带贴齐判定半径 R（不裁剪——环外电弧保留）；
        //   中心仅微微泛白，双层反向旋转的低亮环制造电弧流动感
        const wp = clamp(st.t / STORM2.s5Warn, 0, 1);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const wg = ctx.createRadialGradient(st.x, st.y, R * 0.2, st.x, st.y, R);
        wg.addColorStop(0, `rgba(190, 232, 255, ${(0.04 + 0.09 * wp).toFixed(3)})`);
        wg.addColorStop(1, 'rgba(190, 232, 255, 0)');
        ctx.fillStyle = wg;
        ctx.beginPath();
        ctx.arc(st.x, st.y, R, 0, Math.PI * 2);
        ctx.fill();
        if (lightningImgRing) {
          const flick = 0.86 + 0.14 * Math.sin(T * 21 + st.x);
          ctx.save();
          ctx.translate(st.x, st.y);
          ctx.rotate(T * 0.9 + st.x);
          ctx.globalAlpha = (0.10 + 0.38 * wp * wp) * flick;
          ctx.drawImage(lightningImgRing, -fullD / 2, -fullD / 2, fullD, fullD);
          ctx.restore();
          ctx.save();
          ctx.translate(st.x, st.y);
          ctx.rotate(-T * 1.5 + st.y);
          ctx.globalAlpha = (0.06 + 0.22 * wp * wp) * flick;
          ctx.drawImage(lightningImgRing, -fullD / 2, -fullD / 2, fullD, fullD);
          ctx.restore();
        }
        ctx.restore();
      }
    } else if (s.id === 5) {
      // 技能6：重现点汇聚预兆（发射前预警，连携时窗口 ×1.5）：左右边界两点亮起电弧球
      // （光束本体绘制在 drawS6Beams——技能 4.6s 收束后飞行光束仍需继续绘制）
      if (s.pointsAt && s.ptT > 0) {
        const glow = 1 - s.ptT / (s.warnDur || 0.3);
        for (const px of [10, CANVAS_W - 10]) {
          const py = e.y - 26;
          const gg = ctx.createRadialGradient(px, py, 1, px, py, 14);
          gg.addColorStop(0, `rgba(235, 249, 255, ${(0.3 + 0.6 * glow).toFixed(3)})`);
          gg.addColorStop(1, 'rgba(120, 190, 255, 0)');
          ctx.fillStyle = gg;
          ctx.beginPath();
          ctx.arc(px, py, 14, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // 技能6 光束绘制（臂向 / 重现光束；独立于技能状态——技能收束后飞行光束继续存活绘制）：
  // 守愿者白盾咬合后光束永久钉在盾面（b.effLen 由逻辑层 updateS6Beams 每帧写入，盾移开也不恢复）；
  // 诗篇连携（carried）的臂向光束变淡（faint）
  function drawS6Beams(e) {
    for (const b of e.s6Beams) {
      const vis = b.t < 0.08 ? b.t / 0.08 : (b.t > b.dur - 0.2 ? Math.max(0, (b.dur - b.t) / 0.2) : 1);
      const len = b.effLen != null ? b.effLen : (b.len || 0);
      drawS2Beam(b.x, b.y, b.ang, len, STORM2.s6R, clamp(b.faint ? vis * 0.45 : vis, 0, 1), false, true);   // tailCap：尾端圆帽，消除悬空光束两端的平截感
    }
  }

  // BOSS：旧日之歌 —— 灰黑渐变舰体 + 流动彩色光泽 + 音核涟漪 + 双炮管
  function drawBoss(e) {
      if (e.bossId === 'storm2') { drawStormBossII(e); return; }   // 风暴编织者（二阶段飞舰：当前仅图鉴预览）
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

    // ---------- 组装阶段 / 技能5/6 重组动画：飞行中的部件（世界坐标） ----------
    // e.partsAnim：诗篇技能5/6 释放前的六球重组演出（runPartsAnim 驱动 pt.x/pt.y，endPartsAnim 清除）
    if ((e.phase === 'assemble' || e.partsAnim) && e.parts) {
      for (const pt of e.parts) {
        if (e.phase === 'assemble' && pt.attached) {
          // 已镶接（仅组装阶段）：在机体上绘制装甲板高光闪烁（短暂）
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
        if (e.phase === 'assemble' && e.phaseT < pt.delay) continue;   // 还没轮到
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
    const B = BOSSES[bossFlow.pending] || BOSSES.song;
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
      const isStorm = bossFlow.pending === 'storm';   // 暴风之眼：专属配色与入场动画

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

  export {
    drawZoneMarks, drawStormVortex, drawStormBoss, drawStormBar, drawTornado, drawBoss,
    drawWarnBar, drawBossWarning,
  };