"""Flask application factory and server entry point."""
from __future__ import annotations

import secrets
from pathlib import Path

from flask import Flask

from .blueprints.admin_bp import admin_bp
from .blueprints.auth_bp import auth_bp
from .blueprints.editor_bp import editor_bp
from .blueprints.setup_bp import setup_bp

app = Flask(__name__)
app.secret_key = secrets.token_hex(16)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB upload limit

_root = Path(".")

app.register_blueprint(setup_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(editor_bp)
app.register_blueprint(admin_bp)


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
    from .settings import init_app
    _compile_scss()
    init_app(app)
    waitress_serve(app, host=host, port=port)
