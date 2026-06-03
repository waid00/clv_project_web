# Model Card — CLV Regresní Modely (Kroky 3, 5, 6)

## Co modely predikují

**Target:** `clv_2025` — suma hodnot Completed objednávek zákazníka v roce 2025.  
Zákazníci, kteří v roce 2025 nenakoupili, mají `clv_2025 = 0`.

**Typ úlohy:** Regrese (spojitá hodnota ≥ 0)

**Výstup modelu:** Predikované CLV v Kč/€ pro každého ze 1 200 zákazníků.

---

## Datové okno a oddělení dat

| Účel | Období | Popis |
|---|---|---|
| **Features** | 2022–2024 | RFM, trendy, behaviorální, profilové features |
| **Target** | 2025 | Suma Completed order_value |
| **Train set** | 80 % zákazníků | `random_state=42` |
| **Test set** | 20 % zákazníků | Nikdy neviděn během tréninku ani tuningu |

> **Proč tento split?** Chronologické oddělení (features z minulosti, target z budoucnosti)
> zabraňuje data leakage. Split přes zákazníky (ne přes čas) zajišťuje,
> že model generalizuje na nové zákazníky, ne jen na nové objednávky.

---

## Klíčový problém: třída nul

**53,2 % zákazníků** má `clv_2025 = 0` (nenakoupili v 2025). To způsobuje:
- Umělé zlepšení MAE (predikce blízko 0 pro neaktivní zákazníky je "zdarma" správná)
- Skreslenou interpretaci R² — model může mít R²=0.5 i bez skutečného pochopení aktivních zákazníků

**Proto reportujeme metriky dvakrát:** pro všechny zákazníky a zvlášť pro aktivní (CLV > 0).

---

## Krok 3 — Lineární regrese (baseline)

### Proč lineární regrese jako první?

Baseline model slouží jako dolní hranice výkonu. Pokud pokročilejší model
lineární regresi nepřekoná, máme problém s daty nebo features, ne s výběrem algoritmu.
Lineární regrese je navíc plně interpretovatelná — každý koeficient říká,
o kolik Kč/€ se změní predikované CLV při změně feature o jednu standardní odchylku.

### Preprocessing specifický pro lineární regresi

**StandardScaler** — lineární regrese je citlivá na škálování. Features s různými
rozsahy (recency_days: 0–999, email_open_rate: 0–1) by jinak dominovaly modelu
na základě škály, ne informační hodnoty. Scaler je fitován pouze na trénovací množině.

**Winzorizace `spend_trend_2y` a `spend_trend_1y` na 99. percentil** —
zákazníci s nulovým nákupem v jednom roce mají teoreticky nekonečný trend
(dělení nulou ošetřeno +1 ve jmenovateli, ale výsledné hodnoty jsou stále extrémní).
Winzorizace zabrání dominanci těchto outlierů v OLS optimalizaci.

**Clipping predikcí na 0** — lineární regrese může predikovat záporné CLV,
což ekonomicky nedává smysl. Záporné predikce jsou oříznuty na 0.

### Hyperparametry

Lineární regrese nemá hyperparametry v tradičním smyslu. Testována byla také
`RidgeCV` (L2 regularizace, `alpha=100`), která přinesla marginálně horší výsledky
než OLS — multikolinearita features tedy neovlivňuje model natolik, aby Ridge
výrazně pomohl.

### Výsledky

| Metrika | Hodnota |
|---|---|
| MAE | 9 708 |
| RMSE | 17 101 |
| R² | 0.4182 |
| MAE (aktivní zákazníci) | 15 185 |
| R² (aktivní zákazníci) | 0.274 |
| CV R² průměr (5-fold) | 0.350 ± 0.044 |

### Slabiny identifikované z residuální analýzy

- Silná pravostranná šikmost residuí (skewness ~2.8) — model podceňuje high-value zákazníky
- Heteroskedasticita — rozptyl chyb roste s výší predikce
- Záporný koeficient u `frequency` indikuje multikolinearitu s `monetary_total`
- 50/240 predikcí bylo záporných před clippingem (20,8 %)

---

## Krok 5 — Random Forest Regressor

### Proč Random Forest po lineární regresi?

Random Forest přirozeně řeší tři problémy lineárního modelu:
1. **Multikolinearita** — stromy vybírají features nezávisle, korelované features si
   nepřepisují váhy
2. **Nelinearity** — stromy zachycují prahové efekty a interakce bez explicitní specifikace
3. **Outliers v targetu** — průměrování přes stromy tlumí vliv extrémních CLV hodnot

**Škálování není potřeba** — rozhodovací stromy porovnávají prahové hodnoty,
nezávisí na absolutní škále features.

### GridSearchCV — volba hyperparametrů

Prohledáváno: 36 kombinací × 5 foldů = 180 fitů.
Scoring: `neg_mean_absolute_error` (MAE je robustnější vůči outlierům než RMSE).

| Hyperparametr | Testované hodnoty | Nejlepší | Zdůvodnění volby rozsahu |
|---|---|---|---|
| `n_estimators` | 200, 400 | 200 | Dostatečná diverzita pro 960 trénovacích zákazníků |
| `max_depth` | 10, 20, None | 20 | Plné stromy (None) přefitovaly; mělké (10) byly slabé |
| `min_samples_leaf` | 1, 5, 10 | 5 | Zabraňuje memorování šumu v listech |
| `max_features` | 0.5, "sqrt" | 0.5 | ~15 features na strom zajišťuje diverzitu |

