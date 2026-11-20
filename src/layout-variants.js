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

  // P 是旧有三维模型、标注编辑器共用的参数对象。同一帧内编辑后即切换时也需记下最新值。
  captureParameters(parameters) {
    const local = this.active.parameters;
    for (const [key, value] of Object.entries(structuredClone(parameters))) {
      const target = Object.hasOwn(local, key) ? local : this.sharedParameters;
      target[key] = value;
    }
  }

  getModelParameters() {
    return structuredClone({ ...this.sharedParameters, ...this.active.parameters });
  }

  select(id) {
    if (id === this.activeId || !this.layouts.some(item => item.id === id)) return false;
    this.activeId = id;
    return true;
  }

  add() {
    const id = String(this.nextId++);
    const { parameters, sections } = structuredClone(this.active);
    this.layouts.push({ id, label: `排布${this.layouts.length + 1}`, quantity: 1, parameters, sections });
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
    this.sharedParameters = structuredClone(this.defaultShared);
    const original = this.defaultLayouts[Number(this.activeId) - 1] ?? this.defaultLayouts[0];
    const { parameters, sections } = structuredClone(original);
    Object.assign(this.active, { parameters, sections });
  }
}
