"""Resolve chart queries against the full Parquet datasets."""

import re
from calendar import month_name
from functools import lru_cache
from pathlib import Path

import pandas as pd

DATA = Path(__file__).resolve().parent / "data"
AREA = "field_operating_area"
EXAMPLE = 'Try “Top 5 wells by rod failures in Winter” or “Downtime by operating area”.'
EQUIPMENT = {
    "rod": r"\brods?\b",
    "pump": r"\b(?:pumps?|pcp)\b",
    "tubing": r"\b(?:tubing|tbg)\b",
    "casing": r"\b(?:casing|csig)\b",
    "packer": r"\bpackers?\b",
}
EQUIPMENT_ITEM = rf"(?:{'|'.join(EQUIPMENT.values())})(?:\s+failures?)?"
EXCLUDED_EQUIPMENT = re.compile(
    rf"\b(?:besides|excluding|except(?:\s+for)?|other\s+than)\s+(?:all\s+|the\s+)?"
    rf"(?P<types>{EQUIPMENT_ITEM}(?:(?:\s*,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+){EQUIPMENT_ITEM})*)"
)
METRICS = (
    (r"\befficienc\w*\b", "avg_30d_pump_efficiency_pct", "Pump efficiency (%)", 100),
    (r"\b(?:rpm|pump speed)\b", "avg_30d_pcp_pump_rpm", "Pump speed (RPM)", 1),
    (r"\btorque\b", "avg_30d_pcp_pump_rod_torque_ftlb", "Rod torque (ft-lb)", 1),
    (r"\boil\b", "avg_30d_oil_produced_m3", "Oil production (m³/day)", 1),
)


@lru_cache(maxsize=1)
def failures():
    data = pd.read_parquet(DATA / "production_failures.parquet").drop_duplicates()
    data["date"] = pd.to_datetime(data["failure_start_date"])
    data["cause"] = data["cause"].str.strip().replace("", pd.NA).fillna("Unknown")
    return data


@lru_cache(maxsize=1)
def production():
    fields = ("uwi", AREA, "production_date", "oil_produced_m3", "hours_down", "downtime_code_1")
    data = pd.read_parquet(DATA / "daily_production.parquet", columns=fields)
    data["date"] = pd.to_datetime(data.pop("production_date"))
    return data


@lru_cache(maxsize=1)
def known_areas():
    daily = pd.read_parquet(DATA / "daily_production.parquet", columns=[AREA])[AREA]
    return sorted(set(daily.dropna().unique()) | set(failures()[AREA].dropna().unique()),
                  key=lambda name: (-len(name), name))


def message(text):
    return {"type": "message", "message": f"{text} {EXAMPLE}"}


def result(kind, title, rows, **details):
    return {"type": kind, "title": title, "rows": rows, **details}


