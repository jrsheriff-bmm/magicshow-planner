"""
planner/tests_final.py — [final] automatic checks for accounts: sign-up, logging in
with an email, forgotten passwords, and the Blackmagic team's access to retainer
clients' workspaces.

Run everything with:   python manage.py test
"""
import json
import os
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings

from .models import Membership, Organization
from .tests import SIMPLE_STATIC

GOOD = {"name": "Dana Rivers", "org": "Eastside Youth Arts", "email": "Dana@Example.com", "password": "violet-barn-42"}


@override_settings(STORAGES=SIMPLE_STATIC, SECURE_SSL_REDIRECT=False,
                   EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class AccountTests(TestCase):
    def setUp(self):
        cache.clear()
        User = get_user_model()
        # The Blackmagic team: a Staff login with its own (internal) workspace.
        self.staff = User.objects.create_user("hananiah", email="h@blackmagic.example", password="test-pass-123", is_staff=True)
        self.bmm = Organization.objects.create(name="Blackmagic Media")
        Membership.objects.create(user=self.staff, org=self.bmm, role="owner")

    def put(self, url, data):
        return self.client.put(url, json.dumps(data), content_type="application/json")

    def boot(self):
        return self.client.get("/api/bootstrap/").json()

    # ---- sign-up ----
    def test_sign_up_creates_an_account_and_a_private_workspace(self):
        r = self.client.post("/signup/", GOOD)
        self.assertRedirects(r, "/")
        user = get_user_model().objects.get(email="dana@example.com")
        self.assertEqual(user.username, "dana@example.com")
        self.assertEqual(user.get_full_name(), "Dana Rivers")
        data = self.boot()                                   # already logged in
        self.assertEqual(data["org"]["name"], "Eastside Youth Arts")
        self.assertEqual(data["org"]["role"], "owner")
        self.assertEqual(data["org"]["plan"], "subscription")
        self.assertFalse(data["org"]["supportAccess"])
        self.assertEqual(data["events"], [])
        self.assertEqual([o["name"] for o in data["orgs"]], ["Eastside Youth Arts"])
        self.assertFalse(data["features"]["newWorkspace"])   # client workspaces are a Blackmagic tool
        self.assertEqual(self.client.post("/api/orgs/", json.dumps({"name": "X"}), content_type="application/json").status_code, 403)
        # a welcome email to them, and a notice to the team
        self.assertEqual(sorted(m.to[0] for m in mail.outbox), ["dana@example.com", "h@blackmagic.example"])
        # the team can't see a subscriber's workspace
        self.assertFalse(Membership.objects.filter(user=self.staff, org__name="Eastside Youth Arts").exists())

    def test_sign_up_rejects_bad_details(self):
        self.assertEqual(self.client.post("/signup/", dict(GOOD, password="12345678")).status_code, 400)       # only numbers
        self.assertEqual(self.client.post("/signup/", dict(GOOD, email="not-an-email")).status_code, 400)
        self.assertEqual(self.client.post("/signup/", dict(GOOD, name="")).status_code, 400)
        self.assertEqual(self.client.post("/signup/", dict(GOOD, email="H@Blackmagic.example")).status_code, 400)  # already used
        self.assertEqual(get_user_model().objects.count(), 1)
        self.assertRedirects(self.client.post("/signup/", dict(GOOD, website="spam")), "/login/")              # the robot trap
        self.assertEqual(get_user_model().objects.count(), 1)

    def test_sign_up_can_be_closed_or_need_a_code(self):
        with mock.patch.dict(os.environ, {"ALLOW_SIGNUP": "False"}):
            self.assertContains(self.client.get("/signup/"), "Sign-up is closed")
            self.client.post("/signup/", GOOD)
            self.assertEqual(get_user_model().objects.count(), 1)
        with mock.patch.dict(os.environ, {"SIGNUP_CODE": "barnhouse"}):
            self.assertContains(self.client.get("/signup/"), "Sign-up code")
            self.assertEqual(self.client.post("/signup/", dict(GOOD, code="wrong")).status_code, 400)
            self.assertRedirects(self.client.post("/signup/", dict(GOOD, code="barnhouse")), "/")

    # ---- logging in ----
    def test_log_in_with_email_or_username(self):
        self.client.post("/signup/", GOOD)
        self.client.post("/logout/")
        self.assertRedirects(self.client.post("/login/", {"username": "DANA@example.com", "password": GOOD["password"]}), "/")
        self.client.post("/logout/")
        self.assertEqual(self.client.post("/login/", {"username": "dana@example.com", "password": "wrong-one"}).status_code, 200)
        # older logins: the username still works, and so does that login's email
        self.assertRedirects(self.client.post("/login/", {"username": "hananiah", "password": "test-pass-123"}), "/")
        self.client.post("/logout/")
        self.assertRedirects(self.client.post("/login/", {"username": "h@blackmagic.example", "password": "test-pass-123"}), "/")

    def test_forgot_password_emails_a_link_that_works(self):
        self.client.post("/signup/", GOOD)
        self.client.post("/logout/")
        mail.outbox.clear()
        self.assertRedirects(self.client.post("/password/reset/", {"email": "dana@example.com"}), "/password/reset/sent/")
        self.assertEqual(len(mail.outbox), 1)
        link = [w for w in mail.outbox[0].body.split() if "/password/reset/" in w][0]
        path = "/" + link.split("/", 3)[3]
        page = self.client.get(path, follow=True)
        self.assertContains(page, "Set a new password")
        done = self.client.post(page.redirect_chain[-1][0], {"new_password1": "amber-stage-77", "new_password2": "amber-stage-77"})
        self.assertRedirects(done, "/password/reset/done/")
        self.assertRedirects(self.client.post("/login/", {"username": "dana@example.com", "password": "amber-stage-77"}), "/")
        # an address with no account gets the same "check your email" page and no email
        mail.outbox.clear()
        self.client.post("/logout/")
        self.assertRedirects(self.client.post("/password/reset/", {"email": "nobody@example.com"}), "/password/reset/sent/")
        self.assertEqual(len(mail.outbox), 0)

    def test_change_name_email_and_password(self):
        self.client.post("/signup/", GOOD)
        r = self.put("/api/account/", {"name": "Dana R. Rivers", "email": "dana@eastside.example"})
        self.assertEqual(r.json(), {"name": "Dana R. Rivers", "email": "dana@eastside.example"})
        self.assertEqual(self.put("/api/account/", {"email": "h@blackmagic.example"}).status_code, 409)
        r = self.client.post("/account/password/", {"old_password": GOOD["password"], "new_password1": "amber-stage-77", "new_password2": "amber-stage-77"})
        self.assertRedirects(r, "/")
        self.client.post("/logout/")
        self.assertRedirects(self.client.post("/login/", {"username": "dana@eastside.example", "password": "amber-stage-77"}), "/")

    # ---- retainer clients: the Blackmagic team can come in and help ----
    def test_retainer_sign_up_lets_the_team_in(self):
        self.client.post("/signup/", dict(GOOD, retainer="on"))
        data = self.boot()
        self.assertEqual(data["org"]["plan"], "retainer")
        self.assertTrue(data["org"]["supportAccess"])
        client_org = Organization.objects.get(name="Eastside Youth Arts")
        # the client builds something
        from .tests import sample_event
        self.put("/api/events/ev1/", sample_event("ev1"))
        # the team member sees the workspace in their list, switches in, and can work on the event
        self.client.login(username="hananiah", password="test-pass-123")
        self.client.get("/")
        self.assertEqual(sorted(o["name"] for o in self.boot()["orgs"]), ["Blackmagic Media", "Eastside Youth Arts"])
        self.client.post("/api/orgs/switch/", json.dumps({"id": client_org.id}), content_type="application/json")
        data = self.boot()
        self.assertEqual(data["org"]["role"], "support")
        self.assertEqual([e["id"] for e in data["events"]], ["ev1"])
        d = sample_event("ev1"); d["name"] = "Renamed by the team"
        self.assertEqual(self.put("/api/events/ev1/", d).status_code, 200)
        self.assertEqual(self.put("/api/org/settings/", {"retainerHours": 20, "hourlyRate": 90}).status_code, 200)   # can set the retainer
        self.assertEqual(self.put("/api/org/settings/", {"supportAccess": False}).status_code, 403)                 # but can't change their own access
        self.assertEqual(Organization.objects.get(pk=client_org.pk).retainer_hours, 20)

    def test_client_can_switch_team_access_on_and_off(self):
        self.client.post("/signup/", GOOD)                     # a plain subscriber
        client_org = Organization.objects.get(name="Eastside Youth Arts")
        r = self.put("/api/org/settings/", {"supportAccess": True})
        self.assertTrue(r.json()["supportAccess"])
        self.assertEqual(r.json()["plan"], "retainer")
        self.assertEqual(Membership.objects.get(user=self.staff, org=client_org).role, "support")
        # a team member who joins later gets access the next time they open the app
        late = get_user_model().objects.create_user("jr", password="test-pass-123", is_staff=True)
        Membership.objects.create(user=late, org=self.bmm, role="owner")
        other = self.client_class()
        other.login(username="jr", password="test-pass-123")
        other.get("/")
        self.assertTrue(Membership.objects.filter(user=late, org=client_org, role="support").exists())
        # switching it off removes the team, and never the client
        self.put("/api/org/settings/", {"supportAccess": False})
        self.assertEqual(list(Membership.objects.filter(org=client_org).values_list("role", flat=True)), ["owner"])
        self.assertEqual(other.post("/api/orgs/switch/", json.dumps({"id": client_org.id}), content_type="application/json").status_code, 403)
        # someone who leaves the team loses access everywhere
        self.put("/api/org/settings/", {"supportAccess": True})
        late.is_staff = False; late.save()
        other.get("/")
        self.assertFalse(Membership.objects.filter(user=late, role="support").exists())

    def test_workspace_can_be_renamed_and_old_settings_calls_still_work(self):
        self.client.post("/signup/", GOOD)
        self.assertEqual(self.put("/api/org/settings/", {"name": "Eastside Arts Collective"}).json()["name"], "Eastside Arts Collective")
        self.assertEqual(self.put("/api/org/settings/", {"name": "  "}).status_code, 400)
        r = self.put("/api/org/settings/", {"retainerHours": 28, "hourlyRate": 100}).json()   # what the Hours page sends
        self.assertEqual((r["retainerHours"], r["hourlyRate"], r["name"]), (28, 100, "Eastside Arts Collective"))
