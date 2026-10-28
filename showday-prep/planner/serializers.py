"""
planner/serializers.py — translating between the database and the screens.

The screens work with one JSON object per event, shaped exactly like the prototype:
    {"id": "...", "name": "...", "date": "2026-11-14", "milestones": [...], "equipment": [...], ...}

  event_to_dict(event)          database → JSON for the screens
  save_event_dict(org, data)    JSON from the screens → database

The beta update adds: each event's own share-page groups, dated checklist steps,
group lists (vendors imported from a spreadsheet) with fees, platform fees on
income, booth groups in the layout, contact tags, custom tabs, and "attendance
isn't counted".

v3 adds: budget lines (with invoice files), approvals (read-only here: the
server owns them, see api.py), wrap-up, "done on" dates, reminder settings,
and your own templates.

Saving works like this: the screens send the WHOLE event every time something
changes. For each list (deadlines, equipment...), we update rows whose id we
already have, create rows with new ids, and delete rows that are no longer in
the list. That's why the ids match between the screens and the database.
"""
from datetime import date, time
from decimal import Decimal, InvalidOperation

from django.db import transaction

from .models import (
    AUDIENCES, DEFAULT_GROUPS, BudgetLine, ComplianceItem, EquipmentItem, Event, EventContact, EventFile, LayoutPiece,
    LayoutPin, Milestone, Note, OrgTemplate, Person, ProgramItem, SetupItem, TimeEntry,
)
import json

# ---------------------------------------------------------------------------
# Small converters. The screens send text; the database wants dates, times, numbers.
# Anything that doesn't make sense becomes empty (None) instead of crashing.
# ---------------------------------------------------------------------------


def t2s(t):
    """time(19, 30) → '19:30'."""
    return t.strftime("%H:%M") if t else ""


def s2t(s):
    """'19:30' → time(19, 30). Bad or empty text → None."""
    try:
        h, m = str(s).split(":")[:2]
        return time(int(h), int(m))
    except (ValueError, TypeError):
        return None


def d2s(d):
    return d.isoformat() if d else ""


def s2d(s):
    """'2026-11-14' → date(2026, 11, 14). Bad or empty text → None."""
    try:
        return date.fromisoformat(str(s)[:10])
    except (ValueError, TypeError):
        return None


def num(v):
    """A money amount from the screens → Decimal, or None if blank."""
    if v in ("", None):
        return None
    try:
        return Decimal(str(v))
    except (InvalidOperation, ValueError):
        return None


def num_out(v):
    """Decimal → a plain number for the screens ('' if blank). 15.00 shows as 15."""
    if v is None:
        return ""
    return int(v) if v == int(v) else float(v)


def int_or_none(v):
    try:
        return None if v in ("", None) else int(float(v))
    except (ValueError, TypeError):
        return None


def to_int(v, default=0):
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return default


def to_float(v, default=0.0):
    try:
        return float(v)
    except (ValueError, TypeError):
        return default


def text(v, limit=5000):
    """Any value → trimmed text no longer than the limit."""
    return ("" if v is None else str(v))[:limit]


def audiences(v, allowed=None):
    """Keep only real group ids ("Internal" plus the event's groups), in a clean list."""
    allowed = allowed or set(AUDIENCES)
    return [a for a in dict.fromkeys(v or []) if a in allowed] if isinstance(v, list) else []


def clean_groups(v):
    """[beta] An event's share-page groups: [{"id", "name", "vendor"}]. Empty → the starting four."""
    out, seen = [], set()
    for g in (v if isinstance(v, list) else [])[:30]:
        if not isinstance(g, dict):
            continue
        gid = clean_id(g.get("id"))
        name = text(g.get("name"), 60).strip()
        if not gid or gid == "Internal" or gid in seen or len(gid) > 30 or not name:
            continue
        seen.add(gid)
        out.append({"id": gid, "name": name, "vendor": bool(g.get("vendor"))})
    return out or [dict(g) for g in DEFAULT_GROUPS]


def group_name(event, gid):
    """The name people see for a group id (the id itself for the starting groups)."""
    if gid == "Internal":
        return "Internal"
    for g in (event.groups or DEFAULT_GROUPS):
        if g.get("id") == gid:
            return g.get("name") or gid
    return gid


