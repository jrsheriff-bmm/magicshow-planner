"""
showday/urls.py — the site's "table of contents".

Each line maps a web address to the code that answers it. Most addresses live in
planner/urls.py; this file just plugs that list in, plus the admin and logins.
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import include, path

urlpatterns = [
    # Built-in admin screens (you log in with the superuser you create).
    path("admin/", admin.site.urls),
    # Log in, log out, and change your password.
    path("login/", auth_views.LoginView.as_view(), name="login"),
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("password/change/", auth_views.PasswordChangeView.as_view(), name="password_change"),
    path("password/change/done/", auth_views.PasswordChangeDoneView.as_view(), name="password_change_done"),
    # Everything else: the planner app.
    path("", include("planner.urls")),
]

# On your computer only, let Django hand out uploaded files directly.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
