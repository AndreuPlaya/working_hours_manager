"""Report generation use cases."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from ..domain.calculator import compute
from ..infrastructure.data import _apply_name_overrides, _load_events
from ..infrastructure.reporter import _build_rows, fmt_td
from ..infrastructure.settings import _load_settings


def get_events_data(emp_id: str | None, is_admin: bool) -> dict:
    """Load all events, filter to emp_id when caller is not an admin.

    Returns a serialisable dict keyed by "emp_id|name|dept".
    """
    events = _load_events()
    if emp_id is not None and not is_admin:
        events = [e for e in events if str(e.emp_id) == str(emp_id)]

    by_key: dict = defaultdict(list)
    for e in events:
        by_key[f"{e.emp_id}|{e.name}|{e.dept}"].append(e)

    result = {}
    for key in sorted(by_key.keys()):
        emp_data = compute(by_key[key])
        rows: list[dict] = []
        for _, year_data in emp_data.items():
            for d, day_rec in sorted(year_data["days"].items()):
                date_label = f"{d.isoformat()} ({d.strftime('%a')})"
                for s in day_rec.sessions:
                    rows.append({
                        "date": date_label,
                        "clock_in": s.clock_in.strftime("%Y-%m-%d %H:%M:%S"),
                        "clock_out": s.clock_out.strftime("%Y-%m-%d %H:%M:%S"),
                        "duration": fmt_td(s.duration),
                        "incomplete": False,
                    })
                if day_rec.incomplete and day_rec.dangling:
                    rows.append({
                        "date": date_label,
                        "clock_in": day_rec.dangling.strftime("%Y-%m-%d %H:%M:%S"),
                        "clock_out": None,
                        "duration": None,
                        "incomplete": True,
                    })
        result[key] = rows
    return result


def get_report_index() -> dict:
    """Return {"years": [...], "stems_by_year": {year: [{stem, display}]}}."""
    events = _apply_name_overrides(_load_events())
    employees = _load_settings().get("employees", {})

    by_year_emp: dict = defaultdict(list)
    for e in events:
        by_year_emp[(e.timestamp.year, e.emp_id, e.name)].append(e)

    stems_by_year: dict = defaultdict(list)
    for (year, emp_id, name) in sorted(by_year_emp.keys()):
        username = employees.get(str(emp_id), {}).get("username", "").strip() or name
        display = employees.get(str(emp_id), {}).get("alias", "").strip() or username
        stem = f"{year}-{emp_id}-{username}"
        stems_by_year[str(year)].append({"stem": stem, "display": display})

    years = sorted(stems_by_year.keys(), reverse=True)
    return {"years": years, "stems_by_year": dict(stems_by_year)}


def get_employee_report(stem: str) -> dict | None:
    """Return full report data for a stem (year-empid-username), or None if missing."""
    parts = stem.split("-", 2)
    if len(parts) < 3:
        return None
    try:
        year = int(parts[0])
    except ValueError:
        return None
    emp_id_str = parts[1]

    events = [
        e for e in _apply_name_overrides(_load_events())
        if str(e.emp_id) == emp_id_str and e.timestamp.year == year
    ]
    if not events:
        return None

    data = compute(events)
    (eid, name), info = next(iter(data.items()))

    by_month: dict = defaultdict(dict)
    for d, rec in info["days"].items():
        by_month[(d.year, d.month)][d] = rec

    months = []
    year_total = timedelta()
    for (y, m) in sorted(by_month):
        rows, month_total = _build_rows(by_month[(y, m)])
        year_total += month_total
        months.append({
            "label": date(y, m, 1).strftime("%B %Y"),
            "rows": [
                {
                    "date_label": r[0], "clock_in": r[1], "clock_out": r[2],
                    "duration": r[3], "is_subtotal": r[4], "is_incomplete": r[2] == "?",
                }
                for r in rows
            ],
            "total": fmt_td(month_total),
        })

    return {
        "name": name,
        "dept": info["dept"],
        "emp_id": eid,
        "year": year,
        "months": months,
        "year_total": fmt_td(year_total),
    }


def get_employee_list() -> list[dict]:
    """Return the merged employee list using events from the current data root."""
    from . import user_service
    return user_service.list_employees(_load_events())


def get_employee_report_urls(emp_id: str) -> list[dict]:
    """Return [{stem, year, url}] for all years of a given employee."""
    events = _load_events()
    employees = _load_settings().get("employees", {})
    years = sorted(
        {e.timestamp.year for e in events if str(e.emp_id) == str(emp_id)},
        reverse=True,
    )
    result = []
    for year in years:
        year_events = [
            e for e in events
            if str(e.emp_id) == str(emp_id) and e.timestamp.year == year
        ]
        if year_events:
            name = year_events[0].name
            username = employees.get(str(emp_id), {}).get("username", "").strip() or name
            stem = f"{year}-{emp_id}-{username}"
            result.append({"stem": stem, "year": year, "url": f"/reports/{stem}"})
    return result