def clean_steps(rows):
    """[beta] A deadline's checklist. Each step may have its own due day (offset from show day)."""
    out = []
    for c in (rows or [])[:100]:
        if not isinstance(c, dict):
            continue
        off = c.get("offset")
        out.append({"id": text(c.get("id"), 40), "text": text(c.get("text"), 500), "done": bool(c.get("done")),
                    "offset": None if off in ("", None) else max(-3650, min(3650, to_int(off, 0)))})
    return out


def clean_tabs(v):
    """[beta] Notes tabs added to one event: [{"id", "name", "body"}]."""
    out = []
    for t in (v if isinstance(v, list) else [])[:12]:
        if isinstance(t, dict) and clean_id(t.get("id")):
            out.append({"id": clean_id(t.get("id")), "name": text(t.get("name"), 60).strip() or "Notes", "body": text(t.get("body"), 50000)})
    return out


def clean_id(v):
    """Ids from the screens: short text made of letters, numbers, dashes and underscores."""
    v = text(v, 40)
    return v if v and all(c.isalnum() or c in "-_" for c in v) else None


# ---------------------------------------------------------------------------
# Database → screens
# ---------------------------------------------------------------------------


def ms_time(dt):
    """A date-and-time → milliseconds, the way the screens count time. None stays None."""
    return int(dt.timestamp() * 1000) if dt else None


def approval_to_dict(a):
    """One approval for the screens. The private token is never sent."""
    return {"id": a.id, "targetType": a.target_type, "targetId": a.target_id, "label": a.label,
            "approver": a.approver, "approverEmail": a.approver_email, "note": a.note, "status": a.status,
            "comment": a.comment, "decidedBy": a.decided_by, "decidedAt": ms_time(a.decided_at),
            "requestedAt": ms_time(a.requested_at), "requestedBy": a.requested_by_name}


def template_to_dict(t):
    return {"id": t.id, "name": t.name, "desc": t.desc, "data": t.data or {}, "fromEvent": t.from_event,
            "createdAt": ms_time(t.created_at), "updatedAt": ms_time(t.updated_at)}


def file_to_dict(f):
    return {"id": f.id, "name": f.name, "type": f.content_type, "size": f.size, "url": f"/files/{f.id}/"}


