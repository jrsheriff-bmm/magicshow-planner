"""
planner/reminders.py — [v3] who gets a reminder email, when, and what it says.

This follows the SAME rules as reminderPlan() in static/planner/js/reminders.js,
so the preview on the "Calendar & reminders" tab shows exactly what goes out:

  • Deadlines and paperwork: the owner gets an email 7 days before and 1 day
    before the due date (paperwork only until it's marked Submitted).
    Overdue: once the day after, then once a week. Never every day.
  • Show day: everyone with an email gets their itinerary link 7 days and
    1 day before the show.
  • Payments: the planning team (contacts with "Team" ticked) gets the same
    7-day / 1-day / weekly-overdue emails.
  • Approvals: the approver gets a nudge every 7 days while it's still waiting.
  • Mondays: the team gets one summary of everything overdue or due this week.
  • One email per person per day (the daily job merges all events into one).
  • Nothing once the show AND every later deadline (editing, delivery) are past [v4],
    nothing to people with reminders turned off.

It also holds mark_done(), used by the "Mark done" buttons in emails and on
each person's "My tasks" page.
"""
import re
from datetime import date

from .models import ShareLink, TaskLink
from .schedule import due_date, fmt_date, fmt_long
from .budget import usd


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def reminder_tag(delta):
    """delta = days from today until the due date. Returns the label, or None for 'no email today'."""
    if delta == 7:
        return "Due in one week"
    if delta == 1:
        return "Due tomorrow"
    if delta < 0 and ((-delta) - 1) % 7 == 0:
        return "Overdue"
    return None


def find_contact(event, name, ref=""):
    """The event contact an owner name points to (by saved id first, then by name or organization)."""
    contacts = list(event.contacts.all())
    if ref:
        for c in contacts:
            if c.id == ref:
                return c
    n = norm(name)
    if not n:
        return None
    return next((c for c in contacts if norm(c.name) == n), None) or next((c for c in contacts if c.org_name and norm(c.org_name) == n), None)


def reachable(contact):
    return bool(contact and contact.email and "@" in contact.email and contact.remind)


def task_link(event, contact, base):
    link, _ = TaskLink.objects.get_or_create(event=event, contact_ref=contact.id)
    return f"{base}/t/{link.token}/"


def share_link(event, audience, base):
    link, _ = ShareLink.objects.get_or_create(event=event, audience=audience)
    return f"{base}/s/{link.token}/"


def done_link(kind, event, item_id, base):
    from .emails import done_token  # avoids a circular import
    return f"{base}/done/{done_token(kind, event.id, item_id)}/"


def last_active_day(event):
    """[v4] Show day, or a later open deadline (editing, delivery, a payment), whichever is last."""
    last = event.date
    for m in event.milestones.all():
        if m.status != "done":
            last = max(last, due_date(event, m.offset))
    for p in event.compliance_items.all():
        if p.status == "needed":
            last = max(last, due_date(event, p.offset))
    for b in event.budget_lines.all():
        if b.kind == "cost" and b.status != "paid" and b.due:
            last = max(last, b.due)
    return last


