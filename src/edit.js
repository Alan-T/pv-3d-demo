import { canvas } from './scene.js';
import { V3, shared } from './core.js';
import { show, P, limits } from './config.js';
import { getCamera } from './view.js';
import * as THREE from 'three';

const params = P;

/* 蓝字（输入参数）点击修改：点击蓝字 → 原位出现红字输入框（带光标）；回车或点别处完成，Esc 取消。
 * 数值超范围自动夹到范围内 */

let editEl, parameterChanged, listeners;
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
let editing = null;   // { sprite, key }
const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

function pickLabel(ev) {
  if (!show.dims) return null;
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, getCamera());
  const hit = raycaster.intersectObjects(shared.labels.filter((l) => l.userData.edit && shown(l)), false)[0];
  return hit ? hit.object : null;
}

function placeEdit() {
  const sp = editing.sprite, h = Math.round(sp.userData.px * shared.state.labelK) + 6;
  const v = sp.getWorldPosition(new V3()).project(getCamera());
  const w = Math.max(Math.round((h - 6) * sp.userData.aspect) + 12, 60);
  editEl.style.height = `${h}px`;
  editEl.style.width = `${w}px`;
  editEl.style.fontSize = `${Math.round((h - 6) * 0.78)}px`;
  editEl.style.left = `${((v.x + 1) / 2) * canvas.clientWidth - w / 2}px`;
  editEl.style.top = `${((1 - v.y) / 2) * canvas.clientHeight - h / 2}px`;
}

function openEdit(sp) {
  editing = { sprite: sp, key: sp.userData.edit };
  editEl.value = String(P[editing.key]);
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
  const P = params;
  const [lo, hi, step] = limits(key);
  v = Math.min(hi, Math.max(lo, Math.round(v / step) * step));
  v = Math.round(v * 10) / 10;
  if (P[key] === v) return;
  P[key] = v;
  if (key === 'modL') P.hole = Math.min(P.hole, P.modL - 200);
  parameterChanged();
}

// 每帧在标注文字更新之后调用：正在修改的那个文字由输入框代替
function update() {
  if (!editing) return;
  editing.sprite.visible = false;
  placeEdit();
}

let downAt = null;
export function initEditing(input, onParameterChange) {
  editEl = input;
  parameterChanged = onParameterChange;
  listeners = new AbortController();
  const options = { signal: listeners.signal };
  canvas.addEventListener('pointerdown', (e) => {
    // OrbitControls 会 preventDefault，输入框不会自己失焦，这里手动提交
    if (editing) editEl.blur();
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  }, options);
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const click = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6 && performance.now() - downAt.t < 1000;
    downAt = null;
    const sp = click && pickLabel(e);
    if (sp) openEdit(sp);
  }, options);
  canvas.addEventListener('pointermove', (e) => {
    if (!e.buttons) canvas.style.cursor = pickLabel(e) ? 'text' : '';
  }, options);
  editEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); editEl.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeEdit(false); }
  }, options);
  editEl.addEventListener('blur', () => closeEdit(true), options);
}

export function disposeEditing() {
  listeners?.abort();
  closeEdit(false);
  downAt = null;
  editEl = parameterChanged = listeners = null;
}

export { pickLabel, setParam, update, closeEdit };
