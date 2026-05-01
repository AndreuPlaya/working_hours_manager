"""Flask-based web editor for clocking corrections."""
from __future__ import annotations

import json
import secrets
from collections import defaultdict
from datetime import date, timedelta
from functools import wraps
from pathlib import Path

from flask import (
    Flask,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

from .calculator import compute
from .parser import apply_corrections, parse_correction_file, parse_file
from .reporter import _build_rows, fmt_td

app = Flask(__name__)
app.secret_key = secrets.token_hex(16)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB upload limit
_root = Path(".")
_EDITOR_FILE = "editor-corrections.txt"

# ---------------------------------------------------------------------------
# Settings helpers
# ---------------------------------------------------------------------------

def _config_dir() -> Path:
    return _root / "config"

def _settings_path() -> Path:
    return _config_dir() / "settings.json"

def _load_settings() -> dict:
    p = _settings_path()
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return {"employees": {}, "admin_users": {}}

def _save_settings(data: dict) -> None:
    p = _settings_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

def _init_app() -> None:
    settings = _load_settings()
    changed = False

    # Migrate from old auth_users + profiles format
    if "auth_users" in settings and "employees" not in settings:
        new_employees: dict = {}
        new_admins: dict = {}
        profiles = settings.get("profiles", {})
        for username, user in settings.get("auth_users", {}).items():
            emp_id = user.get("emp_id")
            if emp_id:
                p = profiles.get(str(emp_id), {})
                new_employees[str(emp_id)] = {
                    "alias": p.get("alias", ""),
                    "full_name": p.get("full_name", ""),
                    "username": username,
                    "password_hash": user.get("password_hash", ""),
                    "is_admin": user.get("is_admin", False),
                }
            else:
                new_admins[username] = {"password_hash": user.get("password_hash", "")}
        # Profiles without a linked user
        for emp_id, p in profiles.items():
            if emp_id not in new_employees:
                new_employees[emp_id] = {
                    "alias": p.get("alias", ""),
                    "full_name": p.get("full_name", ""),
                    "username": "",
                    "password_hash": "",
                    "is_admin": False,
                }
        settings.pop("auth_users", None)
        settings.pop("profiles", None)
        settings["employees"] = new_employees
        settings["admin_users"] = new_admins
        changed = True

    # Secret key — generated once and persisted in settings.json
    if "secret_key" not in settings:
        settings["secret_key"] = secrets.token_hex(32)
        changed = True
    app.secret_key = settings["secret_key"]

    if changed:
        _save_settings(settings)

def _find_user(username: str) -> tuple[dict | None, str | None, bool]:
    """Return (user_dict, emp_id, is_admin)."""
    settings = _load_settings()
    admin = settings.get("admin_users", {}).get(username)
    if admin:
        return admin, None, True
    for emp_id, emp in settings.get("employees", {}).items():
        if emp.get("username") == username:
            return emp, emp_id, emp.get("is_admin", False)
    return None, None, False

# ---------------------------------------------------------------------------
# First-run setup
# ---------------------------------------------------------------------------

def _needs_setup() -> bool:
    """True when no admin accounts exist yet."""
    return not _load_settings().get("admin_users")


@app.before_request
def _check_setup():
    if app.config.get("TESTING"):
        return
    if request.endpoint in ("setup_page", "static"):
        return
    if session.get("username"):
        return
    if _needs_setup():
        if request.path.startswith("/api/"):
            return jsonify(ok=False, error="Setup required."), 503
        return redirect(url_for("setup_page"))


@app.route("/setup", methods=["GET", "POST"])
def setup_page():
    if not _needs_setup():
        return redirect(url_for("login_page"))
    error = ""
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        confirm = request.form.get("confirm", "")
        if not username:
            error = "Username is required."
        elif not password:
            error = "Password is required."
        elif len(password) < 8:
            error = "Password must be at least 8 characters."
        elif password != confirm:
            error = "Passwords do not match."
        else:
            settings = _load_settings()
            settings.setdefault("admin_users", {})[username] = {
                "password_hash": generate_password_hash(password),
            }
            _save_settings(settings)
            return redirect(url_for("login_page"))
    return render_template("setup.html", error=error)


# ---------------------------------------------------------------------------
# Auth decorators
# ---------------------------------------------------------------------------

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if app.config.get("TESTING"):
            return f(*args, **kwargs)
        if "username" not in session:
            if request.path.startswith("/api/"):
                return jsonify(ok=False, error="Not authenticated"), 401
            return redirect(url_for("login_page"))
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if app.config.get("TESTING"):
            return f(*args, **kwargs)
        if "username" not in session:
            if request.path.startswith("/api/"):
                return jsonify(ok=False, error="Not authenticated"), 401
            return redirect(url_for("login_page"))
        if not session.get("is_admin"):
            if request.path.startswith("/api/"):
                return jsonify(ok=False, error="Admin required"), 403
            return redirect(url_for("index"))
        return f(*args, **kwargs)
    return decorated

# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

def _raw_dir() -> Path:
    return _root / "input_data"

def _corrections_dir() -> Path:
    return _root / "corrections"

def _load_events() -> list:
    raw = [e for f in sorted(_raw_dir().glob("*.txt")) for e in parse_file(f)]
    corrections = [
        c for f in sorted(_corrections_dir().glob("*.txt"))
        for c in parse_correction_file(f)
    ]
    return apply_corrections(raw, corrections)

def _apply_name_overrides(events: list) -> list:
    employees = _load_settings().get("employees", {})
    result = []
    for e in events:
        full_name = employees.get(str(e.emp_id), {}).get("full_name", "").strip()
        result.append(e._replace(name=full_name) if full_name else e)
    return result

def _append_correction(line: str) -> None:
    p = _corrections_dir() / _EDITOR_FILE
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "a", encoding="utf-8") as f:
        f.write(line + "\n")

# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

@app.route("/login", methods=["GET", "POST"])
def login_page():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        user, emp_id, is_admin = _find_user(username)
        if user and check_password_hash(user.get("password_hash", ""), password):
            if emp_id is not None and not user.get("enabled", True):
                return render_template("login.html", error="Account is disabled.")
            session.clear()
            session["username"] = username
            session["is_admin"] = is_admin
            session["emp_id"] = emp_id
            return redirect(url_for("index"))
        return redirect(url_for("login_page", error=1))
    error = "Invalid username or password." if request.args.get("error") else ""
    return render_template("login.html", error=error)

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login_page"))

# ---------------------------------------------------------------------------
# Editor routes
# ---------------------------------------------------------------------------

@app.route("/")
@login_required
def index():
    return render_template("editor.html")

@app.route("/reports/")
@login_required
def reports_index():
    if not app.config.get("TESTING") and not session.get("is_admin"):
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

@app.route("/reports/<stem>")
@login_required
def report(stem: str):
    if not app.config.get("TESTING") and not session.get("is_admin"):
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

@app.route("/api/employee-reports/<emp_id>")
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

@app.route("/api/my-reports")
@login_required
def my_reports():
    if app.config.get("TESTING"):
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

@app.route("/api/config")
@login_required
def get_config():
    if app.config.get("TESTING"):
        return jsonify(restrict_edits=False, username="", is_admin=False, emp_id=None)
    is_admin = session.get("is_admin", False)
    emp_id = session.get("emp_id")
    return jsonify(
        restrict_edits=not is_admin,
        username=session.get("username", ""),
        is_admin=is_admin,
        emp_id=emp_id,
    )

@app.route("/api/change-password", methods=["PUT"])
@login_required
def change_password():
    d = request.get_json(force=True)
    if app.config.get("TESTING"):
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


@app.route("/api/profiles")
@login_required
def get_profiles():
    employees = _load_settings().get("employees", {})
    return jsonify({
        emp_id: {"alias": emp.get("alias", ""), "full_name": emp.get("full_name", "")}
        for emp_id, emp in employees.items()
    })

def _require_admin() -> tuple | None:
    """Block non-admins in production. Returns 403 or None."""
    if app.config.get("TESTING") or session.get("is_admin"):
        return None
    return jsonify(ok=False, error="Admin access required."), 403


