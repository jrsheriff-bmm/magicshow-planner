"""
showday/wsgi.py — the entry point web servers (like gunicorn on Render) use to run the site.
You should never need to edit this file.
"""
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "showday.settings")
application = get_wsgi_application()
