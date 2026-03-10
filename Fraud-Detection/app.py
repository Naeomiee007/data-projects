import streamlit as st
import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import IsolationForest
import matplotlib.pyplot as plt

st.set_page_config(page_title="Fraud Detection Dashboard", layout="wide")

st.title("Fraud Detection")

df = pd.read_csv("credit_card_fraud.csv")

st.subheader("Dataset Preview")
st.dataframe(df.head())

# clean Previous Transactions
df["Previous Transactions"] = df["Previous Transactions"].replace("3 or more", 3)
df["Previous Transactions"] = pd.to_numeric(df["Previous Transactions"], errors="coerce")
df["Previous Transactions"] = df["Previous Transactions"].fillna(0)

# simple feature engineering
df["High_Amount_Flag"] = (
    df["Transaction Amount"] > df["Transaction Amount"].median()
).astype(int)

df["High_Transaction_Count"] = (
    df["Previous Transactions"] > df["Previous Transactions"].median()
).astype(int)

df["Foreign_Currency_Flag"] = (
    df["Transaction Currency"] != "USD"
).astype(int)

# model data
X = df.drop("Fraud Flag or Label", axis=1)
y = df["Fraud Flag or Label"]
X = X.select_dtypes(include=["number"])

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# train isolation forest
model = IsolationForest(contamination=0.5, random_state=42)
model.fit(X_scaled)

# predictions and scores
predictions = model.predict(X_scaled)
predictions = np.where(predictions == -1, 1, 0)

df["Predicted Fraud"] = predictions
df["Anomaly Score"] = model.decision_function(X_scaled)

# risk levels
df["Risk Level"] = pd.qcut(
    df["Anomaly Score"],
    q=4,
    labels=["High Risk", "Medium Risk", "Low Risk", "Very Low Risk"]
)

# top metrics
col1, col2, col3 = st.columns(3)

col1.metric("Total Transactions", len(df))
col2.metric("Predicted Fraud Cases", int(df["Predicted Fraud"].sum()))
col3.metric("Actual Fraud Cases", int(df["Fraud Flag or Label"].sum()))

# top suspicious transactions
st.subheader("Top Suspicious Transactions")
alerts = df.sort_values("Anomaly Score").head(20)[[
    "Transaction Date and Time",
    "Transaction Amount",
    "Merchant Name",
    "Transaction Currency",
    "Previous Transactions",
    "Fraud Flag or Label",
    "Predicted Fraud",
    "Anomaly Score",
    "Risk Level"
]]
st.dataframe(alerts, use_container_width=True)

# risk level chart
st.subheader("Risk Level Distribution")
risk_counts = df["Risk Level"].value_counts().sort_index()

fig1, ax1 = plt.subplots(figsize=(8, 5))
risk_counts.plot(kind="bar", ax=ax1)
ax1.set_xlabel("Risk Level")
ax1.set_ylabel("Count")
ax1.set_title("Risk Level Distribution")
st.pyplot(fig1)

# scatter plot
st.subheader("Transaction Amount vs Anomaly Score")
fig2, ax2 = plt.subplots(figsize=(10, 6))
ax2.scatter(df["Transaction Amount"], df["Anomaly Score"])
ax2.set_xlabel("Transaction Amount")
ax2.set_ylabel("Anomaly Score")
ax2.set_title("Transaction Amount vs Anomaly Score")
st.pyplot(fig2)
