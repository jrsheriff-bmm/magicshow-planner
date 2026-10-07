"""
planner/tests_v4.py — [v4] automatic checks for client workspaces, Hours,
and deadlines after show day.

Run everything with:   python manage.py test
"""
import json
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from .models import Event, EventFile, Membership, Organization, TimeEntry
from .reminders import plan_for_day
from .tests import SIMPLE_STATIC, sample_event


@override_settings(STORAGES=SIMPLE_STATIC, SECURE_SSL_REDIRECT=False)
class V4Tests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.me = User.objects.create_user("hananiah", password="test-pass-123")
        self.bmm = Organization.objects.create(name="Blackmagic Solutions")
        Membership.objects.create(user=self.me, org=self.bmm, role="owner")
        self.client.login(username="hananiah", password="test-pass-123")

    def put(self, url, data):
        return self.client.put(url, json.dumps(data), content_type="application/json")

    def post(self, url, data=None):
        return self.client.post(url, json.dumps(data or {}), content_type="application/json")

    def boot(self):
        return self.client.get("/api/bootstrap/").json()

    # ---- client workspaces ----
    def test_create_and_switch_workspaces(self):
        self.put("/api/events/ev1/", sample_event("ev1"))                 # in Blackmagic Solutions
        r = self.post("/api/orgs/", {"name": "Eastside Youth Arts"})
        self.assertEqual(r.status_code, 201)
        client_id = r.json()["id"]
        data = self.boot()                                                 # now inside the new workspace
        self.assertEqual(data["org"]["name"], "Eastside Youth Arts")
        self.assertEqual(data["org"]["role"], "owner")
        self.assertEqual(data["events"], [])
        self.assertEqual(sorted(o["name"] for o in data["orgs"]), ["Blackmagic Solutions", "Eastside Youth Arts"])
        self.put("/api/events/ev2/", sample_event("ev2"))
        self.assertEqual(Event.objects.get(pk="ev2").org_id, client_id)
        self.post("/api/orgs/switch/", {"id": self.bmm.id})
        self.assertEqual([e["id"] for e in self.boot()["events"]], ["ev1"])

    def test_cannot_switch_into_someone_elses_workspace(self):
        other = Organization.objects.create(name="Not yours")
        self.assertEqual(self.post("/api/orgs/switch/", {"id": other.id}).status_code, 403)
        self.assertEqual(self.boot()["org"]["name"], "Blackmagic Solutions")

    def test_client_login_sees_only_their_workspace(self):
        client_org = Organization.objects.create(name="Eastside Youth Arts")
        Membership.objects.create(user=self.me, org=client_org, role="owner")
        staff = get_user_model().objects.create_user("eastside", password="test-pass-123")
        Membership.objects.create(user=staff, org=client_org, role="member")
        self.post("/api/orgs/switch/", {"id": client_org.id})
        self.put("/api/events/ev3/", sample_event("ev3"))
        self.client.login(username="eastside", password="test-pass-123")
        data = self.boot()
        self.assertEqual([o["name"] for o in data["orgs"]], ["Eastside Youth Arts"])
        self.assertEqual([e["id"] for e in data["events"]], ["ev3"])
        # members can log hours but can't change the retainer
        self.assertEqual(self.put("/api/org/settings/", {"retainerHours": 99}).status_code, 403)

    def test_files_open_from_any_workspace_you_belong_to(self):
        import tempfile
        with self.settings(MEDIA_ROOT=tempfile.mkdtemp()):
            f = SimpleUploadedFile("brief.pdf", b"%PDF-1.4 x", content_type="application/pdf")
            file_id = self.client.post("/api/files/", {"file": f}).json()["id"]
            self.post("/api/orgs/", {"name": "Eastside Youth Arts"})     # switch away
            self.assertEqual(self.client.get(f"/files/{file_id}/").status_code, 200)
            self.assertEqual(EventFile.objects.get(pk=file_id).org, self.bmm)

    # ---- hours ----
    def test_hours_and_retainer(self):
        self.assertEqual(self.put("/api/org/settings/", {"retainerHours": 28, "hourlyRate": 100}).status_code, 200)
        r = self.put("/api/hours/h1/", {"date": "2027-01-12", "hours": 3.5, "cat": "Teach", "note": "Session 1"})
        self.assertEqual(r.status_code, 200)
        self.put("/api/hours/h2/", {"date": "2027-01-13", "hours": 99, "cat": "Nonsense"})
        data = self.boot()
        self.assertEqual(data["org"]["retainerHours"], 28)
        hours = {h["id"]: h for h in data["hours"]}
        self.assertEqual(hours["h1"]["hours"], 3.5)
        self.assertEqual(hours["h2"]["hours"], 24)        # capped at a day
        self.assertEqual(hours["h2"]["cat"], "Admin")     # unknown kinds become Admin
        self.client.delete("/api/hours/h1/")
        self.assertEqual(TimeEntry.objects.count(), 1)

    def test_hours_stay_in_their_workspace(self):
        self.put("/api/hours/h1/", {"date": "2027-01-12", "hours": 2})
        self.post("/api/orgs/", {"name": "Eastside Youth Arts"})
        self.assertEqual(self.boot()["hours"], [])
        self.assertEqual(self.put("/api/hours/h1/", {"hours": 5}).status_code, 409)   # can't take over another workspace's entry

    # ---- deadlines after show day ----
    def test_reminders_continue_for_work_after_the_show(self):
        show = date.today() + timedelta(days=5)
        d = sample_event("ev1", show=show)
        d["contacts"][0]["email"] = "lead@example.com"
        d["milestones"].append({"id": "m9", "title": "Deliver photos to client", "offset": 3, "owner": "Hananiah Hardin", "status": "todo"})
        self.put("/api/events/ev1/", d)
        event = Event.objects.get(pk="ev1")
        self.assertEqual(event.milestones.get(pk="m9").offset, 3)
        plan = plan_for_day(event, show + timedelta(days=2), "https://example.com")   # after the show, day before delivery
        self.assertEqual(plan["lead@example.com"]["items"][0]["text"], "Deliver photos to client")
        self.assertEqual(plan["lead@example.com"]["items"][0]["tag"], "Due tomorrow")

    def test_your_templates_follow_you_into_client_workspaces(self):
        self.put("/api/templates/t1/", {"name": "Event coverage (BMS)", "data": {"milestones": []}})
        self.post("/api/orgs/", {"name": "Eastside Youth Arts"})
        tpls = self.boot()["templates"]
        self.assertEqual([(t["name"], t["workspace"]) for t in tpls], [("Event coverage (BMS)", "Blackmagic Solutions")])
        self.assertEqual(self.put("/api/templates/t1/", {"name": "Renamed", "data": {}}).status_code, 200)
        from .models import OrgTemplate
        self.assertEqual(OrgTemplate.objects.get(pk="t1").org, self.bmm)   # stays where it was saved
        # a client's staff (members) don't see the consultant's other templates
        staff = get_user_model().objects.create_user("eastside", password="test-pass-123")
        Membership.objects.create(user=staff, org=Organization.objects.get(name="Eastside Youth Arts"), role="member")
        self.client.login(username="eastside", password="test-pass-123")
        self.assertEqual(self.boot()["templates"], [])
