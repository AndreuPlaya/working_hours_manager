import sys
from datetime import date, datetime, timedelta
from unittest.mock import MagicMock

import pytest

from working_hours.domain.models import DayRecord, Session
from working_hours.infrastructure.reporter import (
    _build_rows,
    display,
    format_report,
    fmt_td,
    fmt_time,
)

from .conftest import make_data, make_day, make_session


# ---------------------------------------------------------------------------
# fmt_td
# ---------------------------------------------------------------------------

def test_fmt_td_zero():
    assert fmt_td(timedelta(0)) == "0h 00m"


def test_fmt_td_whole_hours():
    assert fmt_td(timedelta(hours=8)) == "8h 00m"


def test_fmt_td_minutes_padded():
    assert fmt_td(timedelta(hours=2, minutes=5)) == "2h 05m"


def test_fmt_td_large():
    assert fmt_td(timedelta(hours=100, minutes=59)) == "100h 59m"


def test_fmt_td_seconds_truncated():
    assert fmt_td(timedelta(hours=1, minutes=0, seconds=59)) == "1h 00m"


# ---------------------------------------------------------------------------
# fmt_time
# ---------------------------------------------------------------------------

def test_fmt_time():
    assert fmt_time(datetime(2024, 1, 15, 9, 5, 3)) == "09:05:03"


def test_fmt_time_midnight():
    assert fmt_time(datetime(2024, 1, 15, 0, 0, 0)) == "00:00:00"


# ---------------------------------------------------------------------------
# _build_rows
# ---------------------------------------------------------------------------

def test_build_rows_single_session():
    s = make_session("2024-01-15", "09:00:00", "17:00:00")
    rows, total = _build_rows({date(2024, 1, 15): make_day([s])})
    assert total == timedelta(hours=8)
    assert len(rows) == 1
    date_label, t_in, t_out, dur, is_subtotal = rows[0]
    assert "2024-01-15" in date_label
    assert t_in == "09:00:00"
    assert t_out == "17:00:00"
    assert not is_subtotal


def test_build_rows_incomplete_only():
    dangling = datetime(2024, 1, 15, 9, 0)
    day = make_day([], incomplete=True, dangling=dangling)
    rows, total = _build_rows({date(2024, 1, 15): day})
    assert total == timedelta(0)
    assert len(rows) == 1
    assert rows[0][2] == "?"
    assert "2024-01-15" in rows[0][0]   # date label on the only row


def test_build_rows_incomplete_after_session():
    s = make_session("2024-01-15", "09:00:00", "12:00:00")
    dangling = datetime(2024, 1, 15, 13, 0)
    day = make_day([s], incomplete=True, dangling=dangling)
    rows, _ = _build_rows({date(2024, 1, 15): day})
    assert rows[0][0] != ""    # date label on first session
    assert rows[1][0] == ""    # blank on continuation
    assert rows[1][2] == "?"


def test_build_rows_multi_session_adds_subtotal():
    s1 = make_session("2024-01-15", "09:00:00", "12:00:00")
    s2 = make_session("2024-01-15", "13:00:00", "17:00:00")
    rows, total = _build_rows({date(2024, 1, 15): make_day([s1, s2])})
    assert total == timedelta(hours=7)
    subtotals = [r for r in rows if r[4]]
    assert len(subtotals) == 1
    assert "7h 00m" in subtotals[0][3]


def test_build_rows_date_label_only_on_first_session():
    s1 = make_session("2024-01-15", "09:00:00", "12:00:00")
    s2 = make_session("2024-01-15", "13:00:00", "17:00:00")
    rows, _ = _build_rows({date(2024, 1, 15): make_day([s1, s2])})
    data_rows = [r for r in rows if not r[4]]
    assert data_rows[0][0] != ""
    assert data_rows[1][0] == ""


def test_build_rows_multiple_days_sorted():
    s1 = make_session("2024-01-16", "09:00:00", "17:00:00")
    s2 = make_session("2024-01-15", "09:00:00", "17:00:00")
    rows, _ = _build_rows({
        date(2024, 1, 16): make_day([s1]),
        date(2024, 1, 15): make_day([s2]),
    })
    assert "2024-01-15" in rows[0][0]
    assert "2024-01-16" in rows[1][0]


def test_build_rows_day_label_includes_weekday():
    s = make_session("2024-01-15", "09:00:00", "17:00:00")  # Monday
    rows, _ = _build_rows({date(2024, 1, 15): make_day([s])})
    assert "Mon" in rows[0][0]


