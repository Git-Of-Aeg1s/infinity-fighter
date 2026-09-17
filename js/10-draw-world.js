// 10-draw-world：敌机绘制分发 / 双 BOSS 绘制与血条 / 警报演出 / render()
'use strict';


  // 渐变缓存：渐变对象仅取决于颜色/半径等关键参数、与坐标无关，按 key 复用，
  // 绘制时配合 translate 平移到目标位置（坐标随弹移动、渐变不变），消除每帧海量 Gradient 对象。
  // 注意：缓存值绑定主画布 ctx；图鉴预览走 withPreviewCtx 的独立上下文、不经过此缓存。
  const gradCache = new Map();
  function cachedGrad(key, make) {
    let g = gradCache.get(key);
    if (!g) {
      if (gradCache.size > 128) gradCache.clear();   // 防御性上限（避免任何意外 key 无限增长）
      g = make();
      gradCache.set(key, g);
    }
    return g;
  }

  function drawEnemy(e) {
    if (e.type === 'tornado') { drawTornado(e); return; }   // 龙卷专用绘制（自身处理 translate）
    ctx.save();
    ctx.translate(e.x, e.y);
    // 虚化（护盾期）：机身半透明闪烁
    if (e.phase > 0) ctx.globalAlpha = 0.45 + Math.sin(state.time * 9) * 0.12;
    ctx.scale(ENEMY_TYPES[e.type].drawScale, ENEMY_TYPES[e.type].drawScale);   // 体型放大
    ctx.fillStyle = e.color;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 1.2;

    if (e.type === 'harbinger') {
      drawHarbingerBody(e);   // 自带填充与描边（圆环 + 横杠 + 红/灰充能核心）
    } else if (e.type === 'weilong') {
      drawWeilongBody(e);     // 自带填充与描边（四角环状旋翼 + 磨角矩形机身 + 指向炮管 + 橙黄渐变）
    } else if (e.type === 'baoling') {
      drawBaolingBody(e);     // 自带填充与描边（白灰磨角方形机体 + 黑横杠风扇 + 前挂红道黑炸弹）
    } else if (e.type === 'douzhi') {
      drawDouzhiBody(e);      // 自带填充与描边（类暴鸰灰黑方形机体 + 四轮红色间歇闪光 + 上扬双箭头标志 + 下挂蓝色盒子）
    } else if (e.type === 'hanshuang') {
      drawHanshuangBody(e);   // 自带填充与描边（四角圆角矩形旋翼舱 + 灰黑渐变机身 + 天蓝霜纹边缘 + 冰蓝光圈）
    } else if (e.type === 'yu4') {
      drawYu4Body(e);         // 自带填充与描边（介于圆与方之间的超椭圆暖灰渐变机身 + 金色X形条纹 + 中央淡黄反应核 + 四角风扇圆 + 金色六边力场）
    } else if (e.type === 'anvil') {
      drawAnvilBody(e);       // 自带填充与描边（菱形黑灰框架 + 中央灰黑正方形 + 上下左右横杠 + 中心朝下凸出白杠 + 正方形青绿治疗光环）
    } else if (e.type === 'fashiA1') {
      drawFashiA1Body(e);     // 自带填充与描边（四角风扇圆 + 灰黑矩形1:3:1紫光条 + 底部深紫炮管）
    } else if (e.type === 'popian') {
      drawPopianBody(e);      // 自带填充与描边（灰白金属菱形边框 + 中心黑杠红头 + 底部双黑炮管）
    } else if (e.type === 'jiaoxiang') {
      drawJiaoxiangBody(e);   // 自带填充与描边（橙火红渐变环 + 火焰光环 + 三根旋转横杠 + 白圆；见 09-draw-ships）
    } else if (e.type === 'striker' && e.skill === 'dusk') {
      drawDuskStrikerBody(e); // 自带填充与描边（暗黑渐变菱形 + 微亮描边 + 中央白色发光核心；渐显/渐隐透明度内含）
    } else {
    if (e.type === 'side' || e.type === 'prolifera') {
      // 1类/增生侧翼艇：小型三角箭镖，朝飞行方向倾斜
      const tilt = e._sideVel ? (e._sideVel.vx > 0 ? -0.35 : 0.35) : 0;
      ctx.rotate(tilt);
      ctx.beginPath();
      ctx.moveTo(0, 11);
      ctx.lineTo(11, -7);
      ctx.lineTo(0, -3);
      ctx.lineTo(-11, -7);
      ctx.closePath();
    } else if (e.type === 'escort') {
      // 卫护飞船：单纯的等腰三角形（指向飞行方向、高大于宽、无内凹箭头造型），较初版缩小 40%
      const tilt = e._sideVel ? (e._sideVel.vx > 0 ? -0.35 : 0.35) : 0;
      ctx.rotate(tilt);
      ctx.beginPath();
      ctx.moveTo(0, 5.5);
      ctx.lineTo(3.75, -5.5);
      ctx.lineTo(-3.75, -5.5);
      ctx.closePath();
    } else if (e.type === 'striker') {
      // 2类：菱形战机
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.lineTo(15, -4);
      ctx.lineTo(0, -13);
      ctx.lineTo(-15, -4);
      ctx.closePath();
    } else if (e.type === 'gunship') {
      // 3类：宽体炮艇，双引擎短翼
      ctx.beginPath();
      ctx.moveTo(0, 20);
      ctx.lineTo(16, 10);
      ctx.lineTo(23, -2);
      ctx.lineTo(12, -6);
      ctx.lineTo(8, -17);
      ctx.lineTo(-8, -17);
      ctx.lineTo(-12, -6);
      ctx.lineTo(-23, -2);
      ctx.lineTo(-16, 10);
      ctx.closePath();
      // 舰体渐变（后/上暗 → 前/下亮）取代纯色平涂，增强装甲立体感
      const gpal = GUNSHIP_PALETTE[e.variant] || GUNSHIP_PALETTE.violet;
      const ghull = ctx.createLinearGradient(0, -17, 0, 20);
      ghull.addColorStop(0, gpal.dark);
      ghull.addColorStop(0.5, gpal.base);
      ghull.addColorStop(1, gpal.light);
      ctx.fillStyle = ghull;
    } else {
      // 4类：主力舰中央舰体（两侧机翼为独立部件，见下方折翼绘制，从中心横向滑出）
      ctx.beginPath();
      ctx.moveTo(0, 34);
      ctx.lineTo(19, 25);
      ctx.lineTo(19, -21);
      ctx.lineTo(10, -34);
      ctx.lineTo(-10, -34);
      ctx.lineTo(-19, -21);
      ctx.lineTo(-19, 25);
      ctx.closePath();
      // 舰体渐变（后/上暗 → 前/下亮）取代纯色平涂，增强装甲立体感
      const cpal = CAPITAL_PALETTE[e.variant] || CAPITAL_PALETTE.crimson;
      const hullGrd = ctx.createLinearGradient(0, -34, 0, 34);
      hullGrd.addColorStop(0, cpal.dark);
      hullGrd.addColorStop(0.5, cpal.base);
      hullGrd.addColorStop(1, cpal.light);
      ctx.fillStyle = hullGrd;
    }
    ctx.fill();
    ctx.stroke();

    // 4类折翼：两翼独立部件，刚体横向位移（下降途中收拢于中心，就位后从中间向两侧滑出拼接，不缩放）
    if (e.type === 'capital') {
      const wpal = CAPITAL_PALETTE[e.variant] || CAPITAL_PALETTE.crimson;
      // 展开进度 wingT：0=收拢（贴于中心、翼尖露出一角）→ 1=完全展开（就位）；缓入缓出、无过冲
      let wingT = 1;
      if (e.unfoldT > 0) {
        const p = clamp(1 - e.unfoldT / 0.55, 0, 1);
        wingT = p * p * (3 - 2 * p);   // smoothstep 缓入缓出：速度 0→最大→0，起步/到位都柔和
      } else if (!e.arrived) {
        wingT = 0;   // 下降途中机翼收拢于中心
      }
      const retract = 20;   // 收拢时两翼向中心内移距离（翼尖收到 ±27，露出舰体边缘 ±19 一角）
      for (const sx of [-1, 1]) {
        ctx.save();
        // 刚体平移：从中心滑出至两侧（取代原横向缩放，翼形不变形）
        ctx.translate(-sx * (1 - wingT) * retract, 0);
        // 翼面（五边形，翼根竖边贴合舰体切割线）
        ctx.beginPath();
        ctx.moveTo(sx * 19, 25);
        ctx.lineTo(sx * 30, 8);
        ctx.lineTo(sx * 47, 2);
        ctx.lineTo(sx * 40, -16);
        ctx.lineTo(sx * 19, -21);
        ctx.closePath();
        const wGrd = ctx.createLinearGradient(0, -34, 0, 34);
        wGrd.addColorStop(0, wpal.dark);
        wGrd.addColorStop(0.5, wpal.base);
        wGrd.addColorStop(1, wpal.light);
        ctx.fillStyle = wGrd;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // 翼面斜向装甲分块
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.30)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(sx * 15, -20); ctx.lineTo(sx * 38, -8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx * 13, 8); ctx.lineTo(sx * 30, 14); ctx.stroke();
        ctx.restore();
      }
    }

    // 座舱（体型越大座舱越大；卫护飞船为纯三角形，无核心）
    if (e.type !== 'escort') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.beginPath();
      ctx.arc(0, 0, e.type === 'capital' ? 7 : e.type === 'gunship' ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3类炮艇精细化：装甲分块 + 变体涂装 + 能量核心 + 双引擎辉光 + 受光边缘
    if (e.type === 'gunship') {
      const pal = GUNSHIP_PALETTE[e.variant] || GUNSHIP_PALETTE.violet;
      const pulse = 0.6 + Math.sin(state.time * 3.2 + (e.wobble || 0)) * 0.4;   // 涂装/引擎呼吸

      // (1) 装甲分块线（暗色，勾勒炮艇结构：中央龙骨 + 翼根/前翼缝）
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.30)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, 17); ctx.stroke();          // 中央龙骨
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(sx * 10, -5); ctx.lineTo(sx * 21, -1); ctx.stroke();  // 翼根缝
        ctx.beginPath(); ctx.moveTo(sx * 8, 8); ctx.lineTo(sx * 15, 9); ctx.stroke();      // 前翼缝
      }

      // (2) 变体涂装：紫=双侧斜向能量纹(脉动变亮) / 红=环绕核心的正六边形(脉动变亮、不旋转) / 金=环绕旋转光环（呼应环形弹幕）
      ctx.shadowColor = pal.glow;
      ctx.shadowBlur = 8;
      ctx.globalAlpha = 0.55 + pulse * 0.4;
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 2;
      if (e.variant === 'amber') {
        const ringRot = state.time * 1.8 + (e.wobble || 0);
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.ellipse(0, 2, 17, 13, ringRot + i * Math.PI / 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (e.variant === 'crimson') {
        // 赤红：环绕能量核心的正六边形——固定朝向(不旋转)、随 pulse 定期脉动变亮（取代原橙色 <> 光带）
        ctx.globalAlpha = 0.30 + pulse * 0.65;   // 脉动亮度
        ctx.shadowBlur = 3 + pulse * 15;         // 脉动辉光
        ctx.lineWidth = 1.5 + pulse * 1.5;       // 脉动线宽
        const R = 11;                            // 外接圆半径：环绕 r4.5 的能量核心
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 3 * k;             // 固定角度（不含 state.time → 不旋转）
          const hx = Math.cos(a) * R, hy = Math.sin(a) * R;
          if (k === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.stroke();
      } else {
        // 紫晶：双侧斜向能量纹（条纹）——与赤红同样的定期脉动变亮
        ctx.globalAlpha = 0.30 + pulse * 0.65;
        ctx.shadowBlur = 3 + pulse * 15;
        ctx.lineWidth = 1.5 + pulse * 1.5;
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(sx * 11, -4); ctx.lineTo(sx * 19, 0);
          ctx.moveTo(sx * 9, 4); ctx.lineTo(sx * 16, 7);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // (3) 能量核心（座舱位置径向发光核 + 强调色描边，取代纯白平涂）
      const coreGrd = ctx.createRadialGradient(0, 0, 0.5, 0, 0, 5.5);
      coreGrd.addColorStop(0, '#ffffff');
      coreGrd.addColorStop(0.45, pal.light);
      coreGrd.addColorStop(0.8, pal.base);
      coreGrd.addColorStop(1, pal.dark);
      ctx.fillStyle = coreGrd;
      ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 1;
      ctx.shadowColor = pal.glow; ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // (4) 尾部单引擎辉光（后部/上方居中一个喷口，呼吸明灭）
      {
        const engGrd = ctx.createRadialGradient(0, -16, 0.4, 0, -16, 6);
        engGrd.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        engGrd.addColorStop(0.4, pal.accent);
        engGrd.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.globalAlpha = 0.45 + pulse * 0.5;
        ctx.fillStyle = engGrd;
        ctx.beginPath(); ctx.ellipse(0, -16, 4.5, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }

      // (5) 舰体受光边缘高光（后缘 + 机头前缘，增强立体感）
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-8, -17); ctx.lineTo(8, -17); ctx.stroke();                    // 后缘
      ctx.beginPath(); ctx.moveTo(-16, 10); ctx.lineTo(0, 20); ctx.lineTo(16, 10); ctx.stroke();   // 机头前缘
    }

    // 4类主力舰精细化：装甲分块 + 变体涂装光带 + 舰桥指挥塔 + 引擎辉光 + 受光边缘
    if (e.type === 'capital') {
      const pal = CAPITAL_PALETTE[e.variant] || CAPITAL_PALETTE.crimson;
      const pulse = 0.6 + Math.sin(state.time * 3 + (e.wobble || 0)) * 0.4;   // 光带/引擎呼吸

      // (1) 装甲分块线（暗色，勾勒厚重舰体结构；横向缝限制在舰体宽度 ±17 内，避免折翼未展开时线条悬空于机翼区）
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.30)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(0, 30); ctx.stroke();          // 中央龙骨
      // 横向装甲缝：去掉穿过核心的 y=2；蓝4 再去掉靠近中心的 y=-14（仅留 y=18）
      const seams = e.variant === 'azure' ? [18] : [-14, 18];
      for (const yy of seams) {
        ctx.beginPath(); ctx.moveTo(-17, yy); ctx.lineTo(17, yy); ctx.stroke();
      }
      // 两侧斜向分块已移入翼面绘制（随折翼变形）

      // (2) 变体涂装光带：赤红 = 两侧 V 形光带；苍蓝 = 横向甲板灯带
      ctx.shadowColor = pal.glow;
      ctx.shadowBlur = 9;
      ctx.globalAlpha = 0.5 + pulse * 0.4;
      if (e.variant === 'azure') {
        ctx.strokeStyle = pal.accent;                     // 横向甲板灯带（限制在舰体宽度 ±17 内）
        ctx.lineWidth = 2.2;
        for (const yy of [-20, 14]) {
          ctx.beginPath(); ctx.moveTo(-17, yy); ctx.lineTo(17, yy); ctx.stroke();
        }
      } else {
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 2.2;
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(sx * 7, -26); ctx.lineTo(sx * 18, -6); ctx.lineTo(sx * 11, 22);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // (3) 舰桥指挥塔（暗座 + 径向发光核心 + 强调色描边）
      ctx.fillStyle = 'rgba(12, 9, 18, 0.88)';
      ctx.beginPath(); ctx.ellipse(0, -2, 13, 15, 0, 0, Math.PI * 2); ctx.fill();   // 舰桥底座
      const bridgeGrd = ctx.createRadialGradient(0, -3, 1, 0, -3, 8);
      bridgeGrd.addColorStop(0, '#ffffff');
      bridgeGrd.addColorStop(0.4, pal.light);
      bridgeGrd.addColorStop(0.75, pal.base);
      bridgeGrd.addColorStop(1, pal.dark);
      ctx.fillStyle = bridgeGrd;
      ctx.beginPath(); ctx.arc(0, -3, 7.5, 0, Math.PI * 2); ctx.fill();             // 发光核心
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 1.3;
      ctx.shadowColor = pal.glow; ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 红4：舰桥核心外圈六边形框（accent 发光，圈住核心）
      if (e.variant === 'crimson') {
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 1.6;
        ctx.shadowColor = pal.glow; ctx.shadowBlur = 10;
        ctx.globalAlpha = 0.65 + pulse * 0.35;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 6 + i * Math.PI / 3;   // 尖顶六边形
          const hx = Math.cos(a) * 12.5, hy = -3 + Math.sin(a) * 12.5;
          i === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }

      // (4) 引擎辉光（后部/上方 3 个喷口，呼吸明灭）
      for (const ex of [-12, 0, 12]) {
        const engGrd = ctx.createRadialGradient(ex, -30, 0.5, ex, -30, 7);
        engGrd.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        engGrd.addColorStop(0.35, pal.accent);
        engGrd.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.globalAlpha = 0.45 + pulse * 0.55;
        ctx.fillStyle = engGrd;
        ctx.beginPath(); ctx.ellipse(ex, -30, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }

      // (5) 舰体受光边缘高光（后缘 + 前缘，增强立体感）
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.30)';
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(-10, -34); ctx.lineTo(10, -34); ctx.stroke();                  // 后缘
      ctx.beginPath(); ctx.moveTo(-18, 24); ctx.lineTo(0, 33); ctx.lineTo(18, 24); ctx.stroke();  // 前缘
    }
    }   // 结束 else（非 harbinger）

    // 切换到未缩放坐标系（血条 / 护盾气泡不随体型变粗）
    ctx.restore();
    ctx.save();
    ctx.translate(e.x, e.y);

    // 蓝色4类护盾：虚化期间显示能量护盾气泡（炮弹穿过、可打到后面的敌人）
    if (e.phase > 0) {
      const rr = Math.max(e.w, e.h) * 0.6;
      const a = 0.4 + Math.sin(state.time * 6) * 0.15;
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#6fe3ff';
      ctx.shadowColor = '#4d9fff';
      ctx.shadowBlur = 18;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, rr, rr * 0.82, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = a * 0.22;
      ctx.fillStyle = '#6fe3ff';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // 血条（测试环境 state.challenge 下敌人每帧回满血、受击时血条会抖动，故不显示；BOSS 血条在 drawBoss 中单独绘制，不受影响）
    if (e.hp < e.maxHp && !state.challenge) {
      const w = e.w;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(-w / 2, -e.h / 2 - 8, w, 3);
      ctx.fillStyle = '#ff9500';
      ctx.fillRect(-w / 2, -e.h / 2 - 8, w * (e.hp / e.maxHp), 3);
    }

    ctx.restore();
  }

  // 暗紫轨迹残影：两边紫色 + 中心黑色 + 随机星芒闪耀，随 life 渐隐
  function drawTrailGhosts() {
    for (const g of trailGhosts) {
      const a = clamp(g.life / g.max, 0, 1);
      if (a <= 0) continue;
      // 锥形尾迹：源头最宽（平方衰减，锥形明显），越老的残影段越细；同时随 life 渐隐
      const w = 0.1 + 0.9 * a * a;
      // 两边紫色（宽线）
      ctx.strokeStyle = `rgba(109, 40, 217, ${(0.55 * a).toFixed(3)})`;
      ctx.lineWidth = g.r * 3.0 * w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(g.x1, g.y1);
      ctx.lineTo(g.x2, g.y2);
      ctx.stroke();
      // 中心黑色（窄线叠加）
      ctx.strokeStyle = `rgba(12, 6, 24, ${(0.9 * a).toFixed(3)})`;
      ctx.lineWidth = g.r * 1.1 * w;
      ctx.beginPath();
      ctx.moveTo(g.x1, g.y1);
      ctx.lineTo(g.x2, g.y2);
      ctx.stroke();
      // 紫色星芒闪耀（部分线段中点，随时间明灭）
      if (g.spark) {
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(state.time * 9 + g.seed * 7));
        const mx = (g.x1 + g.x2) / 2, my = (g.y1 + g.y2) / 2;
        const s = g.r * 1.8 * tw * (0.4 + 0.6 * a);
        ctx.strokeStyle = `rgba(196, 141, 255, ${(0.9 * tw * a).toFixed(3)})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(mx - s, my); ctx.lineTo(mx + s, my);
        ctx.moveTo(mx, my - s); ctx.lineTo(mx, my + s);
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
  }

  function drawBullets() {
    for (const b of pBullets) {
      if (b.wing) {
        // 僚机长条弹幕：沿飞行方向，橙黄(尾)→蓝紫(头)渐变；暴走时额外发光描边
        const ang = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(ang);
        const wg = ctx.createLinearGradient(-b.len / 2, 0, b.len / 2, 0);
        wg.addColorStop(0, b.colorTail);
        wg.addColorStop(0.5, b.colorMid);
        wg.addColorStop(1, b.colorHead);
        ctx.fillStyle = wg;
        ctx.shadowColor = b.colorHead;
        ctx.shadowBlur = b.glow ? 16 : 8;
        const rr = b.r, hl = b.len / 2;
        if (b.glow) {
          // 暴走尾焰：弹尾（-x）延伸的金橙渐变火舌，与主机暴走弹同主题
          const L = b.len * 0.85 + 16;
          const fg = ctx.createLinearGradient(-hl, 0, -hl - L, 0);
          fg.addColorStop(0, 'rgba(255, 205, 120, 0.7)');
          fg.addColorStop(1, 'rgba(255, 110, 199, 0)');
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.moveTo(-hl + rr * 0.6, -rr * 0.75);
          ctx.quadraticCurveTo(-hl - L * 0.45, -rr * 0.9, -hl - L, 0);
          ctx.quadraticCurveTo(-hl - L * 0.45, rr * 0.9, -hl + rr * 0.6, rr * 0.75);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = wg;   // 恢复胶囊体填充色
        }
        ctx.beginPath();
        ctx.moveTo(-hl + rr, -rr);
        ctx.lineTo(hl - rr, -rr);
        ctx.arc(hl - rr, 0, rr, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(-hl + rr, rr);
        ctx.arc(-hl + rr, 0, rr, Math.PI / 2, -Math.PI / 2);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = b.glow ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = b.glow ? 1.4 : 0.8;
        ctx.stroke();
        ctx.restore();
        continue;
      }
      // 弹体渐变与坐标无关（仅颜色/半径），缓存复用；平移到弹位置后按局部坐标绘制
      const top = b.y - b.r * 3;
      const h = b.r * 6;
      if (b.berserk) {
        // 暴走尾焰：弹体后方（飞行反方向）的金橙渐变火舌 + 外围暖光晕（仅暴走期发射的弹携带）
        const L = b.r * 9;
        const fg = ctx.createLinearGradient(b.x, b.y + b.r, b.x, b.y + b.r + L);
        fg.addColorStop(0, 'rgba(255, 236, 175, 0.85)');   // 根部暖白金
        fg.addColorStop(0.4, 'rgba(255, 172, 84, 0.5)');   // 中段金橙
        fg.addColorStop(1, 'rgba(255, 110, 199, 0)');      // 梢部粉光渐隐（呼应暴走主题色）
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(b.x - b.r * 0.85, b.y + b.r * 0.4);
        ctx.quadraticCurveTo(b.x - b.r * 0.5, b.y + b.r + L * 0.55, b.x, b.y + b.r + L);
        ctx.quadraticCurveTo(b.x + b.r * 0.5, b.y + b.r + L * 0.55, b.x + b.r * 0.85, b.y + b.r * 0.4);
        ctx.closePath();
        ctx.fill();
        const halo = ctx.createRadialGradient(b.x, b.y, b.r * 0.5, b.x, b.y, b.r * 3);
        halo.addColorStop(0, 'rgba(255, 214, 130, 0.38)');
        halo.addColorStop(1, 'rgba(255, 150, 80, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.translate(b.x, top);
      ctx.fillStyle = cachedGrad(`p|${b.color}|${b.r}`, () => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#ff6ec7');   // 上：粉色
        g.addColorStop(1, b.color);     // 下：本体色
        return g;
      });
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 8;
      ctx.fillRect(-b.r, 0, b.r * 2, h);
      ctx.restore();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';   // 描边
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x - b.r, top, b.r * 2, h);
    }
    for (const b of eBullets) {
      if (b.trail) {
        // 暗紫光芒包裹：弹体外围径向辉光（源头与轨迹衔接处最亮）
        const halo = ctx.createRadialGradient(b.x, b.y, b.r * 0.3, b.x, b.y, b.r * 2.8);
        halo.addColorStop(0, 'rgba(168, 108, 255, 0.55)');
        halo.addColorStop(0.5, 'rgba(109, 40, 217, 0.30)');
        halo.addColorStop(1, 'rgba(109, 40, 217, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
      if (b.laser) {
        // 法术大师A1 紫色激光：尾端锢定于 (b.x, b.y)，头端圆形；
        // 横向渐变（垂直于长度方向）：两边炫紫 → 中间白，无边框描边
        const ang = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y);   // 尾端位置
        ctx.rotate(ang);
        const L = b.len, lr = b.r;
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 14;
        // 横向渐变（y 轴垂直于飞行方向）：上边绚紫 → 中心白亮 → 下边绚紫
        const lg = ctx.createLinearGradient(0, -lr, 0, lr);
        lg.addColorStop(0, '#a855f7');
        lg.addColorStop(0.28, '#c084fc');
        lg.addColorStop(0.5, '#ffffff');
        lg.addColorStop(0.72, '#c084fc');
        lg.addColorStop(1, '#a855f7');
        ctx.fillStyle = lg;
        ctx.beginPath();
        // 尾端半圆（左侧）
        ctx.arc(0, 0, lr, Math.PI / 2, -Math.PI / 2);
        // 上边线到头端
        ctx.lineTo(L, -lr);
        // 头端半圆（右侧，圆形处理）
        ctx.arc(L, 0, lr, -Math.PI / 2, Math.PI / 2);
        // 下边线回尾端
        ctx.lineTo(0, lr);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (b.len) {
        // 长条弹：沿飞行方向的渐变胶囊体（b.oval 时为椭圆体，风条）
        const ang = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(ang);
        const g = ctx.createLinearGradient(-b.len / 2, 0, b.len / 2, 0);
        g.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
        g.addColorStop(0.5, '#ffffff');
        g.addColorStop(1, b.color);
        ctx.fillStyle = g;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 9;
        if (b.oval) {
          // 椭圆风条：整体呈风的波动感——上下边缘沿椭圆轮廓叠加流动正弦波，内部两条流线
          const half = b.len / 2;
          const edgeY = (px, sgn) => {
            const u = clamp(px / half, -1, 1);
            const base = Math.sqrt(Math.max(0, 1 - u * u)) * b.r;                       // 椭圆轮廓
            const wave = Math.sin(u * 7 + state.time * 14 + (sgn > 0 ? 0 : 2.2)) * b.r * 0.24;   // 风的波动（上下相位错开）
            return sgn * (base + wave);
          };
          ctx.beginPath();
          const SEG = 12;
          for (let k = 0; k <= SEG; k++) {
            const px = -half + (k / SEG) * b.len;
            k === 0 ? ctx.moveTo(px, edgeY(px, -1)) : ctx.lineTo(px, edgeY(px, -1));
          }
          for (let k = SEG; k >= 0; k--) {
            const px = -half + (k / SEG) * b.len;
            ctx.lineTo(px, edgeY(px, 1));
          }
          ctx.closePath();
          ctx.fill();
          ctx.shadowBlur = 0;
          // 内部流线：两条沿长度方向的正弦流线，相位随时间流动（强化“风”的动感）
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
          ctx.lineWidth = 1;
          for (const off of [-0.45, 0.45]) {
            ctx.beginPath();
            for (let k = 0; k <= SEG; k++) {
              const px = -half + (k / SEG) * b.len;
              const u = px / half;
              const y = u * b.r * off + Math.sin(u * 5 + state.time * 15 + off * 5) * b.r * 0.28 * Math.sqrt(Math.max(0, 1 - u * u));
              k === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
            }
            ctx.stroke();
          }
        } else {
          ctx.fillRect(-b.len / 2, -b.r, b.len, b.r * 2);
          ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(255, 235, 220, 0.9)';   // 描边
          ctx.lineWidth = 1;
          ctx.strokeRect(-b.len / 2, -b.r, b.len, b.r * 2);
        }
        ctx.restore();
      } else {
        // 圆弹：大子弹用径向渐变（白核 → 主色 → 暗边）；低级小怪黄弹改为外圈红+内部黄；其余小子弹平涂
        // 径向渐变以弹心为圆心、与坐标无关 → 平移到弹位置后用缓存渐变绘制
        ctx.save();
        ctx.translate(b.x, b.y);
        if (b.r >= 10) {
          ctx.fillStyle = cachedGrad(`big|${b.color}|${b.r}`, () => {
            const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, b.r);
            bg.addColorStop(0, '#ffffff');
            bg.addColorStop(0.35, b.color);
            bg.addColorStop(1, 'rgba(180, 40, 0, 0.9)');
            return bg;
          });
          ctx.shadowColor = b.color;
        } else if (b.color === '#ffd166') {
          // 低级小怪（1/2类）圆弹：外圈红 + 内部黄，更醒目
          ctx.fillStyle = cachedGrad(`d166|${b.r}`, () => {
            const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, b.r);
            bg.addColorStop(0, '#fff6b0');      // 中心亮黄
            bg.addColorStop(0.5, '#ffd166');    // 黄
            bg.addColorStop(0.78, '#ff5a3c');   // 橙红过渡
            bg.addColorStop(1, '#e01b1b');      // 外圈红
            return bg;
          });
          ctx.shadowColor = '#ff3b30';        // 红色辉光，增强辨识度
        } else {
          ctx.fillStyle = b.color;
          ctx.shadowColor = b.color;
        }
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, b.r, 0, Math.PI * 2);
        ctx.fill();
        if (b.r >= 10) {
          // 大子弹外圈发光描边
          ctx.strokeStyle = 'rgba(255, 200, 160, 0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, b.r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    ctx.shadowBlur = 0;
  }

  function drawParticles() {
    for (const p of particles) {
      const t = 1 - p.age / p.life;
      ctx.globalAlpha = clamp(t, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawPowerups() {
    for (const p of powerups) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(state.time * 2);
      const isBerserk = p.kind === 'berserk';
      if (isBerserk) {
        // 暴走道具：红橙渐变 + 脉动强光，格外显眼
        const pulse = 16 + Math.sin(state.time * 10) * 8;
        const g = ctx.createLinearGradient(-p.r, -p.r, p.r, p.r);
        g.addColorStop(0, '#ff2d2d');
        g.addColorStop(1, '#ff8a00');
        ctx.fillStyle = g;
        ctx.shadowColor = '#ff4d1a';
        ctx.shadowBlur = pulse;
      } else {
        ctx.fillStyle = p.kind === 'hp' ? '#66e39a' : p.kind === 'bomb' ? '#ffb545' : p.kind === 'shield' ? '#6fe3ff' : '#ff5ea8';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 12;
      }
      ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = isBerserk ? '#fff3e0' : '#0b1224';
      ctx.font = isBerserk ? 'bold 20px sans-serif' : 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.rotate(-state.time * 2);
      const label = isBerserk ? 'S' : p.kind === 'hp' ? '+' : p.kind === 'bomb' ? 'B' : p.kind === 'shield' ? '◇' : '↑';
      ctx.fillText(label, 0, 1);
      ctx.restore();
    }
  }

  function drawCrystals() {
    for (const c of crystals) {
      ctx.save();
      ctx.translate(c.x, c.y);
      const s = 1 + Math.sin(c.t) * 0.15;
      ctx.scale(s, s);
      ctx.fillStyle = c.giant ? '#e08bff' : '#9be7ff';
      ctx.shadowColor = c.giant ? '#c04dff' : '#4dd0ff';
      ctx.shadowBlur = c.giant ? 16 : 8;
      ctx.beginPath();
      ctx.moveTo(0, -c.r);
      ctx.lineTo(c.r * 0.7, 0);
      ctx.lineTo(0, c.r);
      ctx.lineTo(-c.r * 0.7, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.shadowBlur = 0;
  }

  function render() {
    // 抖动
    ctx.save();
    if (state.shakeTime > 0) {
      const m = state.shakeMag;
      ctx.translate(rand(-m, m), rand(-m, m));
    }

    // 背景
    // 背景（静态渐变，缓存复用）
    ctx.fillStyle = cachedGrad('bg', () => {
      const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      bg.addColorStop(0, '#0a1230');
      bg.addColorStop(1, '#050814');
      return bg;
    });
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    drawStars();
    drawNebulae();
    drawMissileWarns();
        drawZoneMarks();   // 暴风之眼：区域标记 / 风流 / 风柱
            drawStormVortex();   // 暴风之眼：涡流风旋（技能7）
    drawCrystals();
    drawPowerups();
    for (const e of enemies) {
      if (e.type === 'boss') drawBoss(e);
      else drawEnemy(e);
    }
    drawPlayer();
    drawWingmen();
    drawTrailGhosts();
    drawBullets();
    drawMissiles();
    drawBaolingBombs();   // 暴鸰：红色预警圈 + 飞行中的炸弹
    drawPopianFx();       // 破片：红圈预警 + 三连发不可击毁导弹
    drawDouzhiFx();       // 斗志昂扬死亡演出：脱离渐隐蓝盒 + 淡黄扩大光环 + 渐隐本体
    drawParticles();

    // BOSS 警报演出（全屏覆盖层）
    if (state.bossStage === 'warn') drawBossWarning(state.warnT);

    // 炸弹白闪
    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${clamp(flash, 0, 1) * 0.7})`;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // 护盾解除冲击波：从玩家位置迅速扩大到全屏，渐隐消失
    if (shieldBurst.active) {
      const p = shieldBurst.t / shieldBurst.duration;   // 0→1
      const ease = 1 - Math.pow(1 - p, 3);              // easeOutCubic：初始快、末尾慢
      const maxR = 750;                                  // 覆盖全屏对角线
      const r = 36 + ease * maxR;
      const alpha = 1 - p;                               // 线性渐隐
      const lw = 12 * (1 - ease) + 2;                    // 环宽随扩张变细
      ctx.save();
      // 外环：青色发光扩散环
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = '#6fe3ff';
      ctx.shadowColor = '#6fe3ff';
      ctx.shadowBlur = 20 * alpha;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(shieldBurst.x, shieldBurst.y, r, 0, Math.PI * 2);
      ctx.stroke();
      // 内层白色细环（紧跟外环内侧，增加层次）
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, lw * 0.3);
      ctx.beginPath();
      ctx.arc(shieldBurst.x, shieldBurst.y, r * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      // 起始阶段：内部淡青色填充（快速衰减）
      if (p < 0.3) {
        ctx.globalAlpha = (1 - p / 0.3) * 0.25;
        ctx.fillStyle = '#6fe3ff';
        ctx.beginPath();
        ctx.arc(shieldBurst.x, shieldBurst.y, r * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 暴走冲击波：粉橙双环自机体扩散（暴走触发特效，比护盾环更小更亮、聚焦机体）
    if (berserkBurst.active) {
      const p = berserkBurst.t / berserkBurst.duration;
      const ease = 1 - Math.pow(1 - p, 3);
      const maxR = berserkBurst.big ? 190 : 130;
      const r = 12 + ease * maxR;
      const alpha = 1 - p;
      ctx.save();
      // 主环：猩红发光
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = '#ff4d6d';
      ctx.shadowColor = '#ff8a5c';
      ctx.shadowBlur = 24 * alpha;
      ctx.lineWidth = 6 * (1 - ease) + 1.5;
      ctx.beginPath();
      ctx.arc(berserkBurst.x, berserkBurst.y, r, 0, Math.PI * 2);
      ctx.stroke();
      // 外圈金橙细环（层次）
      ctx.globalAlpha = alpha * 0.6;
      ctx.strokeStyle = '#ffb545';
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, 3 * (1 - ease));
      ctx.beginPath();
      ctx.arc(berserkBurst.x, berserkBurst.y, r * 1.18, 0, Math.PI * 2);
      ctx.stroke();
      // 起始闪核：暖白径向光斑快速衰减
      if (p < 0.25) {
        ctx.globalAlpha = (1 - p / 0.25) * 0.8;
        const cg = ctx.createRadialGradient(berserkBurst.x, berserkBurst.y, 0, berserkBurst.x, berserkBurst.y, 46);
        cg.addColorStop(0, 'rgba(255, 245, 230, 0.95)');
        cg.addColorStop(1, 'rgba(255, 90, 60, 0)');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(berserkBurst.x, berserkBurst.y, 46, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // “暴走”字样：置顶图层（最后绘制，位于所有游戏实体之上）
    if (player.alive && player.berserkBanner > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(player.berserkBanner, 0, 1);
      ctx.fillStyle = '#ff4d6d';
      ctx.shadowColor = '#ffb545';
      ctx.shadowBlur = 14;
      ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暴走', player.x, player.y - 42 - (1.5 - Math.min(player.berserkBanner, 1.5)) * 14);
      ctx.restore();
    }

    ctx.restore();

    // 暂停遮罩（由 HTML overlay 接管）
  }
