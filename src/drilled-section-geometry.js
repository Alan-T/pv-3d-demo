import * as THREE from 'three';

const MM = .001;
const shape = points => new THREE.Shape(points.map(([x,y]) => new THREE.Vector2(x*MM,y*MM)));
const extrude = (outline, depth) => new THREE.ExtrudeGeometry(outline,{depth:depth*MM,bevelEnabled:false,curveSegments:24});

// 薄板在局部 y-z 平面开孔，沿 x 拉伸板厚，保留真实孔壁。
function flange({ x, y0, y1, length, thickness, holes, radius }) {
  const outline=shape([[y0,0],[y1,0],[y1,length],[y0,length]]);
  for (const {y,z} of holes) {
    const hole=new THREE.Path();
    hole.absarc(y*MM,z*MM,radius*MM,0,Math.PI*2,true);
    outline.holes.push(hole);
  }
  const geometry=extrude(outline,thickness);
  geometry.applyMatrix4(new THREE.Matrix4().set(0,0,1,x*MM, 1,0,0,0, 0,1,0,0, 0,0,0,1));
  return geometry;
}

// 合并后仍沿局部 z 保持单位长度，以兼容现有 addMember 放置矩阵。
function unitLength(parts,length) {
  const geometry=new THREE.BufferGeometry();
  for (const name of ['position','normal','uv']) {
    const arrays=parts.map(part=>part.getAttribute(name));
    const values=new Float32Array(arrays.reduce((sum,a)=>sum+a.array.length,0));
    let offset=0;
    for (const attr of arrays) { values.set(attr.array,offset); offset+=attr.array.length; }
    geometry.setAttribute(name,new THREE.BufferAttribute(values,arrays[0].itemSize));
  }
  geometry.scale(1,1,1/(length*MM));
  parts.forEach(part=>part.dispose());
  return geometry;
}

export function createDrilledAngleGeometry(section,length,holePositions,radius=7) {
  const {d,f,t}=section;
  return unitLength([
    extrude(shape([[t,0],[d,0],[d,t],[t,t]]),length),
    flange({x:0,y0:0,y1:f,length,thickness:t,radius,holes:holePositions.map(z=>({y:f/2,z}))}),
  ],length);
}

export function createDrilledPurlinGeometry(section,length,holePositions,radius=7) {
  const {d,f,l,t}=section,h=d/2;
  return unitLength([
    // 腹板、上翼缘及上卷边；下翼缘单独开孔，下卷边仍保留。
    extrude(shape([[-h,0],[h,0],[h,f],[h-l,f],[h-l,f-t],[h-t,f-t],[h-t,t],[-h,t]]),length),
    extrude(shape([[-h+t,f-t],[-h+l,f-t],[-h+l,f],[-h+t,f]]),length),
    flange({x:-h,y0:t,y1:f,length,thickness:t,radius,holes:holePositions.map(z=>({y:f/2,z}))}),
  ],length);
}
