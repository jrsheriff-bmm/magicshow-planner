"""
planner/models.py — the database tables.

Each class below becomes one table. Each line inside a class becomes one column.
If you change this file, run:
    python manage.py makemigrations
    python manage.py migrate
so the real database matches.

How the pieces fit together:

    Organization  (BMM, or later, each paying customer)
      ├── Membership  (which user logins belong to it)
      ├── Person      (the contacts directory, reused across events)
      ├── Note        (testing/feedback notes)
      ├── EventFile   (uploaded files: permits, insurance, floor plans)
      └── Event       (one show, e.g. "Mystic Music Ep. 4")
            ├── Milestone       (deadlines, stored as days before show day)
            ├── SetupItem       (load-in, sound check, briefings: fixed start/end times)
            ├── ProgramItem     (the show itself: lengths in minutes, in order)
            ├── EventContact    (who's working this event, and which share pages list them)
            ├── ComplianceItem  (permits and paperwork; files attach here)
            ├── EquipmentItem   (the equipment check)
            ├── LayoutPiece     (pieces in the "Build a layout" room)
            ├── LayoutPin       (pins on an uploaded floor plan)
            ├── BudgetLine      (costs and income; invoices attach here)       [v3]
            ├── Approval        (sign-off requests and answers)                [v3]
            ├── ShareLink       (private links for performers, vendors, etc.)
            └── TaskLink        (each person's private "My tasks" link)        [v3]
      OrgTemplate  (templates you saved from your own events)                   [v3]
      TimeEntry    (hours logged for this client, against the retainer)          [v4]
      ReminderLog  (which reminder emails went out, so none go twice)           [v3]

[final] Organization also records its plan (internal / subscription / retainer) and
whether the Blackmagic team has "support access" to help build its events.

A note on ids: the screens create their own short ids (like "k3j9x2ab") when you
add something, so ids here are text instead of numbers. That lets the screens and
the database agree on which row is which without an extra round trip.
"""
import secrets
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

# ---------------------------------------------------------------------------
# Choice lists. The first value is what's stored; the second is what people see.
# ---------------------------------------------------------------------------
AUDIENCES = ["Internal", "Performers", "Vendors", "Venue", "Security"]
MILESTONE_STATUS = [("todo", "Not started"), ("doing", "In progress"), ("done", "Done")]
COMPLIANCE_STATUS = [("needed", "Needed"), ("submitted", "Submitted"), ("approved", "Approved")]
EQUIPMENT_STATUS = [("needed", "Needed"), ("secured", "Secured"), ("packed", "Packed"), ("loaded", "Loaded in"), ("returned", "Returned")]
TRACKS = ["Production", "Food & bar", "Doors & security", "Program & talent"]
COST_STATUS = [("estimated", "Estimated"), ("committed", "Committed"), ("invoiced", "Invoiced"), ("paid", "Paid")]
INCOME_STATUS = [("expected", "Expected"), ("confirmed", "Confirmed"), ("received", "Received")]
APPROVAL_STATUS = [("pending", "Awaiting approval"), ("approved", "Approved"), ("declined", "Declined")]
EVENT_KINDS = [("organizer", "Organizer"), ("venue", "Venue")]
PLANS = [("internal", "Internal (Blackmagic)"), ("subscription", "Subscription"), ("retainer", "Retainer client")]
# "support" = a Blackmagic team member let into a client's workspace. Works like an owner,
# but is added and removed automatically by the workspace's "support access" switch.
ROLES = [("owner", "Owner"), ("member", "Member"), ("support", "Blackmagic support")]
MANAGER_ROLES = ("owner", "support")


def short_id():
    """A short random id, the same style the screens use."""
    return secrets.token_hex(4)


def file_id():
    """A long random id for uploaded files, so file addresses can't be guessed."""
    return uuid.uuid4().hex


def share_token():
    """A long random token for private share links."""
    return secrets.token_urlsafe(24)


class Organization(models.Model):
    """A business using the site. Today that's just BMM; later, each subscriber."""
    name = models.CharField(max_length=200)
    kind = models.CharField(max_length=20, choices=EVENT_KINDS, default="organizer")
    created_at = models.DateTimeField(auto_now_add=True)
    # [v4] For client workspaces: the monthly retainer, used by the Hours page.
    retainer_hours = models.DecimalField("hours included per month", max_digits=6, decimal_places=2, null=True, blank=True)
    hourly_rate = models.DecimalField("hourly rate ($)", max_digits=8, decimal_places=2, null=True, blank=True)
    # [final] How this account pays, and whether the Blackmagic team may come in to help.
    #   internal     = Blackmagic's own workspaces (everything that existed before sign-up was added)
    #   subscription = someone who signed up on their own
    #   retainer     = a consulting client; normally has "support access" switched on
    plan = models.CharField(max_length=20, choices=PLANS, default="internal")
    support_access = models.BooleanField(
        "Blackmagic team can open this workspace", default=False,
        help_text="When ticked, every login with Staff status can open this workspace and help build its events.")

    def __str__(self):
        return self.name