def event_to_dict(e):
    """Build the full JSON object the screens expect for one event."""
    return {
        "id": e.id,
        "kind": e.kind,
        "name": e.name,
        "series": e.series,
        "date": d2s(e.date),
        "venue": e.venue,
        "address": e.address,
        "host": e.host,
        "doors": t2s(e.doors),
        "end": t2s(e.end),
        "priceAdv": num_out(e.price_adv),
        "priceDoor": num_out(e.price_door),
        "capacity": e.capacity if e.capacity is not None else "",
        "target": e.target if e.target is not None else "",
        "about": e.about,
        "houseRules": e.house_rules or [],
        "aiSummary": e.ai_summary,
        "budgetTotal": num_out(e.budget_total),
        "wrapup": e.wrapup or {},
        "groups": e.groups or [dict(g) for g in DEFAULT_GROUPS],
        "noHeadcount": e.no_headcount,
        "customTabs": e.custom_tabs or [],
        "hiddenTabs": e.hidden_tabs or [],
        "milestones": [
            {"id": m.id, "title": m.title, "desc": m.desc, "offset": m.offset, "phase": m.phase,
             "owner": m.owner, "ownerId": m.owner_ref, "hard": m.hard, "status": m.status,
             "doneAt": d2s(m.done_at), "checklist": [dict({"offset": None}, **c) for c in (m.checklist or [])]}
            for m in e.milestones.all()
        ],
        "budget": [
            {"id": b.id, "kind": b.kind, "cat": b.cat, "item": b.item, "payee": b.payee, "payeeId": b.payee_ref,
             "est": num_out(b.est), "actual": num_out(b.actual), "paid": num_out(b.paid), "due": d2s(b.due),
             "status": b.status, "notes": b.notes, "fees": num_out(b.fees), "files": [file_to_dict(f) for f in b.files.all()]}
            for b in e.budget_lines.all()
        ],
        "approvals": [approval_to_dict(a) for a in e.approvals.all()],
        "setup": [
            {"id": s.id, "title": s.title, "start": t2s(s.start), "end": t2s(s.end), "track": s.track,
             "audiences": s.audiences or [], "notes": s.notes}
            for s in e.setup_items.all()
        ],
        "program": {
            "start": t2s(e.program_start),
            "items": [
                {"id": p.id, "title": p.title, "who": p.who, "dur": p.dur,
                 "audiences": p.audiences or [], "notes": p.notes}
                for p in e.program_items.all()
            ],
        },
        "contacts": [
            {"id": c.id, "personId": c.person_id or "", "role": c.role, "name": c.name, "org": c.org_name,
             "phone": c.phone, "email": c.email, "audiences": c.audiences or [],
             "showPhone": c.show_phone, "invoiceUrl": c.invoice_url, "remind": c.remind, "team": c.team,
             "roster": c.roster, "booth": c.booth, "fee": num_out(c.fee), "feePaid": c.fee_paid, "sentAt": ms_time(c.sent_at)}
            for c in e.contacts.all()
        ],
        "compliance": [
            {"id": c.id, "item": c.item, "owner": c.owner, "ownerId": c.owner_ref, "offset": c.offset, "status": c.status,
             "expires": d2s(c.expires), "notes": c.notes, "files": [file_to_dict(f) for f in c.files.all()]}
            for c in e.compliance_items.all()
        ],
        "equipment": [
            {"id": q.id, "item": q.item, "cat": q.cat, "qty": q.qty, "source": q.source,
             "owner": q.owner, "ownerId": q.owner_ref, "status": q.status, "notes": q.notes}
            for q in e.equipment.all()
        ],
        "layout": {
            "image": e.floor_plan_id or "",
            "room": {"w": e.room_width, "d": e.room_depth},
            "pieces": [
                {"id": p.id, "kind": p.kind, "label": p.label, "x": p.x, "y": p.y, "w": p.w, "h": p.h, "rot": p.rot,
                 "group": p.group, "contactId": p.contact_id}
                for p in e.layout_pieces.all()
            ],
            "pins": [
                {"id": p.id, "label": p.label, "kind": p.kind, "x": p.x, "y": p.y,
                 "contactId": p.contact_id, "notes": p.notes}
                for p in e.layout_pins.all()
            ],
        },
        "createdAt": int(e.created_at.timestamp() * 1000) if e.created_at else None,
        "updatedAt": int(e.updated_at.timestamp() * 1000) if e.updated_at else None,
    }


def event_queryset(org):
    """All of an organization's events, with their lists loaded in a few database trips."""
    return Event.objects.filter(org=org).prefetch_related(
        "milestones", "setup_items", "program_items", "contacts", "compliance_items__files",
        "equipment", "layout_pieces", "layout_pins", "budget_lines__files", "approvals",
    )


def person_to_dict(p):
    return {"id": p.id, "name": p.name, "org": p.org_name, "role": p.role, "phone": p.phone,
            "email": p.email, "invoiceUrl": p.invoice_url, "notes": p.notes, "tags": p.tags or []}


def note_to_dict(n):
    return {"id": n.id, "text": n.text, "where": n.where, "eventId": n.event_id_ref, "done": n.done,
            "shared": n.shared, "createdAt": int(n.created_at.timestamp() * 1000)}


# ---------------------------------------------------------------------------
# Screens → database
# ---------------------------------------------------------------------------


def _sync(model, event, rows, fill):
    """
    Make the database rows for one list match what the screens sent.
      model: which table (e.g. Milestone)
      rows:  the list from the screens
      fill:  a function that copies fields from one screen row onto a database row
    """
    existing = {obj.id: obj for obj in model.objects.filter(event=event)}
    keep = set()
    for position, row in enumerate(rows if isinstance(rows, list) else []):
        if not isinstance(row, dict):
            continue
        row_id = clean_id(row.get("id"))
        if not row_id:
            continue
        obj = existing.get(row_id)
        if obj is None:
            # Guard: never take over a row that belongs to a different event.
            if model.objects.filter(pk=row_id).exclude(event=event).exists():
                continue
            obj = model(id=row_id, event=event)
        obj.position = position
        fill(obj, row)
        obj.save()
        keep.add(row_id)
    model.objects.filter(event=event).exclude(id__in=keep).delete()
    return keep


