# CLV Prediction 2025 — Customer Lifetime Value Pipeline

Predikce Customer Lifetime Value (CLV) pro B2C firmu. Pipeline zpracovává historická data
z let 2022–2024 a predikuje revenue zákazníka v roce 2025. Výstupem je segmentace zákazníků
do tierů High / Medium / Low a predikce rizika churnu.

---

## Výsledky modelů

### Regrese — predikce výše CLV 2025

| Model | MAE | RMSE | R² | MAE (aktivní) | R² (aktivní) |
|---|---|---|---|---|---|
| Lineární regrese (baseline) | 9 708 | 17 101 | 0.418 | 15 185 | 0.274 |
| Random Forest (tuned) | 8 406 | 16 212 | 0.477 | 14 153 | 0.328 |
| **XGBoost (tuned) ✅** | **8 172** | **15 512** | **0.521** | **13 888** | **0.383** |

### Klasifikace — nakoupí zákazník v 2025?

| Model | Accuracy | Precision | Recall | F1 | ROC-AUC |
|---|---|---|---|---|---|
| Logistická regrese | 81.3 % | 80.2 % | 79.5 % | 79.8 % | **0.910** |

### Churn Prediction — odejde zákazník?

| Model | ROC-AUC | F1 | Accuracy | Precision | Recall |
|---|---|---|---|---|---|
| Logistická regrese (baseline) | 0.853 | 0.725 | 77.4 % | 76.0 % | 69.4 % |
| **XGBoost (tuned) ✅** | **0.883** | **0.746** | **79.8 %** | **80.7 %** | **69.4 %** |

### Segmentace zákazníků (XGBoost predikce, n=1 200)

| Segment | Počet | Podíl | Prům. predikovaný CLV | Prům. recency |
|---|---|---|---|---|
| **High** (≥ 25 000) | 139 | 11.6 % | 53 536 | 116 dní |
| **Medium** (5 000–25 000) | 315 | 26.3 % | 12 818 | 187 dní |
| **Low** (< 5 000) | 746 | 62.2 % | 660 | 405 dní |

---

## Struktura projektu

```
clv_project/
│
├── notebooks/                        # Jupyter notebooky — každý krok samostatně
│   ├── krok_01_EDA.ipynb             # Exploratorní analýza dat
│   ├── krok_02_feature_engineering.ipynb   # Příprava feature tabulky
│   ├── krok_03_linearni_regrese.ipynb      # Baseline regresní model
│   ├── krok_04_logisticka_regrese.ipynb    # Binární klasifikace (koupí/nekoupí)
│   ├── krok_05_random_forest.ipynb         # Random Forest Regressor
│   ├── krok_06_xgboost.ipynb              # XGBoost + SHAP interpretace
│   ├── krok_07_segmentace.ipynb           # Finální segmentace + srovnání modelů
│   └── krok_08_churn.ipynb               # Churn prediction
│
├── outputs/                          # CSV výstupy notebooků
│   ├── step_02_features.csv          # Finální feature tabulka (1 200 × 29 features)
│   ├── step_03_metrics.csv           # Metriky lineární regrese
│   ├── step_04_metrics.csv           # Metriky logistické regrese
│   ├── step_05_metrics.csv           # Metriky Random Forest
│   ├── step_06_metrics.csv           # Metriky XGBoost
│   ├── step_06_shap_importance.csv   # SHAP feature importance (XGBoost)
│   ├── step_07_clv_segments.csv      # Zákazníci s CLV predikcí a segmentem
│   ├── step_07_model_comparison.csv  # Srovnání všech regresních modelů
│   ├── step_08_churn_output.csv      # Zákazníci s churn rizikem + prioritou
│   └── step_08_metrics.csv           # Metriky churn modelu
│
├── docs/
│   ├── model_card_clv_regrese.md     # Dokumentace CLV regresních modelů
│   ├── model_card_klasifikace.md     # Dokumentace klasifikačního modelu
│   ├── model_card_churn.md           # Dokumentace churn modelu
│   └── feature_dictionary.md        # Slovník všech features
│
├── README.md                         # Tento soubor
├── requirements.txt                  # Python závislosti
└── .gitignore                        # Ignorované soubory
```

---

## Tok dat mezi notebooky

```
dataset.xlsx
    │
    └─► Krok 1 (EDA)
              └─► step_01_*.csv  ──────────────────────────┐
                                                            │
              └─► Krok 2 (Feature Engineering)  ◄──────────┘
                        └─► step_02_features.csv ──────────┐
                                                            │
              ┌─────────────────────────────────────────────┤
              │                                             │
              ▼                                             │
    Krok 3 (Lineární regrese)  ──► step_03_metrics.csv     │
    Krok 4 (Logistická regrese) ─► step_04_metrics.csv     │
    Krok 5 (Random Forest)  ────► step_05_metrics.csv      │
    Krok 6 (XGBoost + SHAP) ────► step_06_metrics.csv      │
                                  step_06_predictions_all   │
              │                                             │
              └─► Krok 7 (Segmentace)                       │
                        └─► step_07_clv_segments.csv ───────┤
                                                            │
              └─► Krok 8 (Churn) ◄──────────────────────────┘
                        └─► step_08_churn_output.csv
```

---

## Rychlý start

```bash
# 1. Klonování repozitáře
git clone https://github.com/<tvůj-username>/clv_project.git
cd clv_project

# 2. Instalace závislostí
pip install -r requirements.txt

# 3. Umístění datasetu
# Nakopíruj dataset.xlsx do kořene projektu

# 4. Spuštění notebooků v pořadí
jupyter notebook notebooks/krok_01_EDA.ipynb
# ... pokračuj v pořadí krok_02 → krok_08
```

> **Důležité:** Každý notebook ukládá své výstupy do složky `outputs/`.
> Notebook `krok_N` načítá výstupy `krok_(N-1)`. Spouštěj je v pořadí.

---


| Sheet | Popis | Řádků |
|---|---|---|
| `Account` | Zákazníci — věk, region, loyalty tier, kanál | 1 200 |
| `Order__c` | Objednávky — hodnota, produkt, kanál, status | ~9 500 |
| `Activity__c` | Engagement — loginy, email, app score | 1 200 |
| `Product2` | Produkty — kategorie, cena, náklady | 72 |

---

## Technické prostředí

- Python 3.11+
- Jupyter Notebook
- Vizualizace výhradně pomocí **seaborn** (matplotlib jako backend)
- Seed: `RANDOM_STATE = 42` ve všech noteboocích

Úplný seznam závislostí viz `requirements.txt`.

---

## Konvence kódu

- Proměnné anglicky, `snake_case`
- Komentáře česky/slovensky
- Max. délka řádku: 88 znaků (black formatter)
--

## Dokumentace modelů

Podrobná dokumentace každého modelu (vstupy, výstupy, hyperparametry, volba přístupu):

- [`docs/model_card_clv_regrese.md`](docs/model_card_clv_regrese.md) — Kroky 3, 5, 6
- [`docs/model_card_klasifikace.md`](docs/model_card_klasifikace.md) — Krok 4
- [`docs/model_card_churn.md`](docs/model_card_churn.md) — Krok 8
- [`docs/feature_dictionary.md`](docs/feature_dictionary.md) — všechny features
