from collections import defaultdict
from datetime import date, timedelta

from .models import ClockEvent, DayRecord, Session


def compute(events: list[ClockEvent]) -> dict[tuple[str, str], dict]:
    """Group events by employee, pair consecutive timestamps into sessions.

    Returns {(emp_id, name): {'dept': str, 'days': {date: DayRecord}}}.
    Consecutive events per employee per day are paired as clock-in / clock-out.
    An odd number of events on a day produces an incomplete DayRecord.
    """
    by_emp: dict[tuple, dict[date, list]] = defaultdict(lambda: defaultdict(list))
    emp_dept: dict[tuple, str] = {}

    for e in events:
        key = (e.emp_id, e.name)
        emp_dept[key] = e.dept
        by_emp[key][e.timestamp.date()].append(e.timestamp)

    result: dict[tuple, dict] = {}
    for key, date_map in by_emp.items():
        days: dict[date, DayRecord] = {}
        for d, timestamps in date_map.items():
            timestamps.sort()
            sessions = [
                Session(timestamps[i], timestamps[i + 1])
                for i in range(0, len(timestamps) - 1, 2)
            ]
            incomplete = len(timestamps) % 2 == 1
            total = sum((s.duration for s in sessions), timedelta())
            days[d] = DayRecord(
                sessions=sessions,
                total=total,
                incomplete=incomplete,
                dangling=timestamps[-1] if incomplete else None,
            )
        result[key] = {"dept": emp_dept[key], "days": days}
    return result
