import pandas as pd
from vector_store import add

# 1. Load datasets
daily_production_df = pd.read_parquet("./data/daily_production.parquet", columns=["uwi", "production_date", "oil_produced_m3", "water_produced_m3", "pump_efficiency_pct", "pcp_pump_rpm", "pcp_pump_rod_torque_ftlb"])
production_failures_df = pd.read_parquet("./data/production_failures.parquet")
well_jobs_df = pd.read_parquet("./data/well_jobs.parquet")


# 2. Clean datasets

for df in [daily_production_df, production_failures_df, well_jobs_df]:
    df["uwi"] = df["uwi"].astype("string").str.strip().str.upper()
    df.dropna(subset=["uwi"], inplace=True)

# Convert dates
daily_production_df["production_date"] = pd.to_datetime(
    daily_production_df["production_date"], errors="coerce", utc=True
)

production_failures_df["failure_start_date"] = pd.to_datetime(
    production_failures_df["failure_start_date"], errors="coerce", utc=True
)

well_jobs_df["start_date"] = pd.to_datetime(
    well_jobs_df["start_date"], errors="coerce", utc=True
)

# Remove exact duplicates
daily_production_df = daily_production_df.drop_duplicates()
production_failures_df = production_failures_df.drop_duplicates()
well_jobs_df = well_jobs_df.drop_duplicates()

# Remove records without required dates
daily_production_df = daily_production_df.dropna(
    subset=["production_date"]
)

production_failures_df = production_failures_df.dropna(
    subset=["failure_start_date"]
)

well_jobs_df = well_jobs_df.dropna(subset=["start_date"])


# 3. Prepare production data

production_columns = [
    "oil_produced_m3",
    "water_produced_m3",
    "pump_efficiency_pct",
    "pcp_pump_rpm",
    "pcp_pump_rod_torque_ftlb"
]

# Only use columns that exist
production_columns = [
    col for col in production_columns
    if col in daily_production_df.columns
]

for col in production_columns:
    daily_production_df[col] = pd.to_numeric(
        daily_production_df[col], errors="coerce"
    )

# Group production records by well
production_groups = {
    uwi: group
    for uwi, group in daily_production_df.groupby("uwi")
}

# Group maintenance jobs by well
job_groups = {
    uwi: group.sort_values("start_date")
    for uwi, group in well_jobs_df.groupby("uwi")
}


# 4. Join and summarize by failure event

records = []

for _, failure in production_failures_df.iterrows():

    uwi = failure["uwi"]
    failure_date = failure["failure_start_date"]

    record = failure.to_dict()

    # Get production history before failure
    if uwi in production_groups:

        production = production_groups[uwi]

        start_date = failure_date - pd.Timedelta(days=30)

        history = production[
            (production["production_date"] >= start_date) &
            (production["production_date"] < failure_date)
        ]

        record["production_days"] = len(history)

        for col in production_columns:
            record[f"avg_30d_{col}"] = history[col].mean()

    else:
        record["production_days"] = 0

        for col in production_columns:
            record[f"avg_30d_{col}"] = float("nan")

    # Find the first maintenance job within 30 days after failure
    record["job_type"] = None
    record["job_category"] = None
    record["job_summary"] = None

    if uwi in job_groups:

        jobs = job_groups[uwi]

        matching_jobs = jobs[
            (jobs["start_date"] >= failure_date) &
            (jobs["start_date"] <= failure_date + pd.Timedelta(days=30))
        ]

        if not matching_jobs.empty:

            job = matching_jobs.iloc[0]

            for col in ["job_type", "job_category"]:
                if col in job.index:
                    record[col] = job[col]

            if "summary" in job.index:
                record["job_summary"] = job["summary"]

    records.append(record)


# 5. Create final enriched dataset

enriched_failures_df = pd.DataFrame(records)

print("Original failures:", len(production_failures_df))
print("Enriched failures:", len(enriched_failures_df))

print(enriched_failures_df.head())

# Optional: save processed dataset locally
# enriched_failures_df.to_parquet(
#     "./data/enriched_failures.parquet",
#     index=False
# )

enriched_failures_df = enriched_failures_df.fillna({
    "cause": "Unknown",
    "failure_detail": "Not recorded",
    "job_type": "Not recorded",
    "job_summary": "Not recorded"
})


# 6. Create documents and metadata for ChromaDB

failure_instances_sentences = []
failure_instances_metadata = []
failure_instances_ids = []

for i, row in enriched_failures_df.iterrows():

    # Format numerical values without modifying other text
    oil = (
        f"{row['avg_30d_oil_produced_m3']:.2f}"
        if pd.notna(row["avg_30d_oil_produced_m3"])
        else "Not recorded"
    )

    efficiency = (
        f"{row['avg_30d_pump_efficiency_pct'] * 100:.2f}"
        if pd.notna(row["avg_30d_pump_efficiency_pct"])
        else "Not recorded"
    )

    rpm = (
        f"{row['avg_30d_pcp_pump_rpm']:.2f}"
        if pd.notna(row["avg_30d_pcp_pump_rpm"])
        else "Not recorded"
    )

    torque = (
        f"{row['avg_30d_pcp_pump_rod_torque_ftlb']:.2f}"
        if pd.notna(row["avg_30d_pcp_pump_rod_torque_ftlb"])
        else "Not recorded"
    )

    sentence = f"""
        Well {row['uwi']} experienced a {row['failure_type']}
        caused by {row['cause']}. The failure involved
        {row['failure_detail']}.

        During the 30 days before failure, the well averaged
        {oil} m³ of oil production per recorded day,
        {efficiency}% pump efficiency,
        {rpm} RPM,
        and {torque} ft-lb of rod torque.

        Following the failure, maintenance work included
        {row['job_type']}, described as {row['job_summary']}.
    """

    metadata = {
        "uwi": row["uwi"],
        "failure_type": row["failure_type"],
        "cause": row["cause"],
        "failure_detail": row["failure_detail"],
        "avg_30d_oil_produced_m3": row["avg_30d_oil_produced_m3"],
        "avg_30d_pump_efficiency_pct": row["avg_30d_pump_efficiency_pct"],
        "avg_30d_pcp_pump_rpm": row["avg_30d_pcp_pump_rpm"],
        "avg_30d_pcp_pump_rod_torque_ftlb": row["avg_30d_pcp_pump_rod_torque_ftlb"],
        "job_type": row["job_type"],
        "job_summary": row["job_summary"]
    }

    # Remove missing metadata values
    metadata = {
        key: value
        for key, value in metadata.items()
        if pd.notna(value)
    }

    failure_instances_sentences.append(sentence)
    failure_instances_metadata.append(metadata)
    failure_instances_ids.append(f"failure_{len(failure_instances_ids)}")



# 7. Store records in ChromaDB

add(
    failure_instances_ids,
    failure_instances_sentences,
    failure_instances_metadata
)

print("Successfully finished inserting failure records into ChromaDB!")
