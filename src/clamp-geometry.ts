import * as THREE from 'three';
import { MM } from './core.ts';

type Point = [number, number, number];

// 截面在 x-y 平面，z=0 位于长度中点。螺栓孔沿 y 贯穿槽底。
export function createClampGeometry(profile: number[][], length: number, holeX: number,
  holeDiameter: number, seatY: number, plateThickness: number) {
  // 相邻圆角刚好相切时，共用的切点只保留一次。
  const outline = profile.map(([x, y]) => new THREE.Vector2(x, y));
  const contour = outline.filter((point, i) => point.distanceToSquared(outline[(i + outline.length - 1) % outline.length]) > 1e-12);
  if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
  const half = length / 2, bottomY = seatY - plateThickness;
  const circle = Array.from({ length: 32 }, (_, i) => {
    const angle = 2 * Math.PI * i / 32, radius = holeDiameter / 2;
    return new THREE.Vector2(holeX + radius * Math.cos(angle), radius * Math.sin(angle));
  });
  const vertices: number[] = [];
  function triangle(a: Point, b: Point, c: Point) {
    for (const [x, y, z] of [a, b, c]) vertices.push(x * MM, y * MM, z * MM);
  }
  function quad(a: Point, b: Point, c: Point, d: Point) {
    triangle(a, b, c);
    triangle(a, c, d);
  }
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const a = contour[i], b = contour[j], c = contour[k];
    triangle([a.x, a.y, half], [b.x, b.y, half], [c.x, c.y, half]);
    triangle([a.x, a.y, -half], [c.x, c.y, -half], [b.x, b.y, -half]);
  }
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i], b = contour[(i + 1) % contour.length];
    const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x);
    const upper = Math.abs(a.y - seatY) < 1e-6, lower = Math.abs(a.y - bottomY) < 1e-6;
    if ((upper || lower) && Math.abs(a.y - b.y) < 1e-6 && left < holeX && holeX < right) {
      // 槽底的两个板面共用同一圈孔边顶点，孔内保持贯通。
      const rectangle = [new THREE.Vector2(left, -half), new THREE.Vector2(right, -half),
        new THREE.Vector2(right, half), new THREE.Vector2(left, half)];
      const points = [...rectangle, ...circle].map(({ x, y }): Point => [x, a.y, y]);
      for (const [p, q, r] of THREE.ShapeUtils.triangulateShape(rectangle, [circle])) {
        if (upper) triangle(points[p], points[r], points[q]);
        else triangle(points[p], points[q], points[r]);
      }
    } else {
      quad([a.x, a.y, -half], [b.x, b.y, -half], [b.x, b.y, half], [a.x, a.y, half]);
    }
  }
  for (let i = 0; i < circle.length; i++) {
    const a = circle[i], b = circle[(i + 1) % circle.length];
    quad([a.x, bottomY, a.y], [b.x, bottomY, b.y], [b.x, seatY, b.y], [a.x, seatY, a.y]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}
