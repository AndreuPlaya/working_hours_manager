"""Correction write use cases."""
from __future__ import annotations

import datetime
import uuid

from ..infrastructure.data import (
    _append_correction,
    add_pending,
    list_pending,
    remove_pending,
)


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


def queue_correction(
    action: str,
    emp_id: str,
    name: str,
    dept: str,
    timestamp: str,
    new_timestamp: str | None,
    submitted_by: str,
) -> None:
    item = {
        "id": str(uuid.uuid4()),
        "action": action,
        "emp_id": emp_id,
        "name": name,
        "dept": dept,
        "timestamp": timestamp,
        "new_timestamp": new_timestamp,
        "submitted_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "submitted_by": submitted_by,
    }
    add_pending(item)


def get_pending() -> list[dict]:
    return list_pending()


def approve_pending(item_id: str) -> bool:
    item = remove_pending(item_id)
    if item is None:
        return False
    if item["action"] == "ADD":
        _append_correction(
            f"ADD\t{item['emp_id']}\t{item['name']}\t{item['dept']}\t{item['timestamp']}\t1"
        )
    elif item["action"] == "EDIT":
        _append_correction(
            f"EDIT\t{item['emp_id']}\t{item['name']}\t{item['dept']}"
            f"\t{item['timestamp']}\t{item['new_timestamp']}\t1"
        )
    return True


def reject_pending(item_id: str) -> bool:
    return remove_pending(item_id) is not None
