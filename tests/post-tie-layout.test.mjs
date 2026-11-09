import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../vendor/three.module.js';
import { postTieHeights, calculatePostTies, enabledPostTieSpans } from '../src/post-tie-layout.js';
import { FIX, PRESETS, applyPresetSections } from '../src/config.js';
import { solve, layoutEW } from '../src/solve.js';
import { PostTiePart } from '../src/parts/post-tie.js';
import { createSectionGeometry } from '../src/section-geometry.js';

test('二维孔位规则：整百孔距、柱顶余量优先接近225，低柱退化为水平杆', () => {
  assert.deepEqual(postTieHeights({postLength:2298,embed:1500,strutHeight:250}), {topOffset:248,holeRise:100});
  assert.deepEqual(postTieHeights({postLength:3390,embed:1500,strutHeight:250}), {topOffset:240,holeRise:1200});
  assert.deepEqual(postTieHeights({postLength:2100,embed:1500,strutHeight:250}), {topOffset:150,holeRise:0});
});

test('安装状态：无、首末跨、全部、自定义；单跨不重复', () => {
  assert.deepEqual(enabledPostTieSpans('ends', [], 1), [true]);
  assert.deepEqual(enabledPostTieSpans('none', [], 3), [false,false,false]);
  assert.deepEqual(enabledPostTieSpans('all', [], 3), [true,true,true]);
  assert.deepEqual(enabledPostTieSpans('custom', [0,1,0,1], 3), [false,true,false]);
});

test('两方案及正负东西坡度：二维下料长度、真实安装孔、实体长度一致', () => {
  for (const preset of ['A','B']) for (const slopeEW of [-10,0,10]) for (const slope of [-5,0,5]) {
    applyPresetSections(preset);
    const p={...PRESETS[preset],slopeEW,slope}, s=solve(p), layout=layoutEW(p);
    const rows=calculatePostTies(p,s,layout);
    for (const row of rows) {
      assert.equal(row.rods.length,4);
      const parent=new THREE.Group(), resources=[];
      const part=new PostTiePart({section:FIX.postTie,postSection:row.rear?FIX.postR:FIX.postF,
        material:new THREE.MeshBasicMaterial(),createSectionGeometry,track:g=>(resources.push(g),g)});
      const boltCalls=[];
      part.build({row,parent,bolts:{add:(kind,point,axis,up,thickness)=>
        boltCalls.push({kind,point,axis:axis.clone(),up:up.clone(),thickness})}});
      assert.equal(boltCalls.length,row.rods.length*2);
      row.rods.forEach((rod,index)=>{
        const span=layout.zs[rod.bay+1]-layout.zs[rod.bay];
        const expected=Math.round(Math.hypot(span*layout.ew.ca,rod.direction*row.holeRise+span*slopeEW/100)/10)*10+270;
        assert.equal(rod.length,expected);
        assert.equal(rod.start.z,layout.zs[rod.bay]*layout.ew.ca);
        const mesh=parent.children[index];
        assert.ok(mesh.matrix.determinant()>0);
        const a=new THREE.Vector3(0,0,0).applyMatrix4(mesh.matrix);
        const b=new THREE.Vector3(0,0,1).applyMatrix4(mesh.matrix);
        assert.ok(Math.abs(a.distanceTo(b)*1000-rod.length)<1e-6);
        const hole=new THREE.Vector3(row.x+rod.direction*(row.rear?FIX.postR:FIX.postF).d/2,rod.start.y,rod.start.z).multiplyScalar(.001);
        assert.ok(new THREE.Line3(a,b).closestPointToPoint(hole,true,new THREE.Vector3()).distanceTo(hole)<1e-8);
        const post=row.rear?FIX.postR:FIX.postF;
        for (const [endIndex,point] of [rod.start,rod.end].entries()) {
          const bolt=boltCalls[index*2+endIndex];
          assert.equal(bolt.kind,'postTie');
          assert.equal(bolt.thickness,post.t+FIX.postTie.t);
          assert.ok(Math.abs(bolt.point.x-(row.x+rod.direction*(post.d/2-post.t))*.001)<1e-8);
          assert.equal(bolt.point.y,point.y*.001);
          assert.equal(bolt.point.z,point.z*.001);
          assert.equal(bolt.axis.x,-rod.direction);
          assert.ok(Math.abs(bolt.axis.dot(bolt.up))<1e-8);
        }
      });
      resources.forEach(g=>g.dispose()); part.material.dispose();
    }
  }
  applyPresetSections('A');
});
