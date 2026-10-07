"""
planner/tests.py — automatic checks that the important parts still work.

Run them any time with:   python manage.py test
Every line that starts with "self.assert" is one check. If one fails, Django
tells you which test and which line, so you know what broke before going live.
"""
import json
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from .models import Event, EventFile, Membership, Milestone, Organization, ShareLink


def sample_event(event_id="ev1", show=None):
    """A small but complete event in the same shape the screens send."""
    show = show or (date.today() + timedelta(days=30))
    return {
        "id": event_id, "name": "Test Show", "series": "Mystic Music", "date": show.isoformat(),
        "venue": "Barn House", "doors": "19:00", "end": "23:00", "priceAdv": 15, "priceDoor": 20,
        "capacity": 300, "target": 100, "about": "A test.",
        "milestones": [
            {"id": "m1", "title": "Venue application", "offset": -69, "phase": "Venue & permits", "status": "todo", "hard": True,
             "checklist": [{"id": "c1", "text": "Call JR", "done": False}]},
            {"id": "m2", "title": "Promo launch", "offset": -10, "status": "doing"},
        ],
        "setup": [{"id": "s1", "title": "Load-in", "start": "15:00", "end": "16:30", "track": "Production", "audiences": ["Internal", "Venue"]}],
        "program": {"start": "19:00", "items": [
            {"id": "p1", "title": "Doors", "dur": 60, "audiences": ["Internal", "Vendors"]},
            {"id": "p2", "title": "Headliner", "who": "Two Dollar Bills", "dur": 45, "audiences": ["Internal", "Performers"]},
        ]},
        "contacts": [
            {"id": "k1", "role": "Event lead", "name": "Hananiah Hardin", "org": "BMM", "phone": "269-000-0000",
             "audiences": ["Internal", "Performers", "Vendors"], "showPhone": True},
            {"id": "k2", "role": "Headliner", "name": "Two Dollar Bills", "phone": "269-111-1111", "audiences": ["Internal", "Performers"], "showPhone": False},
        ],
        "compliance": [{"id": "q1", "item": "Liquor license", "owner": "Polly & Birch", "offset": -61, "status": "needed", "files": []}],
        "equipment": [{"id": "e1", "item": "Subwoofers", "cat": "Audio", "qty": 2, "source": "Owned", "status": "needed"}],
        "layout": {"room": {"w": 60, "d": 90}, "pieces": [{"id": "z1", "kind": "stage", "x": 20, "y": 3, "w": 6, "h": 4, "rot": 0}], "pins": []},
    }


SIMPLE_STATIC = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}


