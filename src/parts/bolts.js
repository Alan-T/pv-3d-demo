/* 螺栓：M12 / M8 两种规格，按连接位置分几种叠层厚度；每次重建由各构件登记位置，最后统一画成实例化网格 */
(function () {
  'use strict';
  const PV = window.PV;
  const { MM, V3, FIX, JOINT, CLIP, CLAMP, M } = PV;

  // 螺栓组：局部 z 为螺栓轴线、指向螺母一侧，z=0 在螺母一侧被连接件的外表面。
  // 零件：垫圈、螺母、露出的螺杆、另一侧的螺栓头；可选长圆孔（沿局部 y，front 在螺母一侧、back 在螺栓头一侧）。
  // opt.len：按公称长度（螺栓头支承面到杆端）画杆长，不给就在螺母外露 out；opt.headWasher：螺栓头下也垫一个平垫；
  // opt.socket：内六角圆柱头（sk：头径 d、头高 k、内六角对边 s）
  const BOLT_SIZE = {
    12: { wr: 12, wt: 2.5, af: 18, nh: 10.8, r: 6, hh: 7.5, out: 6 },
    8: { wr: 8, wt: 1.6, af: 13, nh: 6.5, r: 4, hh: 5.3, out: 4, sk: { d: 13, k: 8, s: 6 } },
  };
  function boltKind(size, stack, slot, opt) {
    const b = BOLT_SIZE[size], hexR = b.af / Math.sqrt(3), top = b.wt + b.nh;
    const o = opt || {}, back = -stack - (o.headWasher ? b.wt : 0);    // 螺栓头支承面
    const hh = o.socket ? b.sk.k : b.hh;
    const cyl = (r, z0, z1, seg) => {
      const g = new THREE.CylinderGeometry(r * MM, r * MM, (z1 - z0) * MM, seg);
      g.rotateX(Math.PI / 2);
      g.translate(0, 0, ((z0 + z1) / 2) * MM);
      return g;
    };
    const parts = [
      [cyl(b.wr, 0, b.wt, 24), M.boltSteel],
      [cyl(hexR, b.wt, top, 6), M.boltSteel],
      [cyl(b.r, back - hh, o.len ? back + o.len : top + b.out, 16), M.boltSteel],
      o.socket ? [cyl(b.sk.d / 2, back - hh, back, 24), M.boltSteel] : [cyl(hexR, back - hh, back, 6), M.boltSteel],
    ];
    if (o.headWasher) parts.push([cyl(b.wr, back, -stack, 24), M.boltSteel]);
    if (o.socket) parts.push([cyl(b.sk.s / Math.sqrt(3), back - hh - 0.2, back - hh + 4, 6), M.slot]);   // 内六角孔
    if (slot) {
      const w = (JOINT.slotW / 2) * MM, l = ((slot.len - JOINT.slotW) / 2) * MM;
      const s = new THREE.Shape();
      s.moveTo(w, -l);
      s.lineTo(w, l);
      s.absarc(0, l, w, 0, Math.PI, false);
      s.lineTo(-w, -l);
      s.absarc(0, -l, w, Math.PI, Math.PI * 2, false);
      const g = new THREE.ShapeGeometry(s, 12);
      g.translate(0, 0, (slot.side === 'front' ? 0.4 : -stack - 0.4) * MM);
      parts.unshift([g, M.slot]);
    }
    return parts;
  }
  const BOLTS = {
    foot: boltKind(12, JOINT.plateT + FIX.post.t, { side: 'front', len: JOINT.slotL }),  // 斜撑-立柱：连接板 + 腹板
    top: boltKind(12, FIX.beam.t + FIX.post.t, { side: 'front', len: 40 }),            // 立柱-斜梁：竖向长圆孔（画在看得见的螺母一侧）
    btop: boltKind(12, FIX.beam.t + FIX.brace.t, null),                                // 斜撑-斜梁
    clip: boltKind(12, CLIP.t + FIX.beam.t, null),                                     // 檩托两处叠层都是 4+2
    // 组件安装孔：M8×22 外六角螺栓 + 螺母（组件节点图），两面平垫；夹檩条上翼缘 + 组件边框（边框翼缘厚 2 为假设）
    module: boltKind(8, FIX.purlin.t + 2, null, { len: 22, headWasher: true }),
    // 压块：M8×35 内六角（压块节点图），螺栓头沉在压块槽底，杆穿过组件缝下面的空当和檩条上翼缘
    clamp: boltKind(8, FIX.purlin.t + FIX.modT - CLAMP.pocket, null, { len: CLAMP.bolt, socket: true }),
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
          m8c: mats.clamp.length,
        };
      },
    };
  }

  PV.parts.bolts = { collector };
})();
