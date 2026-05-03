"""Tests for admin panel API endpoints."""
import json
from pathlib import Path

import pytest

from working_hours.server import app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setitem(app.config, "DATA_ROOT", tmp_path)
    (tmp_path / "input_data").mkdir()
    (tmp_path / "corrections").mkdir()
    with app.test_client() as c:
        with c.session_transaction() as sess:
            sess["username"] = "admin"
            sess["is_admin"] = True
            sess["emp_id"] = None
        yield c


def _raw(tmp_path: Path, content: str) -> None:
    (tmp_path / "input_data" / "data.txt").write_text(content)


def _seed_settings(tmp_path: Path, settings: dict) -> None:
    (tmp_path / "config").mkdir(exist_ok=True)
    (tmp_path / "config" / "settings.json").write_text(json.dumps(settings))


# ---------------------------------------------------------------------------
# /admin page
# ---------------------------------------------------------------------------

def test_admin_page_returns_html(client):
    r = client.get("/admin")
    assert r.status_code == 200
    assert b"Administration" in r.data


# ---------------------------------------------------------------------------
# /api/admin/employees  GET
# ---------------------------------------------------------------------------

def test_get_employees_no_data(client):
    r = client.get("/api/admin/employees")
    assert r.status_code == 200
    assert r.get_json() == []


def test_get_employees_with_raw_data(client, tmp_path):
    _raw(tmp_path, "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    emps = client.get("/api/admin/employees").get_json()
    assert len(emps) == 1
    assert emps[0]["emp_id"] == "1"
    assert emps[0]["raw_name"] == "Alice"
    assert emps[0]["alias"] == ""
    assert emps[0]["full_name"] == ""
    assert emps[0]["username"] == ""
    assert emps[0]["has_password"] is False
    assert emps[0]["enabled"] is True


def test_get_employees_includes_saved_data(client, tmp_path):
    _raw(tmp_path, "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    _seed_settings(tmp_path, {"employees": {"1": {
        "alias": "Ali", "full_name": "Alice Smith",
        "username": "alice", "password_hash": "x", "is_admin": False,
    }}, "admin_users": {}})
    emps = client.get("/api/admin/employees").get_json()
    assert emps[0]["alias"] == "Ali"
    assert emps[0]["full_name"] == "Alice Smith"
    assert emps[0]["username"] == "alice"
    assert emps[0]["has_password"] is True


# ---------------------------------------------------------------------------
# /api/admin/employees/<emp_id>  PUT
# ---------------------------------------------------------------------------

