from datetime import datetime, timedelta
from typing import NamedTuple, Literal


class ClockEvent(NamedTuple):
    emp_id: str
    name: str
    dept: str
    timestamp: datetime


class Session(NamedTuple):
    clock_in: datetime
    clock_out: datetime

    @property
    def duration(self) -> timedelta:
        return self.clock_out - self.clock_in


class DayRecord(NamedTuple):
    sessions: list[Session]
    total: timedelta
    incomplete: bool        # odd number of events → missing clock-out
    dangling: datetime | None  # the unpaired clock-in when incomplete


class CorrectionItem(NamedTuple):
    action: Literal["ADD", "DEL", "EDIT"]
    event: ClockEvent       # new event (ADD/EDIT) or event to remove (DEL)
    old_timestamp: datetime | None  # EDIT only: the timestamp being replaced