@override_settings(STORAGES=SIMPLE_STATIC, SECURE_SSL_REDIRECT=False)
class PlannerTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("hananiah", password="test-pass-123")
        self.org = Organization.objects.create(name="Blackmagic Media")
        Membership.objects.create(user=self.user, org=self.org, role="owner")
        self.client.login(username="hananiah", password="test-pass-123")

    def put(self, url, data):
        return self.client.put(url, json.dumps(data), content_type="application/json")

    def test_app_requires_login(self):
        self.client.logout()
        self.assertEqual(self.client.get("/").status_code, 302)
        self.assertEqual(self.client.get("/api/bootstrap/").status_code, 401)

    def test_save_and_load_event_round_trip(self):
        r = self.put("/api/events/ev1/", sample_event())
        self.assertEqual(r.status_code, 200)
        data = self.client.get("/api/bootstrap/").json()
        ev = data["events"][0]
        self.assertEqual(ev["name"], "Test Show")
        self.assertEqual(ev["doors"], "19:00")
        self.assertEqual(ev["priceAdv"], 15)
        self.assertEqual([m["id"] for m in ev["milestones"]], ["m1", "m2"])
        self.assertEqual(ev["milestones"][0]["checklist"][0]["text"], "Call JR")
        self.assertEqual(ev["program"]["items"][1]["who"], "Two Dollar Bills")
        self.assertEqual(ev["layout"]["pieces"][0]["kind"], "stage")

    def test_removed_rows_are_deleted(self):
        self.put("/api/events/ev1/", sample_event())
        data = sample_event()
        data["milestones"] = data["milestones"][:1]
        self.put("/api/events/ev1/", data)
        self.assertEqual(Milestone.objects.filter(event_id="ev1").count(), 1)

    def test_other_organizations_cannot_see_or_overwrite(self):
        self.put("/api/events/ev1/", sample_event())
        other = get_user_model().objects.create_user("stranger", password="test-pass-123")
        other_org = Organization.objects.create(name="Someone Else")
        Membership.objects.create(user=other, org=other_org)
        self.client.login(username="stranger", password="test-pass-123")
        self.assertEqual(self.client.get("/api/bootstrap/").json()["events"], [])
        self.assertEqual(self.put("/api/events/ev1/", sample_event()).status_code, 409)
        self.assertEqual(Event.objects.get(pk="ev1").org, self.org)

    def test_share_page_shows_only_that_audience(self):
        self.put("/api/events/ev1/", sample_event())
        links = self.client.get("/api/events/ev1/share-links/").json()
        vendors = self.client.get(links["Vendors"]["page"].replace("http://testserver", ""))
        self.assertContains(vendors, "Doors")
        self.assertNotContains(vendors, "Headliner")       # tagged for Performers only
        self.assertNotContains(vendors, "269-111-1111")    # phone hidden
        self.assertContains(vendors, "269-000-0000")       # lead's phone is set to visible

    def test_calendar_feeds(self):
        self.put("/api/events/ev1/", sample_event())
        links = self.client.get("/api/events/ev1/share-links/").json()
        cal = self.client.get(links["Deadlines"]["calendar"].replace("http://testserver", ""))
        body = cal.content.decode()
        self.assertEqual(cal["Content-Type"], "text/calendar; charset=utf-8")
        self.assertIn("HARD DEADLINE: Venue application", body)
        self.assertIn("BEGIN:VEVENT", body)
        perf = self.client.get(links["Performers"]["calendar"].replace("http://testserver", "")).content.decode()
        self.assertIn("Two Dollar Bills: Headliner", perf)

    def test_upload_and_attach_file(self):
        self.put("/api/events/ev1/", sample_event())
        with self.settings(MEDIA_ROOT=self._tmp()):
            f = SimpleUploadedFile("license.pdf", b"%PDF-1.4 test", content_type="application/pdf")
            r = self.client.post("/api/files/", {"file": f})
            self.assertEqual(r.status_code, 200)
            file_id = r.json()["id"]
            data = sample_event()
            data["compliance"][0]["files"] = [{"id": file_id, "name": "license.pdf"}]
            self.put("/api/events/ev1/", data)
            self.assertEqual(EventFile.objects.get(pk=file_id).compliance_item_id, "q1")
            self.assertEqual(self.client.get(f"/files/{file_id}/").status_code, 200)

    def test_rejects_unsafe_file_types(self):
        f = SimpleUploadedFile("run.exe", b"MZ", content_type="application/x-msdownload")
        self.assertEqual(self.client.post("/api/files/", {"file": f}).status_code, 400)

    def test_contacts_and_notes(self):
        self.assertEqual(self.put("/api/people/p1/", {"name": "Lanquya Moore", "org": "Quackers Kitchen"}).status_code, 200)
        self.assertEqual(self.put("/api/notes/n1/", {"text": "Need parking info", "where": "Overview"}).status_code, 200)
        data = self.client.get("/api/bootstrap/").json()
        self.assertEqual(data["people"][0]["org"], "Quackers Kitchen")
        self.assertEqual(data["notes"][0]["text"], "Need parking info")

    def test_event_ai_summary_is_gone(self):
        # [final] The per-event AI meeting summary was removed; its address no longer exists.
        self.put("/api/events/ev1/", sample_event())
        self.assertEqual(self.client.post("/api/events/ev1/ai-summary/").status_code, 404)

    def test_reminders_dry_run(self):
        from django.core.management import call_command
        from io import StringIO
        # v3: reminders go to the deadline's owner (from People), not to every login.
        data = sample_event(show=date.today() + timedelta(days=5))  # "Venue application" is 64 days overdue
        data["contacts"][0]["email"] = "h@example.com"
        data["milestones"][0]["owner"] = "Hananiah Hardin"
        self.put("/api/events/ev1/", data)
        out = StringIO()
        call_command("send_reminders", "--dry-run", stdout=out)
        self.assertIn("[Overdue] Deadline: Venue application", out.getvalue())
        self.assertIn("To: h@example.com", out.getvalue())

    def _tmp(self):
        import tempfile
        return tempfile.mkdtemp()
