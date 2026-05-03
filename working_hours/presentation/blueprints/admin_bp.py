"""Admin panel and management API routes."""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template, request, session

from ...application import file_service, report_service, user_service
from ..auth import admin_required

admin_bp = Blueprint("admin", __name__)


@admin_bp.route("/admin")
@admin_required
def admin_page():
    return render_template("admin.html")


# ---------------------------------------------------------------------------
# Employees
# ---------------------------------------------------------------------------

@admin_bp.route("/api/admin/employees", methods=["GET"])
@admin_required
def admin_get_employees():
    return jsonify(report_service.get_employee_list())


@admin_bp.route("/api/admin/employees/<emp_id>", methods=["PUT"])
@admin_required
def admin_update_employee(emp_id: str):
    err = user_service.update_employee(emp_id, request.get_json(force=True))
    if err == "USERNAME_TAKEN":
        return jsonify(ok=False, error="Username already taken."), 409
    return jsonify(ok=True)


# ---------------------------------------------------------------------------
# Admin accounts
# ---------------------------------------------------------------------------

@admin_bp.route("/api/admin/admins", methods=["GET"])
@admin_required
def admin_get_admins():
    return jsonify(user_service.list_admins())


@admin_bp.route("/api/admin/admins", methods=["POST"])
@admin_required
def admin_create_admin():
    d = request.get_json(force=True)
    err = user_service.create_admin(d.get("username", "").strip(), d.get("password", ""))
    if err == user_service._MISSING_FIELDS:
        return jsonify(ok=False, error="Username and password are required."), 400
    if err == "USERNAME_TAKEN":
        return jsonify(ok=False, error="Username already exists."), 409
    return jsonify(ok=True)


@admin_bp.route("/api/admin/admins/<username>", methods=["PUT"])
@admin_required
def admin_update_admin(username: str):
    d = request.get_json(force=True)
    err = user_service.update_admin_password(username, d.get("password", ""))
    if err == user_service._NOT_FOUND:
        return jsonify(ok=False, error="Admin user not found."), 404
    return jsonify(ok=True)


@admin_bp.route("/api/admin/admins/<username>", methods=["DELETE"])
@admin_required
def admin_delete_admin(username: str):
    current = session.get("username")
    err = user_service.delete_admin(username, current)
    if err == "PROTECTED":
        return jsonify(ok=False, error="The built-in admin account cannot be deleted."), 403
    if err == "SELF_DELETE":
        return jsonify(ok=False, error="Cannot delete your own account."), 400
    if err == user_service._NOT_FOUND:
        return jsonify(ok=False, error="Admin user not found."), 404
    return jsonify(ok=True)


# ---------------------------------------------------------------------------
# Raw data files
# ---------------------------------------------------------------------------

@admin_bp.route("/api/admin/raw-files", methods=["GET"])
@admin_required
def admin_list_raw_files():
    return jsonify(file_service.list_raw_files())


@admin_bp.route("/api/admin/raw-files", methods=["POST"])
@admin_required
def admin_upload_raw_file():
    if "file" not in request.files:
        return jsonify(ok=False, error="No file provided."), 400
    f = request.files["file"]
    name = f.filename or ""
    content = f.read().decode("utf-8", errors="replace")
    ok, error = file_service.save_raw_file(name, content)
    if not ok:
        status = 400 if error in ("No filename.", "Only .txt files are accepted.") else 422
        return jsonify(ok=False, name=name, error=error), status
    return jsonify(ok=True, name=name)


@admin_bp.route("/api/admin/raw-files/<filename>", methods=["DELETE"])
@admin_required
def admin_delete_raw_file(filename: str):
    ok, error = file_service.delete_raw_file(filename)
    if not ok:
        status = 400 if error == "Invalid file." else 404
        return jsonify(ok=False, error=error), status
    return jsonify(ok=True)
