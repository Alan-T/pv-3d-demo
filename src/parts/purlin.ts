import type { PartOptions, BuildContext } from '../part-types.ts';
import type { Object3D } from 'three';
import { addMember, EZ, V, MM } from '../core.ts';
import { PurlinConnectorPart } from './purlin-connector.ts';
import { PurlinClipPart } from './purlin-clip.ts';

/** 构件实例：构造参数配置本构件，build 接收本次支架的放置上下文。 */
export class PurlinPart {
  build;
  cap;
  splice;

  constructor({
    purlinSection,
    purlinMaterial,
    purlinCapMaterial,
    createSectionGeometry,
    createSectionCapGeometry,
    createDrilledPurlinGeometry,
    track,
    purlinConnector: purlinConnectorOptions,
    purlinClip: purlinClipOptions,
  }: Omit<PartOptions['purlin'], 'purlinClip' | 'purlinConnector'> & {
    purlinClip: ConstructorParameters<typeof PurlinClipPart>[0];
    purlinConnector: ConstructorParameters<typeof PurlinConnectorPart>[0];
  }) {
  const { build: buildConnector, splice } = new PurlinConnectorPart(purlinConnectorOptions);
  const { build: buildClip } = new PurlinClipPart(purlinClipOptions);
  /* 檩条和檩托。檩条坐在斜梁上表面，沿东西向通长。
   * 檩条-斜梁：L 形檩托，底边压在斜梁上翼缘、立边贴檩条腹板（下坡一侧），各 1 颗 M12 */

  const geo = track(createSectionGeometry(purlinSection));
  const capGeo = track(createSectionCapGeometry(purlinSection));
  // 檩条 t（距斜梁下端）在东西向 z 处的截面原点：截面局部 a 沿 n、b 沿 u，腹板在下坡一侧
  function origin(c: BuildContext, t: number, z: number) {
    const p = c.S.along(t);
    return V(p.x, p.y, z)
      .addScaledVector(c.n, (c.S.hBeamTop + purlinSection.d / 2) * MM)
      .addScaledVector(c.u, (-purlinSection.f / 2) * MM);
  }

  // 返回檩托个数
  function build(c: BuildContext): number {
    const { S, layout, zw, u, n } = c;
    const clipCount = buildClip(c);
    const segmentGeometry = layout.cuts.segments.map(seg => {
      const holes = (layout.purlinTies?.rods || []).map(rod=>rod.z-seg.start)
        .filter(z=>z>7 && z<seg.length-7);
      return holes.length ? track(createDrilledPurlinGeometry(purlinSection,seg.length,holes)) : geo;
    });

    for (const t of S.purlins) {
      layout.cuts.segments.forEach((seg,index)=>addMember(c.slope, segmentGeometry[index], purlinMaterial, origin(c,t,seg.start),n,u,EZ.clone().multiplyScalar(seg.length*MM)));
      buildConnector(c, (z) => origin(c, t, z));
    }
    return clipCount;
  }

  // 剖切面封口：在东西向 z 处给每根檩条补一块 C 型截面
  function cap(c: BuildContext, z: number, parent: Object3D) {
    if (!c.layout.cuts.segments.some(s=>z>s.start && z<s.start+s.length)) return;
    for (const t of c.S.purlins) addMember(parent, capGeo, purlinCapMaterial, origin(c, t, z), c.n, c.u, EZ);
  }
    this.build = build;
    this.cap = cap;
    this.splice = splice;
  }
}
