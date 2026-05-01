import sys

from .calculator import compute
from .parser import (
    apply_corrections,
    collect_correction_files,
    collect_raw_files,
    parse_correction_file,
    parse_file,
)
from .reporter import display


def main() -> None:
    raw_files = collect_raw_files(sys.argv[1:])
    if not raw_files:
        sys.exit("No input files found.")

    raw_events = []
    for path in raw_files:
        raw_events.extend(parse_file(path))

    corrections = []
    for path in collect_correction_files():
        corrections.extend(parse_correction_file(path))

    all_events = apply_corrections(raw_events, corrections)

    if not all_events:
        sys.exit("No clocking records found.")

    display(compute(all_events))


if __name__ == "__main__":
    main()
