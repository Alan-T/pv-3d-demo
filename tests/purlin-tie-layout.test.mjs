import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { calculatePurlinTies } from '../src/purlin-tie-layout.js';
import { PurlinTiePart } from '../src/parts/purlin-tie.js';
import { createSectionGeometry, createSectionShape } from '../src/section-geometry.js';
import { FIX, PRESETS, TIE_SECTION_LIB, applyPresetSections } from '../src/config.js';
import { createDrilledAngleGeometry, createDrilledChannelWebGeometry } from '../src/drilled-section-geometry.js';
import { solve, layoutEW } from '../src/solve.js';
import { ewMatrix } from '../src/core.js';

test('图纸一：3974mm、12套，去掉首末跨为10套', () => {
  applyPresetSections('A');
  const s=solve(PRESETS.A), l=layoutEW(PRESETS.A);
  const input={purlins:s.purlins,framePositions:l.zs};
  const all=calculatePurlinTies({...input,mode:'all'});
  assert.equal(all.length,3974); assert.equal(all.count,12);
  assert.equal(all.start,s.purlins[0]-85);
  all.rods.forEach(r=>assert.equal(r.z,(l.zs[r.bay]+l.zs[r.bay+1])/2));
  assert.equal(calculatePurlinTies({...input,mode:'inner'}).count,10);
  assert.equal(calculatePurlinTies({...input,mode:'none'}).count,0);
  const selected = [1,0,1,0,0,0,0,0,0,0,0,1];
  assert.deepEqual(calculatePurlinTies({...input,mode:'custom',selected}).rods.map(r=>r.bay),[0,2,11]);
  assert.equal(calculatePurlinTies({...input,mode:'custom',selected:[]}).count,0);
  assert.deepEqual(calculatePurlinTies({...input,framePositions:l.zs.slice(0,4),mode:'custom',selected}).rods.map(r=>r.bay),[0,2]);
  assert.equal(calculatePurlinTies({purlins:s.purlins,framePositions:[0,2500],mode:'inner'}).count,0);
});

test('角钢实体：截面积、右手坐标、长度、正负东西坡度位置', () => {
  const section=FIX.purlinTie;
  assert.ok(Math.abs(Math.abs(THREE.ShapeUtils.area(createSectionShape(section).getPoints()))*1e6-1.6*(35+35-1.6))<1e-6);
  for (const slopeEW of [-10,0,10]) {
    const p={...PRESETS.A,slopeEW}, s=solve(p), l=layoutEW(p);
    const ties=calculatePurlinTies({mode:'all',purlins:s.purlins,framePositions:l.zs});
    const parent=new THREE.Group(), material=new THREE.MeshBasicMaterial();
    const part=new PurlinTiePart({section,material,createSectionGeometry,track:g=>g});
    const u=new THREE.Vector3(s.c,s.s,0), n=new THREE.Vector3(-s.s,s.c,0);
    part.build({solution:s,ties,parent,u,n});
    assert.equal(parent.children.length,12);
    const transform=ewMatrix(l.ew);
    parent.children.forEach((mesh,index)=>{
      assert.ok(mesh.matrix.determinant()>0);
      const world=transform.clone().multiply(mesh.matrix);
      const a=new THREE.Vector3(0,section.f*.001/2,0).applyMatrix4(world);
      const b=new THREE.Vector3(0,section.f*.001/2,1).applyMatrix4(world);
      assert.ok(Math.abs(a.distanceTo(b)*1000-3974)<1e-6);
      assert.ok(Math.abs(a.z-ties.rods[index].z*l.ew.ca*.001)<1e-8);
    });
    part.geometry.dispose(); material.dispose();
  }
});

