"""
planner/emails.py — [v3] building and sending the emails.

  send_reminder(person, day)       the daily reminder (built by reminders.py)
  send_approval_request(approval)  "Please approve …" with Approve / Decline buttons
  send_approval_decision(approval) tells the person who asked what the answer was
  done_token(...)                  the signed code inside every "Mark done" button
  send_welcome(user, org, base)    [final] "your account is ready" to someone who just signed up
  send_signup_notice(...)          [final] tells the Blackmagic team a new account was created
  send_join_request(req, to, base) [beta] "Dana asked to join Eastside Arts" to its owners
  send_join_decision(req, base)    [beta] tells the person whether they were let in
  send_itinerary(contact, ...)     [beta] one person's group itinerary link, from "Email this group"

Every email has a plain-text version and a simple HTML version
(templates/planner/email.html). Links in emails need the site's full address,
which comes from the SITE_URL setting (for example https://prep.blackmagicmedia.com).
Set it in the server's environment variables; see docs/06-update-to-v3.md.
"""
import os

from django.conf import settings
from django.core import signing
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from .schedule import fmt_date, fmt_long

DONE_SALT = "showday-prep.done"  # the app's old name; kept so "Mark done" links in emails already sent keep working
DONE_MAX_AGE = 60 * 60 * 24 * 120  # "Mark done" buttons work for 120 days


def site_url(request=None):
    """The site's address with no slash at the end, e.g. https://prep.blackmagicmedia.com"""
    env = os.environ.get("SITE_URL", "").strip().rstrip("/")
    if env:
        return env
    if request is not None:
        return request.build_absolute_uri("/").rstrip("/")
    return "http://localhost:8000"


def done_token(kind, event_id, item_id):
    """A tamper-proof code that says "mark this item done". Signed with the site's SECRET_KEY."""
    return signing.dumps({"k": kind, "e": event_id, "i": item_id}, salt=DONE_SALT, compress=True)


def read_done_token(token):
    """Returns {"k", "e", "i"} or None if the code was changed or is too old."""
    try:
        return signing.loads(token, salt=DONE_SALT, max_age=DONE_MAX_AGE)
    except signing.BadSignature:
        return None


def _send(to, subject, text_body, html_body, reply_to=None):
    msg = EmailMultiAlternatives(subject, text_body, settings.DEFAULT_FROM_EMAIL, [to] if isinstance(to, str) else to,
                                 reply_to=[reply_to] if reply_to else None)
    msg.attach_alternative(html_body, "text/html")
    msg.send()


def _html(title, intro, sections, footer):
    return render_to_string("planner/email.html", {"title": title, "intro": intro, "sections": sections, "footer": footer})


# ---------------------------------------------------------------------------
# Daily reminders
# ---------------------------------------------------------------------------

def reminder_message(person):
    """Subject, text and HTML for one person's daily reminder. person comes from reminders.plan_for_org()."""
    first = (person["name"] or "there").split(" ")[0]
    names = ", ".join(s["event"].name for s in person["sections"])
    n = person["count"]
    urgent = any(i["tag"] == "Overdue" for s in person["sections"] for i in s["items"])
    subject = f"{'Overdue: ' if urgent else ''}{n} thing{'s' if n > 1 else ''} for {names}"
    lines = [f"Hi {first},", "", "Here's what needs you:"]
    sections = []
    for s in person["sections"]:
        lines += ["", f"{s['event'].name} · {s['when']}"]
        items = []
        for i in s["items"]:
            due = f" (due {fmt_date(i['due'], True)})" if i.get("due") else ""
            lines.append(f"- [{i['tag']}] {i['kind']}: {i['text']}{due}")
            for x in i.get("list") or []:
                lines.append(f"    · {x['tag']}: {x['text']}")
            if i.get("action"):
                lines.append(f"  {i['action_label']}: {i['action']}")
            items.append(dict(i, due_text=fmt_date(i["due"], True) if i.get("due") else ""))
        if s["tasks_url"]:
            lines.append(f"All your tasks for this event: {s['tasks_url']}")
        sections.append({"heading": f"{s['event'].name} · {s['when']}", "items": items, "tasks_url": s["tasks_url"]})
    footer = "You get these because you're on the plan for this event. To stop them, ask the event lead to turn off your reminders in People."
    lines += ["", footer, "— MagicShow"]
    return subject, "\n".join(lines), _html(subject, f"Hi {first}, here's what needs you.", sections, footer)


