# CLV Prediction 2025 — Customer Lifetime Value & Churn Pipeline with Web Dashboard

End-to-end datový projekt pro B2C retail zaměřený na predikci Customer Lifetime Value (CLV) pro rok 2025, predikci rizika churnu a pokročilou segmentaci zákazníků. Součástí projektu je produkční webový dashboard postavený nad frameworkem Flask integrovaný s Salesforce CRM datovou strukturou.

Pipeline zpracovává historická data z let 2022–2024 a predikuje budoucí revenue zákazníka v roce 2025. Výstupy jsou rizikově očištěny o pravděpodobnost churnu, rozřazeny do věrnostních tierů a interpretovány pomocí přibližného feature-level XAI.

---

# Výsledky modelů

## Regrese — predikce výše CLV 2025

*Regresní modely jsou trénovány na 80 % dat a evaluovány na 20 % testovacím subsetu.*

| Model                       | MAE          | RMSE          | R²        | MAE (aktivní) | R² (aktivní) |
| --------------------------- | ------------ | ------------- | --------- | ------------- | ------------ |
| Lineární regrese (baseline) | 9 708 Kč     | 17 101 Kč     | 0.418     | 15 185 Kč     | 0.274        |
| Random Forest (tuned)       | 8 406 Kč     | 16 212 Kč     | 0.477     | 14 153 Kč     | 0.328        |
| **XGBoost (tuned) ✅**       | **8 172 Kč** | **15 512 Kč** | **0.521** | **13 888 Kč** | **0.383**    |

*Poznámka ke GridSearch: Nejlepší parametry pro finální XGBoost Regressor zahrnují `n_estimators=300`, `max_depth=6` a `learning_rate=0.05`.*

## Klasifikace — nakoupí zákazník v roce 2025?

| Model              | Accuracy | Precision | Recall | F1     | ROC-AUC   |
| ------------------ | -------- | --------- | ------ | ------ | --------- |
| Logistická regrese | 81.3 %   | 80.2 %    | 79.5 % | 79.8 % | **0.910** |

## Churn Prediction — odejde zákazník?

| Model                         | ROC-AUC   | F1        | Accuracy   | Precision  | Recall     |
| ----------------------------- | --------- | --------- | ---------- | ---------- | ---------- |
| Logistická regrese (baseline) | 0.853     | 0.725     | 77.4 %     | 76.0 %     | 69.4 %     |
| **XGBoost (tuned) ✅**         | **0.883** | **0.746** | **79.8 %** | **80.7 %** | **69.4 %** |

## Segmentace zákazníků podle hodnoty (XGBoost predikce, n = 1 200)

| Věrnostní Tier | Prahová hodnota (Kč) | Počet | Podíl  | Prům. predikovaný CLV | Prům. recency |
| -------------- | -------------------- | ----- | ------ | --------------------- | ------------- |
| **Gold**       | ≥ 25 000             | 139   | 11.6 % | 53 536 Kč             | 116 dní       |
| **Silver**     | 5 000 – 25 000       | 315   | 26.3 % | 12 818 Kč             | 187 dní       |
| **Bronze**     | < 5 000              | 746   | 62.2 % | 660 Kč                | 405 dní       |

---

# Hlavní funkce webové aplikace (Flask App)

1. **Interaktivní Dashboard & CRM Integrace**
   Kompletní tabulka zákaznických účtů (Account data) propojená s vypočtenými behaviorálními features v reálném čase.

2. **Spouštění XGBoost Pipeline na kliknutí**
   Automatické natrénování modelu (pokud neexistuje), automatické ošetření chybějících hodnot (mediánová imputace) a winsorizace extrémních trendových hodnot na 99. percentilu.

3. **Rizikově očištěné CLV**
   Predikované revenue je dynamicky penalizováno na základě výstupů churn modelu podle vzorce:

   `CLV_predicted × (1 − P(churn))`

4. **Co-Pilot pro simulace scénářů**
   Možnost upravovat vybrané metriky (engagement, open rate, frekvence nákupů) pro konkrétního zákazníka a simulovat dopad změn na jeho budoucí CLV.

5. **Vysvětlitelné AI (XAI)**
   Generování top-3 klíčových driverů (pozitivních i negativních) stojících za predikcí pro každý jednotlivý účet na základě relativních Z-score a důležitosti features.

6. **Pokročilé marketingové segmenty**
   Výpočet specifických kohort jako *Champions*, *High-Value at Risk*, *Loyal Mid-Tier*, *Dormant High-Potential* a *Growing New* kombinací RFM a rizikových metrik.

7. **Exporty dat**
   Možnost uložení finálních predikcí do CSV formátu pro přímý import zpět do Salesforce CRM.

---

# Struktura projektu

```text
clv_project/
│
├── app.py
├── requirements.txt
├── start_app.bat
├── start_app.ps1
├── .gitignore
│
├── csv/
│   ├── Account.csv
│   ├── Order__c.csv
│   ├── Activity__c.csv
│   └── Product2.csv
│
├── notebooks/
│   ├── krok_01_EDA.ipynb
│   ├── krok_02_feature_engineering.ipynb
│   ├── krok_03_linearni_regrese.ipynb
│   ├── krok_04_logisticka_regrese.ipynb
│   ├── krok_05_random_forest.ipynb
│   ├── krok_06_xgboost.ipynb
│   ├── krok_07_segmentace.ipynb
│   ├── krok_08_churn.ipynb
│   │
│   └── outputs/
│       └── step_02_features.csv
│
├── outputs/
│   ├── clv_predictions_export.csv
│   └── step_*_metrics.csv
│
├── models/
│   ├── xgboost_clv_model.pkl
│   └── feature_names.pkl
│
├── templates/
│   └── index.html
│
└── static/
    ├── style.css
    └── script.js
```

