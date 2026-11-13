import { applyPresetSections, applySection, getSectionLibrary, FIX, P, PARAMS, PRESETS, SECTION_LABEL, show } from './config.js';
import { shared } from './core.js';
import { initScene, disposeScene, scene, renderer, controls, resize } from './scene.js';
import { initMaterials, disposeMaterials } from './materials.js';
import { build, clearDynamic } from './model.js';
import { initEditing, disposeEditing, closeEdit, setParam, pickLabel, update as updateEditor } from './edit.js';
import { updateLabels, disposeDimensions } from './dims.js';
import { initView, disposeView, setView, applyVisibility, getCamera, tick } from './view.js';
import { solve } from './solve.js';
import { createReport } from './report.js';

const state = shared.state;
const normalizeSection = name => String(name).toLowerCase().replace(/[×x*＊]/g, 'x').replace(/\s+/g, '');

function sectionName(key) {
  const section = FIX[key];
  const match = getSectionLibrary(key).find(item => (item.type ?? 'C') === (section.type ?? 'C')
    && item.d === section.d && item.f === section.f && item.l === section.l && item.t === section.t);
  return match?.name ?? (section.type === 'L'
    ? `L${section.d}*${section.f}*${section.t}`
    : `C${section.d}*${section.f}*${section.l}*${section.t}`);
}

// Vue receives plain snapshots. Three.js objects stay inside the scene runtime.
export function getSnapshot() {
  const layout = state.layout;
  return {
    parameters: Object.fromEntries(Object.entries(P).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])),
    sections: Object.fromEntries(Object.keys(SECTION_LABEL).map(key => [key, sectionName(key)])),
    display: { ...show },
    preset: state.preset,
    view: state.view,
    jointType: state.jointType,
    jointSel: state.jointSel,
    viewLocked: controls?.enableRotate === false,
    spliceAvailable: !!(layout?.cuts.positions.length && layout.purlinConnector),
    bayCount: layout ? layout.zs.length - 1 : 0,
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

  function rebuild() {
    if (disposed) return;
    cancelAnimationFrame(buildFrame);
    buildFrame = 0;
    closeEdit(false);
    build();
    publish();
  }

  function scheduleBuild() {
    if (!buildFrame && !disposed) buildFrame = requestAnimationFrame(rebuild);
  }

  function draw() {
    updateLabels(getCamera());
    updateEditor();
    renderer.render(scene, getCamera());
  }

  function fitCanvas() {
    if (!disposed && resize()) draw();
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
    if (kind === 'side') state.jointSel = Number(value);
    else state.jointType = value;
    const next = state.view.startsWith('joint') ? state.view
      : ['mod', 'side', 'splice'].includes(state.jointType) ? 'joint-iso' : 'joint-elev';
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
      scheduleBuild();
    }
    return sectionName(key);
  }

  function applyPreset(preset) {
    state.preset = preset;
    const { sections, ...parameters } = PRESETS[preset];
    for (const [key, value] of Object.entries(parameters)) P[key] = Array.isArray(value) ? [...value] : value;
    applyPresetSections(preset);
    rebuild();
    selectView(state.view);
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
      get camera() { return getCamera(); },
      get state() { return { S: state.S, layout: state.layout, view: state.view, cam: getCamera().type }; },
    };
    animationFrame = requestAnimationFrame(frame);
  } catch (error) {
    dispose();
    throw error;
  }

  return {
    changeParameter, changeSection, applyPreset, changePostTieMode, changePostTieBay,
    changePurlinTieBay, changeDisplay, selectView, selectJoint, fitCanvas, dispose,
  };
}