def send_reminder(person):
    subject, text_body, html_body = reminder_message(person)
    _send(person["email"], subject, text_body, html_body)


# ---------------------------------------------------------------------------
# Approvals
# ---------------------------------------------------------------------------

def send_approval_request(approval, base):
    event = approval.event
    link = f"{base}/a/{approval.token}/"
    who = approval.requested_by_name or "The event team"
    subject = f"Approval needed: {approval.label}"
    text_body = "\n".join([
        f"Hi {approval.approver.split(' ')[0] if approval.approver else 'there'},", "",
        f"{who} is asking you to approve: {approval.label}",
        f"Event: {event.name} · {fmt_long(event.date)}",
        *( [f"Note: {approval.note}"] if approval.note else [] ), "",
        f"Approve or decline here (no login needed): {link}", "",
        "— MagicShow",
    ])
    sections = [{"heading": approval.label, "items": [
        {"kind": "Event", "tag": "", "text": f"{event.name} · {fmt_long(event.date)}"},
        *( [{"kind": "Note", "tag": "", "text": approval.note}] if approval.note else [] ),
        {"kind": "Asked by", "tag": "", "text": who, "action": link, "action_label": "Approve or decline"},
    ]}]
    _send(approval.approver_email, subject, text_body, _html(subject, f"{who} is asking for your approval.", sections, "Only you received this link. Please don't forward it."))


def send_approval_decision(approval, base):
    """Tell the person who asked (and the event's planning team) what the approver decided."""
    event = approval.event
    to = set()
    if approval.requested_by and approval.requested_by.email:
        to.add(approval.requested_by.email)
    to.update(c.email for c in event.contacts.all() if c.team and c.email and "@" in c.email)
    if not to:
        return
    word = approval.get_status_display().lower()
    subject = f"{approval.get_status_display()}: {approval.label}"
    comment = f" Comment: “{approval.comment}”" if approval.comment else ""
    text_body = f"{approval.decided_by or approval.approver} {word} “{approval.label}” for {event.name}.{comment}\n\nOpen the plan: {base}/\n\n— MagicShow"
    sections = [{"heading": approval.label, "items": [{"kind": approval.get_status_display(), "tag": "", "text": f"by {approval.decided_by or approval.approver}{comment}", "action": f"{base}/", "action_label": "Open the plan"}]}]
    _send(sorted(to), subject, text_body, _html(subject, f"{event.name}", sections, ""))


# ---------------------------------------------------------------------------
# [final] Sign-up
# ---------------------------------------------------------------------------

def send_welcome(user, org, base):
    first = user.first_name or "there"
    subject = "Your MagicShow account is ready"
    lines = [f"Hi {first},", "", f"Your MagicShow account is ready. Your workspace is called “{org.name}”.", "",
             f"Log in any time with this email address: {base}/login/", "",
             "A good first step: press “+ New event”, pick a template and set the show date. "
             "Every deadline is counted back from that date for you."]
    if org.support_access:
        lines += ["", "The Blackmagic Media team can open your workspace to help build your events. "
                      "You can switch that off any time under Account."]
    lines += ["", "— MagicShow"]
    sections = [{"heading": "Getting started", "items": [
        {"kind": "Log in", "tag": "", "text": "Use your email address and the password you chose.", "action": f"{base}/login/", "action_label": "Open MagicShow"},
        {"kind": "First event", "tag": "", "text": "Press “+ New event”, pick a template, set the show date."},
    ]}]
    _send(user.email, subject, "\n".join(lines), _html(subject, f"Hi {first}, your workspace “{org.name}” is ready.", sections, "You got this because an account was created with this email address."))


