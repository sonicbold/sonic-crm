import json
import re
from pathlib import Path

import pandas as pd

TOLL = {"800", "833", "844", "855", "866", "877", "888"}


def e164(phone):
    d = re.sub(r"\D", "", str(phone or ""))
    if len(d) == 10:
        return "+1" + d
    if len(d) == 11 and d[0] == "1":
        return "+" + d
    return None


def zipcode(v):
    if pd.isna(v):
        return ""
    s = str(v).strip()
    if s.endswith(".0"):
        s = s[:-2]
    try:
        n = int(float(s))
        return f"{n:05d}" if n < 100000 else str(n)
    except Exception:
        return s


def cell(v):
    if pd.isna(v):
        return None
    s = str(v).strip()
    return s or None


rows = []
seen = set()
skipped = {"no_phone": 0, "toll_free": 0, "dup": 0}
files = [
    (Path(r"c:\Users\asus\Downloads\leads_houston_tx.xlsx"), "Houston"),
    (Path(r"c:\Users\asus\Downloads\leads_dallas_tx.xlsx"), "Dallas"),
]

for path, market in files:
    df = pd.read_excel(path, sheet_name="Leads (weakest first)")
    for r in df.to_dict("records"):
        phone = e164(r.get("phone"))
        if not phone:
            skipped["no_phone"] += 1
            continue
        last10 = re.sub(r"\D", "", phone)[-10:]
        if last10[:3] in TOLL:
            skipped["toll_free"] += 1
            continue
        if last10 in seen:
            skipped["dup"] += 1
            continue
        seen.add(last10)
        street = cell(r.get("street")) or ""
        city = cell(r.get("city")) or ""
        state = cell(r.get("state")) or "TX"
        z = zipcode(r.get("zip"))
        city_line = ", ".join(x for x in [city, state] if x)
        if z:
            city_line = f"{city_line} {z}".strip()
        address = ", ".join(p for p in [street, city_line] if p) or None
        urls = cell(r.get("source_urls")) or ""
        maps = None
        for piece in re.split(r"[\s,]+", urls):
            if "google.com/maps" in piece or "maps.google" in piece:
                maps = piece
                break
        reasons = cell(r.get("score_reasons"))
        notes = [f"Imported {market} Angi list (rank {r.get('rank')}, weakness {r.get('weakness_score')})."]
        if reasons:
            notes.append(reasons)
        if urls:
            notes.append(urls)
        rating = r.get("rating")
        reviews = r.get("review_count")
        rows.append(
            {
                "businessName": cell(r.get("name")),
                "phone": phone,
                "city": city or None,
                "state": state,
                "address": address,
                "website": cell(r.get("website")),
                "rating": None if pd.isna(rating) else float(rating),
                "reviewCount": None if pd.isna(reviews) else int(reviews),
                "googleMapsUrl": maps,
                "notes": "\n".join(notes),
                "category": "plumbers" if str(r.get("plumbing_in_name") or "").lower() == "yes" else "local business",
                "source": "import",
            }
        )

out = Path(__file__).with_name("xlsx-leads.json")
out.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
print(json.dumps({"count": len(rows), "skipped": skipped, "out": str(out)}))