class Membership(models.Model):
    """Connects a user login to an organization. Everything a user sees is limited to their organization."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships")
    org = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=20, choices=ROLES, default="member")

    class Meta:
        unique_together = [("user", "org")]

    def __str__(self):
        return f"{self.user} in {self.org}"


class Person(models.Model):
    """The contacts directory: everyone you work with, stored once."""
    id = models.CharField(primary_key=True, max_length=40, default=short_id)
    org = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="people")
    name = models.CharField(max_length=200, blank=True)
    org_name = models.CharField("organization", max_length=200, blank=True)
    role = models.CharField("usual role", max_length=200, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    invoice_url = models.URLField("invoice / quote link", max_length=500, blank=True)
    notes = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "org_name"]
        verbose_name_plural = "people"

    def __str__(self):
        return self.name or self.org_name or "(unnamed)"


class Event(models.Model):
    """One show. The "event facts" from the Overview tab live here."""
    id = models.CharField(primary_key=True, max_length=40, default=short_id)
    org = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="events")
    kind = models.CharField(max_length=20, choices=EVENT_KINDS, default="organizer")
    name = models.CharField(max_length=200)
    series = models.CharField(max_length=200, blank=True)
    date = models.DateField(null=True, blank=True)
    venue = models.CharField(max_length=200, blank=True)
    address = models.CharField(max_length=300, blank=True)
    host = models.CharField("host / MC", max_length=200, blank=True)
    doors = models.TimeField(null=True, blank=True)
    end = models.TimeField(null=True, blank=True)
    price_adv = models.DecimalField("advance ticket ($)", max_digits=8, decimal_places=2, null=True, blank=True)
    price_door = models.DecimalField("door ticket ($)", max_digits=8, decimal_places=2, null=True, blank=True)
    capacity = models.PositiveIntegerField(null=True, blank=True)
    target = models.PositiveIntegerField("target headcount", null=True, blank=True)
    about = models.TextField("short description", blank=True)
    house_rules = models.JSONField(default=list, blank=True)   # venue version only: a list of sentences
    program_start = models.TimeField("first cue", null=True, blank=True)
    ai_summary = models.TextField(blank=True)
    budget_total = models.DecimalField("budget ($)", max_digits=12, decimal_places=2, null=True, blank=True)  # [v3]
    wrapup = models.JSONField(default=dict, blank=True)  # [v3] attendance, rating, lessons, vendor ratings
    # Layout: room size for "Build a layout", and the uploaded floor plan image.
    room_width = models.FloatField(default=60)
    room_depth = models.FloatField(default=80)
    floor_plan = models.ForeignKey("EventFile", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["date", "name"]

    def __str__(self):
        return f"{self.name} ({self.date})"


class EventChild(models.Model):
    """Shared columns for everything that belongs to one event. Not a table on its own."""
    id = models.CharField(primary_key=True, max_length=40, default=short_id)
    position = models.PositiveIntegerField(default=0)  # keeps the order you see on screen

    class Meta:
        abstract = True
        ordering = ["position"]


class Milestone(EventChild):
    """A deadline. Stored as days before show day, so moving the show date moves every deadline."""
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="milestones")
    title = models.CharField(max_length=500)
    desc = models.TextField("description", blank=True)
    offset = models.IntegerField(default=-14, help_text="Days from show day. -30 means 30 days before.")
    phase = models.CharField(max_length=100, blank=True)
    owner = models.CharField(max_length=200, blank=True)
    hard = models.BooleanField("hard deadline", default=False)
    status = models.CharField(max_length=20, choices=MILESTONE_STATUS, default="todo")
    checklist = models.JSONField(default=list, blank=True)   # [{"id":..., "text":..., "done": true/false}]
    owner_ref = models.CharField("owner's contact id", max_length=40, blank=True)  # [v3] who gets the reminder
    done_at = models.DateField("completed on", null=True, blank=True)             # [v3] for "ran late" reports

    def __str__(self):
        return self.title


class SetupItem(EventChild):
    """Something on show day with a fixed start and end: load-in, sound check, briefings."""
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="setup_items")
    title = models.CharField(max_length=500)
    start = models.TimeField(null=True, blank=True)
    end = models.TimeField(null=True, blank=True)
    track = models.CharField(max_length=50, default="Production")
    audiences = models.JSONField(default=list, blank=True)   # which share pages show it
    notes = models.TextField(blank=True)

    def __str__(self):
        return self.title


class ProgramItem(EventChild):
    """A segment of the show. Only the length is stored; start times are calculated in order."""
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="program_items")
    title = models.CharField(max_length=500)
    who = models.CharField(max_length=200, blank=True)
    dur = models.PositiveIntegerField("length (minutes)", default=15)
    audiences = models.JSONField(default=list, blank=True)
    notes = models.TextField(blank=True)

    def __str__(self):
        return self.title


class EventContact(EventChild):
    """A person working this event. May link back to the contacts directory (Person)."""
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="contacts")
    person = models.ForeignKey(Person, null=True, blank=True, on_delete=models.SET_NULL, related_name="event_roles")
    role = models.CharField(max_length=200, blank=True)
    name = models.CharField(max_length=200, blank=True)
    org_name = models.CharField("organization", max_length=200, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    email = models.CharField(max_length=254, blank=True)
    audiences = models.JSONField(default=list, blank=True)
    show_phone = models.BooleanField("phone visible on share pages", default=False)
    invoice_url = models.CharField("invoice / quote link", max_length=500, blank=True)
    remind = models.BooleanField("email reminders", default=True)                     # [v3]
    team = models.BooleanField("planning team (payments + Monday summary)", default=False)  # [v3]

    def __str__(self):
        return self.name or self.role


class ComplianceItem(EventChild):
    """A permit, license, insurance certificate, waiver or contract."""
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="compliance_items")
    item = models.CharField(max_length=500)
    owner = models.CharField("responsible", max_length=200, blank=True)
    offset = models.IntegerField(default=-21)
    status = models.CharField(max_length=20, choices=COMPLIANCE_STATUS, default="needed")
    expires = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    owner_ref = models.CharField("owner's contact id", max_length=40, blank=True)  # [v3]

    def __str__(self):
        return self.item


class EquipmentItem(EventChild):
    """One line of the equipment check."""
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="equipment")
    item = models.CharField(max_length=300)
    cat = models.CharField("category", max_length=100, default="Supplies")
    qty = models.PositiveIntegerField(default=1)
    source = models.CharField(max_length=50, default="Owned")
    owner = models.CharField("responsible", max_length=200, blank=True)
    status = models.CharField(max_length=20, choices=EQUIPMENT_STATUS, default="needed")
    notes = models.TextField(blank=True)
    owner_ref = models.CharField("owner's contact id", max_length=40, blank=True)  # [v3]

    def __str__(self):
        return self.item


class BudgetLine(EventChild):
    """[v3] One line of the Budget tab: a cost (money out) or income (money in). Invoices attach here."""
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="budget_lines")
    kind = models.CharField(max_length=10, choices=[("cost", "Cost"), ("income", "Income")], default="cost")
    cat = models.CharField("category", max_length=100, default="Other")
    item = models.CharField(max_length=300, blank=True)
    payee = models.CharField("paid to", max_length=200, blank=True)
    payee_ref = models.CharField("payee's contact id", max_length=40, blank=True)
    est = models.DecimalField("estimated", max_digits=12, decimal_places=2, null=True, blank=True)
    actual = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    paid = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    due = models.DateField("payment due", null=True, blank=True)
    status = models.CharField(max_length=20, default="estimated")  # COST_STATUS or INCOME_STATUS
    notes = models.TextField(blank=True)

    def __str__(self):
        return self.item or self.cat


class LayoutPiece(EventChild):
    """A piece in the to-scale room (stage module, table, bar...). Sizes and positions are in feet."""
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="layout_pieces")
    kind = models.CharField(max_length=30)
    label = models.CharField(max_length=200, blank=True)
    x = models.FloatField(default=0)
    y = models.FloatField(default=0)
    w = models.FloatField(default=6)
    h = models.FloatField(default=4)
    rot = models.PositiveIntegerField(default=0)


class LayoutPin(EventChild):
    """A pin on the uploaded floor plan. x and y are percentages of the image (0–100)."""
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="layout_pins")
    label = models.CharField(max_length=200, blank=True)
    kind = models.CharField(max_length=50, default="Other")
    x = models.FloatField(default=50)
    y = models.FloatField(default=50)
    contact_id = models.CharField(max_length=40, blank=True)  # an EventContact id, if linked
    notes = models.TextField(blank=True)


def upload_path(instance, filename):
    """Uploaded files go in folders by organization, with a random name so nothing collides."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    return f"org-{instance.org_id}/{instance.id}.{ext}"


