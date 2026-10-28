"""
python manage.py prune_usage --days 180

[beta] Deletes usage-log rows (the Testing report's raw data) older than the given number
of days. Feedback notes are kept. Safe to run any time, for example monthly from cron.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from planner.models import UsageEvent


class Command(BaseCommand):
    help = "Delete old usage-log rows used by the Testing report."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=180, help="Keep this many days (default 180)")

    def handle(self, *args, **opts):
        cut = timezone.now() - timedelta(days=max(1, opts["days"]))
        n, _ = UsageEvent.objects.filter(created_at__lt=cut).delete()
        self.stdout.write(self.style.SUCCESS(f"Deleted {n} usage rows older than {opts['days']} days."))
