import sys
import threading
import time
from pathlib import Path

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer


def _run() -> None:
    from .__main__ import main
    try:
        main()
    except SystemExit as e:
        if e.code:
            print(f"Error: {e.code}", file=sys.stderr, flush=True)


class _Handler(FileSystemEventHandler):
    """Debounced handler — waits 1 s after the last event before re-running."""

    def __init__(self) -> None:
        self._timer: threading.Timer | None = None
        self._lock = threading.Lock()

    def on_any_event(self, event) -> None:
        if event.is_directory or not str(event.src_path).endswith(".txt"):
            return
        with self._lock:
            if self._timer:
                self._timer.cancel()
            self._timer = threading.Timer(1.0, _run)
            self._timer.start()


def watch() -> None:
    print("Running initial processing...", flush=True)
    _run()

    handler = _Handler()
    observer = Observer()

    for d in (Path("input_data"), Path("corrections")):
        if d.is_dir():
            observer.schedule(handler, str(d), recursive=False)
            print(f"Watching {d}/", flush=True)
        else:
            print(f"Warning: {d}/ not found, skipping.", file=sys.stderr, flush=True)

    observer.start()
    print("Watching for changes...", flush=True)
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        observer.stop()
        observer.join()
