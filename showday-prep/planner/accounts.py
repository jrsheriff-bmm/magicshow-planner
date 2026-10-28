"""
planner/accounts.py — [final] creating and looking after your own account.

  /signup/                  create an account with a name, email and password.
                            You get your own private workspace and go straight in.
  /account/password/        change your password while logged in
  /password/reset/          "Forgot your password?" — emails a private link to set a new one

Two optional settings control sign-up (set them where the other settings live:
the .env file, or your host's environment variables):

  ALLOW_SIGNUP=False        closes sign-up completely (accounts are then made in /admin/)
  SIGNUP_CODE=some-word     sign-up stays open, but only for people who know this code.
                            Handy until payments are connected: give the code to paying customers.

With neither set, anyone can create an account.

[beta] Everyone gets a personal workspace for their own events. If they type an
organization's name, we create that organization with them as its owner, unless
organizations with that name already exist: then the app offers to "Ask to join"
instead (see planner/teams.py). An invite link (/join/<code>/) brings people back
here with ?next=, and they join right after signing up.

Retainer clients tick one box when they sign up (or switch it on later under Account):
"Let the Blackmagic Media team into my workspace". See planner/access.py.
"""
import hmac
import logging
import os

from django.contrib.auth import get_user_model, login, password_validation
from django.contrib.auth import views as auth_views
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import Q
from django.shortcuts import redirect, render
from django.utils.http import url_has_allowed_host_and_scheme
from django.urls import reverse_lazy
from django.views.decorators.cache import never_cache
from django.views.decorators.debug import sensitive_post_parameters
from django.views.decorators.http import require_http_methods

from . import access, emails
from .models import Membership, Organization

log = logging.getLogger(__name__)

SIGNUPS_PER_HOUR = 8   # per internet address; slows down junk sign-ups


def signup_open():
    return os.environ.get("ALLOW_SIGNUP", "True").strip().lower() in ("1", "true", "yes", "on")


def signup_code():
    return os.environ.get("SIGNUP_CODE", "").strip()


def _too_many(request):
    """True when this internet address has made too many accounts in the last hour."""
    ip = (request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip() or request.META.get("REMOTE_ADDR", "") or "unknown")
    key = "signup:" + ip
    count = cache.get(key, 0)
    if count >= SIGNUPS_PER_HOUR:
        return True
    cache.set(key, count + 1, 60 * 60)
    return False


@sensitive_post_parameters("password")
@never_cache
@require_http_methods(["GET", "POST"])
def signup(request):
    nxt = request.POST.get("next") or request.GET.get("next") or ""
    if not url_has_allowed_host_and_scheme(nxt, allowed_hosts={request.get_host()}, require_https=request.is_secure()):
        nxt = ""
    if request.user.is_authenticated:
        return redirect(nxt or "app")
    invited = nxt.startswith("/join/")
    ctx = {"open": signup_open() or invited, "needs_code": bool(signup_code()) and not invited, "team": access.SUPPORT_TEAM,
           "v": {}, "errors": {}, "next": nxt, "invited": invited}
    if request.method != "POST" or not ctx["open"]:
        return render(request, "planner/auth/signup.html", ctx)

    post = request.POST
    v = {k: post.get(k, "").strip() for k in ("name", "org", "email", "code")}
    v["retainer"] = post.get("retainer") == "on"
    password = post.get("password", "")
    errors = {}
    if post.get("website"):          # a hidden box real people never see or fill in; robots do
        return redirect("login")

    User = get_user_model()
    email = v["email"].lower()
    if not v["name"]:
        errors["name"] = "Type your name."
    try:
        validate_email(email)
        if len(email) > 150:
            errors["email"] = "Please use a shorter email address."
        elif User.objects.filter(Q(email__iexact=email) | Q(username__iexact=email)).exists():
            errors["email"] = "There's already an account with that email. Log in, or reset your password."
    except ValidationError:
        errors["email"] = "That email address doesn't look right."
    first, _, last = v["name"].partition(" ")
    try:
        password_validation.validate_password(password, User(username=email, email=email, first_name=first, last_name=last))
    except ValidationError as e:
        errors["password"] = " ".join(e.messages)
    if ctx["needs_code"] and not hmac.compare_digest(v["code"].encode(), signup_code().encode()):
        errors["code"] = "That sign-up code isn't right. Check the code you were given."
    if not errors and _too_many(request):
        errors["form"] = "Too many accounts were just created from this connection. Try again in an hour."
    if errors:
        ctx.update(v=v, errors=errors)
        return render(request, "planner/auth/signup.html", ctx, status=400)

    from .teams import create_org
    with transaction.atomic():
        user = User.objects.create_user(username=email, email=email, password=password,
                                        first_name=first[:150], last_name=last.strip()[:150])
        # [beta] Everyone's own space for their own events
        personal = Organization.objects.create(name=f"{first}'s events"[:200], plan="subscription", personal=True, discoverable=False)
        Membership.objects.create(user=user, org=personal, role="owner")
        org, suggest = personal, ""
        if v["org"]:
            exists = Organization.objects.filter(name__iexact=v["org"], discoverable=True, personal=False).exists()
            if exists and not invited:
                suggest = v["org"]          # the app offers "Ask to join" for the matching organizations
            elif not invited:
                org = create_org(user, v["org"])
        if v["retainer"]:
            org.plan, org.support_access = "retainer", True
            org.save(update_fields=["plan", "support_access"])
            access.apply_support(org)
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    request.session["org_id"] = org.id
    if suggest:
        request.session["suggest_join"] = suggest
    try:   # the account exists either way; emails are a courtesy
        emails.send_welcome(user, org, emails.site_url(request))
        emails.send_signup_notice(user, org, emails.site_url(request))
    except Exception:
        log.exception("Sign-up emails failed")
    return redirect(nxt or "app")


class PasswordChange(auth_views.PasswordChangeView):
    """Change your password while logged in, then go back to the app."""
    template_name = "planner/auth/password_change.html"
    success_url = reverse_lazy("app")


class PasswordReset(auth_views.PasswordResetView):
    """Ask for a reset link by email. Always says "check your email", whether or not the address has an account."""
    template_name = "planner/auth/reset_form.html"
    email_template_name = "planner/auth/reset_email.txt"
    subject_template_name = "planner/auth/reset_subject.txt"
    success_url = reverse_lazy("password_reset_done")
