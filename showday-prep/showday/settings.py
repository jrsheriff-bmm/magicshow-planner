"""
showday/settings.py — the control panel for the whole site.

Almost everything here reads from "environment variables" (the .env file on your
computer, or the Environment tab on Render). That way the same code runs on your
laptop and online without editing this file. See .env.example for every setting.
"""
import os
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv

# BASE_DIR is the project folder (the one that contains manage.py).
BASE_DIR = Path(__file__).resolve().parent.parent

# Read the .env file if there is one (on your computer). Online, Render supplies these.
load_dotenv(BASE_DIR / ".env")


def env_bool(name, default=False):
    """Turn text like 'True' or 'false' from the .env file into a real True/False."""
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


# ---------------------------------------------------------------------------
# Security basics
# ---------------------------------------------------------------------------
SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-not-secret-change-me")
DEBUG = env_bool("DEBUG", False)
ALLOWED_HOSTS = [h.strip() for h in os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h.strip()]

# Render tells us our own web address; allow it automatically.
RENDER_HOST = os.environ.get("RENDER_EXTERNAL_HOSTNAME")
if RENDER_HOST:
    ALLOWED_HOSTS.append(RENDER_HOST)

# Django refuses form posts from addresses it doesn't know. List our https addresses here.
CSRF_TRUSTED_ORIGINS = [f"https://{h}" for h in ALLOWED_HOSTS if h not in ("localhost", "127.0.0.1")]

# Online-only protections: always use https and secure cookies.
# Render sets RENDER=true automatically, so these switch on only when the site is live.
if not DEBUG and env_bool("SECURE_SSL", bool(os.environ.get("RENDER"))):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
    SECURE_CONTENT_TYPE_NOSNIFF = True

# ---------------------------------------------------------------------------
# Which pieces make up the site
# ---------------------------------------------------------------------------
INSTALLED_APPS = [
    "django.contrib.admin",        # the built-in admin screens at /admin/
    "django.contrib.auth",         # user accounts and logins
    "django.contrib.contenttypes",
    "django.contrib.sessions",     # remembers who is logged in
    "django.contrib.messages",
    "django.contrib.staticfiles",  # CSS and JavaScript files
    "planner",                     # OUR app: events, deadlines, equipment, etc.
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",  # serves CSS/JS online
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",   # blocks forged form posts
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "showday.urls"
WSGI_APPLICATION = "showday.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,  # look for templates inside each app's templates/ folder
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ---------------------------------------------------------------------------
# Database
# On your computer: a single file, db.sqlite3 (nothing to install).
# Online: Postgres, whose address Render puts in DATABASE_URL.
# ---------------------------------------------------------------------------
DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
    )
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# Logins
# ---------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
LOGIN_URL = "login"
LOGIN_REDIRECT_URL = "app"
LOGOUT_REDIRECT_URL = "login"

# ---------------------------------------------------------------------------
# Language and time
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "America/Detroit"   # Kalamazoo time. Change if the business moves.
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# CSS, JavaScript and uploaded files
# ---------------------------------------------------------------------------
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"  # where "collectstatic" gathers files for going online
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
if DEBUG:
    # On your computer, skip the compression step so edits show up right away.
    STORAGES["staticfiles"] = {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"          # uploaded files on your computer
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
MAX_UPLOAD_BYTES = 20 * 1024 * 1024      # 20 MB per file

# Optional: keep uploads in Cloudflare R2 or Amazon S3 (recommended online, because
# Render's own disk is wiped on every deploy unless you pay for a disk).
if env_bool("USE_S3", False):
    STORAGES["default"] = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "access_key": os.environ.get("AWS_ACCESS_KEY_ID"),
            "secret_key": os.environ.get("AWS_SECRET_ACCESS_KEY"),
            "bucket_name": os.environ.get("AWS_STORAGE_BUCKET_NAME"),
            "endpoint_url": os.environ.get("AWS_S3_ENDPOINT_URL") or None,
            "default_acl": None,
            "querystring_auth": True,   # files are private; links expire
            "file_overwrite": False,
        },
    }

# ---------------------------------------------------------------------------
# Email (reminders). With no EMAIL_HOST, emails print in the terminal instead.
# ---------------------------------------------------------------------------
if os.environ.get("EMAIL_HOST"):
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
    EMAIL_HOST = os.environ["EMAIL_HOST"]
    EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
    EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
    EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
    EMAIL_USE_TLS = True
else:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "Showday Prep <no-reply@example.com>")

# ---------------------------------------------------------------------------
# AI meeting summaries (Claude API). Blank key = the AI button is hidden.
# ---------------------------------------------------------------------------
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-5")

# Print errors to the Render log so you can see what went wrong online.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
