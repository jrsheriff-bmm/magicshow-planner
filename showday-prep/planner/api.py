"""
planner/api.py — the JSON "API" the screens talk to.

The screens (planner/static/planner/js/) never touch the database directly. They
send and receive JSON through these addresses (listed in planner/urls.py):

  GET    /api/bootstrap/                  everything needed to draw the screens at start-up
  GET    /api/events/<id>/                one event
  PUT    /api/events/<id>/                create or save one event (the whole thing)
  DELETE /api/events/<id>/                delete one event
  PUT    /api/people/<id>/                create or save a contact in the directory
  DELETE /api/people/<id>/                delete a contact
  PUT    /api/notes/<id>/                 create or save a testing note
  DELETE /api/notes/<id>/                 delete a note
  POST   /api/files/                      upload a file (permit PDF, floor plan image...)
  GET    /api/events/<id>/share-links/    the private share and calendar links for an event

New in v3:
  PUT    /api/templates/<id>/             save one of "Your templates"
  DELETE /api/templates/<id>/             delete it
  POST   /api/events/<id>/approvals/      request an approval (emails the approver)
  POST   /api/approvals/<id>/decide/      record an answer given in person or by phone
  POST   /api/approvals/<id>/resend/      email the approver again
  DELETE /api/approvals/<id>/             cancel a request / delete the record
  GET    /api/events/<id>/person-link/<contact id>/   that person's private "My tasks" link
  POST   /api/reports/ai-summary/         AI status summary across all upcoming events

New in v4:
  POST   /api/orgs/                       create a client workspace (you become its owner) and switch to it
  POST   /api/orgs/switch/                switch to another workspace you belong to
  PUT    /api/org/settings/               the workspace's retainer hours and hourly rate (owners only)
  PUT    /api/hours/<id>/                 save one Hours entry
  DELETE /api/hours/<id>/                 delete it

New in the final version:
  PUT    /api/account/                    change your own name and email
  PUT    /api/org/settings/               now also: rename the workspace, and switch the
                                          Blackmagic team's "support access" on or off
  (removed) /api/events/<id>/ai-summary/  the per-event AI meeting summary

New in the beta update (more in teams.py and testing.py):
  POST   /api/events/<id>/send-itinerary/ email one group (or chosen people) their itinerary link

Every function here starts with @api_login_required, which checks the login and
passes in the user's organization, so nobody can reach another organization's data.
"""
import json
import logging

from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from . import ai
from . import access
from .access import api_login_required, can_manage, get_membership, memberships
from .emails import send_approval_decision, send_approval_request, send_itinerary as email_itinerary, site_url
from .models import MANAGER_ROLES, short_id, JoinRequest, Approval, Event, EventContact, EventFile, Membership, Note, Organization, OrgTemplate, Person, ShareLink, TaskLink, TimeEntry
from .serializers import (
    approval_to_dict, clean_id, event_queryset, event_to_dict, file_to_dict, note_to_dict, person_to_dict,
    save_event_dict, save_note_dict, save_person_dict, save_template_dict, template_to_dict, text, group_name,
    hour_to_dict, num, num_out, save_hour_dict,
)

log = logging.getLogger(__name__)

SHARE_AUDIENCES = ["Performers", "Vendors", "Venue", "Security", "Internal", "Deadlines"]
ALLOWED_UPLOADS = ("application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain", "text/csv")


def owned_org_ids(user, current):
    """[v4] The current workspace plus every workspace this person owns (or supports, for the Blackmagic team)."""
    return {current.id} | set(Membership.objects.filter(user=user, role__in=MANAGER_ROLES).values_list("org_id", flat=True))


def read_json(request):
    """Read the JSON body the screens sent. Returns None if it isn't valid JSON."""
    try:
        data = json.loads(request.body or b"{}")
        return data if isinstance(data, dict) else None
    except (ValueError, UnicodeDecodeError):
        return None


def bad(message, status=400):
    return JsonResponse({"error": message}, status=status)