### Výsledky

| Metrika | Hodnota |
|---|---|
| MAE | 8 406 |
| RMSE | 16 212 |
| R² | 0.4771 |
| MAE (aktivní zákazníci) | 14 153 |
| R² (aktivní zákazníci) | 0.3276 |
| CV MAE průměr (5-fold) | 7 879 ± 1 071 |

### Zlepšení oproti lineární regresi

- MAE: −13.4 % (9 708 → 8 406)
- RMSE: −5.2 %
- R²: +0.059

### Pozorování z feature importance

Dominuje `spend_trend_2y` a `app_usage_score` — RF zachytil nelineární interakci
mezi výdajovým trendem a digitálním engagementem, kterou lineární regrese přehlédla.
`monetary_total` (nejsilnější korelát v Kroku 2) se umístil níže — jeho informaci
přenáší kombinace `spend_2024` a trendových features.

---

## Krok 6 — XGBoost Regressor (vítězný model)

### Proč XGBoost překonává Random Forest?

**Sekvenční boosting** vs. paralelní bagging u RF: každý nový strom XGBoost se
specializuje na zákazníky, kde předchozí stromy chybovaly nejvíce (gradient descent
na residuích). To je klíčová výhoda při long-tail distribuci CLV — zákazníci
s extrémně vysokým CLV dostávají v každé iteraci větší pozornost.

**L1/L2 regularizace** (`reg_alpha`, `reg_lambda`) zabraňuje přefitování,
které je u RF řešeno pouze agregací stromů.

### GridSearchCV — volba hyperparametrů

Prohledáváno: 32 kombinací × 5 foldů = 160 fitů.

| Hyperparametr | Testované hodnoty | Nejlepší | Zdůvodnění |
|---|---|---|---|
| `n_estimators` | 300, 500 | 300 | Boosting konverguje rychleji než bagging |
| `max_depth` | 4, 6 | 6 | Hlubší stromy zachycují interakce features |
| `learning_rate` | 0.05, 0.1 | 0.1 | 0.1 × 300 stromů ≈ dostatečná kapacita |
| `subsample` | 0.7, 0.9 | 0.9 | Dataset (960 řádků) je malý — méně subsamplingu |
| `colsample_bytree` | 0.7, 0.9 | 0.7 | Více diverzity stromů přes features |

### Výsledky

| Metrika | Hodnota |
|---|---|
| MAE | 8 172 |
| RMSE | 15 512 |
| R² | **0.5213** |
| MAE (aktivní zákazníci) | 13 888 |
| R² (aktivní zákazníci) | 0.3832 |
| CV MAE průměr (5-fold) | 7 953 |

### Zlepšení oproti lineární regresi (celkové)

- MAE: −15.8 % (9 708 → 8 172)
- RMSE: −9.3 %
- R²: +0.103

### SHAP interpretace

SHAP (SHapley Additive exPlanations) hodnoty jsou počítány pomocí `TreeExplainer`,
který využívá stromovou strukturu XGBoost pro exaktní výpočet (ne aproximaci).

**Top 5 features dle průměrného |SHAP|:**

| Feature | Průměrný |SHAP| | Směr vlivu |
|---|---|---|
| `tenure_days` | 3 400 | Kratší vztah → vyšší CLV |
| `spend_trend_2y` | 2 688 | Rostoucí trend → vyšší CLV |
| `app_usage_score` | 2 322 | Vyšší aktivita → vyšší CLV |
| `recency_days` | 1 842 | Nižší recency → vyšší CLV |
| `spend_trend_1y` | 1 714 | Rostoucí trend → vyšší CLV |

> **Poznámka k `tenure_days`:** Záporný vztah (kratší vztah = vyšší CLV)
> pravděpodobně zachycuje segment nových, rychle rostoucích zákazníků.
> Starší zákazníci mohou být v "plateau" fázi nebo mají vyšší pravděpodobnost churnu.

### Omezení modelu

- R² = 0.52 znamená, že ~48 % variance CLV zůstává nevysvětleno
- Zákazníci s CLV > 50 000 jsou systematicky podceňováni (model regresuje k průměru)
- Model není kalibrován pro dvoustupňové použití (klasifikace aktivity + regrese hodnoty)
- Predikce je bodová — bez intervalu spolehlivosti

---

## Srovnání modelů

```
MAE (nižší = lepší):
  Lineární regrese  ████████████████████  9 708
  Random Forest     ██████████████████░░  8 406  (−13.4 %)
  XGBoost           █████████████████░░░  8 172  (−15.8 %)

R² (vyšší = lepší):
  Lineární regrese  ████████████░░░░░░░░  0.418
  Random Forest     █████████████░░░░░░░  0.477
  XGBoost           ██████████████░░░░░░  0.521
```

---

## Použití výstupu

Soubor `outputs/step_07_clv_segments.csv` obsahuje pro každého zákazníka:
- `Predikovaný CLV 2025` — číselná hodnota predikce (XGBoost)
- `CLV Segment` — High / Medium / Low dle fixních prahů (5 000 / 25 000)
- Profilové informace (tier, region, věk, recency, frequency)

**Segmentační prahy jsou fixní (business thresholds), ne quantile-based.**
Důvod: quantile-based prahy by se měnily s každou novou predikcí a ztěžovaly
konzistentní porovnání napříč obdobími.
