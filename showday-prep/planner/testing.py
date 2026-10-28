"""
planner/testing.py — [beta] the testing program: what testers do, say, and run into.

  POST /api/telemetry/                  the screens send a small batch of usage events every few seconds
  GET  /api/testing/report/?days=7      the Testing report (Blackmagic team only)
  PUT  /api/testing/feedback/<note id>/ mark a tester's note handled (Blackmagic team only)

What gets recorded (planner.models.UsageEvent):
  action  the NAME of a button someone pressed ("newEvent", "budgetXlsx")
  view    the screen or tab they opened ("event/budget")
  flow    a pop-up started, finished or abandoned ("start:new", "done:new", "abandon:new")
  error   an error message from the page, and where it happened
  rating  their 1–5 answer to "How easy was that?" after a big task

Never recorded: anything anyone typed (names, phone numbers, amounts, notes).
Feedback notes are separate: a tester writes them on purpose with the Notes button
and ticks "Send to the MagicShow team".

Old usage events can be cleared with:  python manage.py prune_usage --days 180
"""
import json
from collections import Counter, defaultdict
from datetime import timedelta

from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from . import access
from .access import api_login_required
from .models import Note, UsageEvent
from .serializers import text

KINDS = {k for k, _ in UsageEvent.KINDS}
MAX_BATCH = 60


def bad(message, status=400):
    return JsonResponse({"error": message}, status=status)


@require_http_methods(["POST"])
@api_login_required
def telemetry(request, org):
    try:
        data = json.loads(request.body or b"{}")
    except (ValueError, UnicodeDecodeError):
        return bad("Couldn't read that.")
    rows = data.get("events") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        return bad("Nothing to record.")
    session = text(data.get("session"), 40)
    keep = []
    for r in rows[:MAX_BATCH]:
        if not isinstance(r, dict) or r.get("kind") not in KINDS or not str(r.get("name") or "").strip():
            continue
        keep.append(UsageEvent(user=request.user, org=org, session=session, kind=r["kind"],
                               name=text(r.get("name"), 120), screen=text(r.get("screen"), 120),
                               detail=text(r.get("detail"), 300)))
    UsageEvent.objects.bulk_create(keep)
    return JsonResponse({"ok": True, "saved": len(keep)})


def build_report(days=7, now=None):
    """Everything the Testing report shows, worked out from the usage log and the shared notes."""
    now = now or timezone.now()
    since = now - timedelta(days=days)
    events = list(UsageEvent.objects.filter(created_at__gte=since).select_related("user", "org"))
    actions = Counter(e.name for e in events if e.kind == "action")
    views = Counter(e.name for e in events if e.kind == "view")
    flows = defaultdict(lambda: {"start": 0, "done": 0, "abandon": 0})
    for e in events:
        if e.kind == "flow" and ":" in e.name:
            step, _, name = e.name.partition(":")
            if step in ("start", "done", "abandon"):
                flows[name][step] += 1
    stuck = sorted(({"name": k, **v, "rate": round(v["abandon"] / v["start"] * 100) if v["start"] else 0}
                    for k, v in flows.items() if v["start"]), key=lambda x: (-x["abandon"], -x["rate"]))
    errors = defaultdict(lambda: {"count": 0, "last": None, "screen": "", "detail": "", "people": set()})
    for e in events:
        if e.kind == "error":
            g = errors[e.name]
            g["count"] += 1
            if not g["last"] or e.created_at > g["last"]:
                g["last"], g["screen"], g["detail"] = e.created_at, e.screen, e.detail
            if e.user_id:
                g["people"].add(e.user_id)
    ratings = defaultdict(list)
    for e in events:
        if e.kind == "rating":
            try:
                ratings[e.name].append(int(e.detail))
            except ValueError:
                pass
    people = {e.user_id for e in events if e.user_id}
    orgs = Counter(e.org.name for e in events if e.org_id)
    notes = Note.objects.filter(shared=True, created_at__gte=since).select_related("org", "author")
    return {
        "days": days, "since": int(since.timestamp() * 1000),
        "people": len(people), "sessions": len({e.session for e in events if e.session}),
        "workspaces": [{"name": n, "events": c} for n, c in orgs.most_common(12)],
        "actions": [{"name": n, "count": c} for n, c in actions.most_common()],
        "views": [{"name": n, "count": c} for n, c in views.most_common(20)],
        "stuck": stuck[:12],
        "errors": sorted(({"message": k, "count": v["count"], "people": len(v["people"]), "screen": v["screen"],
                           "detail": v["detail"], "last": int(v["last"].timestamp() * 1000)}
                          for k, v in errors.items()), key=lambda x: -x["count"])[:20],
        "ratings": sorted(({"name": k, "count": len(v), "avg": round(sum(v) / len(v), 1), "low": sum(1 for x in v if x <= 2)}
                           for k, v in ratings.items()), key=lambda x: x["avg"]),
        "feedback": [{"id": n.id, "text": n.text, "where": n.where, "done": n.done, "org": n.org.name,
                      "by": (n.author.get_full_name() or n.author.username) if n.author else "",
                      "at": int(n.created_at.timestamp() * 1000)} for n in notes[:200]],
    }


@require_http_methods(["GET"])
@api_login_required
def report(request, org):
    if not access.is_team(request.user):
        return bad("The Testing report is for the Blackmagic team.", 403)
    try:
        days = max(1, min(90, int(request.GET.get("days", 7))))
    except ValueError:
        days = 7
    return JsonResponse(build_report(days))


@require_http_methods(["PUT"])
@api_login_required
def feedback_done(request, org, note_id):
    if not access.is_team(request.user):
        return bad("Only the Blackmagic team can mark feedback handled.", 403)
    try:
        data = json.loads(request.body or b"{}")
    except (ValueError, UnicodeDecodeError):
        data = {}
    n = Note.objects.filter(pk=note_id, shared=True).update(done=bool(data.get("done")))
    return JsonResponse({"ok": bool(n)})
