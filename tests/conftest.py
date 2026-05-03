"""Shared fixtures and helpers for all test modules."""
from datetime import date, datetime, timedelta

import pytest

from working_hours.domain.models import ClockEvent, DayRecord, Session


def make_session(date_str: str, in_time: str, out_time: str) -> Session:
    fmt = "%Y-%m-%d %H:%M:%S"
    return Session(
        clock_in=datetime.strptime(f"{date_str} {in_time}", fmt),
        clock_out=datetime.strptime(f"{date_str} {out_time}", fmt),
    )


def make_day(sessions: list[Session], incomplete: bool = False, dangling: datetime | None = None) -> DayRecord:
    total = sum((s.duration for s in sessions), timedelta())
    return DayRecord(sessions=sessions, total=total, incomplete=incomplete, dangling=dangling)


def make_data(
    days: dict[date, DayRecord],
    emp_id: str = "1",
    name: str = "Alice",
    dept: str = "Admin",
) -> dict:
    return {(emp_id, name): {"dept": dept, "days": days}}


def make_event(emp_id: str, name: str, dt_str: str, dept: str = "Admin") -> ClockEvent:
    return ClockEvent(emp_id, name, dept, datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S"))
