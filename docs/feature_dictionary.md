# Slovník Features

Všechny features použité v projektu, jejich zdroj, výpočet a použití v modelech.

**Referenční datum pro CLV modely (Kroky 3–7):** `2024-12-31`  
**Referenční datum pro Churn model (Krok 8):** `2023-12-31`

---

## RFM Features

Počítány z **Completed** objednávek ve stanoveném trénovacím okně.

| Feature | Typ | Výpočet | Použití | Poznámka |
|---|---|---|---|---|
| `recency_days` | int | Dny od poslední Completed obj. do ref. data | CLV + Churn | Cold-start zákazníci = 999 (CLV) nebo max možná hodnota (Churn) |
| `frequency` | int | Počet Completed objednávek v trénovacím okně | CLV + Churn | 0 pro cold-start zákazníky |
| `monetary_total` | float | Suma `order_value` (Completed) | CLV + Churn | Kč/€; 0 pro cold-start |
| `monetary_avg` | float | Průměrná `order_value` (Completed) | CLV + Churn | 0 pro cold-start |
| `monetary_max` | float | Maximální `order_value` (Completed) | CLV | 0 pro cold-start |
| `monetary_std` | float | Std. odchylka `order_value`; 0 pokud ≤1 obj. | CLV | Zachycuje konzistenci nákupů |
| `avg_discount_pct` | float | Průměrné `discount_pct` (Completed) | CLV + Churn | 0 pro cold-start |
| `avg_quantity` | float | Průměrné `quantity` na objednávku | CLV | 0 pro cold-start |
| `return_rate` | float | Returned objednávky / všechny objednávky | CLV + Churn | Počítáno ze VŠECH objednávek (incl. Returned) |
| `category_diversity` | int | Počet unikátních `product_category` | CLV + Churn | 0 pro cold-start |

---

## Trendové Features

| Feature | Typ | Výpočet | Použití | Poznámka |
|---|---|---|---|---|
| `spend_2022` | float | Suma Completed `order_value` v roce 2022 | CLV + Churn | 0 pokud zákazník v daném roce nenakoupil |
| `spend_2023` | float | Suma Completed `order_value` v roce 2023 | CLV + Churn | 0 pokud zákazník v daném roce nenakoupil |
| `spend_2024` | float | Suma Completed `order_value` v roce 2024 | CLV | 0 pokud zákazník v daném roce nenakoupil |
| `spend_trend_2y` | float | `(spend_2024 − spend_2022) / (spend_2022 + 1)` | CLV | Winzorizace na 99. percentil; +1 zabraňuje dělení nulou |
| `spend_trend_1y` | float | `(spend_2024 − spend_2023) / (spend_2023 + 1)` | CLV | Winzorizace na 99. percentil |
| `spend_trend` | float | `(spend_2023 − spend_2022) / (spend_2022 + 1)` | Churn | Verze pro churn model (kratší okno) |

> **Winzorizace:** Zákazníci bez nákupu v prvním roce mají ve jmenovateli 0 → po +1
> korekcí stále extrémně vysoké hodnoty. Winzorizace na 99. percentil eliminuje
> tyto outliers bez ztráty legitimní informace o rychle rostoucích zákaznících.

---

## Behaviorální Features (Activity__c)

Snapshot z tabulky `Activity__c` — jeden řádek na zákazníka.

| Feature | Typ | Zdroj sloupec | Použití | Poznámka |
|---|---|---|---|---|
| `days_since_login` | int | `last_login_date` | CLV + Churn | `(ref_date − last_login_date).days` |
| `login_count_30d` | int | `login_count_30d` | CLV + Churn | Počet přihlášení za posledních 30 dní |
| `login_count_90d` | int | `login_count_90d` | CLV + Churn | Počet přihlášení za posledních 90 dní |
| `email_open_rate` | float | `email_open_rate` | CLV + Churn | Míra otevření emailů; rozsah 0–1 |
| `app_usage_score` | float | `app_usage_score` | CLV + Churn | Skóre využití aplikace; rozsah 0–100 |
| `support_tickets` | int | `support_tickets` | CLV + Churn | Počet support ticketů (vyšší může značit frustraci) |

---

## Profilové Features (Account)

| Feature | Typ | Zdroj sloupec | Výpočet / Encoding | Použití |
|---|---|---|---|---|
| `age` | int | `age` | Přímá hodnota | CLV + Churn |
| `tenure_days` | int | `customer_since` | `(ref_date − customer_since).days` | CLV + Churn |
| `loyalty_tier_enc` | int | `loyalty_tier` | Bronze=1, Silver=2, Gold=3 | CLV + Churn |
| `is_cz` | int | `region` | CZ=1, SK=0 | CLV + Churn |
| `campaign_opt_in` | int | `campaign_opt_in` | True=1, False=0 | CLV + Churn |
| `channel_Mobile App` | int | `preferred_channel` | One-hot; referenční kategorie: Email | CLV |
| `channel_Store` | int | `preferred_channel` | One-hot; referenční kategorie: Email | CLV |
| `channel_Web` | int | `preferred_channel` | One-hot; referenční kategorie: Email | CLV |