@require_http_methods(["GET"])
@api_login_required
def bootstrap(request, org):
    """Everything the screens need when the page first opens."""
    role = get_membership(request.user, request.session).role
    # [beta] An organization name typed at sign-up that matched existing ones: offer to ask to join.
    suggest = request.session.pop("suggest_join", "")
    suggestions = [{"id": o.id, "name": o.name, "city": o.city}
                   for o in Organization.objects.filter(name__iexact=suggest, discoverable=True, personal=False)
                   .exclude(memberships__user=request.user)[:5]] if suggest else []
    return JsonResponse({
        "user": {"id": request.user.id, "name": request.user.get_full_name() or request.user.username, "email": request.user.email,
                 "team": access.is_team(request.user)},
        "org": {"id": org.id, "name": org.name, "role": role,
                "retainerHours": num_out(org.retainer_hours), "hourlyRate": num_out(org.hourly_rate),
                "plan": org.plan, "supportAccess": org.support_access, "personal": org.personal, "discoverable": org.discoverable},
        # [beta] members of this workspace, so they can be picked as owners of deadlines
        "members": [{"name": m.user.get_full_name() or m.user.username, "email": m.user.email, "role": m.role}
                    for m in Membership.objects.filter(org=org).exclude(role="support").select_related("user")],
        "pendingRequests": JoinRequest.objects.filter(org=org, status="pending").count() if can_manage(role) else 0,
        "myRequests": [{"org": r.org.name, "at": int(r.created_at.timestamp() * 1000)}
                       for r in JoinRequest.objects.filter(user=request.user, status="pending").select_related("org")],
        "joinSuggestions": suggestions,
        "orgs": [{"id": m.org_id, "name": m.org.name, "role": m.role} for m in memberships(request.user)],
        "hours": [hour_to_dict(t) for t in TimeEntry.objects.filter(org=org)],
        "events": [event_to_dict(e) for e in event_queryset(org)],
        "people": [person_to_dict(p) for p in Person.objects.filter(org=org)],
        "notes": [note_to_dict(n) for n in Note.objects.filter(org=org)],
        # [v4] Your templates from this workspace, plus those from every workspace you OWN,
        # so a consultant's templates follow them into each client workspace.
        "templates": [dict(template_to_dict(t), workspace="" if t.org_id == org.id else t.org.name)
                      for t in OrgTemplate.objects.filter(org__in=owned_org_ids(request.user, org)).select_related("org")],
        "features": {"ai": bool(settings.ANTHROPIC_API_KEY), "uploads": True,
                     "email": "smtp" in settings.EMAIL_BACKEND,
                     "newWorkspace": True,   # [beta] anyone can create an organization
                     "clientWorkspace": access.is_team(request.user),
                     "supportTeam": access.SUPPORT_TEAM},
    })


@require_http_methods(["GET", "PUT", "DELETE"])
@api_login_required
def event_detail(request, org, event_id):
    """Read, save or delete one event."""
    event_id = clean_id(event_id)
    if not event_id:
        return bad("That event id isn't valid.")
    if request.method == "GET":
        event = event_queryset(org).filter(pk=event_id).first()
        return JsonResponse(event_to_dict(event)) if event else bad("Event not found.", 404)
    if request.method == "DELETE":
        Event.objects.filter(pk=event_id, org=org).delete()
        return JsonResponse({"ok": True})
    # PUT: save. Refuse to overwrite an id that belongs to someone else's organization.
    if Event.objects.filter(pk=event_id).exclude(org=org).exists():
        return bad("That event id is already taken.", 409)
    data = read_json(request)
    if data is None:
        return bad("The event data couldn't be read.")
    save_event_dict(org, event_id, data)
    event = event_queryset(org).get(pk=event_id)
    return JsonResponse(event_to_dict(event))


@require_http_methods(["PUT", "DELETE"])
@api_login_required
def person_detail(request, org, person_id):
    """Save or delete one contact in the directory."""
    person_id = clean_id(person_id)
    if not person_id:
        return bad("That contact id isn't valid.")
    if request.method == "DELETE":
        Person.objects.filter(pk=person_id, org=org).delete()
        return JsonResponse({"ok": True})
    if Person.objects.filter(pk=person_id).exclude(org=org).exists():
        return bad("That contact id is already taken.", 409)
    data = read_json(request)
    if data is None:
        return bad("The contact couldn't be read.")
    return JsonResponse(person_to_dict(save_person_dict(org, person_id, data)))


@require_http_methods(["PUT", "DELETE"])
@api_login_required
def note_detail(request, org, note_id):
    """Save or delete one testing note."""
    note_id = clean_id(note_id)
    if not note_id:
        return bad("That note id isn't valid.")
    if request.method == "DELETE":
        Note.objects.filter(pk=note_id, org=org).delete()
        return JsonResponse({"ok": True})
    if Note.objects.filter(pk=note_id).exclude(org=org).exists():
        return bad("That note id is already taken.", 409)
    data = read_json(request)
    if data is None or not str(data.get("text", "")).strip():
        return bad("A note needs some text.")
    return JsonResponse(note_to_dict(save_note_dict(org, request.user, note_id, data)))


