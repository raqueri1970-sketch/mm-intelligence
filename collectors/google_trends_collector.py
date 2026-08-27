"""MM Intelligence — Google Trends collector.

Collect Google Trends intelligence for physical-product discovery and persist
signals to Supabase. The workflow must fail if collection or persistence fails,
so a green GitHub Action always means data was actually written.
"""
import json
import os
import time
from datetime import datetime, timezone

import requests
from pytrends.request import TrendReq

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_ANON_KEY"]

SEEDS = [
    "foot pain relief product",
    "back pain relief device",
    "posture corrector",
    "hair loss device",
    "dark spot remover",
    "nail care device",
    "sleep aid device",
    "knee support",
    "skin care device",
    "home beauty device",
]
REGIONS = ["US", "MX"]
BLOCKED = ("capsule", "capsules", "supplement", "course", "ebook", "pdf", "training program", "massager", "massage")


def physical_only(term: str) -> bool:
    t = term.lower()
    return not any(x in t for x in BLOCKED)


def fetch_trends(seed: str, geo: str):
    py = TrendReq(hl="en-US", tz=360, retries=2, backoff_factor=0.5)
    py.build_payload([seed], timeframe="today 3-m", geo=geo)
    interest = py.interest_over_time()
    avg = peak = latest = 0
    growth = 0.0
    if not interest.empty and seed in interest.columns:
        vals = interest[seed].astype(float)
        avg = round(float(vals.mean()), 2)
        peak = int(vals.max())
        latest = int(vals.iloc[-1])
        if len(vals) >= 4:
            first = float(vals.iloc[: max(1, len(vals)//3)].mean())
            last = float(vals.iloc[-max(1, len(vals)//3):].mean())
            growth = round(((last - first) / max(first, 1.0)) * 100, 2)
    related = []
    rq = py.related_queries().get(seed) or {}
    rising = rq.get("rising")
    if rising is not None:
        for _, row in rising.head(10).iterrows():
            q = str(row.get("query", "")).strip()
            if q and physical_only(q):
                related.append({"query": q, "value": str(row.get("value", ""))})
    return {"avg_interest": avg, "peak_interest": peak, "latest_interest": latest, "growth_pct": growth, "rising_queries": related}


def write_signal(name: str, signal: dict):
    url = f"{SUPABASE_URL}/rest/v1/collector_signals"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    payload = [{
        "coletor": "google_trends",
        "produto_nome_bruto": name,
        "sinal": signal,
        "processado": False,
    }]
    r = requests.post(url, headers=headers, data=json.dumps(payload), timeout=30)
    if not r.ok:
        raise RuntimeError(f"Supabase write failed ({r.status_code}): {r.text[:500]}")


def main():
    now = datetime.now(timezone.utc).isoformat()
    errors = []
    written = 0
    for geo in REGIONS:
        for seed in SEEDS:
            if not physical_only(seed):
                continue
            try:
                data = fetch_trends(seed, geo)
                signal = {"source": "Google Trends", "geo": geo, "seed": seed, "collected_at": now, **data}
                write_signal(seed, signal)
                written += 1
                print(f"OK {geo} {seed}: {data['latest_interest']} growth={data['growth_pct']}%")
                for item in data["rising_queries"]:
                    write_signal(item["query"], {"source": "Google Trends Rising", "geo": geo, "parent_seed": seed, "trend_value": item["value"], "collected_at": now})
                    written += 1
                time.sleep(2)
            except Exception as exc:
                msg = f"{geo} {seed}: {exc}"
                errors.append(msg)
                print(f"ERROR {msg}")

    print(f"SUMMARY written={written} errors={len(errors)}")
    if errors:
        raise RuntimeError("Google Trends collection incomplete: " + " | ".join(errors))
    if written == 0:
        raise RuntimeError("Google Trends collector wrote zero signals")


if __name__ == "__main__":
    main()
