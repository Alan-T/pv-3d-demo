import { applyPresetSections, applySection, getSectionLibrary, FIX, P, PARAMS, PRESETS, show } from './config.js';
import { shared } from './core.js';
import { initScene, disposeScene, scene, renderer, controls, resize } from './scene.js';
import { initMaterials, disposeMaterials } from './materials.js';
import { build, clearDynamic } from './model.js';
import { initEditing, disposeEditing, closeEdit, setParam, pickLabel, update as updateEditor } from './edit.js';
import { updateLabels, disposeDimensions } from './dims.js';
import { initView, disposeView, setView, applyVisibility, getCamera, resizeTieJointView, tick } from './view.js';
import { solve } from './solve.js';
import { createReport } from './report.js';
import { DrawingLayouts } from './layout-variants.js';

const state = shared.state;
const drawings = Object.fromEntries(Object.entries(PRESETS).map(([id, preset]) => [id, new DrawingLayouts(preset)]));
const currentDrawing = () => drawings[state.preset];
const normalizeSection = name => String(name).toLowerCase().replace(/[×x*＊]/g, 'x').replace(/\s+/g, '');

// Vue receives plain snapshots. Three.js objects stay inside the scene runtime.
export function getSnapshot() {
  const layout = state.layout;
  const drawing = currentDrawing();
  return {
    parameters: Object.fromEntries(Object.entries(P).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])),
    sections: { ...drawing.active.sections },
    activeLayoutId: drawing.activeId,
    layouts: structuredClone(drawing.layouts),
    display: { ...show },
    preset: state.preset,
    view: state.view,
    jointType: state.jointType,
    jointSel: state.jointSel,
    viewLocked: controls?.enableRotate === false,
    spliceAvailable: !!(layout?.cuts.positions.length && layout.purlinConnector),
    tieJointAvailable: Object.fromEntries(['postTie', 'purlinTie'].map(type =>
      [type, [0, 1].map(side => !!layout?.jointSpecs?.[type]?.[side])])),
    braceConnectors: layout?.joints.map(joint => ({
      key: joint.side < 0 ? 'R' : 'F',
      label: joint.side < 0 ? '后柱' : '前柱',
      type: joint.o && !joint.split ? '双面' : '单面',
      spec: joint.spec,
    })) ?? [],
    bayCount: layout ? layout.zs.length - 1 : 0,
    frameCount: layout?.frames ?? 0,
    purlinTieCount: layout?.purlinTies.count ?? 0,
    postTies: layout?.postTies.map(row => ({
      key: row.rear ? 'R' : 'F',
      label: row.rear ? '后排' : '前排',
      topOffset: Math.round(row.topOffset),
      holeRise: row.holeRise,
      enabled: [...row.enabled],
    })) ?? [],
    report: state.S && layout ? createReport(P, FIX, state.S, layout, state.preset) : null,
  };
}