@transaction.atomic
def save_event_dict(org, event_id, data):
    """
    Create or update one event (and all its lists) from the screens' JSON.
    'transaction.atomic' means: if anything fails halfway, nothing is saved at all.
    """
    event = Event.objects.filter(pk=event_id, org=org).first() or Event(id=event_id, org=org)

    # Event facts
    event.kind = "venue" if data.get("kind") == "venue" else "organizer"
    event.name = text(data.get("name"), 200) or "Untitled event"
    event.series = text(data.get("series"), 200)
    event.date = s2d(data.get("date"))
    event.venue = text(data.get("venue"), 200)
    event.address = text(data.get("address"), 300)
    event.host = text(data.get("host"), 200)
    event.doors = s2t(data.get("doors"))
    event.end = s2t(data.get("end"))
    event.price_adv = num(data.get("priceAdv"))
    event.price_door = num(data.get("priceDoor"))
    event.capacity = int_or_none(data.get("capacity"))
    event.target = int_or_none(data.get("target"))
    event.about = text(data.get("about"))
    event.house_rules = [text(r, 500) for r in (data.get("houseRules") or []) if str(r).strip()][:50]
    event.ai_summary = text(data.get("aiSummary"), 20000)
    event.budget_total = num(data.get("budgetTotal"))
    event.wrapup = clean_wrapup(data.get("wrapup"))
    event.groups = clean_groups(data.get("groups"))
    event.no_headcount = bool(data.get("noHeadcount"))
    event.custom_tabs = clean_tabs(data.get("customTabs"))
    event.hidden_tabs = [k for k in (data.get("hiddenTabs") or []) if isinstance(k, str) and k.isidentifier()][:20]
    allowed = {"Internal"} | {g["id"] for g in event.groups}

    program = data.get("program") or {}
    event.program_start = s2t(program.get("start"))

    layout = data.get("layout") or {}
    room = layout.get("room") or {}
    event.room_width = max(10, min(400, to_float(room.get("w"), 60)))
    event.room_depth = max(10, min(400, to_float(room.get("d"), 80)))
    image_id = clean_id(layout.get("image"))
    event.floor_plan = EventFile.objects.filter(pk=image_id, org=org).first() if image_id else None
    event.save()

    # Each list, one at a time.
    def fill_milestone(o, r):
        o.title = text(r.get("title"), 500) or "Untitled deadline"
        o.desc = text(r.get("desc"))
        o.offset = to_int(r.get("offset"), -14)
        o.phase = text(r.get("phase"), 100)
        o.owner = text(r.get("owner"), 200)
        o.hard = bool(r.get("hard"))
        o.status = r.get("status") if r.get("status") in ("todo", "doing", "done") else "todo"
        o.owner_ref = clean_id(r.get("ownerId")) or ""
        # The day it was marked done (the screens send it; if not, today). Cleared if reopened.
        o.done_at = (s2d(r.get("doneAt")) or o.done_at or date.today()) if o.status == "done" else None
        o.checklist = clean_steps(r.get("checklist"))
    _sync(Milestone, event, data.get("milestones"), fill_milestone)

    def fill_setup(o, r):
        o.title = text(r.get("title"), 500) or "Setup item"
        o.start = s2t(r.get("start"))
        o.end = s2t(r.get("end"))
        o.track = text(r.get("track"), 50) or "Production"
        o.audiences = audiences(r.get("audiences"), allowed)
        o.notes = text(r.get("notes"))
    _sync(SetupItem, event, data.get("setup"), fill_setup)

    def fill_program(o, r):
        o.title = text(r.get("title"), 500) or "Segment"
        o.who = text(r.get("who"), 200)
        o.dur = max(0, to_int(r.get("dur"), 15))
        o.audiences = audiences(r.get("audiences"), allowed)
        o.notes = text(r.get("notes"))
    _sync(ProgramItem, event, program.get("items"), fill_program)

    def fill_contact(o, r):
        pid = clean_id(r.get("personId"))
        o.person = Person.objects.filter(pk=pid, org=org).first() if pid else None
        o.role = text(r.get("role"), 200)
        o.name = text(r.get("name"), 200)
        o.org_name = text(r.get("org"), 200)
        o.phone = text(r.get("phone"), 50)
        o.email = text(r.get("email"), 254)
        o.audiences = audiences(r.get("audiences"), allowed)
        o.show_phone = bool(r.get("showPhone"))
        o.invoice_url = text(r.get("invoiceUrl"), 500)
        o.remind = r.get("remind") is not False
        o.team = bool(r.get("team"))
        o.roster = bool(r.get("roster"))
        o.booth = text(r.get("booth"), 300)
        o.fee = num(r.get("fee"))
        o.fee_paid = bool(r.get("feePaid"))
        # sent_at is set by the server when it emails an itinerary; the screens can't change it
    _sync(EventContact, event, data.get("contacts"), fill_contact)

    def fill_compliance(o, r):
        o.item = text(r.get("item"), 500) or "Paperwork item"
        o.owner = text(r.get("owner"), 200)
        o.offset = to_int(r.get("offset"), -21)
        o.status = r.get("status") if r.get("status") in ("needed", "submitted", "approved") else "needed"
        o.expires = s2d(r.get("expires"))
        o.notes = text(r.get("notes"))
        o.owner_ref = clean_id(r.get("ownerId")) or ""
    kept = _sync(ComplianceItem, event, data.get("compliance"), fill_compliance)

    # Attach uploaded files to the paperwork item they're listed under.
    for row in data.get("compliance") or []:
        cid = clean_id(row.get("id")) if isinstance(row, dict) else None
        if cid not in kept:
            continue
        file_ids = [clean_id(f.get("id")) for f in (row.get("files") or []) if isinstance(f, dict)]
        EventFile.objects.filter(org=org, pk__in=[f for f in file_ids if f]).update(compliance_item_id=cid)
        EventFile.objects.filter(org=org, compliance_item_id=cid).exclude(pk__in=[f for f in file_ids if f]).update(compliance_item=None)

    def fill_equipment(o, r):
        o.item = text(r.get("item"), 300) or "Item"
        o.cat = text(r.get("cat"), 100) or "Supplies"
        o.qty = max(0, to_int(r.get("qty"), 1))
        o.source = text(r.get("source"), 50) or "Owned"
        o.owner = text(r.get("owner"), 200)
        valid = ("needed", "secured", "packed", "loaded", "returned")
        o.status = r.get("status") if r.get("status") in valid else "needed"
        o.notes = text(r.get("notes"))
        o.owner_ref = clean_id(r.get("ownerId")) or ""
    _sync(EquipmentItem, event, data.get("equipment"), fill_equipment)

    # [v3] Budget lines, and the invoices attached to them.
    def fill_budget(o, r):
        o.kind = "income" if r.get("kind") == "income" else "cost"
        o.cat = text(r.get("cat"), 100) or "Other"
        o.item = text(r.get("item"), 300)
        o.payee = text(r.get("payee"), 200)
        o.payee_ref = clean_id(r.get("payeeId")) or ""
        o.est, o.actual, o.paid = num(r.get("est")), num(r.get("actual")), num(r.get("paid"))
        o.due = s2d(r.get("due"))
        valid = ("expected", "confirmed", "received") if o.kind == "income" else ("estimated", "committed", "invoiced", "paid")
        o.status = r.get("status") if r.get("status") in valid else valid[0]
        o.notes = text(r.get("notes"))
        o.fees = num(r.get("fees")) if o.kind == "income" else None
    kept_budget = _sync(BudgetLine, event, data.get("budget"), fill_budget)
    for row in data.get("budget") or []:
        bid = clean_id(row.get("id")) if isinstance(row, dict) else None
        if bid not in kept_budget:
            continue
        file_ids = [f for f in (clean_id(x.get("id")) for x in (row.get("files") or []) if isinstance(x, dict)) if f]
        EventFile.objects.filter(org=org, pk__in=file_ids).update(budget_line_id=bid)
        EventFile.objects.filter(org=org, budget_line_id=bid).exclude(pk__in=file_ids).update(budget_line=None)
    # Approvals are NOT saved from here. They change only through the approval addresses in api.py,
    # so nobody can mark something approved just by editing the page.

    def fill_piece(o, r):
        o.kind = text(r.get("kind"), 30) or "label"
        o.label = text(r.get("label"), 200)
        o.x, o.y = to_float(r.get("x")), to_float(r.get("y"))
        o.w, o.h = max(0.5, to_float(r.get("w"), 6)), max(0.5, to_float(r.get("h"), 4))
        o.rot = to_int(r.get("rot")) % 360
        o.group = r.get("group") if r.get("group") in allowed else ""
        o.contact_id = clean_id(r.get("contactId")) or ""
    _sync(LayoutPiece, event, layout.get("pieces"), fill_piece)

    def fill_pin(o, r):
        o.label = text(r.get("label"), 200)
        o.kind = text(r.get("kind"), 50) or "Other"
        o.x = max(0, min(100, to_float(r.get("x"), 50)))
        o.y = max(0, min(100, to_float(r.get("y"), 50)))
        o.contact_id = clean_id(r.get("contactId")) or ""
        o.notes = text(r.get("notes"))
    _sync(LayoutPin, event, layout.get("pins"), fill_pin)

    return event


