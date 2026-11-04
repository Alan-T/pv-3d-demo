import { braceJoint, build as buildConnector } from './brace-connector.js';
import * as THREE from '../../vendor/three.module.js';
import { PV } from '../core.js';
import '../materials.js';
import '../config.js';

/* 斜撑（内斜撑，可选外斜撑）和斜撑下端连接板。
 * 斜撑-立柱：连接板贴在立柱腹板外侧，2 颗螺栓（立柱中心线上，上下排）接立柱；板向斜撑一侧伸出，
 *   斜撑腹板贴在伸出部分上用 1 颗螺栓；单面板伸出部分的下角斜切。螺栓孔为竖向长圆孔。
 * 斜撑-斜梁：斜撑腹板贴斜梁腹板，两条中心线交点 1 颗螺栓；斜撑端头平切。斜撑两端孔心到端头都是 35 */
const { MM, V3, V, EY, EZ, NZ, FIX, JOINT, DBL, M, addMember } = PV;

const geo = PV.extrudeC(FIX.brace);

// 前柱、后柱两处斜撑节点（各榀相同）；标注、节点详图和面板也用
function joints(S) {
  const O = S.outer;
  return [braceJoint(S, S.bF, S.tFp, O && O.oF, O && O.toFp), braceJoint(S, S.bR, S.tRp, O && O.oR, O && O.toRp)];
}

// 斜撑腹板、立柱腹板外表面都在 z0+zw 平面，连接板压在两者外侧
function build(c) {
  const { layout, zw, u } = c;
  for (const z0 of layout.zs) {
    for (const J of layout.joints) {
      for (const b of J.o ? [J, J.o] : [J]) {
        addMember(c.model, geo, M.brace, V(b.E.x, b.E.y, z0 + zw),
          new V3(-b.ay, b.ax, 0), NZ, new V3(b.ax, b.ay, 0).multiplyScalar(b.len * MM));
        // 头在斜梁腹板侧，螺母、平垫和弹垫在斜撑槽内。
        c.bolts.add('btop', V(b.T.x, b.T.y, z0 + zw - FIX.brace.t), NZ, u);
      }
      buildConnector(c, J, z0);
    }
  }
}

PV.parts.brace = { joints, build };

export { joints, build };
