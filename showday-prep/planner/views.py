"""
planner/views.py — the pages people open in a browser (the API lives in api.py).

  /                       the app itself (login required)
  /s/<token>/             a private share page, e.g. the Vendors itinerary (no login)
  /s/<token>/calendar.ics a live calendar feed for that share link (no login)
  /files/<id>/            download an uploaded file (login required, same organization only)
  /healthz                a tiny "I'm alive" page Render checks

New in v3 (all opened from emails, no login needed):
  /t/<token>/             one person's "My tasks" page, where they can mark things done
  /done/<code>/           the "Mark done" button in a reminder email (asks once, then marks it)
  /a/<token>/             the approver's Approve / Decline page
"""
from datetime import date

from django.contrib.auth.decorators import login_required
from django.utils import timezone
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404, render
from django.views.decorators.csrf import ensure_csrf_cookie

from . import ics, reminders
from .access import get_org, sync_support
from .models import Membership
from .emails import read_done_token, send_approval_decision, site_url
from .models import Approval, Event, EventContact, EventFile, ShareLink, TaskLink
from .schedule import day_schedule, fmt12, fmt_long, due_date, fmt_date


@login_required
@ensure_csrf_cookie  # gives the browser the token it needs to save changes safely
def app(request):
    """The planner screens. All the drawing happens in JavaScript (static/planner/js/)."""
    sync_support(request.user)   # [final] keeps the Blackmagic team's access to client workspaces current
    org = get_org(request.user, request.session)
    return render(request, "planner/app.html", {"org": org})


def share_page(request, token):
    """
    A read-only itinerary for one group (Performers, Vendors, Venue, Security).
    Anyone with the link can open it, so it only shows what that group is tagged to see.
    Phone numbers only appear when "Phone visible" is turned on for that person.
    """
    link = get_object_or_404(ShareLink.objects.select_related("event"), token=token)
    event = link.event
    audience = link.audience
    if audience == "Deadlines":
        raise Http404("This link is a calendar feed. Add it to a calendar app instead.")
    rows = [{"time": fmt12(r["s"]) + (f" – {fmt12(r['e'])}" if r["kind"] == "setup" else ""),
             "title": (f"{r['who']} · " if r["who"] else "") + r["title"],
             "detail": r["track"] if r["kind"] == "setup" else f"{r['e'] - r['s']} min"}
            for r in day_schedule(event, audience)]
    people = [c for c in event.contacts.all() if audience == "Internal" or audience in (c.audiences or [])]
    contacts = [{"name": c.name or "Name to confirm", "detail": " · ".join(x for x in [c.role, c.org_name] if x),
                 "phone": c.phone if (audience == "Internal" or c.show_phone) else "",
                 "invoice": c.invoice_url if c.invoice_url.startswith("https://") and audience != "Internal" else ""}
                for c in people]
    bring = [q for q in event.equipment.all() if q.source == "Vendor brings"] if audience == "Vendors" else []
    paperwork = []
    if audience in ("Vendors", "Venue", "Internal"):
        names = [n for c in people for n in (c.name.lower(), c.org_name.lower()) if n]
        for item in event.compliance_items.all():
            owner = item.owner.lower()
            if audience == "Internal" or any(n in owner for n in names):
                paperwork.append({"date": fmt_date(due_date(event, item.offset), True), "item": item.item,
                                  "detail": f"{item.owner} · {item.get_status_display()}"})
    return render(request, "planner/share.html", {
        "event": event, "audience": audience, "date_long": fmt_long(event.date), "rows": rows,
        "contacts": contacts, "bring": bring, "paperwork": paperwork, "token": token,
        "rules": event.house_rules if event.kind == "venue" else [],
    })


def calendar_feed(request, token):
    """A calendar file that calendar apps can subscribe to. It always reflects the latest data."""
    link = get_object_or_404(ShareLink.objects.select_related("event"), token=token)
    body = ics.deadlines_calendar(link.event) if link.audience == "Deadlines" else ics.audience_calendar(link.event, link.audience)
    response = HttpResponse(body, content_type="text/calendar; charset=utf-8")
    response["Content-Disposition"] = f'inline; filename="{link.event.name[:40]} {link.audience}.ics"'
    return response


