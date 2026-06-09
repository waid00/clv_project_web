"""
CLV Prediction Web Application
Displays Account table and generates XGBoost CLV predictions
"""

import os
import sys
import json
from pathlib import Path
import pickle
import warnings

import pandas as pd
import numpy as np
import xgboost as xgb
from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import joblib
from sklearn.model_selection import train_test_split

warnings.filterwarnings("ignore")

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Paths
PROJECT_DIR = Path(__file__).parent
CSV_DIR = PROJECT_DIR / "csv"
NOTEBOOK_OUTPUTS_DIR = PROJECT_DIR / "notebooks" / "outputs"
MODELS_DIR = PROJECT_DIR / "models"
MODELS_DIR.mkdir(exist_ok=True)

# Global data storage
data_cache = {
    "accounts": None,
    "features": None,
    "churn": None,
    "predictions": None,
    "model": None,
    "feature_names": None,
    "workflow_log": [],
    "model_trained_at": None,
}


def load_data():
    """Load all CSV files and cache them"""
    try:
        # Load Account table
        accounts = pd.read_csv(CSV_DIR / "Account.csv")
        print(f"✅ Loaded {len(accounts)} accounts")

        # Load features (which includes account_external_id for joining)
        features = pd.read_csv(NOTEBOOK_OUTPUTS_DIR / "step_02_features.csv")
        print(f"✅ Loaded {len(features)} features")

        # Merge accounts with features
        merged = accounts.merge(
            features, left_on="account_external_id", right_on="account_external_id", how="left"
        )
        print(f"✅ Merged data shape: {merged.shape}")

        # Load Churn predictions
        churn_path = NOTEBOOK_OUTPUTS_DIR / "step_08_churn_output.csv"
        churn = None
        if churn_path.exists():
            churn = pd.read_csv(churn_path)
            churn = churn.rename(columns={"ID zákazníka": "account_external_id"})
            # Translate Czech columns to standard English fields for UI usability
            churn = churn.rename(columns={
                "P(churn)": "churn_probability",
                "Churn Risk": "churn_risk",
                "priorita": "churn_priority"
            })
            
            # Map Czech cell values to English
            if "churn_risk" in churn.columns:
                churn["churn_risk"] = churn["churn_risk"].map({
                    "Vysoké": "High",
                    "Střední": "Medium",
                    "Nízké": "Low"
                }).fillna(churn["churn_risk"])
                
            if "churn_priority" in churn.columns:
                churn["churn_priority"] = churn["churn_priority"].map({
                    "🔴 Okamžitá retence": "Immediate Retention",
                    "🟡 Cílená kampaň": "Targeted Campaign",
                    "🟢 Udržet": "Maintain"
                }).fillna(churn["churn_priority"])

            # Filter to only relevant columns for merge
            churn_cols = ["account_external_id", "churn_probability", "churn_risk", "churn_priority"]
            churn = churn[[c for c in churn.columns if c in churn_cols]].copy()
            merged = merged.merge(churn, on="account_external_id", how="left")
            print(f"✅ Merged churn data shape: {merged.shape}")

        data_cache["accounts"] = accounts
        data_cache["features"] = features
        data_cache["churn"] = churn
        
        return merged

    except Exception as e:
        print(f"❌ Error loading data: {e}")
        return None


