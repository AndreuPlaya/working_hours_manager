"""First-run setup route and before-request guard."""
from __future__ import annotations

from flask import Blueprint, jsonify, redirect, render_template, request, session, url_for

from ...application.user_service import create_initial_admin, needs_setup

setup_bp = Blueprint("setup", __name__)


@setup_bp.before_app_request
def _check_setup():
    if request.endpoint in ("setup.setup_page", "static"):
        return
    if session.get("username"):
        return
    if needs_setup():
        if request.path.startswith("/api/"):
            return jsonify(ok=False, error="Setup required."), 503
        return redirect(url_for("setup.setup_page"))


@setup_bp.route("/setup", methods=["GET", "POST"])
def setup_page():
    if not needs_setup():
        return redirect(url_for("auth.login_page"))
    error = ""
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        confirm = request.form.get("confirm", "")
        error = create_initial_admin(username, password, confirm) or ""
        if not error:
            return redirect(url_for("auth.login_page"))
    return render_template("setup.html", error=error)
