"""Editor UI, reports, event API, and correction routes."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from flask import Blueprint, current_app, jsonify, render_template, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from ..auth import _check_emp_ownership, _require_admin, login_required
from ..calculator import compute
from ..data import _append_correction, _apply_name_overrides, _load_events
from ..reporter import _build_rows, fmt_td
from ..settings import _find_user, _load_settings, _save_settings

editor_bp = Blueprint("editor", __name__)


@editor_bp.route("/")
@login_required
def index():
    return render_template("editor.html")


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

@editor_bp.route("/reports/")
@login_required
def reports_index():
    if not current_app.config.get("TESTING") and not session.get("is_admin"):
        return jsonify(ok=False, error="Access denied."), 403
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
    return render_template("report_index.html", years=years, stems_by_year=dict(stems_by_year))


@editor_bp.route("/reports/<stem>")
@login_required
def report(stem: str):
    if not current_app.config.get("TESTING") and not session.get("is_admin"):
        emp_id = session.get("emp_id")
        if emp_id:
            parts = stem.split("-", 2)
            if len(parts) < 3 or parts[1] != str(emp_id):
                return jsonify(ok=False, error="Access denied."), 403
    parts = stem.split("-", 2)
    if len(parts) < 3:
        return "Not found", 404
    try:
        year = int(parts[0])
    except ValueError:
        return "Not found", 404
    emp_id_str = parts[1]
    events = [
        e for e in _apply_name_overrides(_load_events())
        if str(e.emp_id) == emp_id_str and e.timestamp.year == year
    ]
    if not events:
        return "Report not found", 404
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
    return render_template(
        "report.html",
        name=name, dept=info["dept"], emp_id=eid,
        year=year, months=months, year_total=fmt_td(year_total),
    )


@editor_bp.route("/api/employee-reports/<emp_id>")
@login_required
def employee_reports(emp_id: str):
    err = _require_admin()
    if err:
        return err
    events = _load_events()
    employees = _load_settings().get("employees", {})
    years = sorted(
        {e.timestamp.year for e in events if str(e.emp_id) == str(emp_id)},
        reverse=True,
    )
    result = []
    for year in years:
        year_events = [e for e in events if str(e.emp_id) == str(emp_id) and e.timestamp.year == year]
        if year_events:
            name = year_events[0].name
            username = employees.get(str(emp_id), {}).get("username", "").strip() or name
            stem = f"{year}-{emp_id}-{username}"
            result.append({"stem": stem, "year": year, "url": f"/reports/{stem}"})
    return jsonify(result)


@editor_bp.route("/api/my-reports")
@login_required
def my_reports():
    if current_app.config.get("TESTING"):
        return jsonify([])
    emp_id = session.get("emp_id")
    if not emp_id:
        return jsonify([])
    events = _load_events()
    employees = _load_settings().get("employees", {})
    years = sorted(
        {e.timestamp.year for e in events if str(e.emp_id) == str(emp_id)},
        reverse=True,
    )
    result = []
    for year in years:
        year_events = [e for e in events if str(e.emp_id) == str(emp_id) and e.timestamp.year == year]
        if year_events:
            name = year_events[0].name
            username = employees.get(str(emp_id), {}).get("username", "").strip() or name
            stem = f"{year}-{emp_id}-{username}"
            result.append({"stem": stem, "year": year, "url": f"/reports/{stem}"})
    return jsonify(result)


# ---------------------------------------------------------------------------
# Session & account
# ---------------------------------------------------------------------------

@editor_bp.route("/api/config")
@login_required
def get_config():
    if current_app.config.get("TESTING"):
        return jsonify(restrict_edits=False, username="", is_admin=False, emp_id=None)
    is_admin = session.get("is_admin", False)
    emp_id = session.get("emp_id")
    return jsonify(
        restrict_edits=not is_admin,
        username=session.get("username", ""),
        is_admin=is_admin,
        emp_id=emp_id,
    )


@editor_bp.route("/api/change-password", methods=["PUT"])
@login_required
def change_password():
    d = request.get_json(force=True)
    if current_app.config.get("TESTING"):
        username = session.get("username") or d.get("username", "")
    else:
        username = session.get("username", "")
    if not username:
        return jsonify(ok=False, error="Not authenticated."), 401
    current_pw = d.get("current_password", "")
    new_pw = d.get("new_password", "")
    if not current_pw or not new_pw:
        return jsonify(ok=False, error="Current and new passwords are required."), 400
    user, emp_id, is_admin = _find_user(username)
    if not user:
        return jsonify(ok=False, error="User not found."), 404
    if not check_password_hash(user.get("password_hash", ""), current_pw):
        return jsonify(ok=False, error="Current password is incorrect."), 401
    settings = _load_settings()
    new_hash = generate_password_hash(new_pw)
    if is_admin:
        settings["admin_users"][username]["password_hash"] = new_hash
    else:
        settings["employees"][emp_id]["password_hash"] = new_hash
    _save_settings(settings)
    return jsonify(ok=True)


@editor_bp.route("/api/profiles")
@login_required
def get_profiles():
    employees = _load_settings().get("employees", {})
    return jsonify({
        emp_id: {"alias": emp.get("alias", ""), "full_name": emp.get("full_name", "")}
        for emp_id, emp in employees.items()
    })


# ---------------------------------------------------------------------------
# Events & corrections
# ---------------------------------------------------------------------------

@editor_bp.route("/api/events")
@login_required
def get_events():
    events = _load_events()
    if not current_app.config.get("TESTING"):
        emp_id = session.get("emp_id")
        if emp_id is not None and not session.get("is_admin"):
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
    return jsonify(result)


@editor_bp.route("/api/add", methods=["POST"])
@login_required
def add_event():
    d = request.get_json(force=True)
    err = _check_emp_ownership(d.get("emp_id", ""))
    if err:
        return err
    _append_correction(f"ADD\t{d['emp_id']}\t{d['name']}\t{d['dept']}\t{d['timestamp']}\t1")
    return jsonify(ok=True)


@editor_bp.route("/api/delete", methods=["POST"])
@login_required
def delete_event():
    err = _require_admin()
    if err:
        return err
    d = request.get_json(force=True)
    _append_correction(f"DEL\t{d['emp_id']}\t{d['name']}\t{d['dept']}\t{d['timestamp']}\t1")
    return jsonify(ok=True)


@editor_bp.route("/api/edit", methods=["POST"])
@login_required
def edit_event():
    d = request.get_json(force=True)
    err = _check_emp_ownership(d.get("emp_id", ""))
    if err:
        return err
    _append_correction(
        f"EDIT\t{d['emp_id']}\t{d['name']}\t{d['dept']}"
        f"\t{d['old_timestamp']}\t{d['new_timestamp']}\t1"
    )
    return jsonify(ok=True)


@editor_bp.route("/api/bulk-delete", methods=["POST"])
@login_required
def bulk_delete_events():
    err = _require_admin()
    if err:
        return err
    items = request.get_json(force=True)
    for item in items:
        _append_correction(
            f"DEL\t{item['emp_id']}\t{item['name']}\t{item['dept']}\t{item['timestamp']}\t1"
        )
    return jsonify(ok=True)
