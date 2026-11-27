import type { PartOptions, BuildContext } from '../part-types.ts';
import { addMember, EZ, EY, V, MM } from '../geometry/core.ts';

/**
 * 斜梁构件：每榀一根，搭在前后立柱上，立柱在斜梁上居中。
 * 立柱-斜梁节点：斜梁腹板贴立柱腹板，1 颗 M16×40 穿过立柱中心线上的竖向长圆孔，柱顶平切。
 */
export class BeamPart {
  private readonly postFSection;
  private readonly postRSection;
  private readonly material;
  private readonly geometry;

  constructor({
    beamSection,
    postFSection,
    postRSection,
    beamMaterial,
    createSectionGeometry,
    track,
  }: PartOptions['beam']) {
    this.postFSection = postFSection;
    this.postRSection = postRSection;
    this.material = beamMaterial;
    this.geometry = track(createSectionGeometry(beamSection));
  }

  build(c: BuildContext) {
    const { S, layout, zw, zBeamWeb, u, n, model, bolts } = c;
    const b0 = S.along(0);
    const span = u.clone().multiplyScalar(S.beamLen * MM);
    for (const z0 of layout.zs) {
      addMember(model, this.geometry, this.material, V(b0.x, b0.y, z0 + zw), n, EZ, span);
      bolts.add('top', V(S.xf, S.holeF, z0 + zBeamWeb), EZ, EY, this.postFSection.t);
      bolts.add('top', V(S.xr, S.holeR, z0 + zBeamWeb), EZ, EY, this.postRSection.t);
    }
  }
}
