"""Login and logout routes."""
from __future__ import annotations

from flask import Blueprint, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash

from ..settings import _find_user

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["GET", "POST"])
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
            return redirect(url_for("editor.index"))
        return redirect(url_for("auth.login_page", error=1))
    error = "Invalid username or password." if request.args.get("error") else ""
    return render_template("login.html", error=error)


@auth_bp.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("auth.login_page"))
