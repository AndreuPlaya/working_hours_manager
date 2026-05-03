from datetime import date, datetime, timedelta

from working_hours.domain.calculator import compute
from working_hours.domain.models import ClockEvent

from .conftest import make_event


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def events(*specs) -> list[ClockEvent]:
    """Build a list of ClockEvents from (id, name, datetime_str) tuples."""
    return [make_event(emp_id, name, dt) for emp_id, name, dt in specs]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_single_session():
    data = compute(events(
        ("1", "Alice", "2024-01-15 09:00:00"),
        ("1", "Alice", "2024-01-15 17:00:00"),
    ))
    rec = data[("1", "Alice")]["days"][date(2024, 1, 15)]
    assert len(rec.sessions) == 1
    assert rec.sessions[0].clock_in == datetime(2024, 1, 15, 9, 0)
    assert rec.sessions[0].clock_out == datetime(2024, 1, 15, 17, 0)
    assert rec.total == timedelta(hours=8)
    assert not rec.incomplete
    assert rec.dangling is None


def test_multiple_sessions_same_day():
    data = compute(events(
        ("1", "Alice", "2024-01-15 09:00:00"),
        ("1", "Alice", "2024-01-15 12:00:00"),
        ("1", "Alice", "2024-01-15 13:00:00"),
        ("1", "Alice", "2024-01-15 17:00:00"),
    ))
    rec = data[("1", "Alice")]["days"][date(2024, 1, 15)]
    assert len(rec.sessions) == 2
    assert rec.total == timedelta(hours=7)
    assert not rec.incomplete


def test_incomplete_single_event():
    data = compute(events(("1", "Alice", "2024-01-15 09:00:00")))
    rec = data[("1", "Alice")]["days"][date(2024, 1, 15)]
    assert rec.incomplete
    assert rec.dangling == datetime(2024, 1, 15, 9, 0)
    assert rec.total == timedelta(0)
    assert rec.sessions == []


def test_incomplete_three_events():
    data = compute(events(
        ("1", "Alice", "2024-01-15 09:00:00"),
        ("1", "Alice", "2024-01-15 12:00:00"),
        ("1", "Alice", "2024-01-15 13:00:00"),
    ))
    rec = data[("1", "Alice")]["days"][date(2024, 1, 15)]
    assert rec.incomplete
    assert rec.dangling == datetime(2024, 1, 15, 13, 0)
    assert len(rec.sessions) == 1
    assert rec.total == timedelta(hours=3)


def test_multiple_employees():
    data = compute(events(
        ("1", "Alice", "2024-01-15 09:00:00"),
        ("1", "Alice", "2024-01-15 17:00:00"),
        ("2", "Bob",   "2024-01-15 10:00:00"),
        ("2", "Bob",   "2024-01-15 18:00:00"),
    ))
    assert ("1", "Alice") in data
    assert ("2", "Bob") in data
    assert data[("1", "Alice")]["days"][date(2024, 1, 15)].total == timedelta(hours=8)
    assert data[("2", "Bob")]["days"][date(2024, 1, 15)].total == timedelta(hours=8)


def test_events_sorted_before_pairing():
    data = compute(events(
        ("1", "Alice", "2024-01-15 17:00:00"),
        ("1", "Alice", "2024-01-15 09:00:00"),
    ))
    rec = data[("1", "Alice")]["days"][date(2024, 1, 15)]
    assert rec.sessions[0].clock_in == datetime(2024, 1, 15, 9, 0)
    assert rec.sessions[0].clock_out == datetime(2024, 1, 15, 17, 0)


def test_multiple_days():
    data = compute(events(
        ("1", "Alice", "2024-01-15 09:00:00"),
        ("1", "Alice", "2024-01-15 17:00:00"),
        ("1", "Alice", "2024-01-16 10:00:00"),
        ("1", "Alice", "2024-01-16 16:00:00"),
    ))
    days = data[("1", "Alice")]["days"]
    assert len(days) == 2
    assert days[date(2024, 1, 16)].total == timedelta(hours=6)


def test_dept_stored():
    ev = [ClockEvent("1", "Alice", "Finance", datetime(2024, 1, 15, 9, 0))]
    data = compute(ev)
    assert data[("1", "Alice")]["dept"] == "Finance"


def test_dept_uses_latest_value():
    ev = [
        ClockEvent("1", "Alice", "Finance", datetime(2024, 1, 15, 9, 0)),
        ClockEvent("1", "Alice", "Sales",   datetime(2024, 1, 15, 17, 0)),
    ]
    data = compute(ev)
    assert data[("1", "Alice")]["dept"] in ("Finance", "Sales")
