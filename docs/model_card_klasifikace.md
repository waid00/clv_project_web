# Model Card — Klasifikační Model (Krok 4)

## Co model predikuje

**Target:** `bought_2025` — binární proměnná, zda zákazník nakoupí v roce 2025.
- `1` = zákazník uskutečnil alespoň jednu Completed objednávku v 2025
- `0` = zákazník v 2025 nenakoupil

**Typ úlohy:** Binární klasifikace

**Výstup modelu:**
- `bought_2025_pred` — binární predikce (0 nebo 1, threshold = 0.5)
- `bought_2025_prob` — pravděpodobnost nákupu ∈ [0, 1]

---

## Proč samostatný klasifikační model?

Regresní modely (Kroky 3, 5, 6) predikují CLV přímo — včetně zákazníků s CLV=0.
Problém je, že 53,2 % zákazníků má CLV=0, a regrese nemá mechanismus pro
přesné oddělení "určitě nekoupí" od "koupí málo". Logistická regrese tento problém
řeší explicitně a přináší:

1. **Pravděpodobnostní skóre** použitelné pro threshold analýzu (kdo dostane kampaň)
2. **Dvoustupňový model** v Kroku 7: nejprve predikuj aktivitu, pak výši CLV
3. **Business interpretaci** — ROC-AUC 0.91 říká, že model s 91% spolehlivostí
   seřadí zákazníky od nejpravděpodobnějšího kupujícího po nejméně pravděpodobného

---

## Datové okno

| Účel | Období |
|---|---|
| **Features** | 2022–2024 (stejné jako regresní modely) |
| **Target** | 2025 — alespoň 1 Completed objednávka |

**Stratifikovaný split:** `train_test_split(..., stratify=y)` zajišťuje,
že poměr tříd (46.8 % ku 53.2 %) je zachován v train i test množině.

---

## Třídní nebalancovanost

Poměr tříd: **0.88:1** (639 nenakoupilo : 561 nakoupilo).  
Jde o mírnou nebalancovanost — accuracy zůstává smysluplnou metrikou.

Testována byla varianta `class_weight='balanced'`, která přiřazuje vyšší penalizaci
za chybu u minoritní třídy. Výsledky byly prakticky totožné (ROC-AUC 0.910 vs 0.910),
proto je použita výchozí verze bez vážení, která má mírně vyšší precision.

---

## Model — Logistická regrese

### Proč logistická regrese (ne XGBoost)?

Logistická regrese je použita pro klasifikaci ze stejného důvodu jako lineární regrese
pro regresi — tvoří **interpretovatelný baseline**. Výsledný ROC-AUC 0.91 je navíc
tak silný, že přechod na složitější model (XGBoost klasifikátor) by přinesl
marginální zlepšení za cenu ztráty interpretovatelnosti koeficientů.

### Preprocessing

Stejný jako pro lineární regresi:
- Winzorizace `spend_trend_2y` a `spend_trend_1y` na 99. percentil
- `StandardScaler` fitovaný pouze na trénovací množině
- Solver: `lbfgs` (stabilní pro středně velké datasety, podporuje L2 regularizaci)
- `max_iter=1000` (výchozí 100 nestačí pro konvergenci s 29 features)

### Cross-validace

`StratifiedKFold(n_splits=5, shuffle=True, random_state=42)` — zachovává
poměr tříd v každém foldu, shuffle zajišťuje náhodné rozdělení zákazníků.

---

## Výsledky

| Metrika | Hodnota |
|---|---|
| **ROC-AUC** | **0.9101** |
| Accuracy | 81.25 % |
| Precision (nakoupí) | 80.18 % |
| Recall (nakoupí) | 79.46 % |
| F1-score (nakoupí) | 79.82 % |
| CV ROC-AUC průměr | 0.879 ± 0.021 |
| CV F1 průměr | 0.775 ± 0.023 |

**Confusion Matrix (testovací množina, n=240):**
```
                  Predikováno: Ne  Predikováno: Ano
Skutečnost: Ne          106              22
Skutečnost: Ano          23              89
```

- **True Negative (106):** Správně identifikovaní neaktivní zákazníci
- **True Positive (89):**  Správně identifikovaní kupující
- **False Positive (22):** Zákazníci predikováni jako kupující, ale nekoupili (zbytečná kampaň)
- **False Negative (23):** Kupující predikováni jako neaktivní (zmeškána příležitost)

---

## Interpretace koeficientů

Koeficienty jsou v log-odds prostoru na standardizovaných features.
Kladný koeficient = feature zvyšuje pravděpodobnost nákupu.

| Feature | Koeficient | Interpretace |
|---|---|---|
| `recency_days` | −1.185 | Čím déle od posledního nákupu, tím nižší pravděpodobnost |
| `tenure_days` | −0.897 | Starší zákazníci mají nižší pravděpodobnost aktivity |
| `app_usage_score` | +0.550 | Vyšší app engagement → vyšší pravděpodobnost nákupu |
| `spend_2024` | +0.353 | Vyšší útrata v 2024 → pravděpodobnější nákup v 2025 |

> `recency_days` jako nejsilnější negativní prediktor je klasický RFM efekt —
> zákazníci, kteří nakoupili nedávno, budou s vyšší pravděpodobností nakupovat znovu.

---

## Threshold analýza

Výchozí threshold 0.5 optimalizuje accuracy. V závislosti na business cíli:

| Cíl | Doporučený threshold | Efekt |
|---|---|---|
| Maximální záchyt kupujících (kampaň) | ~0.35 | Vyšší Recall, nižší Precision |
| Minimalizace zbytečných kampaní | ~0.65 | Vyšší Precision, nižší Recall |
| Vyvážený F1 | ~0.50 | Výchozí nastavení |

---

## Výstupní soubor

`outputs/step_04_predictions.csv` obsahuje pro zákazníky v testovací množině:
- `bought_2025_actual` — skutečná třída
- `bought_2025_pred` — binární predikce
- `bought_2025_prob` — pravděpodobnost nákupu (použitelná pro scoring a ranking)

---

## Omezení modelu

- Model predikuje pouze **aktivitu** (koupí/nekoupí), ne výši CLV
- Koeficienty předpokládají lineární vztah v log-odds prostoru — nelineární efekty
  jsou zachyceny jen nepřímo přes features (trendy, kategoriální encoding)
- Pravděpodobnosti nejsou kalibrované (Platt scaling nebyl aplikován)
