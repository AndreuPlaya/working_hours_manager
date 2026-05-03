"""Correction write use cases."""
from __future__ import annotations

from ..infrastructure.data import _append_correction


def add_correction(emp_id: str, name: str, dept: str, timestamp: str) -> None:
    _append_correction(f"ADD\t{emp_id}\t{name}\t{dept}\t{timestamp}\t1")


def delete_correction(emp_id: str, name: str, dept: str, timestamp: str) -> None:
    _append_correction(f"DEL\t{emp_id}\t{name}\t{dept}\t{timestamp}\t1")


def edit_correction(
    emp_id: str, name: str, dept: str, old_ts: str, new_ts: str
) -> None:
    _append_correction(f"EDIT\t{emp_id}\t{name}\t{dept}\t{old_ts}\t{new_ts}\t1")


def bulk_delete(items: list[dict]) -> None:
    for item in items:
        delete_correction(item["emp_id"], item["name"], item["dept"], item["timestamp"])
