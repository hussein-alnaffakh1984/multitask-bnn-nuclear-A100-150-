// ================================================================
// Multi-Task BNN Webapp — Data (v3: 14 outputs)
// ================================================================

const TARGETS = [
  { key:'m',   E:'mE',  P:'mP',  U:'mU',
    name:'Mass excess', unit:'keV', shortName:'Mass',
    rmse:1612, r2:0.989, ece:0.189, cov95:1.00,
    description:'Atomic mass excess from AME2020 [1]' },
  { key:'ba',  E:'baE', P:'baP', U:'baU',
    name:'BE/A', unit:'keV', shortName:'BE/A',
    rmse:18, r2:0.984, ece:0.175, cov95:1.00,
    description:'Binding energy per nucleon from AME2020' },
  { key:'s2n', E:'s2nE',P:'s2nP',U:'s2nU',
    name:'S(2n)', unit:'keV', shortName:'S(2n)',
    rmse:628, r2:0.985, ece:0.159, cov95:0.989,
    description:'Two-neutron separation energy' },
  { key:'s2p', E:'s2pE',P:'s2pP',U:'s2pU',
    name:'S(2p)', unit:'keV', shortName:'S(2p)',
    rmse:596, r2:0.995, ece:0.202, cov95:1.00,
    description:'Two-proton separation energy' },
  { key:'sn',  E:'snE', P:'snP', U:'snU',
    name:'S(n)', unit:'keV', shortName:'S(n)',
    rmse:316, r2:0.986, ece:0.169, cov95:1.00,
    description:'Single-neutron separation energy' },
  { key:'sp',  E:'spE', P:'spP', U:'spU',
    name:'S(p)', unit:'keV', shortName:'S(p)',
    rmse:317, r2:0.995, ece:0.245, cov95:1.00,
    description:'Single-proton separation energy' },
  { key:'qa',  E:'qaE', P:'qaP', U:'qaU',
    name:'Q(α)', unit:'keV', shortName:'Q(α)',
    rmse:618, r2:0.980, ece:0.102, cov95:0.958,
    description:'Alpha-decay Q-value' },
  { key:'qb',  E:'qbE', P:'qbP', U:'qbU',
    name:'Q(β−)', unit:'keV', shortName:'Q(β−)',
    rmse:585, r2:0.993, ece:0.206, cov95:1.00,
    description:'Beta-minus decay Q-value' },
  { key:'e2',  E:'e2E', P:'e2P', U:'e2U',
    name:'E(2⁺)', unit:'keV', shortName:'E(2+)',
    rmse:289, r2:0.244, ece:0.050, cov95:0.952,
    description:'First 2⁺ excitation energy [Pritychenko 2016]' },
  { key:'be2', E:'be2E',P:'be2P',U:'be2U',
    name:'B(E2)↑', unit:'e²b²', shortName:'B(E2)',
    rmse:0.307, r2:0.896, ece:0.161, cov95:1.00,
    description:'Reduced E2 transition 0⁺→2⁺ [Pritychenko 2016]' },
  { key:'b2',  E:'b2E', P:'b2P', U:'b2U',
    name:'β₂', unit:'', shortName:'β2',
    rmse:0.030, r2:0.849, ece:0.092, cov95:1.00,
    description:'Quadrupole deformation parameter' },
  { key:'tau', E:'tauE',P:'tauP',U:'tauU',
    name:'τ', unit:'ps', shortName:'τ',
    rmse:404, r2:0.824, ece:0.169, cov95:1.00,
    description:'Half-life of first 2⁺ state' },
  { key:'e4',  E:'e4E', P:'e4P', U:'e4U',
    name:'E(4⁺)', unit:'keV', shortName:'E(4+)',
    rmse:257, r2:0.679, ece:0.037, cov95:0.957,
    description:'First 4⁺ excitation energy [NUDAT3]' },
  { key:'r42', E:'r42E',P:'r42P',U:'r42U',
    name:'R(4/2)', unit:'', shortName:'R(4/2)',
    rmse:0.234, r2:0.691, ece:0.073, cov95:0.957,
    description:'E(4⁺)/E(2⁺) — shape indicator' },
];

const ELEMENTS = {
  40:'Zr',41:'Nb',42:'Mo',43:'Tc',44:'Ru',45:'Rh',46:'Pd',47:'Ag',48:'Cd',49:'In',
  50:'Sn',51:'Sb',52:'Te',53:'I', 54:'Xe',55:'Cs',56:'Ba',57:'La',58:'Ce',59:'Pr',60:'Nd'
};

const VALIDATION_NUCLEI = [
  { Z:42, N:58, A:100, EL:'Mo', note:'' },
  { Z:46, N:62, A:108, EL:'Pd', note:'' },
  { Z:48, N:68, A:116, EL:'Cd', note:'' },
  { Z:50, N:66, A:116, EL:'Sn', note:'Sn anomaly' },
  { Z:50, N:70, A:120, EL:'Sn', note:'' },
  { Z:50, N:82, A:132, EL:'Sn', note:'Doubly magic' },
  { Z:52, N:78, A:130, EL:'Te', note:'' },
  { Z:54, N:82, A:136, EL:'Xe', note:'' },
  { Z:58, N:82, A:140, EL:'Ce', note:'' },
  { Z:60, N:80, A:140, EL:'Nd', note:'' },
];

let NUCLEI_DATA = [];

async function loadNucleiData() {
  if (NUCLEI_DATA.length > 0) return NUCLEI_DATA;
  try {
    const response = await fetch('nuclei_data.json');
    NUCLEI_DATA = await response.json();
    return NUCLEI_DATA;
  } catch (e) {
    console.error('Failed to load nuclei_data.json:', e);
    return [];
  }
}

function findNucleus(Z, N) {
  return NUCLEI_DATA.find(n => n.Z === parseInt(Z) && n.N === parseInt(N));
}

function fmtPred(value, uncertainty, decimals = 0) {
  if (value === null || value === undefined) return '—';
  const v = decimals === 0 ? Math.round(value) : value.toFixed(decimals);
  const u = decimals === 0 ? Math.round(uncertainty) : uncertainty.toFixed(decimals);
  return `${v} ± ${u}`;
}

function fmtExp(value, decimals = 0) {
  if (value === null || value === undefined) return 'not measured';
  return decimals === 0 ? Math.round(value).toString() : value.toFixed(decimals);
}

function computeDeviation(exp, pred, unc) {
  if (exp === null || exp === undefined || unc === 0) return null;
  return Math.abs(exp - pred) / unc;
}
