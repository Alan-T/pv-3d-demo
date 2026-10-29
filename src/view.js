/* 视角与显示：各视图下显示哪些部分、相机取景和切换动画 */
(function () {
  'use strict';
  const PV = window.PV;
  const { DEG, MM, V3, V, EY, FIX, M, canvas, renderer, persp, ortho, controls, sun } = PV;
  const st = PV.state;

  let cam = persp;
  let tween = null;

  // ---------- 显示开关 ----------
  const clipLo = new THREE.Plane(new V3(0, 0, 1), 0), clipHi = new THREE.Plane(new V3(0, 0, -1), 0);
  function applyVisibility() {
    const g = st.groups, d = st.dims, view = st.view, show = PV.show;
    if (!g) return;
    d.root.visible = show.dims;
    d.key.visible = view === '3d' || view === 'side';
    d.side.visible = view === 'side';
    d.ew.visible = view === '3d' || view === 'front' || view === 'top';
    d.normal.visible = view === 'normal';
    d.joint.visible = view.startsWith('joint');
    d.joint.children.forEach((j) => { j.visible = j.userData.joint === st.jointType + st.jointSel; });
    d.deep.visible = show.buried;
    g.buried.visible = show.buried;
    g.modules.visible = show.modules;
    const inJoint = view.startsWith('joint'), sectioned = view === 'joint-iso';
    // 轴测节点图只看最东一榀前后 700 mm 的一段（剖切），相邻榀、通长檩条的其余部分都不画，像 CAD 节点详图。
    // 正视不剖切：正视里组件、檩条只看得到端面，剖掉端面后侧面全是“侧着”的，会整个看不见；
    // 而正视下相邻榀正好重合在后面，本来也不乱
    if (sectioned) {
      const z = st.layout.zs[st.layout.zs.length - 1];
      clipLo.constant = -(z - 400) * MM;
      clipHi.constant = (z + 300) * MM;
      renderer.clippingPlanes = [clipLo, clipHi];
    } else {
      renderer.clippingPlanes = [];
    }
    PV.ghostModules(view === 'normal' || (sectioned && st.jointType === 'clip'), sectioned ? 0.2 : 0.32);
    PV.ghostMat(M.beam, inJoint && (st.jointType === 'top' || st.jointType === 'btop'), 0.42);
    g.hw.visible = show.bolts;
    st.overlay.visible = show.overlay && st.preset === 'A';   // 原图只有图纸一（2 排）的侧视图
    const gm = M.ground;
    const wantTransparent = show.buried;
    if (gm.transparent !== wantTransparent) {
      gm.transparent = wantTransparent;
      gm.opacity = wantTransparent ? 0.5 : 1;
      gm.depthWrite = !wantTransparent;
      gm.needsUpdate = true;
    }
    PV.applyPalette();
  }

  function visibleBox(objs) {
    const box = new THREE.Box3(), tmp = new THREE.Box3();
    const visit = (o) => {
      if (!o.visible || o.isSprite || o.userData.noBox) return;
      if (o.geometry) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        box.union(tmp);
      }
      for (const ch of o.children) visit(ch);
    };
    for (const o of objs) { o.updateMatrixWorld(true); visit(o); }
    return box;
  }

  function placeSun() {
    const box = visibleBox([st.groups.model]);
    const ctr = box.getCenter(new V3());
    const rad = box.getSize(new V3()).length() / 2 + 2;
    sun.position.copy(ctr).addScaledVector(new V3(-0.55, 0.78, 0.32).normalize(), rad + 12);
    sun.target.position.copy(ctr);
    const sc = sun.shadow.camera;
    sc.left = -rad; sc.right = rad; sc.top = rad; sc.bottom = -rad;
    sc.near = 0.5; sc.far = 2 * rad + 30;
    sc.updateProjectionMatrix();
  }

  // ---------- 视角切换 ----------
  const viewButtons = document.querySelectorAll('.views button[data-view]');

  // 侧视、正视、俯视、垂直组件锁定方向：不能旋转，左键/单指改为平移，缩放照常
  const LOCKED_VIEWS = new Set(['side', 'front', 'top', 'normal']);
  const hintEl = document.getElementById('hint');
  function lockView(locked) {
    controls.enableRotate = !locked;
    controls.mouseButtons.LEFT = locked ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.touches.ONE = locked ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    hintEl.textContent = locked ? '视图已锁定：拖动平移 · 滚轮/双指缩放' : '拖动旋转 · 滚轮/双指缩放 · 右键/双指平移';
  }

  // 垂直组件、连接节点这几个视图的取景跟着几何走（法向随倾角变、节点随尺寸移动）。
  // 返回正交相机的目标点、视线方向（目标点 → 相机）和缩放
  const FOLLOW_VIEWS = new Set(['normal', 'joint-elev', 'joint-iso']);
  function framePose(name) {
    const { S, layout } = st, P = PV.P;
    if (name === 'normal') {
      // 沿组件法向看：屏幕横向 = 东西向，纵向 = 沿坡向上（倾角 > 0 时世界 y 投影到屏幕正好朝上坡）
      const n = new V3(-S.s, S.c, 0), u = new V3(S.c, S.s, 0);
      const q = S.along((S.modStarts[0] + S.modStarts[S.modStarts.length - 1] + P.modL) / 2);
      const c = V(q.x, q.y, 0).addScaledVector(n, (S.hModBot + FIX.modT) * MM).addScaledVector(u, 0.25);
      // 标注文字是固定像素大小，所以按屏幕像素留边：左右 64px、上下 72px
      const w = (layout.purlinLen + 700) * MM, h = (P.rows * P.modL + (P.rows - 1) * FIX.modGap + 800) * MM;
      const pw = Math.max(80, canvas.clientWidth - 128), ph = Math.max(80, canvas.clientHeight - 144);
      const half = (Math.max(w / pw, h / ph) * canvas.clientHeight) / 2;
      return { target: c, dir: n, zoom: 1 / half };
    }
    // 最东一榀的连接节点。正视：从东往西正对节点（同节点正视图）；轴测：略偏向文字一侧、偏上，看得出螺栓和板厚。
    // 都用正交相机：后面各榀与本榀重合或整体平移出画面，不会在节点背后挤成一团。
    // 取景按屏幕像素算：节点区域（mm）+ 文字（最长约 230px，手机 170px），比例最大 3 px/mm
    const sp = layout.jointSpecs[st.jointType][st.jointSel], z = layout.zs[layout.zs.length - 1] + FIX.post.f / 2;
    const xL = Math.min(sp.box[0], sp.box[1]), xR = Math.max(sp.box[0], sp.box[1]), yB = sp.box[2], yT = sp.box[3];
    const cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1, labelPx = cw < 520 ? 170 : 230;
    const scale = Math.max(0.2, Math.min(3, (cw - labelPx - 40) / (xR - xL), (ch - 190) / (yT - yB)));
    const c = V((xL + xR) / 2 + (sp.labelSide * labelPx) / 2 / scale, (yB + yT) / 2 + 40 / scale, z);
    // 轴测一般偏向文字一侧；檩托在檩条下坡一侧，所以檩条-斜梁从下坡（南）一侧看
    const sx = st.jointType === 'clip' ? -1 : sp.labelSide;
    const dir = name === 'joint-elev' ? new V3(0, 0, 1) : new V3(0.4 * sx, 0.3, 1).normalize();
    return { target: c, dir, zoom: 1 / ((ch / 2 / scale) * MM) };
  }

  // 重建前调用：停在上面这些视图里时记下旧几何下的取景
  function savePose() {
    return st.layout && FOLLOW_VIEWS.has(st.view) ? framePose(st.view) : null;
  }

  // 参数改了以后，若停在上面这些视图里：按新几何重新取景，同时保留用户在视图里做过的平移和缩放
  function screenAxes(dir) {
    const right = new V3().crossVectors(EY, dir).normalize();   // 相机在 target + dir 一侧、朝 −dir 看
    return [right, new V3().crossVectors(dir, right).normalize()];
  }
  function follow(oldPose) {
    if (!oldPose || !FOLLOW_VIEWS.has(st.view)) return;
    if (tween) { setView(st.view, true); return; }
    const np = framePose(st.view);
    const [r0, u0] = screenAxes(oldPose.dir), [r1, u1] = screenAxes(np.dir);
    const off = controls.target.clone().sub(oldPose.target);
    // 垂直组件锁定了方向，跟着新的组件法向转；节点视图保留用户自己转过的方向
    const dir = st.view === 'normal' ? np.dir : cam.position.clone().sub(controls.target).normalize();
    controls.target.copy(np.target).addScaledVector(r1, off.dot(r0)).addScaledVector(u1, off.dot(u0));
    cam.position.copy(controls.target).addScaledVector(dir, 60);
    cam.zoom *= np.zoom / oldPose.zoom;
    cam.updateProjectionMatrix();
    cam.lookAt(controls.target);
    controls.update();
  }

  function setView(name, instant) {
    st.view = name;
    viewButtons.forEach((b) => b.classList.toggle('on', b.dataset.view === name));
    lockView(LOCKED_VIEWS.has(name));
    applyVisibility();
    const { model } = st.groups, d = st.dims;
    const objs = name === 'side' && PV.show.dims ? [model, d.key, d.side] : [model];
    const box = visibleBox(objs);
    const ctr = box.getCenter(new V3()), size = box.getSize(new V3());
    const aspect = persp.aspect;
    if (FOLLOW_VIEWS.has(name)) {
      const p = framePose(name);
      goTo(ortho, p.target.clone().addScaledVector(p.dir, 60), p.target, p.zoom, instant);
      return;
    }
    if (name === '3d') {
      const dir = new V3(-1, 0.68, 1.25).normalize();
      const vf = persp.fov * DEG, hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
      const dist = (visibleBox([model]).getSize(new V3()).length() / 2 / Math.sin(Math.min(vf, hf) / 2)) * (aspect < 1 ? 0.95 : 0.86);
      goTo(persp, ctr.clone().addScaledVector(dir, dist), ctr, null, instant);
    } else {
      let dir, w, h;
      if (name === 'side') { dir = new V3(0, 0, 1); w = size.x + (PV.show.dims ? 1.6 : 0); h = size.y; }  // 两端文字留边
      else if (name === 'front') { dir = new V3(-1, 0, 0); w = size.z; h = size.y; }
      else { dir = new V3(-0.002, 1, 0).normalize(); w = size.z; h = size.x; }
      const half = Math.max(h / 2, w / 2 / aspect) * 1.1;
      goTo(ortho, ctr.clone().addScaledVector(dir, 60), ctr, 1 / half, instant);
    }
  }

  function goTo(next, pos, target, zoom, instant) {
    const fovT = Math.tan((persp.fov * DEG) / 2);
    if (next !== cam) {
      // 换相机时保持当前朝向与画面比例，过渡才连贯
      const dir = cam.position.clone().sub(controls.target).normalize();
      if (next.isOrthographicCamera) {
        next.zoom = 1 / (cam.position.distanceTo(controls.target) * fovT);
        next.position.copy(controls.target).addScaledVector(dir, 60);
      } else {
        next.position.copy(controls.target).addScaledVector(dir, 1 / (cam.zoom * fovT));
      }
      next.updateProjectionMatrix();
      next.lookAt(controls.target);
      cam = next;
      controls.object = next;
    }
    if (instant) {
      cam.position.copy(pos);
      controls.target.copy(target);
      if (zoom) { cam.zoom = zoom; cam.updateProjectionMatrix(); }
      controls.update();
      tween = null;
      return;
    }
    tween = {
      from: { off: cam.position.clone().sub(controls.target), t: controls.target.clone(), z: cam.zoom },
      to: { off: pos.clone().sub(target), t: target.clone(), z: zoom || cam.zoom },
      t0: performance.now(), dur: 700,
    };
  }

  function stepTween(now) {
    const k = Math.min(1, (now - tween.t0) / tween.dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const f = tween.from, t = tween.to;
    const d0 = f.off.clone().normalize(), d1 = t.off.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(d0, d1);
    const qe = new THREE.Quaternion().slerp(q, e);
    const len = f.off.length() + (t.off.length() - f.off.length()) * e;
    controls.target.lerpVectors(f.t, t.t, e);
    cam.position.copy(controls.target).add(d0.applyQuaternion(qe).multiplyScalar(len));
    if (cam.isOrthographicCamera) { cam.zoom = f.z * Math.pow(t.z / f.z, e); cam.updateProjectionMatrix(); }
    cam.lookAt(controls.target);
    if (k >= 1) { tween = null; controls.update(); }
  }
  controls.addEventListener('start', () => { tween = null; });

  // 每帧调用：切换动画或控制器阻尼
  function tick(now) {
    if (tween) stepTween(now); else controls.update();
  }

  PV.view = {
    set: setView, applyVisibility, placeSun, savePose, follow, tick, buttons: viewButtons,
    get camera() { return cam; },
  };
})();