def train_or_load_model():
    """Load pre-trained XGBoost model or train if not exists"""
    model_path = MODELS_DIR / "xgboost_clv_model.pkl"
    feature_names_path = MODELS_DIR / "feature_names.pkl"

    try:
        if model_path.exists():
            # Load pre-trained model
            with open(model_path, "rb") as f:
                model = pickle.load(f)
            with open(feature_names_path, "rb") as f:
                feature_names = pickle.load(f)
            print("✅ Loaded pre-trained model from disk")
            # Record training timestamp from file modification time
            import os as _os
            from datetime import datetime as _dt
            mtime = _os.path.getmtime(model_path)
            data_cache["model_trained_at"] = _dt.fromtimestamp(mtime).isoformat()
            return model, feature_names

        else:
            # Train model from the original features
            print("🔄 Training XGBoost model...")
            df_train = pd.read_csv(NOTEBOOK_OUTPUTS_DIR / "step_02_features.csv")

            # Prepare data
            DROP_COLS = ["account_external_id", "loyalty_tier_label", "clv_2025"]
            FEATURE_COLS = [c for c in df_train.columns if c not in DROP_COLS]
            TARGET_COL = "clv_2025"

            X = df_train[FEATURE_COLS].copy()
            y = df_train[TARGET_COL].copy()

            # Winsorize trend features before train_test_split (matching notebook behavior)
            WINSOR_QUANTILE = 0.99
            TREND_COLS = ["spend_trend_2y", "spend_trend_1y"]
            for col in TREND_COLS:
                if col in X.columns:
                    cap = X[col].quantile(WINSOR_QUANTILE)
                    X[col] = X[col].clip(upper=cap)

            # Perform the train-test split (80% train, 20% test, random_state=42)
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42
            )

            # Train XGBoost with best parameters from notebook's GridSearchCV (learning_rate=0.05)
            model = xgb.XGBRegressor(
                n_estimators=300,
                max_depth=6,
                learning_rate=0.05,
                subsample=0.9,
                colsample_bytree=0.7,
                random_state=42,
                n_jobs=-1,
                verbosity=0,
                eval_metric="mae",
            )
            model.fit(X_train, y_train)
            from datetime import datetime as _dt2
            data_cache["model_trained_at"] = _dt2.now().isoformat()

            # Save model and feature names
            with open(model_path, "wb") as f:
                pickle.dump(model, f)
            with open(feature_names_path, "wb") as f:
                pickle.dump(FEATURE_COLS, f)

            print("✅ Model trained and saved")
            return model, FEATURE_COLS

    except Exception as e:
        print(f"❌ Error with model: {e}")
        return None, None


@app.route("/")
def index():
    """Main page"""
    return render_template("index.html")