---

# Tok dat a architektura

```text
[ CRM Zdrojová data: csv/ ]
(Account, Order__c, Activity__c, Product2)
│
▼
Krok 1: Jupyter EDA ──► Generování step_01_*.csv
│
▼
Krok 2: Feature Engineering ──► step_02_features.csv
│
├───────────────────────────────────────┐
▼                                       ▼
[ Kroky 3–6: Regrese ]             [ Krok 4 & 8: Churn ]
(XGBoost model)                    (Výpočet P(churn))
│                                       │
└───────────────────┬───────────────────┘
                    │
                    ▼
            [ Flask Backend ]
                    │
├─► GET /api/accounts
├─► GET /api/segments
├─► GET /api/explain
└─► GET /api/stats
```

---

# Vstupní datová struktura (CRM Data)

Projekt přímo mapuje standardní objekty ze Salesforce CRM:

* **Account** – informace o klientovi (věk, region, věrnostní status, akviziční kanál). *(1 200 entit)*
* **Order__c** – historické transakce (finální cena, sleva, produkt, stav objednávky). *(~9 500 řádků)*
* **Activity__c** – digitální stopa klienta (přihlášení, otevření e-mailů, skóre aplikace). *(1 200 entit)*
* **Product2** – produktové portfolio (kategorie, cena, náklady). *(72 záznamů)*

---

# Použité Features pro predikci CLV

Model využívá 29 analytických příznaků:

## RFM indikátory

* `recency_days`
* `frequency`
* `monetary_total`
* `monetary_avg`

## Historické spendy

* `spend_2022`
* `spend_2023`
* `spend_2024`

## Trendy

* `spend_trend_2y`
* `spend_trend_1y`

## Digitální engagement

* `login_count_30d`
* `login_count_90d`
* `email_open_rate`
* `app_usage_score`
* `days_since_login`

## Zákaznický profil

* `age`
* `tenure_days`
* `category_diversity`
* preferované kanály
* status odběru kampaní

---

# API dokumentace

## 1. Získání klientských dat

**Endpoint**

```http
GET /api/accounts
```

**Popis**

Vrátí seznam všech zákazníků obohacený o behaviorální features, pravděpodobnost churnu a predikci CLV.

---

## 2. Spuštění predikční pipeline

**Endpoint**

```http
POST /api/predict
```

**Popis**

Inicializuje trénink nebo načtení XGBoost modelu, provede predikci pro celé portfolio a aplikuje rizikové očištění podle churn skóre.

---

## 3. Simulace Co-Pilot scénářů

**Endpoint**

```http
POST /api/simulate
```

**Payload**

```json
{
  "account_external_id": "ACC-00001",
  "app_usage_score": 85,
  "email_open_rate": 70,
  "frequency": 12
}
```

**Popis**

Přepíše vybrané metriky konkrétního zákazníka, přepočítá predikci in-memory a vrátí simulovaný dopad na CLV.

---

## 4. Klientské vysvětlení (XAI)

**Endpoint**

```http
GET /api/explain/<account_id>
```

**Popis**

Identifikuje top-3 nejsilnější faktory ovlivňující výsledné CLV porovnáním s mediánem populace a vahami příznaků v XGBoost modelu.

---

## 5. Pokročilé segmenty

**Endpoint**

```http
GET /api/segments
```

**Popis**

Rozřadí zákazníky do mikrosegmentů, například:

* High-Value at Risk
* Champions
* Loyal Mid-Tier
* Dormant High-Potential
* Growing New

---

# Rychlý start

## Technické požadavky

* Python 3.11+
* Moderní webový prohlížeč s podporou JavaScriptu a HTML5

## Instalace

```bash
git clone https://github.com/<tvůj-username>/clv_project.git
cd clv_project
pip install -r requirements.txt
```

## Spuštění aplikace

### Windows

```bash
start_app.bat
```

### PowerShell

```powershell
./start_app.ps1
```

### Python

```bash
python app.py
```

Aplikace poběží na:

```text
http://localhost:5000
```

---

# Poznámka k inicializaci

Při prvním spuštění a kliknutí na **Run XGBoost Model** se spustí trénovací cyklus, který může trvat 1–2 minuty.

Další spuštění využívají serializované modely uložené ve složce `models/` a trvají pouze řádově milisekundy.

---

# Konvence vývoje a prostředí

## Reprodukovatelnost

```python
RANDOM_STATE = 42
```

Používá se napříč všemi skripty a notebooky.

## Kódový standard

* Názvy proměnných v angličtině (`snake_case`)
* Komentáře česky/slovensky
* Formátování pomocí Black Formatter
* Maximálně 88 znaků na řádek

## Vizualizace

### Notebooky a backend

* seaborn
* matplotlib

### Webová aplikace

* Chart.js

---

# Technologický stack

* Flask
* XGBoost
* Pandas
* Scikit-Learn
* Chart.js

---

*Vytvořeno jako CLV Prediction Project (2025/2026).*
