#!/usr/bin/env bash
# build.sh — what Render runs every time you push new code to GitHub.
# It installs packages, gathers the CSS/JS files, and updates the database tables.
set -o errexit   # stop right away if any step fails

pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate
