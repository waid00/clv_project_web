# Model Card — Churn Prediction Model (Krok 8)

## Co model predikuje

**Target:** `is_churned` — zda zákazník odchurňuje.
- `1` = zákazník byl aktivní v 2022 nebo 2023, ale **nenakoupil v roce 2024**
- `0` = zákazník nakoupil v 2022/2023 i v 2024 (retained)

**Typ úlohy:** Binární klasifikace

**Výstup modelu:**
- `P(churn)` — pravděpodobnost churnu ∈ [0, 1]
- `Churn Risk` — kategorie: Nízké / Střední / Vysoké (prahy: 0.35 / 0.65)

---

## Definice churnu — metodická rozhodnutí

### Proč "nenakoupil v 2024", ne "nenakoupil v 2025"?

Rok 2025 je target pro CLV regresní modely — použití roku 2025 jako definice churnu
by způsobilo **data leakage** (model by se učil na informaci, kterou chce predikovat).

Rok 2024 je čistý: máme plná historická data, žádné budoucí informace.
Features jsou počítány z let 2022–2023, tedy ze dvou let předcházejících referenčnímu roku.

### Proč vyloučit zákazníky bez nákupu v 2022/2023?

Churn model predikuje **odchod stávajících zákazníků** — zákazníci, kteří nikdy nebyli
aktivní, nejdou "odejít" ve smyslu churnu. Jejich absence v 2024 není churn,
je to prostě neaktivita. Zahrnutí by model zaměřilo na jiný problém (akvizice vs. retence).

### Výsledná cílová skupina

| Skupina | Počet |
|---|---|
| Aktivní v 2022 nebo 2023 (cílová skupina) | 837 |
| Retained (nakoupili i v 2024) | 476 (56.9 %) |
| **Churned (nenakoupili v 2024)** | **361 (43.1 %)** |

**Churn rate 43.1 %** je poměrně vysoký — typický B2C roční churn je 20–40 %,
takže data jsou v realistickém rozsahu.

---

## Datové okno

| Účel | Období | Popis |
|---|---|---|
| **Features** | 2022–2023 | RFM, trendy, behaviorální, profilové features |
| **Target (churn)** | 2024 | Chybí nákup = churn |
| **Validace** | 2025 | Nezávislé ověření predikce (zákazník se nevrátil?) |

**Referenční datum:** `2023-12-31` — recency a tenure se počítají k tomuto datu.

---

## Features pro churn model

Features jsou analogické CLV modelu (Krok 2), ale počítané z kratšího okna (2022–2023)
a s referenčním datem `2023-12-31` místo `2024-12-31`.

### RFM features (z Completed objednávek 2022–2023)

| Feature | Typ | Popis |
|---|---|---|
| `recency_days` | int | Dny od poslední Completed objednávky do 31. 12. 2023 |
| `frequency` | int | Počet Completed objednávek v 2022–2023 |
| `monetary_total` | float | Suma order_value v 2022–2023 |
| `monetary_avg` | float | Průměrná order_value v 2022–2023 |
| `monetary_std` | float | Std. odchylka order_value (0 pokud jen 1 objednávka) |
| `avg_discount_pct` | float | Průměrné % slevy |
| `category_diversity` | int | Počet unikátních kategorií produktů |
| `return_rate` | float | Podíl vrácených objednávek (0–1) |

### Trendové features

| Feature | Typ | Popis |
|---|---|---|
| `spend_2022` | float | Celková útrata v roce 2022 |
| `spend_2023` | float | Celková útrata v roce 2023 |
| `spend_trend` | float | Relativní změna: (spend_2023 − spend_2022) / (spend_2022 + 1) |

> `spend_trend` je winzorizován na 99. percentil — zákazníci bez nákupu v 2022
> mají jinak extrémně vysoký trend.

### Behaviorální features (Activity__c)

| Feature | Typ | Popis |
|---|---|---|
| `days_since_login` | int | Dny od posledního přihlášení do 31. 12. 2023 |
| `login_count_30d` | int | Počet přihlášení za posledních 30 dní |
| `login_count_90d` | int | Počet přihlášení za posledních 90 dní |
| `email_open_rate` | float | Míra otevření emailů (0–1) |
| `app_usage_score` | float | Skóre využití aplikace (0–100) |
| `support_tickets` | int | Počet support ticketů |

### Profilové features (Account)

| Feature | Typ | Popis | Encoding |
|---|---|---|---|
| `tenure_days` | int | Délka zákaznického vztahu do 31. 12. 2023 | Přímá hodnota |
| `loyalty_tier_enc` | int | Loyalty tier | Bronze=1, Silver=2, Gold=3 |
| `is_cz` | int | Region | CZ=1, SK=0 |
| `campaign_opt_in` | int | Přihlášen ke kampaním | True=1, False=0 |
| `age` | int | Věk zákazníka | Přímá hodnota |

---

## Modely

### Baseline — Logistická regrese

Stejný přístup jako v Kroku 4, ale pro churn target. Preprocessing zahrnuje
`StandardScaler` (povinný pro LR) a stratifikovaný split.

