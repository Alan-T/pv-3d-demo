import type { PartOptions, BuildContext } from '../part-types.ts';
import { MODULE_MOUNTING } from '../../config/engineering-rules.ts';
import { EZ, V, MM } from '../geometry/core.ts';
import * as THREE from 'three';

/**
 * 光伏组件：沿坡 rows 块竖排，东西向 cols 列。
 * 螺栓固定时每块 4 颗 M8 安装螺栓（两根檩条 × 两条长边框），压在檩条上翼缘，螺母在翼缘下方。
 */
export class ModulePart {
  private readonly purlinSection;
  private readonly capMaterial;
  private readonly materials;
  private readonly track;

  constructor({
    purlinSection,
    moduleCapMaterial,
    modMats,
    track,
  }: PartOptions['module']) {
    this.purlinSection = purlinSection;
    this.capMaterial = moduleCapMaterial;
    this.materials = modMats;
    this.track = track;
  }

  /** 第 r 排组件在东西向 z 处的中心（组件厚度中面）。 */
  private center(c: BuildContext, r: number, z: number) {
    const { P, S, n } = c;
    const p = S.along(S.modStarts[r] + P.modL / 2);
    return V(p.x, p.y, z).addScaledVector(n, (S.hModBot + P.modT / 2) * MM);
  }

  build(c: BuildContext) {
    const { P, S, layout, u, n } = c;
    const modGeo = this.track(new THREE.BoxGeometry(P.modL * MM, P.modT * MM, P.modW * MM));
    S.modStarts.forEach((_, r) => {
      for (let j = 0; j < layout.cols; j++) {
        const z = -layout.arrW / 2 + j * layout.pitchEW + P.modW / 2;
        const mesh = new THREE.Mesh(modGeo, this.materials);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.makeBasis(u, n, EZ).setPosition(this.center(c, r, z));
        mesh.castShadow = mesh.receiveShadow = true;
        c.modules.add(mesh);

        if (P.fix === 'clamp') continue;
        for (const t of [S.purlins[2 * r], S.purlins[2 * r + 1]]) {
          const q = S.along(t);
          for (const k of [-1, 1]) {
            c.bolts.add(
              'module',
              V(q.x, q.y, z + k * (P.modW / 2 - MODULE_MOUNTING.boltEdgeInset)).addScaledVector(n, (S.hModBot - this.purlinSection.t) * MM),
              n.clone().negate(),
              u,
            );
          }
        }
      }
    });
  }

  /** 剖切面封口：东西向 z 处切到的那一列组件，每排补一块 组件长 × 厚 的截面；z 落在组件缝里时不补。 */
  cap(c: BuildContext, z: number, parent: THREE.Object3D) {
    const { P, layout } = c;
    const j = Math.floor((z + layout.arrW / 2) / layout.pitchEW);
    const z0 = -layout.arrW / 2 + j * layout.pitchEW;
    if (j < 0 || j >= layout.cols || z >= z0 + P.modW) return;
    const geo = this.track(new THREE.PlaneGeometry(P.modL * MM, P.modT * MM));
    c.S.modStarts.forEach((_, r) => {
      const mesh = new THREE.Mesh(geo, this.capMaterial);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.makeBasis(c.u, c.n, EZ).setPosition(this.center(c, r, z));
      parent.add(mesh);
    });
  }
}
