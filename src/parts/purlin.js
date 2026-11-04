import { build as buildConnector, splice } from './purlin-connector.js';
import { build as buildClip } from './purlin-clip.js';
import * as THREE from '../../vendor/three.module.js';
import { PV } from '../core.js';
import '../materials.js';
import '../config.js';

/* 檩条和檩托。檩条坐在斜梁上表面，沿东西向通长。
 * 檩条-斜梁：L 形檩托，底边压在斜梁上翼缘、立边贴檩条腹板（下坡一侧），各 1 颗 M12 */
const { MM, V, EZ, FIX, CLIP, M, addMember } = PV;

const geo = PV.extrudeC(FIX.purlin);
const capGeo = new THREE.ShapeGeometry(PV.cShape(FIX.purlin));
// 檩条 t（距斜梁下端）在东西向 z 处的截面原点：截面局部 a 沿 n、b 沿 u，腹板在下坡一侧
function origin(c, t, z) {
  const p = c.S.along(t);
  return V(p.x, p.y, z)
    .addScaledVector(c.n, (c.S.hBeamTop + FIX.purlin.d / 2) * MM)
    .addScaledVector(c.u, (-FIX.purlin.f / 2) * MM);
}

// 返回檩托个数
function build(c) {
  const { S, layout, zw, u, n } = c;
  const clipCount = buildClip(c);

  for (const t of S.purlins) {
    for(const seg of layout.cuts.segments) addMember(c.slope, geo, M.purlin, origin(c,t,seg.start),n,u,EZ.clone().multiplyScalar(seg.length*MM));
    buildConnector(c, (z) => origin(c, t, z));
  }
  return clipCount;
}

// 剖切面封口：在东西向 z 处给每根檩条补一块 C 型截面
function cap(c, z, parent) {
  if (!c.layout.cuts.segments.some(s=>z>s.start && z<s.start+s.length)) return;
  for (const t of c.S.purlins) addMember(parent, capGeo, M.purlinCap, origin(c, t, z), c.n, c.u, EZ);
}

PV.parts.purlin = { build, cap, splice };

export { build, cap, splice };
