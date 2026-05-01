import re
import sys
from datetime import datetime
from pathlib import Path

from .models import ClockEvent, CorrectionItem


def parse_file(path: Path) -> list[ClockEvent]:
    """Parse a tab-separated clocking export file.

    Skips header lines and lines starting with # (comment/correction markers).
    Normalises inconsistent whitespace in the timestamp column.
    """
    events: list[ClockEvent] = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) < 4:
                continue
            raw_id = parts[0].strip().rstrip(".")
            if not raw_id.isdigit():
                continue
            name = parts[1].strip()
            dept = parts[2].strip()
            time_str = re.sub(r"\s+", " ", parts[3].strip())
            try:
                ts = datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S")
            except ValueError:
                continue
            events.append(ClockEvent(raw_id, name, dept, ts))
    return events


def _parse_event_parts(parts: list[str]) -> ClockEvent | None:
    """Parse [id, name, dept, timestamp, ...] into a ClockEvent."""
    if len(parts) < 4:
        return None
    raw_id = parts[0].strip().rstrip(".")
    if not raw_id.isdigit():
        return None
    name = parts[1].strip()
    dept = parts[2].strip()
    time_str = re.sub(r"\s+", " ", parts[3].strip())
    try:
        ts = datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None
    return ClockEvent(raw_id, name, dept, ts)


def parse_correction_file(path: Path) -> list[CorrectionItem]:
    """Parse a corrections file with optional ADD/DEL/EDIT action prefixes.

    Plain lines (no prefix) are treated as ADD for backwards compatibility.
    EDIT format: EDIT <tab> id <tab> name <tab> dept <tab> old_ts <tab> new_ts [<tab> device]
    """
    items: list[CorrectionItem] = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if line.startswith("#") or not line.strip():
                continue
            parts = line.split("\t")
            first = parts[0].strip()

            if first in ("ADD", "DEL", "EDIT"):
                action = first
                rest = parts[1:]
            else:
                action = "ADD"
                rest = parts

            if action == "EDIT":
                # EDIT: id, name, dept, old_ts, new_ts[, device_id]
                if len(rest) < 5:
                    continue
                raw_id = rest[0].strip().rstrip(".")
                if not raw_id.isdigit():
                    continue
                name = rest[1].strip()
                dept = rest[2].strip()
                old_ts_str = re.sub(r"\s+", " ", rest[3].strip())
                new_ts_str = re.sub(r"\s+", " ", rest[4].strip())
                try:
                    old_ts = datetime.strptime(old_ts_str, "%Y-%m-%d %H:%M:%S")
                    new_ts = datetime.strptime(new_ts_str, "%Y-%m-%d %H:%M:%S")
                except ValueError:
                    continue
                items.append(CorrectionItem(
                    action="EDIT",
                    event=ClockEvent(raw_id, name, dept, new_ts),
                    old_timestamp=old_ts,
                ))
            else:
                event = _parse_event_parts(rest)
                if event is None:
                    continue
                items.append(CorrectionItem(action=action, event=event, old_timestamp=None))
    return items


def apply_corrections(raw: list[ClockEvent], corrections: list[CorrectionItem]) -> list[ClockEvent]:
    """Apply ADD/DEL/EDIT corrections to a raw event list, in order."""
    events = list(raw)
    for item in corrections:
        if item.action == "ADD":
            events.append(item.event)
        elif item.action == "DEL":
            events = [
                e for e in events
                if not (e.emp_id == item.event.emp_id and e.timestamp == item.event.timestamp)
            ]
        elif item.action == "EDIT":
            events = [
                ClockEvent(e.emp_id, e.name, e.dept, item.event.timestamp)
                if (e.emp_id == item.event.emp_id and e.timestamp == item.old_timestamp)
                else e
                for e in events
            ]
    return events


def validate_raw_content(content: str) -> tuple[bool, str]:
    """Return (True, '') if content has at least one parseable clock event."""
    for line in content.splitlines():
        if line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 4:
            continue
        raw_id = parts[0].strip().rstrip(".")
        if not raw_id.isdigit():
            continue
        time_str = re.sub(r"\s+", " ", parts[3].strip())
        try:
            datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S")
            return True, ""
        except ValueError:
            continue
    return False, "No valid clock events found. Expected tab-separated rows: ID, Name, Dept, Timestamp (YYYY-MM-DD HH:MM:SS)."


def collect_raw_files(args: list[str]) -> list[Path]:
    """Resolve CLI arguments to raw input .txt files.

    With no arguments, reads input_data/ automatically.
    """
    if not args:
        d = Path("input_data")
        return sorted(d.glob("*.txt")) if d.is_dir() else []

    paths: list[Path] = []
    for arg in args:
        p = Path(arg)
        if p.is_dir():
            paths.extend(sorted(p.glob("*.txt")))
        elif p.is_file():
            paths.append(p)
        else:
            print(f"Warning: {arg!r} not found, skipping.", file=sys.stderr)
    return paths


def collect_correction_files() -> list[Path]:
    """Return all .txt files from the corrections/ directory."""
    d = Path("corrections")
    return sorted(d.glob("*.txt")) if d.is_dir() else []


def collect_files(args: list[str]) -> list[Path]:
    """Resolve CLI arguments to a list of .txt files to process.

    With no arguments, reads input_data/ and corrections/ automatically.
    """
    if not args:
        paths: list[Path] = []
        for d in (Path("input_data"), Path("corrections")):
            if d.is_dir():
                paths.extend(sorted(d.glob("*.txt")))
        return paths

    paths = []
    for arg in args:
        p = Path(arg)
        if p.is_dir():
            paths.extend(sorted(p.glob("*.txt")))
        elif p.is_file():
            paths.append(p)
        else:
            print(f"Warning: {arg!r} not found, skipping.", file=sys.stderr)
    return paths
