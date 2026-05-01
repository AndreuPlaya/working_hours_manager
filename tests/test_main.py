"""Integration tests for __main__.main()."""
import sys

import pytest

from working_hours.__main__ import main


RAW_CONTENT = (
    "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n"
    "1\tAlice\tAdmin\t2024-01-15 17:00:00\t1\n"
    "2\tBob\tSales\t2024-01-20 10:00:00\t1\n"
    "2\tBob\tSales\t2024-01-20 18:00:00\t1\n"
)


@pytest.fixture()
def project_dir(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(sys, "argv", ["working-hours"])
    (tmp_path / "input_data").mkdir()
    (tmp_path / "corrections").mkdir()
    return tmp_path


def test_main_exits_on_no_files(project_dir, monkeypatch):
    # empty input_data and corrections → no files found
    with pytest.raises(SystemExit) as exc:
        main()
    assert exc.value.code


def test_main_exits_on_empty_files(project_dir):
    (project_dir / "input_data" / "2024-01.txt").write_text("ID\tName\tDept\tTime\n")
    with pytest.raises(SystemExit) as exc:
        main()
    assert exc.value.code


def test_main_merges_corrections(project_dir, capsys):
    (project_dir / "input_data" / "2024-01.txt").write_text(
        "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n"
    )
    main()
    assert "incomplete" in capsys.readouterr().out

    (project_dir / "corrections" / "2024-fixes.txt").write_text(
        "1\tAlice\tAdmin\t2024-01-15 17:00:00\t1\n"
    )
    main()
    out = capsys.readouterr().out
    assert "incomplete" not in out
    assert "8h 00m" in out


def test_main_report_content(project_dir, capsys):
    (project_dir / "input_data" / "2024-01.txt").write_text(RAW_CONTENT)
    main()
    out = capsys.readouterr().out
    assert "January 2024" in out
    assert "8h 00m" in out
    assert "Month total" in out
    assert "Year total" in out
