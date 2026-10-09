// 09c-draw-crystal.js：掉落水晶 3D 精灵烘焙与绘制（《并行开发改造设计.md》批次 2b 自 09-draw-ships.js 拆出）

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：10-draw-world(1 名)
  // 渲染层只读：只进 01x 配置域 / 02-core / 09x 兄弟文件；09x 之间禁止互相 import

  import { CRYSTAL_COLORS, CRYSTAL_GIANT_COLORS } from './01-config-spawn.js';


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

  export {
    getCrystal3DSprite, crystal3DStarDraw,
  };
