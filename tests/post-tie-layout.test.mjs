import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { postTieHeights, calculatePostTies, enabledPostTieSpans, postTieLengths } from '../src/post-tie-layout.js';
import { FIX, PRESETS, TIE_SECTION_LIB, getSectionLibrary, applySection, applyPresetSections } from '../src/config.js';
import { solve, layoutEW } from '../src/solve.js';
import { PostTiePart } from '../src/parts/post-tie.js';
import { createSectionGeometry, createSectionShape } from '../src/section-geometry.js';

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

test('±100mm含边界，整对选用平地长度；超出时使用两根实际长度', () => {
  assert.deepEqual(postTieLengths(2500,1200,.05).lengths,[3040,3040]);
  for (const slope of [.09,-.09]) {
    const result=postTieLengths(2500,1200,slope);
    assert.deepEqual(result.actualLengths.slice().sort(),[2940,3140]);
    assert.deepEqual(result.lengths,[3040,3040]);
  }
  assert.deepEqual(postTieLengths(2500,1200,.1).lengths,[3150,2930]);
  assert.deepEqual(postTieLengths(2500,1200,.096).lengths,[3150,2940]); // 仅一根超出也不能共用平地长度
  assert.deepEqual(postTieLengths(2500,1200,-.1).lengths,[2930,3150]);
});

test('两方案及正负东西坡度：选用下料长度、真实安装孔、实体长度一致', () => {
  for (const preset of ['A','B']) for (const slopeEW of [-10,0,10]) for (const slopeNS of [-5,0,5]) {
    applyPresetSections(preset);
    const p={...PRESETS[preset],slopeEW,slopeNS}, s=solve(p), layout=layoutEW(p);
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
        const actual=Math.round(Math.hypot(span*layout.ew.ca,rod.direction*row.holeRise+span*slopeEW/100)/10)*10+270;
        assert.equal(rod.actualLength,actual);
        const flat=Math.round(Math.hypot(span,row.holeRise)/10)*10+270;
        const pair=row.rods.filter(other=>other.bay===rod.bay);
        assert.equal(rod.length,pair.every(other=>Math.abs(other.actualLength-flat)<=100)?flat:actual);
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

test('两类拉杆 C/L 往返切换及预设恢复：截面形状正确，保留引用且不污染规格库', () => {
  const libraryBefore = structuredClone(TIE_SECTION_LIB);
  const areas = { 'L35*35*1.6': 109.44, 'C59*39*8*1.6': 234.56, 'C60*40*10*1.6': 245.76 };
  try {
    for (const key of ['postTie', 'purlinTie']) {
      const reference = FIX[key];
      const area = () => Math.abs(THREE.ShapeUtils.area(createSectionShape(FIX[key]).getPoints())) * 1e6;
      for (const name of ['L35*35*1.6', 'C59*39*8*1.6', 'L35*35*1.6', 'C60*40*10*1.6']) {
        applySection(key, getSectionLibrary(key).find(section => section.name === name));
        assert.equal(FIX[key], reference);
        assert.ok(Math.abs(area() - areas[name]) < 1e-6, name);
        if (name.startsWith('L')) assert.equal('l' in FIX[key], false);
      }
      for (const preset of ['A', 'B']) {
        applySection(key, TIE_SECTION_LIB[key === 'postTie' ? 0 : 1]);
        applyPresetSections(preset);
        assert.equal(FIX[key], reference);
        const defaultName = PRESETS[preset].sections[key];
        assert.equal(FIX[key].type, defaultName[0]);
        assert.ok(Math.abs(area() - areas[defaultName]) < 1e-6);
      }
    }
    assert.deepEqual(TIE_SECTION_LIB, libraryBefore);
  } finally {
    applyPresetSections('A');
  }
});

test('三种立柱拉杆截面：安装肢居中，前后排及正负坡度下螺栓轴线穿过实际板厚', () => {
  applyPresetSections('A');
  for (const section of TIE_SECTION_LIB) for (const slopeEW of [-10, 0, 10]) {
    const parameters = { ...PRESETS.A, slopeEW };
    const solution = solve(parameters), layout = layoutEW(parameters);
    for (const row of calculatePostTies(parameters, solution, layout)) {
      const parent = new THREE.Group();
      const postSection = row.rear ? FIX.postR : FIX.postF;
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const part = new PostTiePart({ section, postSection, material, createSectionGeometry, track: geometry => geometry });
      try {
        const bolts = [];
        part.build({ row, parent, bolts: { add: (kind, point, axis, up, thickness) => bolts.push({ point, thickness }) } });
        part.geometry.computeBoundingBox();
        const box = part.geometry.boundingBox;
        assert.ok(Math.abs(box.min.x + section.d / 2 * .001) < 1e-7);
        assert.ok(Math.abs(box.max.x - section.d / 2 * .001) < 1e-7);
        parent.updateMatrixWorld(true);
        row.rods.forEach((rod, index) => {
          const mesh = parent.children[index];
          const outward = new THREE.Vector3(rod.direction, 0, 0);
          for (const bolt of bolts.slice(index * 2, index * 2 + 2)) {
            assert.equal(bolt.thickness, postSection.t + section.t);
            const surface = bolt.point.clone().addScaledVector(outward, postSection.t * .001);
            const ray = new THREE.Raycaster(surface.addScaledVector(outward, -.01), outward);
            const hits = ray.intersectObject(mesh, false);
            assert.ok(hits.length >= 2, `${section.name}: 螺栓轴线必须穿过安装肢`);
            assert.ok(Math.abs(hits[0].distance - .01) < 1e-7);
            assert.ok(Math.abs(hits.at(-1).distance - (.01 + section.t * .001)) < 1e-7);
          }
        });
      } finally {
        part.geometry.dispose();
        material.dispose();
      }
    }
  }
});
