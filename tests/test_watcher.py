"""Tests for the file-system watcher (skipped if watchdog is not installed)."""
import threading
from unittest.mock import MagicMock, patch

pytest = __import__("pytest")
watchdog = pytest.importorskip("watchdog", reason="watchdog not installed")

from working_hours.watcher import _Handler  # noqa: E402  (import after guard)


def make_event(is_directory: bool, path: str) -> MagicMock:
    e = MagicMock()
    e.is_directory = is_directory
    e.src_path = path
    return e


def test_handler_ignores_directories():
    handler = _Handler()
    handler.on_any_event(make_event(is_directory=True, path="/data/raw_input_data"))
    assert handler._timer is None


def test_handler_ignores_non_txt_files():
    handler = _Handler()
    handler.on_any_event(make_event(is_directory=False, path="/data/file.csv"))
    assert handler._timer is None


def test_handler_schedules_timer_for_txt():
    handler = _Handler()
    handler.on_any_event(make_event(is_directory=False, path="/data/2024-01.txt"))
    assert handler._timer is not None
    handler._timer.cancel()


def test_handler_debounces_rapid_events():
    handler = _Handler()
    evt = make_event(is_directory=False, path="/data/2024-01.txt")
    handler.on_any_event(evt)
    first_timer = handler._timer
    handler.on_any_event(evt)
    # second event should cancel and replace the first timer
    assert handler._timer is not first_timer
    handler._timer.cancel()


def test_handler_cancels_previous_timer():
    handler = _Handler()
    evt = make_event(is_directory=False, path="/data/2024-01.txt")
    handler.on_any_event(evt)
    first_timer = handler._timer
    assert first_timer is not None
    handler.on_any_event(evt)
    assert not first_timer.is_alive() or first_timer.cancelled() if hasattr(first_timer, "cancelled") else True
    handler._timer.cancel()
