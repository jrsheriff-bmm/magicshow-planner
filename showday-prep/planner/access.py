"""
planner/access.py — who is allowed to see what.

Every logged-in user belongs to one or more organizations (through a Membership).
[v4] A consultant can belong to several: their own, plus one "workspace" per client.
The workspace they're working in is remembered in their login session ("org_id");
switching workspaces changes that. All the other code asks this file "which
organization is this person working in?" and only ever shows that organization's
events, contacts, files, notes and hours.
"""
from django.contrib.auth import get_user_model
from django.http import JsonResponse

from .models import MANAGER_ROLES, Membership, Organization

# The name clients see on the "let them help me" switch.
SUPPORT_TEAM = "Blackmagic Media"


def memberships(user):
    return Membership.objects.filter(user=user).select_related("org").order_by("id")


def get_membership(user, session=None):
    """The membership for the workspace this person is working in (or their first one)."""
    if not user.is_authenticated:
        return None
    ms = memberships(user)
    wanted = session.get("org_id") if session is not None else None
    if wanted:
        m = ms.filter(org_id=wanted).first()
        if m:
            return m
    return ms.first()


def get_org(user, session=None):
    """Return the organization this person is working in, or None if they haven't been added to one."""
    m = get_membership(user, session)
    return m.org if m else None


# ---------------------------------------------------------------------------
# [final] The Blackmagic team and "support access"
#
# A retainer client has their own account, like any subscriber. When their workspace
# has "support access" switched on, every Blackmagic team login can open it too and
# help build the events. The team = every active login with Staff status ticked in
# /admin/ → Users. Team members get a membership with the role "support", which is
# added and removed by the switch (never by hand).
# ---------------------------------------------------------------------------

def is_team(user):
    """Is this login part of the Blackmagic team?"""
    return bool(user.is_authenticated and user.is_active and user.is_staff)


def can_manage(role):
    """Owners and Blackmagic support can change a workspace's settings; plain members can't."""
    return role in MANAGER_ROLES


def can_create_workspace(user):
    """Client workspaces are for the Blackmagic team (and owners of Blackmagic's own workspaces)."""
    return is_team(user) or Membership.objects.filter(user=user, role="owner", org__plan="internal").exists()


def apply_support(org):
    """Make the "support" memberships of one workspace match its support_access switch."""
    if not org.support_access:
        Membership.objects.filter(org=org, role="support").delete()
        return
    have = set(Membership.objects.filter(org=org).values_list("user_id", flat=True))
    team = get_user_model().objects.filter(is_staff=True, is_active=True).exclude(pk__in=have)
    Membership.objects.bulk_create([Membership(user=u, org=org, role="support") for u in team])


def sync_support(user):
    """
    Bring one login's "support" memberships up to date. Called when the app opens, so a
    team member added later still sees every workspace that has support access on, and
    someone who is no longer on the team loses them.
    """
    mine = Membership.objects.filter(user=user, role="support")
    if not is_team(user):
        if mine.exists():
            mine.delete()
        return
    mine.filter(org__support_access=False).delete()
    have = set(Membership.objects.filter(user=user).values_list("org_id", flat=True))
    new = Organization.objects.filter(support_access=True).exclude(pk__in=have)
    Membership.objects.bulk_create([Membership(user=user, org=o, role="support") for o in new])


def api_login_required(view):
    """
    Wrap an API function so it only runs for logged-in users who belong to an organization.
    The wrapped function receives the organization as an extra argument named org.
    """
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Please log in again."}, status=401)
        org = get_org(request.user, request.session)
        if org is None:
            return JsonResponse({"error": "Your login isn't connected to an organization yet. Ask an admin to add you."}, status=403)
        return view(request, org, *args, **kwargs)
    wrapper.__name__ = view.__name__
    wrapper.__doc__ = view.__doc__
    return wrapper
