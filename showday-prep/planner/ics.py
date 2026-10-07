"""
planner/ics.py — builds calendar files (.ics) that Google, Outlook and Apple Calendar understand.

Two kinds of feed:
  • audience schedule: the show-day items one group is tagged to see (e.g. Vendors)
  • deadlines:         every deadline and paperwork due date, for the internal team

Because these are served from a web address (see views.calendar_feed), people can
SUBSCRIBE to them. Their calendar then re-checks the address every few hours and
picks up changes by itself. No re-downloading.
"""
from datetime import datetime, timedelta, timezone as dt_timezone

from .schedule import at_minutes, day_schedule, due_date, to_minutes

TZID = "America/Detroit"  # matches TIME_ZONE in settings.py


def _esc(text):
    """Calendar files need commas, semicolons and line breaks escaped."""
    return (text or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line):
    """Calendar lines longer than 75 characters must wrap, with a space starting each new piece."""
    out = []
    while len(line.encode("utf-8")) > 74:
        cut = 74
        while len(line[:cut].encode("utf-8")) > 74:
            cut -= 1
        out.append(line[:cut])
        line = " " + line[cut:]
    out.append(line)
    return "\r\n".join(out)


def _stamp():
    return datetime.now(dt_timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _cal(name, events):
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Blackmagic Media//MagicShow//EN",
             "CALSCALE:GREGORIAN", "METHOD:PUBLISH", f"X-WR-CALNAME:{_esc(name)}", f"X-WR-TIMEZONE:{TZID}",
             "REFRESH-INTERVAL;VALUE=DURATION:PT4H", "X-PUBLISHED-TTL:PT4H"]
    stamp = _stamp()
    for ev in events:
        # "@showday-prep" is the app's old name, kept on purpose: calendars match events by this id,
        # so changing it would show every event twice in calendars that already subscribed.
        lines += ["BEGIN:VEVENT", f"UID:{ev['uid']}@showday-prep", f"DTSTAMP:{stamp}"]
        if ev.get("all_day"):
            d = ev["date"]
            lines += [f"DTSTART;VALUE=DATE:{d:%Y%m%d}", f"DTEND;VALUE=DATE:{d + timedelta(days=1):%Y%m%d}"]
        else:
            lines += [f"DTSTART;TZID={TZID}:{ev['start']:%Y%m%dT%H%M%S}", f"DTEND;TZID={TZID}:{ev['end']:%Y%m%dT%H%M%S}"]
        lines.append(f"SUMMARY:{_esc(ev['title'])}")
        if ev.get("desc"):
            lines.append(f"DESCRIPTION:{_esc(ev['desc'])}")
        if ev.get("location"):
            lines.append(f"LOCATION:{_esc(ev['location'])}")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(l) for l in lines) + "\r\n"


def audience_calendar(event, audience):
    """Show-day schedule for one group."""
    location = ", ".join(x for x in [event.venue, event.address] if x)
    items = []
    if event.date:
        for r in day_schedule(event, audience):
            items.append({
                "uid": r["id"], "title": (f"{r['who']}: " if r["who"] else "") + f"{r['title']} ({event.name})",
                "start": at_minutes(event.date, r["s"]), "end": at_minutes(event.date, max(r["e"], r["s"] + 5)),
                "location": location,
            })
    return _cal(f"{event.name} · {audience}", items)


def deadlines_calendar(event):
    """Every deadline and paperwork date, plus the show itself."""
    items = []
    if event.date:
        for m in event.milestones.all():
            items.append({"uid": m.id, "all_day": True, "date": due_date(event, m.offset),
                          "title": ("HARD DEADLINE: " if m.hard else "") + f"{m.title} ({event.name})",
                          "desc": "\n".join(x for x in [m.desc, f"Owner: {m.owner or 'unassigned'}"] if x)})
        for c in event.compliance_items.all():
            items.append({"uid": c.id, "all_day": True, "date": due_date(event, c.offset),
                          "title": f"Paperwork due: {c.item} ({event.name})", "desc": f"Responsible: {c.owner or 'unassigned'}"})
        doors = to_minutes(event.doors)
        doors = 19 * 60 if doors is None else doors
        end = to_minutes(event.end)
        end = doors + 180 if end is None else (end + 1440 if end <= doors else end)
        items.append({"uid": f"{event.id}-show", "title": event.name,
                      "start": at_minutes(event.date, doors), "end": at_minutes(event.date, end),
                      "location": ", ".join(x for x in [event.venue, event.address] if x)})
    return _cal(f"{event.name} · Deadlines", items)
