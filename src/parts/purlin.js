import { addMember, EZ, V, MM } from '../core.js';
import { PurlinConnectorPart } from './purlin-connector.js';
import { PurlinClipPart } from './purlin-clip.js';

/** 构件实例：构造参数配置本构件，build 接收本次支架的放置上下文。 */
export class PurlinPart {
  constructor({
    purlinSection,
    purlinMaterial,
    purlinCapMaterial,
    createSectionGeometry,
    createSectionCapGeometry,
    CLIP,
    track,
    purlinConnector: purlinConnectorOptions,
    purlinClip: purlinClipOptions,
  }) {
  const { build: buildConnector, splice } = new PurlinConnectorPart(purlinConnectorOptions);
  const { build: buildClip } = new PurlinClipPart(purlinClipOptions);
  /* 檩条和檩托。檩条坐在斜梁上表面，沿东西向通长。
   * 檩条-斜梁：L 形檩托，底边压在斜梁上翼缘、立边贴檩条腹板（下坡一侧），各 1 颗 M12 */

  const geo = track(createSectionGeometry(purlinSection));
  const capGeo = track(createSectionCapGeometry(purlinSection));
  // 檩条 t（距斜梁下端）在东西向 z 处的截面原点：截面局部 a 沿 n、b 沿 u，腹板在下坡一侧
  function origin(c, t, z) {
    const p = c.S.along(t);
    return V(p.x, p.y, z)
      .addScaledVector(c.n, (c.S.hBeamTop + purlinSection.d / 2) * MM)
      .addScaledVector(c.u, (-purlinSection.f / 2) * MM);
  }

  // 返回檩托个数
  function build(c) {
    const { S, layout, zw, u, n } = c;
    const clipCount = buildClip(c);

    for (const t of S.purlins) {
      for(const seg of layout.cuts.segments) addMember(c.slope, geo, purlinMaterial, origin(c,t,seg.start),n,u,EZ.clone().multiplyScalar(seg.length*MM));
      buildConnector(c, (z) => origin(c, t, z));
    }
    return clipCount;
  }

  // 剖切面封口：在东西向 z 处给每根檩条补一块 C 型截面
  function cap(c, z, parent) {
    if (!c.layout.cuts.segments.some(s=>z>s.start && z<s.start+s.length)) return;
    for (const t of c.S.purlins) addMember(parent, capGeo, purlinCapMaterial, origin(c, t, z), c.n, c.u, EZ);
  }
    Object.assign(this, { build, cap, splice });
  }
}