class EventFile(models.Model):
    """An uploaded file: a permit PDF, an insurance certificate, a floor plan image."""
    id = models.CharField(primary_key=True, max_length=40, default=file_id)
    org = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="files")
    compliance_item = models.ForeignKey(ComplianceItem, null=True, blank=True, on_delete=models.SET_NULL, related_name="files")
    budget_line = models.ForeignKey(BudgetLine, null=True, blank=True, on_delete=models.SET_NULL, related_name="files")  # [v3]
    file = models.FileField(upload_to=upload_path)
    name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100, blank=True)
    size = models.PositiveIntegerField(default=0)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class ShareLink(models.Model):
    """
    A private link for one audience of one event (e.g. the Vendors page for Ep. 4).
    Anyone with the link can see that page, with no login, so the token is long and random.
    audience "Deadlines" is the internal calendar feed of every deadline.
    """
    token = models.CharField(max_length=64, unique=True, default=share_token)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="share_links")
    audience = models.CharField(max_length=30)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("event", "audience")]

    def __str__(self):
        return f"{self.event.name} · {self.audience}"


class Note(models.Model):
    """Testing and feedback notes from the Notes button. Records which screen you were on."""
    id = models.CharField(primary_key=True, max_length=40, default=short_id)
    org = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="notes")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    text = models.TextField()
    where = models.CharField(max_length=300, blank=True)
    event_id_ref = models.CharField("event id", max_length=40, blank=True)
    done = models.BooleanField("handled", default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.text[:60]


# ---------------------------------------------------------------------------
# New in v3
# ---------------------------------------------------------------------------


class Approval(models.Model):
    """
    A sign-off request: "Please approve the venue rental ($400)".
    The approver gets an email with a private link (token) to Approve or Decline, no login needed.
    target_type/target_id say what it's about: the whole event, a budget line, or a paperwork item.
    """
    id = models.CharField(primary_key=True, max_length=40, default=short_id)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="approvals")
    target_type = models.CharField(max_length=20, default="event")  # event | budget | compliance
    target_id = models.CharField(max_length=40, blank=True)
    label = models.CharField("what needs approval", max_length=300)
    approver = models.CharField("approver's name", max_length=200)
    approver_email = models.EmailField(blank=True)
    note = models.TextField("note to the approver", blank=True)
    status = models.CharField(max_length=20, choices=APPROVAL_STATUS, default="pending")
    comment = models.TextField(blank=True)
    decided_by = models.CharField(max_length=200, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    requested_at = models.DateTimeField(default=timezone.now)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    requested_by_name = models.CharField(max_length=200, blank=True)
    token = models.CharField(max_length=64, unique=True, default=share_token)

    class Meta:
        ordering = ["requested_at"]

    def __str__(self):
        return f"{self.label} ({self.get_status_display()})"


class TaskLink(models.Model):
    """Each person's private "My tasks" page for one event: /t/<token>/. They can mark things done there."""
    token = models.CharField(max_length=64, unique=True, default=share_token)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="task_links")
    contact_ref = models.CharField("contact id", max_length=40)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("event", "contact_ref")]


