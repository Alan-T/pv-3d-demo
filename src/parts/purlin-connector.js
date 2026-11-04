import { addMember, EZ, MM } from '../core.js';
import { M } from '../materials.js';
import { FIX } from '../config.js';
import * as THREE from '../../vendor/three.module.js';

// U 型檩条连接件及每个接头的六套螺栓。
// 无卷边 U108×55×3.0，长240；纵向孔位暂按每侧30/60/90，待孔距详图确认。
const splice = { depth: 108, length: 240, thickness: 3, flange: 55, webBolt: 60, flangeBolts: [30, 90] };
const connectorGeo = (() => {
  const h = splice.depth / 2, t = splice.thickness, f = splice.flange - t;
  const shape = new THREE.Shape([[-h,-t],[h,-t],[h,f],[h-t,f],[h-t,0],[-h+t,0],[-h+t,f],[-h,f]]
    .map(([a,b]) => new THREE.Vector2(a*MM,b*MM)));
  return new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false});
})();
export function build(c, origin) {
  const { layout, n, u } = c;
    for(const z of layout.cuts.positions){
      addMember(c.hwSlope,connectorGeo,M.purlinConnector,origin(z-splice.length/2),n,u,EZ.clone().multiplyScalar(splice.length*MM));
      const at=(du,dn,dz)=>origin(z+dz).addScaledVector(u,du*MM).addScaledVector(n,dn*MM);
      for(const side of [-1,1]){
        // 中间竖向螺栓：头在上，螺母朝槽内；翻转时原点移到另一夹紧面。
        const stack = FIX.purlin.t + splice.thickness;
        c.bolts.add('splice',at(23,splice.depth/2-stack,side*splice.webBolt),n.clone().negate(),u);
        // 两旁各一颗横穿腹板，轴线沿坡向；俯视显示杆、螺母和垫圈的侧面。
        // 横向螺栓：头在腹板外侧，平垫、弹垫和螺母朝槽内。
        for(const distance of splice.flangeBolts)
          c.bolts.add('splice',at(FIX.purlin.t,0,side*distance),u,n);
      }
    }
}

export { splice };
