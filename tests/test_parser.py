from datetime import datetime
from pathlib import Path

import pytest

from working_hours.models import CorrectionItem
from working_hours.parser import (
    apply_corrections,
    collect_correction_files,
    collect_files,
    collect_raw_files,
    parse_correction_file,
    parse_file,
)
from .conftest import make_event


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def write(tmp_path: Path, name: str, content: str) -> Path:
    p = tmp_path / name
    p.write_text(content, encoding="utf-8")
    return p


# ---------------------------------------------------------------------------
# parse_file
# ---------------------------------------------------------------------------

def test_parse_normal(tmp_path):
    p = write(tmp_path, "data.txt",
              "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n"
              "1\tAlice\tAdmin\t2024-01-15 17:00:00\t1\n")
    events = parse_file(p)
    assert len(events) == 2
    assert events[0].emp_id == "1"
    assert events[0].name == "Alice"
    assert events[0].dept == "Admin"
    assert events[0].timestamp == datetime(2024, 1, 15, 9, 0, 0)


def test_parse_skips_comment_lines(tmp_path):
    p = write(tmp_path, "data.txt",
              "# this is a comment\n"
              "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    assert len(parse_file(p)) == 1


def test_parse_skips_non_digit_id(tmp_path):
    p = write(tmp_path, "data.txt",
              "ID.\tNombre\tDepart.\tTiempo\tMáquina\n"
              "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    assert len(parse_file(p)) == 1


def test_parse_strips_trailing_dot_from_id(tmp_path):
    p = write(tmp_path, "data.txt", "1.\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    events = parse_file(p)
    assert events[0].emp_id == "1"


def test_parse_normalises_extra_spaces_in_timestamp(tmp_path):
    p = write(tmp_path, "data.txt", "1\tAlice\tAdmin\t 2024-01-15     09:00:00\t1\n")
    events = parse_file(p)
    assert len(events) == 1
    assert events[0].timestamp == datetime(2024, 1, 15, 9, 0, 0)


def test_parse_skips_invalid_timestamp(tmp_path):
    p = write(tmp_path, "data.txt", "1\tAlice\tAdmin\tnot-a-date\t1\n")
    assert parse_file(p) == []


def test_parse_skips_lines_with_fewer_than_4_fields(tmp_path):
    p = write(tmp_path, "data.txt", "1\tAlice\tAdmin\n")
    assert parse_file(p) == []


def test_parse_empty_file(tmp_path):
    p = write(tmp_path, "data.txt", "")
    assert parse_file(p) == []


def test_parse_only_comments(tmp_path):
    p = write(tmp_path, "data.txt", "# Jan\n# Feb\n")
    assert parse_file(p) == []


def test_parse_minimum_four_fields_accepted(tmp_path):
    p = write(tmp_path, "data.txt", "1\tAlice\tAdmin\t2024-01-15 09:00:00\n")
    assert len(parse_file(p)) == 1


def test_parse_multiple_employees(tmp_path):
    p = write(tmp_path, "data.txt",
              "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n"
              "2\tBob\tSales\t2024-01-15 10:00:00\t1\n")
    events = parse_file(p)
    assert {e.name for e in events} == {"Alice", "Bob"}


# ---------------------------------------------------------------------------
# collect_files
# ---------------------------------------------------------------------------

def test_collect_explicit_file(tmp_path):
    p = tmp_path / "data.txt"
    p.write_text("")
    assert collect_files([str(p)]) == [p]


def test_collect_directory(tmp_path):
    (tmp_path / "a.txt").write_text("")
    (tmp_path / "b.txt").write_text("")
    (tmp_path / "notes.md").write_text("")   # should be ignored
    files = collect_files([str(tmp_path)])
    assert len(files) == 2
    assert all(f.suffix == ".txt" for f in files)


def test_collect_nonexistent_warns(tmp_path, capsys):
    files = collect_files([str(tmp_path / "missing.txt")])
    assert files == []
    assert "Warning" in capsys.readouterr().err


def test_collect_default_reads_raw_and_corrections(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    raw = tmp_path / "input_data"
    raw.mkdir()
    (raw / "2024-01.txt").write_text("")
    corr = tmp_path / "corrections"
    corr.mkdir()
    (corr / "fixes.txt").write_text("")
    files = collect_files([])
    assert len(files) == 2


def test_collect_default_missing_dirs_returns_empty(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    assert collect_files([]) == []


def test_collect_default_only_raw_exists(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    raw = tmp_path / "input_data"
    raw.mkdir()
    (raw / "2024-01.txt").write_text("")
    files = collect_files([])
    assert len(files) == 1


def test_collect_files_sorted(tmp_path):
    (tmp_path / "b.txt").write_text("")
    (tmp_path / "a.txt").write_text("")
    files = collect_files([str(tmp_path)])
    assert files == sorted(files)


# ---------------------------------------------------------------------------
# collect_raw_files / collect_correction_files
# ---------------------------------------------------------------------------

def test_collect_raw_files_default(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    raw = tmp_path / "input_data"
    raw.mkdir()
    (raw / "2024-01.txt").write_text("")
    # corrections dir should NOT be included
    corr = tmp_path / "corrections"
    corr.mkdir()
    (corr / "fixes.txt").write_text("")
    files = collect_raw_files([])
    assert len(files) == 1
    assert files[0].parent.name == "input_data"


def test_collect_raw_files_explicit(tmp_path):
    (tmp_path / "a.txt").write_text("")
    files = collect_raw_files([str(tmp_path / "a.txt")])
    assert len(files) == 1


def test_collect_raw_files_missing_dir(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    assert collect_raw_files([]) == []


def test_collect_correction_files(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    corr = tmp_path / "corrections"
    corr.mkdir()
    (corr / "fixes.txt").write_text("")
    files = collect_correction_files()
    assert len(files) == 1


def test_collect_correction_files_missing_dir(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    assert collect_correction_files() == []


# ---------------------------------------------------------------------------
# parse_correction_file
# ---------------------------------------------------------------------------

def test_parse_correction_plain_line_is_add(tmp_path):
    p = tmp_path / "c.txt"
    p.write_text("1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    items = parse_correction_file(p)
    assert len(items) == 1
    assert items[0].action == "ADD"
    assert items[0].event.emp_id == "1"
    assert items[0].old_timestamp is None


def test_parse_correction_add_prefix(tmp_path):
    p = tmp_path / "c.txt"
    p.write_text("ADD\t1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    items = parse_correction_file(p)
    assert len(items) == 1
    assert items[0].action == "ADD"


def test_parse_correction_del(tmp_path):
    p = tmp_path / "c.txt"
    p.write_text("DEL\t1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    items = parse_correction_file(p)
    assert len(items) == 1
    assert items[0].action == "DEL"
    assert items[0].event.timestamp == datetime(2024, 1, 15, 9, 0, 0)


def test_parse_correction_edit(tmp_path):
    p = tmp_path / "c.txt"
    p.write_text("EDIT\t1\tAlice\tAdmin\t2024-01-15 09:00:00\t2024-01-15 09:05:00\t1\n")
    items = parse_correction_file(p)
    assert len(items) == 1
    assert items[0].action == "EDIT"
    assert items[0].old_timestamp == datetime(2024, 1, 15, 9, 0, 0)
    assert items[0].event.timestamp == datetime(2024, 1, 15, 9, 5, 0)


def test_parse_correction_skips_comments(tmp_path):
    p = tmp_path / "c.txt"
    p.write_text("# comment\nADD\t1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    assert len(parse_correction_file(p)) == 1


def test_parse_correction_skips_blank_lines(tmp_path):
    p = tmp_path / "c.txt"
    p.write_text("\nADD\t1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n\n")
    assert len(parse_correction_file(p)) == 1


def test_parse_correction_skips_invalid_timestamp(tmp_path):
    p = tmp_path / "c.txt"
    p.write_text("ADD\t1\tAlice\tAdmin\tbad-ts\t1\n")
    assert parse_correction_file(p) == []


def test_parse_correction_edit_skips_too_few_fields(tmp_path):
    p = tmp_path / "c.txt"
    p.write_text("EDIT\t1\tAlice\tAdmin\t2024-01-15 09:00:00\n")  # missing new_ts
    assert parse_correction_file(p) == []


def test_parse_correction_edit_skips_bad_old_ts(tmp_path):
    p = tmp_path / "c.txt"
    p.write_text("EDIT\t1\tAlice\tAdmin\tbad\t2024-01-15 09:05:00\t1\n")
    assert parse_correction_file(p) == []


# ---------------------------------------------------------------------------
# apply_corrections
# ---------------------------------------------------------------------------

def test_apply_add(tmp_path):
    raw = [make_event("1", "Alice", "2024-01-15 09:00:00")]
    new_ev = make_event("1", "Alice", "2024-01-15 17:00:00")
    corr = [CorrectionItem(action="ADD", event=new_ev, old_timestamp=None)]
    result = apply_corrections(raw, corr)
    assert len(result) == 2


def test_apply_del(tmp_path):
    ev = make_event("1", "Alice", "2024-01-15 09:00:00")
    corr = [CorrectionItem(action="DEL", event=ev, old_timestamp=None)]
    result = apply_corrections([ev], corr)
    assert result == []


def test_apply_del_only_matching_employee(tmp_path):
    alice = make_event("1", "Alice", "2024-01-15 09:00:00")
    bob = make_event("2", "Bob", "2024-01-15 09:00:00")
    corr = [CorrectionItem(action="DEL", event=alice, old_timestamp=None)]
    result = apply_corrections([alice, bob], corr)
    assert len(result) == 1
    assert result[0].name == "Bob"


def test_apply_edit(tmp_path):
    old_ts = datetime(2024, 1, 15, 9, 0, 0)
    new_ts = datetime(2024, 1, 15, 9, 5, 0)
    ev = make_event("1", "Alice", "2024-01-15 09:00:00")
    new_ev = make_event("1", "Alice", "2024-01-15 09:05:00")
    corr = [CorrectionItem(action="EDIT", event=new_ev, old_timestamp=old_ts)]
    result = apply_corrections([ev], corr)
    assert len(result) == 1
    assert result[0].timestamp == new_ts


def test_apply_edit_no_match_leaves_events_unchanged(tmp_path):
    ev = make_event("1", "Alice", "2024-01-15 09:00:00")
    other_ts = datetime(2024, 1, 15, 8, 0, 0)
    new_ev = make_event("1", "Alice", "2024-01-15 09:05:00")
    corr = [CorrectionItem(action="EDIT", event=new_ev, old_timestamp=other_ts)]
    result = apply_corrections([ev], corr)
    assert result[0].timestamp == datetime(2024, 1, 15, 9, 0, 0)


def test_apply_empty_corrections(tmp_path):
    ev = make_event("1", "Alice", "2024-01-15 09:00:00")
    assert apply_corrections([ev], []) == [ev]


def test_apply_corrections_in_order(tmp_path):
    ev = make_event("1", "Alice", "2024-01-15 09:00:00")
    # ADD then DEL the same event → should end up empty
    new_ev = make_event("1", "Alice", "2024-01-15 17:00:00")
    corr = [
        CorrectionItem(action="ADD", event=new_ev, old_timestamp=None),
        CorrectionItem(action="DEL", event=new_ev, old_timestamp=None),
    ]
    result = apply_corrections([ev], corr)
    assert len(result) == 1  # original ev remains, added+deleted new_ev


# Cover _parse_event_parts early-exit branches via parse_correction_file

def test_parse_correction_add_too_few_fields(tmp_path):
    p = tmp_path / "c.txt"
    p.write_text("ADD\t1\tAlice\n")  # only 2 rest fields
    assert parse_correction_file(p) == []


def test_parse_correction_add_non_digit_id(tmp_path):
    p = tmp_path / "c.txt"
    p.write_text("ADD\tABC\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    assert parse_correction_file(p) == []


def test_parse_correction_edit_non_digit_id(tmp_path):
    p = tmp_path / "c.txt"
    p.write_text("EDIT\tABC\tAlice\tAdmin\t2024-01-15 09:00:00\t2024-01-15 09:05:00\t1\n")
    assert parse_correction_file(p) == []


# Cover collect_raw_files directory and warn branches

def test_collect_raw_files_dir_arg(tmp_path):
    (tmp_path / "a.txt").write_text("")
    (tmp_path / "b.txt").write_text("")
    files = collect_raw_files([str(tmp_path)])
    assert len(files) == 2


def test_collect_raw_files_warns_missing(tmp_path, capsys):
    files = collect_raw_files([str(tmp_path / "no-such.txt")])
    assert files == []
    assert "Warning" in capsys.readouterr().err
