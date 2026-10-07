# 9. Running MagicShow on your own virtual server

**Who this is for:** JR, putting the site on a virtual private server (DigitalOcean, Vultr, Linode,
Hetzner and the like) instead of Render.
**Time:** about 2 hours the first time.
**Written for:** Ubuntu 24.04. Other Linux versions work the same way with small differences.

> These steps follow the standard way to run a Django site and match how this project's settings
> work, but they have not been run on your particular server. Go one part at a time and check each
> "You should see" before moving on. Replace `magicshow.example.com` with your real address everywhere.

The pieces: **Postgres** holds the data. **Gunicorn** runs the Python code. **Nginx** faces the
internet, handles https, and passes requests to Gunicorn. **systemd** keeps Gunicorn running.
**cron** sends the reminder emails each morning.

## Part A: Prepare the server

Point your subdomain at the server first: at your domain company, add an **A record** for
`magicshow` with the server's IP address.

Log in to the server, then:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-venv python3-pip git nginx postgresql certbot python3-certbot-nginx
sudo adduser --system --group --home /srv/magicshow magicshow
```

That last line makes a user named `magicshow` that owns the site and can't log in. The site never
runs as root.

Turn on the firewall (web and SSH only):

```bash
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

## Part B: The database

```bash
sudo -u postgres psql
```

Inside, type these (pick your own password; no spaces or symbols like @ : / in it). The last line
lets `python manage.py test` make its own throwaway database:

```sql
CREATE USER magicshow WITH PASSWORD 'pick-a-long-password';
CREATE DATABASE magicshow OWNER magicshow;
ALTER USER magicshow CREATEDB;
\q
```

## Part C: The code

```bash
sudo -u magicshow -H bash
cd /srv/magicshow
git clone https://github.com/YOUR-ACCOUNT/YOUR-REPO.git app
cd app
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

No GitHub? Copy the `showday-prep` folder to `/srv/magicshow/app` with `scp` or SFTP instead, then
run the last two lines.

## Part D: The settings file

Still as the `magicshow` user, in `/srv/magicshow/app`:

```bash
cp .env.example .env
python3 -c "import secrets; print(secrets.token_urlsafe(50))"   # copy what it prints
nano .env
```

Set these lines (leave the rest as they are for now):

```
SECRET_KEY=paste-the-long-random-text
DEBUG=False
ALLOWED_HOSTS=magicshow.example.com
DATABASE_URL=postgres://magicshow:pick-a-long-password@localhost:5432/magicshow
SITE_URL=https://magicshow.example.com
SECURE_SSL=False
SIGNUP_CODE=pick-a-word
EMAIL_HOST=...            (your email service; see docs/06)
EMAIL_PORT=587
EMAIL_HOST_USER=...
EMAIL_HOST_PASSWORD=...
DEFAULT_FROM_EMAIL=MagicShow <no-reply@your-domain>
```

`SECURE_SSL` stays `False` until https works (Part G). Then lock the file so only the site can read it:

```bash
chmod 600 .env
```

**Moving from the old server?** Use the **same `SECRET_KEY`** as the old site, or the "Mark done"
links in emails already sent stop working.

## Part E: Build the database and the first login

```bash
.venv/bin/python manage.py migrate
.venv/bin/python manage.py collectstatic --no-input
.venv/bin/python manage.py createsuperuser
.venv/bin/python manage.py setup_org "Blackmagic Media" --user THE_USERNAME_YOU_JUST_MADE
.venv/bin/python manage.py test
exit
```

You should see `Ran 41 tests` and `OK`. `exit` returns you to your own user.

**Moving your existing data** from the old server (Postgres to Postgres): on the old server run
`pg_dump --no-owner --no-acl "$DATABASE_URL" > magicshow.sql`, copy the file over, and on the new
server, **before** the `migrate` line above, run
`psql "postgres://magicshow:pick-a-long-password@localhost:5432/magicshow" < magicshow.sql`.
Then run `migrate`, `collectstatic` and `test`, and skip `createsuperuser` and `setup_org` (your
logins came over with the data). Also copy the old server's `media/` folder (uploaded files) into `/srv/magicshow/app/media/`.

## Part F: Keep the site running (Gunicorn + systemd)

```bash
sudo nano /etc/systemd/system/magicshow.service
```

Paste:

```ini
[Unit]
Description=MagicShow (Gunicorn)
After=network.target postgresql.service

