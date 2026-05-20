# Changelog

## [v3.0] — 2026-05-11

### CRITICAL FIX: NUDAT3 Parser
Independent audit by research team revealed that the v2 parser systematically captured the **wrong 4⁺ excited state** for many nuclei (often the 2nd or 3rd 4⁺ instead of the first 4⁺). This caused E(4⁺) and R(4/2) predictions to be unreliable.

**Parser v4 fixes**:
- Handles merged-cell structure in NUDAT3 HTML (some cells contain thousands of characters with multiple levels)
- Correctly handles uncertainty digit notation (e.g., "539.510320" = 539.510 keV with unc 320)
- Sorts levels by energy and selects FIRST 2⁺ and FIRST 4⁺
- Computes R(4/2) = E(4⁺)/E(2⁺) in the correct order
- **Validation: 10/10 reference nuclei now match** (was 1/10 with v2 parser)

### Expanded from 6 to 14 outputs

**8 new AME2020 observables**:
1. BE/A (binding energy per nucleon)
2. S(2p), S(n), S(p) (separation energies)
3. Q(α), Q(β−) (decay Q-values)

**2 new Pritychenko 2016 observables**:
1. β₂ (quadrupole deformation parameter)
2. τ (half-life of 2⁺ state)

**Existing observables preserved**:
- Mass excess, S(2n), E(2⁺), B(E2), E(4⁺), R(4/2)

### Performance highlights
- 8 AME2020 observables: R² between 0.980 and 0.995
- 10/10 reference nuclei: 100% coverage at 2σ for 12 of 14 observables
- 132Sn doubly-magic: recovered within 1.04σ for E(2⁺) (was 34σ in v1!)
- Calibration: ECE between 0.037 and 0.245 across all 14 tasks

### Files added
- `data/master_v3_14targets.csv` — 14-target training set
- `results/all_predictions_v3_14tasks.csv` — All 651 × 14 predictions
- `paper/Multi-Task-BNN-Nuclear-A100-150-v5.docx` — Final manuscript (14 outputs)
- `webapp/` — Completely rebuilt 14-output app
- `scripts/01_parse_nudat.py` — Fixed NUDAT3 parser

---

## [v2.0] — 2026-05-10
6-output framework (later found to have parser bug; superseded by v3.0)

## [v1.0] — 2026-05-09
Initial 3-output release