def save_person_dict(org, person_id, data):
    person = Person.objects.filter(pk=person_id, org=org).first() or Person(id=person_id, org=org)
    person.name = text(data.get("name"), 200)
    person.org_name = text(data.get("org"), 200)
    person.role = text(data.get("role"), 200)
    person.phone = text(data.get("phone"), 50)
    email = text(data.get("email"), 254)
    person.email = email if "@" in email else ""
    url = text(data.get("invoiceUrl"), 500)
    person.invoice_url = url if url.startswith("https://") else ""
    person.notes = text(data.get("notes"))
    person.tags = [t for t in dict.fromkeys(text(x, 40).strip() for x in (data.get("tags") or []) if str(x).strip())][:12]
    person.save()
    return person


def save_note_dict(org, user, note_id, data):
    note = Note.objects.filter(pk=note_id, org=org).first() or Note(id=note_id, org=org, author=user)
    note.text = text(data.get("text"), 5000)
    note.where = text(data.get("where"), 300)
    note.event_id_ref = text(data.get("eventId"), 40)
    note.done = bool(data.get("done"))
    note.shared = bool(data.get("shared"))
    note.save()
    return note


def clean_wrapup(v):
    """[v3] The Wrap-up tab's answers. Kept as JSON; limited in size so nothing huge gets stored."""
    if not isinstance(v, dict):
        return {}
    out = {
        "attendance": int_or_none(v.get("attendance")) if v.get("attendance") not in ("", None) else "",
        "ticketsSold": int_or_none(v.get("ticketsSold")) if v.get("ticketsSold") not in ("", None) else "",
        "rating": int_or_none(v.get("rating")) if v.get("rating") not in ("", None) else "",
        "worked": text(v.get("worked"), 5000),
        "change": text(v.get("change"), 5000),
        "completedAt": to_int(v.get("completedAt"), 0) or None,
        "ratings": {},
    }
    for cid, r in list((v.get("ratings") or {}).items())[:200]:
        if clean_id(cid) and isinstance(r, dict):
            score = int_or_none(r.get("score"))
            out["ratings"][cid] = {"score": score if score and 1 <= score <= 5 else "", "note": text(r.get("note"), 500)}
    return out


