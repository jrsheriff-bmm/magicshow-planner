"""
planner/checks.py — the "Checks" list, in Python.

The Checks tab on screen runs its own (fuller) version in JavaScript. This Python
version covers the most important checks so the server can use them too: in the
AI meeting summary and in reminder emails.

Each check is a dict: {"level": "critical" | "warning" | "info", "text": "..."}
"""
import re
from datetime import date

from .budget import budget_summary, usd
from .schedule import due_date, fmt12, fmt_date, program_times, to_minutes


def _norm(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def _in_people(event, name):
    """Is this name (or organization) somewhere in the event's People list?"""
    n = _norm(name)
    if not n:
        return True
    for c in event.contacts.all():
        a, b = _norm(c.name), _norm(c.org_name)
        if (a and (a in n or n in a)) or (b and (b in n or n in b)):
            return True
    return False


def run_checks(event, today=None):
    today = today or date.today()
    out = []

    def add(level, text):
        out.append({"level": level, "text": text})

    if not event.date:
        add("critical", "Show date isn't set, so no deadlines can be calculated.")
        return out

    for m in event.milestones.all():
        due = due_date(event, m.offset)
        if m.status != "done":
            if due < today:
                add("critical" if m.hard else "warning",
                    f"“{m.title}” was due {fmt_date(due, True)}{' (hard deadline)' if m.hard else ''} and isn't marked done.")
            elif m.hard and (due - today).days <= 7:
                add("warning", f"Hard deadline “{m.title}” is due in {(due - today).days} days.")
            for st in m.checklist or []:   # [beta] steps with their own due day
                if st.get("offset") is not None and not st.get("done") and due_date(event, st["offset"]) < today:
                    add("warning", f"Step “{st.get('text')}” of “{m.title}” was due {fmt_date(due_date(event, st['offset']), True)}.")

    for c in event.compliance_items.all():
        due = due_date(event, c.offset)
        if c.status != "approved":
            if due < today:
                add("critical", f"“{c.item}” was due {fmt_date(due, True)} and isn't approved.")
            elif (due - today).days <= 14:
                add("warning", f"“{c.item}” is due in {(due - today).days} days ({fmt_date(due, True)}).")
        if c.expires and c.expires < event.date:
            add("critical", f"“{c.item}” expires {fmt_date(c.expires)}, before show day.")
        if c.owner and not _in_people(event, c.owner):
            add("warning", f"“{c.item}” is assigned to {c.owner}, who isn't in People.")

    days_left = (event.date - today).days
    needed = [q for q in event.equipment.all() if q.status == "needed"]
    if 0 <= days_left <= 7 and needed:
        add("warning", f"{len(needed)} equipment items are still marked Needed with {days_left} days to go.")

    program = program_times(event)
    end = to_minutes(event.end)
    if program and end is not None:
        start = to_minutes(event.program_start) or 0
        end_m = end + 1440 if end < start else end
        if program[-1]["e"] > end_m:
            add("warning", f"The program runs to {fmt12(program[-1]['e'])}, past the scheduled end of {fmt12(end)}.")
    for p in program:
        if p["who"] and not _in_people(event, p["who"]):
            add("warning", f"“{p['who']}” in the run of show doesn't match anyone in People.")

    for c in event.contacts.all():
        if not c.name.strip() or re.search(r"tbd|insert|\[", c.name.lower()):
            add("critical", f"{c.role or 'A contact'} has no confirmed name yet.")

    # [v3] Budget and approvals
    b = budget_summary(event)
    if b["cap"] and b["proj_cost"] > b["cap"]:
        add("critical", f"Projected costs ({usd(b['proj_cost'])}) are over the budget of {usd(b['cap'])} by {usd(b['proj_cost'] - b['cap'])}.")
    elif b["cap"] and b["proj_cost"] > b["cap"] * 9 / 10:
        add("warning", f"Projected costs are at {round(b['proj_cost'] / b['cap'] * 100)}% of the budget.")
    for line in event.budget_lines.all():
        if line.kind == "cost" and line.status != "paid" and line.due and line.due < today:
            add("critical", f"Payment for “{line.item or line.cat}”{' to ' + line.payee if line.payee else ''} was due {fmt_date(line.due, True)} and isn't marked paid.")
    for a in event.approvals.all():
        if a.status == "declined":
            add("warning", f"“{a.label}” was declined by {a.decided_by or a.approver}" + (f": {a.comment}" if a.comment else "."))

    order = {"critical": 0, "warning": 1, "info": 2}
    return sorted(out, key=lambda x: order[x["level"]])