@require_http_methods(["POST"])
@api_login_required
def upload_file(request, org):
    """Receive one uploaded file (the form field is named "file")."""
    f = request.FILES.get("file")
    if not f:
        return bad("No file was received.")
    if f.size > settings.MAX_UPLOAD_BYTES:
        return bad("That file is over 20 MB. Upload a smaller copy.")
    content_type = (f.content_type or "").split(";")[0].strip().lower()
    if content_type not in ALLOWED_UPLOADS:
        return bad("That file type can't be stored. Try a PDF or an image.")
    record = EventFile(org=org, name=f.name[:255], content_type=content_type, size=f.size, uploaded_by=request.user)
    record.file.save(f.name, f, save=False)
    record.save()
    return JsonResponse(file_to_dict(record))


@require_http_methods(["GET"])
@api_login_required
def share_links(request, org, event_id):
    """
    The private links for one event: one share page per audience, plus calendar feeds.
    Links are created the first time someone asks for them, then stay the same.
    """
    event = Event.objects.filter(pk=clean_id(event_id), org=org).first()
    if not event:
        return bad("Event not found.", 404)
    out = {}
    # [beta] One link per group of THIS event (plus Internal and the Deadlines calendar)
    for audience in [g["id"] for g in (event.groups or [])] + ["Internal", "Deadlines"] if event.groups else SHARE_AUDIENCES:
        link, _ = ShareLink.objects.get_or_create(event=event, audience=audience)
        page = request.build_absolute_uri(f"/s/{link.token}/")
        cal = request.build_absolute_uri(f"/s/{link.token}/calendar.ics")
        out[audience] = {"page": page, "calendar": cal, "webcal": cal.replace("https://", "webcal://").replace("http://", "webcal://")}
    return JsonResponse(out)


# ---------------------------------------------------------------------------
# [v3] Your templates
# ---------------------------------------------------------------------------

@require_http_methods(["PUT", "DELETE"])
@api_login_required
def template_detail(request, org, template_id):
    template_id = clean_id(template_id)
    if not template_id:
        return bad("That template id isn't valid.")
    # [v4] A template can live in any workspace you own; it stays in the workspace it was saved in.
    existing = OrgTemplate.objects.filter(pk=template_id).first()
    if existing and existing.org_id not in owned_org_ids(request.user, org):
        return bad("That template id is already taken.", 409)
    home = existing.org if existing else org
    if request.method == "DELETE":
        OrgTemplate.objects.filter(pk=template_id, org=home).delete()
        return JsonResponse({"ok": True})
    data = read_json(request)
    if data is None:
        return bad("The template couldn't be read.")
    try:
        return JsonResponse(template_to_dict(save_template_dict(home, template_id, data)))
    except ValueError as e:
        return bad(str(e), 413)


# ---------------------------------------------------------------------------
# [v3] Approvals. The server owns these; the event save ignores them.
# ---------------------------------------------------------------------------

def _approval(org, approval_id):
    return Approval.objects.select_related("event").filter(pk=clean_id(approval_id), event__org=org).first()


@require_http_methods(["POST"])
@api_login_required
def approval_create(request, org, event_id):
    event = Event.objects.filter(pk=clean_id(event_id), org=org).first()
    if not event:
        return bad("Save the event first, then request the approval.", 404)
    data = read_json(request) or {}
    label, approver, email = text(data.get("label"), 300).strip(), text(data.get("approver"), 200).strip(), text(data.get("approverEmail"), 254).strip()
    if not label or not approver:
        return bad("Say what needs approval and who should approve it.")
    if email and "@" not in email:
        return bad("That email address doesn't look right.")
    approval = Approval.objects.create(
        id=clean_id(data.get("id")) if clean_id(data.get("id")) and not Approval.objects.filter(pk=clean_id(data.get("id"))).exists() else short_id(),
        event=event, target_type=data.get("targetType") if data.get("targetType") in ("event", "budget", "compliance") else "event",
        target_id=clean_id(data.get("targetId")) or "", label=label, approver=approver, approver_email=email,
        note=text(data.get("note"), 2000), requested_by=request.user,
        requested_by_name=request.user.get_full_name() or request.user.username,
    )
    if email:
        try:
            send_approval_request(approval, site_url(request))
        except Exception:
            log.exception("Approval email failed")
            return JsonResponse(dict(approval_to_dict(approval), emailError="Saved, but the email didn't send. Use Resend."), status=201)
    return JsonResponse(approval_to_dict(approval), status=201)


