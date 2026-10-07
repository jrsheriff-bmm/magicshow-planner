"""
python manage.py setup_org "Blackmagic Media" --user hananiah

Creates the organization (if it doesn't exist yet) and connects a user login to it.
Run it once after "createsuperuser", and again for each new team member's login.
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from planner.models import Membership, Organization


class Command(BaseCommand):
    help = "Create an organization and connect a user login to it."

    def add_arguments(self, parser):
        parser.add_argument("name", help='Organization name, e.g. "Blackmagic Media"')
        parser.add_argument("--user", required=True, help="The username to connect")
        parser.add_argument("--role", default="owner", choices=["owner", "member"])
        parser.add_argument("--venue", action="store_true", help="Mark this organization as a venue")

    def handle(self, *args, **opts):
        User = get_user_model()
        try:
            user = User.objects.get(username=opts["user"])
        except User.DoesNotExist:
            raise CommandError(f'No user named "{opts["user"]}". Create it first with: python manage.py createsuperuser')
        org, created = Organization.objects.get_or_create(
            name=opts["name"], defaults={"kind": "venue" if opts["venue"] else "organizer"})
        Membership.objects.update_or_create(user=user, org=org, defaults={"role": opts["role"]})
        verb = "Created" if created else "Found"
        self.stdout.write(self.style.SUCCESS(f'{verb} "{org.name}" and connected {user.username} as {opts["role"]}.'))
