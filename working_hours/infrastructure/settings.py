"""Settings management: load, save, migrate, and user lookup."""
from __future__ import annotations

import json
import secrets
from pathlib import Path

from werkzeug.security import generate_password_hash


def _config_dir() -> Path:
    from flask import current_app
    return current_app.config["DATA_ROOT"] / "config"


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


def init_app(app) -> None:
    """Migrate legacy settings format, generate secret key, and apply it to app."""
    with app.app_context():
        settings = _load_settings()
        changed = False

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

        if "secret_key" not in settings:
            settings["secret_key"] = secrets.token_hex(32)
            changed = True
        app.secret_key = settings["secret_key"]

        if changed:
            _save_settings(settings)
