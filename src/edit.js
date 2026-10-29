/* 蓝字（输入参数）点击修改：点击蓝字 → 原位出现红字输入框（带光标）；回车或点别处完成，Esc 取消。
 * 数值超范围自动夹到范围内 */
(function () {
  'use strict';
  const PV = window.PV;
  const { V3, canvas } = PV;

  const editEl = document.getElementById('dimEdit');
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let editing = null;   // { sprite, key }
  const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

  function pickLabel(ev) {
    if (!PV.show.dims) return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, PV.view.camera);
    const hit = raycaster.intersectObjects(PV.labels.filter((l) => l.userData.edit && shown(l)), false)[0];
    return hit ? hit.object : null;
  }

  function placeEdit() {
    const sp = editing.sprite, h = Math.round(sp.userData.px * PV.state.labelK) + 6;
    const v = sp.getWorldPosition(new V3()).project(PV.view.camera);
    const w = Math.max(Math.round((h - 6) * sp.userData.aspect) + 12, 60);
    editEl.style.height = `${h}px`;
    editEl.style.width = `${w}px`;
    editEl.style.fontSize = `${Math.round((h - 6) * 0.78)}px`;
    editEl.style.left = `${((v.x + 1) / 2) * canvas.clientWidth - w / 2}px`;
    editEl.style.top = `${((1 - v.y) / 2) * canvas.clientHeight - h / 2}px`;
  }

  function openEdit(sp) {
    editing = { sprite: sp, key: sp.userData.edit };
    editEl.value = String(PV.P[editing.key]);
    editEl.hidden = false;
    placeEdit();
    editEl.focus();
    const n = editEl.value.length;
    editEl.setSelectionRange(n, n);
  }

  function closeEdit(commit) {
    if (!editing) return;
    const { sprite, key } = editing;
    editing = null;
    editEl.hidden = true;
    sprite.visible = true;
    const v = parseFloat(editEl.value.replace(/[^\d.\-]/g, ''));
    if (commit && isFinite(v)) setParam(key, v);
  }

  function setParam(key, v) {
    const P = PV.P;
    const [lo, hi, step] = PV.limits(key);
    v = Math.min(hi, Math.max(lo, Math.round(v / step) * step));
    v = Math.round(v * 10) / 10;
    if (P[key] === v) return;
    P[key] = v;
    if (key === 'modL') P.hole = Math.min(P.hole, P.modL - 200);
    PV.panel.showValue(key, v);
    PV.build();
  }

  // 每帧在标注文字更新之后调用：正在修改的那个文字由输入框代替
  function update() {
    if (!editing) return;
    editing.sprite.visible = false;
    placeEdit();
  }

  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => {
    // OrbitControls 会 preventDefault，输入框不会自己失焦，这里手动提交
    if (editing) editEl.blur();
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const click = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6 && performance.now() - downAt.t < 1000;
    downAt = null;
    const sp = click && pickLabel(e);
    if (sp) openEdit(sp);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!e.buttons) canvas.style.cursor = pickLabel(e) ? 'text' : '';
  });
  editEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); editEl.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeEdit(false); }
  });
  editEl.addEventListener('blur', () => closeEdit(true));

  PV.edit = { pickLabel, setParam, update };
})();
