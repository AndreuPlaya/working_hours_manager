"""Raw data file management use cases."""
from __future__ import annotations

from werkzeug.utils import secure_filename

from ..domain.parser import validate_raw_content
from ..infrastructure.data import _raw_dir


def list_raw_files() -> list[dict]:
    d = _raw_dir()
    if not d.exists():
        return []
    return [
        {"name": f.name, "size": f.stat().st_size, "modified": f.stat().st_mtime}
        for f in sorted(d.glob("*.txt"))
    ]


def save_raw_file(name: str, content: str) -> tuple[bool, str]:
    """Validate and persist a raw data file. Returns (ok, error_message)."""
    name = secure_filename(name)
    if not name:
        return False, "No filename."
    if not name.lower().endswith(".txt"):
        return False, "Only .txt files are accepted."
    ok, error = validate_raw_content(content)
    if not ok:
        return False, error
    d = _raw_dir()
    d.mkdir(parents=True, exist_ok=True)
    (d / name).write_text(content, encoding="utf-8")
    return True, ""


def delete_raw_file(filename: str) -> tuple[bool, str]:
    """Delete a raw data file. Returns (ok, error_message)."""
    name = secure_filename(filename)
    if not name.lower().endswith(".txt"):
        return False, "Invalid file."
    p = _raw_dir() / name
    if not p.exists():
        return False, "File not found."
    p.unlink()
    return True, ""
