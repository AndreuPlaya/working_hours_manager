"""Editor UI, reports, event API, and correction routes."""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template, request, session

from ...application import correction_service, report_service, user_service
from ..auth import _check_emp_ownership, _require_admin, login_required

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
    if not session.get("is_admin"):
        return jsonify(ok=False, error="Access denied."), 403
    idx = report_service.get_report_index()
    return render_template(
        "report_index.html",
        years=idx["years"],
        stems_by_year=idx["stems_by_year"],
    )


@editor_bp.route("/reports/<stem>")
@login_required
def report(stem: str):
    if not session.get("is_admin"):
        emp_id = session.get("emp_id")
        if emp_id:
            parts = stem.split("-", 2)
            if len(parts) < 3 or parts[1] != str(emp_id):
                return jsonify(ok=False, error="Access denied."), 403
    data = report_service.get_employee_report(stem)
    if data is None:
        return "Report not found", 404
    return render_template("report.html", **data)


@editor_bp.route("/api/employee-reports/<emp_id>")
@login_required
def employee_reports(emp_id: str):
    err = _require_admin()
    if err:
        return err
    return jsonify(report_service.get_employee_report_urls(emp_id))


@editor_bp.route("/api/my-reports")
@login_required
def my_reports():
    emp_id = session.get("emp_id")
    if not emp_id:
        return jsonify([])
    return jsonify(report_service.get_employee_report_urls(emp_id))


# ---------------------------------------------------------------------------
# Session & account
# ---------------------------------------------------------------------------

@editor_bp.route("/api/config")
@login_required
def get_config():
    is_admin = session.get("is_admin", False)
    return jsonify(
        restrict_edits=not is_admin,
        username=session.get("username", ""),
        is_admin=is_admin,
        emp_id=session.get("emp_id"),
    )


@editor_bp.route("/api/change-password", methods=["PUT"])
@login_required
def change_password():
    d = request.get_json(force=True)
    username = session.get("username", "")
    if not username:
        return jsonify(ok=False, error="Not authenticated."), 401
    err = user_service.change_password(
        username,
        d.get("current_password", ""),
        d.get("new_password", ""),
    )
    if err == user_service._MISSING_FIELDS:
        return jsonify(ok=False, error="Current and new passwords are required."), 400
    if err == user_service._NOT_FOUND:
        return jsonify(ok=False, error="User not found."), 404
    if err == user_service._WRONG_PASSWORD:
        return jsonify(ok=False, error="Current password is incorrect."), 401
    return jsonify(ok=True)


@editor_bp.route("/api/profiles")
@login_required
def get_profiles():
    return jsonify(user_service.get_profiles())


# ---------------------------------------------------------------------------
# Events & corrections
# ---------------------------------------------------------------------------

@editor_bp.route("/api/events")
@login_required
def get_events():
    emp_id = session.get("emp_id")
    is_admin = session.get("is_admin", False)
    return jsonify(report_service.get_events_data(emp_id, is_admin))


@editor_bp.route("/api/add", methods=["POST"])
@login_required
def add_event():
    d = request.get_json(force=True)
    err = _check_emp_ownership(d.get("emp_id", ""))
    if err:
        return err
    correction_service.add_correction(d["emp_id"], d["name"], d["dept"], d["timestamp"])
    return jsonify(ok=True)


@editor_bp.route("/api/delete", methods=["POST"])
@login_required
def delete_event():
    err = _require_admin()
    if err:
        return err
    d = request.get_json(force=True)
    correction_service.delete_correction(d["emp_id"], d["name"], d["dept"], d["timestamp"])
    return jsonify(ok=True)


@editor_bp.route("/api/edit", methods=["POST"])
@login_required
def edit_event():
    d = request.get_json(force=True)
    err = _check_emp_ownership(d.get("emp_id", ""))
    if err:
        return err
    correction_service.edit_correction(
        d["emp_id"], d["name"], d["dept"], d["old_timestamp"], d["new_timestamp"]
    )
    return jsonify(ok=True)


@editor_bp.route("/api/bulk-delete", methods=["POST"])
@login_required
def bulk_delete_events():
    err = _require_admin()
    if err:
        return err
    correction_service.bulk_delete(request.get_json(force=True))
    return jsonify(ok=True)