**Výsledky:**
- ROC-AUC: 0.853
- F1: 0.725
- Accuracy: 77.4 %

### Hlavní model — XGBoost Classifier

**GridSearchCV**, 32 kombinací × 5 foldů = 160 fitů.

| Hyperparametr | Testované hodnoty | Nejlepší | Zdůvodnění |
|---|---|---|---|
| `n_estimators` | 200, 400 | 200 | Churn je binární — méně stromů stačí |
| `max_depth` | 3, 5 | 3 | Mělčí stromy zabraňují přefitování na 837 zákazníků |
| `learning_rate` | 0.05, 0.1 | 0.05 | Pomalejší učení → lepší generalizace při malém datasetu |
| `subsample` | 0.7, 0.9 | 0.9 | Malý dataset — zachováme více dat v každém stromu |

> **Proč `max_depth=3` (mělčí než CLV model s depth=6)?**
> Dataset má pouze 837 zákazníků (vs. 1 200 pro CLV) — hlubší stromy by se rychleji
> přefitovaly. GridSearch tuto hodnotu potvrdil empiricky.

**Výsledky:**

| Metrika | Hodnota |
|---|---|
| **ROC-AUC** | **0.883** |
| Accuracy | 79.8 % |
| Precision (churned) | 80.7 % |
| Recall (churned) | 69.4 % |
| F1-score (churned) | 74.6 % |
| CV ROC-AUC průměr | 0.855 |

---

## Top features dle importance

| Pořadí | Feature | Importance | Interpretace |
|---|---|---|---|
| 1 | `recency_days` | 0.175 | Zákazníci, kteří nekoupili dlouho, odchurňují |
| 2 | `tenure_days` | 0.067 | Paradoxně: starší zákazníci odchurňují více |
| 3 | `spend_trend` | 0.060 | Záporný trend výdajů = varovný signál |
| 4 | `frequency` | 0.057 | Méně objednávek = vyšší riziko |
| 5 | `app_usage_score` | 0.055 | Nižší digitální engagement = vyšší riziko |

---

## Validace na roce 2025

Zákazníci predikovaní jako churned (2024) byli zkontrolováni proti aktivitě v 2025.
Z 279 zákazníků s `P(churn) > 0.7` se vrátilo pouze **7 (2.5 %)** v roce 2025.
To potvrzuje, že model predikuje skutečný, trvalý churn — ne jen dočasnou pauzu.

| Churn Risk | % aktivních v 2025 |
|---|---|
| Nízké | výrazně vyšší |
| Střední | střední |
| Vysoké | ~2–3 % |

---

## Akční matice — kombinace s CLV segmentem

Výstup Kroku 8 kombinuje `Churn Risk` s `CLV Segment` z Kroku 7:

| Churn Risk \ CLV | High | Medium | Low |
|---|---|---|---|
| **Vysoké** | 🔴 Okamžitá retence — nejvyšší priorita | 🟡 Cílená kampaň | ⚪ Nízká priorita |
| **Střední** | 🟡 Sledovat — preventivní kontakt | ⚪ Sledovat | ⚪ — |
| **Nízké** | 🟢 Udržet — spokojenost a upsell | 🟢 Rozvíjet vztah | ⚪ Pasivní |

**Business interpretace:** Zákazník s High CLV a Vysokým rizikem churnu představuje
nejvyšší ztrátu v případě odchodu. Průměrný predikovaný CLV pro High segment je
53 536 — retence jednoho takového zákazníka má vyšší hodnotu než akvizice
desítek Low segment zákazníků.

---

## Výstupní soubor

`outputs/step_08_churn_output.csv` obsahuje pro 837 zákazníků
(aktivních v 2022/2023):

| Sloupec | Popis |
|---|---|
| `ID zákazníka` | Identifikátor zákazníka |
| `Loyalty Tier` | Gold / Silver / Bronze |
| `Region` | CZ / SK |
| `CLV Segment` | High / Medium / Low (z Kroku 7) |
| `Predikovaný CLV 2025` | Číselná predikce XGBoost (Krok 6) |
| `P(churn)` | Pravděpodobnost churnu (0–1) |
| `Churn Risk` | Nízké / Střední / Vysoké |
| `Churned 2024 (skutečnost)` | 1 = skutečně odchurnil v 2024 |
| `priorita` | Doporučená akce pro retention tým |

---

## Omezení modelu

- **Malý dataset:** 837 zákazníků je na hranici spolehlivého trénování XGBoost —
  CV rozptyl je vyšší než u CLV modelu
- **Definice churnu je binární:** model nerozlišuje "churn na 6 měsíců"
  od "permanentního odchodu" — to by vyžadovalo survival analýzu
- **Recall 69.4 %:** ~30 % churnujících zákazníků model neidentifikuje —
  jsou "skryti" v Retained skupině. Pro agresivnější záchyt snížit threshold na ~0.35
- **Statické features:** Activity__c features jsou snapshot v čase, ne časová řada —
  trend aktivit (login_count roste nebo klesá?) by pravděpodobně přinesl zlepšení
