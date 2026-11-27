import type { PartOptions, BuildContext, ClipSpec } from '../part-types.ts';
import { EZ, V, MM, instanced } from '../core.ts';
import * as THREE from 'three';

/** 檩托截面：局部 x 从檩条腹板外表面往下坡，局部 y 从斜梁上表面往上；沿局部 z 拉伸单位长度。 */
function createClipGeometry(clip: ClipSpec) {
  const t = clip.t * MM;
  const a = clip.base * MM;
  const h = clip.height * MM;
  const pts = [[0, 0], [a, 0], [a, t], [t, t], [t, h], [0, h]];
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
}

/** L 形檩托及其底边、立边连接螺栓。 */
export class PurlinClipPart {
  private readonly beamSection;
  private readonly purlinSection;
  private readonly material;
  private readonly clipSpec;
  private readonly geometry;

  constructor({
    beamSection,
    purlinSection,
    clipMaterial,
    CLIP,
    track,
  }: PartOptions['purlin']['purlinClip'] & { CLIP: ClipSpec }) {
    this.beamSection = beamSection;
    this.purlinSection = purlinSection;
    this.material = clipMaterial;
    this.clipSpec = CLIP;
    this.geometry = track(createClipGeometry(CLIP));
  }

  build(c: BuildContext): number {
    const { S, layout, zw, u, n } = c;
    const { beamSection, purlinSection, clipSpec } = this;
    const zClip = zw + beamSection.f / 2; // 斜梁上翼缘中线，檩托居中
    const clipMats: THREE.Matrix4[] = [];

    for (const z0 of layout.zs) {
      for (const t of S.purlins) {
        const q = S.along(t);
        const at = (du: number, dn: number, dz: number) =>
          V(q.x, q.y, z0 + dz)
            .addScaledVector(u, (-purlinSection.f / 2 + du) * MM)
            .addScaledVector(n, (S.hBeamTop + dn) * MM);

        // 局部 x 朝下坡、y 朝上；z 取 -z 方向保证右手系（实例矩阵不能带镜像）。
        clipMats.push(
          new THREE.Matrix4()
            .makeBasis(u.clone().negate(), n, EZ.clone().multiplyScalar(-clipSpec.width * MM))
            .setPosition(at(0, 0, zClip + clipSpec.width / 2)),
        );

        // 底边：头在檩托上方，螺母和垫圈在斜梁翼缘下方。
        c.bolts.add('clip', at(-clipSpec.baseBolt, -beamSection.t, zClip), n.clone().negate(), u);
        // 立边：头在檩托外侧，螺母和垫圈在檩条槽内。
        c.bolts.add('clipWeb', at(purlinSection.t, clipSpec.webBolt, zClip), u, n);

        // 东西坡度为零时，两翼缘贴合，增加直接连接螺栓（头在槽内，螺母在斜梁下方）。
        if (layout.ew.i === 0) {
          c.bolts.add('purlinBeam', at(purlinSection.f / 2, -beamSection.t, zClip), n.clone().negate(), u);
        }
      }
    }

    instanced(c.hw, this.geometry, this.material, clipMats);
    return clipMats.length;
  }
}
