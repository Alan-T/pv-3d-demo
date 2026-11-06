import { V3, MM, instanced } from '../core.js';
import * as THREE from '../../vendor/three.module.js';

/** 构件实例：构造参数配置本构件，build 接收本次支架的放置上下文。 */
export class BoltsPart {
  constructor({
    postSection,
    braceSection,
    beamSection,
    purlinSection,
    boltSteelMaterial,
    slotMaterial,
    CLAMP,
    CLIP,
    JOINT,
    track,
  }) {
  /* 螺栓：M16 / M12 / M8 三种规格，按连接位置分几种叠层厚度；每次重建由各构件登记位置，最后统一画成实例化网格 */

  // 螺栓组：局部 z 为螺栓轴线、指向螺母一侧，z=0 在螺母一侧被连接件的外表面。
  // 零件：垫圈、螺母、露出的螺杆、另一侧的螺栓头；可选长圆孔（沿局部 y，画在开孔那块板的表面上，at 为这些表面的局部 z）。
  // opt.len：按公称长度（螺栓头支承面到杆端）画杆长，不给就在螺母外露 out；opt.headWasher：螺栓头下也垫一个平垫；
  // opt.socket：内六角圆柱头（sk：头径 d、头高 k、内六角对边 s）；opt.spring：平垫和螺母之间加一个弹垫（sw：内外半径、厚，GB 93）
  const BOLT_SIZE = {
    16: { wr: 15, wt: 3, af: 24, nh: 14.8, r: 8, hh: 10, out: 6, sw: { ri: 8.1, ro: 12.2, t: 4 } },
    12: { wr: 12, wt: 2.5, af: 18, nh: 10.8, r: 6, hh: 7.5, out: 6, sw: { ri: 6.1, ro: 9.2, t: 3.1 } },
    8: { wr: 8, wt: 1.6, af: 13, nh: 6.5, r: 4, hh: 5.3, out: 4, sw: { ri: 4.1, ro: 6.35, t: 2 }, sk: { d: 13, k: 8, s: 6 } },
  };
  // 弹垫：开口的圆环，开口在局部 x-y 平面的左上方（节点正视图里看得见），从 z0 起厚 sw.t
  function springWasher(sw, z0) {
    const gap = 0.12, a0 = (3 * Math.PI) / 4 + gap, a1 = a0 + 2 * Math.PI - 2 * gap;
    const s = new THREE.Shape();
    s.absarc(0, 0, sw.ro * MM, a0, a1, false);
    s.absarc(0, 0, sw.ri * MM, a1, a0, true);
    const g = track(new THREE.ExtrudeGeometry(s, { depth: sw.t * MM, bevelEnabled: false, curveSegments: 32 }));
    g.translate(0, 0, z0 * MM);
    return g;
  }
  function boltKind(size, stack, slot, opt) {
    const o = opt || {}, b = BOLT_SIZE[size], hexR = b.af / Math.sqrt(3);
    // 螺母侧平垫可单独配置；头部平垫仍采用该螺栓的普通规格。
    const washer = o.nutWasher || { radius: b.wr, thickness: b.wt };
    const nut = washer.thickness + (o.spring ? b.sw.t : 0), top = nut + b.nh;   // 螺母底面、顶面
    const back = -stack - (o.headWasher ? b.wt : 0);    // 螺栓头支承面
    const hh = o.socket ? b.sk.k : b.hh;
    const cyl = (r, z0, z1, seg, r1) => {   // r1：z1 一端的半径（倒角用），不给就是圆柱
      const g = track(new THREE.CylinderGeometry((r1 === undefined ? r : r1) * MM, r * MM, (z1 - z0) * MM, seg));
      g.rotateX(Math.PI / 2);
      g.translate(0, 0, ((z0 + z1) / 2) * MM);
      return g;
    };
    const parts = [
      [cyl(washer.radius, 0, washer.thickness, 24), boltSteelMaterial],
      [cyl(hexR, nut, top, 6), boltSteelMaterial],
      [cyl(b.r, back - hh, o.len ? back + o.len : top + b.out, 16), boltSteelMaterial],
      o.socket ? [cyl(b.sk.d / 2, back - hh + 0.6, back, 24), boltSteelMaterial] : [cyl(hexR, back - hh, back, 6), boltSteelMaterial],
    ];
    if (o.headWasher) parts.push([cyl(b.wr, back, -stack, 24), boltSteelMaterial]);
    if (o.spring) parts.push([springWasher(b.sw, washer.thickness), boltSteelMaterial]);
    if (o.socket) {
      parts.push([cyl(b.sk.d / 2 - 0.6, back - hh, back - hh + 0.6, 24, b.sk.d / 2), boltSteelMaterial]);   // 头顶倒角
      parts.push([cyl(b.sk.s / Math.sqrt(3), back - hh - 0.2, back - hh + 4, 6), slotMaterial]);           // 内六角孔
    }
    if (slot) {
      const width = slot.width ?? JOINT.slotW;
      const w = (width / 2) * MM, l = ((slot.len - width) / 2) * MM;
      const s = new THREE.Shape();
      s.moveTo(w, -l);
      s.lineTo(w, l);
      s.absarc(0, l, w, 0, Math.PI, false);
      s.lineTo(-w, -l);
      s.absarc(0, -l, w, Math.PI, Math.PI * 2, false);
      for (const z of slot.at) {
        const g = track(new THREE.ShapeGeometry(s, 12));
        g.translate(0, 0, z * MM);
        parts.unshift([g, slotMaterial]);
      }
    }
    return parts;
  }
  // M12 螺栓的螺母下都是一个平垫、一个弹垫（节点图）
  const BOLTS = {
    // 斜撑-立柱：连接板 + 腹板，长圆孔在连接板上（螺栓头一侧）；头下平垫，螺母下平垫 + 弹垫。
    foot: boltKind(12, JOINT.plateT + postSection.t, { at: [-JOINT.plateT - postSection.t - 0.4], len: JOINT.slotL }, { len: 35, headWasher: true, spring: true }),
    footBrace: boltKind(12, JOINT.plateT + braceSection.t, { at: [-JOINT.plateT - braceSection.t - 0.4], len: JOINT.slotL }, { len: 35, headWasher: true, spring: true }),
    // 立柱-斜梁：螺母在斜梁腹板一侧，竖向长圆孔开在立柱腹板上：画在立柱腹板贴着斜梁的那面（节点图里斜梁半透明，看得见）
    // 和立柱槽里那面
    top: boltKind(16, beamSection.t + postSection.t, { at: [-beamSection.t, -beamSection.t - postSection.t - 0.4], len: 40, width: 18 }, { len: 40, headWasher: true, spring: true }),
    btop: boltKind(12, beamSection.t + braceSection.t, null, { len: 35, headWasher: true, spring: true }), // 斜撑-斜梁：两面平垫，螺母侧弹垫
    clip: boltKind(12, CLIP.t + beamSection.t, null, { len: 35, headWasher: true, spring: true }), // 底边：檩托+斜梁翼缘，两面平垫
    clipWeb: boltKind(12, CLIP.t + purlinSection.t, null, { len: 35, headWasher: true, spring: true }), // 立边：檩托+檩条腹板，两面平垫
    purlinBeam: boltKind(12, purlinSection.t + beamSection.t, null, { len: 35, headWasher: true, spring: true }), // 平坡：檩条下翼缘直接连接斜梁上翼缘
    // 组件安装孔：M8×22 外六角螺栓 + 螺母（组件节点图），两面平垫；夹檩条上翼缘 + 组件边框（边框翼缘厚 2 为假设）
    splice: boltKind(12, purlinSection.t + 3, null, { len: 35, headWasher: true, spring: true }),
    // 组件上方：普通平垫 Ø16×1.6；檩条下方：大平垫（图未标尺寸，暂按 Ø24×2）。
    module: boltKind(8, purlinSection.t + 2, null, { len: 22, headWasher: true, spring: true, nutWasher: { radius: 12, thickness: 2 } }),
  };
  // 压块：M8×35 内六角（压块节点图），螺栓头坐在压块槽底，杆往下穿过檩条上翼缘；中压块、边压块槽底高度不同。
  // 叠层厚度跟组件厚度 H 走，按厚度缓存
  const clampKinds = {};
  function kinds(H) {
    if (!clampKinds[H]) {
      clampKinds[H] = {
        clampMid: boltKind(8, purlinSection.t + H - CLAMP.mid.floor, null, { len: CLAMP.bolt, socket: true }),
        clampSide: boltKind(8, purlinSection.t + H - CLAMP.side.floor, null, { len: CLAMP.bolt, socket: true }),
      };
    }
    return Object.assign({}, BOLTS, clampKinds[H]);
  }

  // 组件螺栓、压块螺栓跟着檩条顺坡（东西坡度），其余在各榀上
  const SLOPE_KINDS = new Set(['splice', 'module', 'clampMid', 'clampSide']);

  // 一次重建用一个收集器（modT：组件厚度）：add() 登记一颗螺栓，flush() 画出全部并返回 M12、M8 安装螺栓、M8 压块螺栓套数
  function collector(modT) {
    const K = kinds(modT), mats = {};
    for (const k in K) mats[k] = [];
    return {
      // axis：螺栓轴线（指向螺母一侧），up：局部 y（长圆孔方向）
      add(kind, p, axis, up, thickness) {
        if (thickness !== undefined) {
          const base = kind, key = base + ':' + thickness;
          if (!K[key]) {
            const stack = thickness + (base === 'top' || base === 'btop' ? beamSection.t : JOINT.plateT);
            const slot = base === 'btop' ? null : { at: base === 'top' ? [-beamSection.t, -stack - 0.4] : [-stack - 0.4], len: base === 'top' ? 40 : JOINT.slotL, width: base === 'top' ? 18 : JOINT.slotW };
            K[key] = boltKind(base === 'top' ? 16 : 12, stack, slot, { len: base === 'top' ? 40 : 35, headWasher: ['foot', 'footBrace', 'top', 'btop'].includes(base), spring: true });

            mats[key] = [];
          }
          kind = key;
        }
        const z = axis.clone().normalize(), y = up.clone().normalize(), x = new V3().crossVectors(y, z);
        mats[kind].push(new THREE.Matrix4().makeBasis(x, y, z).setPosition(p));
      },
      flush(parent, slopeParent) {
        for (const k in K) for (const [g, mat] of K[k]) instanced(SLOPE_KINDS.has(k) ? slopeParent : parent, g, mat, mats[k]);
        return {
          m16: Object.keys(mats).filter(k => k.split(':')[0] === 'top').reduce((sum,k) => sum + mats[k].length, 0),
          m12: Object.keys(mats).filter(k => !['top','module','clampMid','clampSide'].includes(k.split(':')[0])).reduce((sum,k) => sum + mats[k].length, 0),
          spliceBolts: mats.splice.length,
          m8: mats.module.length,
          m8c: mats.clampMid.length + mats.clampSide.length,
        };
      },
    };
  }
    Object.assign(this, { collector });
  }
}