def test_update_employee_alias(client, tmp_path):
    _raw(tmp_path, "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    r = client.put("/api/admin/employees/1", json={"alias": "Ali", "full_name": "Alice Smith"})
    assert r.get_json()["ok"] is True
    emps = client.get("/api/admin/employees").get_json()
    assert emps[0]["alias"] == "Ali"
    assert emps[0]["full_name"] == "Alice Smith"


def test_update_employee_username(client, tmp_path):
    _raw(tmp_path, "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    client.put("/api/admin/employees/1", json={"username": "alice_login"})
    emps = client.get("/api/admin/employees").get_json()
    assert emps[0]["username"] == "alice_login"


def test_update_employee_password(client, tmp_path):
    _raw(tmp_path, "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    r = client.put("/api/admin/employees/1", json={"password": "secret123"})
    assert r.get_json()["ok"] is True
    emps = client.get("/api/admin/employees").get_json()
    assert emps[0]["has_password"] is True


def test_update_employee_enabled(client, tmp_path):
    _raw(tmp_path, "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    client.put("/api/admin/employees/1", json={"enabled": False})
    emps = client.get("/api/admin/employees").get_json()
    assert emps[0]["enabled"] is False


def test_update_employee_persisted(client, tmp_path):
    _raw(tmp_path, "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    client.put("/api/admin/employees/1", json={"alias": "Ali", "full_name": "Alice Smith"})
    settings = json.loads((tmp_path / "config" / "settings.json").read_text())
    assert settings["employees"]["1"]["alias"] == "Ali"
    assert settings["employees"]["1"]["full_name"] == "Alice Smith"


def test_update_employee_username_conflict_with_other_employee(client, tmp_path):
    _raw(tmp_path, (
        "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n"
        "2\tBob\tSales\t2024-01-15 09:00:00\t1\n"
    ))
    client.put("/api/admin/employees/1", json={"username": "alice"})
    r = client.put("/api/admin/employees/2", json={"username": "alice"})
    assert r.status_code == 409


def test_update_employee_username_conflict_with_admin(client, tmp_path):
    _raw(tmp_path, "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    client.post("/api/admin/admins", json={"username": "sysadmin", "password": "pw"})
    r = client.put("/api/admin/employees/1", json={"username": "sysadmin"})
    assert r.status_code == 409


def test_update_employee_strips_whitespace(client, tmp_path):
    _raw(tmp_path, "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    client.put("/api/admin/employees/1", json={"alias": "  Ali  ", "full_name": "  Alice Smith  "})
    emps = client.get("/api/admin/employees").get_json()
    assert emps[0]["alias"] == "Ali"
    assert emps[0]["full_name"] == "Alice Smith"


# ---------------------------------------------------------------------------
# /api/profiles  (non-admin, login_required)
# ---------------------------------------------------------------------------

def test_get_profiles_empty(client):
    r = client.get("/api/profiles")
    assert r.status_code == 200
    assert r.get_json() == {}


def test_get_profiles_with_employees(client, tmp_path):
    _seed_settings(tmp_path, {"employees": {
        "1": {"alias": "Ali", "full_name": "Alice Smith", "username": "", "password_hash": "", "is_admin": False},
    }, "admin_users": {}})
    profiles = client.get("/api/profiles").get_json()
    assert profiles["1"]["alias"] == "Ali"
    assert profiles["1"]["full_name"] == "Alice Smith"


# ---------------------------------------------------------------------------
# /api/admin/admins  GET / POST / PUT / DELETE
# ---------------------------------------------------------------------------

def test_get_admins_empty(client):
    r = client.get("/api/admin/admins")
    assert r.status_code == 200
    assert r.get_json() == []


def test_create_admin(client):
    r = client.post("/api/admin/admins", json={"username": "sysadmin", "password": "pw"})
    assert r.get_json()["ok"] is True
    admins = client.get("/api/admin/admins").get_json()
    assert any(a["username"] == "sysadmin" for a in admins)


def test_create_admin_missing_fields(client):
    r = client.post("/api/admin/admins", json={"username": "x"})
    assert r.status_code == 400


def test_create_admin_duplicate(client):
    client.post("/api/admin/admins", json={"username": "x", "password": "pw"})
    r = client.post("/api/admin/admins", json={"username": "x", "password": "pw2"})
    assert r.status_code == 409


def test_create_admin_username_conflict_with_employee(client, tmp_path):
    _raw(tmp_path, "1\tAlice\tAdmin\t2024-01-15 09:00:00\t1\n")
    client.put("/api/admin/employees/1", json={"username": "alice"})
    r = client.post("/api/admin/admins", json={"username": "alice", "password": "pw"})
    assert r.status_code == 409


def test_update_admin_password(client):
    client.post("/api/admin/admins", json={"username": "x", "password": "old"})
    r = client.put("/api/admin/admins/x", json={"password": "new"})
    assert r.get_json()["ok"] is True


def test_update_admin_not_found(client):
    r = client.put("/api/admin/admins/nobody", json={"password": "pw"})
    assert r.status_code == 404


def test_delete_admin(client):
    client.post("/api/admin/admins", json={"username": "x", "password": "pw"})
    r = client.delete("/api/admin/admins/x")
    assert r.get_json()["ok"] is True
    admins = client.get("/api/admin/admins").get_json()
    assert not any(a["username"] == "x" for a in admins)


def test_delete_admin_not_found(client):
    r = client.delete("/api/admin/admins/nobody")
    assert r.status_code == 404


def test_admin_persisted_to_file(client, tmp_path):
    client.post("/api/admin/admins", json={"username": "sysadmin", "password": "pw"})
    settings = json.loads((tmp_path / "config" / "settings.json").read_text())
    assert "sysadmin" in settings["admin_users"]
    assert "password_hash" in settings["admin_users"]["sysadmin"]