class OrgTemplate(models.Model):
    """A template someone saved from an event ("Save as template"). data is the event without dates or statuses."""
    id = models.CharField(primary_key=True, max_length=40, default=short_id)
    org = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="templates")
    name = models.CharField(max_length=200)
    desc = models.CharField("description", max_length=500, blank=True)
    data = models.JSONField(default=dict)
    from_event = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class ReminderLog(models.Model):
    """One row per reminder email sent. Stops the daily job from emailing anyone twice on the same day."""
    org = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="reminder_logs")
    email = models.EmailField()
    day = models.DateField()
    items = models.PositiveIntegerField(default=0)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("org", "email", "day")]
        ordering = ["-day"]

    def __str__(self):
        return f"{self.email} on {self.day}"


class TimeEntry(models.Model):
    """[v4] Time spent for one client (workspace): the Hours page. event_ref is an event id, or blank for general work."""
    CATS = ["Capture", "Teach", "Plan", "Meetings", "Admin"]
    id = models.CharField(primary_key=True, max_length=40, default=short_id)
    org = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="time_entries")
    date = models.DateField()
    hours = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    cat = models.CharField("kind of work", max_length=20, default="Capture")
    event_ref = models.CharField("event id", max_length=40, blank=True)
    note = models.CharField("what you did", max_length=500, blank=True)
    who = models.CharField(max_length=200, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]
        verbose_name_plural = "time entries"

    def __str__(self):
        return f"{self.date} · {self.hours} h · {self.cat}"