> **Proč ordinální encoding pro `loyalty_tier`?**
> Bronze < Silver < Gold je přirozené ordinální pořadí — zákazníci s vyšším
> tiererem jsou hodnotnější. Ordinální encoding zachycuje tento vztah jedinou
> číselnou proměnnou. One-hot by ztratil pořadovou informaci a přidal 2 redundantní sloupce.

---

## Target Variables

| Proměnná | Model | Výpočet | Rozsah |
|---|---|---|---|
| `clv_2025` | Kroky 3, 5, 6, 7 | Suma Completed `order_value` v 2025; 0 pokud žádná | 0 – ~165 000 |
| `bought_2025` | Krok 4 | 1 pokud `clv_2025 > 0`, jinak 0 | {0, 1} |
| `is_churned` | Krok 8 | 1 pokud aktivní v 2022/2023 a bez nákupu v 2024 | {0, 1} |

---

## Přehled dostupnosti features v modelech

| Feature | Krok 3 (LR) | Krok 4 (CLS) | Krok 5 (RF) | Krok 6 (XGB) | Krok 8 (Churn) |
|---|---|---|---|---|---|
| recency_days | ✅ | ✅ | ✅ | ✅ | ✅ |
| frequency | ✅ | ✅ | ✅ | ✅ | ✅ |
| monetary_total | ✅ | ✅ | ✅ | ✅ | ✅ |
| monetary_avg | ✅ | ✅ | ✅ | ✅ | ✅ |
| monetary_max | ✅ | ✅ | ✅ | ✅ | ❌ |
| monetary_std | ✅ | ✅ | ✅ | ✅ | ✅ |
| avg_discount_pct | ✅ | ✅ | ✅ | ✅ | ✅ |
| avg_quantity | ✅ | ✅ | ✅ | ✅ | ❌ |
| return_rate | ✅ | ✅ | ✅ | ✅ | ✅ |
| category_diversity | ✅ | ✅ | ✅ | ✅ | ✅ |
| spend_2022 | ✅ | ✅ | ✅ | ✅ | ✅ |
| spend_2023 | ✅ | ✅ | ✅ | ✅ | ✅ |
| spend_2024 | ✅ | ✅ | ✅ | ✅ | ❌ |
| spend_trend_2y | ✅ | ✅ | ✅ | ✅ | ❌ |
| spend_trend_1y | ✅ | ✅ | ✅ | ✅ | ❌ |
| spend_trend | ❌ | ❌ | ❌ | ❌ | ✅ |
| login_count_30d | ✅ | ✅ | ✅ | ✅ | ✅ |
| login_count_90d | ✅ | ✅ | ✅ | ✅ | ✅ |
| email_open_rate | ✅ | ✅ | ✅ | ✅ | ✅ |
| app_usage_score | ✅ | ✅ | ✅ | ✅ | ✅ |
| support_tickets | ✅ | ✅ | ✅ | ✅ | ✅ |
| days_since_login | ✅ | ✅ | ✅ | ✅ | ✅ |
| age | ✅ | ✅ | ✅ | ✅ | ✅ |
| tenure_days | ✅ | ✅ | ✅ | ✅ | ✅ |
| loyalty_tier_enc | ✅ | ✅ | ✅ | ✅ | ✅ |
| is_cz | ✅ | ✅ | ✅ | ✅ | ✅ |
| campaign_opt_in | ✅ | ✅ | ✅ | ✅ | ✅ |
| channel_* (3×) | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Celkem features** | **29** | **29** | **29** | **29** | **22** |

> Churn model používá 22 features místo 29 — channel dummies a spend_2024 jsou
> vynechány, protože Krok 8 pracuje s kratším trénovacím oknem (2022–2023)
> a neobsahuje rok 2024 v datech.

---

## Poznámky k imputaci

Zákazníci bez Completed objednávek v trénovacím okně (**cold-start zákazníků**):
- V CLV modelu: 52 zákazníků → `recency_days=999`, ostatní RFM features = 0
- V Churn modelu: tito zákazníci jsou **vyloučeni** z cílové skupiny
  (churn model se týká pouze zákazníků aktivních v 2022/2023)

Behaviorální features (Activity__c): tabulka obsahuje přesně 1 řádek na zákazníka,
žádná imputace není potřeba. Profilové features (Account): kompletní pro všechny zákazníky.