def _check_emp_ownership(emp_id: str) -> tuple | None:
    """For employee sessions, verify the request emp_id matches their own."""
    if app.config.get("TESTING") or session.get("is_admin"):
        return None
    session_emp = str(session.get("emp_id", ""))
    if not session_emp or str(emp_id) != session_emp:
        return jsonify(ok=False, error="Not authorized."), 403
    return None


@app.route("/api/events")
@login_required
def get_events():
    events = _load_events()
    if not app.config.get("TESTING"):
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

@app.route("/api/add", methods=["POST"])
@login_required
def add_event():
    d = request.get_json(force=True)
    err = _check_emp_ownership(d.get("emp_id", ""))
    if err:
        return err
    _append_correction(f"ADD\t{d['emp_id']}\t{d['name']}\t{d['dept']}\t{d['timestamp']}\t1")
    return jsonify(ok=True)

@app.route("/api/delete", methods=["POST"])
@login_required
def delete_event():
    err = _require_admin()
    if err:
        return err
    d = request.get_json(force=True)
    _append_correction(f"DEL\t{d['emp_id']}\t{d['name']}\t{d['dept']}\t{d['timestamp']}\t1")
    return jsonify(ok=True)

@app.route("/api/edit", methods=["POST"])
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

@app.route("/api/bulk-delete", methods=["POST"])
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

# ---------------------------------------------------------------------------
# Admin routes
# ---------------------------------------------------------------------------

@app.route("/admin")
@admin_required
def admin_page():
    return render_template("admin.html")

@app.route("/api/admin/employees", methods=["GET"])
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

@app.route("/api/admin/employees/<emp_id>", methods=["PUT"])
@admin_required
def admin_update_employee(emp_id: str):
    d = request.get_json(force=True)
    settings = _load_settings()
    emp = settings.setdefault("employees", {}).setdefault(emp_id, {})
    new_username = d.get("username", emp.get("username", "")).strip()
    # Enforce username uniqueness
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

@app.route("/api/admin/admins", methods=["GET"])
@admin_required
def admin_get_admins():
    settings = _load_settings()
    return jsonify([{"username": u} for u in settings.get("admin_users", {})])

@app.route("/api/admin/admins", methods=["POST"])
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

@app.route("/api/admin/admins/<username>", methods=["PUT"])
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

@app.route("/api/admin/admins/<username>", methods=["DELETE"])
@admin_required
def admin_delete_admin(username: str):
    if username == "admin":
        return jsonify(ok=False, error="The built-in admin account cannot be deleted."), 403
    current = session.get("username") if not app.config.get("TESTING") else None
    if username == current:
        return jsonify(ok=False, error="Cannot delete your own account."), 400
    settings = _load_settings()
    if username not in settings.get("admin_users", {}):
        return jsonify(ok=False, error="Admin user not found."), 404
    del settings["admin_users"][username]
    _save_settings(settings)
    return jsonify(ok=True)

# ---------------------------------------------------------------------------
# Raw data file routes
# ---------------------------------------------------------------------------

@app.route("/api/admin/raw-files", methods=["GET"])
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

@app.route("/api/admin/raw-files", methods=["POST"])
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
    _raw_dir().mkdir(parents=True, exist_ok=True)
    f.save(str(_raw_dir() / name))
    return jsonify(ok=True, name=name)

@app.route("/api/admin/raw-files/<filename>", methods=["DELETE"])
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

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def _compile_scss() -> None:
    try:
        import sass
    except ImportError:
        return
    scss_dir = Path(__file__).parent / "static" / "scss"
    css_dir = Path(__file__).parent / "static" / "css"
    css_dir.mkdir(exist_ok=True)
    for f in sorted(scss_dir.glob("*.scss")):
        if f.name.startswith("_"):
            continue
        css = sass.compile(filename=str(f), output_style="compressed")
        (css_dir / (f.stem + ".css")).write_text(css, encoding="utf-8")


def serve(host: str = "0.0.0.0", port: int = 5000) -> None:
    from waitress import serve as waitress_serve
    _compile_scss()
    _init_app()
    waitress_serve(app, host=host, port=port)

