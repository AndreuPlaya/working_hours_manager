"""Domain validation rules — no I/O, no framework dependencies."""
from __future__ import annotations

MIN_PASSWORD_LEN = 8


def validate_password(password: str, confirm: str | None = None) -> str | None:
    """Return an error message string, or None if the password is valid."""
    if len(password) < MIN_PASSWORD_LEN:
        return f"Password must be at least {MIN_PASSWORD_LEN} characters."
    if confirm is not None and password != confirm:
        return "Passwords do not match."
    return None


def is_username_taken(
    username: str,
    settings: dict,
    exclude_emp_id: str | None = None,
) -> bool:
    """True if username already exists in admin_users or employees.

    exclude_emp_id lets callers skip the employee being updated (for PUT requests).
    """
    if username in settings.get("admin_users", {}):
        return True
    for eid, emp in settings.get("employees", {}).items():
        if eid == exclude_emp_id:
            continue
        if emp.get("username") == username:
            return True
    return False
