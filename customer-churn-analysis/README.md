# Telecom Customer Churn Analysis

## Project Overview
Customer churn is a major challenge for subscription-based businesses such as telecom providers. Losing customers reduces recurring revenue and increases the cost of acquiring new customers.

This project analyzes telecom customer data to identify patterns that explain why customers leave and to explore strategies companies can use to reduce churn.

The analysis combines SQL exploration, Python-based data analysis, and basic predictive modeling.

---

## Dataset

IBM Telco Customer Churn Dataset

The dataset contains 7,043 customer records and includes:

- customer demographics  
- service subscriptions  
- billing information  
- contract type  
- payment method  
- monthly charges  
- churn status  

Each row represents a telecom customer and whether they left the service.

---

## Tools & Technologies

Python  
SQL  
Pandas  
Matplotlib  
Seaborn  
SQLite  
Jupyter Notebook  

---

## Business Questions

This analysis explores the following key questions:

- What is the overall customer churn rate?  
- Which contract types experience the highest churn?  
- Do customers with shorter tenure churn more frequently?  
- Which payment methods show higher churn risk?  
- How much revenue is potentially at risk due to churn?  
- Can we predict churn using customer data?  

---

## SQL Analysis

SQL queries were used to calculate:

- overall churn rate  
- churn by contract type  
- churn by payment method  
- churn by tenure group  
- revenue at risk from churned customers  

Example query used in the analysis:

SELECT
Contract,
COUNT(*) AS total_customers,
SUM(CASE WHEN Churn = 'Yes' THEN 1 ELSE 0 END) AS churned_customers
FROM churn_data
GROUP BY Contract;

---

## Machine Learning Model

A simple Logistic Regression model was implemented to predict customer churn.

Features used:

- tenure
- monthly charges

The model predicts whether a customer is likely to churn based on these factors.

Example evaluation metric:

Accuracy ≈ 79%

---

## Key Insights

- Month-to-month contracts have the highest churn risk.
- Customers within their first year are more likely to churn.
- Customers with higher monthly charges show higher churn probability.
- Contract structure plays a major role in retention.

---

## Business Recommendations

Based on the analysis, telecom companies could reduce churn by:

- offering incentives for longer-term contracts
- improving onboarding for new customers
- targeting high-risk customers with retention offers
- reviewing pricing structures for high-cost plans



