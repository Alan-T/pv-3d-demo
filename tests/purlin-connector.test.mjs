import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../vendor/three.module.js';
import { getPurlinConnectorSpec } from '../src/purlin-connector-spec.js';
import { createPurlinConnectorGeometry } from '../src/purlin-connector-geometry.js';
import { PurlinConnectorPart } from '../src/parts/purlin-connector.js';

test('按用户选择的完整规格读取，未知名称不回退', () => {
  for (const name of ['U128*53*3.0*240', 'U128*45*3.0*240', 'U118*45*3.0*240',
    'U108*55*3.0*240', 'U108*45*3.0*240', 'U98*55*3.0*220', 'U98*45*3.0*220', 'U88*55*3.0*220']) {
    assert.equal(getPurlinConnectorSpec(name).name, name);
  }
  assert.equal(getPurlinConnectorSpec('U108*55*3.0*220'), null);
});

test('220/240详图：孔位、真实长圆孔与8套螺栓一致', () => {
  for (const [d,f,web,flange,offset] of [[90,55,[-80,-30,30,80],[-55,55],30], [100,45,[-85,-35,35,85],[-60,60],23]]) {
    const purlin = {d,f,t:1.8}, spec = getPurlinConnectorSpec(d === 90 ? 'U98*55*3.0*220' : 'U108*45*3.0*240');
    assert.deepEqual(spec.webHoles, web);
    assert.deepEqual(spec.flangeHoles, flange);
    assert.equal(spec.flangeHoleOffset, offset);
    const geometry = createPurlinConnectorGeometry(spec);
    const material = new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
    const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld();
    for (const z of web) {
      const ray = new THREE.Raycaster(new THREE.Vector3(0,-.01,.5+z/spec.length),new THREE.Vector3(0,1,0),0,.015);
      assert.equal(ray.intersectObject(mesh).length,0,'腹板孔心应贯通');
      ray.ray.origin.x=.02;
      assert.ok(ray.intersectObject(mesh).length>0,'孔外保留板材');
    }
    for (const z of flange) for (const side of [-1,1]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(side*(spec.d/2+5)*.001,(offset-spec.t)*.001,.5+z/spec.length),new THREE.Vector3(-side,0,0),0,.01);
      assert.equal(ray.intersectObject(mesh).length,0,'翼板孔心应贯通');
    }
    const calls=[], tracked=[];
    const part = new PurlinConnectorPart({purlinSection:purlin,connectorSpec:spec,purlinConnectorMaterial:material,track:g=>(tracked.push(g),g)});
    part.build({layout:{cuts:{positions:[0]}},n:new THREE.Vector3(1,0,0),u:new THREE.Vector3(0,1,0),hwSlope:new THREE.Group(),bolts:{add:(...args)=>calls.push(args)}},z=>new THREE.Vector3(0,0,z*.001));
    assert.equal(calls.length,8);
    assert.equal(calls[0][4],purlin.t+spec.t+1,'翼板夹紧距离应包含1mm装配间隙');
    assert.ok(Math.abs(calls[0][1].x-(d/2-purlin.t)*.001)<1e-8);
    tracked.forEach(g=>g.dispose()); geometry.dispose(); material.dispose();
  }
});
