"""Event loading and correction file helpers."""
from __future__ import annotations

from pathlib import Path

from flask import current_app

from ..domain.parser import apply_corrections, parse_correction_file, parse_file
from .settings import _load_settings

_EDITOR_FILE = "editor-corrections.txt"


def _raw_dir() -> Path:
    return current_app.config["DATA_ROOT"] / "input_data"


def _corrections_dir() -> Path:
    return current_app.config["DATA_ROOT"] / "corrections"


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
