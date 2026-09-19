// 10-draw-world：敌机绘制分发 / 双 BOSS 绘制与血条 / 警报演出 / render()

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：13-encyclopedia(1 名) 14-main(1 名)
  //
  import { CANVAS_H, CANVAS_W, CAPITAL_PALETTE, ENEMY_TYPES, GUNSHIP_PALETTE } from './01-config.js';
  import { bossFlow, clamp, crystals, ctx, drawNebulae, drawStars, eBullets, enemies, pBullets, particles, phaseFx, player, playerHitFx, powerups, rand, state, trailGhosts } from './02-core.js';
  import { berserkBurst, bombBurst, shieldBurst } from './08-entities.js';
  import { drawAnvilBody, drawBaolingBody, drawBaolingBombs, drawCubeHitFx, drawDouzhiBody, drawDouzhiFx, drawDuskStrikerBody, drawFashiA1Body, drawFashiA2Body, drawFashiArrayBody, drawFashiMatrixBody, drawHanshuangBody, drawHarbingerBody, drawJiaoxiangBody, drawMissileWarns, drawMissiles, drawPlayer, drawPlayerHitFx, drawPopianBody, drawPopianFx, drawSlashFx, drawSpellCubes, drawStarslayerBeam, drawWeilongBody, drawWingmen, drawYu4Body } from './09-draw-ships.js';
  import { drawBoss, drawBossWarning, drawStormVortex, drawTornado, drawZoneMarks } from './11-draw-boss.js';



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
    } else if (e.type === 'fashiA2') {
      drawFashiA2Body(e);     // 自带填充与描边（A1 强化版：炫紫更白亮 + 紫心风扇圆 + 更粗更长炮管）
    } else if (e.type === 'popian') {
      drawPopianBody(e);      // 自带填充与描边（灰白金属菱形边框 + 中心黑杠红头 + 底部双黑炮管）
    } else if (e.type === 'fashiMatrix') {
      drawFashiMatrixBody(e); // 自带填充与描边（竖菱形白红渐变外体 + 细黑菱形环 + 白红核心）
    } else if (e.type === 'fashiArray') {
      drawFashiArrayBody(e);  // 自带填充与描边（三座法术矩阵样式菱形 + 灰黑底座；中央血红色带流动特效）
    } else if (e.type === 'jiaoxiang') {
      drawJiaoxiangBody(e);   // 自带填充与描边（橙火红渐变环 + 火焰光环 + 三根旋转横杠 + 白圆；见 09-draw-ships）
    } else if (e.type === 'striker' && e.skill === 'dusk') {
      drawDuskStrikerBody(e); // 自带填充与描边（暗黑渐变菱形 + 微亮描边 + 中央白色发光核心；渐显/渐隐透明度内含）
    } else {
    if (e.type === 'side' && e.behavior === 'moon') {
      // 赤月侧翼艇：红色箭镖，造型与其他 1类完全一致，仅将顶角精确旋转到当前航向（= 子弹发射方向）
      // 自带填充与描边（分支内完整绘制），末尾清空路径让尾部公共 fill/stroke 空跑
      const v = e._sideVel || { vx: 0, vy: 60 };
      ctx.rotate(Math.atan2(v.vy, v.vx) - Math.PI / 2);   // 造型默认顶角朝下（+y），旋转到航向
      ctx.beginPath();
      ctx.moveTo(0, 11);
      ctx.lineTo(11, -7);
      ctx.lineTo(0, -3);
      ctx.lineTo(-11, -7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // 赤色月核：中央淡红小月牙（点明"赤月"之名，不影响轮廓）
      ctx.fillStyle = 'rgba(255, 224, 224, 0.9)';
      ctx.beginPath();
      ctx.arc(0, 1.5, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(-1, 0.7, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();   // 清空路径：尾部公共 fill/stroke 空跑（本体已在分支内绘制完毕）
    } else if (e.type === 'side' || e.type === 'prolifera') {
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
      // 卫护飞船：深蓝紫渐变等腰三角（指向飞行方向）+ 紫色边缘光芒（与浅蓝水晶明确区分）
      const tilt = e._sideVel ? (e._sideVel.vx > 0 ? -0.35 : 0.35) : 0;
      ctx.rotate(tilt);
      ctx.beginPath();
      ctx.moveTo(0, 5.5);
      ctx.lineTo(3.75, -5.5);
      ctx.lineTo(-3.75, -5.5);
      ctx.closePath();
      const escG = ctx.createLinearGradient(0, 5.5, 0, -5.5);   // 尾深顶亮的蓝紫渐变
      escG.addColorStop(0, '#2b2f77');    // 深蓝紫（尾部）
      escG.addColorStop(0.55, '#4a49b8'); // 蓝紫
      escG.addColorStop(1, '#8a63ff');    // 亮紫（顶角）
      ctx.fillStyle = escG;
      ctx.shadowColor = '#9a6bff';        // 边缘紫色光芒
      ctx.shadowBlur = 7;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(196, 160, 255, 0.95)';   // 紫色发光描边
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.beginPath();   // 清空路径：尾部公共 fill/stroke 空跑
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
      // 横向装甲缝：去掉穿过核心的 y=2；蓝4 去掉 y=-14（仅留 y=18）；赤金去掉靠近核心的上下两条（-14/18 全去）
      const seams = e.variant === 'azure' ? [18] : e.variant === 'crgold' ? [] : [-14, 18];
      for (const yy of seams) {
        ctx.beginPath(); ctx.moveTo(-17, yy); ctx.lineTo(17, yy); ctx.stroke();
      }
      // 舰体-机翼接缝竖线（±19）：显式重描——机翼填充会盖掉舰体描边的外半侧，且离屏缩放贴图中
      // 1.2px 细线易被降采样吞掉（左右相位不同可能只吞一侧）；显式绘制保证左右两条都清晰可见
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const sx of [-1, 1]) {
        ctx.moveTo(sx * 19, -21);
        ctx.lineTo(sx * 19, 25);
      }
      ctx.stroke();
      // 两侧斜向分块已移入翼面绘制（随折翼变形）

      // (2) 变体涂装光带：赤红 = 两侧 V 形光带；苍蓝 = 横向甲板灯带；赤金 = 旋转双环（金曜炮艇风格放大版）
      ctx.shadowColor = pal.glow;
      ctx.shadowBlur = 9;
      ctx.globalAlpha = 0.5 + pulse * 0.4;
      if (e.variant === 'azure') {
        ctx.strokeStyle = pal.accent;                     // 横向甲板灯带（限制在舰体宽度 ±17 内）
        ctx.lineWidth = 2.2;
        for (const yy of [-20, 14]) {
          ctx.beginPath(); ctx.moveTo(-17, yy); ctx.lineTo(17, yy); ctx.stroke();
        }
      } else if (e.variant === 'crgold') {
        // 赤金：环绕舰体的旋转双环（金曜炮艇的双环放大版）——施放「金环扩散」消耗一枚，环数随剩余递减；
        // 机翼展开完成后才逐渐显现（ringT 渐入）
        const reveal = clamp((e.ringT || 0) / 0.8, 0, 1);
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 2.4;
        ctx.globalAlpha *= reveal;
        const ringRot = state.time * 1.5 + (e.wobble || 0);
        for (let i = 0; i < (e.ringsLeft || 0); i++) {
          ctx.beginPath();
          ctx.ellipse(0, 0, 30 - i * 3, 22 - i * 2.5, ringRot + i * Math.PI / 2, 0, Math.PI * 2);
          ctx.stroke();
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

      // 赤金「金环扩散」：扩大中的金色圆环（世界半径 → 局部坐标）——本体随进度逐渐变淡，带旋转虚线外环；
      // 到达最大范围即刻消散（无停顿阶段）；被斩断（broken）后分裂为两段弧、断口张开 + 外飘快速淡出
      if (e.ringWave) {
        const w = e.ringWave;
        const lwR = w.r / (ENEMY_TYPES.capital.drawScale || 1);
        if (w.broken) {
          const k = clamp(w.fadeT / w.fadeDur, 0, 1);
          const gap = 0.3 + k * 1.1;   // 断口随消散张开（敌机绘制无旋转，doSlash 记录的世界角可直接使用）
          const rr = lwR + k * 16;
          ctx.save();
          ctx.strokeStyle = pal.accent;
          ctx.shadowColor = pal.glow;
          ctx.shadowBlur = 14 * (1 - k);
          ctx.lineWidth = Math.max(0.5, 3.2 * (1 - k));
          ctx.globalAlpha = (0.55 + pulse * 0.45) * (1 - k);
          const span1 = w.span - gap * 2, span2 = Math.PI * 2 - w.span - gap * 2;
          if (span1 > 0.05) { ctx.beginPath(); ctx.arc(0, 0, rr, w.angA + gap, w.angA + gap + span1); ctx.stroke(); }
          if (span2 > 0.05) { ctx.beginPath(); ctx.arc(0, 0, rr, w.angA + w.span + gap, w.angA + w.span + gap + span2); ctx.stroke(); }
          ctx.restore();
        } else {
          const prog = clamp(w.t / w.dur, 0, 1);
          const fade = 1 - prog * 0.55;   // 扩环期间本体逐渐变淡（结束时已淡至 45%，随即消散）
          ctx.save();
          ctx.globalAlpha = (0.55 + pulse * 0.45) * fade;
          ctx.strokeStyle = pal.accent;
          ctx.shadowColor = pal.glow;
          ctx.shadowBlur = 16;
          ctx.lineWidth = 3.2;
          ctx.beginPath(); ctx.arc(0, 0, lwR, 0, Math.PI * 2); ctx.stroke();
          // 旋转虚线外环（扩散动感）
          ctx.globalAlpha = 0.5 * fade;
          ctx.lineWidth = 1.6;
          ctx.setLineDash([10, 14]);
          ctx.lineDashOffset = -state.time * 40;
          ctx.beginPath(); ctx.arc(0, 0, lwR + 9, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
          // 内侧淡金衬环
          ctx.globalAlpha = 0.22 * fade;
          ctx.lineWidth = 7;
          ctx.beginPath(); ctx.arc(0, 0, lwR, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }
      }

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

    // 血条：受伤后 0.15s 渐显、回满后渐隐（barT 由 updateEnemies 推进）；
    // 白色残量为受击追踪余像（hpTrail 缓慢追赶 hp，同 BOSS 血条实现）；BOSS 血条在 drawBoss 中单独绘制
    if ((e.barT || 0) > 0.01) {
      const w = e.w;
      const hpR = clamp(e.hp / e.maxHp, 0, 1);
      const trailR = clamp((e.hpTrail != null ? e.hpTrail : e.hp) / e.maxHp, 0, 1);
      ctx.globalAlpha = e.barT;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(-w / 2, -e.h / 2 - 8, w, 3);
      if (trailR > hpR) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-w / 2 + w * hpR, -e.h / 2 - 8, w * (trailR - hpR), 3);
      }
      ctx.fillStyle = '#ff9500';
      ctx.fillRect(-w / 2, -e.h / 2 - 8, w * hpR, 3);
      ctx.globalAlpha = 1;
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
        // 僚机长条弹幕：沿飞行方向，尾→头渐变；尾焰长度/亮度随 flameMul（0~1）增长，暴走（=1）最强
        //   群星允诺：旋转胶囊体（暖色尾焰）；守愿者(oval)：椭圆体（冷色尾焰；暴走弹金红尾焰）
        const ang = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(ang);
        const wg = ctx.createLinearGradient(-b.len / 2, 0, b.len / 2, 0);
        wg.addColorStop(0, b.colorTail);
        wg.addColorStop(0.5, b.colorMid);
        wg.addColorStop(1, b.colorHead);
        const fm0 = b.flameMul != null ? b.flameMul : (b.glow ? 1 : 0);   // 未标 flameMul 的弹沿用 glow 语义（暴走=1 / 常规=0）
        // 出膛渐入：尾焰/辉光随离舱距离展开（前 60px 线性）——避免新射出的弹把金红尾焰扫在僚机盾面与本体上
        const fm = b.sy != null ? fm0 * clamp(Math.hypot(b.x - b.sx, b.y - b.sy) / 60, 0, 1) : fm0;
        ctx.fillStyle = wg;
        ctx.shadowColor = b.colorHead;
        ctx.shadowBlur = 8 + 8 * fm;
        const rr = b.r, hl = b.len / 2;
        if (fm > 0) {
          // 尾焰：弹尾（-x）延伸的渐变火舌，长度与根部亮度随 flameMul 增长（Lv5 暴走 1.0 = 原暴走尾焰）
          //   flameLenMul：仅长度的额外系数（群星允诺 Lv1~4 收短 35%，暴走弹为 1）
          const L = (b.len * 0.85 + 16) * fm * (b.flameLenMul || 1);
          const fa = 0.4 + 0.6 * fm;
          const fg = ctx.createLinearGradient(-hl, 0, -hl - L, 0);
          if (b.oval) {   // 守愿者：冷蓝尾焰（暴走金红弹随配色金红化）
            if (b.berserkFire) {
              fg.addColorStop(0, `rgba(255, 214, 130, ${(0.8 * fa).toFixed(3)})`);
              fg.addColorStop(1, 'rgba(230, 57, 42, 0)');
            } else {
              fg.addColorStop(0, `rgba(190, 230, 255, ${(0.75 * fa).toFixed(3)})`);
              fg.addColorStop(1, 'rgba(60, 150, 255, 0)');
            }
          } else {        // 群星允诺：金橙尾焰
            fg.addColorStop(0, `rgba(255, 205, 120, ${(0.7 * fa).toFixed(3)})`);
            fg.addColorStop(1, 'rgba(255, 110, 199, 0)');
          }
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
        if (b.oval) {
          // 椭圆体（守愿者）：沿飞行方向的椭圆轮廓
          ctx.ellipse(0, 0, hl, rr, 0, 0, Math.PI * 2);
        } else {
          // 旋转胶囊体（群星允诺）
          ctx.moveTo(-hl + rr, -rr);
          ctx.lineTo(hl - rr, -rr);
          ctx.arc(hl - rr, 0, rr, -Math.PI / 2, Math.PI / 2);
          ctx.lineTo(-hl + rr, rr);
          ctx.arc(-hl + rr, 0, rr, Math.PI / 2, -Math.PI / 2);
          ctx.closePath();
        }
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.5 + 0.4 * fm).toFixed(3)})`;
        ctx.lineWidth = 0.8 + 0.6 * fm;
        ctx.stroke();
        ctx.restore();
        continue;
      }
      // 弹体渐变与坐标无关（仅颜色/半径），缓存复用；平移到弹位置后按局部坐标绘制
      const top = b.y - b.r * 3;
      const h = b.r * 6;
      { // 子弹尾焰：金橙火舌 + 暖光晕，长度随发射时武器等级增长（Lv1~5，暴走弹最长）
        // 暴走尾焰：弹体后方（飞行反方向）的金橙渐变火舌 + 外围暖光晕（仅暴走期发射的弹携带）
        const lv = b.lv || (b.berserk ? 5 : 1);
      const L = b.r * (2.6 + lv * 2.1) * (lv >= 5 ? 1 : 0.85);   // Lv1~4 尾焰 -15%，Lv5 暴走弹保持原长
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
        // 法术大师A1/A2 紫色激光：尾端锢定于 (b.x, b.y)，头端圆形；
        // 横向渐变（垂直于长度方向）：两边炫紫 → 中间白，无边框描边；A2（laserBright）更亮更醒目
        const bright = !!b.laserBright;
        const ang = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y);   // 尾端位置
        ctx.rotate(ang);
        const L = b.clipLen != null ? Math.min(b.len, b.clipLen) : b.len, lr = b.r;   // 守愿者白盾截断：只画尾端→盾交点
        ctx.shadowColor = bright ? '#d8b4fe' : '#a855f7';
        ctx.shadowBlur = bright ? 22 : 14;
        // 横向渐变（y 轴垂直于飞行方向）：上边绚紫 → 中心白亮 → 下边绚紫（A2 边缘更浅更亮）
        const lg = ctx.createLinearGradient(0, -lr, 0, lr);
        lg.addColorStop(0, bright ? '#c084fc' : '#a855f7');
        lg.addColorStop(0.28, bright ? '#e9d5ff' : '#c084fc');
        lg.addColorStop(0.5, '#ffffff');
        lg.addColorStop(0.72, bright ? '#e9d5ff' : '#c084fc');
        lg.addColorStop(1, bright ? '#c084fc' : '#a855f7');
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

  // 碎盾特效（群星之杀斩碎虚化护盾）：白热闪核 + 三角碎片自机体中心加速迸射（带自旋）
  function drawPhaseFx() {
    for (const f of phaseFx) {
      const p = 1 - f.t / f.max;
      const a = 1 - p;
      const age = f.max - f.t;   // 特效已播时长（供位移/自旋积分）
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // 起始白热闪核（前 40% 快速衰减）
      if (p < 0.4) {
        const q = p / 0.4;
        const fr = f.r * (1.4 + 1.1 * q);
        const cg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, fr);
        cg.addColorStop(0, `rgba(240, 250, 255, ${(0.95 * (1 - q)).toFixed(3)})`);
        cg.addColorStop(0.5, `rgba(170, 220, 255, ${(0.55 * (1 - q)).toFixed(3)})`);
        cg.addColorStop(1, 'rgba(140, 200, 255, 0)');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(f.x, f.y, fr, 0, Math.PI * 2); ctx.fill();
      }
      // 三角碎片：v0·age + ½·acc·age² 加速外飞，尖端朝外、随机方向自旋
      const tl = 4 + f.r * 0.22, tw = 1.8 + f.r * 0.09;   // 碎片长 / 半宽（随目标体型）
      ctx.fillStyle = 'rgba(210, 238, 255, 0.6)';
      ctx.strokeStyle = 'rgba(240, 250, 255, 0.72)';
      ctx.shadowColor = 'rgba(140, 205, 255, 1)';
      ctx.shadowBlur = 8 * a;
      ctx.lineWidth = Math.max(0.6, 1.4 * a);
      for (const s of f.shards) {
        const dist = s.v0 * age + 0.5 * s.acc * age * age;
        const sx = f.x + Math.cos(s.a) * dist, sy = f.y + Math.sin(s.a) * dist;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(s.a + s.w * age);
        ctx.globalAlpha = a * 0.82;
        ctx.beginPath();
        ctx.moveTo(tl, 0);
        ctx.lineTo(-tl * 0.45, tw);
        ctx.lineTo(-tl * 0.45, -tw);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
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

  // ---------- 掉落道具形象（矢量图标版）----------
  // kit=粉色徽章·双箭头 / berserk=透明徽章·红橙流动渐变边框+大"S" / shield=青色六边护徽·◇ / hp=绿色圆徽·医疗十字 / bomb=橙色圆球·引信火花
  // 共通：呼吸扩散光环 + 个体相位（按位置区分，免加字段）；道具本体静止不晃
  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function powerupColors(kind) {
    switch (kind) {
      case 'berserk': return { base: '#ff4d1a', hi: '#ff9a3d', dark: '#d41d0f', glow: '#ff4d1a' };
      case 'shield':  return { base: '#6fe3ff', hi: '#d6f7ff', dark: '#2bb5dd', glow: '#6fe3ff' };
      case 'hp':      return { base: '#66e39a', hi: '#d2ffe6', dark: '#2ea86a', glow: '#66e39a' };
      case 'bomb':    return { base: '#ffb545', hi: '#ffe3ad', dark: '#e07800', glow: '#ff9a2e' };
      default:        return { base: '#ff5ea8', hi: '#ffc0dd', dark: '#e0256f', glow: '#ff5ea8' };   // kit
    }
  }

  function drawPowerups() {
    for (const p of powerups) {
      const t = state.time;
      const ph = p.x * 0.07 + p.y * 0.11;
      const col = powerupColors(p.kind);
      const isBerserk = p.kind === 'berserk';
      ctx.save();
      ctx.translate(p.x, p.y);   // 本体静止：不做浮沉/摆动

      // ① 呼吸扩散光环：每 1.4s 一圈自 r+2 扩至 r+10 淡出
      const rp = (t * 0.7 + ph * 0.31) % 1;
      ctx.strokeStyle = col.glow;
      ctx.globalAlpha = (1 - rp) * (isBerserk ? 0.5 : 0.32);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, p.r + 2 + rp * 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.shadowColor = col.glow;
      ctx.shadowBlur = isBerserk ? 14 + Math.sin(t * 10) * 6 : 11;

      if (p.kind === 'kit') {
        // 升级套件：粉色圆角徽章 + 白色双上箭头
        const g = ctx.createLinearGradient(0, -p.r, 0, p.r);
        g.addColorStop(0, col.hi);
        g.addColorStop(0.55, col.base);
        g.addColorStop(1, col.dark);
        ctx.fillStyle = g;
        roundRectPath(ctx, -p.r, -p.r, p.r * 2, p.r * 2, p.r * 0.38);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1;
        roundRectPath(ctx, -p.r + 1.5, -p.r + 1.5, p.r * 2 - 3, p.r * 2 - 3, p.r * 0.3);
        ctx.stroke();
        // 双箭头（上小下大，向上的动势）
        ctx.strokeStyle = '#ffffff';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = p.r * 0.26;
        for (let i = 0; i < 2; i++) {
          const cy = i === 0 ? -p.r * 0.34 : p.r * 0.26;
          const w = i === 0 ? p.r * 0.4 : p.r * 0.52;
          ctx.beginPath();
          ctx.moveTo(-w, cy + p.r * 0.26);
          ctx.lineTo(0, cy - p.r * 0.26);
          ctx.lineTo(w, cy + p.r * 0.26);
          ctx.stroke();
        }
      } else if (isBerserk) {
        // 暴走：透明圆角徽章——红橙流动渐变细边框 + 同色大 "S"（内部透明、本体静止）
        const ang = t * 0.6 + ph;
        const L = p.r * 1.6;
        const g = ctx.createLinearGradient(-Math.cos(ang) * L, -Math.sin(ang) * L, Math.cos(ang) * L, Math.sin(ang) * L);
        g.addColorStop(0, '#ff3b2d');
        g.addColorStop(0.5, '#ff7a1a');
        g.addColorStop(1, '#ffb340');
        // 边框：同款流动渐变细描边，颜色更淡（半透明）
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#ff4d1a';
        ctx.shadowBlur = 8;
        roundRectPath(ctx, -p.r, -p.r, p.r * 2, p.r * 2, p.r * 0.38);
        ctx.stroke();
        ctx.globalAlpha = 1;
        // 大 "S"：同款流动渐变填充，按实际字形包围盒精确居中
        ctx.fillStyle = g;
        ctx.font = `bold ${Math.round(p.r * 1.5)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        const m = ctx.measureText('S');
        const dx = (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2;
        const dy = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
        ctx.fillText('S', dx, dy);
      } else if (p.kind === 'shield') {
        // 量子护盾：青色六边护徽 + 白色◇核心 + 旋转虚线环（科技感）
        const g = ctx.createLinearGradient(0, -p.r * 1.15, 0, p.r * 1.15);
        g.addColorStop(0, col.hi);
        g.addColorStop(0.55, col.base);
        g.addColorStop(1, col.dark);
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = Math.PI / 3 * i - Math.PI / 2;
          const px = Math.cos(ang) * p.r * 1.15, py = Math.sin(ang) * p.r * 1.15;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        const d = p.r * 0.48;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0, -d);
        ctx.lineTo(d * 0.7, 0);
        ctx.lineTo(0, d);
        ctx.lineTo(-d * 0.7, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(111,227,255,0.6)';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 5]);
        ctx.lineDashOffset = -t * 22;
        ctx.beginPath();
        ctx.arc(0, 0, p.r * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (p.kind === 'hp') {
        // 加血：绿色光泽圆徽 + 白色医疗十字
        const g = ctx.createRadialGradient(-p.r * 0.35, -p.r * 0.35, p.r * 0.2, 0, 0, p.r * 1.1);
        g.addColorStop(0, col.hi);
        g.addColorStop(0.6, col.base);
        g.addColorStop(1, col.dark);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, p.r * 1.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, p.r * 0.86, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        const cw = p.r * 0.34, cl = p.r * 0.62;
        roundRectPath(ctx, -cw / 2, -cl, cw, cl * 2, cw * 0.4);
        ctx.fill();
        roundRectPath(ctx, -cl, -cw / 2, cl * 2, cw, cw * 0.4);
        ctx.fill();
      } else {
        // 高能爆弹：橙色圆角徽章 + 白色描边 + 中央大 "B"（与套件/暴走徽章同风格，去掉旧炸弹造型）
        const g = ctx.createLinearGradient(0, -p.r, 0, p.r);
        g.addColorStop(0, col.hi);
        g.addColorStop(0.55, col.base);
        g.addColorStop(1, col.dark);
        ctx.fillStyle = g;
        roundRectPath(ctx, -p.r, -p.r, p.r * 2, p.r * 2, p.r * 0.38);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1;
        roundRectPath(ctx, -p.r + 1.5, -p.r + 1.5, p.r * 2 - 3, p.r * 2 - 3, p.r * 0.3);
        ctx.stroke();
        // 大 "B"：白色，按实际字形包围盒精确居中，带轻微呼吸缩放
        const pulse = 1 + Math.sin(t * 4 + ph) * 0.05;
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(p.r * 1.45 * pulse)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        const m = ctx.measureText('B');
        const dx = (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2;
        const dy = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
        ctx.fillText('B', dx, dy);
      }

      ctx.restore();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
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

  // 测试模式（图鉴挑战·敌人测试）顶部血条：仅当场上恰好 1 个测试目标时显示（多目标时渐隐），
  // 出现/消失各 0.15s 渐显渐隐；白色残量为受击追踪余像（同 BOSS 血条 hpTrail 实现）。
  // BOSS 测试不画此条（BOSS 在 drawBoss 中已有专属顶部血条）
  let cbLastT = null, cbAlpha = 0, cbTrail = null, cbRef = null;
  function drawChallengeBar() {
    const active = !!(state.challenge && state.challenge.kind === 'enemy' && enemies.length === 1);
    const now = state.time;
    const dt = cbLastT == null ? 0 : Math.max(0, Math.min(0.1, now - cbLastT));
    cbLastT = now;
    cbAlpha = clamp(cbAlpha + (active ? dt : -dt) / 0.15, 0, 1);
    if (cbAlpha <= 0.01) { cbTrail = null; cbRef = null; return; }
    const e = enemies[0];
    if (!e) return;
    if (e !== cbRef) { cbRef = e; cbTrail = e.hp; }   // 目标更替（被击杀后重生/按 + 召唤）：残量重置
    cbTrail += (e.hp - cbTrail) * Math.min(1, dt * 2.2);
    const w = 300, h = 9, x = (CANVAS_W - w) / 2, y = 10;
    const hpR = clamp(e.hp / e.maxHp, 0, 1);
    const trailR = clamp(cbTrail / e.maxHp, 0, 1);
    ctx.save();
    ctx.globalAlpha = cbAlpha;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(x, y, w, h);
    if (trailR > hpR) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + w * hpR, y, w * (trailR - hpR), h);
    }
    ctx.fillStyle = '#ff9500';
    ctx.fillRect(x, y, w * hpR, h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    ctx.fillStyle = '#eaf2ff';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('测试目标 ' + Math.ceil(e.hp) + ' / ' + e.maxHp, CANVAS_W / 2, y + h + 12);
    ctx.restore();
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
    drawStarslayerBeam();   // 群星之杀：机头淡白锁定光束（敌机之上、玩家之下）
    drawPlayer();
    drawWingmen();
    drawTrailGhosts();
    drawBullets();
    drawMissiles();
    drawBaolingBombs();   // 暴鸰：红色预警圈 + 飞行中的炸弹
    drawPopianFx();       // 破片：红圈预警 + 三连发不可击毁导弹
    drawSpellCubes();     // 法术矩阵：发光正方体（白光体 + 红光棱边，限程后黯淡渐隐）
    drawCubeHitFx();      // 法术矩阵：正方体命中玩家的击中特效（白热闪核 + 红色冲击波环）
    drawPhaseFx();        // 碎盾特效（群星之杀斩碎虚化护盾）：白热闪核 + 冰蓝冲击环 + 飞散弧形碎片
    drawPlayerHitFx();    // 命中玩家特效（白热闪核 + 红橙冲击环 + 迸溅火花线）
    drawDouzhiFx();       // 斗志昂扬死亡演出：脱离渐隐蓝盒 + 淡黄扩大光环 + 渐隐本体
    drawSlashFx();        // 群星之杀：空间斩击特效（交叉斩痕 + 冲击环，渐隐）
    drawParticles();
    drawChallengeBar();   // 测试模式：顶部测试目标血条（图鉴挑战·敌人测试）

    // BOSS 警报演出（全屏覆盖层）
    if (bossFlow.stage === 'warn') drawBossWarning(bossFlow.warnT);

    // 炸弹白闪
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${clamp(state.flash, 0, 1) * 0.7})`;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // 受击红晕：屏幕四周泛红（命中玩家时叠加，14-main 随时间衰减）
    if (state.hurt > 0) {
      const k = clamp(state.hurt, 0, 1);
      const hg = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.34, CANVAS_W / 2, CANVAS_H / 2, Math.max(CANVAS_W, CANVAS_H) * 0.62);
      hg.addColorStop(0, 'rgba(255, 36, 58, 0)');
      hg.addColorStop(0.75, `rgba(255, 30, 52, ${(0.16 * k).toFixed(3)})`);
      hg.addColorStop(1, `rgba(255, 26, 48, ${(0.45 * k).toFixed(3)})`);
      ctx.fillStyle = hg;
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

    // 高能爆弹火圈（测试模式）：橙黄火环自场地中心急速扩大至全场，同时渐隐
    if (bombBurst.active) {
      const p = bombBurst.t / bombBurst.duration;   // 0→1
      const ease = 1 - Math.pow(1 - p, 2.2);        // easeOut：急速扩张、末段减速
      const cx = CANVAS_W / 2, cy = CANVAS_H / 2;
      const maxR = Math.hypot(CANVAS_W, CANVAS_H) / 2 + 40;   // 覆盖全屏对角线
      const r = 16 + ease * maxR;
      const alpha = 1 - p;
      ctx.save();
      // 火浪内衬：紧贴火环内侧的橙黄径向渐变（跟随火圈推进，火焰余晖感）
      const fg = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
      fg.addColorStop(0, 'rgba(255,150,40,0)');
      fg.addColorStop(0.72, `rgba(255,140,40,${(0.10 * alpha).toFixed(3)})`);
      fg.addColorStop(1, `rgba(255,200,80,${(0.22 * alpha).toFixed(3)})`);
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      // 主火环：橙黄发光粗环（宽度随扩张收窄）
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = '#ffb340';
      ctx.shadowColor = '#ff9a2e';
      ctx.shadowBlur = 26 * alpha;
      ctx.lineWidth = 20 * (1 - ease) + 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      // 内侧亮黄细环（层次）
      ctx.globalAlpha = alpha * 0.7;
      ctx.strokeStyle = '#ffe680';
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, 6 * (1 - ease) + 1);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
      ctx.stroke();
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

  export {
    gradCache, cachedGrad, drawEnemy, drawTrailGhosts, drawBullets, drawParticles,
    drawPowerups, drawCrystals, render,
  };