# ---------------------------------------------------------------------------
# format_report
# ---------------------------------------------------------------------------

def test_format_report_contains_employee_info():
    s = make_session("2024-01-15", "09:00:00", "17:00:00")
    report = format_report(make_data({date(2024, 1, 15): make_day([s])}))
    assert "Alice" in report
    assert "Admin" in report
    assert "ID 1" in report


def test_format_report_month_section():
    s = make_session("2024-01-15", "09:00:00", "17:00:00")
    report = format_report(make_data({date(2024, 1, 15): make_day([s])}))
    assert "January 2024" in report
    assert "Month total" in report
    assert "Year total" in report


def test_format_report_incomplete_marker():
    day = make_day([], incomplete=True, dangling=datetime(2024, 1, 15, 9, 0))
    report = format_report(make_data({date(2024, 1, 15): day}))
    assert "incomplete" in report


def test_format_report_multiple_months():
    s1 = make_session("2024-01-15", "09:00:00", "17:00:00")
    s2 = make_session("2024-02-10", "10:00:00", "18:00:00")
    data = make_data({
        date(2024, 1, 15): make_day([s1]),
        date(2024, 2, 10): make_day([s2]),
    })
    report = format_report(data)
    assert "January 2024" in report
    assert "February 2024" in report


def test_format_report_subtotal_row():
    s1 = make_session("2024-01-15", "09:00:00", "12:00:00")
    s2 = make_session("2024-01-15", "13:00:00", "17:00:00")
    report = format_report(make_data({date(2024, 1, 15): make_day([s1, s2])}))
    assert "day total" in report
    assert "7h 00m" in report


def test_format_report_multiple_employees_sorted():
    s = make_session("2024-01-15", "09:00:00", "17:00:00")
    data = {
        ("2", "Zara"):  {"dept": "X", "days": {date(2024, 1, 15): make_day([s])}},
        ("1", "Alice"): {"dept": "Y", "days": {date(2024, 1, 15): make_day([s])}},
    }
    report = format_report(data)
    assert report.index("Alice") < report.index("Zara")


# ---------------------------------------------------------------------------
# display (plain-text fallback — rich not installed in test env)
# ---------------------------------------------------------------------------

def test_display_prints_employee_name(capsys):
    s = make_session("2024-01-15", "09:00:00", "17:00:00")
    display(make_data({date(2024, 1, 15): make_day([s])}))
    assert "Alice" in capsys.readouterr().out


# ---------------------------------------------------------------------------
# display — rich path (mock rich so the try-branch is exercised)
# ---------------------------------------------------------------------------

def _inject_rich(monkeypatch):
    """Inject mock rich modules into sys.modules so display() takes the rich path."""
    mock_table = MagicMock()
    mock_console_instance = MagicMock()
    mock_console_cls = MagicMock(return_value=mock_console_instance)

    monkeypatch.setitem(sys.modules, "rich",         MagicMock())
    monkeypatch.setitem(sys.modules, "rich.console", MagicMock(Console=mock_console_cls))
    monkeypatch.setitem(sys.modules, "rich.table",   MagicMock(Table=MagicMock(return_value=mock_table)))
    monkeypatch.setitem(sys.modules, "rich.panel",   MagicMock(Panel=MagicMock()))
    monkeypatch.setitem(sys.modules, "rich.box",     MagicMock())
    return mock_console_instance, mock_table


def test_display_rich_normal_row(monkeypatch):
    console, table = _inject_rich(monkeypatch)
    s = make_session("2024-01-15", "09:00:00", "17:00:00")
    display(make_data({date(2024, 1, 15): make_day([s])}))
    assert console.print.called


def test_display_rich_incomplete_row(monkeypatch):
    console, table = _inject_rich(monkeypatch)
    dangling = datetime(2024, 1, 15, 9, 0)
    day = make_day([], incomplete=True, dangling=dangling)
    display(make_data({date(2024, 1, 15): day}))
    assert console.print.called


def test_display_rich_subtotal_row(monkeypatch):
    console, table = _inject_rich(monkeypatch)
    s1 = make_session("2024-01-15", "09:00:00", "12:00:00")
    s2 = make_session("2024-01-15", "13:00:00", "17:00:00")
    display(make_data({date(2024, 1, 15): make_day([s1, s2])}))
    assert console.print.called
