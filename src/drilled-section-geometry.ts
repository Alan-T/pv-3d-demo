import type { Section, ChannelSection } from './design-types.ts';
type Hole = { y: number; z: number };
import * as THREE from 'three';

const MM = .001;
const shape = (points: [number, number][]) => new THREE.Shape(points.map(([x,y]) => new THREE.Vector2(x*MM,y*MM)));
const extrude = (outline: THREE.Shape | THREE.Shape[], depth: number) => new THREE.ExtrudeGeometry(outline,{depth:depth*MM,bevelEnabled:false,curveSegments:24});

// 只在安装孔附近细分板面，避免孔边的小圆弧和数米外的端点组成狭长三角形。
function drilledPlate(y0: number, y1: number, length: number, thickness: number, holes: Hole[], radius: number) {
  const regions: { start: number; end: number; holes: Hole[] }[] = [];
  for (const hole of [...holes].sort((a, b) => a.z - b.z)) {
    const start = Math.max(0, hole.z - 2 * radius), end = Math.min(length, hole.z + 2 * radius);
    const previous = regions.at(-1);
    if (previous && previous.end >= start) {
      previous.end = Math.max(previous.end, end);
      previous.holes.push(hole);
    } else regions.push({ start, end, holes: [hole] });
  }
  const outlines: THREE.Shape[] = [], seams = new Set<number>();
  function addStrip(start: number, end: number, openings: Hole[] = []) {
    if (start >= end) return;
    const outline = shape([[y0,start], [y1,start], [y1,end], [y0,end]]);
    for (const {y, z} of openings) {
      const circle = new THREE.Path();
      circle.absarc(y * MM, z * MM, radius * MM, 0, Math.PI * 2, true);
      outline.holes.push(circle);
    }
    outlines.push(outline);
    if (start > 0) seams.add(Math.fround(start * MM));
  }
  let cursor = 0;
  for (const region of regions) {
    addStrip(cursor, region.start);
    addStrip(region.start, region.end, region.holes);
    cursor = region.end;
  }
  addStrip(cursor, length);
  const strips = extrude(outlines, thickness);
  if (!seams.size) return strips;
  // 去除共边处成对的内部端面，仅保留两面板皮、外壁及孔壁。
  const positions = strips.getAttribute('position'), keep = [];
  for (let i = 0; i < positions.count; i += 3) {
    const z = positions.getY(i);
    if (seams.has(z) && positions.getY(i + 1) === z && positions.getY(i + 2) === z) continue;
    keep.push(i, i + 1, i + 2);
  }
  strips.clearGroups();
  strips.setIndex(keep);
  const plate = strips.toNonIndexed();
  strips.dispose();
  return plate;
}

// 薄板在局部 y-z 平面开孔，沿 x 拉伸板厚，保留真实孔壁。
function flange({ x, y0, y1, length, thickness, holes, radius }: { x: number; y0: number; y1: number; length: number; thickness: number; holes: Hole[]; radius: number }) {
  const geometry = drilledPlate(y0, y1, length, thickness, holes, radius);
  geometry.applyMatrix4(new THREE.Matrix4().set(0,0,1,x*MM, 1,0,0,0, 0,1,0,0, 0,0,0,1));
  return geometry;
}

// 合并后仍沿局部 z 保持单位长度，以兼容现有 addMember 放置矩阵。
function unitLength(parts: THREE.BufferGeometry[], length: number) {
  const geometry=new THREE.BufferGeometry();
  // 各部分是独立闭合实体。保留范围，裁切封口时不能将共面的内部接缝焊成一个轮廓。
  let start = 0;
  geometry.userData.solidRanges = parts.map(part => {
    const count = part.getAttribute('position').count;
    const range = { start, count };
    start += count;
    return range;
  });
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

export function createDrilledAngleGeometry(section: Section, length: number, holePositions: number[],radius=7) {
  const {d,f,t}=section;
  return unitLength([
    extrude(shape([[t,0],[d,0],[d,t],[t,t]]),length),
    flange({x:0,y0:0,y1:f,length,thickness:t,radius,holes:holePositions.map(z=>({y:f/2,z}))}),
  ],length);
}

export function createDrilledPurlinGeometry(section: ChannelSection, length: number, holePositions: number[],radius=7) {
  const {d,f,l,t}=section,h=d/2;
  return unitLength([
    // 腹板、上翼缘及上卷边；下翼缘单独开孔，下卷边仍保留。
    extrude(shape([[-h,0],[h,0],[h,f],[h-l,f],[h-l,f-t],[h-t,f-t],[h-t,t],[-h,t]]),length),
    extrude(shape([[-h+t,f-t],[-h+l,f-t],[-h+l,f],[-h+t,f]]),length),
    flange({x:-h,y0:t,y1:f,length,thickness:t,radius,holes:holePositions.map(z=>({y:f/2,z}))}),
  ],length);
}

// C 型拉杆在腹板中线开孔；输出仍使用标准 C 截面的局部坐标。
export function createDrilledChannelWebGeometry(section: ChannelSection, length: number, holePositions: number[], radius = 7) {
  const { d, f, l, t } = section, h = d / 2;
  // 二维轮廓的第二轴对应杆件长度，拉伸方向转到腹板厚度方向 y。
  const web = drilledPlate(-h, h, length, t, holePositions.map(z => ({ y: 0, z })), radius);
  web.rotateX(Math.PI / 2).translate(0, t * MM, 0);
  return unitLength([
    web,
    extrude(shape([[-h,t],[-h+t,t],[-h+t,f-t],[-h+l,f-t],[-h+l,f],[-h,f]]), length),
    extrude(shape([[h-t,t],[h,t],[h,f],[h-l,f],[h-l,f-t],[h-t,f-t]]), length),
  ], length);
}
