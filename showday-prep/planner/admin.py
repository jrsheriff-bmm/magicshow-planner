"""
planner/admin.py — the built-in admin screens at /admin/.

The admin is a plain, spreadsheet-like back office. It's handy for:
  • adding user logins and connecting them to BMM (Organization → Memberships)
  • fixing a record by hand
  • seeing exactly what's stored in the database

Day-to-day planning should happen in the main screens, not here.
"""
from django.contrib import admin

from . import models


class MembershipInline(admin.TabularInline):
    model = models.Membership
    extra = 1


@admin.register(models.Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ["name", "plan", "support_access", "kind", "retainer_hours", "hourly_rate", "created_at"]
    list_filter = ["plan", "support_access"]
    search_fields = ["name"]
    inlines = [MembershipInline]

    def save_related(self, request, form, formsets, change):
        # [final] Ticking or unticking "Blackmagic team can open this workspace" adds or
        # removes the team's access right away.
        super().save_related(request, form, formsets, change)
        from .access import apply_support
        apply_support(form.instance)


class MilestoneInline(admin.TabularInline):
    model = models.Milestone
    extra = 0
    fields = ["position", "title", "offset", "phase", "owner", "hard", "status"]


class SetupInline(admin.TabularInline):
    model = models.SetupItem
    extra = 0
    fields = ["position", "title", "start", "end", "track", "audiences"]


class ProgramInline(admin.TabularInline):
    model = models.ProgramItem
    extra = 0
    fields = ["position", "title", "who", "dur", "audiences"]


class ContactInline(admin.TabularInline):
    model = models.EventContact
    extra = 0
    fields = ["position", "role", "name", "org_name", "phone", "email", "audiences", "show_phone", "remind", "team"]


class ComplianceInline(admin.TabularInline):
    model = models.ComplianceItem
    extra = 0
    fields = ["position", "item", "owner", "offset", "status", "expires"]


class EquipmentInline(admin.TabularInline):
    model = models.EquipmentItem
    extra = 0
    fields = ["position", "item", "cat", "qty", "source", "owner", "status"]


class BudgetInline(admin.TabularInline):  # [v3]
    model = models.BudgetLine
    extra = 0
    fields = ["position", "kind", "cat", "item", "payee", "est", "actual", "paid", "due", "status"]


class ApprovalInline(admin.TabularInline):  # [v3]
    model = models.Approval
    extra = 0
    fields = ["label", "approver", "approver_email", "status", "decided_by", "decided_at", "comment"]
    readonly_fields = ["decided_at"]


@admin.register(models.Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ["name", "date", "venue", "org", "kind", "updated_at"]
    list_filter = ["org", "kind"]
    search_fields = ["name", "venue", "series"]
    inlines = [MilestoneInline, SetupInline, ProgramInline, ContactInline, ComplianceInline, EquipmentInline, BudgetInline, ApprovalInline]


@admin.register(models.Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = ["name", "org_name", "role", "phone", "email", "org"]
    list_filter = ["org"]
    search_fields = ["name", "org_name", "role", "email"]


@admin.register(models.EventFile)
class EventFileAdmin(admin.ModelAdmin):
    list_display = ["name", "content_type", "size", "org", "compliance_item", "uploaded_at"]
    list_filter = ["org"]


@admin.register(models.ShareLink)
class ShareLinkAdmin(admin.ModelAdmin):
    list_display = ["event", "audience", "token", "created_at"]
    list_filter = ["audience"]


@admin.register(models.Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ["text", "where", "done", "author", "created_at"]
    list_filter = ["done", "org"]


# [v3]
@admin.register(models.OrgTemplate)
class OrgTemplateAdmin(admin.ModelAdmin):
    list_display = ["name", "org", "from_event", "updated_at"]
    list_filter = ["org"]


@admin.register(models.Approval)
class ApprovalAdmin(admin.ModelAdmin):
    list_display = ["label", "event", "approver", "status", "requested_at", "decided_at"]
    list_filter = ["status"]
    exclude = ["token"]


@admin.register(models.ReminderLog)
class ReminderLogAdmin(admin.ModelAdmin):
    list_display = ["day", "email", "items", "org", "sent_at"]
    list_filter = ["org", "day"]


# [v4]
@admin.register(models.TimeEntry)
class TimeEntryAdmin(admin.ModelAdmin):
    list_display = ["date", "hours", "cat", "note", "who", "org"]
    list_filter = ["org", "cat"]
    date_hierarchy = "date"
