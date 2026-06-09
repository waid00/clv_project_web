# CLV Prediction 2025 — Customer Lifetime Value & Churn Pipeline with Web Dashboard

An end-to-end data project for B2C retail focused on predicting Customer Lifetime Value (CLV) for 2025, churn risk prediction, and advanced customer segmentation. The project includes a production web dashboard built on the Flask framework integrated with the Salesforce CRM data structure.

The pipeline processes historical data from 2022–2024 and predicts future customer revenue in 2025. The outputs are risk-adjusted by the probability of churn, categorized into loyalty tiers, and interpreted using approximate feature-level XAI.

---

# Model Results

## Regression — CLV 2025 Value Prediction

*Regression models are trained on 80% of the data and evaluated on a 20% test subset.*

| Model                       | MAE          | RMSE          | R²        | MAE (active)  | R² (active)  |
| --------------------------- | ------------ | ------------- | --------- | ------------- | ------------ |
| Linear Regression (baseline)| 9,708 CZK    | 17,101 CZK    | 0.418     | 15,185 CZK    | 0.274        |
| Random Forest (tuned)       | 8,406 CZK    | 16,212 CZK    | 0.477     | 14,153 CZK    | 0.328        |
| **XGBoost (tuned) ✅**       | **8,172 CZK**| **15,512 CZK**| **0.521** | **13,888 CZK**| **0.383**    |

*Note on GridSearch: Best parameters for the final XGBoost Regressor include `n_estimators=300`, `max_depth=6`, and `learning_rate=0.05`.*

## Classification — Will the customer purchase in 2025?

| Model              | Accuracy | Precision | Recall | F1     | ROC-AUC   |
| ------------------ | -------- | --------- | ------ | ------ | --------- |
| Logistic Regression| 81.3%    | 80.2%     | 79.5%  | 79.8%  | **0.910** |

## Churn Prediction — Will the customer churn?

| Model                         | ROC-AUC   | F1        | Accuracy   | Precision  | Recall     |
| ----------------------------- | --------- | --------- | ---------- | ---------- | ---------- |
| Logistic Regression (baseline)| 0.853     | 0.725     | 77.4%      | 76.0%      | 69.4%      |
| **XGBoost (tuned) ✅**         | **0.883** | **0.746** | **79.8%**  | **80.7%**  | **69.4%**  |

## Customer Segmentation by Value (XGBoost predictions, n = 1,200)

| Loyalty Tier | Threshold (CZK) | Count | Share  | Avg. Predicted CLV | Avg. Recency |
| ------------ | --------------- | ----- | ------ | ------------------ | ------------ |
| **Gold**     | ≥ 25,000        | 139   | 11.6%  | 53,536 CZK         | 116 days     |
| **Silver**   | 5,000 – 25,000  | 315   | 26.3%  | 12,818 CZK         | 187 days     |
| **Bronze**   | < 5,000         | 746   | 62.2%  | 660 CZK            | 405 days     |

---

# Main Features of the Web Application (Flask App)

1. **Interactive Dashboard & CRM Integration**
   A complete customer account table (Account data) linked with calculated behavioral features in real-time.

