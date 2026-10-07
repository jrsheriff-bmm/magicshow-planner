"""
planner/tests_v3.py — [v3] automatic checks for the new features.

Run everything with:   python manage.py test
(Django finds this file on its own because its name starts with "tests".)
"""
import json
import os
from datetime import date, timedelta
from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings

from .emails import done_token
from .models import Approval, BudgetLine, EventFile, Membership, Milestone, Organization, OrgTemplate, ReminderLog
from .reminders import plan_for_day, reminder_tag
from .models import Event
from .tests import SIMPLE_STATIC, sample_event


def v3_event(show):
    """The v2 sample event plus v3 pieces: owners with emails, a budget, a wrap-up."""
    d = sample_event(show=show)
    d["contacts"][0].update({"email": "lead@example.com", "team": True})
    d["contacts"][1].update({"email": "band@example.com"})
    d["milestones"][0]["owner"] = "Hananiah Hardin"
    d["milestones"][1]["owner"] = "Two Dollar Bills"
    d["budgetTotal"] = 3000
    d["budget"] = [
        {"id": "b1", "kind": "cost", "cat": "Venue", "item": "Venue rental", "payee": "Barn House", "est": 400, "actual": "",
         "paid": "", "due": (show - timedelta(days=20)).isoformat(), "status": "committed", "files": []},
        {"id": "b2", "kind": "income", "cat": "Sponsorship", "item": "Sponsor", "est": 500, "status": "expected"},
    ]
    d["wrapup"] = {"attendance": 88, "rating": 4, "change": "Book security earlier", "ratings": {"k2": {"score": 5, "note": "Great"}}}
    return d


