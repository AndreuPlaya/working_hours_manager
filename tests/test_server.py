"""Tests for the Flask corrections editor server."""
import json
from pathlib import Path

import pytest

from working_hours.server import app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    import working_hours.server as srv
    monkeypatch.setattr(srv, "_root", tmp_path)
    (tmp_path / "input_data").mkdir()
    (tmp_path / "corrections").mkdir()
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def _raw(tmp_path: Path, content: str) -> None:
    (tmp_path / "input_data" / "data.txt").write_text(content)


# ---------------------------------------------------------------------------
# Index
# ---------------------------------------------------------------------------

def test_index_returns_html(client):
    r = client.get("/")
    assert r.status_code == 200
    assert b"Working Hours Editor" in r.data


# ---------------------------------------------------------------------------
# /setup — first-run admin creation
# ---------------------------------------------------------------------------

def test_setup_page_renders(client):
    r = client.get("/setup")
    assert r.status_code == 200
    assert b"Create your admin account" in r.data


def test_setup_creates_admin_and_redirects(client, tmp_path):
    r = client.post("/setup", data={
        "username": "admin",
        "password": "securepass1",
        "confirm": "securepass1",
    }, follow_redirects=False)
    assert r.status_code == 302
    assert "/login" in r.headers["Location"]
    settings = json.loads((tmp_path / "config" / "settings.json").read_text())
    assert "admin" in settings["admin_users"]


def test_setup_rejects_short_password(client):
    r = client.post("/setup", data={
        "username": "admin", "password": "short", "confirm": "short",
    })
    assert r.status_code == 200
    assert b"at least 8" in r.data


def test_setup_rejects_mismatched_passwords(client):
    r = client.post("/setup", data={
        "username": "admin", "password": "password123", "confirm": "different123",
    })
    assert r.status_code == 200
    assert b"do not match" in r.data


def test_setup_redirects_to_login_when_admin_exists(client, tmp_path):
    cfg_dir = tmp_path / "config"
    cfg_dir.mkdir()
    (cfg_dir / "settings.json").write_text(
        json.dumps({"admin_users": {"admin": {"password_hash": "x"}}, "employees": {}})
    )
    r = client.get("/setup", follow_redirects=False)
    assert r.status_code == 302
    assert "/login" in r.headers["Location"]


def test_before_request_redirects_to_setup_when_no_admins(tmp_path, monkeypatch):
    import working_hours.server as srv
    monkeypatch.setattr(srv, "_root", tmp_path)
    (tmp_path / "input_data").mkdir()
    (tmp_path / "corrections").mkdir()
    old = app.config.get("TESTING")
    app.config["TESTING"] = False
    try:
        with app.test_client() as c:
            r = c.get("/", follow_redirects=False)
            assert r.status_code == 302
            assert "/setup" in r.headers["Location"]
    finally:
        app.config["TESTING"] = old


# ---------------------------------------------------------------------------
# /api/config
# ---------------------------------------------------------------------------

def test_config_default_unrestricted(client):
    r = client.get("/api/config")
    assert r.status_code == 200
    assert r.get_json()["restrict_edits"] is False


# ---------------------------------------------------------------------------
# /api/events — session format
# ---------------------------------------------------------------------------

def test_get_events_empty(client):
    r = client.get("/api/events")
    assert r.status_code == 200
    assert r.get_json() == {}


def test_get_events_returns_sessions(client, tmp_path):
    _raw(tmp_path, (
        "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n"
        "1\tAlice\tAdmin\t2024-01-15 17:00:00\t1\n"
    ))
    data = client.get("/api/events").get_json()
    assert len(data) == 1
    key = list(data.keys())[0]
    assert "Alice" in key
    assert len(data[key]) == 1
    s = data[key][0]
    assert s["clock_in"] == "2024-01-15 09:00:00"
    assert s["clock_out"] == "2024-01-15 17:00:00"
    assert s["duration"] == "8h 00m"
    assert s["incomplete"] is False
    assert "(Mon)" in s["date"]