2. **One-Click XGBoost Pipeline Execution**
   Automatic model training (if it doesn't exist), automatic handling of missing values (median imputation), and winsorization of extreme trend values at the 99th percentile.

3. **Risk-Adjusted CLV**
   Predicted revenue is dynamically penalized based on the churn model outputs according to the formula:

   `CLV_predicted × (1 − P(churn))`

4. **Co-Pilot for Scenario Simulations**
   Ability to modify selected metrics (engagement, open rate, purchase frequency) for a specific customer and simulate the impact of these changes on their future CLV.

5. **Explainable AI (XAI)**
   Generation of the top 3 key drivers (positive and negative) behind the prediction for each individual account based on relative Z-scores and feature importances.

6. **Advanced Marketing Segments**
   Calculation of specific cohorts such as *Champions*, *High-Value at Risk*, *Loyal Mid-Tier*, *Dormant High-Potential*, and *Growing New* by combining RFM and risk metrics.

7. **Data Exports**
   Option to export final predictions to CSV format for direct import back into Salesforce CRM.

---

# Project Structure

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

# Data Flow and Architecture

```text
[ CRM Source Data: csv/ ]
(Account, Order__c, Activity__c, Product2)
│
▼
Step 1: Jupyter EDA ──► Generation of step_01_*.csv
│
▼
Step 2: Feature Engineering ──► step_02_features.csv
│
├───────────────────────────────────────┐
▼                                       ▼
[ Steps 3–6: Regression ]          [ Step 4 & 8: Churn ]
(XGBoost model)                    (P(churn) Calculation)
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

# Input Data Structure (CRM Data)

The project maps standard objects from Salesforce CRM directly:

* **Account** – client information (age, region, loyalty status, acquisition channel). *(1,200 entities)*
* **Order__c** – historical transactions (final price, discount, product, order status). *(~9,500 rows)*
* **Activity__c** – client's digital footprint (logins, email open rate, app usage score). *(1,200 entities)*
* **Product2** – product portfolio (category, price, cost). *(72 records)*

---

# Features Used for CLV Prediction

The model uses 29 analytical features:

## RFM Indicators

* `recency_days`
* `frequency`
* `monetary_total`
* `monetary_avg`

## Historical Spend

* `spend_2022`
* `spend_2023`
* `spend_2024`

## Trends

* `spend_trend_2y`
* `spend_trend_1y`

## Digital Engagement

* `login_count_30d`
* `login_count_90d`
* `email_open_rate`
* `app_usage_score`
* `days_since_login`

## Customer Profile

* `age`
* `tenure_days`
* `category_diversity`
* preferred channels
* campaign subscription status

---

# API Documentation

## 1. Get Client Data

**Endpoint**

```http
GET /api/accounts
```

**Description**

Returns a list of all customers enriched with behavioral features, churn probability, and CLV prediction.

---

## 2. Run Prediction Pipeline

**Endpoint**

```http
POST /api/predict
```

**Description**

Initializes the training or loading of the XGBoost model, runs predictions for the entire portfolio, and applies risk-adjustments based on the churn score.

---

## 3. Co-Pilot Scenario Simulation

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

**Description**

Overrides selected metrics for a specific customer, recalculates the prediction in-memory, and returns the simulated impact on CLV.

---

## 4. Client Explanation (XAI)

**Endpoint**

```http
GET /api/explain/<account_id>
```

**Description**

Identifies the top 3 strongest factors influencing the final CLV by comparing against the population median and feature weights in the XGBoost model.

---

## 5. Advanced Segments

**Endpoint**

```http
GET /api/segments
```

**Description**

Categorizes customers into micro-segments, for example:

* High-Value at Risk
* Champions
* Loyal Mid-Tier
* Dormant High-Potential
* Growing New

---

# Quick Start

## Technical Requirements

* Python 3.11+
* Modern web browser with JavaScript and HTML5 support

## Installation

```bash
git clone https://github.com/<your-username>/clv_project.git
cd clv_project
pip install -r requirements.txt
```

## Running the Application

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

The application will run on:

```text
http://localhost:5000
```

---

# Note on Initialization

When running for the first time and clicking **Run XGBoost Model**, the training cycle starts, which may take 1–2 minutes.

Subsequent runs use serialized models stored in the `models/` folder and only take milliseconds.

---

# Development Conventions and Environment

## Reproducibility

```python
RANDOM_STATE = 42
```

Used across all scripts and notebooks.

## Coding Standard

* Variable names in English (`snake_case`)
* Comments in Czech/Slovak
* Formatting using Black Formatter
* Maximum of 88 characters per line

## Visualization

### Notebooks and backend

* seaborn
* matplotlib

### Web application

* Chart.js

---

# Technology Stack

* Flask
* XGBoost
* Pandas
* Scikit-Learn
* Chart.js

---

*Created as CLV Prediction Project (2025/2026).*
