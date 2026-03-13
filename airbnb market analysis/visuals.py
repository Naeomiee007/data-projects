import sqlite3
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path

# -----------------------------
# Setup
# -----------------------------
DB_PATH = "airbnb.db"
OUTPUT_DIR = Path("outputs")
OUTPUT_DIR.mkdir(exist_ok=True)

# Airbnb inspired classy palette
AIRBNB_RED = "#FF5A5F"
AIRBNB_DARK = "#2D2D2D"
AIRBNB_SOFT = "#767676"
AIRBNB_LIGHT = "#F7F7F7"
AIRBNB_PINK = "#FFB3B6"
AIRBNB_DEEP = "#C81D25"

plt.rcParams["figure.figsize"] = (12, 7)
plt.rcParams["axes.facecolor"] = "white"
plt.rcParams["figure.facecolor"] = "white"
plt.rcParams["axes.edgecolor"] = "#DDDDDD"
plt.rcParams["axes.labelcolor"] = AIRBNB_DARK
plt.rcParams["xtick.color"] = AIRBNB_DARK
plt.rcParams["ytick.color"] = AIRBNB_DARK
plt.rcParams["text.color"] = AIRBNB_DARK
plt.rcParams["font.size"] = 11

conn = sqlite3.connect(DB_PATH)

# -----------------------------
# 1. Host type distribution chart
# -----------------------------
host_type_query = """
SELECT
    market,
    CASE
        WHEN calculated_host_listings_count = 1 THEN 'Individual Host'
        WHEN calculated_host_listings_count BETWEEN 2 AND 5 THEN 'Small Multi Listing Host'
        ELSE 'Commercial Host'
    END AS host_type,
    COUNT(*) AS listings
FROM airbnb_listings
GROUP BY market, host_type
ORDER BY market, listings DESC;
"""

df_host_type = pd.read_sql_query(host_type_query, conn)

pivot_host_type = df_host_type.pivot(
    index="host_type",
    columns="market",
    values="listings"
).fillna(0)

host_order = ["Individual Host", "Small Multi Listing Host", "Commercial Host"]
pivot_host_type = pivot_host_type.reindex(host_order)

ax = pivot_host_type.plot(
    kind="bar",
    color=[AIRBNB_RED, AIRBNB_PINK],
    width=0.75,
    edgecolor="none"
)

plt.title("Host Type Distribution by Market", fontsize=18, weight="bold", pad=18)
plt.xlabel("")
plt.ylabel("Number of Listings")
plt.xticks(rotation=0)
plt.grid(axis="y", linestyle=":", alpha=0.35)

for container in ax.containers:
    ax.bar_label(container, fmt="%.0f", padding=3, fontsize=10)

plt.legend(title="Market", frameon=False)
plt.tight_layout()
plt.savefig(OUTPUT_DIR / "host_type_distribution.png", dpi=300, bbox_inches="tight")
plt.close()

# -----------------------------
# 2. Listings per host histogram
# -----------------------------
hist_query = """
SELECT
    market,
    calculated_host_listings_count
FROM airbnb_listings
WHERE calculated_host_listings_count IS NOT NULL
  AND calculated_host_listings_count <= 100;
"""

df_hist = pd.read_sql_query(hist_query, conn)

fig, ax = plt.subplots()

for market, color in [("LA", AIRBNB_RED), ("NY", AIRBNB_DEEP)]:
    subset = df_hist[df_hist["market"] == market]["calculated_host_listings_count"]
    ax.hist(
        subset,
        bins=30,
        alpha=0.55,
        label=market,
        color=color,
        edgecolor="white"
    )

ax.set_title("Listings per Host Distribution", fontsize=18, weight="bold", pad=18)
ax.set_xlabel("Number of Listings Managed by Host")
ax.set_ylabel("Frequency")
ax.grid(axis="y", linestyle=":", alpha=0.35)
ax.legend(title="Market", frameon=False)

plt.tight_layout()
plt.savefig(OUTPUT_DIR / "listings_per_host_histogram.png", dpi=300, bbox_inches="tight")
plt.close()

# -----------------------------
# 3. NYC vs LA commercialization comparison
# -----------------------------
comparison_query = """
SELECT
    market,
    COUNT(*) AS total_listings,
    COUNT(DISTINCT host_id) AS unique_hosts,
    ROUND(AVG(calculated_host_listings_count), 2) AS avg_listings_per_host,
    MAX(calculated_host_listings_count) AS max_listings_by_one_host
FROM airbnb_listings
GROUP BY market;
"""

df_compare = pd.read_sql_query(comparison_query, conn)

fig, ax = plt.subplots()

bars = ax.bar(
    df_compare["market"],
    df_compare["avg_listings_per_host"],
    color=[AIRBNB_RED, AIRBNB_PINK],
    width=0.55,
    edgecolor="none"
)

ax.set_title("Commercialization Comparison: NYC vs LA", fontsize=18, weight="bold", pad=18)
ax.set_xlabel("")
ax.set_ylabel("Average Listings per Host")
ax.grid(axis="y", linestyle=":", alpha=0.35)

for bar, value in zip(bars, df_compare["avg_listings_per_host"]):
    ax.text(
        bar.get_x() + bar.get_width() / 2,
        bar.get_height() + 1,
        f"{value:.2f}",
        ha="center",
        va="bottom",
        fontsize=11,
        weight="bold"
    )

# Add subtle insight text below each bar
for i, row in df_compare.iterrows():
    ax.text(
        i,
        row["avg_listings_per_host"] * 0.45,
        f"Listings: {row['total_listings']:,}\nHosts: {row['unique_hosts']:,}\nMax Host: {row['max_listings_by_one_host']:,}",
        ha="center",
        va="center",
        fontsize=10,
        color="white",
        weight="bold"
    )

plt.tight_layout()
plt.savefig(OUTPUT_DIR / "commercialization_comparison.png", dpi=300, bbox_inches="tight")
plt.close()

conn.close()

print("Charts created successfully.")