def test_get_events_incomplete_session(client, tmp_path):
    _raw(tmp_path, "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    data = client.get("/api/events").get_json()
    key = list(data.keys())[0]
    s = data[key][0]
    assert s["clock_in"] == "2024-01-15 09:00:00"
    assert s["clock_out"] is None
    assert s["duration"] is None
    assert s["incomplete"] is True


def test_get_events_multiple_sessions_same_day(client, tmp_path):
    _raw(tmp_path, (
        "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n"
        "1\tAlice\tAdmin\t2024-01-15 12:00:00\t1\n"
        "1\tAlice\tAdmin\t2024-01-15 13:00:00\t1\n"
        "1\tAlice\tAdmin\t2024-01-15 17:00:00\t1\n"
    ))
    data = client.get("/api/events").get_json()
    key = list(data.keys())[0]
    assert len(data[key]) == 2


def test_get_events_date_label_format(client, tmp_path):
    _raw(tmp_path, (
        "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n"
        "1\tAlice\tAdmin\t2024-01-15 17:00:00\t1\n"
    ))
    data = client.get("/api/events").get_json()
    key = list(data.keys())[0]
    assert data[key][0]["date"] == "2024-01-15 (Mon)"


# ---------------------------------------------------------------------------
# /api/add, /api/delete, /api/edit
# ---------------------------------------------------------------------------

def test_add_event_creates_complete_session(client, tmp_path):
    _raw(tmp_path, "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    r = client.post("/api/add", json={
        "emp_id": "1", "name": "Alice", "dept": "Admin",
        "timestamp": "2024-01-15 17:00:00",
    })
    assert r.get_json()["ok"] is True
    data = client.get("/api/events").get_json()
    key = list(data.keys())[0]
    assert data[key][0]["clock_out"] == "2024-01-15 17:00:00"
    assert data[key][0]["incomplete"] is False


def test_delete_event_removes_session(client, tmp_path):
    _raw(tmp_path, "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    r = client.post("/api/delete", json={
        "emp_id": "1", "name": "Alice", "dept": "Admin",
        "timestamp": "2024-01-15 09:00:00",
    })
    assert r.get_json()["ok"] is True
    assert client.get("/api/events").get_json() == {}


def test_edit_event_updates_clock_in(client, tmp_path):
    _raw(tmp_path, (
        "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n"
        "1\tAlice\tAdmin\t2024-01-15 17:00:00\t1\n"
    ))
    r = client.post("/api/edit", json={
        "emp_id": "1", "name": "Alice", "dept": "Admin",
        "old_timestamp": "2024-01-15 09:00:00",
        "new_timestamp": "2024-01-15 09:05:00",
    })
    assert r.get_json()["ok"] is True
    data = client.get("/api/events").get_json()
    key = list(data.keys())[0]
    assert data[key][0]["clock_in"] == "2024-01-15 09:05:00"


# ---------------------------------------------------------------------------
# /api/bulk-delete
# ---------------------------------------------------------------------------

def test_bulk_delete_single_session(client, tmp_path):
    _raw(tmp_path, (
        "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n"
        "1\tAlice\tAdmin\t2024-01-15 17:00:00\t1\n"
    ))
    r = client.post("/api/bulk-delete", json=[
        {"emp_id": "1", "name": "Alice", "dept": "Admin", "timestamp": "2024-01-15 09:00:00"},
        {"emp_id": "1", "name": "Alice", "dept": "Admin", "timestamp": "2024-01-15 17:00:00"},
    ])
    assert r.get_json()["ok"] is True
    assert client.get("/api/events").get_json() == {}


def test_bulk_delete_multiple_sessions(client, tmp_path):
    _raw(tmp_path, (
        "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n"
        "1\tAlice\tAdmin\t2024-01-15 12:00:00\t1\n"
        "1\tAlice\tAdmin\t2024-01-16 09:00:00\t1\n"
        "1\tAlice\tAdmin\t2024-01-16 17:00:00\t1\n"
    ))
    # delete only the Jan 15 session (incomplete)
    r = client.post("/api/bulk-delete", json=[
        {"emp_id": "1", "name": "Alice", "dept": "Admin", "timestamp": "2024-01-15 09:00:00"},
        {"emp_id": "1", "name": "Alice", "dept": "Admin", "timestamp": "2024-01-15 12:00:00"},
    ])
    assert r.get_json()["ok"] is True
    data = client.get("/api/events").get_json()
    key = list(data.keys())[0]
    assert len(data[key]) == 1
    assert "2024-01-16" in data[key][0]["clock_in"]


