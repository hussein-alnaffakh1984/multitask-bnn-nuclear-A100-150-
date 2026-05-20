// ================================================================
// Multi-Task BNN Webapp — App Logic (v3.1: 14 outputs + R(4/2) fix)
// ================================================================
// v3.1 changes:
//   - R(4/2) computed at display time from E(4+)/E(2+) of the same
//     model output (with Gaussian error propagation) to enforce
//     cross-task consistency. Cases where the explicit BNN R(4/2)
//     prediction disagrees with the ratio of its own E4/E2 are
//     flagged with a "low-confidence" badge.
// ================================================================

// Color palette (synced with style.css)
const COLORS = {
  ink: '#0a1628',
  inkSoft: '#2a3f5f',
  paper: '#f6f3ec',
  accent: '#b13a2a',
  accentSoft: '#d96150',
  gold: '#b8923a',
  teal: '#2d6e7e',
  emerald: '#3a7a5e',
  line: '#d4cfc1',
};

// ================================================================
// INITIALIZATION
// ================================================================

document.addEventListener('DOMContentLoaded', async () => {
  await loadNucleiData();

  initSmoothNav();
  initMetricsGrid();
  initObservablesList();
  initPredictTool();
  initNuclearChart();
  initSnChain();
  initValidationTable();
  // initAblationTable(); // 6-output specific
  // initBaselineTable(); // 6-output specific
  initDataTable();
});

// ================================================================
// NAVIGATION
// ================================================================

function initSmoothNav() {
  const navLinks = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('section[id]');

  // Active link on scroll
  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(s => {
      const top = s.offsetTop - 100;
      if (window.pageYOffset >= top) current = s.id;
    });
    navLinks.forEach(l => {
      l.classList.toggle('active', l.getAttribute('href') === '#' + current);
    });
  });
}

// ================================================================
// SECTION 1: METRICS GRID (Hero)
// ================================================================

function initMetricsGrid() {
  const grid = document.getElementById('metrics-grid');
  if (!grid) return;

  TARGETS.forEach(t => {
    const card = document.createElement('div');
    card.className = 'metric-card';
    const r2Class = t.r2 > 0.9 ? 'good' : (t.r2 > 0.6 ? 'ok' : 'fair');
    card.innerHTML = `
      <div class="metric-name">${t.name}</div>
      <div class="metric-rmse">RMSE ${t.rmse.toLocaleString()}<span class="metric-unit">${t.unit ? ' ' + t.unit : ''}</span></div>
      <div class="metric-row">
        <span class="metric-key">R²</span>
        <span class="metric-val ${r2Class}">${t.r2.toFixed(3)}</span>
      </div>
      <div class="metric-row">
        <span class="metric-key">95% coverage</span>
        <span class="metric-val">${(t.cov95*100).toFixed(0)}%</span>
      </div>
      <div class="metric-row">
        <span class="metric-key">ECE</span>
        <span class="metric-val">${t.ece.toFixed(3)}</span>
      </div>
    `;
    grid.appendChild(card);
  });
}

