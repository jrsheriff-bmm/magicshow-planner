"""
planner/teams.py — [beta] organizations people create, find and join.

How it works:
  • Anyone can create an organization. Whoever creates it is its owner.
  • Everyone also has a personal workspace for their own events. The switcher in
    the left menu moves between the two (and any client workspaces).
  • To join an existing organization, search for it and press "Ask to join".
    Its owners get an email and approve or decline on the Team page.
  • Owners can also share an invite link (/join/<code>/). Whoever opens it, and
    logs in or signs up, joins right away.
  • Owners manage members on the Team page: make someone an owner, remove them.
    An organization always keeps at least one owner.

Addresses (all JSON except /join/):
  POST   /api/orgs/                        create an organization (you become its owner)
  GET    /api/orgs/search/?q=              find organizations that allow join requests
  POST   /api/orgs/<id>/join/              ask to join one
  GET    /api/org/team/                    members, waiting requests and invite links of the open workspace
  PUT    /api/org/team/                    city, and whether people can find it
  POST   /api/org/requests/<id>/           approve or decline a request
  PUT    /api/org/members/<user id>/       make someone an owner or a member
  DELETE /api/org/members/<user id>/       remove someone (or leave yourself)
  POST   /api/org/invites/                 make an invite link
  DELETE /api/org/invites/<code>/          switch an invite link off
  GET/POST /join/<code>/                   the page an invite link opens
"""
import logging
from datetime import timedelta

from django.db.models import Count, Q
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from . import access
from .access import api_login_required, can_manage, get_membership
from .emails import send_join_decision, send_join_request, site_url
from .models import JoinRequest, Membership, OrgInvite, Organization
from .serializers import text

log = logging.getLogger(__name__)
INVITE_DAYS = 14


def _json(request):
    import json
    try:
        data = json.loads(request.body or b"{}")
        return data if isinstance(data, dict) else {}
    except (ValueError, UnicodeDecodeError):
        return {}


def bad(message, status=400):
    return JsonResponse({"error": message}, status=status)


def owners_of(org):
    return [m.user for m in Membership.objects.filter(org=org, role="owner").select_related("user")]


def create_org(user, name, city="", client=False):
    """Make an organization with this person as its owner. client=True: a Blackmagic retainer client workspace."""
    org = Organization.objects.create(name=name[:200], city=city[:100], plan="retainer" if client else "subscription",
                                      discoverable=not client)
    Membership.objects.create(user=user, org=org, role="owner")
    return org


@require_http_methods(["POST"])
@api_login_required
def org_create(request, org):
    data = _json(request)
    name, city = text(data.get("name"), 200).strip(), text(data.get("city"), 100).strip()
    client = bool(data.get("client")) and access.is_team(request.user)
    if not name:
        return bad("Type the organization's name.")
    if Organization.objects.filter(name__iexact=name, memberships__user=request.user).exists():
        return bad("You already belong to an organization with that name.", 409)
    new = create_org(request.user, name, city, client)
    request.session["org_id"] = new.id
    return JsonResponse({"id": new.id, "name": new.name}, status=201)


@require_http_methods(["GET"])
@api_login_required
def org_search(request, org):
    q = text(request.GET.get("q"), 100).strip()
    if len(q) < 2:
        return JsonResponse({"results": []})
    mine = set(Membership.objects.filter(user=request.user).values_list("org_id", flat=True))
    pending = set(JoinRequest.objects.filter(user=request.user, status="pending").values_list("org_id", flat=True))
    found = (Organization.objects.filter(discoverable=True, personal=False)
             .filter(Q(name__icontains=q) | Q(city__icontains=q))
             .annotate(n=Count("memberships")).order_by("name")[:10])
    return JsonResponse({"results": [
        {"id": o.id, "name": o.name, "city": o.city, "members": o.n,
         "status": "member" if o.id in mine else "pending" if o.id in pending else ""} for o in found]})


@require_http_methods(["POST"])
@api_login_required
def org_join(request, org, org_id):
    target = Organization.objects.filter(pk=org_id, discoverable=True, personal=False).first()
    if not target:
        return bad("That organization isn't taking requests.", 404)
    if Membership.objects.filter(user=request.user, org=target).exists():
        return bad("You're already in this organization.", 409)
    req, created = JoinRequest.objects.get_or_create(org=target, user=request.user, status="pending",
                                                     defaults={"message": text(_json(request).get("message"), 500)})
    if created:
        try:
            send_join_request(req, [u.email for u in owners_of(target) if u.email], site_url(request))
        except Exception:
            log.exception("Join request email failed")
    return JsonResponse({"ok": True, "status": "pending"}, status=201 if created else 200)


def _member_dict(m, me):
    u = m.user
    return {"id": u.id, "name": u.get_full_name() or u.username, "email": u.email, "role": m.role, "you": u.id == me.id}