def save_template_dict(org, template_id, data):
    """[v3] Save one of "Your templates". The template's contents (data) are kept as JSON."""
    tpl = OrgTemplate.objects.filter(pk=template_id, org=org).first() or OrgTemplate(id=template_id, org=org)
    tpl.name = text(data.get("name"), 200) or "Untitled template"
    tpl.desc = text(data.get("desc"), 500)
    tpl.from_event = text(data.get("fromEvent"), 200)
    body = data.get("data") if isinstance(data.get("data"), dict) else {}
    if len(json.dumps(body)) > 1_000_000:
        raise ValueError("That template is too large to save.")
    tpl.data = body
    tpl.save()
    return tpl


def hour_to_dict(t):
    """[v4] One Hours entry for the screens."""
    return {"id": t.id, "date": d2s(t.date), "hours": num_out(t.hours), "cat": t.cat, "eventId": t.event_ref,
            "note": t.note, "who": t.who}


def save_hour_dict(org, entry_id, data, user=None):
    """[v4] Save one Hours entry. Hours must be between 0 and 24."""
    entry = TimeEntry.objects.filter(pk=entry_id, org=org).first() or TimeEntry(id=entry_id, org=org)
    entry.date = s2d(data.get("date")) or date.today()
    hours = num(data.get("hours")) or 0
    entry.hours = max(0, min(24, hours))
    entry.cat = data.get("cat") if data.get("cat") in TimeEntry.CATS else "Admin"
    entry.event_ref = clean_id(data.get("eventId")) or ""
    entry.note = text(data.get("note"), 500)
    entry.who = text(data.get("who"), 200) or (user.get_full_name() or user.username if user else "")
    entry.save()
    return entry
