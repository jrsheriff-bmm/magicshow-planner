"""planner/apps.py — tells Django this folder is an app named "planner"."""
from django.apps import AppConfig


class PlannerConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "planner"
    verbose_name = "Event planner"

    def ready(self):
        # [final] Let people log in with their email address as well as a username.
        # This is switched on here (not in showday/settings.py) so updating the site
        # never means editing the settings file. See planner/auth.py.
        from django.conf import settings

        backend = "planner.auth.EmailBackend"
        if backend not in settings.AUTHENTICATION_BACKENDS:
            settings.AUTHENTICATION_BACKENDS = list(settings.AUTHENTICATION_BACKENDS) + [backend]
