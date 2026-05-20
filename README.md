# Multi-Task Bayesian Neural Network for Nuclear Structure — 14 Outputs

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.10-orange.svg)](https://pytorch.org/)
[![Pyro](https://img.shields.io/badge/Pyro-1.9-blueviolet.svg)](https://pyro.ai/)

A multi-task Bayesian neural network ensemble that jointly predicts **fourteen nuclear observables** with calibrated uncertainty estimates for 651 nuclei in the medium-mass region (40 ≤ Z ≤ 60, 50 ≤ N ≤ 90).

**Live web app**: https://clinquant-gumption-57dc5a.netlify.app/

---

## 🎯 What's new in v3.0

Major rebuild with:

- **14 outputs** (previously 6): added BE/A, S(2p), S(n), S(p), Q(α), Q(β−), β₂, τ
- **Rewritten NUDAT3 parser**: fixes parser bug discovered in independent audit  
  - Old parser: 1/10 reference nuclei matched
  - New parser: **10/10 reference nuclei matched**
- **132Sn doubly-magic nucleus**: now within 1.04σ (was 34σ in v1!)
- **Validation**: 100% coverage at 2σ for 12 of 14 observables on 10 reference nuclei

---

## 📊 Test-Set Performance

| # | Observable | Unit | N | RMSE | R² | Cov95 |
|:---:|:---|:---:|:---:|:---:|:---:|:---:|
| 1 | Mass excess | keV | 99 | 1612 | **0.989** | 100% |
| 2 | BE/A | keV | 99 | 18 | **0.984** | 100% |
| 3 | S(2n) | keV | 94 | 628 | **0.985** | 99% |
| 4 | S(2p) | keV | 92 | 596 | **0.995** | 100% |
| 5 | S(n) | keV | 97 | 316 | **0.986** | 100% |
| 6 | S(p) | keV | 96 | 317 | **0.995** | 100% |
| 7 | Q(α) | keV | 96 | 618 | **0.980** | 96% |
| 8 | Q(β−) | keV | 93 | 585 | **0.993** | 100% |
| 9 | E(2⁺) | keV | 21 | 289 | 0.244 | 95% |
| 10 | B(E2)↑ | e²b² | 21 | 0.307 | **0.896** | 100% |
| 11 | β₂ | — | 21 | 0.030 | **0.849** | 100% |
| 12 | τ | ps | 21 | 404 | **0.824** | 100% |
| 13 | E(4⁺) | keV | 23 | 257 | 0.679 | 96% |
| 14 | R(4/2) | — | 23 | 0.234 | 0.691 | 96% |

---

## 🚀 Quick start

### Use the live web app
**https://clinquant-gumption-57dc5a.netlify.app/** — Query any nucleus interactively.

### Use pre-computed predictions
Open `results/all_predictions_v3_14tasks.csv` for predictions of all 651 nuclei.

### Reproduce training
```bash
git clone https://github.com/hussein-alnaffakh1984/multitask-bnn-nuclear-A100-150-
cd multitask-bnn-nuclear-A100-150-
pip install -r requirements.txt
python scripts/01_parse_nudat.py    # Re-parse NUDAT3 (requires HTML cache)
# Then train 14-head BNN ensemble (~1 hour on T4 GPU)
```

---

## 📁 Repository structure

```
multitask-bnn-nuclear-A100-150-/
├── data/                                # Raw + processed datasets
│   ├── ame2020_master_A100to150.csv    # AME2020 (8 observables)
│   ├── pritychenko_2016_A100to150_FIXED.csv  # Pritychenko (4 observables)
│   └── master_v3_14targets.csv          # 14-target training set
│
├── results/                             # Trained model predictions
│   ├── all_predictions_v3_14tasks.csv   # All 651 nuclei × 14 observables
│   ├── test_results_v3_14tasks.csv      # Held-out test set
│   └── metrics_v3.csv                   # Performance summary
│
├── figures/                             # Publication-quality figures
│   └── fig01-06.png
│
├── paper/
│   └── Multi-Task-BNN-Nuclear-A100-150-v5.docx  # Manuscript
│
├── scripts/
│   └── 01_parse_nudat.py                # Rewritten NUDAT3 parser
│
├── webapp/                              # Netlify-ready web app (14 outputs)
│   ├── index.html, css/, js/, nuclei_data.json
│
├── README.md, LICENSE, CHANGELOG.md, requirements.txt
```

---

## 🔬 Methodology

### Architecture
- **Shared trunk**: 11 features → 64 → 32 (ReLU, dropout 0.1, deterministic)
- **14 Bayesian heads**: 32 → 16 → 1 (mean-field variational, Pyro 1.9)
- **Ensemble**: 5 BNNs × 100 posterior samples = **500 samples per nucleus**

### Training
- 70/15/15 train/val/test split, fixed seed 42
- Adam optimizer, lr = 0.01, 2000 epochs
- Cross-task masking handles different sample sizes per observable
- **~56 minutes on a single Tesla T4 GPU**

---

## 📚 Data sources

1. **AME2020** — M. Wang et al., Chinese Phys. C **45**, 030003 (2021)
2. **Pritychenko 2016** — B. Pritychenko et al., At. Data Nucl. Data Tables **107**, 1 (2016)
3. **NUDAT3** — National Nuclear Data Center, https://www.nndc.bnl.gov/nudat3/

---

## 📑 Citation

```bibtex
@article{Alnaffakh2026MTBNN14,
  title   = {Multi-Task Bayesian Neural Network Ensemble for Joint Prediction
             of Fourteen Nuclear Observables in Medium-Mass Nuclei},
  author  = {M. M. Hussein Ali Hussein Al-Naffakh},
  journal = {[Manuscript in preparation]},
  year    = {2026}
}
```

---

## 👤 Author

**M. M. Hussein Ali Hussein Al-Naffakh**
Department of Physics, Faculty of Science
Al-Kafeel University, Najaf 54001, Iraq

GitHub: [@hussein-alnaffakh1984](https://github.com/hussein-alnaffakh1984)

---

## 📜 License

MIT — see `LICENSE`.

---

## 🙏 Acknowledgments

- **Research team** for independent validation against NUDAT3 reference values which led to identification and correction of a critical parser bug. This audit is the reason v3 exists with 10/10 reference matches.
- **Kaggle** for Tesla T4 GPU access
- **PyTorch + Pyro** developers
- **NNDC at Brookhaven** for open nuclear data