test('三种檩条拉杆：安装面贴檩条，螺栓对应真实通孔，孔旁板厚正确', () => {
  applyPresetSections('A');
  for (const section of TIE_SECTION_LIB) for (const slopeEW of [-10, 0, 10]) {
    const parameters = { ...PRESETS.A, slopeEW };
    const solution = solve(parameters), layout = layoutEW(parameters);
    const ties = calculatePurlinTies({ mode: 'all', purlins: solution.purlins, framePositions: layout.zs });
    const parent = new THREE.Group(), resources = [];
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const part = new PurlinTiePart({ section, purlinSection: FIX.purlin, material, createSectionGeometry,
      createDrilledAngleGeometry, createDrilledChannelWebGeometry, track: geometry => (resources.push(geometry), geometry) });
    try {
      const u = new THREE.Vector3(solution.c, solution.s, 0), n = new THREE.Vector3(-solution.s, solution.c, 0);
      const bolts = [];
      part.build({ solution, ties, parent, u, n, bolts: { add: (kind, point, axis, up, thickness) => bolts.push({ point, thickness }) } });
      parent.matrixAutoUpdate = false;
      parent.matrix.copy(ewMatrix(layout.ew));
      parent.updateMatrixWorld(true);
      assert.equal(parent.children.length, ties.count);
      assert.equal(bolts.length, ties.count * solution.purlins.length);
      parent.children.forEach((mesh, index) => {
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox;
        const isChannel = section.type === 'C';
        const depth = isChannel ? section.f : section.d;
        const centerY = isChannel ? 0 : section.f * .001 / 2;
        assert.ok(Math.abs(box.min.x) < 1e-7);
        assert.ok(Math.abs(box.max.x - depth * .001) < 1e-7);
        assert.ok(Math.abs(box.min.y - (isChannel ? -section.d * .001 / 2 : 0)) < 1e-7);
        assert.ok(Math.abs(box.max.y - (isChannel ? section.d * .001 / 2 : section.f * .001)) < 1e-7);
        const a = new THREE.Vector3(0, centerY, 0).applyMatrix4(mesh.matrixWorld);
        const b = new THREE.Vector3(0, centerY, 1).applyMatrix4(mesh.matrixWorld);
        assert.ok(Math.abs(a.distanceTo(b) * 1000 - ties.length) < 1e-6);
        assert.ok(Math.abs(a.z - ties.rods[index].z * layout.ew.ca * .001) < 1e-8);
        if (isChannel) {
          // 在首孔之前检查槽口：中线下方开放，两翼则延伸到翼缘宽度 f。
          const uncutZ = (solution.purlins[0] - ties.start - 20) / ties.length;
          const samples = [{ y: 0, thickness: section.t }, { y: (section.d - section.t) * .001 / 2, thickness: section.f }];
          const direction = n.clone().negate().transformDirection(parent.matrix);
          for (const sample of samples) {
            const origin = new THREE.Vector3(-.01, sample.y, uncutZ).applyMatrix4(mesh.matrixWorld);
            const ray = new THREE.Raycaster(origin, direction, 0, .02 + section.f * .001);
            const hits = ray.intersectObject(mesh, false);
            assert.ok(hits.length >= 2);
            assert.ok(Math.abs(hits[0].distance - .01) < 1e-7);
            assert.ok(Math.abs(hits.at(-1).distance - (.01 + sample.thickness * .001)) < 1e-7, '腹板在上，槽口向下');
          }
        }
        const first = index * solution.purlins.length;
        for (const bolt of bolts.slice(first, first + solution.purlins.length)) {
          assert.equal(bolt.thickness, FIX.purlin.t + section.t);
          const origin = bolt.point.clone().addScaledVector(n, section.t * .001 + .01).applyMatrix4(parent.matrix);
          const direction = n.clone().negate().transformDirection(parent.matrix);
          const ray = new THREE.Raycaster(origin, direction, 0, .01 + section.t * .001 + .001);
          assert.equal(ray.intersectObject(mesh, false).length, 0, `${section.name}: 安装孔应贯通`);
          ray.ray.origin.addScaledVector(u, .01);
          const hits = ray.intersectObject(mesh, false);
          assert.ok(hits.length >= 2, `${section.name}: 孔旁应保留板材`);
          assert.ok(Math.abs(hits[0].distance - .01) < 1e-7);
          assert.ok(Math.abs(hits.at(-1).distance - (.01 + section.t * .001)) < 1e-7);
        }
      });
    } finally {
      resources.forEach(geometry => geometry.dispose());
      material.dispose();
    }
  }
});
