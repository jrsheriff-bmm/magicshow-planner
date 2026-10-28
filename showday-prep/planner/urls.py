"""
planner/urls.py — the addresses this app answers, and which function handles each.
See api.py and views.py for what each one does.
"""
from django.urls import path

from django.contrib.auth import views as auth_views
from django.urls import reverse_lazy

from . import accounts, api, teams, testing, views

urlpatterns = [
    # Pages
    path("", views.app, name="app"),
    path("s/<str:token>/", views.share_page, name="share_page"),
    path("s/<str:token>/calendar.ics", views.calendar_feed, name="calendar_feed"),
    path("files/<str:file_id>/", views.download_file, name="download_file"),
    path("healthz", views.healthz, name="healthz"),
    # [v3] Pages opened from emails (no login)
    path("t/<str:token>/", views.task_page, name="task_page"),
    path("done/<str:code>/", views.done_action, name="done_action"),
    path("a/<str:token>/", views.approval_page, name="approval_page"),
    # [final] Accounts: sign up, change your password, reset a forgotten one.
    # (Log in and log out stay in showday/urls.py.)
    path("signup/", accounts.signup, name="signup"),
    path("account/password/", accounts.PasswordChange.as_view(), name="account_password"),
    path("password/reset/", accounts.PasswordReset.as_view(), name="password_reset"),
    path("password/reset/sent/", auth_views.PasswordResetDoneView.as_view(template_name="planner/auth/reset_sent.html"), name="password_reset_done"),
    path("password/reset/<uidb64>/<token>/", auth_views.PasswordResetConfirmView.as_view(
        template_name="planner/auth/reset_confirm.html", success_url=reverse_lazy("password_reset_complete")), name="password_reset_confirm"),
    path("password/reset/done/", auth_views.PasswordResetCompleteView.as_view(template_name="planner/auth/reset_complete.html"), name="password_reset_complete"),
    # JSON API used by the screens
    path("api/bootstrap/", api.bootstrap, name="api_bootstrap"),
    path("api/events/<str:event_id>/", api.event_detail, name="api_event"),
    path("api/events/<str:event_id>/share-links/", api.share_links, name="api_share_links"),
    path("api/people/<str:person_id>/", api.person_detail, name="api_person"),
    path("api/notes/<str:note_id>/", api.note_detail, name="api_note"),
    path("api/files/", api.upload_file, name="api_upload"),
    # [v3]
    path("api/templates/<str:template_id>/", api.template_detail, name="api_template"),
    path("api/events/<str:event_id>/approvals/", api.approval_create, name="api_approval_create"),
    path("api/approvals/<str:approval_id>/", api.approval_delete, name="api_approval_delete"),
    path("api/approvals/<str:approval_id>/decide/", api.approval_decide, name="api_approval_decide"),
    path("api/approvals/<str:approval_id>/resend/", api.approval_resend, name="api_approval_resend"),
    path("api/events/<str:event_id>/person-link/<str:contact_id>/", api.person_link, name="api_person_link"),
    path("api/reports/ai-summary/", api.portfolio_ai, name="api_portfolio_ai"),
    # [v4]
    path("api/orgs/", teams.org_create, name="api_org_create"),
    path("api/orgs/switch/", api.org_switch, name="api_org_switch"),
    path("api/org/settings/", api.org_settings, name="api_org_settings"),
    path("api/hours/<str:entry_id>/", api.hour_detail, name="api_hour"),
    # [final]
    path("api/account/", api.account, name="api_account"),
    # [beta] organizations, the testing program, group emails
    path("join/<str:code>/", teams.join_page, name="join_page"),
    path("api/orgs/search/", teams.org_search, name="api_org_search"),
    path("api/orgs/<int:org_id>/join/", teams.org_join, name="api_org_join"),
    path("api/org/team/", teams.team, name="api_team"),
    path("api/org/requests/<int:request_id>/", teams.request_decide, name="api_request_decide"),
    path("api/org/members/<int:user_id>/", teams.member, name="api_member"),
    path("api/org/invites/", teams.invite_create, name="api_invite_create"),
    path("api/org/invites/<str:code>/", teams.invite_revoke, name="api_invite_revoke"),
    path("api/telemetry/", testing.telemetry, name="api_telemetry"),
    path("api/testing/report/", testing.report, name="api_testing_report"),
    path("api/testing/feedback/<str:note_id>/", testing.feedback_done, name="api_feedback_done"),
    path("api/events/<str:event_id>/send-itinerary/", api.send_itinerary, name="api_send_itinerary"),
]
