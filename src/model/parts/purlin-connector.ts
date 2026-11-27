import type { PartOptions, BuildContext, ConnectorSpec } from '../part-types.ts';
import type { Vector3 } from 'three';
import { addMember, EZ, MM } from '../geometry/core.ts';
import { createPurlinConnectorGeometry } from '../geometry/purlin-connector-geometry.ts';

/** 檩条拼接连接件及两侧螺栓。 */
export class PurlinConnectorPart {
  readonly splice: ConnectorSpec | null;
  private readonly purlinSection;
  private readonly material;
  private readonly geometry;

  constructor({
    purlinSection,
    connectorSpec,
    purlinConnectorMaterial,
    track,
  }: PartOptions['purlin']['purlinConnector'] & { connectorSpec: ConnectorSpec | null }) {
    this.splice = connectorSpec;
    this.purlinSection = purlinSection;
    this.material = purlinConnectorMaterial;
    this.geometry = connectorSpec ? track(createPurlinConnectorGeometry(connectorSpec)) : null;
  }

  build(c: BuildContext, origin: (z: number) => Vector3) {
    if (!this.splice || !this.geometry) return;
    const { layout, n, u } = c;
    const splice = this.splice;
    const purlin = this.purlinSection;
    const flangeOffset = splice.flangeHoleOffset - splice.t;
    const clearance = (splice.d - 2 * splice.t - purlin.d) / 2;
    const flangeStack = purlin.t + splice.t + clearance;
    const span = EZ.clone().multiplyScalar(splice.length * MM);

    for (const z of layout.cuts.positions) {
      addMember(c.hwSlope, this.geometry, this.material, origin(z - splice.length / 2), n, u, span);
      const at = (du: number, dn: number, dz: number) =>
        origin(z + dz).addScaledVector(u, du * MM).addScaledVector(n, dn * MM);

      for (const dz of splice.flangeHoles) {
        c.bolts.add('splice', at(flangeOffset, purlin.d / 2 - purlin.t, dz), n.clone().negate(), u, flangeStack);
        c.bolts.add('splice', at(flangeOffset, -purlin.d / 2 + purlin.t, dz), n, u, flangeStack);
      }
      for (const dz of splice.webHoles) {
        c.bolts.add('splice', at(purlin.t, 0, dz), u, n, purlin.t + splice.t);
      }
    }
  }
}
