"""
planner/tests_beta.py — [beta] automatic checks for the beta update: dated checklist
steps, each event's own groups, group lists and fees, emailing a group, organizations
(create, find, ask to join, invite links, members), and the testing program.

Run everything with:   python manage.py test
"""
import json
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings

from .models import Event, EventContact, JoinRequest, Membership, Note, OrgInvite, Organization, ShareLink, UsageEvent
from .budget import budget_summary
from .checks import run_checks
from .reminders import plan_for_day
from .tests import SIMPLE_STATIC, sample_event

FESTIVAL_GROUPS = [{"id": "Performers", "name": "Performers"}, {"id": "g-food", "name": "Food vendors", "vendor": True},
                   {"id": "g-retail", "name": "Retail", "vendor": True}, {"id": "Security", "name": "Security"}]


@override_settings(STORAGES=SIMPLE_STATIC, SECURE_SSL_REDIRECT=False,
                   EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class BetaTests(TestCase):
    def setUp(self):
        cache.clear()
        User = get_user_model()
        self.me = User.objects.create_user("mia", email="mia@example.com", password="test-pass-123", first_name="Mia")
        self.org = Organization.objects.create(name="Black Arts Festival", discoverable=True)
        Membership.objects.create(user=self.me, org=self.org, role="owner")
        self.client.login(username="mia", password="test-pass-123")

    def put(self, url, data):
        return self.client.put(url, json.dumps(data), content_type="application/json")

    def post(self, url, data=None):
        return self.client.post(url, json.dumps(data or {}), content_type="application/json")

    def boot(self):
        return self.client.get("/api/bootstrap/").json()

    def festival(self, show=None):
        d = sample_event("ev1", show=show)
        d["groups"] = FESTIVAL_GROUPS
        d["contacts"][0]["email"] = "lead@example.com"
        d["contacts"] += [
            {"id": "r1", "name": "Taco Truck", "email": "taco@example.com", "audiences": ["g-food", "Vendors"], "roster": True,
             "booth": "Food truck, 2 spaces", "fee": 75, "feePaid": True, "remind": False},
            {"id": "r2", "name": "Bead Shop", "email": "beads@example.com", "audiences": ["g-retail"], "roster": True, "fee": 50},
            {"id": "r3", "name": "No Email Crafts", "audiences": ["g-retail"], "roster": True, "fee": 50},
        ]
        d["setup"].append({"id": "s9", "title": "Vendors set up", "start": "11:00", "end": "11:30", "track": "Production",
                           "audiences": ["Internal", "g-food", "g-retail"]})
        return d

    # ---- dated checklist steps ----
    def test_steps_have_their_own_dates_reminders_and_mark_done(self):
        show = date.today() + timedelta(days=40)
        d = sample_event("ev1", show=show)
        d["contacts"][0]["email"] = "lead@example.com"
        d["milestones"][0].update(owner=d["contacts"][0]["name"], offset=-1, checklist=[
            {"id": "c1", "text": "Tell the city", "done": False, "offset": -30},
            {"id": "c2", "text": "Call the fire marshal", "done": False, "offset": -14},
            {"id": "c3", "text": "No date", "done": False}])
        self.put("/api/events/ev1/", d)
        ev = self.boot()["events"][0]
        self.assertEqual([c["offset"] for c in ev["milestones"][0]["checklist"]], [-30, -14, None])
        event = Event.objects.get(pk="ev1")
        plan = plan_for_day(event, show - timedelta(days=37), "https://x.example")   # 7 days before the first step
        item = plan["lead@example.com"]["items"][0]
        self.assertEqual((item["kind"], item["tag"]), ("Step", "Due in one week"))
        path = item["action"].replace("https://x.example", "")
        self.assertContains(self.client.get(path), "Tell the city")
        self.client.post(path)
        m = Event.objects.get(pk="ev1").milestones.get(pk=d["milestones"][0]["id"])
        self.assertTrue(m.checklist[0]["done"])
        self.assertEqual(m.status, "doing")          # ticking a step means someone is on it
        # overdue step shows in checks, and in the calendar feed
        texts = [c["text"] for c in run_checks(event, today=show - timedelta(days=10))]
        self.assertTrue(any("Call the fire marshal" in t for t in texts))
        cal = ShareLink.objects.create(event=event, audience="Deadlines")
        self.assertContains(self.client.get(f"/s/{cal.token}/calendar.ics"), "Step: Call the fire marshal")

    # ---- groups, group lists, fees ----
    def test_custom_groups_drive_share_pages(self):
        self.put("/api/events/ev1/", self.festival())
        ev = self.boot()["events"][0]
        self.assertEqual([g["name"] for g in ev["groups"]], ["Performers", "Food vendors", "Retail", "Security"])
        taco = next(c for c in ev["contacts"] if c["id"] == "r1")
        self.assertEqual(taco["audiences"], ["g-food"])            # "Vendors" isn't a group of this event any more
        self.assertEqual((taco["roster"], taco["fee"], taco["feePaid"]), (True, 75, True))
        links = self.client.get("/api/events/ev1/share-links/").json()
        self.assertIn("g-food", links)
        page = self.client.get(links["g-food"]["page"].replace("http://testserver", ""))
        self.assertContains(page, "Food vendors itinerary")
        self.assertContains(page, "Vendors set up")
        self.assertNotContains(page, "Taco Truck")                  # group lists receive the page; they aren't listed on it

    def test_vendor_fees_and_platform_fees_in_the_budget(self):
        d = self.festival()
        d["budget"] = [{"id": "b1", "kind": "income", "cat": "Tickets", "item": "Eventbrite", "actual": 1000, "fees": 81.43, "status": "received"},
                       {"id": "b2", "kind": "income", "cat": "Vendor fees", "item": "Typed by hand", "est": 999}]
        self.put("/api/events/ev1/", d)
        b = budget_summary(Event.objects.get(pk="ev1"))
        # 1000 − 81.43 in tickets, plus 175 in vendor fees from the list (the hand-typed 999 line is replaced)
        self.assertEqual(b["proj_income"], 1000 - __import__("decimal").Decimal("81.43") + 175)

    def test_email_a_group_its_itinerary(self):
        self.put("/api/events/ev1/", self.festival())
        r = self.post("/api/events/ev1/send-itinerary/", {"group": "g-retail", "only": "unsent", "note": "Load in from Rose St."})
        self.assertEqual((r.json()["sent"], r.json()["skipped"]), (1, 1))
        self.assertEqual(mail.outbox[-1].to, ["beads@example.com"])
        self.assertIn("Load in from Rose St.", mail.outbox[-1].body)
        self.assertEqual(mail.outbox[-1].reply_to, ["mia@example.com"])
        self.assertIsNotNone(EventContact.objects.get(pk="r2").sent_at)
        again = self.post("/api/events/ev1/send-itinerary/", {"group": "g-retail", "only": "unsent"}).json()
        self.assertEqual(again["sent"], 0)                          # already sent: not sent twice
        one = self.post("/api/events/ev1/send-itinerary/", {"group": "g-food", "contactIds": ["r1"]}).json()
        self.assertEqual(one["sent"], 1)
        self.assertEqual(self.post("/api/events/ev1/send-itinerary/", {"group": "nope"}).status_code, 400)

    def test_layout_groups_tags_headcount_and_custom_tabs(self):
        d = self.festival()
        d["layout"] = {"room": {"w": 100, "d": 60}, "pieces": [{"id": "p1", "kind": "food", "x": 1, "y": 1, "w": 10, "h": 10, "group": "g-food", "contactId": "r1"},
                                                              {"id": "p2", "kind": "custom", "label": "Kids area", "x": 30, "y": 1, "w": 20, "h": 20, "group": "bogus"}]}
        d["noHeadcount"] = True
        d["customTabs"] = [{"id": "t1", "name": "Street closure notes", "body": "Barricades at Rose St."}]
        d["hiddenTabs"] = ["wrapup"]
        self.put("/api/events/ev1/", d)
        ev = self.boot()["events"][0]
        pieces = {p["id"]: p for p in ev["layout"]["pieces"]}
        self.assertEqual((pieces["p1"]["group"], pieces["p1"]["contactId"]), ("g-food", "r1"))
        self.assertEqual(pieces["p2"]["group"], "")               # not a group of this event
        self.assertTrue(ev["noHeadcount"])
        self.assertEqual(ev["customTabs"][0]["body"], "Barricades at Rose St.")
        self.assertEqual(ev["hiddenTabs"], ["wrapup"])
        self.put("/api/people/p9/", {"name": "Erica", "tags": ["Vendor", "Regular", "Vendor"]})
        self.assertEqual(self.boot()["people"][0]["tags"], ["Vendor", "Regular"])

    # ---- organizations ----
    def test_create_find_ask_approve(self):
        User = get_user_model()
        dana = User.objects.create_user("dana", email="dana@example.com", password="test-pass-123", first_name="Dana")
        Membership.objects.create(user=dana, org=Organization.objects.create(name="Dana's events", personal=True, discoverable=False), role="owner")
        self.put("/api/org/team/", {"city": "Kalamazoo", "discoverable": True})
        other = self.client_class()
        other.login(username="dana", password="test-pass-123")
        found = other.get("/api/orgs/search/?q=black").json()["results"]
        self.assertEqual([(o["name"], o["city"]) for o in found], [("Black Arts Festival", "Kalamazoo")])
        self.assertEqual(other.get("/api/orgs/search/?q=dana").json()["results"], [])   # personal workspaces never show
        r = other.post(f"/api/orgs/{self.org.id}/join/", json.dumps({"message": "I run the youth table"}), content_type="application/json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(mail.outbox[-1].to, ["mia@example.com"])
        self.assertEqual(self.boot()["pendingRequests"], 1)
        req = self.client.get("/api/org/team/").json()["requests"][0]
        self.post(f"/api/org/requests/{req['id']}/", {"decision": "approved"})
        self.assertTrue(Membership.objects.filter(user=dana, org=self.org, role="member").exists())
        self.assertIn("You're in", mail.outbox[-1].subject)
        # members show up for the owner box
        self.assertIn("Dana", [m["name"] for m in self.boot()["members"]])
        # a member can't manage; the last owner can't leave or be demoted
        other.post("/api/orgs/switch/", json.dumps({"id": self.org.id}), content_type="application/json")
        self.assertEqual(other.post("/api/org/invites/").status_code, 403)
        self.assertEqual(self.client.delete(f"/api/org/members/{self.me.id}/").status_code, 400)
        self.assertEqual(self.put(f"/api/org/members/{self.me.id}/", {"role": "member"}).status_code, 400)
        self.assertEqual(self.put(f"/api/org/members/{dana.id}/", {"role": "owner"}).json()["role"], "owner")
        self.assertEqual(other.delete(f"/api/org/members/{dana.id}/").status_code, 200)   # leaving is allowed

    def test_invite_link_sign_up_then_join(self):
        url = self.post("/api/org/invites/").json()["url"]
        path = "/" + url.split("/", 3)[3]
        fresh = self.client_class()
        self.assertContains(fresh.get(path), "Create an account")
        r = fresh.post("/signup/", {"name": "Lee Park", "email": "lee@example.com", "password": "violet-barn-42", "next": path})
        self.assertRedirects(r, path)                              # back to the invite, now logged in
        fresh.post(path)
        lee = get_user_model().objects.get(email="lee@example.com")
        self.assertTrue(Membership.objects.filter(user=lee, org=self.org, role="member").exists())
        self.assertEqual(OrgInvite.objects.get().uses, 1)
        OrgInvite.objects.update(revoked=True)
        self.assertEqual(fresh.get(path).status_code, 404)

    def test_sign_up_with_an_existing_name_offers_to_join(self):
        self.client.logout()
        self.client.post("/signup/", {"name": "Ana Ruiz", "email": "ana@example.com", "password": "violet-barn-42", "org": "black arts festival"})
        data = self.boot()
        self.assertEqual([o["name"] for o in data["orgs"]], ["Ana's events"])      # not created twice
        self.assertEqual([o["name"] for o in data["joinSuggestions"]], ["Black Arts Festival"])
        self.assertEqual(self.boot()["joinSuggestions"], [])                        # offered once

    # ---- testing program ----
    def test_usage_log_report_and_feedback(self):
        r = self.post("/api/telemetry/", {"session": "s1", "events": [
            {"kind": "action", "name": "newEvent", "screen": "home"},
            {"kind": "flow", "name": "start:new"}, {"kind": "flow", "name": "abandon:new"},
            {"kind": "error", "name": "TypeError: x is undefined", "screen": "event/budget", "detail": "budget.js:12"},
            {"kind": "rating", "name": "send", "detail": "2"},
            {"kind": "nonsense", "name": "ignored"}]})
        self.assertEqual(r.json()["saved"], 5)
        self.put("/api/notes/n1/", {"text": "Where do I put vendor parking?", "where": "Layout", "shared": True})
        self.assertEqual(self.client.get("/api/testing/report/").status_code, 403)   # team only
        get_user_model().objects.filter(pk=self.me.pk).update(is_staff=True)
        rep = self.client.get("/api/testing/report/?days=7").json()
        self.assertEqual(rep["stuck"][0], {"name": "new", "start": 1, "done": 0, "abandon": 1, "rate": 100})
        self.assertEqual(rep["errors"][0]["count"], 1)
        self.assertEqual(rep["ratings"][0]["avg"], 2.0)
        self.assertEqual(rep["feedback"][0]["text"], "Where do I put vendor parking?")
        self.put("/api/testing/feedback/n1/", {"done": True})
        self.assertTrue(Note.objects.get(pk="n1").done)
        self.assertEqual(UsageEvent.objects.filter(kind="error").first().screen, "event/budget")

    # ---- the page loads every new screen file, in order ----
    def test_app_page_loads_the_beta_screens(self):
        html = self.client.get("/").content.decode()
        names = ["account.js", "help.js", "groups.js", "series.js", "team.js", "testing.js", "boot.js"]
        spots = [html.find("planner/js/" + n) for n in names]
        self.assertTrue(all(s > 0 for s in spots), spots)
        self.assertEqual(spots, sorted(spots))   # boot.js last; team.js after hours.js replaces the old pop-up
        self.assertLess(html.find("planner/js/hours.js"), html.find("planner/js/team.js"))