export function createDesigner({ canvas, stage, editor, onUpdate, onReady, onError }) {
  let disposed = false;
  let animationFrame = 0;
  let buildFrame = 0;
  let observer;
  let debug;
  let firstFrame = true;

  function publish() {
    onUpdate(getSnapshot());
  }

  function rebuild(refit = false) {
    if (disposed) return;
    cancelAnimationFrame(buildFrame);
    buildFrame = 0;
    closeEdit(false);
    currentDrawing().captureParameters(P);
    build();
    if (refit) setView(state.view);
    publish();
  }

  function scheduleBuild() {
    currentDrawing().captureParameters(P);
    if (!buildFrame && !disposed) buildFrame = requestAnimationFrame(() => rebuild());
  }

  function draw() {
    updateLabels(getCamera());
    updateEditor();
    renderer.render(scene, getCamera());
  }

  function fitCanvas() {
    if (!disposed && resize()) {
      resizeTieJointView();
      draw();
    }
  }

  function frame(now) {
    if (disposed) return;
    try {
      tick(now);
      draw();
      if (firstFrame) {
        firstFrame = false;
        onReady();
      }
      animationFrame = requestAnimationFrame(frame);
    } catch (error) {
      dispose();
      onError(error);
    }
  }

  function selectView(name, instant) {
    if (buildFrame) rebuild();
    closeEdit(false);
    setView(name, instant);
    publish();
  }

  function selectJoint(kind, value) {
    if (buildFrame) rebuild();
    if (!['side', 'type'].includes(kind)) return;
    const type = kind === 'side' ? state.jointType : value;
    const specs = state.layout?.jointSpecs?.[type];
    if (!Array.isArray(specs) || !specs.some(Boolean) || (type === 'side' && P.fix !== 'clamp')
      || (type === 'splice' && !state.layout.cuts.positions.length)) return;
    let side = kind === 'side' ? Number(value) : state.jointSel;
    if (![0, 1].includes(side)) return;
    if (!specs[side]) {
      if (kind === 'side') return;
      side = specs.findIndex(Boolean);
    }
    state.jointType = type;
    state.jointSel = side;
    const next = state.view.startsWith('joint') ? state.view
      : ['mod', 'side', 'splice', 'postTie', 'purlinTie'].includes(state.jointType) ? 'joint-iso' : 'joint-elev';
    selectView(next);
  }

  function changeParameter(key, value) {
    const definition = PARAMS.find(item => item.key === key);
    if (definition?.type === 'select') {
      if (!definition.options.some(([option]) => option === value)) return P[key];
      if (key === 'purlinTies' && value === 'custom') {
        const installed = new Set(state.layout.purlinTies.rods.map(rod => rod.bay));
        P.purlinTieSpans = Array.from({ length: state.layout.zs.length - 1 }, (_, index) => Number(installed.has(index)));
      }
      P[key] = value;
      scheduleBuild();
    } else if (definition?.type === 'bool') {
      P[key] = Number(value);
      scheduleBuild();
    } else if (String(value).trim() !== '' && Number.isFinite(Number(value))) {
      setParam(key, Number(value));
    }
    return P[key];
  }

  function changeSection(key, text) {
    const query = normalizeSection(text);
    const library = getSectionLibrary(key);
    const section = query && (library.find(item => normalizeSection(item.name) === query)
      ?? library.find(item => normalizeSection(item.name).includes(query)));
    if (section) {
      applySection(key, section);
      currentDrawing().active.sections[key] = section.name;
      scheduleBuild();
    }
    return currentDrawing().active.sections[key];
  }

  function loadActiveLayout() {
    const drawing = currentDrawing();
    Object.assign(P, drawing.getModelParameters());
    applyPresetSections(state.preset, drawing.active.sections);
    rebuild(true);
  }

  function applyPreset(preset) {
    if (!Object.hasOwn(drawings, preset) || preset === state.preset) return;
    closeEdit(true);
    state.preset = preset;
    loadActiveLayout();
  }

  function resetPreset() {
    closeEdit(false);
    currentDrawing().reset();
    loadActiveLayout();
  }

  function selectLayout(id) {
    closeEdit(true);
    if (currentDrawing().select(id)) loadActiveLayout();
  }

  function addLayout() {
    closeEdit(true);
    currentDrawing().add();
    loadActiveLayout();
  }

  function removeLayout(id = currentDrawing().activeId) {
    const drawing = currentDrawing();
    closeEdit(true);
    const previous = drawing.activeId;
    if (!drawing.remove(id)) return;
    if (previous !== drawing.activeId) loadActiveLayout();
    else publish();
  }

  function changeLayoutQuantity(value) {
    const quantity = currentDrawing().setQuantity(value);
    publish();
    return quantity;
  }

  function changePostTieMode(key, mode) {
    if (mode === 'custom') {
      P['postTieSpans' + key] = state.layout.postTies[key === 'F' ? 0 : 1].enabled.map(Number);
    }
    P['postTie' + key] = mode;
    scheduleBuild();
  }

  function changePostTieBay(key, index, enabled) {
    // Preserve edits made during the same animation frame.
    const selected = state.layout.postTies[key === 'F' ? 0 : 1].enabled
      .map((installed, bay) => P['postTieSpans' + key][bay] ?? Number(installed));
    selected[index] = Number(enabled);
    P['postTieSpans' + key] = selected;
    scheduleBuild();
  }

  function changePurlinTieBay(index, enabled) {
    const selected = [...P.purlinTieSpans];
    selected[index] = Number(enabled);
    P.purlinTieSpans = selected;
    scheduleBuild();
  }

  function changeDisplay(key, enabled) {
    show[key] = enabled;
    applyVisibility();
    publish();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(animationFrame);
    cancelAnimationFrame(buildFrame);
    observer?.disconnect();
    window.removeEventListener('resize', fitCanvas);
    disposeEditing();
    clearDynamic();
    disposeView();
    disposeDimensions();
    disposeMaterials();
    disposeScene();
    Object.assign(state, { S: null, layout: null, groups: null, dims: null });
    if (window.pvDemo === debug) delete window.pvDemo;
  }

  try {
    initScene(canvas, stage);
    initMaterials();
    initView();
    initEditing(editor, scheduleBuild);
    resize();
    rebuild();
    selectView(state.view, true);
    if ('ResizeObserver' in window) {
      observer = new ResizeObserver(fitCanvas);
      observer.observe(stage);
    } else {
      window.addEventListener('resize', fitCanvas);
    }
    debug = window.pvDemo = {
      P, show, solve, setView: selectView, rebuild, controls,
      labels: shared.labels, pickLabel,
      get layouts() { return structuredClone(currentDrawing().layouts); },
      get camera() { return getCamera(); },
      get state() { return { S: state.S, layout: state.layout, view: state.view, cam: getCamera().type }; },
    };
    animationFrame = requestAnimationFrame(frame);
  } catch (error) {
    dispose();
    throw error;
  }

  return {
    changeParameter, changeSection, applyPreset, resetPreset, addLayout, removeLayout, selectLayout, changeLayoutQuantity,
    changePostTieMode, changePostTieBay,
    changePurlinTieBay, changeDisplay, selectView, selectJoint, fitCanvas, dispose,
  };
}
