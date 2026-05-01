"""Admin panel and management API routes."""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template, request, session
from werkzeug.security import generate_password_hash
from werkzeug.utils import secure_filename

from ..auth import admin_required
from ..data import _load_events, _raw_dir
from ..parser import validate_raw_content
from ..settings import _load_settings, _save_settings

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
    events = _load_events()
    known: dict[str, str] = {}
    for e in events:
        known[str(e.emp_id)] = e.name
    settings = _load_settings()
    employees = settings.get("employees", {})
    result = []
    for emp_id in sorted(known.keys(), key=lambda x: x.zfill(20) if x.isdigit() else x):
        emp = employees.get(emp_id, {})
        result.append({
            "emp_id": emp_id,
            "raw_name": known[emp_id],
            "alias": emp.get("alias", ""),
            "full_name": emp.get("full_name", ""),
            "username": emp.get("username", ""),
            "has_password": bool(emp.get("password_hash", "")),
            "enabled": emp.get("enabled", True),
        })
    return jsonify(result)


@admin_bp.route("/api/admin/employees/<emp_id>", methods=["PUT"])
@admin_required
def admin_update_employee(emp_id: str):
    d = request.get_json(force=True)
    settings = _load_settings()
    emp = settings.setdefault("employees", {}).setdefault(emp_id, {})
    new_username = d.get("username", emp.get("username", "")).strip()
    if new_username and new_username != emp.get("username", ""):
        for eid, e in settings["employees"].items():
            if eid != emp_id and e.get("username") == new_username:
                return jsonify(ok=False, error="Username already taken."), 409
        if new_username in settings.get("admin_users", {}):
            return jsonify(ok=False, error="Username already taken."), 409
    if "alias" in d:
        emp["alias"] = d["alias"].strip()
    if "full_name" in d:
        emp["full_name"] = d["full_name"].strip()
    emp["username"] = new_username
    if "enabled" in d:
        emp["enabled"] = bool(d["enabled"])
    if d.get("password"):
        emp["password_hash"] = generate_password_hash(d["password"])
    _save_settings(settings)
    return jsonify(ok=True)


# ---------------------------------------------------------------------------
# Admin accounts
# ---------------------------------------------------------------------------

@admin_bp.route("/api/admin/admins", methods=["GET"])
@admin_required
def admin_get_admins():
    settings = _load_settings()
    return jsonify([{"username": u} for u in settings.get("admin_users", {})])


@admin_bp.route("/api/admin/admins", methods=["POST"])
@admin_required
def admin_create_admin():
    d = request.get_json(force=True)
    username = d.get("username", "").strip()
    password = d.get("password", "")
    if not username or not password:
        return jsonify(ok=False, error="Username and password are required."), 400
    settings = _load_settings()
    if username in settings.get("admin_users", {}):
        return jsonify(ok=False, error="Username already exists."), 409
    for emp in settings.get("employees", {}).values():
        if emp.get("username") == username:
            return jsonify(ok=False, error="Username already exists."), 409
    settings.setdefault("admin_users", {})[username] = {
        "password_hash": generate_password_hash(password),
    }
    _save_settings(settings)
    return jsonify(ok=True)


@admin_bp.route("/api/admin/admins/<username>", methods=["PUT"])
@admin_required
def admin_update_admin(username: str):
    d = request.get_json(force=True)
    settings = _load_settings()
    if username not in settings.get("admin_users", {}):
        return jsonify(ok=False, error="Admin user not found."), 404
    if d.get("password"):
        settings["admin_users"][username]["password_hash"] = generate_password_hash(d["password"])
    _save_settings(settings)
    return jsonify(ok=True)


@admin_bp.route("/api/admin/admins/<username>", methods=["DELETE"])
@admin_required
def admin_delete_admin(username: str):
    if username == "admin":
        return jsonify(ok=False, error="The built-in admin account cannot be deleted."), 403
    from flask import current_app
    current = session.get("username") if not current_app.config.get("TESTING") else None
    if username == current:
        return jsonify(ok=False, error="Cannot delete your own account."), 400
    settings = _load_settings()
    if username not in settings.get("admin_users", {}):
        return jsonify(ok=False, error="Admin user not found."), 404
    del settings["admin_users"][username]
    _save_settings(settings)
    return jsonify(ok=True)


# ---------------------------------------------------------------------------
# Raw data files
# ---------------------------------------------------------------------------

@admin_bp.route("/api/admin/raw-files", methods=["GET"])
@admin_required
def admin_list_raw_files():
    d = _raw_dir()
    if not d.exists():
        return jsonify([])
    files = []
    for f in sorted(d.glob("*.txt")):
        st = f.stat()
        files.append({"name": f.name, "size": st.st_size, "modified": st.st_mtime})
    return jsonify(files)


@admin_bp.route("/api/admin/raw-files", methods=["POST"])
@admin_required
def admin_upload_raw_file():
    if "file" not in request.files:
        return jsonify(ok=False, error="No file provided."), 400
    f = request.files["file"]
    name = secure_filename(f.filename or "")
    if not name:
        return jsonify(ok=False, error="No filename."), 400
    if not name.lower().endswith(".txt"):
        return jsonify(ok=False, error="Only .txt files are accepted."), 400
    content = f.read().decode("utf-8", errors="replace")
    ok, error = validate_raw_content(content)
    if not ok:
        return jsonify(ok=False, name=name, error=error), 422
    _raw_dir().mkdir(parents=True, exist_ok=True)
    (_raw_dir() / name).write_text(content, encoding="utf-8")
    return jsonify(ok=True, name=name)


@admin_bp.route("/api/admin/raw-files/<filename>", methods=["DELETE"])
@admin_required
def admin_delete_raw_file(filename: str):
    name = secure_filename(filename)
    if not name.lower().endswith(".txt"):
        return jsonify(ok=False, error="Invalid file."), 400
    p = _raw_dir() / name
    if not p.exists():
        return jsonify(ok=False, error="File not found."), 404
    p.unlink()
    return jsonify(ok=True)
