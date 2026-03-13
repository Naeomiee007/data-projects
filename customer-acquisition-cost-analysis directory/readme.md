# Customer Acquisition Cost Optimization Analysis

## Project Overview

This project analyzes customer acquisition performance using the Bank Marketing dataset and builds a marketing budget optimization model.

The analysis combines **Python and Excel** to answer an important business question:

**How should a bank allocate its marketing budget across communication channels to acquire the most customers at the lowest cost?**

Python is used to analyze historical campaign data and calculate performance metrics for each channel. Excel Solver is then used to determine the optimal budget allocation based on those insights.

The goal is to identify the most efficient marketing channel and support better marketing investment decisions.

---

## Dataset

The project uses the **Bank Marketing dataset**, which contains records of marketing campaigns conducted by a Portuguese banking institution.

Each row represents a customer contact during a campaign.

Key variables include:

- Contact channel used to reach the customer
- Number of contact attempts during the campaign
- Duration of the last contact
- Whether the customer subscribed to the offered product

---

## Tools Used

### Python
Used for data preparation and analysis.

Libraries:
- pandas
- matplotlib

### Excel
Used to build the optimization model.

Techniques:
- Solver optimization
- Sensitivity analysis
- Scenario testing

---

## Python Analysis

The Python workflow performs the following steps:

1. Load and explore the dataset
2. Convert the response variable into a binary acquisition indicator
3. Assign cost assumptions to each marketing contact channel
4. Estimate acquisition costs for each customer interaction
5. Summarize channel performance metrics
6. Export prepared data for Excel modeling

The output from Python provides a clear picture of how each marketing channel performs.

---

## Channel Performance Metrics

The analysis evaluates marketing channels using several performance indicators:

**Conversion Rate**
Measures how effectively a channel converts contacts into customers.

**Estimated Customer Acquisition Cost (CAC)**
Measures how expensive it is to acquire a customer through a specific channel.

**Customers per 1000 Spent**
Measures how many customers are acquired relative to marketing spending.

These metrics allow direct comparison between channels.

---

## Key Findings from Python Analysis

- The **cellular channel** shows the strongest overall performance.
- It has the **highest conversion rate**.
- It also has the **lowest estimated customer acquisition cost**.

The **telephone channel** converts customers reasonably well but is significantly more expensive.

The **unknown contact channel** performs the weakest, with a much lower conversion rate compared to the other channels.

These results suggest that **cellular outreach is the most efficient acquisition method** under the current assumptions.

---

## Excel Optimization Model

While Python identifies which channels perform best historically, Excel is used to determine **how marketing resources should be allocated going forward**.

An optimization model is built using **Excel Solver** to distribute the available marketing budget across channels.

The model determines the budget allocation that produces the **highest expected number of acquired customers while respecting budget constraints**.

---

## Sensitivity Analysis

Sensitivity analysis tests how changes in marketing cost assumptions affect the model's outcomes.

The analysis evaluates how increasing the **cost of cellular contact** affects:

- Expected customer acquisition
- Overall marketing efficiency

This helps determine how sensitive the model is to changes in the cost structure of the most efficient channel.

---

## Excel Workbook Structure

| Sheet | Purpose |
|---|---|
| Inputs | Model assumptions and cost parameters |
| Channel Summary | Performance data exported from Python |
| Solver Table | Data preparation for optimization |
| Solver Model | Allocation model used by Solver |
| Summary | Final optimization results |
| Sensitivity Analysis | Impact of changing cost assumptions |
| LTV Analysis | Comparison of CAC and customer lifetime value |

---

## Key Business Insight

Cellular marketing is the **most efficient acquisition channel** because it combines:

- High conversion rate
- Low acquisition cost

The optimization model therefore allocates the **largest share of the marketing budget to the cellular channel** in order to maximize customer acquisition.

Sensitivity analysis shows that the model is particularly sensitive to increases in **cellular contact costs**.

---

## Data Source

[Bank Marketing Dataset — UCI Machine Learning Repository](https://archive-beta.ics.uci.edu/dataset/222/bank%2Bmarketing)
