/* 右侧面板：参数输入、显示开关、视角和节点按钮，以及计算结果、与图纸核对两张表 */
(function () {
  'use strict';
  const PV = window.PV;
  const { FIX, CLIP } = PV;
  const st = PV.state;

  const inputs = {};
  const conditional = [];   // 带 when 的参数行：只在条件成立时显示（比如压块长度只在“压块”时）
  const refreshRows = () => { for (const [row, d] of conditional) row.style.display = d.when(PV.P) ? '' : 'none'; };
  let pending = false;
  function scheduleBuild() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; PV.build(); });
  }

  function init() {
    const P = PV.P;
    const box = document.getElementById('params');
    for (const d of PV.PARAMS) {
      const row = document.createElement('div');
      row.className = 'prow';
      if (d.when) conditional.push([row, d]);
      if (d.type === 'select') {
        row.innerHTML = `<span class="pl">${d.label}</span>` +
          `<select aria-label="${d.label}">${d.options.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>` +
          (d.hint ? `<small>${d.hint}</small>` : '');
        const sel = row.querySelector('select');
        sel.value = P[d.key];
        sel.addEventListener('change', () => { P[d.key] = sel.value; refreshRows(); scheduleBuild(); });
        inputs[d.key] = { show: (v) => { sel.value = v; } };
        box.appendChild(row);
        continue;
      }
      if (d.type === 'bool') {
        row.classList.add('pbool');
        row.innerHTML = `<label class="pl"><input type="checkbox"${P[d.key] ? ' checked' : ''}>${d.label}</label>` +
          (d.hint ? `<small>${d.hint}</small>` : '');
        const cb = row.querySelector('input');
        cb.addEventListener('change', () => { P[d.key] = cb.checked ? 1 : 0; scheduleBuild(); });
        inputs[d.key] = { show: (v) => { cb.checked = !!v; } };
        box.appendChild(row);
        continue;
      }
      row.innerHTML =
        `<span class="pl">${d.label}</span>` +
        `<span class="pv"><input type="number" min="${d.min}" max="${d.max}" step="${d.step}" value="${P[d.key]}"><i>${d.unit}</i></span>` +
        `<input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${P[d.key]}" aria-label="${d.label}">` +
        (d.hint ? `<small>${d.hint}</small>` : '');
      const num = row.querySelector('input[type=number]'), range = row.querySelector('input[type=range]');
      const set = (val, src) => {
        if (!isFinite(val)) return;
        val = Math.min(d.max, Math.max(d.min, val));
        P[d.key] = val;
        if (src !== range) range.value = val;
        if (src !== num) num.value = val;
        scheduleBuild();
      };
      range.addEventListener('input', () => set(+range.value, range));
      num.addEventListener('change', () => set(+num.value, null));
      inputs[d.key] = { show: (v) => { num.value = v; range.value = v; } };
      box.appendChild(row);
    }
    refreshRows();
    // 图纸方案：整套参数切换到对应图纸；“恢复图纸参数”回到当前方案的图纸值。原图叠加只有图纸一
    const presetEl = document.getElementById('preset'), overlayCb = document.querySelector('[data-k=overlay]');
    const applyPreset = () => {
      Object.assign(P, PV.PRESETS[st.preset]);
      for (const k in inputs) inputs[k].show(P[k]);
      refreshRows();
      overlayCb.disabled = st.preset !== 'A';
      overlayCb.closest('label').classList.toggle('off', st.preset !== 'A');
      PV.build();
      PV.view.set(st.view);
    };
    presetEl.addEventListener('change', () => { st.preset = presetEl.value; applyPreset(); });
    document.getElementById('reset').addEventListener('click', applyPreset);
    document.querySelectorAll('.toggles input').forEach((cb) => {
      cb.addEventListener('change', () => {
        PV.show[cb.dataset.k] = cb.checked;
        PV.view.applyVisibility();
        if (cb.dataset.k === 'overlay' && cb.checked) {
          PV.overlay.ensure();
          if (st.view !== 'side') PV.view.set('side');
        }
      });
    });
    PV.view.buttons.forEach((b) => b.addEventListener('click', () => PV.view.set(b.dataset.view)));
    // 节点详图：先选节点种类、前/后侧，再选正视/轴测；不在节点视图时点种类直接进正视。
    // 檩条-组件、边压块直接进轴测：正视沿檩条看，组件缝、压块看不出来
    const isoFirst = new Set(['mod', 'side']);
    const openJoint = () => PV.view.set(st.view.startsWith('joint') ? st.view : isoFirst.has(st.jointType) ? 'joint-iso' : 'joint-elev');
    const chipGroup = (sel, apply) => {
      const chips = document.querySelectorAll(sel);
      chips.forEach((b) => b.addEventListener('click', () => {
        apply(b);
        chips.forEach((x) => x.classList.toggle('on', x === b));
        updateJointChips();
        openJoint();
      }));
    };
    chipGroup('[data-jtype]', (b) => { st.jointType = b.dataset.jtype; });   // 点“檩条-组件”默认中压块
    chipGroup('[data-clamp]', (b) => { st.jointType = b.dataset.clamp; });
    chipGroup('[data-joint]', (b) => { st.jointSel = +b.dataset.joint; });
    const panel = document.getElementById('panel');
    document.getElementById('sheetHandle').addEventListener('click', () => {
      panel.classList.toggle('open');
      setTimeout(() => { PV.resize(); PV.view.set(st.view); }, 30);   // 画布变矮了，重新取景
    });
  }

  // 蓝字改了参数后，同步面板里的输入框
  function showValue(key, v) {
    if (inputs[key]) inputs[key].show(v);
  }

  function kgPerM(sec) { return ((sec.t * (sec.d + 2 * sec.f + 2 * sec.l) - 4 * sec.t * sec.t) * 7.85) / 1000; }

  // 压块固定且选中“檩条-组件”时，后面多出“中压块 / 边压块”两个选项（节点种类 mod / side）；
  // 改回螺栓固定时 build() 已把边压块退回 mod
  function updateJointChips() {
    const jt = st.jointType, modLike = jt === 'mod' || jt === 'side';
    document.querySelectorAll('[data-jtype]').forEach((b) => b.classList.toggle('on', b.dataset.jtype === (jt === 'side' ? 'mod' : jt)));
    document.querySelectorAll('[data-clampopt]').forEach((el) => { el.style.display = PV.P.fix === 'clamp' && modLike ? '' : 'none'; });
    document.querySelectorAll('[data-clamp]').forEach((b) => b.classList.toggle('on', b.dataset.clamp === jt));
  }

  function update() {
    updateJointChips();
    const P = PV.P, S = st.S;
    const r = Math.round, h1 = (x) => Math.round(x * 10) / 10, n = P.frames, L = st.layout, O = S.outer, np = S.purlins.length;
    document.querySelector('.title small').textContent =
      `固定倾角 · 双立柱 · 组件竖排 ${P.rows} 块${O ? ' · 带外斜撑' : ''}（单位 mm）`;
    document.getElementById('warnings').innerHTML = S.warn.map((w) => `<li>${w}</li>`).join('');
    const braceSum = S.braceF + S.braceR + (O ? O.braceOF + O.braceOR : 0);
    const steelKg =
      n * ((S.lenF + S.lenR) * kgPerM(FIX.post) + S.beamLen * kgPerM(FIX.beam) + braceSum * kgPerM(FIX.brace)) / 1000 +
      (np * L.purlinLen * kgPerM(FIX.purlin)) / 1000;
    const rows = [
      ['榀距 首末跨 / 中间跨', `${P.pitchEnd} / ${P.pitch}（总 ${r(L.spanEW)}）`],
      // 东西坡度：榀距是沿檩条的长度，水平距离 = 榀距 × cos，相邻榀抬高 = 榀距 × sin
      ...(L.ew.i ? [
        ['水平榀距 首末跨 / 中间跨', `${h1(P.pitchEnd * L.ew.ca)} / ${h1(P.pitch * L.ew.ca)}（总 ${r(L.spanEW * L.ew.ca)}）`],
        ['相邻榀高差 首末跨 / 中间跨', `${h1(P.pitchEnd * L.ew.sa)} / ${h1(P.pitch * L.ew.sa)}（首末榀 ${r(L.spanEW * L.ew.sa)}）`],
      ] : []),
      ['斜梁', `${r(S.beamLen)} × ${n}（两端悬挑 ${r(S.ovh)}）`],
      ['前柱 总长（露出）', `${r(S.lenF)}（${r(S.topF)}）× ${n}`],
      ['后柱 总长（顶高）', `${r(S.lenR)}（${r(S.topR)}）× ${n}`],
      ['前 / 后斜撑', `${r(S.braceF)} / ${r(S.braceR)} × ${n}`],
      ...(O ? [['前 / 后外斜撑', `${r(O.braceOF)} / ${r(O.braceOR)} × ${n}`]] : []),
      ['斜撑连接板', `${2 * n} 块（${O ? '双面 ' : '单面 '}${L.joints[0].spec}）`],
      ['檩托', `${L.counts.clip} 个（L 形 t=${CLIP.t}）`],
      ['M12 螺栓', `${L.counts.m12} 套`],
      ...(L.counts.clamps ? [
        ['中压块 / 边压块', `${L.counts.clamps.mid} / ${L.counts.clamps.side} 个（长 ${P.clampL}）`],
        ['M8×35 内六角螺栓', `${L.counts.m8c} 套`],
      ] : [['M8×22 组件安装螺栓', `${L.counts.m8} 套`]]),
      ['檩条', `${r(L.purlinLen)} × ${np}`],
      ['组件', `${P.rows * L.cols} 块（${P.rows} × ${L.cols}）`],
      ['钢材估重', `${r(steelKg)} kg`],
      ['前沿实际离地', `${r(S.clearEdge)}`],
      ['后柱处地面（相对 ±0）', `${S.gR > 0 ? '+' : ''}${r(S.gR)}`],
    ];
    document.getElementById('results').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

    // 与所选图纸核对；模型里没有的项（比如关掉外斜撑）显示“—”
    const gap = (i) => (i + 1 < np ? S.purlins[i + 1] - S.purlins[i] : NaN);
    const purlinRows = (k) => Array.from({ length: k }, (_, i) => [`檩条间距 ${i + 1}-${i + 2}`, i % 2 ? 1002 : 1400, gap(i)]);
    const check = st.preset === 'A' ? [
      ['斜梁长度', 4030, S.beamLen],
      ['斜梁上端悬挑', 415, S.ovh],
      ['前柱露出地面', 1038, S.topF],
      ['后柱顶高（±0 起）', 2391, S.topR],
      ['前柱总长', 2838, S.lenF],
      ['后柱总长', 4336, S.lenR],
      ['设计坡差 5%', 145, S.drop],
      ['前斜撑', 1649, S.braceF],
      ['后斜撑', 1816, S.braceR],
      ['檩条总长', 32392, L.purlinLen],
      ['檩条端部悬挑', 796, (L.purlinLen - L.spanEW) / 2],
      ...purlinRows(3),
    ] : [
      ['斜梁长度', 6430, S.beamLen],
      ['前柱总长', 2933, S.lenF],
      ['后柱总长', 3998, S.lenR],
      ['设计坡差 2%', 74, S.drop],
      ['前斜撑', 1722, S.braceF],
      ['后斜撑', 1900, S.braceR],
      ['前外斜撑', 1011, O ? O.braceOF : NaN],
      ['后外斜撑', 2184, O ? O.braceOR : NaN],
      ['檩条总长', 31238, L.purlinLen],
      ['檩条端部悬挑', 994, (L.purlinLen - L.spanEW) / 2],
      ...purlinRows(5),
    ];
    document.querySelector('#check tbody').innerHTML = check.map(([k, a, b]) => {
      if (!isFinite(b)) return `<tr><td>${k}</td><td>${a}</td><td>—</td><td class="bad">—</td></tr>`;
      const d = r(b) - a;
      return `<tr><td>${k}</td><td>${a}</td><td>${r(b)}</td><td class="${Math.abs(d) <= 2 ? 'ok' : 'bad'}">${d > 0 ? '+' : ''}${d}</td></tr>`;
    }).join('');
  }

  PV.panel = { init, update, showValue };
})();
