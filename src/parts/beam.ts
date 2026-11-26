import type { PartOptions, BuildContext } from '../part-types.ts';
import { addMember, EZ, EY, V, MM } from '../core.ts';

/** 构件实例：构造参数配置本构件，build 接收本次支架的放置上下文。 */
export class BeamPart {
  build;

  constructor({
    beamSection,
    postFSection,
    postRSection,
    beamMaterial,
    createSectionGeometry,
    track,
  }: PartOptions['beam']) {
  /* 斜梁：每榀一根，搭在前后立柱上；立柱在斜梁上居中。
   * 立柱-斜梁节点：斜梁腹板贴立柱腹板，1 颗 M16×40 穿过立柱中心线上的竖向长圆孔；柱顶平切 */

  const geo = track(createSectionGeometry(beamSection));

  function build(c: BuildContext) {
    const { S, layout, zw, u, n } = c;
    const b0 = S.along(0);
    for (const z0 of layout.zs) {
      addMember(c.model, geo, beamMaterial, V(b0.x, b0.y, z0 + zw), n, EZ, u.clone().multiplyScalar(S.beamLen * MM));
      c.bolts.add('top', V(S.xf, S.holeF, z0 + c.zBeamWeb), EZ, EY, postFSection.t);
      c.bolts.add('top', V(S.xr, S.holeR, z0 + c.zBeamWeb), EZ, EY, postRSection.t);
    }
  }
    this.build = build;
  }
}
