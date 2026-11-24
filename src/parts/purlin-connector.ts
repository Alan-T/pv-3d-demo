import type { PartOptions, BuildContext, ConnectorSpec } from '../part-types.ts';
import type { Vector3 } from 'three';
import { addMember, EZ, MM } from '../core.ts';
import { createPurlinConnectorGeometry } from '../purlin-connector-geometry.ts';

/** 构件实例：构造参数配置本构件，build 接收本次支架的放置上下文。 */
export class PurlinConnectorPart {
  splice;
  build;

  constructor({
    purlinSection,
    connectorSpec,
    purlinConnectorMaterial,
    track,
  }: PartOptions['purlin']['purlinConnector'] & { connectorSpec: ConnectorSpec | null }) {
  this.splice = connectorSpec;
  if (!connectorSpec) { this.build = () => {}; return; }
  const splice = connectorSpec;
  const connectorGeo = track(createPurlinConnectorGeometry(splice));
  function build(c: BuildContext, origin: (z: number) => Vector3) {
    const { layout, n, u } = c;
      for(const z of layout.cuts.positions){
        addMember(c.hwSlope,connectorGeo,purlinConnectorMaterial,origin(z-splice.length/2),n,u,EZ.clone().multiplyScalar(splice.length*MM));
        const at=(du: number,dn: number,dz: number)=>origin(z+dz).addScaledVector(u,du*MM).addScaledVector(n,dn*MM);
        const flangeOffset = splice.flangeHoleOffset - splice.t;
        const clearance = (splice.d - 2 * splice.t - purlinSection.d) / 2;
        const flangeStack = purlinSection.t + splice.t + clearance;
        for (const dz of splice.flangeHoles) {
          c.bolts.add('splice', at(flangeOffset, purlinSection.d/2-purlinSection.t, dz), n.clone().negate(), u, flangeStack);
          c.bolts.add('splice', at(flangeOffset, -purlinSection.d/2+purlinSection.t, dz), n, u, flangeStack);
        }
        for (const dz of splice.webHoles) {
          c.bolts.add('splice', at(purlinSection.t, 0, dz), u, n, purlinSection.t + splice.t);
        }
      }
  }
    this.build = build;
  }
}
