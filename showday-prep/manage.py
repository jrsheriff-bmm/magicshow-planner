#!/usr/bin/env python
"""
manage.py — Django's command-line helper.

You run every Django command through this file, for example:
    python manage.py runserver        (start the site on your computer)
    python manage.py migrate          (create or update the database tables)
    python manage.py createsuperuser  (make an admin login)
    python manage.py test             (run the automatic checks)

You should never need to edit this file.
"""
import os
import sys


def main():
    # Tell Django where our settings live (showday/settings.py).
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "showday.settings")
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
