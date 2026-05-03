from datetime import datetime, timedelta

from working_hours.domain.models import ClockEvent, DayRecord, Session


def test_session_duration():
    s = Session(datetime(2024, 1, 15, 9, 0, 0), datetime(2024, 1, 15, 17, 30, 0))
    assert s.duration == timedelta(hours=8, minutes=30)


def test_session_duration_zero():
    s = Session(datetime(2024, 1, 15, 9, 0, 0), datetime(2024, 1, 15, 9, 0, 0))
    assert s.duration == timedelta(0)


def test_clock_event_fields():
    ts = datetime(2024, 1, 15, 9, 0, 0)
    e = ClockEvent("1", "Alice", "Admin", ts)
    assert e.emp_id == "1"
    assert e.name == "Alice"
    assert e.dept == "Admin"
    assert e.timestamp == ts


def test_day_record_complete():
    s = Session(datetime(2024, 1, 15, 9, 0), datetime(2024, 1, 15, 17, 0))
    rec = DayRecord(sessions=[s], total=timedelta(hours=8), incomplete=False, dangling=None)
    assert not rec.incomplete
    assert rec.dangling is None
    assert rec.total == timedelta(hours=8)


def test_day_record_incomplete():
    dangling = datetime(2024, 1, 15, 9, 0)
    rec = DayRecord(sessions=[], total=timedelta(), incomplete=True, dangling=dangling)
    assert rec.incomplete
    assert rec.dangling == dangling
