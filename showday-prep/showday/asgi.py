"""
showday/asgi.py — an alternative entry point for newer async servers. Not used today.
"""
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "showday.settings")
application = get_asgi_application()
