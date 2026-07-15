"""
Fetches World Bank WDI indicators and outputs cleaned static JSON for the dashboard.
Run once (or whenever you want fresh data):  python fetch_and_clean.py
Outputs: data/data.json, data/years_available.json
"""

import json
import requests
import pandas as pd
from pathlib import Path

BASE = "https://api.worldbank.org/v2"
DATE_RANGE = "1990:2023"

INDICATORS = {
    "SP.DYN.LE00.IN":   "life_exp",
    "SH.XPD.CHEX.PC.CD": "health_exp_pc",
    "SP.DYN.IMRT.IN":   "infant_mort",
    "SH.XPD.OOPC.CH.ZS": "oopc_pct",
    "SH.MED.PHYS.ZS":   "physicians",
    "SP.POP.TOTL":      "population",
    "NY.GNP.PCAP.CD":   "gni_pc",
}


def fetch_all_pages(url):
    rows = []
    page = 1
    while True:
        r = requests.get(url, params={"page": page}, timeout=60)
        r.raise_for_status()
        meta, data = r.json()
        if data:
            rows.extend(data)
        total_pages = meta.get("pages", 1)
        print(f"  page {page}/{total_pages} ({len(data or [])} rows)")
        if page >= total_pages:
            break
        page += 1
    return rows


def fetch_country_metadata():
    print("Fetching country metadata...")
    url = f"{BASE}/country?format=json&per_page=400"
    rows = fetch_all_pages(url)
    # Indicator endpoints use iso2Code as the country id, so key by that.
    # We also store the iso3/WB code for the output JSON.
    meta = {}
    for c in rows:
        iso2 = c.get("iso2Code", "").strip()
        if not iso2:
            continue
        meta[iso2] = {
            "iso3": c.get("id", "").strip(),
            "region": c.get("region", {}).get("value", "").strip(),
            "income_group": c.get("incomeLevel", {}).get("value", "").strip(),
            "name": c.get("name", "").strip(),
        }
    print(f"  {len(meta)} countries/aggregates in metadata")
    return meta


def fetch_indicator(code, short_name):
    print(f"Fetching {code} ({short_name})...")
    url = f"{BASE}/country/all/indicator/{code}?date={DATE_RANGE}&format=json&per_page=20000"
    rows = fetch_all_pages(url)
    records = []
    for row in rows:
        if row.get("value") is None:
            continue
        records.append({
            "code": row["country"]["id"],
            "year": int(row["date"]),
            short_name: round(float(row["value"]), 2),
        })
    print(f"  {len(records)} non-null observations")
    return pd.DataFrame(records)


def main():
    out_dir = Path(__file__).parent / "data"
    out_dir.mkdir(exist_ok=True)

    country_meta = fetch_country_metadata()
    # Aggregate codes have region.value == "Aggregates"
    real_countries = {
        code for code, m in country_meta.items()
        if m["region"] != "Aggregates"
    }
    print(f"  {len(real_countries)} real countries (after excluding aggregates)")

    # Fetch and merge all indicators
    dfs = []
    for wb_code, col_name in INDICATORS.items():
        df = fetch_indicator(wb_code, col_name)
        dfs.append(df)

    merged = dfs[0]
    for df in dfs[1:]:
        merged = pd.merge(merged, df, on=["code", "year"], how="outer")

    print(f"\nAfter outer-merge: {len(merged)} rows")

    # Filter to real countries only (keyed by iso2)
    merged = merged[merged["code"].isin(real_countries)]
    print(f"After removing aggregates: {len(merged)} rows")

    # Drop rows missing BOTH core variables
    before = len(merged)
    merged = merged[~(merged["life_exp"].isna() & merged["health_exp_pc"].isna())]
    print(f"After dropping rows missing both life_exp and health_exp_pc: {len(merged)} rows (dropped {before - len(merged)})")

    # Add region, income group, name, and iso3 code (from iso2 lookup)
    merged["region"] = merged["code"].map(lambda c: country_meta.get(c, {}).get("region", ""))
    merged["income_group"] = merged["code"].map(lambda c: country_meta.get(c, {}).get("income_group", ""))
    merged["country"] = merged["code"].map(lambda c: country_meta.get(c, {}).get("name", c))
    merged["iso3"] = merged["code"].map(lambda c: country_meta.get(c, {}).get("iso3", c))

    # Build nested JSON structure (group by iso2, output iso3 as "code")
    output = []
    for iso2, grp in merged.groupby("code"):
        years_data = {}
        for _, row in grp.iterrows():
            year_vals = {}
            for col in ["life_exp", "health_exp_pc", "infant_mort", "oopc_pct",
                        "physicians", "population", "gni_pc"]:
                v = row.get(col)
                if pd.notna(v):
                    year_vals[col] = v
            if year_vals:
                years_data[str(int(row["year"]))] = year_vals

        if not years_data:
            continue

        output.append({
            "country": grp["country"].iloc[0],
            "code": grp["iso3"].iloc[0],
            "region": grp["region"].iloc[0],
            "income_group": grp["income_group"].iloc[0],
            "years": years_data,
        })

    print(f"\nFinal: {len(output)} countries with data")

    # Spot-check (by iso3 code, which is now in the "code" field)
    for check_code in ["USA", "CUB", "NGA"]:
        hit = next((c for c in output if c["code"] == check_code), None)
        if hit:
            sample_year = next(iter(hit["years"]))
            print(f"  {hit['country']} ({check_code}) {sample_year}: {hit['years'][sample_year]}")

    data_path = out_dir / "data.json"
    with open(data_path, "w") as f:
        json.dump(output, f, separators=(",", ":"))
    size_mb = data_path.stat().st_size / 1e6
    print(f"\nWrote {data_path} ({size_mb:.2f} MB)")
    if size_mb > 3:
        print("WARNING: data.json exceeds 3 MB — consider reducing to 5-year intervals")

    all_years = sorted({
        int(y)
        for country in output
        for y in country["years"]
    })
    years_path = out_dir / "years_available.json"
    with open(years_path, "w") as f:
        json.dump(all_years, f)
    print(f"Wrote {years_path} ({all_years[0]}–{all_years[-1]}, {len(all_years)} years)")


if __name__ == "__main__":
    main()
