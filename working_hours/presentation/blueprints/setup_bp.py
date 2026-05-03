"""First-run setup route and before-request guard."""
from __future__ import annotations

from flask import Blueprint, current_app, jsonify, redirect, render_template, request, session, url_for
from werkzeug.security import generate_password_hash

from ..settings import _load_settings, _save_settings

setup_bp = Blueprint("setup", __name__)


def _needs_setup() -> bool:
    return not _load_settings().get("admin_users")


@setup_bp.before_app_request
def _check_setup():
    if current_app.config.get("TESTING"):
        return
    if request.endpoint in ("setup.setup_page", "static"):
        return
    if session.get("username"):
        return
    if _needs_setup():
        if request.path.startswith("/api/"):
            return jsonify(ok=False, error="Setup required."), 503
        return redirect(url_for("setup.setup_page"))


@setup_bp.route("/setup", methods=["GET", "POST"])
def setup_page():
    if not _needs_setup():
        return redirect(url_for("auth.login_page"))
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
            return redirect(url_for("auth.login_page"))
    return render_template("setup.html", error=error)
