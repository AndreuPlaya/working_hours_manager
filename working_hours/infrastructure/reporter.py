from collections import defaultdict
from datetime import date, datetime, timedelta

from ..domain.models import DayRecord

_COL = (19, 10, 10, 12)
_SEP = "  "
_HDR = _SEP.join(h.ljust(w) for h, w in zip(("Date", "Clock In", "Clock Out", "Duration"), _COL))
_DIV = _SEP.join("-" * w for w in _COL)
_WIDTH = len(_HDR)
_TOTAL_LABEL_W = sum(_COL[:3]) + len(_SEP) * 2


def fmt_td(td: timedelta) -> str:
    total_min = int(td.total_seconds()) // 60
    h, m = divmod(total_min, 60)
    return f"{h}h {m:02d}m"


def fmt_time(dt: datetime) -> str:
    return dt.strftime("%H:%M:%S")


def _build_rows(days: dict[date, DayRecord]) -> tuple[list[tuple], timedelta]:
    """Flatten a day map into table rows.

    Each row: (date_label, clock_in, clock_out, duration, is_subtotal).
    """
    rows: list[tuple] = []
    total = timedelta()
    for d in sorted(days):
        rec = days[d]
        total += rec.total
        label = f"{d}  {d.strftime('%a')}"
        first = True
        for s in rec.sessions:
            rows.append((label if first else "", fmt_time(s.clock_in), fmt_time(s.clock_out), fmt_td(s.duration), False))
            first = False
        if rec.incomplete:
            rows.append((label if first else "", fmt_time(rec.dangling), "?", "incomplete", False))
        if len(rec.sessions) > 1:
            rows.append(("", "", "day total", fmt_td(rec.total), True))
    return rows, total


def format_report(data: dict[tuple[str, str], dict]) -> str:
    out: list[str] = []
    for (emp_id, name), info in sorted(data.items(), key=lambda x: x[0][1].lower()):
        dept = info["dept"]
        days: dict[date, DayRecord] = info["days"]

        by_month: dict[tuple[int, int], dict[date, DayRecord]] = defaultdict(dict)
        for d, rec in days.items():
            by_month[(d.year, d.month)][d] = rec

        out.append("=" * _WIDTH)
        out.append(f"  {name}  ·  {dept}  ·  ID {emp_id}")
        out.append("=" * _WIDTH)

        year_total = timedelta()
        for (year, month) in sorted(by_month):
            month_label = date(year, month, 1).strftime("%B %Y")
            rows, month_total = _build_rows(by_month[(year, month)])
            year_total += month_total

            out.append("")
            out.append(f"  {month_label}")
            out.append(_HDR)
            out.append(_DIV)
            for date_label, t_in, t_out, dur, is_subtotal in rows:
                if is_subtotal:
                    line = _SEP.join(c.ljust(w) for c, w in zip(("", "", "day total", dur), _COL))
                else:
                    line = _SEP.join(c.ljust(w) for c, w in zip((date_label, t_in, t_out, dur), _COL))
                out.append(line)
            out.append(_DIV)
            out.append(f"{'Month total:'.ljust(_TOTAL_LABEL_W)}  {fmt_td(month_total)}")

        out.append("")
        out.append(f"{'Year total:'.ljust(_TOTAL_LABEL_W)}  {fmt_td(year_total)}")
        out.append("=" * _WIDTH)
    return "\n".join(out)


def display(data: dict[tuple[str, str], dict]) -> None:
    """Print a summary to the terminal (uses rich if available)."""
    try:
        from rich.console import Console
        from rich.table import Table
        from rich import box
        from rich.panel import Panel

        console = Console()
        for (emp_id, name), info in sorted(data.items(), key=lambda x: x[0][1].lower()):
            days: dict[date, DayRecord] = info["days"]
            table = Table(box=box.SIMPLE_HEAD, padding=(0, 1), show_footer=False)
            table.add_column("Date", style="dim", min_width=17, no_wrap=True)
            table.add_column("Clock In", style="green", justify="center")
            table.add_column("Clock Out", style="red", justify="center")
            table.add_column("Duration", justify="right")

            rows, year_total = _build_rows(days)
            for date_label, t_in, t_out, dur, is_subtotal in rows:
                if is_subtotal:
                    table.add_row("", "", "[bold]day total[/bold]", f"[bold]{dur}[/bold]")
                elif t_out == "?":
                    table.add_row(date_label, t_in, "[yellow]?[/yellow]", "[yellow]incomplete[/yellow]")
                else:
                    table.add_row(date_label, t_in, t_out, dur)

            console.print(Panel(
                table,
                title=f"[bold]{name}[/bold]  ·  {info['dept']}  ·  ID {emp_id}",
                subtitle=f"Year total: [bold]{fmt_td(year_total)}[/bold]",
            ))
    except ImportError:
        print(format_report(data))