function initObservablesList() {
  const list = document.getElementById('observables-list');
  if (!list) return;
  TARGETS.forEach(t => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${t.name}</strong> ${t.unit ? '(' + t.unit + ')' : ''} — ${t.description}`;
    list.appendChild(li);
  });
}

// ================================================================
// SECTION 2: PREDICTION TOOL
// ================================================================

function initPredictTool() {
  const btn = document.getElementById('predict-btn');
  const zInput = document.getElementById('z-input');
  const nInput = document.getElementById('n-input');
  const results = document.getElementById('predict-results');

  function predict() {
    const Z = parseInt(zInput.value);
    const N = parseInt(nInput.value);

    if (Z < 40 || Z > 60 || N < 50 || N > 90) {
      results.innerHTML = `<div class="alert">Z must be 40–60 and N must be 50–90.</div>`;
      return;
    }

    const nucleus = findNucleus(Z, N);
    if (!nucleus) {
      results.innerHTML = `<div class="alert">No prediction available for Z=${Z}, N=${N} (outside training region).</div>`;
      return;
    }

    const A = Z + N;
    const EL = ELEMENTS[Z] || '?';
    const isEvenEven = (Z % 2 === 0) && (N % 2 === 0);

    let html = `
      <div class="prediction-card">
        <div class="prediction-header">
          <div class="prediction-isotope">
            <sup>${A}</sup>${EL}<sub style="font-size:0.6em;color:var(--ink-muted);">Z=${Z}, N=${N}</sub>
          </div>
          <div class="prediction-badges">
            ${isEvenEven ? '<span class="badge badge-emerald">even-even</span>' : '<span class="badge badge-gold">odd</span>'}
            ${Z === 50 ? '<span class="badge badge-accent">Z = 50 magic</span>' : ''}
            ${N === 50 || N === 82 ? '<span class="badge badge-accent">N = ' + N + ' magic</span>' : ''}
          </div>
        </div>

        <table class="prediction-table">
          <thead>
            <tr>
              <th>Observable</th>
              <th>Experimental</th>
              <th>BNN Prediction</th>
              <th>Deviation (σ)</th>
            </tr>
          </thead>
          <tbody>
    `;

    // === Cross-task consistency helper: ratio with error propagation ===
    // R = a/b  =>  σ_R = |R| · sqrt((σ_a/a)² + (σ_b/b)²)
    const ratioWithUnc = (a, sa, b, sb) => {
      if (a == null || b == null || b === 0) return [null, null];
      const r = a / b;
      const rel_a = (sa != null && a !== 0) ? (sa / a) : 0;
      const rel_b = (sb != null && b !== 0) ? (sb / b) : 0;
      return [r, Math.abs(r) * Math.sqrt(rel_a * rel_a + rel_b * rel_b)];
    };

    TARGETS.forEach(t => {
      const exp = nucleus[t.E];
      let pred = nucleus[t.P];
      let unc  = nucleus[t.U];

      // FIX for R(4/2): the BNN predicts E(2+), E(4+), and R(4/2) as
      // three independent tasks, which can disagree (validation Test 5
      // showed mean |R_explicit − R_implicit| = 0.31).
      // We recompute R(4/2) from the SAME-model E(4+)/E(2+) so what the
      // user sees is internally consistent. We flag the cases where the
      // explicit BNN R(4/2) disagrees with the ratio of its own E4/E2.
      let consistencyNote = '';
      if (t.key === 'r42') {
        const e2_pred = nucleus.e2P;
        const e2_unc  = nucleus.e2U;
        const e4_pred = nucleus.e4P;
        const e4_unc  = nucleus.e4U;
        if (e2_pred != null && e4_pred != null && e2_pred > 50) {
          const explicit = pred;
          const [r_imp, sigma_r] = ratioWithUnc(e4_pred, e4_unc, e2_pred, e2_unc);
          pred = r_imp;
          unc  = sigma_r;
          if (explicit != null && Math.abs(explicit - r_imp) > 0.5) {
            consistencyNote =
              ' <span class="badge badge-gold" style="font-size:0.7em;" ' +
              'title="Cross-task inconsistency: explicit BNN R(4/2)=' +
              explicit.toFixed(2) + ' vs E(4+)/E(2+)=' + r_imp.toFixed(2) +
              '. Showing the physically consistent ratio.">⚠ low-confidence</span>';
          }
        }
      }

      const dec = (t.key === 'r42' || t.key === 'b2' ? 3 : (t.key === 'be2' ? 4 : (t.key === 'ba' ? 2 : 0)));
      const dev = computeDeviation(exp, pred, unc);

      let devClass = '';
      let devText = '—';
      if (dev !== null) {
        if (dev < 1) devClass = 'good';
        else if (dev < 2) devClass = 'ok';
        else devClass = 'fair';
        devText = dev.toFixed(2) + 'σ';
      }

      html += `
        <tr>
          <td><strong>${t.name}</strong> ${t.unit ? `<small>(${t.unit})</small>` : ''}${consistencyNote}</td>
          <td>${fmtExp(exp, dec)}</td>
          <td><span class="pred-value">${fmtPred(pred, unc, dec)}</span></td>
          <td><span class="dev ${devClass}">${devText}</span></td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>

        <div class="prediction-footer">
          <small>
            Predictions from ensemble of 5 BNNs × 100 posterior samples each.
            Deviation σ = |exp − pred| / σ_BNN.
            Green: <1σ · Gold: 1–2σ · Red: >2σ.
          </small>
        </div>
      </div>
    `;

    results.innerHTML = html;
  }

  btn.addEventListener('click', predict);
  zInput.addEventListener('keydown', e => { if (e.key === 'Enter') predict(); });
  nInput.addEventListener('keydown', e => { if (e.key === 'Enter') predict(); });

  // Default: 116Sn
  predict();
}

// ================================================================
// SECTION 3: NUCLEAR CHART
// ================================================================

function initNuclearChart() {
  const targetSel = document.getElementById('chart-target');
  const modeSel = document.getElementById('chart-mode');
  if (!targetSel || !modeSel) return;

  function render() {
    const tKey = targetSel.value;
    const mode = modeSel.value;
    const T = TARGETS.find(t => t.key === tKey);
    if (!T) return;

    const col = mode === 'pred' ? T.P : (mode === 'unc' ? T.U : T.E);

    // Build (N, Z, value) arrays
    const ns = [], zs = [], vs = [], texts = [];
    NUCLEI_DATA.forEach(n => {
      const v = n[col];
      if (v === null || v === undefined) return;
      ns.push(n.N);
      zs.push(n.Z);
      vs.push(v);
      const dec = (T.key === 'r42' || T.key === 'b2' ? 3 : (T.key === 'be2' ? 4 : (T.key === 'ba' ? 2 : 0)));
      const isPred = mode === 'pred';
      const valStr = dec === 0 ? Math.round(v) : v.toFixed(dec);
      texts.push(
        `<sup>${n.A}</sup>${n.EL} (Z=${n.Z}, N=${n.N})<br>` +
        `${T.name}: ${valStr}${T.unit ? ' ' + T.unit : ''}`
      );
    });

    const colorscale = mode === 'unc' ?
      [[0, '#3a7a5e'], [0.5, '#b8923a'], [1, '#b13a2a']] :
      [[0, '#0a1628'], [0.3, '#2d6e7e'], [0.6, '#b8923a'], [1, '#b13a2a']];

    const data = [{
      type: 'scatter',
      mode: 'markers',
      x: ns, y: zs,
      text: texts,
      hoverinfo: 'text',
      marker: {
        size: 12,
        color: vs,
        colorscale: colorscale,
        showscale: true,
        colorbar: {
          title: { text: T.name + (T.unit ? ' (' + T.unit + ')' : ''), side: 'right' },
          thickness: 14,
          len: 0.7,
        },
        line: { width: 0.5, color: '#0a1628' },
        symbol: 'square',
      },
    }];

    // Magic number lines
    const shapes = [
      // Z = 50
      { type: 'line', x0: 49, x1: 91, y0: 50, y1: 50, line: { color: '#b13a2a', width: 1, dash: 'dot' } },
      // N = 50
      { type: 'line', x0: 50, x1: 50, y0: 39, y1: 61, line: { color: '#b13a2a', width: 1, dash: 'dot' } },
      // N = 82
      { type: 'line', x0: 82, x1: 82, y0: 39, y1: 61, line: { color: '#b13a2a', width: 1, dash: 'dot' } },
    ];

    const layout = {
      xaxis: { title: 'Neutron number N', gridcolor: '#d4cfc1', zeroline: false, range: [49, 91] },
      yaxis: { title: 'Proton number Z', gridcolor: '#d4cfc1', zeroline: false, range: [39, 61] },
      paper_bgcolor: 'transparent',
      plot_bgcolor: '#fffdf6',
      font: { family: 'Source Sans 3, sans-serif', color: '#0a1628', size: 13 },
      shapes: shapes,
      margin: { t: 30, b: 60, l: 60, r: 30 },
      height: 500,
    };

    Plotly.newPlot('nuclear-chart', data, layout, { displaylogo: false, responsive: true });
  }

  targetSel.addEventListener('change', render);
  modeSel.addEventListener('change', render);
  render();
}

// ================================================================
// SECTION 4: TIN CHAIN
// ================================================================

function initSnChain() {
  const targetSel = document.getElementById('sn-target');
  if (!targetSel) return;

  function render() {
    const tKey = targetSel.value;
    const T = TARGETS.find(t => t.key === tKey);
    const sn = NUCLEI_DATA
      .filter(n => n.Z === 50 && (n.N % 2 === 0))
      .sort((a, b) => a.A - b.A);

    const As = sn.map(n => n.A);
    const preds = sn.map(n => n[T.P]);
    const uncs = sn.map(n => n[T.U]);
    const exps = sn.map(n => n[T.E]);

    const traces = [];

    // Two-sigma envelope
    traces.push({
      x: [...As, ...As.slice().reverse()],
      y: [...preds.map((p, i) => p + 2 * uncs[i]),
          ...preds.map((p, i) => p - 2 * uncs[i]).reverse()],
      fill: 'toself',
      fillcolor: 'rgba(177, 58, 42, 0.10)',
      line: { color: 'rgba(0,0,0,0)' },
      hoverinfo: 'skip',
      showlegend: true, name: '±2σ envelope',
    });

    // One-sigma envelope
    traces.push({
      x: [...As, ...As.slice().reverse()],
      y: [...preds.map((p, i) => p + uncs[i]),
          ...preds.map((p, i) => p - uncs[i]).reverse()],
      fill: 'toself',
      fillcolor: 'rgba(177, 58, 42, 0.25)',
      line: { color: 'rgba(0,0,0,0)' },
      hoverinfo: 'skip',
      showlegend: true, name: '±1σ envelope',
    });

    // Mean prediction
    traces.push({
      x: As, y: preds,
      mode: 'lines+markers',
      type: 'scatter',
      line: { color: COLORS.accent, width: 2.5 },
      marker: { size: 7, color: COLORS.accent },
      name: 'BNN prediction',
    });

    // Experimental data (where available)
    const expAs = [], expVs = [];
    sn.forEach((n, i) => {
      if (n[T.E] !== null && n[T.E] !== undefined) {
        expAs.push(n.A);
        expVs.push(n[T.E]);
      }
    });
    traces.push({
      x: expAs, y: expVs,
      mode: 'markers', type: 'scatter',
      marker: { size: 11, color: COLORS.ink, symbol: 'diamond', line: { width: 1, color: 'white' } },
      name: 'Experimental',
    });

    const layout = {
      xaxis: { title: 'Mass number A', gridcolor: '#d4cfc1', zeroline: false },
      yaxis: { title: T.name + (T.unit ? ' (' + T.unit + ')' : ''), gridcolor: '#d4cfc1', zeroline: false },
      paper_bgcolor: 'transparent',
      plot_bgcolor: '#fffdf6',
      font: { family: 'Source Sans 3, sans-serif', color: '#0a1628', size: 13 },
      shapes: [
        { type: 'line', x0: 132, x1: 132, y0: -1e6, y1: 1e6,
          line: { color: COLORS.gold, width: 1.5, dash: 'dash' } },
      ],
      annotations: [
        { x: 132, y: 1.02, xref: 'x', yref: 'paper', text: '<sup>132</sup>Sn (doubly magic)',
          showarrow: false, font: { color: COLORS.gold, size: 11 } }
      ],
      legend: { orientation: 'h', y: -0.18 },
      margin: { t: 30, b: 90, l: 70, r: 30 },
      height: 500,
    };

    Plotly.newPlot('sn-chart', traces, layout, { displaylogo: false, responsive: true });
  }

  targetSel.addEventListener('change', render);
  render();
}

// ================================================================
// SECTION 5: VALIDATION TABLE
// ================================================================

function initValidationTable() {
  const wrap = document.getElementById('validation-table');
  if (!wrap) return;

  // Build header dynamically from TARGETS
  let headerCols = '';
  TARGETS.forEach(t => {
    headerCols += `<th>${t.shortName} dev (σ)</th>`;
  });

  let html = `
    <table class="data-table validation-table">
      <thead>
        <tr>
          <th>Nucleus</th>
          <th>Z, N</th>
          ${headerCols}
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
  `;

  // Track per-target counters
  const counters = {};
  TARGETS.forEach(t => counters[t.key] = { match2s: 0, total: 0 });

  VALIDATION_NUCLEI.forEach(v => {
    const n = findNucleus(v.Z, v.N);
    if (!n) return;
    let rowClass = '';
    if (v.note === 'Doubly magic') rowClass = 'highlight-warning';
    else if (v.note === 'Sn anomaly') rowClass = 'highlight-success';

    let row = `<tr class="${rowClass}"><td><strong><sup>${v.A}</sup>${v.EL}</strong></td><td>${v.Z}, ${v.N}</td>`;
    
    TARGETS.forEach(t => {
      const exp = n[t.E];
      const pred = n[t.P];
      const unc = n[t.U];
      const dev = computeDeviation(exp, pred, unc);
      if (dev === null) {
        row += `<td>—</td>`;
      } else {
        counters[t.key].total++;
        if (dev <= 2) counters[t.key].match2s++;
        const cl = dev < 1 ? 'good' : (dev < 2 ? 'ok' : 'fair');
        row += `<td><span class="dev ${cl}">${dev.toFixed(2)}</span></td>`;
      }
    });
    row += `<td><em>${v.note || 'OK'}</em></td></tr>`;
    html += row;
  });

  // Summary row
  html += `<tr class="summary-row"><td><strong>Coverage at 2σ</strong></td><td><em>(${VALIDATION_NUCLEI.length} nuclei)</em></td>`;
  TARGETS.forEach(t => {
    const c = counters[t.key];
    const pct = c.total > 0 ? `${Math.round(100*c.match2s/c.total)}%` : '—';
    html += `<td><strong>${pct}</strong></td>`;
  });
  html += `<td></td></tr></tbody></table>`;
  
  wrap.innerHTML = html;
}

// ================================================================
// SECTION 6: ABLATION & BASELINE TABLES
// ================================================================

function initAblationTable() {
  const wrap = document.getElementById('ablation-table');
  if (!wrap) return;

  let html = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Task</th>
          <th>Single-task BNN</th>
          <th>Multi-task BNN (1 seed)</th>
          <th>Multi-task + Ensemble (5 seeds)</th>
        </tr>
      </thead>
      <tbody>
  `;

  ABLATION.forEach(a => {
    const cl = a.highlight ? 'highlight-success' : '';
    html += `
      <tr class="${cl}">
        <td><strong>${a.task}</strong></td>
        <td>${a.single}</td>
        <td>${a.multi1}</td>
        <td><strong>${a.multiE}</strong></td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  wrap.innerHTML = html;
}

function initBaselineTable() {
  const wrap = document.getElementById('baseline-table');
  if (!wrap) return;

  let html = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Task</th>
          <th>Random Forest</th>
          <th>XGBoost</th>
          <th>Deterministic NN</th>
          <th>Multi-task BNN (ours)</th>
        </tr>
      </thead>
      <tbody>
  `;

  BASELINES.forEach(b => {
    html += `
      <tr>
        <td><strong>${b.task}</strong></td>
        <td>${b.rf}</td>
        <td>${b.xgb}</td>
        <td>${b.dnn}</td>
        <td><strong>${b.bnn}</strong></td>
      </tr>
    `;
  });

  html += `
        <tr class="summary-row">
          <td><em>Calibrated uncertainty?</em></td>
          <td>No</td>
          <td>No</td>
          <td>No</td>
          <td><strong>Yes</strong></td>
        </tr>
      </tbody>
    </table>
  `;
  wrap.innerHTML = html;
}

// ================================================================
// SECTION 7: DATA TABLE WITH FILTER
// ================================================================

function initDataTable() {
  const wrap = document.getElementById('data-table');
  const filter = document.getElementById('filter-input');
  const counter = document.getElementById('result-count');
  if (!wrap || !filter) return;

  function render(data) {
    let html = `
      <table class="data-table data-table-compact">
        <thead>
          <tr>
            <th>Z</th><th>N</th><th>A</th><th>El.</th>
            <th>Mass pred (keV)</th>
            <th>S(2n) pred (keV)</th>
            <th>E(2⁺) pred (keV)</th>
            <th>E(4⁺) pred (keV)</th>
            <th>R(4/2) pred</th>
            <th>B(E2) pred (e²b²)</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.forEach(n => {
      html += `
        <tr>
          <td>${n.Z}</td><td>${n.N}</td><td>${n.A}</td><td><strong>${n.EL}</strong></td>
          <td>${fmtPred(n.mP, n.mU, 0)}</td>
          <td>${fmtPred(n.s2nP, n.s2nU, 0)}</td>
          <td>${fmtPred(n.e2P, n.e2U, 0)}</td>
          <td>${fmtPred(n.e4P, n.e4U, 0)}</td>
          <td>${fmtPred(n.r42P, n.r42U, 2)}</td>
          <td>${fmtPred(n.be2P, n.be2U, 3)}</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    wrap.innerHTML = html;
    counter.textContent = `${data.length} of ${NUCLEI_DATA.length} nuclei`;
  }

  function applyFilter() {
    const q = filter.value.trim().toLowerCase();
    if (!q) {
      render(NUCLEI_DATA);
      return;
    }
    const filtered = NUCLEI_DATA.filter(n => {
      const isoStr = `${n.A}${n.EL}`.toLowerCase();
      return n.Z.toString().includes(q) ||
             n.N.toString().includes(q) ||
             n.A.toString().includes(q) ||
             n.EL.toLowerCase().includes(q) ||
             isoStr.includes(q);
    });
    render(filtered);
  }

  filter.addEventListener('input', applyFilter);
  render(NUCLEI_DATA);
}