def plan_for_day(event, day, base):
    """
    Everything one event wants to email on one day.
    Returns {email: {"name": ..., "contact": EventContact or None, "items": [...]}}.
    Each item: {"kind", "tag", "text", "due" (date or None), "action" (url or ""), "action_label", "list"}.
    """
    out = {}
    if not event.date or day > last_active_day(event):
        return out

    def add(contact_or_name, email, item):
        key = email.strip().lower()
        slot = out.setdefault(key, {"name": "", "email": email.strip(), "contact": None, "items": []})
        if hasattr(contact_or_name, "email"):
            slot["contact"] = slot["contact"] or contact_or_name
            slot["name"] = slot["name"] or contact_or_name.name or contact_or_name.org_name
        else:
            slot["name"] = slot["name"] or contact_or_name
        slot["items"].append(item)

    team = [c for c in event.contacts.all() if reachable(c) and c.team]

    for m in event.milestones.all():
        if m.status == "done":
            continue
        due = due_date(event, m.offset)
        tag = reminder_tag((due - day).days)
        c = find_contact(event, m.owner, m.owner_ref)
        if tag and reachable(c):
            add(c, c.email, {"kind": "Deadline", "tag": tag, "text": m.title, "due": due,
                             "action": done_link("m", event, m.id, base), "action_label": "Mark done"})

    for p in event.compliance_items.all():
        if p.status != "needed":
            continue
        due = due_date(event, p.offset)
        tag = reminder_tag((due - day).days)
        c = find_contact(event, p.owner, p.owner_ref)
        if tag and reachable(c):
            add(c, c.email, {"kind": "Paperwork", "tag": tag, "text": p.item, "due": due,
                             "action": done_link("c", event, p.id, base), "action_label": "Mark submitted"})

    show_delta = (event.date - day).days
    if show_delta in (7, 1):
        label = "Show in one week" if show_delta == 7 else "Show tomorrow"
        for c in event.contacts.all():
            if not reachable(c):
                continue
            groups = [a for a in (c.audiences or []) if a != "Internal"]
            if groups:
                add(c, c.email, {"kind": "Show", "tag": label, "text": f"Your {groups[0]} itinerary for {event.name}",
                                 "due": None, "action": share_link(event, groups[0], base), "action_label": "Open your itinerary"})
            elif "Internal" in (c.audiences or []):
                add(c, c.email, {"kind": "Show", "tag": label, "text": f"{event.name}: full plan",
                                 "due": None, "action": f"{base}/", "action_label": "Open the plan"})

    for b in event.budget_lines.all():
        if b.kind != "cost" or b.status == "paid" or not b.due:
            continue
        tag = reminder_tag((b.due - day).days)
        if tag:
            amount = b.actual if b.actual is not None else b.est
            text = (b.item or b.cat) + (f" to {b.payee}" if b.payee else "") + f" · {usd(amount)}"
            for t in team:
                add(t, t.email, {"kind": "Payment", "tag": tag, "text": text, "due": b.due,
                                 "action": done_link("b", event, b.id, base), "action_label": "Mark paid"})

    for a in event.approvals.all():
        if a.status != "pending" or not a.approver_email:
            continue
        since = (day - a.requested_at.date()).days
        if since > 0 and since % 7 == 0:
            add(a.approver, a.approver_email, {"kind": "Approval", "tag": "Still waiting", "text": a.label, "due": None,
                                                "action": f"{base}/a/{a.token}/", "action_label": "Approve or decline"})

    if day.weekday() == 0 and team:  # Monday
        soon = []
        for m in event.milestones.all():
            due = due_date(event, m.offset)
            if m.status != "done" and (due - day).days <= 7:
                soon.append({"tag": "Overdue" if due < day else "This week", "text": m.title + (f" ({m.owner})" if m.owner else "")})
        for p in event.compliance_items.all():
            due = due_date(event, p.offset)
            if p.status != "approved" and (due - day).days <= 7:
                soon.append({"tag": "Overdue" if due < day else "This week", "text": p.item})
        for b in event.budget_lines.all():
            if b.kind == "cost" and b.status != "paid" and b.due and (b.due - day).days <= 7:
                soon.append({"tag": "Overdue" if b.due < day else "This week", "text": b.item or b.cat})
        if soon:
            for t in team:
                add(t, t.email, {"kind": "Weekly summary", "tag": "Monday summary",
                                 "text": f"{len(soon)} item{'s' if len(soon) > 1 else ''} overdue or due this week",
                                 "due": None, "action": f"{base}/", "action_label": "Open the plan", "list": soon})
    return out


def plan_for_org(events, day, base):
    """
    Merge every event's plan into ONE email per person for the day.
    Returns a list of {"name", "email", "sections": [{"event", "items", "tasks_url"}], "count"}.
    """
    people = {}
    for event in events:
        for key, slot in plan_for_day(event, day, base).items():
            person = people.setdefault(key, {"name": slot["name"], "email": slot["email"], "sections": [], "count": 0})
            tasks_url = task_link(event, slot["contact"], base) if slot["contact"] else ""
            person["sections"].append({"event": event, "when": fmt_long(event.date), "items": slot["items"], "tasks_url": tasks_url})
            person["count"] += len(slot["items"])
    return sorted(people.values(), key=lambda p: p["email"])


# ---------------------------------------------------------------------------
# "Mark done" from an email or the My tasks page
# ---------------------------------------------------------------------------

def find_item(event, kind, item_id):
    if kind == "m":
        return event.milestones.filter(pk=item_id).first()
    if kind == "c":
        return event.compliance_items.filter(pk=item_id).first()
    if kind == "b":
        return event.budget_lines.filter(pk=item_id).first()
    return None


def item_label(kind, item):
    return {"m": lambda i: i.title, "c": lambda i: i.item, "b": lambda i: i.item or i.cat}[kind](item)


def is_done(kind, item):
    return {"m": item.status == "done", "c": item.status in ("submitted", "approved"), "b": item.status == "paid"}[kind]


def mark_done(kind, item):
    """Deadline → Done (with today's date). Paperwork → Submitted. Payment → Paid. Returns True if it changed."""
    if is_done(kind, item):
        return False
    if kind == "m":
        item.status, item.done_at = "done", date.today()
        item.save(update_fields=["status", "done_at"])
    elif kind == "c":
        item.status = "submitted"
        item.save(update_fields=["status"])
    elif kind == "b":
        item.status = "paid"
        if item.paid is None:
            item.paid = item.actual if item.actual is not None else item.est
        item.save(update_fields=["status", "paid"])
    item.event.save(update_fields=["updated_at"])
    return True


def person_tasks(event, contact):
    """Everything one contact owns in an event (for their My tasks page)."""
    names = {norm(contact.name), norm(contact.org_name)} - {""}
    mine = lambda owner, ref: ref == contact.id or norm(owner) in names
    return {
        "deadlines": [(m, due_date(event, m.offset)) for m in event.milestones.all() if mine(m.owner, m.owner_ref)],
        "paperwork": [(p, due_date(event, p.offset)) for p in event.compliance_items.all() if mine(p.owner, p.owner_ref)],
        "equipment": [q for q in event.equipment.all() if mine(q.owner, q.owner_ref)],
    }


def fmt_due(d):
    return fmt_date(d, True) if d else ""

