# Fraud Detection Dashboard

## Overview

This project builds a simple fraud detection system for credit card transactions and presents the results in an interactive Streamlit dashboard.
The goal is to identify suspicious transactions using anomaly detection and allow users to explore the dataset through a web interface.

## Live App

You can access the deployed dashboard here:
https://data-projects-neax4hj7ddqbfb6tmgsq9b.streamlit.app/

## Project Features

* Loads and previews credit card transaction data
* Performs basic data cleaning and feature engineering
* Uses Isolation Forest to detect potential fraud
* Displays results through an interactive Streamlit dashboard

## Technologies Used

* Python
* Pandas
* NumPy
* Scikit-learn
* Streamlit
* Matplotlib

## Project Structure

Fraud-Detection
app.py – Streamlit dashboard application
credit_card_fraud.csv – dataset used for analysis
requirements.txt – Python dependencies
anomaly detection.ipynb – exploratory analysis notebook

## How to Run Locally

1. Clone the repository
2. Install the required libraries
   pip install -r requirements.txt
3. Run the Streamlit app
   streamlit run app.py

## Methodology

The project uses the Isolation Forest algorithm to identify anomalies in transaction patterns.
Transactions that significantly differ from normal behavior are flagged as potential fraud.

## Future Improvements

* Add interactive filters to explore transactions
* Display fraud probability scores
* Improve visualizations for suspicious transactions
* Integrate real-time transaction data

## Author
Naomi Adeniji
