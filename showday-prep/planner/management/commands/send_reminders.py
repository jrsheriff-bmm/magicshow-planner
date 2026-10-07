"""
python manage.py send_reminders            [v3 — replaces the v2 version]

Sends today's reminder emails. Run it ONCE A DAY (a cron job; see docs/06-update-to-v3.md).
The rules for who gets what are in planner/reminders.py, and they match the preview
on the "Calendar & reminders" tab.

  --dry-run          print the emails instead of sending them
  --date 2026-11-07  pretend today is that date (handy with --dry-run to preview a day)

Each person gets at most one email a day. The ReminderLog table remembers who was
emailed, so running it twice on the same day doesn't send anything twice.

Links in the emails ("Mark done", "Approve") need the site's address. Set SITE_URL
in the server's environment variables, e.g. SITE_URL=https://prep.blackmagicmedia.com
"""
import os
from datetime import date, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError

from planner.emails import reminder_message, send_reminder, site_url
from planner.models import Event, Organization, ReminderLog
from planner.reminders import plan_for_org


class Command(BaseCommand):
    help = "Send today's reminder emails (deadlines, paperwork, payments, approvals, show day, Monday summary)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Print instead of sending")
        parser.add_argument("--date", help="Use this date instead of today (YYYY-MM-DD)")

    def handle(self, *args, **opts):
        try:
            day = date.fromisoformat(opts["date"]) if opts.get("date") else date.today()
        except ValueError:
            raise CommandError("Use --date like 2026-11-07")
        dry = opts["dry_run"]
        if not dry and not os.environ.get("SITE_URL"):
            raise CommandError("Set SITE_URL (for example https://prep.blackmagicmedia.com) so the links in emails work.")
        base = site_url()
        total = 0
        for org in Organization.objects.all():
            # [v4] Include shows up to 90 days past: work after the show (editing, delivery) still gets reminders.
            events = (Event.objects.filter(org=org, date__gte=day - timedelta(days=90))
                      .prefetch_related("milestones", "compliance_items", "contacts", "budget_lines", "approvals"))
            for person in plan_for_org(events, day, base):
                if dry:
                    subject, body, _ = reminder_message(person)
                    self.stdout.write(f"To: {person['email']}\nSubject: {subject}\n\n{body}\n{'-' * 60}")
                    total += 1
                    continue
                if ReminderLog.objects.filter(org=org, email=person["email"].lower(), day=day).exists():
                    continue
                try:
                    log = ReminderLog.objects.create(org=org, email=person["email"].lower(), day=day, items=person["count"])
                except IntegrityError:
                    continue  # another copy of this job got there first
                try:
                    send_reminder(person)
                    total += 1
                except Exception as e:  # one bad address shouldn't stop everyone else's reminders
                    log.delete()
                    self.stderr.write(f"Couldn't email {person['email']}: {e}")
        self.stdout.write(self.style.SUCCESS(f"{'Would send' if dry else 'Sent'} {total} reminder email{'s' if total != 1 else ''} for {day}."))