@require_http_methods(["GET", "PUT"])
@api_login_required
def team(request, org):
    role = get_membership(request.user, request.session).role
    manage = can_manage(role)
    if request.method == "PUT":
        if not manage:
            return bad("Only owners can change this.", 403)
        data = _json(request)
        if "discoverable" in data:
            org.discoverable = bool(data["discoverable"]) and not org.personal
        if "city" in data:
            org.city = text(data.get("city"), 100).strip()
        org.save(update_fields=["discoverable", "city"])
    members = Membership.objects.filter(org=org).select_related("user").order_by("role", "user__first_name")
    out = {"name": org.name, "city": org.city, "discoverable": org.discoverable, "personal": org.personal,
           "canManage": manage, "members": [_member_dict(m, request.user) for m in members]}
    if manage:
        out["requests"] = [{"id": r.id, "name": r.user.get_full_name() or r.user.username, "email": r.user.email,
                            "message": r.message, "at": int(r.created_at.timestamp() * 1000)}
                           for r in JoinRequest.objects.filter(org=org, status="pending").select_related("user")]
        out["invites"] = [{"code": i.token, "url": f"{site_url(request)}/join/{i.token}/", "role": i.role, "uses": i.uses,
                           "expires": int(i.expires_at.timestamp() * 1000)}
                          for i in OrgInvite.objects.filter(org=org, revoked=False, expires_at__gt=timezone.now())]
    return JsonResponse(out)


@require_http_methods(["POST"])
@api_login_required
def request_decide(request, org, request_id):
    if not can_manage(get_membership(request.user, request.session).role):
        return bad("Only owners can approve requests.", 403)
    req = JoinRequest.objects.filter(pk=request_id, org=org, status="pending").select_related("user").first()
    if not req:
        return bad("That request was already answered.", 404)
    decision = _json(request).get("decision")
    if decision not in ("approved", "declined"):
        return bad("Pick approve or decline.")
    req.status, req.decided_at, req.decided_by = decision, timezone.now(), request.user
    req.save()
    if decision == "approved":
        Membership.objects.get_or_create(user=req.user, org=org, defaults={"role": "member"})
    try:
        send_join_decision(req, site_url(request))
    except Exception:
        log.exception("Join decision email failed")
    return JsonResponse({"ok": True})


@require_http_methods(["PUT", "DELETE"])
@api_login_required
def member(request, org, user_id):
    me = get_membership(request.user, request.session)
    m = Membership.objects.filter(org=org, user_id=user_id).select_related("user").first()
    if not m:
        return bad("That person isn't in this workspace.", 404)
    leaving = m.user_id == request.user.id and request.method == "DELETE"
    if not leaving and not can_manage(me.role):
        return bad("Only owners can change members.", 403)
    if m.role == "support":
        return bad("Blackmagic support access is switched on and off under Account.", 400)
    owners = Membership.objects.filter(org=org, role="owner").count()
    if request.method == "DELETE":
        if m.role == "owner" and owners <= 1:
            return bad("An organization needs at least one owner. Make someone else an owner first.", 400)
        m.delete()
        if leaving:
            request.session.pop("org_id", None)
        return JsonResponse({"ok": True})
    role = _json(request).get("role")
    if role not in ("owner", "member"):
        return bad("Pick owner or member.")
    if m.role == "owner" and role == "member" and owners <= 1:
        return bad("An organization needs at least one owner.", 400)
    m.role = role
    m.save(update_fields=["role"])
    return JsonResponse(_member_dict(m, request.user))


@require_http_methods(["POST"])
@api_login_required
def invite_create(request, org):
    if not can_manage(get_membership(request.user, request.session).role):
        return bad("Only owners can make invite links.", 403)
    if org.personal:
        return bad("Personal workspaces can't have members. Create an organization first.", 400)
    role = "owner" if _json(request).get("role") == "owner" else "member"
    inv = OrgInvite.objects.create(org=org, role=role, created_by=request.user,
                                   expires_at=timezone.now() + timedelta(days=INVITE_DAYS))
    return JsonResponse({"code": inv.token, "url": f"{site_url(request)}/join/{inv.token}/", "role": inv.role,
                         "uses": 0, "expires": int(inv.expires_at.timestamp() * 1000)}, status=201)


@require_http_methods(["DELETE"])
@api_login_required
def invite_revoke(request, org, code):
    if not can_manage(get_membership(request.user, request.session).role):
        return bad("Only owners can switch invite links off.", 403)
    OrgInvite.objects.filter(org=org, token=code).update(revoked=True)
    return JsonResponse({"ok": True})


@require_http_methods(["GET", "POST"])
def join_page(request, code):
    """The page an invite link opens. Logged out: log in or sign up first, then come back here."""
    inv = OrgInvite.objects.filter(token=code).select_related("org").first()
    ctx = {"invite": inv, "valid": bool(inv and inv.usable()), "code": code}
    if not ctx["valid"]:
        return render(request, "planner/auth/join.html", ctx, status=404)
    if not request.user.is_authenticated:
        return render(request, "planner/auth/join.html", ctx)
    already = Membership.objects.filter(user=request.user, org=inv.org).first()
    if request.method == "POST" or already:
        if not already:
            Membership.objects.create(user=request.user, org=inv.org, role=inv.role)
            inv.uses += 1
            inv.save(update_fields=["uses"])
            JoinRequest.objects.filter(user=request.user, org=inv.org, status="pending").update(status="approved", decided_at=timezone.now())
        request.session["org_id"] = inv.org.id
        return redirect("app")
    return render(request, "planner/auth/join.html", ctx)

