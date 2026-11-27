import type { PartOptions, BuildContext, ConnectorSpec } from '../part-types.ts';
import { TIE_RULES } from '../../config/engineering-rules.ts';
import type { Object3D } from 'three';
import { addMember, EZ, V, MM } from '../geometry/core.ts';
import { PurlinConnectorPart } from './purlin-connector.ts';
import { PurlinClipPart } from './purlin-clip.ts';

/**
 * 檩条、檩托及拼接连接件。
 * 檩条坐在斜梁上表面，沿东西向通长；截面局部 a 沿 n、b 沿 u，腹板在下坡一侧。
 */
export class PurlinPart {
  readonly splice: ConnectorSpec | null;
  private readonly purlinSection;
  private readonly material;
  private readonly capMaterial;
  private readonly geometry;
  private readonly capGeometry;
  private readonly createDrilledPurlinGeometry;
  private readonly track;
  private readonly connector: PurlinConnectorPart;
  private readonly clip: PurlinClipPart;

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
    this.purlinSection = purlinSection;
    this.material = purlinMaterial;
    this.capMaterial = purlinCapMaterial;
    this.createDrilledPurlinGeometry = createDrilledPurlinGeometry;
    this.track = track;
    this.geometry = track(createSectionGeometry(purlinSection));
    this.capGeometry = track(createSectionCapGeometry(purlinSection));
    this.connector = new PurlinConnectorPart(purlinConnectorOptions);
    this.clip = new PurlinClipPart(purlinClipOptions);
    this.splice = this.connector.splice;
  }

  /** 檩条 t（距斜梁下端）在东西向 z 处的截面原点。 */
  private origin(c: BuildContext, t: number, z: number) {
    const p = c.S.along(t);
    return V(p.x, p.y, z)
      .addScaledVector(c.n, (c.S.hBeamTop + this.purlinSection.d / 2) * MM)
      .addScaledVector(c.u, (-this.purlinSection.f / 2) * MM);
  }

  /** 生成檩托、檩条分段及拼接件，返回檩托个数。 */
  build(c: BuildContext): number {
    const { S, layout, u, n } = c;
    const clipCount = this.clip.build(c);
    const { holeRadius } = TIE_RULES.purlinTie;
    const segmentGeometry = layout.cuts.segments.map((seg) => {
      const holes = (layout.purlinTies?.rods || [])
        .map((rod) => rod.z - seg.start)
        .filter((z) => z > holeRadius && z < seg.length - holeRadius);
      return holes.length
        ? this.track(this.createDrilledPurlinGeometry(this.purlinSection, seg.length, holes))
        : this.geometry;
    });

    for (const t of S.purlins) {
      layout.cuts.segments.forEach((seg, index) => {
        addMember(
          c.slope,
          segmentGeometry[index],
          this.material,
          this.origin(c, t, seg.start),
          n,
          u,
          EZ.clone().multiplyScalar(seg.length * MM),
        );
      });
      this.connector.build(c, (z) => this.origin(c, t, z));
    }
    return clipCount;
  }

  /** 剖切面封口：在东西向 z 处给每根檩条补一块 C 型截面。 */
  cap(c: BuildContext, z: number, parent: Object3D) {
    if (!c.layout.cuts.segments.some((s) => z > s.start && z < s.start + s.length)) return;
    for (const t of c.S.purlins) {
      addMember(parent, this.capGeometry, this.capMaterial, this.origin(c, t, z), c.n, c.u, EZ);
    }
  }
}