[Service]
User=magicshow
Group=magicshow
WorkingDirectory=/srv/magicshow/app
ExecStart=/srv/magicshow/app/.venv/bin/gunicorn showday.wsgi:application --bind 127.0.0.1:8001 --workers 3 --timeout 60
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now magicshow
sudo systemctl status magicshow --no-pager      # should say "active (running)"
curl -s http://127.0.0.1:8001/healthz            # should print: ok
```

If `curl` prints a "Bad Request" page instead of `ok`, that's fine at this point: it means the site is
running and only answers to your real address. If it isn't running, read the error with
`sudo journalctl -u magicshow -n 50 --no-pager`.

## Part G: Nginx and https

```bash
sudo nano /etc/nginx/sites-available/magicshow
```

Paste (with your address):

```nginx
server {
    listen 80;
    server_name magicshow.example.com;
    client_max_body_size 25m;            # uploads can be up to 20 MB

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/magicshow /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d magicshow.example.com
```

Certbot adds https and renews the certificate on its own. Open `https://magicshow.example.com` and
log in. Once that works, turn on the https-only protections:

```bash
sudo -u magicshow nano /srv/magicshow/app/.env      # change SECURE_SSL=False to SECURE_SSL=True
sudo systemctl restart magicshow
```

Log in again to confirm. (If the browser now says "too many redirects", the
`X-Forwarded-Proto` line is missing from the Nginx file.)

## Part H: The daily reminder emails

```bash
sudo crontab -u magicshow -e
```

Add this one line (8 AM server time; check the server's clock with `date`):

```
0 8 * * * cd /srv/magicshow/app && .venv/bin/python manage.py send_reminders >> /srv/magicshow/reminders.log 2>&1
```

Try it without sending anything:

```bash
sudo -u magicshow bash -c "cd /srv/magicshow/app && .venv/bin/python manage.py send_reminders --dry-run"
```

## Part I: Backups

Uploaded files live in `/srv/magicshow/app/media/` and the data lives in Postgres. Back up both.
A simple nightly database backup, kept for 14 days:

```bash
sudo -u magicshow mkdir -p /srv/magicshow/backups
sudo crontab -u magicshow -e
```

```
30 3 * * * pg_dump "postgres://magicshow:pick-a-long-password@localhost:5432/magicshow" | gzip > /srv/magicshow/backups/db-$(date +\%F).sql.gz && find /srv/magicshow/backups -name 'db-*.sql.gz' -mtime +14 -delete
```

Also turn on your host's own server backups or snapshots: a backup that lives on the same server
doesn't survive losing the server.

## Updating the site later

```bash
sudo -u magicshow -H bash -c "cd /srv/magicshow/app && git pull && .venv/bin/pip install -r requirements.txt && .venv/bin/python manage.py migrate && .venv/bin/python manage.py collectstatic --no-input"
sudo systemctl restart magicshow
```

## If something goes wrong

| Problem | Where to look |
|---|---|
| "502 Bad Gateway" | Gunicorn isn't running: `sudo journalctl -u magicshow -n 50 --no-pager` |
| "Bad Request (400)" | `ALLOWED_HOSTS` in `.env` doesn't match the address you typed. Fix it, then restart |
| The page has no styling | `collectstatic` didn't run. Run it, then restart |
| "CSRF verification failed" when logging in | `ALLOWED_HOSTS` must be the exact address, and the Nginx file needs the `X-Forwarded-Proto` line |
| Uploads fail with "413" | The `client_max_body_size` line is missing from the Nginx file |
| Emails don't arrive | The `EMAIL_...` settings. With them blank, emails print in `journalctl -u magicshow` instead |
| Changes to `.env` do nothing | Restart: `sudo systemctl restart magicshow` |
