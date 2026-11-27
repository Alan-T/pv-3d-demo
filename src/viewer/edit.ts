import type { RuntimeContext } from './runtime-context.ts';
import type { SceneController } from './scene.ts';
import { V3 } from '../model/geometry/core.ts';
import { updateNumericParameter } from '../domain/parameter-rules.ts';
import type { ViewController } from './view.ts';
import * as THREE from 'three';

import type { NumericParameterKey } from '../domain/design-types.ts';

/* 蓝字（输入参数）点击修改：点击蓝字 → 原位出现红字输入框（带光标）；回车或点别处完成，Esc 取消。
 * 数值超范围自动夹到范围内 */

export function createEditor(context: RuntimeContext, scene: SceneController, view: ViewController) {
  const { getScene } = scene;
  const { getCamera } = view;

  let editEl: HTMLInputElement | null = null;
  let parameterChanged: (() => void) | null = null;
  let listeners: AbortController | undefined;
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let editing: { sprite: THREE.Sprite; key: NumericParameterKey } | null = null;   // { sprite, key }
  function isVisibleInScene(object: THREE.Object3D) {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) {
      if (!node.visible) return false;
    }
    return true;
  }

  function pickLabel(ev: PointerEvent) {
    if (!context.display.dims) return null;
    const r = getScene().canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, getCamera());
    const editableLabels = context.labels.filter(label => label.userData.edit && isVisibleInScene(label));
    const hit = raycaster.intersectObjects(editableLabels, false)[0];
    return hit?.object instanceof THREE.Sprite ? hit.object : null;
  }

  function placeEdit() {
    if (!editing || !editEl) return;
    const sp = editing.sprite, h = Math.round(sp.userData.px * context.state.labelK) + 6;
    const v = sp.getWorldPosition(new V3()).project(getCamera());
    const w = Math.max(Math.round((h - 6) * sp.userData.aspect) + 12, 60);
    const { canvas } = getScene();
    // 输入框和画布都以当前设计器的 stage 为定位容器。
    editEl.style.height = `${h}px`;
    editEl.style.width = `${w}px`;
    editEl.style.fontSize = `${Math.round((h - 6) * 0.78)}px`;
    editEl.style.left = `${canvas.offsetLeft + ((v.x + 1) / 2) * canvas.clientWidth - w / 2}px`;
    editEl.style.top = `${canvas.offsetTop + ((1 - v.y) / 2) * canvas.clientHeight - h / 2}px`;
  }

  function openEdit(sp: THREE.Sprite) {
    if (!editEl) return;
    editing = { sprite: sp, key: sp.userData.edit };
    editEl.value = String(context.parameters[editing.key]);
    // 画布决定本次编辑的初值，同步给输入组件的 v-model。
    editEl.dispatchEvent(new Event('input', { bubbles: true }));
    editEl.hidden = false;
    placeEdit();
    editEl.focus();
    const n = editEl.value.length;
    editEl.setSelectionRange(n, n);
  }

  function closeEdit(commit: boolean) {
    if (!editing || !editEl) return;
    const { sprite, key } = editing;
    editing = null;
    editEl.hidden = true;
    sprite.visible = true;
    const v = parseFloat(editEl.value.replace(/[^\d.\-]/g, ''));
    if (commit && isFinite(v)) setParam(key, v);
  }

  function setParam(key: NumericParameterKey, value: number) {
    if (updateNumericParameter(context.parameters, key, value)) parameterChanged?.();
  }

  // 每帧在标注文字更新之后调用：正在修改的那个文字由输入框代替
  function update() {
    if (!editing) return;
    editing.sprite.visible = false;
    placeEdit();
  }

  let downAt: { x: number; y: number; t: number } | null = null;
  function initEditing(input: HTMLInputElement, onParameterChange: () => void) {
    editEl = input;
    parameterChanged = onParameterChange;
    const { canvas } = getScene();
    listeners = new AbortController();
    const options = { signal: listeners.signal };
    canvas.addEventListener('pointerdown', (e) => {
      // OrbitControls 会 preventDefault，输入框不会自己失焦，这里手动提交
      if (editing) input.blur();
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
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeEdit(false); }
    }, options);
    editEl.addEventListener('blur', () => closeEdit(true), options);
  }

  function disposeEditing() {
    listeners?.abort();
    closeEdit(false);
    downAt = null;
    editEl = null;
    parameterChanged = null;
    listeners = undefined;
  }

  return { initEditing, disposeEditing, pickLabel, setParam, update, closeEdit };
}

export type EditorController = ReturnType<typeof createEditor>;
