"""
planner/schedule.py — show-day time math, shared by share pages, calendar feeds and the AI summary.

The screens (JavaScript) do the same math in the browser. This is the Python twin,
used when the server builds a page or file on its own.

Times are handled as "minutes after midnight" because that makes adding easy:
7:00 PM = 19 * 60 = 1140. A time past midnight (like 12:30 AM after a show) is 1470.
"""
from datetime import date, datetime, time, timedelta

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def to_minutes(t):
    """A time (like 19:30) → minutes after midnight (1170). None stays None."""
    if t is None:
        return None
    return t.hour * 60 + t.minute


def fmt12(minutes):
    """1170 → '7:30 PM'."""
    if minutes is None:
        return "—"
    minutes %= 1440
    h, m = divmod(minutes, 60)
    ampm = "PM" if h >= 12 else "AM"
    h = h % 12 or 12
    return f"{h}:{m:02d} {ampm}"


def due_date(event, offset):
    """Show date plus an offset in days. offset -30 = 30 days before the show."""
    if not event.date:
        return None
    return event.date + timedelta(days=offset or 0)


def fmt_date(d, weekday=False):
    """date(2026,11,14) → 'Nov 14' or 'Sat Nov 14'."""
    if not d:
        return "—"
    text = f"{MONTHS[d.month - 1]} {d.day}"
    return f"{d.strftime('%a')} {text}" if weekday else text


def fmt_long(d):
    """date(2026,11,14) → 'Saturday, November 14, 2026'."""
    return f"{d.strftime('%A, %B')} {d.day}, {d.year}" if d else "Date not set"


def program_times(event):
    """
    The program segments with calculated start and end times.
    Each segment starts when the one before it ends, beginning at the first cue.
    """
    t = to_minutes(event.program_start)
    if t is None:
        t = 19 * 60
    rows = []
    for item in event.program_items.all():
        start = t
        t += max(0, item.dur or 0)
        rows.append({"id": item.id, "kind": "program", "title": item.title, "who": item.who,
                     "track": "Program", "audiences": item.audiences or [], "s": start, "e": t})
    return rows


def setup_times(event):
    """Setup items with start/end in minutes. An end earlier than the start means after midnight."""
    rows = []
    for item in event.setup_items.all():
        s = to_minutes(item.start)
        if s is None:
            continue
        e = to_minutes(item.end)
        e = s if e is None else e
        if e < s:
            e += 1440
        rows.append({"id": item.id, "kind": "setup", "title": item.title, "who": "",
                     "track": item.track, "audiences": item.audiences or [], "s": s, "e": e})
    return rows


def day_schedule(event, audience=None):
    """
    The whole show day in time order. Pass an audience (like "Vendors") to get only
    what that group is tagged to see. "Internal" sees everything.
    """
    rows = setup_times(event) + program_times(event)
    rows.sort(key=lambda r: (r["s"], 0 if r["kind"] == "setup" else 1))
    if audience and audience != "Internal":
        rows = [r for r in rows if audience in r["audiences"]]
    return rows


def at_minutes(day, minutes):
    """A calendar date plus minutes after midnight → a full date-and-time (handles past midnight)."""
    return datetime.combine(day, time(0, 0)) + timedelta(minutes=minutes)
