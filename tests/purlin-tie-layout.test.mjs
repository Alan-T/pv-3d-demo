import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { calculatePurlinTies } from '../src/purlin-tie-layout.js';
import { PurlinTiePart } from '../src/parts/purlin-tie.js';
import { createSectionGeometry, createSectionShape } from '../src/section-geometry.js';
import { FIX, PRESETS, applyPresetSections } from '../src/config.js';
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