@require_http_methods(["POST"])
@api_login_required
def approval_decide(request, org, approval_id):
    """Record an answer someone gave in person or by phone."""
    approval = _approval(org, approval_id)
    if not approval:
        return bad("Approval not found.", 404)
    data = read_json(request) or {}
    if data.get("decision") not in ("approved", "declined"):
        return bad("Pick Approved or Declined.")
    approval.status = data["decision"]
    approval.comment = text(data.get("comment"), 2000)
    approval.decided_by = text(data.get("by"), 200) or approval.approver
    approval.decided_at = timezone.now()
    approval.save()
    try:
        send_approval_decision(approval, site_url(request))
    except Exception:
        log.exception("Decision email failed")
    return JsonResponse(approval_to_dict(approval))


@require_http_methods(["POST"])
@api_login_required
def approval_resend(request, org, approval_id):
    approval = _approval(org, approval_id)
    if not approval or not approval.approver_email:
        return bad("There's no email address to send to.", 404)
    try:
        send_approval_request(approval, site_url(request))
    except Exception:
        log.exception("Approval email failed")
        return bad("The email didn't send. Check the email settings.", 502)
    return JsonResponse({"ok": True})


@require_http_methods(["DELETE"])
@api_login_required
def approval_delete(request, org, approval_id):
    Approval.objects.filter(pk=clean_id(approval_id), event__org=org).delete()
    return JsonResponse({"ok": True})


# ---------------------------------------------------------------------------
# [v3] Each person's private "My tasks" link, and the cross-event AI summary
# ---------------------------------------------------------------------------

@require_http_methods(["GET"])
@api_login_required
def person_link(request, org, event_id, contact_id):
    event = Event.objects.filter(pk=clean_id(event_id), org=org).first()
    contact = EventContact.objects.filter(pk=clean_id(contact_id), event=event).first() if event else None
    if not contact:
        return bad("Save the event first, then try again.", 404)
    link, _ = TaskLink.objects.get_or_create(event=event, contact_ref=contact.id)
    return JsonResponse({"page": request.build_absolute_uri(f"/t/{link.token}/")})


@require_http_methods(["POST"])
@api_login_required
def portfolio_ai(request, org):
    if not settings.ANTHROPIC_API_KEY:
        return bad("AI summaries are turned off. Add ANTHROPIC_API_KEY to the settings to turn them on.", 503)
    try:
        return JsonResponse({"text": ai.draft_portfolio(org)})
    except Exception:
        log.exception("Portfolio AI summary failed")
        return bad("The draft didn't finish. Try again in a minute.", 502)


# ---------------------------------------------------------------------------
# [v4] Client workspaces and the Hours page
# ---------------------------------------------------------------------------

@require_http_methods(["POST"])
@api_login_required
def org_switch(request, org):
    """Switch to another workspace this person belongs to."""
    wanted = (read_json(request) or {}).get("id")
    m = Membership.objects.filter(user=request.user, org_id=wanted).select_related("org").first() if str(wanted).isdigit() else None
    if not m:
        return bad("You don't have access to that workspace.", 403)
    request.session["org_id"] = m.org_id
    return JsonResponse({"id": m.org_id, "name": m.org.name})


@require_http_methods(["PUT"])
@api_login_required
def org_settings(request, org):
    """
    Settings for the workspace that's open. Only the parts that were sent are changed:
      retainerHours, hourlyRate   owners and Blackmagic support
      name                        owners and Blackmagic support
      supportAccess               the workspace's own owner only (it's their permission to give)
    """
    role = get_membership(request.user, request.session).role
    if not can_manage(role):
        return bad("Only the workspace owner can change these settings.", 403)
    data = read_json(request) or {}
    if "retainerHours" in data:
        org.retainer_hours = num(data.get("retainerHours"))
    if "hourlyRate" in data:
        org.hourly_rate = num(data.get("hourlyRate"))
    if "name" in data:
        name = text(data.get("name"), 200).strip()
        if not name:
            return bad("The workspace needs a name.")
        org.name = name
    if "supportAccess" in data:
        if role != "owner":
            return bad("Only the workspace owner can switch this on or off.", 403)
        org.support_access = bool(data.get("supportAccess"))
        if org.support_access and org.plan == "subscription":
            org.plan = "retainer"
    org.save()
    if "supportAccess" in data:
        access.apply_support(org)
    return JsonResponse({"retainerHours": num_out(org.retainer_hours), "hourlyRate": num_out(org.hourly_rate),
                         "name": org.name, "plan": org.plan, "supportAccess": org.support_access})


