import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createDrilledAngleGeometry, createDrilledPurlinGeometry, createDrilledChannelWebGeometry } from '../src/drilled-section-geometry.js';

test('Ø14孔贯通水平肢及檩条下翼缘，孔旁仍有实体',()=>{
  const length=3974, hole=85;
  const cases=[
    {geometry:createDrilledAngleGeometry({d:35,f:35,t:1.6},length,[hole]),y:.0175,x:-.01},
    {geometry:createDrilledPurlinGeometry({d:100,f:55,l:20,t:1.8},length,[hole]),y:.0275,x:-.06},
  ];
  for (const {geometry,y,x} of cases) {
    const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(geometry,material);mesh.updateMatrixWorld();
    const ray=new THREE.Raycaster(new THREE.Vector3(x,y,hole/length),new THREE.Vector3(1,0,0),0,.02);
    assert.equal(ray.intersectObject(mesh).length,0,'孔心射线不应碰到板材');
    ray.ray.origin.y+=.01;
    assert.ok(ray.intersectObject(mesh).length>0,'孔外射线应碰到板材');
    geometry.dispose();material.dispose();
  }
});

test('长型材的孔边三角面保持局部，板内沿杆长没有分段端面', () => {
  const length = 4000, holes = [700, 2900], radius = 7;
  const cases = [
    { create: createDrilledAngleGeometry, section: { d: 35, f: 35, t: 1.6 }, probe: [.8, 28], across: 'y', center: 17.5 },
    { create: createDrilledPurlinGeometry, section: { d: 100, f: 55, l: 20, t: 1.8 }, probe: [-49.1, 38], across: 'y', center: 27.5 },
    { create: createDrilledChannelWebGeometry, section: { d: 59, f: 39, l: 8, t: 1.6 }, probe: [10, .8], across: 'x', center: 0 },
  ];
  for (const { create, section, probe, across, center } of cases) {
    const geometry = create(section, length, holes, radius);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    try {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.z = length / 1000;
      mesh.updateMatrixWorld();
      // 从板内孔旁沿杆长发射；完整钢板应只在真实杆端出现横断面。
      const ray = new THREE.Raycaster(new THREE.Vector3(probe[0] / 1000, probe[1] / 1000, .001), new THREE.Vector3(0, 0, 1));
      const hits = ray.intersectObject(mesh);
      assert.ok(hits.length && hits.every(hit => Math.abs(hit.point.z * 1000 - length) < .001), create.name);

      const positions = geometry.attributes.position;
      const vertices = Array.from({ length: 3 }, () => new THREE.Vector3());
      const coveredHoles = new Set();
      for (let i = 0; i < positions.count; i += 3) {
        vertices.forEach((v, j) => v.fromBufferAttribute(positions, i + j));
        for (const hole of holes) {
          const onRim = v => Math.abs(Math.hypot(v[across] * 1000 - center, v.z * length - hole) - radius) < .001;
          if (!vertices.some(onRim)) continue;
          coveredHoles.add(hole);
          // 孔边若直接连到下一孔或远端，裁切这类狭长面会留下锯齿。
          assert.ok(vertices.every(v => Math.abs(v.z * length - hole) < 4 * section.d), create.name);
        }
      }
      assert.equal(coveredHoles.size, holes.length);
    } finally { geometry.dispose(); material.dispose(); }
  }
});
