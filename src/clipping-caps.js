import * as THREE from 'three';

// All tolerances and coordinates are metres. Offset only the cap, not the cut.
const EPS = 1e-7, INSET = 0.00002;

function planeExtent(box, plane) {
  const center = box.getCenter(new THREE.Vector3());
  const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const n = plane.normal;
  const radius = Math.abs(n.x) * half.x + Math.abs(n.y) * half.y + Math.abs(n.z) * half.z;
  const distance = plane.distanceToPoint(center);
  return [distance - radius, distance + radius];
}

function materialAt(geometry, materials, triangle) {
  if (!Array.isArray(materials)) return materials;
  const group = geometry.groups.find(group => triangle >= group.start && triangle < group.start + group.count);
  return materials[group?.materialIndex ?? 0];
}

function contains(contour, point) {
  let inside = false;
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
    const a = contour[i], b = contour[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// Weld segment endpoints in plane coordinates. Neighbour buckets avoid cracks
// when equivalent points lie on opposite sides of a quantisation boundary.
function contoursFromSegments(segments, origin, u, v) {
  const nodes = [], buckets = new Map(), edges = [], unique = new Set();
  function nodeFor(point) {
    const q = point.clone().sub(origin), p = new THREE.Vector2(q.dot(u), q.dot(v));
    const x = Math.floor(p.x / EPS), y = Math.floor(p.y / EPS);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const id of buckets.get(`${x + dx},${y + dy}`) ?? []) {
        if (nodes[id].point.distanceToSquared(p) <= EPS * EPS) return id;
      }
    }
    const id = nodes.length, key = `${x},${y}`;
    nodes.push({ point: p, edges: [] });
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(id);
    return id;
  }
  for (const segment of segments) {
    const a = nodeFor(segment.a), b = nodeFor(segment.b);
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (a === b || unique.has(key)) continue;
    unique.add(key);
    const id = edges.length;
    edges.push({ a, b, material: segment.material, used: false });
    nodes[a].edges.push(id); nodes[b].edges.push(id);
  }
  const contours = [];
  for (let first = 0; first < edges.length; first++) {
    if (edges[first].used) continue;
    const start = edges[first].a, ids = [start], weights = new Map();
    let current = start, edgeId = first, closed = false;
    while (edgeId !== undefined) {
      const edge = edges[edgeId];
      edge.used = true;
      const next = edge.a === current ? edge.b : edge.a;
      const length = nodes[current].point.distanceTo(nodes[next].point);
      weights.set(edge.material, (weights.get(edge.material) ?? 0) + length);
      if (next === start) { closed = true; break; }
      ids.push(next);
      const candidates = nodes[next].edges.filter(id => !edges[id].used);
      // A proper manifold slice has degree two. At a shared vertex, continue
      // along the least-turning edge rather than jumping to another contour.
      const incoming = nodes[next].point.clone().sub(nodes[current].point).normalize();
      candidates.sort((a, b) => {
        const direction = id => {
          const e = edges[id], other = e.a === next ? e.b : e.a;
          return nodes[other].point.clone().sub(nodes[next].point).normalize().dot(incoming);
        };
        return direction(b) - direction(a);
      });
      current = next; edgeId = candidates[0];
    }
    if (!closed || ids.length < 3) continue;
    const points = ids.map(id => nodes[id].point);
    const area = Math.abs(THREE.ShapeUtils.area(points));
    if (area <= EPS * EPS) continue;
    const material = [...weights].sort((a, b) => b[1] - a[1])[0][0];
    contours.push({ points, area, material, parent: null, depth: 0 });
  }
  // Each even-depth contour is solid; its immediate children are holes.
  contours.sort((a, b) => b.area - a.area);
  contours.forEach((contour, index) => {
    for (let j = index - 1; j >= 0; j--) {
      if (contains(contours[j].points, contour.points[0])) {
        contour.parent = contours[j]; contour.depth = contours[j].depth + 1; break;
      }
    }
  });
  return contours;
}

