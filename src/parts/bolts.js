/* 螺栓：M12 / M8 两种规格，按连接位置分几种叠层厚度；每次重建由各构件登记位置，最后统一画成实例化网格 */
(function () {
  'use strict';
  const PV = window.PV;
  const { MM, V3, FIX, JOINT, CLIP, CLAMP, M } = PV;

  // 螺栓组：局部 z 为螺栓轴线、指向螺母一侧，z=0 在螺母一侧被连接件的外表面。
  // 零件：垫圈、螺母、露出的螺杆、另一侧的螺栓头；可选长圆孔（沿局部 y，画在开孔那块板的表面上，at 为这些表面的局部 z）。
  // opt.len：按公称长度（螺栓头支承面到杆端）画杆长，不给就在螺母外露 out；opt.headWasher：螺栓头下也垫一个平垫；
  // opt.socket：内六角圆柱头（sk：头径 d、头高 k、内六角对边 s）；opt.spring：平垫和螺母之间加一个弹垫（sw：内外半径、厚，GB 93）
  const BOLT_SIZE = {
    12: { wr: 12, wt: 2.5, af: 18, nh: 10.8, r: 6, hh: 7.5, out: 6, sw: { ri: 6.1, ro: 9.2, t: 3.1 } },
    8: { wr: 8, wt: 1.6, af: 13, nh: 6.5, r: 4, hh: 5.3, out: 4, sk: { d: 13, k: 8, s: 6 } },
  };
  // 弹垫：开口的圆环，开口在局部 x-y 平面的左上方（节点正视图里看得见），从 z0 起厚 sw.t
  function springWasher(sw, z0) {
    const gap = 0.12, a0 = (3 * Math.PI) / 4 + gap, a1 = a0 + 2 * Math.PI - 2 * gap;
    const s = new THREE.Shape();
    s.absarc(0, 0, sw.ro * MM, a0, a1, false);
    s.absarc(0, 0, sw.ri * MM, a1, a0, true);
    const g = new THREE.ExtrudeGeometry(s, { depth: sw.t * MM, bevelEnabled: false, curveSegments: 32 });
    g.translate(0, 0, z0 * MM);
    return g;
  }
  function boltKind(size, stack, slot, opt) {
    const o = opt || {}, b = BOLT_SIZE[size], hexR = b.af / Math.sqrt(3);
    const nut = b.wt + (o.spring ? b.sw.t : 0), top = nut + b.nh;   // 螺母底面、顶面
    const back = -stack - (o.headWasher ? b.wt : 0);    // 螺栓头支承面
    const hh = o.socket ? b.sk.k : b.hh;
    const cyl = (r, z0, z1, seg, r1) => {   // r1：z1 一端的半径（倒角用），不给就是圆柱
      const g = new THREE.CylinderGeometry((r1 === undefined ? r : r1) * MM, r * MM, (z1 - z0) * MM, seg);
      g.rotateX(Math.PI / 2);
      g.translate(0, 0, ((z0 + z1) / 2) * MM);
      return g;
    };
    const parts = [
      [cyl(b.wr, 0, b.wt, 24), M.boltSteel],
      [cyl(hexR, nut, top, 6), M.boltSteel],
      [cyl(b.r, back - hh, o.len ? back + o.len : top + b.out, 16), M.boltSteel],
      o.socket ? [cyl(b.sk.d / 2, back - hh + 0.6, back, 24), M.boltSteel] : [cyl(hexR, back - hh, back, 6), M.boltSteel],
    ];
    if (o.headWasher) parts.push([cyl(b.wr, back, -stack, 24), M.boltSteel]);
    if (o.spring) parts.push([springWasher(b.sw, b.wt), M.boltSteel]);
    if (o.socket) {
      parts.push([cyl(b.sk.d / 2 - 0.6, back - hh, back - hh + 0.6, 24, b.sk.d / 2), M.boltSteel]);   // 头顶倒角
      parts.push([cyl(b.sk.s / Math.sqrt(3), back - hh - 0.2, back - hh + 4, 6), M.slot]);           // 内六角孔
    }
    if (slot) {
      const w = (JOINT.slotW / 2) * MM, l = ((slot.len - JOINT.slotW) / 2) * MM;
      const s = new THREE.Shape();
      s.moveTo(w, -l);
      s.lineTo(w, l);
      s.absarc(0, l, w, 0, Math.PI, false);
      s.lineTo(-w, -l);
      s.absarc(0, -l, w, Math.PI, Math.PI * 2, false);
      for (const z of slot.at) {
        const g = new THREE.ShapeGeometry(s, 12);
        g.translate(0, 0, z * MM);
        parts.unshift([g, M.slot]);
      }
    }
    return parts;
  }
  // M12 螺栓的螺母下都是一个平垫、一个弹垫（节点图）
  const BOLTS = {
    // 斜撑-立柱：连接板 + 腹板，长圆孔在连接板上（螺母一侧）
    foot: boltKind(12, JOINT.plateT + FIX.post.t, { at: [0.4], len: JOINT.slotL }, { spring: true }),
    // 立柱-斜梁：螺母在斜梁腹板一侧，竖向长圆孔开在立柱腹板上：画在立柱腹板贴着斜梁的那面（节点图里斜梁半透明，看得见）
    // 和立柱槽里那面
    top: boltKind(12, FIX.beam.t + FIX.post.t, { at: [-FIX.beam.t, -FIX.beam.t - FIX.post.t - 0.4], len: 40 }, { spring: true }),
    btop: boltKind(12, FIX.beam.t + FIX.brace.t, null, { spring: true }),              // 斜撑-斜梁
    clip: boltKind(12, CLIP.t + FIX.beam.t, null, { spring: true }),                   // 檩托两处叠层都是 4+2
    // 组件安装孔：M8×22 外六角螺栓 + 螺母（组件节点图），两面平垫；夹檩条上翼缘 + 组件边框（边框翼缘厚 2 为假设）
    module: boltKind(8, FIX.purlin.t + 2, null, { len: 22, headWasher: true }),
    // 压块：M8×35 内六角（压块节点图），螺栓头坐在压块槽底，杆往下穿过檩条上翼缘；中压块、边压块槽底高度不同
    clampMid: boltKind(8, FIX.purlin.t + FIX.modT - CLAMP.mid.floor, null, { len: CLAMP.bolt, socket: true }),
    clampSide: boltKind(8, FIX.purlin.t + FIX.modT - CLAMP.side.floor, null, { len: CLAMP.bolt, socket: true }),
  };

  // 一次重建用一个收集器：add() 登记一颗螺栓，flush() 画出全部并返回 M12、M8 安装螺栓、M8 压块螺栓套数
  function collector() {
    const mats = {};
    for (const k in BOLTS) mats[k] = [];
    return {
      // axis：螺栓轴线（指向螺母一侧），up：局部 y（长圆孔方向）
      add(kind, p, axis, up) {
        const z = axis.clone().normalize(), y = up.clone().normalize(), x = new V3().crossVectors(y, z);
        mats[kind].push(new THREE.Matrix4().makeBasis(x, y, z).setPosition(p));
      },
      flush(parent) {
        for (const k in BOLTS) for (const [g, mat] of BOLTS[k]) PV.instanced(parent, g, mat, mats[k]);
        return {
          m12: mats.foot.length + mats.top.length + mats.btop.length + mats.clip.length,
          m8: mats.module.length,
          m8c: mats.clampMid.length + mats.clampSide.length,
        };
      },
    };
  }

  PV.parts.bolts = { collector };
})();