def date_window(query, dates):
    first, last = dates.min(), dates.max()
    recent = re.search(r"\b(?:last|past|previous)\s+(\d+)\s+(days?|weeks?|months?|years?)\b", query)
    years = re.findall(r"\b(?:19|20)\d{2}\b", query)
    if recent:
        count, unit = recent.groups()
        count = min(int(count), 365 * 100 // {"day": 1, "week": 7, "month": 31, "year": 366}[unit.rstrip("s")])
        start = last - pd.DateOffset(**{unit.rstrip("s") + "s": count})
        return start + pd.Timedelta(days=1), last
    months = {name.lower(): number for number, name in enumerate(month_name) if name}
    named_month = re.search(rf"\b({'|'.join(months)}) ((?:19|20)\d{{2}})\b", query)
    if named_month:
        period = pd.Period(year=int(named_month[2]), month=months[named_month[1]], freq="M")
        return period.start_time, period.end_time.normalize()
    if years:
        return pd.Timestamp(f"{min(years)}-01-01"), pd.Timestamp(f"{max(years)}-12-31")
    calendar = re.search(r"\b(this|last) (month|year)\b", query)
    if calendar and pd.notna(last):
        period = last.to_period("M" if calendar[2] == "month" else "Y")
        if calendar[1] == "last":
            period -= 1
        return period.start_time, period.end_time.normalize()
    return first, last


def snapshot(data, day):
    """Return recent daily readings for wells in the selected dataset scope."""
    recent_days = pd.date_range(end=day, periods=7)
    recent = data[data["date"].between(day - pd.Timedelta(days=30), day)]
    wells = []
    for uwi, group in recent.groupby("uwi"):
        daily = group.drop_duplicates("date", keep="last").set_index("date")
        current = daily.reindex([day]).iloc[0]
        oil, down = current["oil_produced_m3"], current["hours_down"]
        history = daily.reindex(recent_days)["oil_produced_m3"]
        baseline = daily.loc[daily.index < day, "oil_produced_m3"].mean()
        if pd.isna(oil) or pd.isna(down):
            status = "noData"
        elif down >= 24:
            status = "down"
        elif oil <= 0 or (pd.notna(baseline) and oil < baseline * 0.75):
            status = "reducedOutput"
        else:
            status = "producing"
        wells.append({
            "id": uwi, "status": status, "oilTodayM3": number(oil),
            "oilYesterdayM3": number(history.iloc[-2]), "hoursDown": number(down),
            "recentAverageOilM3": number(baseline),
            "downtimeReason": current["downtime_code_1"] if pd.notna(current["downtime_code_1"]) else None,
            "productionHistory": [{"date": str(date.date()), "oilM3": number(value)}
                                  for date, value in history.items()],
        })
    return wells


def number(value):
    return round(float(value), 2) if pd.notna(value) else None


def area_breakdown(data, title, limit, scope):
    totals = data.groupby(AREA).size().sort_values(ascending=False, kind="stable").iloc[:limit]
    selected = data[data[AREA].isin(totals.index)]
    causes = selected["cause"].value_counts().index
    series = [{"key": f"cause{i}", "name": cause} for i, cause in enumerate(causes)]
    keys = {item["name"]: item["key"] for item in series}
    rows = []
    for area, count in totals.items():
        counts = selected.loc[selected[AREA].eq(area), "cause"].value_counts()
        rows.append({"area": area, "failures": count,
                     **{key: int(counts.get(cause, 0)) for cause, key in keys.items()}})
    wells = []
    histories = {}
    if not selected.empty:
        daily = production()
        day = min(daily["date"].max(), selected["date"].max())
        recent = daily[daily["date"].between(day - pd.Timedelta(days=30), day)]
        histories = {well["id"]: well["productionHistory"]
                     for well in snapshot(recent[recent["uwi"].isin(selected["uwi"])], day)}
    for (area, uwi), incidents in selected.groupby([AREA, "uwi"]):
        wells.append({
            "id": uwi, "area": area, "failureCount": len(incidents),
            "productionHistory": histories.get(uwi, []),
            "causes": [{"name": cause, "count": count}
                       for cause, count in incidents["cause"].value_counts().items()],
            "events": [{"date": str(row.date.date()) if pd.notna(row.date) else None,
                        "cause": row.cause,
                        "description": row.failure_detail if pd.notna(row.failure_detail) else None}
                       for row in incidents.sort_values("date", ascending=False).itertuples()],
        })
    return result("area_breakdown", title, rows, series=series, wells=wells, scope=scope)


def incident_result(query, search):
    matches = search(query)
    options = [metric for metric in METRICS if re.search(metric[0], query)] or [METRICS[i] for i in (3, 0, 1, 2)]
    for _, field, unit, multiplier in options:
        if field not in matches:
            continue
        values = pd.to_numeric(matches[field], errors="coerce").replace([float("inf"), -float("inf")], pd.NA).dropna()
        if not values.empty:
            rows = [{"label": f"{row_label(matches, index)} · {position}", "value": number(value * multiplier)}
                    for position, (index, value) in enumerate(values.items(), 1)]
            return result("ranking", "30-day pre-failure averages", rows, unit=unit,
                          scope="Matching incidents")
    return result("ranking", "30-day pre-failure averages", [], unit=options[0][2],
                  scope="Matching incidents", emptyMessage="No readings for this measure.")


def row_label(matches, index):
    uwi = matches.loc[index].get("uwi")
    return uwi if pd.notna(uwi) and uwi else "Incident"


def equipment_types(text):
    return [name for name, pattern in EQUIPMENT.items() if re.search(pattern, text)]


def chart_search(question, search):
    query = question.casefold()
    excluded = equipment_types(" ".join(match["types"] for match in EXCLUDED_EQUIPMENT.finditer(query)))
    ranking_query = EXCLUDED_EQUIPMENT.sub(" ", query).strip()
    equipment = [name for name in equipment_types(ranking_query) if name not in excluded]
    downtime = bool(re.search(r"\b(?:downtime|hours? down)\b", query))
    trend = bool(re.search(r"\b(?:monthly|trend\w*|month[ -](?:by[ -]month|over[ -]month)|by month|over time)\b", query))
    words = dict(zip("one two three four five six seven eight nine ten".split(), range(1, 11)))
    count = rf"(\d{{1,9}}|{'|'.join(words)})"
    group = r"(?:wells?|(?:operating )?areas?|causes?|failure types?)"
    limit_match = re.search(
        rf"\b(?:top|first|highest|most(?:\s+common)?)\s+{count}(?:\s+{group})?\b"
        rf"|\b{count}\s+(?:(?:worst|top|highest|most common)\s+)?{group}\b", ranking_query)
    value = next((value for value in limit_match.groups() if value), None) if limit_match else None
    limit = int(value) if value and value.isdecimal() else words.get(value)
    time_query = (ranking_query[:limit_match.start()] + " " + ranking_query[limit_match.end():]
                  if limit_match else ranking_query)
    area_group = bool(re.search(r"\b(?:by|per|across|which|rank)\s+(?:operating\s+)?areas?\b|\bareas with\b|\bwhere\b", query)
                      or (limit_match and re.search(r"\bareas?\b", limit_match[0])))
    cause_group = bool(re.search(r"\bcauses\b|\b(?:(?:by|per) cause|cause breakdown)\b", query))
    well_group = bool(re.search(r"\b(?:by|per|which|rank|top) wells?\b|\bwells? with the most\b", ranking_query)
                      or (limit_match and re.search(r"\bwells?\b", limit_match[0])))
    type_group = bool(re.search(
        rf"\bfailure types?\b|\b(?:top|most common|most frequent)\s+(?:{count}\s+)?(?:equipment\s+)?failures\b",
        ranking_query))
    ranking = limit is not None or well_group or area_group or cause_group or type_group or bool(
        re.search(r"\b(?:rank\w*|breakdown|most|highest|worst)\b", ranking_query))
    failure_query = bool(re.search(r"\b(?:fail\w*|breakdowns?|incidents?)\b", query))
    overview = not (downtime or trend or failure_query) and bool(
        re.search(r"\b(?:status|overview|how\s+(?:are|is)|performing|doing|wells? (?:are )?down)\b", query))
    if not (downtime or failure_query or (overview and re.search(r"\b(?:wells?|areas?)\b", query))):
        return message("This query does not match a supported chart.")
    area = next((name for name in known_areas() if re.search(
        rf"(?<!\w){re.escape(name.casefold())}(?!\w)", query)), None)
    unknown_location = re.search(
        r"\b(?:in|at)\s+(?:the\s+)?(?!the\b|last\b|past\b|previous\b|this\b|total\b)"
        r"[a-z][a-z -]*?(?=\s+in\s+(?:19|20)\d{2}\b|[?!.]?$)", time_query)
    if not area and (overview or ((ranking or trend or downtime) and unknown_location)):
        return message("Choose a recorded operating area, such as Cactus Lake or Winter.")
    if downtime and (equipment or excluded or trend or cause_group):
        return message("Recorded downtime is available by operating area or well.")
    if not (downtime or ranking or trend or overview):
        if area or re.search(r"\b(?:19|20)\d{2}\b|\b(?:last|past|previous|this)\b", time_query):
            return message("Use a ranked or monthly chart to filter by area or time.")
        return incident_result(query, search)

    data = production() if downtime or (overview and not failure_query) else failures()
    requested_start, requested_end = date_window(time_query, data["date"])
    coverage_start, coverage_end = data["date"].min(), data["date"].max()
    start = max(requested_start, coverage_start) if pd.notna(coverage_start) else pd.NaT
    end = min(requested_end, coverage_end) if pd.notna(coverage_end) else pd.NaT
    covered = pd.notna(start) and pd.notna(end) and start <= end
    display_start, display_end = (start, end) if covered else (requested_start, requested_end)
    period = (f"{display_start:%b %d, %Y} – {display_end:%b %d, %Y}"
              if pd.notna(display_start) and pd.notna(display_end) else None)
    exclusion = f"Excluding {' / '.join(excluded)} failures" if excluded else None
    scope = " · ".join(part for part in (area, period, exclusion) if part)
    if area:
        data = data[data[AREA].eq(area)]
    data = data[data["date"].between(start, end)]
    if overview and not (downtime or failure_query):
        day = data["date"].max()
        return result("area_status", f"{area} well status", [] if pd.isna(day) else snapshot(data, day),
                      area=area, scope=scope if pd.isna(day) else f"Recorded snapshot · {day:%b %d, %Y}")
    if equipment:
        data = data[data["failure_type"].str.contains(
            "|".join(EQUIPMENT[name] for name in equipment), case=False, na=False)]
    if excluded:
        data = data[~data["failure_type"].str.contains(
            "|".join(EQUIPMENT[name] for name in excluded), case=False, na=False)]
    label = f"{' / '.join(equipment).capitalize()} failures" if equipment else "Equipment failures"
    prefix = f"Top {limit} · " if limit is not None else ""
    if trend:
        counts = data.groupby(data["date"].dt.to_period("M")).size()
        months = pd.period_range(start, end, freq="M") if covered else []
        rows = [{"month": month.strftime("%b %Y"), "failures": int(counts.get(month, 0))} for month in months]
        year = f" in {start.year}" if covered and start.year == end.year else " in this period"
        note = f"0 recorded {label.lower()}{year}." if covered and counts.empty else None
        return result("monthly", f"Monthly {label.lower()}", rows, scope=scope, note=note)
    if area_group and not downtime and not cause_group:
        return {**area_breakdown(data, f"{prefix}{label} by operating area and recorded cause", limit, scope),
                "period": period}
    if cause_group:
        grouping = "cause"
    elif well_group:
        grouping = "uwi"
    elif downtime:
        grouping = AREA
    else:
        grouping = "failure_type" if type_group or not equipment else "uwi"
    group_label = {"cause": "recorded cause", "uwi": "well", AREA: "operating area",
                   "failure_type": "recorded type"}[grouping]
    metric = "hours_down" if downtime else None
    grouped = data.dropna(subset=[metric]).groupby(grouping) if metric else data.groupby(grouping)
    values = grouped[metric].sum() if metric else grouped.size()
    values = values.sort_values(ascending=False, kind="stable").iloc[:limit]
    rows = [{"label": key, "value": number(value) if downtime else int(value)} for key, value in values.items()]
    groups = None
    if downtime and grouping == AREA:
        wells = (data.loc[data[AREA].isin(values.index)]
                 .groupby([AREA, "uwi"])["hours_down"].sum(min_count=1))
        groups = {name: [] for name in values.index}
        for (name, uwi), value in wells.items():
            groups[name].append({"id": uwi, "value": number(value)})
    return result("ranking", f"{prefix}{'Downtime' if downtime else label} by {group_label}",
                  rows, unit="Downtime (hours)" if downtime else "Failures", scope=scope,
                  period=period, groups=groups)
