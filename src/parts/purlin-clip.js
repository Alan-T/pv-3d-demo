import { EZ, V, MM, instanced } from '../core.js';
import * as THREE from '../../vendor/three.module.js';

/** 构件实例：构造参数配置本构件，build 接收本次支架的放置上下文。 */
export class PurlinClipPart {
  constructor({
    beamSection,
    purlinSection,
    clipMaterial,
    CLIP,
    track,
  }) {
  // L 形檩托及其底边、立边螺栓。
  // 檩托截面：局部 x 从檩条腹板外表面往下坡，局部 y 从斜梁上表面往上；沿局部 z 拉伸单位长度
  const clipGeo = (() => {
    const t = CLIP.t * MM, a = CLIP.base * MM, h = CLIP.height * MM;
    const s = new THREE.Shape([[0, 0], [a, 0], [a, t], [t, t], [t, h], [0, h]].map((q) => new THREE.Vector2(q[0], q[1])));
    return track(new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }));
  })();

  function build(c) {
    const { S, layout, zw, u, n } = c;
    const zClip = zw + beamSection.f / 2;         // 斜梁上翼缘中线，檩托居中
    // 檩托：每根檩条与每榀斜梁相交处一个，立边贴檩条腹板外表面（下坡一侧）
    const clipMats = [];
    for (const z0 of layout.zs) {
      for (const t of S.purlins) {
        const q = S.along(t);
        const at = (du, dn, dz) => V(q.x, q.y, z0 + dz)
          .addScaledVector(u, (-purlinSection.f / 2 + du) * MM)
          .addScaledVector(n, (S.hBeamTop + dn) * MM);
        // 局部 x 朝下坡、y 朝上；z 取 −z 方向保证右手系（实例矩阵不能带镜像）
        clipMats.push(new THREE.Matrix4()
          .makeBasis(u.clone().negate(), n, EZ.clone().multiplyScalar(-CLIP.width * MM))
          .setPosition(at(0, 0, zClip + CLIP.width / 2)));
        // 底边：头在檩托上方，螺母和垫圈在斜梁翼缘下方。
        c.bolts.add('clip', at(-CLIP.baseBolt, -beamSection.t, zClip), n.clone().negate(), u);
        // 立边：头在檩托外侧，螺母和垫圈在檩条槽内。
        c.bolts.add('clipWeb', at(purlinSection.t, CLIP.webBolt, zClip), u, n);
      }
    }
    instanced(c.hw, clipGeo, clipMaterial, clipMats);

    return clipMats.length;
  }
    Object.assign(this, { build });
  }
}