@login_required
def download_file(request, file_id):
    """Send an uploaded file, but only to people in the organization that owns it."""
    record = get_object_or_404(EventFile, pk=file_id)
    # [v4] Any workspace the person belongs to, not only the one open right now.
    if not Membership.objects.filter(user=request.user, org=record.org).exists():
        raise Http404()
    as_attachment = request.GET.get("download") == "1"
    return FileResponse(record.file.open("rb"), as_attachment=as_attachment, filename=record.name, content_type=record.content_type or None)


def healthz(request):
    return HttpResponse("ok")


# ---------------------------------------------------------------------------
# [v3] Pages opened from emails
# ---------------------------------------------------------------------------

DONE_WORDS = {"m": "Done", "c": "Submitted", "b": "Paid"}


def task_page(request, token):
    """One person's tasks for one event. POST marks one of them done."""
    link = get_object_or_404(TaskLink.objects.select_related("event"), token=token)
    event = link.event
    contact = get_object_or_404(EventContact, pk=link.contact_ref, event=event)
    message = ""
    if request.method == "POST":
        kind, item_id = request.POST.get("kind"), request.POST.get("id", "")
        tasks = reminders.person_tasks(event, contact)
        allowed = {("m", m.id) for m, _ in tasks["deadlines"]} | {("c", p.id) for p, _ in tasks["paperwork"]}
        if (kind, item_id) in allowed:
            item = reminders.find_item(event, kind, item_id)
            if item and reminders.mark_done(kind, item):
                message = f"Marked {DONE_WORDS[kind].lower()}: {reminders.item_label(kind, item)}. Thanks!"
    groups = [a for a in (contact.audiences or []) if a != "Internal"]
    return render(request, "planner/task_page.html", {
        "event": event, "contact": contact, "date_long": fmt_long(event.date), "today": date.today(),
        "tasks": reminders.person_tasks(event, contact), "message": message,
        "itinerary": reminders.share_link(event, groups[0], site_url(request)) if groups else "",
    })


def done_action(request, code):
    """
    The "Mark done" button from a reminder email. Opening the link only ASKS; the change
    happens when they press the button (a POST). That matters because some email systems
    open every link in an email to scan it, and that must not mark things done by itself.
    """
    data = read_done_token(code)
    if not data or data.get("k") not in DONE_WORDS:
        raise Http404("This link has expired or isn't valid.")
    event = get_object_or_404(Event, pk=data.get("e"))
    item = reminders.find_item(event, data["k"], data.get("i"))
    if not item:
        raise Http404("That item was removed from the plan.")
    already = reminders.is_done(data["k"], item)
    changed = False
    if request.method == "POST" and not already:
        changed = reminders.mark_done(data["k"], item)
    owner_ref = getattr(item, "owner_ref", "")
    tasks_url = ""
    if owner_ref and EventContact.objects.filter(pk=owner_ref, event=event).exists():
        tasks_url = reminders.task_link(event, EventContact(id=owner_ref), site_url(request))
    return render(request, "planner/done_page.html", {
        "event": event, "label": reminders.item_label(data["k"], item), "date_long": fmt_long(event.date),
        "done_word": DONE_WORDS[data["k"]], "already": already and not changed, "changed": changed, "tasks_url": tasks_url,
    })


def approval_page(request, token):
    """The approver's page: Approve or Decline, with an optional comment."""
    approval = get_object_or_404(Approval.objects.select_related("event", "requested_by"), token=token)
    if request.method == "POST" and approval.status == "pending":
        decision = request.POST.get("decision")
        if decision in ("approved", "declined"):
            approval.status = decision
            approval.decided_by = (request.POST.get("by") or approval.approver)[:200]
            approval.comment = (request.POST.get("comment") or "")[:2000]
            approval.decided_at = timezone.now()
            approval.save()
            approval.event.save(update_fields=["updated_at"])
            try:
                send_approval_decision(approval, site_url(request))
            except Exception:  # the decision is saved even if the notice email fails
                pass
    return render(request, "planner/approval_page.html", {"event": approval.event, "approval": approval, "date_long": fmt_long(approval.event.date)})