def test_bulk_delete_writes_correction_file(client, tmp_path):
    _raw(tmp_path, (
        "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n"
        "1\tAlice\tAdmin\t2024-01-15 17:00:00\t1\n"
    ))
    client.post("/api/bulk-delete", json=[
        {"emp_id": "1", "name": "Alice", "dept": "Admin", "timestamp": "2024-01-15 09:00:00"},
    ])
    text = (tmp_path / "corrections" / "editor-corrections.txt").read_text()
    assert "DEL" in text
    assert "2024-01-15 09:00:00" in text


# ---------------------------------------------------------------------------
# /reports/
# ---------------------------------------------------------------------------

def test_reports_index_rendered(client, tmp_path):
    _raw(tmp_path, (
        "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n"
        "1\tAlice\tAdmin\t2024-01-15 17:00:00\t1\n"
    ))
    r = client.get("/reports/")
    assert r.status_code == 200
    assert b"2024" in r.data
    assert b"Alice" in r.data


def test_reports_stem_rendered(client, tmp_path):
    _raw(tmp_path, (
        "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n"
        "1\tAlice\tAdmin\t2024-01-15 17:00:00\t1\n"
    ))
    r = client.get("/reports/2024-1-Alice")
    assert r.status_code == 200
    assert b"Alice" in r.data
    assert b"8h 00m" in r.data


def test_reports_stem_not_found(client, tmp_path):
    r = client.get("/reports/2024-99-nobody")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Correction file is written for add/delete/edit
# ---------------------------------------------------------------------------

def test_add_writes_correction_file(client, tmp_path):
    _raw(tmp_path, "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    client.post("/api/add", json={
        "emp_id": "1", "name": "Alice", "dept": "Admin",
        "timestamp": "2024-01-15 17:00:00",
    })
    text = (tmp_path / "corrections" / "editor-corrections.txt").read_text()
    assert "ADD" in text
    assert "2024-01-15 17:00:00" in text


# ---------------------------------------------------------------------------
# Employee role-based access control
# ---------------------------------------------------------------------------

@pytest.fixture()
def emp_client(tmp_path, monkeypatch):
    import working_hours.server as srv
    monkeypatch.setattr(srv, "_root", tmp_path)
    (tmp_path / "input_data").mkdir()
    (tmp_path / "corrections").mkdir()
    old = app.config.get("TESTING")
    app.config["TESTING"] = False
    with app.test_client() as c:
        with c.session_transaction() as s:
            s["username"] = "alice"
            s["is_admin"] = False
            s["emp_id"] = "1"
        yield c
    app.config["TESTING"] = old


def test_employee_sees_only_own_events(emp_client, tmp_path):
    _raw(tmp_path, (
        "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n"
        "1\tAlice\tAdmin\t2024-01-15 17:00:00\t1\n"
        "2\tBob\tSales\t2024-01-15 09:00:00\t1\n"
        "2\tBob\tSales\t2024-01-15 17:00:00\t1\n"
    ))
    data = emp_client.get("/api/events").get_json()
    assert len(data) == 1
    assert any("Alice" in k for k in data)
    assert not any("Bob" in k for k in data)


def test_employee_config_restricts_edits(emp_client):
    cfg = emp_client.get("/api/config").get_json()
    assert cfg["restrict_edits"] is True
    assert cfg["emp_id"] == "1"
    assert cfg["is_admin"] is False


def test_admin_config_unrestricted(tmp_path, monkeypatch):
    import working_hours.server as srv
    monkeypatch.setattr(srv, "_root", tmp_path)
    old = app.config.get("TESTING")
    app.config["TESTING"] = False
    with app.test_client() as c:
        with c.session_transaction() as s:
            s["username"] = "admin"
            s["is_admin"] = True
            s["emp_id"] = None
        cfg = c.get("/api/config").get_json()
    app.config["TESTING"] = old
    assert cfg["restrict_edits"] is False
    assert cfg["is_admin"] is True


def test_employee_can_add_own_clockout(emp_client, tmp_path):
    _raw(tmp_path, "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    r = emp_client.post("/api/add", json={
        "emp_id": "1", "name": "Alice", "dept": "Admin",
        "timestamp": "2024-01-15 17:00:00",
    })
    assert r.status_code == 200
    assert r.get_json()["ok"] is True


