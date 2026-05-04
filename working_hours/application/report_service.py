"""Report generation use cases."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta

from ..domain.calculator import compute
from ..domain.models import ClockEvent
from ..infrastructure.data import _apply_name_overrides, _load_events
from ..infrastructure.reporter import _build_rows, fmt_td, fmt_time
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


def get_pending_preview(item: dict) -> dict | None:
    """Compute before/after month records for a pending correction item.

    Returns a dict with before/after day rows for the affected employee's month,
    or None if the item is malformed.
    """
    try:
        affected_ts = datetime.strptime(item["timestamp"], "%Y-%m-%d %H:%M:%S")
    except (ValueError, KeyError):
        return None

    emp_id = str(item["emp_id"])
    affected_date = affected_ts.date()
    affected_year = affected_ts.year
    affected_month = affected_ts.month

    all_events = _load_events()
    emp_events = [e for e in all_events if str(e.emp_id) == emp_id]

    # "after" events: apply the pending correction on top of current state
    after_events = list(emp_events)
    if item["action"] == "ADD":
        after_events.append(ClockEvent(emp_id, item["name"], item["dept"], affected_ts))
    elif item["action"] == "EDIT":
        try:
            new_ts = datetime.strptime(item["new_timestamp"], "%Y-%m-%d %H:%M:%S")
        except (ValueError, TypeError, KeyError):
            return None
        after_events = [
            ClockEvent(e.emp_id, e.name, e.dept, new_ts)
            if str(e.emp_id) == emp_id and e.timestamp == affected_ts
            else e
            for e in after_events
        ]

    def _month_events(events: list, year: int, month: int) -> list:
        return [e for e in events if e.timestamp.year == year and e.timestamp.month == month]

    def _build_preview_rows(month_events: list, highlight_dates: set) -> tuple[list[dict], str]:
        if not month_events:
            return [], "0h 00m"
        data = compute(month_events)
        _, info = next(iter(data.items()))
        days = info["days"]
        rows_out: list[dict] = []
        total = timedelta()
        for d in sorted(days):
            rec = days[d]
            total += rec.total
            label = f"{d}  {d.strftime('%a')}"
            is_aff = d in highlight_dates
            first = True
            for s in rec.sessions:
                rows_out.append({
                    "date_label": label if first else "",
                    "clock_in": fmt_time(s.clock_in),
                    "clock_out": fmt_time(s.clock_out),
                    "duration": fmt_td(s.duration),
                    "is_subtotal": False,
                    "affected": is_aff,
                })
                first = False
            if rec.incomplete:
                rows_out.append({
                    "date_label": label if first else "",
                    "clock_in": fmt_time(rec.dangling),
                    "clock_out": "?",
                    "duration": "incomplete",
                    "is_subtotal": False,
                    "affected": is_aff,
                })
            if len(rec.sessions) > 1:
                rows_out.append({
                    "date_label": "",
                    "clock_in": "",
                    "clock_out": "day total",
                    "duration": fmt_td(rec.total),
                    "is_subtotal": True,
                    "affected": is_aff,
                })
        return rows_out, fmt_td(total)

    before_highlight = {affected_date}
    after_highlight = {affected_date}
    if item["action"] == "EDIT" and item.get("new_timestamp"):
        try:
            new_ts = datetime.strptime(item["new_timestamp"], "%Y-%m-%d %H:%M:%S")
            after_highlight.add(new_ts.date())
        except ValueError:
            pass

    before_rows, before_total = _build_preview_rows(
        _month_events(emp_events, affected_year, affected_month), before_highlight
    )
    after_rows, after_total = _build_preview_rows(
        _month_events(after_events, affected_year, affected_month), after_highlight
    )

    return {
        "employee": item["name"],
        "emp_id": emp_id,
        "month_label": date(affected_year, affected_month, 1).strftime("%B %Y"),
        "affected_date": affected_date.isoformat(),
        "before": {"rows": before_rows, "month_total": before_total},
        "after": {"rows": after_rows, "month_total": after_total},
    }
