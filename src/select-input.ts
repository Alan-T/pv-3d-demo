import { computed, nextTick, type ComponentPublicInstance } from 'vue';

export function setSelectExpanded(input: HTMLInputElement | null, expanded: boolean, keepFocus: boolean) {
  if (!input) return;
  input.setAttribute('aria-expanded', String(expanded));
  if (!expanded || !keepFocus) return;
  // TinyVue 在窄屏展开后会异步失焦，搜索和键盘导航需要保留焦点。
  nextTick(() => setTimeout(() => {
    if (input.isConnected && input.getAttribute('aria-expanded') === 'true' && document.activeElement === document.body) {
      input.focus({ preventScroll: true });
    }
  }, 0));
}

function editableSelect(id: string, label: string, choices: readonly string[], read: () => string, save: (text: string) => void) {
  const presetOptions = choices.map(value => ({ value, label: value }));
  const options = computed(() => {
    const value = read();
    return value && !choices.includes(value) ? [{ value, label: value }, ...presetOptions] : presetOptions;
  });
  let select: (ComponentPublicInstance & { blur(): void }) | null = null;
  let input: HTMLInputElement | null = null;
  let draft: string | undefined;
  let navigated = false;

  function commit(text?: string) {
    draft = undefined;
    if (text !== undefined && text !== read()) save(text);
  }

  return {
    get modelValue() { return read(); },
    get options() { return options.value; },
    ref(control: Element | ComponentPublicInstance | null) {
      if (!control || !('$el' in control)) {
        select = null;
        input = null;
        draft = undefined;
        return;
      }
      select = control as ComponentPublicInstance & { blur(): void };
      input = (control.$el as HTMLElement).querySelector<HTMLInputElement>('input[role="combobox"]');
      if (!input) return;
      input.id = id;
      input.setAttribute('aria-label', label);
      if (!input.hasAttribute('aria-expanded')) input.setAttribute('aria-expanded', 'false');
    },
    onInputCapture(event: Event) {
      if (event.target instanceof HTMLInputElement) draft = event.target.value;
      navigated = false;
    },
    onKeydownCapture(event: KeyboardEvent) {
      if (draft === undefined || event.isComposing) return;
      if (event.key === 'Escape') draft = undefined;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') navigated = true;
      // 粘贴后立即回车时，TinySelect 的高亮可能仍是上一次的选项。
      if (event.key === 'Enter' && !navigated) {
        event.preventDefault();
        event.stopPropagation();
        commit(draft);
        select?.blur();
      }
    },
    'onUpdate:modelValue': commit,
    onVisibleChange(open: boolean) {
      setSelectExpanded(input, open, true);
      if (!open) commit(draft);
    },
  };
}

export function useEditableSelects<K extends string>(prefix: string, read: (key: K) => string, save: (key: K, value: string) => void) {
  const fields = new Map<K, ReturnType<typeof editableSelect>>();
  return (key: K, label: string, choices: readonly string[]) => {
    let field = fields.get(key);
    if (!field) {
      field = editableSelect(`${prefix}-${key}`, label, choices, () => read(key), value => save(key, value));
      fields.set(key, field);
    }
    return field;
  };
}
