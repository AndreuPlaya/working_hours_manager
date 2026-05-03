"""Authentication decorators and access-control helpers."""
from __future__ import annotations

from functools import wraps

from flask import jsonify, redirect, request, session, url_for


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "username" not in session:
            if request.path.startswith("/api/"):
                return jsonify(ok=False, error="Not authenticated"), 401
            return redirect(url_for("auth.login_page"))
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "username" not in session:
            if request.path.startswith("/api/"):
                return jsonify(ok=False, error="Not authenticated"), 401
            return redirect(url_for("auth.login_page"))
        if not session.get("is_admin"):
            if request.path.startswith("/api/"):
                return jsonify(ok=False, error="Admin required"), 403
            return redirect(url_for("editor.index"))
        return f(*args, **kwargs)
    return decorated


def _require_admin() -> tuple | None:
    """Block non-admins inline. Returns a 403 response tuple or None."""
    if session.get("is_admin"):
        return None
    return jsonify(ok=False, error="Admin access required."), 403


def _check_emp_ownership(emp_id: str) -> tuple | None:
    """For employee sessions, verify the request emp_id matches their own."""
    if session.get("is_admin"):
        return None
    session_emp = str(session.get("emp_id", ""))
    if not session_emp or str(emp_id) != session_emp:
        return jsonify(ok=False, error="Not authorized."), 403
    return None