@override_settings(STORAGES=SIMPLE_STATIC, SECURE_SSL_REDIRECT=False)
class V3Tests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("hananiah", password="test-pass-123", email="h@example.com", first_name="Hananiah")
        self.org = Organization.objects.create(name="Blackmagic Media")
        Membership.objects.create(user=self.user, org=self.org, role="owner")
        self.client.login(username="hananiah", password="test-pass-123")
        self.show = date.today() + timedelta(days=30)

    def put(self, url, data):
        return self.client.put(url, json.dumps(data), content_type="application/json")

    def post(self, url, data=None):
        return self.client.post(url, json.dumps(data or {}), content_type="application/json")

    def load(self):
        return self.client.get("/api/bootstrap/").json()["events"][0]

    # ---- saving the new fields ----
    def test_budget_wrapup_owners_round_trip(self):
        d = v3_event(self.show)
        d["milestones"][0]["status"] = "done"
        d["milestones"][0]["ownerId"] = "k1"
        self.assertEqual(self.put("/api/events/ev1/", d).status_code, 200)
        ev = self.load()
        self.assertEqual(ev["budgetTotal"], 3000)
        self.assertEqual([b["id"] for b in ev["budget"]], ["b1", "b2"])
        self.assertEqual(ev["budget"][0]["est"], 400)
        self.assertEqual(ev["budget"][0]["actual"], "")  # blank stays blank, not 0
        self.assertEqual(ev["wrapup"]["attendance"], 88)
        self.assertEqual(ev["wrapup"]["ratings"]["k2"]["score"], 5)
        self.assertEqual(ev["milestones"][0]["ownerId"], "k1")
        self.assertEqual(ev["milestones"][0]["doneAt"], date.today().isoformat())  # recorded automatically
        self.assertTrue(ev["contacts"][0]["team"])
        self.assertTrue(ev["contacts"][1]["remind"])
        d["milestones"][0]["status"] = "todo"
        self.put("/api/events/ev1/", d)
        self.assertIsNone(Milestone.objects.get(pk="m1").done_at)  # reopened → date cleared

    def test_invoice_attaches_to_budget_line(self):
        self.put("/api/events/ev1/", v3_event(self.show))
        import tempfile
        with self.settings(MEDIA_ROOT=tempfile.mkdtemp()):
            f = SimpleUploadedFile("invoice.pdf", b"%PDF-1.4 x", content_type="application/pdf")
            file_id = self.client.post("/api/files/", {"file": f}).json()["id"]
            d = v3_event(self.show)
            d["budget"][0]["files"] = [{"id": file_id, "name": "invoice.pdf"}]
            self.put("/api/events/ev1/", d)
            self.assertEqual(EventFile.objects.get(pk=file_id).budget_line_id, "b1")
            self.assertEqual(self.load()["budget"][0]["files"][0]["name"], "invoice.pdf")

    # ---- templates ----
    def test_templates_save_list_delete(self):
        body = {"id": "t1", "name": "Mystic Music", "desc": "Monthly", "data": {"milestones": [{"id": "x", "title": "Book venue", "offset": -30}]}}
        self.assertEqual(self.put("/api/templates/t1/", body).status_code, 200)
        tpls = self.client.get("/api/bootstrap/").json()["templates"]
        self.assertEqual(tpls[0]["name"], "Mystic Music")
        self.assertEqual(tpls[0]["data"]["milestones"][0]["title"], "Book venue")
        self.client.delete("/api/templates/t1/")
        self.assertFalse(OrgTemplate.objects.exists())

    # ---- approvals ----
    def test_approval_request_email_and_decision_page(self):
        self.put("/api/events/ev1/", v3_event(self.show))
        r = self.post("/api/events/ev1/approvals/", {"targetType": "budget", "targetId": "b1", "label": "Venue rental ($400)",
                                                     "approver": "Jessica Potter", "approverEmail": "jessica@example.com"})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Approval needed", mail.outbox[0].subject)
        approval = Approval.objects.get()
        self.assertIn(f"/a/{approval.token}/", mail.outbox[0].body)
        self.assertNotIn("token", r.json())  # the secret link is never sent to the screens
        # Saving the event can't approve it
        d = v3_event(self.show)
        d["approvals"] = [dict(r.json(), status="approved")]
        self.put("/api/events/ev1/", d)
        self.assertEqual(Approval.objects.get().status, "pending")
        # The approver's page: opening it changes nothing, pressing Approve does
        self.client.logout()
        self.assertContains(self.client.get(f"/a/{approval.token}/"), "Venue rental")
        self.client.post(f"/a/{approval.token}/", {"decision": "approved", "by": "Jessica", "comment": "OK"})
        approval.refresh_from_db()
        self.assertEqual((approval.status, approval.decided_by, approval.comment), ("approved", "Jessica", "OK"))
        self.assertTrue(any("Approved" in m.subject for m in mail.outbox[1:]))  # the requester hears back

    def test_approval_recorded_by_hand_and_deleted(self):
        self.put("/api/events/ev1/", v3_event(self.show))
        a = self.post("/api/events/ev1/approvals/", {"label": "Event plan", "approver": "Boss"}).json()
        self.assertEqual(len(mail.outbox), 0)  # no email address, no email
        self.assertEqual(self.post(f"/api/approvals/{a['id']}/decide/", {"decision": "declined", "comment": "Too much"}).json()["status"], "declined")
        self.client.delete(f"/api/approvals/{a['id']}/")
        self.assertFalse(Approval.objects.exists())

    # ---- My tasks and Mark done ----
    def test_person_link_and_mark_done(self):
        self.put("/api/events/ev1/", v3_event(self.show))
        page = self.client.get("/api/events/ev1/person-link/k1/").json()["page"].replace("http://testserver", "")
        self.client.logout()
        self.assertContains(self.client.get(page), "Venue application")
        self.assertNotContains(self.client.get(page), "Promo launch")  # someone else's task
        self.client.post(page, {"kind": "m", "id": "m1"})
        self.assertEqual(Milestone.objects.get(pk="m1").status, "done")
        self.client.post(page, {"kind": "m", "id": "m2"})  # not theirs: ignored
        self.assertEqual(Milestone.objects.get(pk="m2").status, "doing")

    def test_done_link_asks_before_changing(self):
        self.put("/api/events/ev1/", v3_event(self.show))
        self.client.logout()
        url = f"/done/{done_token('m', 'ev1', 'm1')}/"
        self.assertContains(self.client.get(url), "Yes, mark it done")
        self.assertEqual(Milestone.objects.get(pk="m1").status, "todo")  # email scanners opening the link change nothing
        self.client.post(url)
        m = Milestone.objects.get(pk="m1")
        self.assertEqual((m.status, m.done_at), ("done", date.today()))
        self.client.post(f"/done/{done_token('b', 'ev1', 'b1')}/")
        self.assertEqual(BudgetLine.objects.get(pk="b1").status, "paid")
        self.assertEqual(self.client.get("/done/not-a-real-code/").status_code, 404)

    # ---- reminder rules ----
    def test_reminder_rhythm(self):
        self.assertEqual([reminder_tag(d) for d in (8, 7, 6, 1, 0, -1, -2, -8, -15)],
                         [None, "Due in one week", None, "Due tomorrow", None, "Overdue", None, "Overdue", "Overdue"])

    def test_who_gets_what(self):
        self.put("/api/events/ev1/", v3_event(self.show))
        event = Event.objects.get(pk="ev1")
        base = "https://example.com"
        # 7 days before "Promo launch" (T-10): its owner, the headliner, hears about it
        plan = plan_for_day(event, self.show - timedelta(days=17), base)
        self.assertEqual(plan["band@example.com"]["items"][0]["text"], "Promo launch")
        # 7 days before the show: everyone gets their itinerary
        plan = plan_for_day(event, self.show - timedelta(days=7), base)
        self.assertIn("Performers itinerary", plan["band@example.com"]["items"][-1]["text"])
        # 1 day before the venue payment: the team (lead) hears about it, the band doesn't
        plan = plan_for_day(event, self.show - timedelta(days=21), base)
        self.assertEqual(plan["lead@example.com"]["items"][0]["kind"], "Payment")
        self.assertNotIn("band@example.com", plan)
        # Reminders turned off: nothing
        d = v3_event(self.show)
        d["contacts"][1]["remind"] = False
        self.put("/api/events/ev1/", d)
        event = Event.objects.get(pk="ev1")
        self.assertNotIn("band@example.com", plan_for_day(event, self.show - timedelta(days=17), base))
        # After show day: nothing at all
        self.assertEqual(plan_for_day(event, self.show + timedelta(days=1), base), {})

    def test_send_reminders_once_per_day(self):
        d = v3_event(date.today() + timedelta(days=11))  # "Promo launch" (T-10) is due tomorrow
        self.put("/api/events/ev1/", d)
        with mock.patch.dict(os.environ, {"SITE_URL": "https://prep.example.com"}):
            call_command("send_reminders", stdout=StringIO())
            call_command("send_reminders", stdout=StringIO())  # second run the same day sends nothing new
        to_band = [m for m in mail.outbox if m.to == ["band@example.com"]]
        self.assertEqual(len(to_band), 1)
        self.assertIn("Promo launch", to_band[0].body)
        self.assertIn("https://prep.example.com/done/", to_band[0].body)
        self.assertEqual(ReminderLog.objects.filter(email="band@example.com").count(), 1)

    def test_send_reminders_needs_site_url(self):
        with mock.patch.dict(os.environ, {"SITE_URL": ""}):
            with self.assertRaises(Exception):
                call_command("send_reminders", stdout=StringIO())

    def test_portfolio_ai_off_without_key(self):
        with self.settings(ANTHROPIC_API_KEY=""):
            self.assertEqual(self.post("/api/reports/ai-summary/").status_code, 503)

    def test_checks_include_budget(self):
        from .checks import run_checks
        d = v3_event(self.show)
        d["budgetTotal"] = 100
        self.put("/api/events/ev1/", d)
        texts = [c["text"] for c in run_checks(Event.objects.get(pk="ev1"))]
        self.assertTrue(any("over the budget" in t for t in texts))
