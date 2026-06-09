# CLV Prediction Web Application

A modern web dashboard for visualizing and predicting Customer Lifetime Value (CLV) using XGBoost model.

## Features

✨ **Interactive Dashboard**
- View all Account data with integrated features
- Real-time visualization of CLV predictions
- Before/after comparison with prediction differences
- Multiple analytical charts and statistics

🚀 **XGBoost Integration**
- Trained XGBoost model for accurate CLV prediction
- Automatic model training and caching
- One-click prediction execution
- Detailed performance metrics

📊 **Analytics & Visualization**
- Actual vs Predicted CLV scatter plot
- CLV distribution histograms
- Prediction error analysis
- Comprehensive statistics dashboard

💾 **Data Export**
- Export predictions to CSV
- Save results for further analysis

## Installation

1. **Install dependencies:**
```bash
pip install -r requirements.txt
```

2. **Verify your data files exist:**
```
csv/Account.csv
csv/Activity__c.csv
csv/Order__c.csv
csv/Product2.csv
notebooks/outputs/step_02_features.csv
```

## Running the Application

1. **Navigate to project directory:**
```bash
cd c:\Users\david\Desktop\clv\clv_project
```

2. **Start the Flask application:**
```bash
python app.py
```

3. **Open in browser:**
```
http://localhost:5000
```

## Usage

### Initial Load
- The dashboard automatically loads all account data on startup
- Account table displays all customers with their features

### Generate Predictions
1. Click the **"⚡ Run XGBoost Model"** button
2. Wait for the model to process (may take 1-2 minutes for first run)
3. Results appear automatically:
   - Statistics panel shows key metrics
   - Account table updates with predictions
   - Charts visualize the results

### View Results
- **Account Table**: Shows each customer with actual vs predicted CLV
- **Statistics Panel**: Shows aggregated metrics (mean, total, errors)
- **Charts**:
  - Scatter plot: Actual vs predicted relationship
  - Distribution chart: CLV comparison histograms
  - Error chart: Prediction error distribution

### Export Results
- Click **"💾 Export Predictions"** to save results
- Exports to `outputs/clv_predictions_export.csv`

## Project Structure

```
clv_project/
├── app.py                          # Flask application (main entry point)
├── requirements.txt                # Python dependencies
├── csv/                           # Input data
│   ├── Account.csv
│   ├── Activity__c.csv
│   ├── Order__c.csv
│   └── Product2.csv
├── notebooks/                     # Jupyter notebooks with analysis
│   ├── krok_06_xgboost.ipynb     # XGBoost model training
│   └── outputs/                  # Processed data
│       └── step_02_features.csv  # Features for prediction
├── templates/                     # HTML templates
│   └── index.html                # Main dashboard
├── static/                        # Static files (CSS, JS)
│   ├── style.css                 # Styling
│   └── script.js                 # Frontend logic
├── models/                        # Trained models (auto-created)
│   ├── xgboost_clv_model.pkl    # Serialized model
│   └── feature_names.pkl         # Feature names
└── outputs/                       # Results
    └── clv_predictions_export.csv # Exported predictions
```

## API Endpoints

### GET `/api/accounts`
Returns all account data with features and predictions

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "account_external_id": "ACC-00001",
      "Name": "Customer 00001",
      "region": "CZ",
      "age": 39,
      "tenure_days": 138,
      "clv_2025": 1488.74,
      "clv_2025_predicted": 2500.50,
      "prediction_diff": 1011.76,
      ...
    }
  ]
}
```

### POST `/api/predict`
Runs the XGBoost model and generates predictions

**Response:**
```json
{
  "success": true,
  "stats": {
    "total_predictions": 1200,
    "mean_actual_clv": 12500.00,
    "mean_predicted_clv": 13200.50,
    "total_actual_clv": 15000000.00,
    "total_predicted_clv": 15840600.00,
    "mae": 3500.00,
    "rmse": 5200.50,
    "max_diff": 45000.00,
    "min_diff": -40000.00
  }
}
```

### GET `/api/stats`
Returns current statistics

### GET `/api/export`
Exports predictions to CSV

## Model Information

**Algorithm:** XGBoost Regressor

**Hyperparameters:**
- n_estimators: 300
- max_depth: 6
- learning_rate: 0.1
- subsample: 0.9
- colsample_bytree: 0.7
- random_state: 42

**Performance Metrics (from Krok 06):**
- MAE: 8,172 Kč
- RMSE: 15,512 Kč
- R²: 0.521
- MAE (active customers): 13,888 Kč
- R² (active customers): 0.383

## Features Used for Prediction

Account RFM & behavioral features:
- recency_days, frequency, monetary_total, monetary_avg
- spend_2022, spend_2023, spend_2024
- spend_trend_2y, spend_trend_1y
- login_count_30d, login_count_90d
- email_open_rate, app_usage_score
- support_tickets, days_since_login
- age, tenure_days, category_diversity
- loyalty_tier encoding, channel preferences
- campaign_opt_in status

## Troubleshooting

### Port Already in Use
If port 5000 is already in use, modify `app.py`:
```python
app.run(debug=True, host="localhost", port=5001)  # Change port number
```

### Model Training Takes Too Long
- First run trains the model (1-2 minutes)
- Subsequent runs load from cache (seconds)
- Suppress model training with cached version

### Data Loading Errors
- Verify CSV files exist in correct locations
- Check file permissions
- Ensure notebooks/outputs/step_02_features.csv is generated

## Browser Requirements

- Modern browser (Chrome, Firefox, Edge, Safari)
- JavaScript enabled
- No additional plugins required

## Performance

- **Dashboard Load:** ~2 seconds
- **Initial Prediction:** ~60-120 seconds (training)
- **Subsequent Predictions:** ~5-10 seconds (loaded model)
- **Table Size:** Handles 1000+ rows smoothly
- **Charts:** Interactive and responsive

## Notes

- All data is processed in-memory
- Model is cached after first training
- Predictions are stored in browser session memory
- Export saves to project `outputs/` directory
- Dashboard updates all visualizations automatically

## Future Enhancements

- [ ] Multi-model comparison
- [ ] Feature importance visualization
- [ ] SHAP value explanation charts
- [ ] Batch prediction scheduling
- [ ] Database integration
- [ ] Model versioning & rollback
- [ ] A/B testing framework
- [ ] Custom prediction scenarios

## Support

For issues or questions:
1. Check browser console for JavaScript errors
2. Check server logs for Python errors
3. Verify all dependencies are installed
4. Ensure data files are in correct locations

---

**Created:** 2025 CLV Prediction Project
**Technology Stack:** Flask, XGBoost, Pandas, Chart.js