function sliceMesh(geometry, matrix, plane, materials, range) {
  const position = geometry.attributes.position, index = geometry.index;
  const count = index ? index.count : position.count;
  const start = Math.max(0, geometry.drawRange.start, range.start);
  const end = Math.min(count, geometry.drawRange.start + geometry.drawRange.count, range.start + range.count);
  const points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const segments = [];
  for (let i = start; i + 2 < end; i += 3) {
    for (let j = 0; j < 3; j++) points[j].fromBufferAttribute(position, index ? index.getX(i + j) : i + j).applyMatrix4(matrix);
    const distances = points.map(point => plane.distanceToPoint(point));
    if (distances.every(d => d > EPS) || distances.every(d => d < -EPS) || distances.every(d => Math.abs(d) <= EPS)) continue;
    const hits = [];
    const add = point => { if (!hits.some(hit => hit.distanceToSquared(point) <= EPS * EPS)) hits.push(point); };
    for (let j = 0; j < 3; j++) {
      const next = (j + 1) % 3, a = distances[j], b = distances[next];
      if (Math.abs(a) <= EPS) add(points[j].clone());
      if ((a < -EPS && b > EPS) || (a > EPS && b < -EPS)) add(points[j].clone().lerp(points[next], a / (a - b)));
    }
    if (hits.length === 2) segments.push({ a: hits[0], b: hits[1], material: materialAt(geometry, materials, i) });
  }
  return segments;
}

/**
 * Close actual mesh/plane intersections; planes retain their positive side.
 * The returned identity group is in world coordinates. Add it outside any
 * transformed model group, and keep the same clipping planes active on it.
 * materialFor may return null to omit a material. Multi-material contours use
 * the source material occupying the greatest length of their boundary.
 */
export function createClippingCaps(root, planes, { track = value => value, materialFor = material => material } = {}) {
  const caps = new THREE.Group();
  caps.userData.clippingCaps = true;
  const cuts = planes.map(plane => plane.clone().normalize());
  root.updateWorldMatrix(true, true);
  function capInstance(mesh, matrix, instanceIndex) {
    const geometry = mesh.geometry;
    if (!geometry?.attributes.position) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox.clone().applyMatrix4(matrix);
    const extents = cuts.map(plane => planeExtent(box, plane));
    if (extents.some(([, max]) => max < -EPS)) return;
    cuts.forEach((plane, planeIndex) => {
      const [min, max] = extents[planeIndex];
      if (min >= -EPS || max <= EPS) return;
      const origin = plane.coplanarPoint(new THREE.Vector3());
      const reference = Math.abs(plane.normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const u = reference.cross(plane.normal).normalize(), v = new THREE.Vector3().crossVectors(plane.normal, u);
      // 开孔型材由相接的闭合钢板合并而成；逐实体封口，避免共边分叉导致缺翼缘或跨槽三角面。
      const contourSets = (geometry.userData.solidRanges ?? [geometry.drawRange]).map(range =>
        contoursFromSegments(sliceMesh(geometry, matrix, plane, mesh.material, range), origin, u, v));
      for (const contours of contourSets) for (const contour of contours.filter(item => item.depth % 2 === 0)) {
        const material = materialFor(contour.material, mesh);
        if (!material) continue;
        const holes = contours.filter(item => item.parent === contour).map(item => item.points);
        const faces = THREE.ShapeUtils.triangulateShape(contour.points, holes);
        const points = [...contour.points, ...holes.flat()];
        const vertices = [], normal = plane.normal.clone().negate(), normals = [];
        const world = points.map(p => origin.clone().addScaledVector(u, p.x).addScaledVector(v, p.y).addScaledVector(plane.normal, INSET));
        for (const face of faces) {
          const [a, b, c] = face.map(i => world[i]);
          const outward = b.clone().sub(a).cross(c.clone().sub(a)).dot(normal) >= 0;
          for (const point of outward ? [a, b, c] : [a, c, b]) {
            vertices.push(point.x, point.y, point.z); normals.push(normal.x, normal.y, normal.z);
          }
        }
        if (!vertices.length) continue;
        const capGeometry = track(new THREE.BufferGeometry());
        capGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        capGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        const cap = new THREE.Mesh(capGeometry, material);
        cap.userData = { sourceMesh: mesh, sourceMaterial: contour.material, planeIndex, instanceIndex };
        cap.receiveShadow = mesh.receiveShadow;
        caps.add(cap);
      }
    });
  }
  function visit(object) {
    if (!object.visible || object.userData.section || object.userData.clippingCaps) return;
    if (object.isInstancedMesh) {
      const instance = new THREE.Matrix4(), world = new THREE.Matrix4();
      for (let i = 0; i < object.count; i++) {
        object.getMatrixAt(i, instance);
        capInstance(object, world.multiplyMatrices(object.matrixWorld, instance), i);
      }
    } else if (object.isMesh) capInstance(object, object.matrixWorld, null);
    for (const child of object.children) visit(child);
  }
  visit(root);
  return caps;
}