def test_employee_cannot_add_other_employee_event(emp_client):
    r = emp_client.post("/api/add", json={
        "emp_id": "2", "name": "Bob", "dept": "Sales",
        "timestamp": "2024-01-15 17:00:00",
    })
    assert r.status_code == 403


def test_employee_can_edit_own_clockout(emp_client, tmp_path):
    _raw(tmp_path, (
        "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n"
        "1\tAlice\tAdmin\t2024-01-15 17:00:00\t1\n"
    ))
    r = emp_client.post("/api/edit", json={
        "emp_id": "1", "name": "Alice", "dept": "Admin",
        "old_timestamp": "2024-01-15 17:00:00",
        "new_timestamp": "2024-01-15 17:05:00",
    })
    assert r.status_code == 200
    assert r.get_json()["ok"] is True


def test_employee_cannot_edit_other_employee_event(emp_client):
    r = emp_client.post("/api/edit", json={
        "emp_id": "2", "name": "Bob", "dept": "Sales",
        "old_timestamp": "2024-01-15 09:00:00",
        "new_timestamp": "2024-01-15 09:05:00",
    })
    assert r.status_code == 403


def test_employee_cannot_delete(emp_client, tmp_path):
    _raw(tmp_path, "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    r = emp_client.post("/api/delete", json={
        "emp_id": "1", "name": "Alice", "dept": "Admin",
        "timestamp": "2024-01-15 09:00:00",
    })
    assert r.status_code == 403


def test_employee_cannot_bulk_delete(emp_client):
    r = emp_client.post("/api/bulk-delete", json=[
        {"emp_id": "1", "name": "Alice", "dept": "Admin", "timestamp": "2024-01-15 09:00:00"},
    ])
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# /api/change-password
# ---------------------------------------------------------------------------

import json as _json
from werkzeug.security import generate_password_hash as _gph, check_password_hash as _cph


def _seed_pw(tmp_path, username, password):
    (tmp_path / "config").mkdir(exist_ok=True)
    (tmp_path / "config" / "settings.json").write_text(_json.dumps({
        "employees": {"1": {
            "alias": "", "full_name": "", "username": username,
            "password_hash": _gph(password), "enabled": True,
        }},
        "admin_users": {},
    }))


def test_change_password_employee_ok(client, tmp_path):
    _seed_pw(tmp_path, "alice", "old")
    r = client.put("/api/change-password", json={
        "username": "alice", "current_password": "old", "new_password": "new123",
    })
    assert r.get_json()["ok"] is True
    settings = _json.loads((tmp_path / "config" / "settings.json").read_text())
    assert _cph(settings["employees"]["1"]["password_hash"], "new123")


def test_change_password_wrong_current(client, tmp_path):
    _seed_pw(tmp_path, "alice", "correct")
    r = client.put("/api/change-password", json={
        "username": "alice", "current_password": "wrong", "new_password": "new123",
    })
    assert r.status_code == 401


def test_change_password_missing_fields(client, tmp_path):
    _seed_pw(tmp_path, "alice", "pw")
    r = client.put("/api/change-password", json={"username": "alice", "current_password": "pw"})
    assert r.status_code == 400


def test_change_password_unknown_user(client, tmp_path):
    _seed_pw(tmp_path, "alice", "pw")
    r = client.put("/api/change-password", json={
        "username": "nobody", "current_password": "pw", "new_password": "new",
    })
    assert r.status_code == 404


def test_change_password_admin_ok(client, tmp_path):
    (tmp_path / "config").mkdir(exist_ok=True)
    (tmp_path / "config" / "settings.json").write_text(_json.dumps({
        "employees": {},
        "admin_users": {"sysadmin": {"password_hash": _gph("old")}},
    }))
    r = client.put("/api/change-password", json={
        "username": "sysadmin", "current_password": "old", "new_password": "new123",
    })
    assert r.get_json()["ok"] is True
    settings = _json.loads((tmp_path / "config" / "settings.json").read_text())
    assert _cph(settings["admin_users"]["sysadmin"]["password_hash"], "new123")
