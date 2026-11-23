import { getLayoutParameters } from './config.js';
import { getPurlinDimensions } from './solve.js';

export { getLayoutParameters };

export class DrawingLayouts {
  constructor(preset) {
    const { layouts, projectInfo, ...shared } = preset;
    if (!layouts.length) throw new RangeError('每张图纸至少需要一种排布');
    this.defaultShared = shared;
    this.defaultLayouts = layouts;
    this.sharedParameters = structuredClone(shared);
    this.layouts = layouts.map((layout, index) => ({
      ...structuredClone(layout), id: String(index + 1), label: `排布${index + 1}`,
    }));
    this.activeId = this.layouts[0].id;
    this.nextId = this.layouts.length + 1;
  }

  get active() {
    return this.layouts.find(item => item.id === this.activeId);
  }

  purlinLength(layout) {
    return getPurlinDimensions({ ...this.sharedParameters, ...layout }).purlinLen;
  }

  getCutSettings() {
    return {
      lengths: this.layouts.map(layout => this.purlinLength(layout)),
      maxLength: this.sharedParameters.maxPurlin,
    };
  }

  resetChangedCuts(previous) {
    // 预设存数值，下拉框返回字符串；只有料长上限实际改变才重切。
    const maxChanged = String(this.sharedParameters.maxPurlin) !== String(previous.maxLength);
    this.layouts.forEach((layout, index) => {
      if (maxChanged || Math.abs(this.purlinLength(layout) - previous.lengths[index]) > 1e-6) {
        layout.purlinCutMode = 'auto';
        layout.purlinCutLengths = [];
      }
    });
  }

  // P 是旧有三维模型、标注编辑器共用的参数对象。同一帧内编辑后即切换时也需记下最新值。
  captureParameters(parameters) {
    const previousCuts = this.getCutSettings();
    const active = this.active;
    const local = getLayoutParameters(active);
    for (const [key, value] of Object.entries(structuredClone(parameters))) {
      if (Object.hasOwn(local, key)) active[key] = value;
      else if (Object.hasOwn(this.sharedParameters, key)) this.sharedParameters[key] = value;
    }
    this.resetChangedCuts(previousCuts);
  }

  getModelParameters() {
    return structuredClone({ ...this.sharedParameters, ...getLayoutParameters(this.active) });
  }

  select(id) {
    if (id === this.activeId || !this.layouts.some(item => item.id === id)) return false;
    this.activeId = id;
    return true;
  }

  add() {
    const id = String(this.nextId++);
    this.layouts.push({ ...structuredClone(this.active), id, label: `排布${this.layouts.length + 1}`, quantity: 1 });
    this.activeId = id;
  }

  remove(id) {
    const index = this.layouts.findIndex(item => item.id === id);
    if (index < 0 || this.layouts.length === 1) return false;
    this.layouts.splice(index, 1);
    for (let i = index; i < this.layouts.length; i++) {
      this.layouts[i].label = `排布${i + 1}`;
    }
    if (id === this.activeId) this.activeId = this.layouts[Math.min(index, this.layouts.length - 1)].id;
    return true;
  }

  setQuantity(value) {
    const count = Number(value);
    if (Number.isSafeInteger(count) && count > 0) this.active.quantity = count;
    return this.active.quantity;
  }

  reset() {
    const previousCuts = this.getCutSettings();
    this.sharedParameters = structuredClone(this.defaultShared);
    const original = this.defaultLayouts[Number(this.activeId) - 1] ?? this.defaultLayouts[0];
    const index = this.layouts.findIndex(layout => layout.id === this.activeId);
    const { id, label, quantity } = this.layouts[index];
    this.layouts[index] = { ...structuredClone(original), id, label, quantity };
    this.resetChangedCuts(previousCuts);
  }
}
