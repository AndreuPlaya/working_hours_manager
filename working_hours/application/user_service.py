"""User management use cases: auth, password ops, admin CRUD, employee CRUD.

All password hashing lives here — nowhere else imports werkzeug.security directly.
"""
from __future__ import annotations

from werkzeug.security import check_password_hash, generate_password_hash

from ..domain.validators import is_username_taken, validate_password
from ..infrastructure.settings import _find_user, _load_settings, _save_settings


# ---------------------------------------------------------------------------
# Password primitives
# ---------------------------------------------------------------------------

def hash_password(raw: str) -> str:
    return generate_password_hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    return check_password_hash(hashed, raw)


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

def find_user(username: str) -> tuple[dict | None, str | None, bool]:
    """Delegate to settings layer; returns (user_dict, emp_id, is_admin)."""
    return _find_user(username)


def authenticate(
    username: str, password: str
) -> tuple[dict | None, str | None, bool]:
    """Return (user, emp_id, is_admin) if credentials are valid and account enabled.

    Returns (None, None, False) on any failure.
    """
    user, emp_id, is_admin = _find_user(username)
    if not user:
        return None, None, False
    if not verify_password(password, user.get("password_hash", "")):
        return None, None, False
    if emp_id is not None and not user.get("enabled", True):
        return None, None, False
    return user, emp_id, is_admin


# ---------------------------------------------------------------------------
# First-run setup
# ---------------------------------------------------------------------------

def needs_setup() -> bool:
    return not _load_settings().get("admin_users")


def create_initial_admin(username: str, password: str, confirm: str) -> str | None:
    """Create the very first admin account. Returns an error string or None."""
    if not username:
        return "Username is required."
    if not password:
        return "Password is required."
    err = validate_password(password, confirm)
    if err:
        return err
    settings = _load_settings()
    settings.setdefault("admin_users", {})[username] = {
        "password_hash": hash_password(password),
    }
    _save_settings(settings)
    return None


# ---------------------------------------------------------------------------
# Self-service password change
# ---------------------------------------------------------------------------

_MISSING_FIELDS = "MISSING_FIELDS"
_NOT_FOUND = "NOT_FOUND"
_WRONG_PASSWORD = "WRONG_PASSWORD"


def change_password(username: str, current_pw: str, new_pw: str) -> str | None:
    """Change a user's own password. Returns a sentinel string or None on success."""
    if not current_pw or not new_pw:
        return _MISSING_FIELDS
    user, emp_id, is_admin = _find_user(username)
    if not user:
        return _NOT_FOUND
    if not verify_password(current_pw, user.get("password_hash", "")):
        return _WRONG_PASSWORD
    settings = _load_settings()
    new_hash = hash_password(new_pw)
    if is_admin:
        settings["admin_users"][username]["password_hash"] = new_hash
    else:
        settings["employees"][emp_id]["password_hash"] = new_hash
    _save_settings(settings)
    return None


# ---------------------------------------------------------------------------
# Admin account CRUD
# ---------------------------------------------------------------------------

def list_admins() -> list[dict]:
    return [{"username": u} for u in _load_settings().get("admin_users", {})]


def create_admin(username: str, password: str) -> str | None:
    """Create an admin account. Returns an error sentinel or None."""
    if not username or not password:
        return _MISSING_FIELDS
    settings = _load_settings()
    if is_username_taken(username, settings):
        return "USERNAME_TAKEN"
    settings.setdefault("admin_users", {})[username] = {
        "password_hash": hash_password(password),
    }
    _save_settings(settings)
    return None


def update_admin_password(username: str, new_password: str) -> str | None:
    """Update an admin's password. Returns an error sentinel or None."""
    settings = _load_settings()
    if username not in settings.get("admin_users", {}):
        return _NOT_FOUND
    if new_password:
        settings["admin_users"][username]["password_hash"] = hash_password(new_password)
    _save_settings(settings)
    return None


def delete_admin(username: str, current_username: str | None) -> str | None:
    """Delete an admin account. Returns an error sentinel or None."""
    if username == "admin":
        return "PROTECTED"
    if username == current_username:
        return "SELF_DELETE"
    settings = _load_settings()
    if username not in settings.get("admin_users", {}):
        return _NOT_FOUND
    del settings["admin_users"][username]
    _save_settings(settings)
    return None


# ---------------------------------------------------------------------------
# Employee CRUD
# ---------------------------------------------------------------------------

def list_employees(events: list) -> list[dict]:
    """Build employee list merging raw event data with settings."""
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
    return result


def update_employee(emp_id: str, data: dict) -> str | None:
    """Update employee record fields. Returns an error sentinel or None."""
    settings = _load_settings()
    emp = settings.setdefault("employees", {}).setdefault(emp_id, {})
    new_username = data.get("username", emp.get("username", "")).strip()
    if new_username and new_username != emp.get("username", ""):
        if is_username_taken(new_username, settings, exclude_emp_id=emp_id):
            return "USERNAME_TAKEN"
    if "alias" in data:
        emp["alias"] = data["alias"].strip()
    if "full_name" in data:
        emp["full_name"] = data["full_name"].strip()
    emp["username"] = new_username
    if "enabled" in data:
        emp["enabled"] = bool(data["enabled"])
    if data.get("password"):
        emp["password_hash"] = hash_password(data["password"])
    _save_settings(settings)
    return None


def get_profiles() -> dict:
    """Return {emp_id: {alias, full_name}} for all employees."""
    employees = _load_settings().get("employees", {})
    return {
        emp_id: {"alias": emp.get("alias", ""), "full_name": emp.get("full_name", "")}
        for emp_id, emp in employees.items()
    }
