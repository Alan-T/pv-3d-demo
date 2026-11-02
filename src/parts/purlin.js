/* 檩条和檩托。檩条坐在斜梁上表面，沿东西向通长。
 * 檩条-斜梁：L 形檩托，底边压在斜梁上翼缘、立边贴檩条腹板（下坡一侧），各 1 颗 M12 */
(function () {
  'use strict';
  const PV = window.PV;
  const { MM, V, EZ, FIX, CLIP, M, addMember } = PV;

  const geo = PV.extrudeC(FIX.purlin);
  // 无卷边 U128×53×3.0，外包檩条；长度400和孔距仍为建模假设。
  const splice = { depth: 128, length: 400, thickness: 3, flange: 53, webBolt: 100, flangeBolts: [60, 140] };
  const connectorGeo = (() => {
    const h = splice.depth / 2, t = splice.thickness, f = splice.flange - t;
    const shape = new THREE.Shape([[-h,-t],[h,-t],[h,f],[h-t,f],[h-t,0],[-h+t,0],[-h+t,f],[-h,f]]
      .map(([a,b]) => new THREE.Vector2(a*MM,b*MM)));
    return new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false});
  })();
  const capGeo = new THREE.ShapeGeometry(PV.cShape(FIX.purlin));
  // 檩托截面：局部 x 从檩条腹板外表面往下坡，局部 y 从斜梁上表面往上；沿局部 z 拉伸单位长度
  const clipGeo = (() => {
    const t = CLIP.t * MM, a = CLIP.base * MM, h = CLIP.height * MM;
    const s = new THREE.Shape([[0, 0], [a, 0], [a, t], [t, t], [t, h], [0, h]].map((q) => new THREE.Vector2(q[0], q[1])));
    return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  })();

  // 檩条 t（距斜梁下端）在东西向 z 处的截面原点：截面局部 a 沿 n、b 沿 u，腹板在下坡一侧
  function origin(c, t, z) {
    const p = c.S.along(t);
    return V(p.x, p.y, z)
      .addScaledVector(c.n, (c.S.hBeamTop + FIX.purlin.d / 2) * MM)
      .addScaledVector(c.u, (-FIX.purlin.f / 2) * MM);
  }

  // 返回檩托个数
  function build(c) {
    const { S, layout, zw, u, n } = c;
    const zClip = zw + FIX.beam.f / 2;         // 斜梁上翼缘中线，檩托居中
    // 檩托：每根檩条与每榀斜梁相交处一个，立边贴檩条腹板外表面（下坡一侧）
    const clipMats = [];
    for (const z0 of layout.zs) {
      for (const t of S.purlins) {
        const q = S.along(t);
        const at = (du, dn, dz) => V(q.x, q.y, z0 + dz)
          .addScaledVector(u, (-FIX.purlin.f / 2 + du) * MM)
          .addScaledVector(n, (S.hBeamTop + dn) * MM);
        // 局部 x 朝下坡、y 朝上；z 取 −z 方向保证右手系（实例矩阵不能带镜像）
        clipMats.push(new THREE.Matrix4()
          .makeBasis(u.clone().negate(), n, EZ.clone().multiplyScalar(-CLIP.width * MM))
          .setPosition(at(0, 0, zClip + CLIP.width / 2)));
        // 底边：头在檩托上方，螺母和垫圈在斜梁翼缘下方。
        c.bolts.add('clip', at(-CLIP.baseBolt, -FIX.beam.t, zClip), n.clone().negate(), u);
        // 立边：头在檩托外侧，螺母和垫圈在檩条槽内。
        c.bolts.add('clipWeb', at(FIX.purlin.t, CLIP.webBolt, zClip), u, n);
      }
    }
    PV.instanced(c.hw, clipGeo, M.clip, clipMats);

    for (const t of S.purlins) {
      for(const seg of layout.cuts.segments) addMember(c.slope, geo, M.purlin, origin(c,t,seg.start),n,u,EZ.clone().multiplyScalar(seg.length*MM));
      for(const z of layout.cuts.positions){
        addMember(c.hwSlope,connectorGeo,M.purlinConnector,origin(c,t,z-splice.length/2),n,u,EZ.clone().multiplyScalar(splice.length*MM));
        const at=(du,dn,dz)=>origin(c,t,z+dz).addScaledVector(u,du*MM).addScaledVector(n,dn*MM);
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
    return clipMats.length;
  }

  // 剖切面封口：在东西向 z 处给每根檩条补一块 C 型截面
  function cap(c, z, parent) {
    if (!c.layout.cuts.segments.some(s=>z>s.start && z<s.start+s.length)) return;
    for (const t of c.S.purlins) addMember(parent, capGeo, M.purlinCap, origin(c, t, z), c.n, c.u, EZ);
  }

  PV.parts.purlin = { build, cap, splice };
})();