def send_signup_notice(user, org, base):
    """Tell the Blackmagic team (every Staff login with an email) that someone signed up."""
    from django.contrib.auth import get_user_model
    to = sorted({u.email for u in get_user_model().objects.filter(is_staff=True, is_active=True) if u.email and "@" in u.email})
    if not to:
        return
    plan = org.get_plan_display()
    subject = f"New MagicShow account: {org.name}"
    text_body = "\n".join([f"{user.get_full_name() or user.email} <{user.email}> just created an account.", "",
                           f"Workspace: {org.name}", f"Plan: {plan}",
                           f"Support access: {'on, it is in your workspace list' if org.support_access else 'off'}", "",
                           f"Manage it: {base}/admin/planner/organization/{org.id}/change/", "", "— MagicShow"])
    sections = [{"heading": org.name, "items": [
        {"kind": "Who", "tag": "", "text": f"{user.get_full_name() or user.email} · {user.email}"},
        {"kind": "Plan", "tag": "", "text": plan + (" · support access on" if org.support_access else ""),
         "action": f"{base}/admin/planner/organization/{org.id}/change/", "action_label": "Open in admin"},
    ]}]
    _send(to, subject, text_body, _html(subject, "Someone just created a MagicShow account.", sections, ""))


# ---------------------------------------------------------------------------
# [beta] Organizations and group emails
# ---------------------------------------------------------------------------

def send_join_request(req, to, base):
    if not to:
        return
    who = req.user.get_full_name() or req.user.email or req.user.username
    subject = f"{who} asked to join {req.org.name} on MagicShow"
    lines = [f"{who} ({req.user.email}) asked to join {req.org.name}."]
    if req.message:
        lines += ["", f"Their note: {req.message}"]
    lines += ["", f"Approve or decline on the Team page: {base}/?view=team", "", "— MagicShow"]
    items = [{"kind": "Who", "tag": "", "text": f"{who} · {req.user.email}"}]
    if req.message:
        items.append({"kind": "Note", "tag": "", "text": req.message})
    items.append({"kind": "Decide", "tag": "", "text": "Open the Team page to approve or decline.", "action": f"{base}/?view=team", "action_label": "Open the Team page"})
    _send(sorted(set(to)), subject, "\n".join(lines),
          _html(subject, f"Someone wants to join {req.org.name}.", [{"heading": req.org.name, "items": items}],
                "You got this because you're an owner of this organization."))


def send_join_decision(req, base):
    if not req.user.email:
        return
    ok = req.status == "approved"
    subject = f"You're in: {req.org.name}" if ok else f"Your request to join {req.org.name}"
    body = (f"Your request to join {req.org.name} was approved. Open MagicShow and pick it in the Workspace list: {base}/"
            if ok else f"Your request to join {req.org.name} wasn't approved. If you think that's a mistake, contact the organization directly.")
    _send(req.user.email, subject, body + "\n\n— MagicShow",
          _html(subject, body, [], "You got this because you asked to join an organization on MagicShow."))


def send_itinerary(contact, event, group, link, note, sender, sender_email=""):
    """One person's itinerary for their group. Sent from "Email this group" (or one person) on the Share pages tab."""
    from .schedule import fmt_long
    first = (contact.name or contact.org_name or "there").split(" ")[0]
    subject = f"Your {group} itinerary: {event.name}, {fmt_long(event.date)}"
    lines = [f"Hi {first},", "", f"Here are the details for {event.name} on {fmt_long(event.date)}"
             + (f" at {event.venue}" if event.venue else "") + "."]
    if note:
        lines += ["", note]
    lines += ["", f"Your itinerary (it updates if plans change): {link}"]
    if contact.booth:
        lines += ["", f"On our list as: {contact.booth}"]
    lines += ["", f"Questions? Reply to this email to reach {sender}." if sender_email else f"Sent by {sender}.", "", "— MagicShow"]
    items = [{"kind": "Itinerary", "tag": "", "text": f"Your schedule, who to contact and what to bring.", "action": link, "action_label": "Open your itinerary"}]
    if note:
        items.insert(0, {"kind": "Note", "tag": "", "text": note})
    if contact.booth:
        items.append({"kind": "On our list as", "tag": "", "text": contact.booth})
    _send(contact.email, subject, "\n".join(lines),
          _html(subject, f"Hi {first}, here are your details for {event.name}.", [{"heading": f"{event.name} · {fmt_long(event.date)}", "items": items}],
                f"Sent by {sender} with MagicShow. The link is private to your group; please don't forward it."), reply_to=sender_email or None)
