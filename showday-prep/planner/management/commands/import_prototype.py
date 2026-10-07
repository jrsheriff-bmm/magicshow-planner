"""
python manage.py import_prototype data/prototype-export.json --org "Blackmagic Media"

Loads the events, contacts and notes you made in the Claude prototype into the real
database. Safe to run more than once: records with the same id are updated, not doubled.
"""
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from planner.models import Organization
from planner.serializers import save_event_dict, save_note_dict, save_person_dict


class Command(BaseCommand):
    help = "Import events, contacts and notes exported from the prototype."

    def add_arguments(self, parser):
        parser.add_argument("path", help="The JSON export file")
        parser.add_argument("--org", required=True, help="Organization name to import into")

    def handle(self, *args, **opts):
        path = Path(opts["path"])
        if not path.exists():
            raise CommandError(f"Can't find {path}")
        org = Organization.objects.filter(name=opts["org"]).first()
        if not org:
            raise CommandError(f'No organization named "{opts["org"]}". Run setup_org first.')
        data = json.loads(path.read_text(encoding="utf-8"))

        people = data.get("people", [])
        for p in people:
            save_person_dict(org, p["id"], p)
        events = data.get("events", [])
        for e in events:
            # Uploaded files and floor plans don't come across from the prototype; re-upload them.
            for c in e.get("compliance", []):
                c["files"] = []
            if isinstance(e.get("layout"), dict):
                e["layout"]["image"] = ""
            save_event_dict(org, e["id"], e)
        notes = data.get("notes", [])
        for n in notes:
            save_note_dict(org, None, n["id"], n)

        self.stdout.write(self.style.SUCCESS(
            f"Imported {len(events)} events, {len(people)} contacts and {len(notes)} notes into {org.name}."))
