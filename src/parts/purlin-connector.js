import { addMember, EZ, MM } from '../core.js';
import { createPurlinConnectorGeometry } from '../purlin-connector-geometry.js';

/** 构件实例：构造参数配置本构件，build 接收本次支架的放置上下文。 */
export class PurlinConnectorPart {
  constructor({
    purlinSection,
    connectorSpec,
    purlinConnectorMaterial,
    track,
  }) {
  const splice = connectorSpec;
  if (!splice) { Object.assign(this, { splice: null, build() {} }); return; }
  const connectorGeo = track(createPurlinConnectorGeometry(splice));
  function build(c, origin) {
    const { layout, n, u } = c;
      for(const z of layout.cuts.positions){
        addMember(c.hwSlope,connectorGeo,purlinConnectorMaterial,origin(z-splice.length/2),n,u,EZ.clone().multiplyScalar(splice.length*MM));
        const at=(du,dn,dz)=>origin(z+dz).addScaledVector(u,du*MM).addScaledVector(n,dn*MM);
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
    Object.assign(this, { splice, build });
  }
}