@require_http_methods(["PUT"])
@api_login_required
def account(request, org):
    """Change your own name and email. The email is what you log in with."""
    from django.contrib.auth import get_user_model
    from django.core.exceptions import ValidationError
    from django.core.validators import validate_email
    from django.db.models import Q

    data = read_json(request) or {}
    user = request.user
    if "name" in data:
        name = text(data.get("name"), 180).strip()
        if not name:
            return bad("Type your name.")
        user.first_name, _, user.last_name = name.partition(" ")
        user.first_name, user.last_name = user.first_name[:150], user.last_name.strip()[:150]
    if "email" in data:
        email = text(data.get("email"), 254).strip().lower()
        try:
            validate_email(email)
        except ValidationError:
            return bad("That email address doesn't look right.")
        taken = get_user_model().objects.exclude(pk=user.pk).filter(Q(email__iexact=email) | Q(username__iexact=email))
        if taken.exists():
            return bad("Another account already uses that email.", 409)
        if user.username.lower() == (user.email or "").lower() and len(email) <= 150:
            user.username = email   # accounts made by sign-up use the email as the username
        user.email = email
    user.save()
    return JsonResponse({"name": user.get_full_name() or user.username, "email": user.email})


@require_http_methods(["PUT", "DELETE"])
@api_login_required
def hour_detail(request, org, entry_id):
    entry_id = clean_id(entry_id)
    if not entry_id:
        return bad("That entry id isn't valid.")
    if request.method == "DELETE":
        TimeEntry.objects.filter(pk=entry_id, org=org).delete()
        return JsonResponse({"ok": True})
    if TimeEntry.objects.filter(pk=entry_id).exclude(org=org).exists():
        return bad("That entry id is already taken.", 409)
    data = read_json(request)
    if data is None:
        return bad("The entry couldn't be read.")
    return JsonResponse(hour_to_dict(save_hour_dict(org, entry_id, data, request.user)))


# ---------------------------------------------------------------------------
# [beta] Email a group (or chosen people) their itinerary
# ---------------------------------------------------------------------------

@require_http_methods(["POST"])
@api_login_required
def send_itinerary(request, org, event_id):
    """
    {"group": "<group id>", "only": "unsent" | "all", "note": "...", "contactIds": [...]}
    Emails each person in the group who has an email address a link to the group's itinerary.
    With contactIds, only those people (the "Send page" button for one person).
    """
    event = Event.objects.filter(pk=clean_id(event_id), org=org).first()
    if not event:
        return bad("Save the event first, then try again.", 404)
    data = read_json(request) or {}
    group = data.get("group")
    if group not in {g["id"] for g in (event.groups or [])} | {"Performers", "Vendors", "Venue", "Security"}:
        return bad("Pick a group to send to.")
    if "smtp" not in settings.EMAIL_BACKEND and not settings.DEBUG and "locmem" not in settings.EMAIL_BACKEND:
        return bad("Email isn't set up on this site yet. Copy the link instead.", 503)
    ids = {clean_id(x) for x in (data.get("contactIds") or []) if clean_id(x)}
    people = [c for c in event.contacts.all() if group in (c.audiences or [])]
    if ids:
        people = [c for c in event.contacts.all() if c.id in ids]
    elif data.get("only") == "unsent":
        people = [c for c in people if not c.sent_at]
    link, _ = ShareLink.objects.get_or_create(event=event, audience=group)
    url = f"{site_url(request)}/s/{link.token}/"
    note = text(data.get("note"), 2000).strip()
    sender = request.user.get_full_name() or request.user.username
    sent, skipped, failed = [], 0, 0
    for c in people[:500]:
        if not c.email or "@" not in c.email:
            skipped += 1
            continue
        try:
            email_itinerary(c, event, group_name(event, group), url, note, sender, request.user.email)
            sent.append(c.id)
        except Exception:
            log.exception("Itinerary email failed")
            failed += 1
    now = timezone.now()
    EventContact.objects.filter(pk__in=sent).update(sent_at=now)
    return JsonResponse({"sent": len(sent), "skipped": skipped, "failed": failed, "sentIds": sent, "at": int(now.timestamp() * 1000)})