@app.route("/api/accounts", methods=["GET"])
def get_accounts():
    """Get account data with predictions if available"""
    try:
        if data_cache["accounts"] is None:
            merged_data = load_data()
        else:
            # Merge fresh data
            accounts = data_cache["accounts"]
            features = data_cache["features"]
            merged_data = accounts.merge(
                features, left_on="account_external_id", right_on="account_external_id", how="left"
            )
            if data_cache["churn"] is not None:
                merged_data = merged_data.merge(
                    data_cache["churn"], on="account_external_id", how="left"
                )

        # Add predictions if available
        if data_cache["predictions"] is not None:
            # Select only the necessary prediction columns
            pred_cols = ["account_external_id", "clv_2025_predicted", "prediction_diff", 
                        "prediction_diff_pct", "suggested_tier", "actual_tier", "tier_correct"]
            predictions_to_merge = data_cache["predictions"][pred_cols].copy()
            
            merged_data = merged_data.merge(
                predictions_to_merge,
                on="account_external_id",
                how="left",
            )

        # Convert to JSON-serializable format
        result = merged_data.to_dict(orient="records")

        # Handle NaN and Inf values
        for record in result:
            for key, value in record.items():
                if pd.isna(value):
                    record[key] = None
                elif isinstance(value, (np.integer, np.floating)):
                    if np.isinf(value):
                        record[key] = None
                    else:
                        record[key] = float(value)
                elif isinstance(value, (bool, np.bool_)):
                    record[key] = bool(value)

        return jsonify({"success": True, "data": result})

    except Exception as e:
        print(f"❌ Error in get_accounts: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


def get_loyalty_tier(clv_value):
    """Determine loyalty tier based on predicted CLV value
    
    Thresholds:
    - Bronze: CLV < $5,000 (non-buyers or low spenders)
    - Silver: CLV $5,000-$25,000 (mid-tier spenders) 
    - Gold: CLV ≥ $25,000 (high-value customers)
    """
    if pd.isna(clv_value) or clv_value is None:
        return "Unknown"
    if clv_value >= 25000:
        return "Gold"
    elif clv_value >= 5000:
        return "Silver"
    else:
        return "Bronze"


@app.route("/api/predict", methods=["POST"])
def predict():
    """Run XGBoost model and generate predictions"""
    try:
        print("🔄 Starting prediction process...")

        # Load model
        if data_cache["model"] is None:
            model, feature_names = train_or_load_model()
            data_cache["model"] = model
            data_cache["feature_names"] = feature_names
        else:
            model = data_cache["model"]
            feature_names = data_cache["feature_names"]

        if model is None:
            return jsonify({"success": False, "error": "Model loading failed"}), 500

        # Load features data
        df = pd.read_csv(NOTEBOOK_OUTPUTS_DIR / "step_02_features.csv")
        X = df[feature_names].copy()

        # Handle missing values - fill with median
        for col in X.columns:
            if X[col].isna().any():
                median_val = X[col].median()
                X[col].fillna(median_val, inplace=True)
                print(f"  Filled {X[col].isna().sum()} NaN values in {col} with median {median_val:.2f}")

        # Winsorize trend features
        WINSOR_QUANTILE = 0.99
        TREND_COLS = ["spend_trend_2y", "spend_trend_1y"]
        for col in TREND_COLS:
            if col in X.columns:
                cap = X[col].quantile(WINSOR_QUANTILE)
                X[col] = X[col].clip(upper=cap)

        # Generate predictions
        predictions_raw = model.predict(X)
        predictions = predictions_raw  # Keep raw predictions (allow negative CLV values)

        # Handle any remaining NaN values in predictions
        predictions = np.where(np.isnan(predictions), 0, predictions)

        # Risk-adjust predicted CLV using churn probability to align loyalty tiers and churn risk
        churn_path = NOTEBOOK_OUTPUTS_DIR / "step_08_churn_output.csv"
        if churn_path.exists():
            churn_df = pd.read_csv(churn_path)
            churn_df = churn_df.rename(columns={
                "ID zákazníka": "account_external_id",
                "P(churn)": "churn_probability"
            })
            churn_df = churn_df[["account_external_id", "churn_probability"]].copy()
            # Align with the same account external IDs in the current features DataFrame
            merged_temp = df[["account_external_id"]].merge(churn_df, on="account_external_id", how="left")
            churn_probs = merged_temp["churn_probability"].fillna(0).values
            predictions = predictions * (1.0 - churn_probs)

        # Calculate suggested loyalty tiers (only for valid predictions)
        suggested_tiers = []
        for pred in predictions:
            if pd.isna(pred):
                # If prediction is NaN (invalid), mark as "Unknown"
                suggested_tiers.append("Unknown")
            else:
                # Valid prediction - map to tier (including 0 → Bronze)
                suggested_tiers.append(get_loyalty_tier(pred))
        
        actual_tiers = df["loyalty_tier_label"].values if "loyalty_tier_label" in df.columns else ["Unknown"] * len(df)

        # Calculate percentage difference, handling division by zero
        actual_clv = df["clv_2025"].values
        prediction_diff = predictions - actual_clv
        prediction_diff_pct = []
        for i, (pred, actual) in enumerate(zip(predictions, actual_clv)):
            if pd.isna(pred) or pd.isna(actual) or actual <= 0:
                # Can't calculate percentage if actual is 0, NaN, or negative
                prediction_diff_pct.append(None)
            else:
                pct = ((pred - actual) / actual) * 100
                prediction_diff_pct.append(pct)

        # Check if tier suggestion matches actual tier
        tier_match = [suggested_tiers[i] == str(actual_tiers[i]) for i in range(len(suggested_tiers))]

        # Create predictions dataframe
        predictions_df = pd.DataFrame({
            "account_external_id": df["account_external_id"].values,
            "clv_2025_actual": df["clv_2025"].values,
            "clv_2025_predicted": predictions,
            "prediction_diff": prediction_diff,
            "prediction_diff_pct": prediction_diff_pct,
            "suggested_tier": suggested_tiers,
            "actual_tier": actual_tiers,
            "tier_correct": tier_match,
        })

        # Cache predictions
        data_cache["predictions"] = predictions_df

        # Perform train-test split for metrics evaluation to match the notebook's test metrics
        X_train, X_test, y_train, y_test = train_test_split(
            X, df["clv_2025"], test_size=0.2, random_state=42
        )
        y_pred_test = np.maximum(model.predict(X_test), 0)
        mae = float(np.mean(np.abs(y_pred_test - y_test.values)))
        rmse = float(np.sqrt(np.mean((y_pred_test - y_test.values) ** 2)))

        # Calculate cohort averages (CLV by acquisition quarter)
        cohort_data = []
        accounts_df = data_cache["accounts"]
        if accounts_df is not None:
            cohort_df = predictions_df.merge(
                accounts_df[["account_external_id", "customer_since"]], 
                on="account_external_id", 
                how="left"
            )
            cohort_df["customer_since_dt"] = pd.to_datetime(cohort_df["customer_since"], errors="coerce")
            cohort_df = cohort_df.dropna(subset=["customer_since_dt"])
            cohort_df["cohort_period"] = cohort_df["customer_since_dt"].dt.to_period("Q")
            cohort_stats = cohort_df.groupby("cohort_period")["clv_2025_predicted"].mean().reset_index()
            cohort_stats = cohort_stats.sort_values("cohort_period")
            cohort_stats["cohort"] = cohort_stats["cohort_period"].apply(lambda r: f"Q{r.quarter} {r.year}")
            cohort_data = cohort_stats[["cohort", "clv_2025_predicted"]].to_dict(orient="records")

        # Yearly spend aggregates for comparison trends
        total_spend_2022 = float(df["spend_2022"].sum())
        total_spend_2023 = float(df["spend_2023"].sum())
        total_spend_2024 = float(df["spend_2024"].sum())
        total_clv_2025_actual = float(predictions_df["clv_2025_actual"].sum())
        total_clv_2025_predicted = float(predictions_df["clv_2025_predicted"].sum())
        
        yearly_history = {
            "2022": total_spend_2022,
            "2023": total_spend_2023,
            "2024": total_spend_2024,
            "2025_Actual": total_clv_2025_actual,
            "2025_Predicted": total_clv_2025_predicted
        }

        # Calculate average predicted churn rate from churn_probs if loaded
        predicted_churn_rate = float(np.mean(churn_probs)) if 'churn_probs' in locals() else 0.0

        # Get stats
        tier_accuracy = (predictions_df["tier_correct"].sum() / len(predictions_df)) * 100
        stats = {
            "total_predictions": len(predictions),
            "mean_actual_clv": float(predictions_df["clv_2025_actual"].mean()),
            "mean_predicted_clv": float(predictions_df["clv_2025_predicted"].mean()),
            "total_actual_clv": float(predictions_df["clv_2025_actual"].sum()),
            "total_predicted_clv": float(predictions_df["clv_2025_predicted"].sum()),
            "mae": mae,
            "rmse": rmse,
            "max_diff": float(predictions_df["prediction_diff"].max()),
            "min_diff": float(predictions_df["prediction_diff"].min()),
            "tier_accuracy": float(tier_accuracy),
            "correct_tiers": int(predictions_df["tier_correct"].sum()),
            "total_predictions_tier": len(predictions_df),
            "cohort_data": cohort_data,
            "yearly_history": yearly_history,
            "predicted_churn_rate": predicted_churn_rate,
        }

        print("✅ Predictions completed!")
        print(f"   Mean Actual CLV: {stats['mean_actual_clv']:,.0f}")
        print(f"   Mean Predicted CLV: {stats['mean_predicted_clv']:,.0f}")
        print(f"   MAE: {stats['mae']:,.0f}")
        print(f"   Tier Accuracy: {stats['tier_accuracy']:.1f}%")

        return jsonify({"success": True, "stats": stats})

    except Exception as e:
        print(f"❌ Error in predict: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/stats", methods=["GET"])
def get_stats():
    """Get current statistics"""
    try:
        if data_cache["predictions"] is None:
            return jsonify({"success": False, "error": "No predictions available"}), 400

        predictions_df = data_cache["predictions"]

        # Load features data to get the test split indices
        df = pd.read_csv(NOTEBOOK_OUTPUTS_DIR / "step_02_features.csv")
        _, _, _, y_test = train_test_split(df["clv_2025"], test_size=0.2, random_state=42)
        test_indices = y_test.index

        # Slice predictions to test set for MAE calculation
        test_preds = predictions_df.loc[test_indices]

        # Calculate cohort averages (CLV by acquisition quarter)
        cohort_data = []
        accounts_df = data_cache["accounts"]
        if accounts_df is not None:
            cohort_df = predictions_df.merge(
                accounts_df[["account_external_id", "customer_since"]], 
                on="account_external_id", 
                how="left"
            )
            cohort_df["customer_since_dt"] = pd.to_datetime(cohort_df["customer_since"], errors="coerce")
            cohort_df = cohort_df.dropna(subset=["customer_since_dt"])
            cohort_df["cohort_period"] = cohort_df["customer_since_dt"].dt.to_period("Q")
            cohort_stats = cohort_df.groupby("cohort_period")["clv_2025_predicted"].mean().reset_index()
            cohort_stats = cohort_stats.sort_values("cohort_period")
            cohort_stats["cohort"] = cohort_stats["cohort_period"].apply(lambda r: f"Q{r.quarter} {r.year}")
            cohort_data = cohort_stats[["cohort", "clv_2025_predicted"]].to_dict(orient="records")

        # Yearly spend aggregates for comparison trends
        total_spend_2022 = float(df["spend_2022"].sum())
        total_spend_2023 = float(df["spend_2023"].sum())
        total_spend_2024 = float(df["spend_2024"].sum())
        total_clv_2025_actual = float(predictions_df["clv_2025_actual"].sum())
        total_clv_2025_predicted = float(predictions_df["clv_2025_predicted"].sum())
        
        yearly_history = {
            "2022": total_spend_2022,
            "2023": total_spend_2023,
            "2024": total_spend_2024,
            "2025_Actual": total_clv_2025_actual,
            "2025_Predicted": total_clv_2025_predicted
        }

        # Calculate average predicted churn rate from churn cache
        churn_df = data_cache["churn"]
        if churn_df is not None and "churn_probability" in churn_df.columns:
            predicted_churn_rate = float(churn_df["churn_probability"].fillna(0).mean())
        else:
            predicted_churn_rate = 0.0

        # Calculate tier accuracy
        tier_accuracy = float((predictions_df["tier_correct"].sum() / len(predictions_df)) * 100) if len(predictions_df) > 0 else 0.0

        stats = {
            "total_predictions": len(predictions_df),
            "mean_actual_clv": float(predictions_df["clv_2025_actual"].mean()),
            "mean_predicted_clv": float(predictions_df["clv_2025_predicted"].mean()),
            "total_actual_clv": float(predictions_df["clv_2025_actual"].sum()),
            "total_predicted_clv": float(predictions_df["clv_2025_predicted"].sum()),
            "mae": float(np.mean(np.abs(
                test_preds["clv_2025_predicted"] - test_preds["clv_2025_actual"]
            ))),
            "max_diff": float(predictions_df["prediction_diff"].max()),
            "min_diff": float(predictions_df["prediction_diff"].min()),
            "tier_accuracy": tier_accuracy,
            "cohort_data": cohort_data,
            "yearly_history": yearly_history,
            "predicted_churn_rate": predicted_churn_rate,
        }
        return jsonify({"success": True, "stats": stats})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/export", methods=["GET"])
def export_predictions():
    """Export predictions to CSV"""
    try:
        if data_cache["predictions"] is None:
            return jsonify({"success": False, "error": "No predictions available"}), 400

        # Save predictions
        output_path = PROJECT_DIR / "outputs" / "clv_predictions_export.csv"
        output_path.parent.mkdir(exist_ok=True)
        data_cache["predictions"].to_csv(output_path, index=False)

        return jsonify({
            "success": True,
            "message": f"Predictions exported to {output_path}"
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/simulate", methods=["POST"])
def simulate():
    """Simulate a customer's CLV based on modified behavioral features"""
    try:
        payload = request.json
        account_id = payload.get("account_external_id")
        if not account_id:
            return jsonify({"success": False, "error": "Missing account_external_id"}), 400

        # Load model
        if data_cache["model"] is None:
            model, feature_names = train_or_load_model()
            data_cache["model"] = model
            data_cache["feature_names"] = feature_names
        else:
            model = data_cache["model"]
            feature_names = data_cache["feature_names"]

        if model is None:
            return jsonify({"success": False, "error": "Model not loaded"}), 500

        # Load features data
        df = pd.read_csv(NOTEBOOK_OUTPUTS_DIR / "step_02_features.csv")
        customer_row = df[df["account_external_id"] == account_id]
        if customer_row.empty:
            return jsonify({"success": False, "error": f"Customer features not found for ID: {account_id}"}), 404

        # Extract features for prediction
        X_cust = customer_row[feature_names].copy()

        # Handle any missing values in this row using column medians
        for col in X_cust.columns:
            if X_cust[col].isna().any():
                X_cust[col].fillna(df[col].median(), inplace=True)

        # Overwrite with simulated features from payload
        simulated_updates = {}
        # Keys that the user can simulate
        actionable_keys = [
            "app_usage_score", "email_open_rate", "frequency", 
            "recency_days", "spend_trend_1y", "spend_trend_2y",
            "tenure_days", "avg_discount_pct"
        ]
        for key in actionable_keys:
            if key in payload and payload[key] is not None:
                val = float(payload[key])
                # Special handling for email open rate: UI passes 0-100 scale, but model needs 0-1 scale
                if key == "email_open_rate" and val > 1.0:
                    val = val / 100.0
                X_cust[key] = val
                simulated_updates[key] = val

        # Winsorize trend features matching training behavior
        WINSOR_QUANTILE = 0.99
        TREND_COLS = ["spend_trend_2y", "spend_trend_1y"]
        for col in TREND_COLS:
            if col in X_cust.columns:
                cap = df[col].quantile(WINSOR_QUANTILE)
                X_cust[col] = X_cust[col].clip(upper=cap)

        # Predict
        pred_raw = model.predict(X_cust)[0]
        
        # Risk-adjust simulated CLV using customer's churn probability
        churn_prob = 0.0
        churn_path = NOTEBOOK_OUTPUTS_DIR / "step_08_churn_output.csv"
        if churn_path.exists():
            churn_df = pd.read_csv(churn_path)
            churn_cust = churn_df[churn_df["ID zákazníka"] == account_id]
            if not churn_cust.empty:
                churn_prob = float(churn_cust["P(churn)"].fillna(0).values[0])
                
        simulated_clv = float(pred_raw) * (1.0 - churn_prob)

        return jsonify({
            "success": True,
            "account_external_id": account_id,
            "simulated_clv": simulated_clv,
            "simulated_updates": simulated_updates
        })

    except Exception as e:
        print(f"❌ Error in simulate: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


# =============================================================================
# NEW ENDPOINTS: Segments, XAI, Retrain, Workflow, Model Status
# =============================================================================

@app.route("/api/segments", methods=["GET"])
def get_segments():
    """Compute named RFM+CLV customer segments from predictions + features."""
    try:
        if data_cache["predictions"] is None:
            return jsonify({"success": False, "error": "No predictions available. Run the model first."}), 400

        predictions_df = data_cache["predictions"]
        features_df = pd.read_csv(NOTEBOOK_OUTPUTS_DIR / "step_02_features.csv")

        # Columns we need from features
        feat_cols = ["account_external_id", "frequency", "recency_days",
                     "monetary_total", "spend_trend_1y", "app_usage_score", "email_open_rate"]
        feat_cols = [c for c in feat_cols if c in features_df.columns]
        df = predictions_df.merge(features_df[feat_cols], on="account_external_id", how="left")

        # Merge churn risk
        if data_cache["churn"] is not None:
            churn = data_cache["churn"]
            churn_cols = ["account_external_id", "churn_risk", "churn_probability"]
            churn_cols = [c for c in churn_cols if c in churn.columns]
            df = df.merge(churn[churn_cols], on="account_external_id", how="left")
        else:
            df["churn_risk"] = "Unknown"
            df["churn_probability"] = 0.0

        median_frequency = float(features_df["frequency"].median()) if "frequency" in features_df.columns else 3.0
        median_monetary  = float(features_df["monetary_total"].median()) if "monetary_total" in features_df.columns else 0.0

        buckets = {k: [] for k in ["champions", "high_value_at_risk", "loyal_mid_tier",
                                    "dormant_high_potential", "growing_new"]}

        for _, row in df.iterrows():
            account_id   = row.get("account_external_id", "")
            account_id   = "" if pd.isna(account_id) else str(account_id)

            tier         = row.get("suggested_tier", "Unknown")
            tier         = "Unknown" if pd.isna(tier) else str(tier)

            churn_risk   = row.get("churn_risk", "Unknown")
            churn_risk   = "Unknown" if pd.isna(churn_risk) else str(churn_risk)

            frequency    = row.get("frequency", 0)
            frequency    = 0.0 if pd.isna(frequency) else float(frequency)

            recency      = row.get("recency_days", 999)
            recency      = 999.0 if pd.isna(recency) else float(recency)

            monetary     = row.get("monetary_total", 0)
            monetary     = 0.0 if pd.isna(monetary) else float(monetary)

            trend_1y     = row.get("spend_trend_1y", 0)
            trend_1y     = 0.0 if pd.isna(trend_1y) else float(trend_1y)

            pred_clv     = row.get("clv_2025_predicted", 0)
            pred_clv     = 0.0 if pd.isna(pred_clv) else float(pred_clv)

            record = {
                "account_external_id": str(account_id),
                "predicted_clv": round(pred_clv, 2),
                "churn_risk": churn_risk,
            }

            # Priority: first matching bucket wins
            if tier == "Gold" and churn_risk == "Low" and frequency > median_frequency and recency < 180:
                buckets["champions"].append(record)
            elif tier in ["Gold", "Silver"] and churn_risk in ["High", "Medium"]:
                buckets["high_value_at_risk"].append(record)
            elif tier in ["Silver", "Bronze"] and churn_risk == "Low" and frequency >= 2:
                buckets["loyal_mid_tier"].append(record)
            elif monetary > median_monetary and recency > 180:
                buckets["dormant_high_potential"].append(record)
            elif trend_1y > 20 and pred_clv > 0:
                buckets["growing_new"].append(record)
            # Unclassified accounts fall through

        def summarise(members):
            if not members:
                return {"count": 0, "avg_clv": 0, "total_clv": 0, "members": []}
            clvs = [m["predicted_clv"] for m in members]
            return {
                "count": len(members),
                "avg_clv": round(float(np.mean(clvs)), 2),
                "total_clv": round(float(np.sum(clvs)), 2),
                "members": members[:100],
            }

        result = {key: summarise(members) for key, members in buckets.items()}
        return jsonify({"success": True, "segments": result})

    except Exception as e:
        print(f"❌ Error in get_segments: {e}")
        import traceback; traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/explain/<account_id>", methods=["GET"])
def explain_account(account_id):
    """Return top-3 feature-level CLV drivers for a specific account (approximated XAI)."""
    try:
        if data_cache["model"] is None:
            return jsonify({"success": False, "error": "Model not loaded"}), 400

        model        = data_cache["model"]
        feature_names = data_cache.get("feature_names") or []
        if not feature_names or not hasattr(model, "feature_importances_"):
            return jsonify({"success": False, "error": "Feature importances unavailable"}), 400

        df = pd.read_csv(NOTEBOOK_OUTPUTS_DIR / "step_02_features.csv")
        customer_row = df[df["account_external_id"] == account_id]
        if customer_row.empty:
            return jsonify({"success": False, "error": f"Account {account_id} not found"}), 404

        X_all  = df[feature_names].copy()
        X_cust = customer_row[feature_names].copy()
        for col in feature_names:
            med = X_all[col].median()
            if pd.isna(X_cust[col].iloc[0]):
                X_cust[col] = med

        medians     = X_all.median()
        stds        = X_all.std().replace(0, 1)
        importances = model.feature_importances_

        # Features where higher value generally means higher CLV
        positive_features = {
            "spend_2024", "spend_2023", "spend_2022", "monetary_total",
            "frequency", "app_usage_score", "email_open_rate",
            "spend_trend_1y", "spend_trend_2y", "tenure_days", "login_count_90d"
        }
        LABELS = {
            "spend_2024": "2024 Annual Spend",
            "spend_2023": "2023 Annual Spend",
            "spend_2022": "2022 Annual Spend",
            "monetary_total": "Total Historical Spend",
            "frequency": "Purchase Frequency",
            "app_usage_score": "Mobile App Engagement",
            "email_open_rate": "Email Open Rate",
            "spend_trend_1y": "1-Year Spend Trend",
            "spend_trend_2y": "2-Year Spend Trend",
            "tenure_days": "Account Tenure",
            "recency_days": "Purchase Recency",
            "login_count_90d": "Recent Login Activity",
            "avg_discount_pct": "Avg Discount Used",
        }

        contributions = []
        for i, feat in enumerate(feature_names):
            cust_val = float(X_cust[feat].iloc[0])
            med_val  = float(medians[feat])
            std_val  = float(stds[feat])
            imp      = float(importances[i])
            z_score  = (cust_val - med_val) / std_val

            is_pos = feat in positive_features
            direction = "positive" if (is_pos and z_score > 0) or (not is_pos and z_score < 0) else "negative"
            score  = imp * abs(z_score)

            label = LABELS.get(feat, feat.replace("_", " ").title())

            if any(k in feat for k in ["spend", "monetary"]):
                dv, dm = f"${cust_val:,.0f}", f"${med_val:,.0f}"
            elif "rate" in feat:
                dv, dm = f"{cust_val*100:.0f}%", f"{med_val*100:.0f}%"
            elif "days" in feat:
                dv, dm = f"{cust_val:.0f} days", f"{med_val:.0f} days"
            elif "score" in feat:
                dv, dm = f"{cust_val:.0f}/100", f"{med_val:.0f}/100"
            elif "trend" in feat:
                dv, dm = f"{cust_val:+.0f}%", f"{med_val:+.0f}%"
            else:
                dv, dm = f"{cust_val:.1f}", f"{med_val:.1f}"

            contributions.append({
                "feature": feat, "label": label, "score": score,
                "direction": direction,
                "customer_value": dv, "median_value": dm,
                "z_score": round(z_score, 2),
            })

        contributions.sort(key=lambda x: x["score"], reverse=True)
        return jsonify({"success": True, "account_id": account_id, "explanations": contributions[:3]})

    except Exception as e:
        print(f"❌ Error in explain_account: {e}")
        import traceback; traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/retrain", methods=["POST"])
def retrain_model():
    """Force model retraining: delete cached pkl and retrain from scratch."""
    try:
        model_path = MODELS_DIR / "xgboost_clv_model.pkl"
        feature_names_path = MODELS_DIR / "feature_names.pkl"
        if model_path.exists():        model_path.unlink()
        if feature_names_path.exists(): feature_names_path.unlink()

        data_cache["model"] = None
        data_cache["feature_names"] = None

        model, feature_names = train_or_load_model()
        data_cache["model"]        = model
        data_cache["feature_names"] = feature_names

        if model is None:
            return jsonify({"success": False, "error": "Model training failed"}), 500

        # Compute test-set MAE to return to UI
        df_train = pd.read_csv(NOTEBOOK_OUTPUTS_DIR / "step_02_features.csv")
        DROP_COLS  = ["account_external_id", "loyalty_tier_label", "clv_2025"]
        FEAT_COLS  = [c for c in df_train.columns if c not in DROP_COLS]
        X_tmp = df_train[FEAT_COLS].copy()
        y_tmp = df_train["clv_2025"].copy()
        for col in ["spend_trend_2y", "spend_trend_1y"]:
            if col in X_tmp.columns:
                X_tmp[col] = X_tmp[col].clip(upper=X_tmp[col].quantile(0.99))
        _, X_test, _, y_test = train_test_split(X_tmp, y_tmp, test_size=0.2, random_state=42)
        mae = float(np.mean(np.abs(np.maximum(model.predict(X_test), 0) - y_test.values)))

        return jsonify({
            "success": True,
            "message": "Model retrained successfully",
            "trained_at": data_cache["model_trained_at"],
            "mae": mae,
        })

    except Exception as e:
        print(f"❌ Error in retrain_model: {e}")
        import traceback; traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/workflow", methods=["POST"])
def log_workflow_action():
    """Log a triggered workflow action (task creation, campaign enrolment, etc.)."""
    try:
        from datetime import datetime as _dtw
        payload      = request.json or {}
        entry = {
            "timestamp":    _dtw.now().strftime("%Y-%m-%d %H:%M:%S"),
            "account_id":   payload.get("account_id", "—"),
            "account_name": payload.get("account_name", "—"),
            "action_type":  payload.get("action_type", "—"),
            "notes":        payload.get("notes", ""),
        }
        data_cache["workflow_log"].insert(0, entry)
        data_cache["workflow_log"] = data_cache["workflow_log"][:200]  # cap
        return jsonify({"success": True, "entry": entry})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/workflow/log", methods=["GET"])
def get_workflow_log():
    """Return the in-memory workflow action log."""
    return jsonify({"success": True, "log": data_cache["workflow_log"]})


@app.route("/api/model/status", methods=["GET"])
def get_model_status():
    """Return model training status and current data snapshot (drift indicator)."""
    try:
        from datetime import datetime as _dts
        import os as _osm
        model_path  = MODELS_DIR / "xgboost_clv_model.pkl"
        trained_at  = data_cache.get("model_trained_at")
        if not trained_at and model_path.exists():
            trained_at = _dts.fromtimestamp(_osm.path.getmtime(model_path)).isoformat()

        drift = []
        if data_cache["features"] is not None:
            f = data_cache["features"]
            for col, label, fmt in [
                ("spend_2024",   "Avg 2024 Spend",   lambda v: f"${v:,.0f}"),
                ("recency_days", "Avg Recency",       lambda v: f"{v:.0f} days"),
                ("frequency",    "Avg Freq (orders)", lambda v: f"{v:.1f}"),
                ("app_usage_score", "Avg App Score",  lambda v: f"{v:.0f}/100"),
            ]:
                if col in f.columns:
                    drift.append({"metric": label, "value": fmt(float(f[col].mean()))})

        return jsonify({
            "success": True,
            "model_loaded": data_cache["model"] is not None,
            "trained_at":   trained_at,
            "drift_indicators": drift,
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == "__main__":
    print("=" * 50)
    print("CLV Prediction Web Application")
    print("=" * 50)
    
    # Load initial data
    print("Loading data...")
    load_data()
    
    # Start Flask app
    print("\n🚀 Starting Flask app on http://localhost:5000")
    print("Press Ctrl+C to stop")
    app.run(debug=True, host="localhost", port=5000)
