# 6. Updating the live site from v2 to v3

**Who this is for:** JR, updating the site that's already running.
**Time:** about 30 minutes, plus 10 minutes to set up the daily reminder job.
**What you'll type:** copy files, then run a few commands. You won't write or edit any code.

The update adds the Budget tab, reminder emails, approvals, reports, wrap-up and your own
templates. It's built so you **replace whole files and add new ones**. You don't edit
anything by hand, and these files are **not touched**:

`showday/settings.py` · `showday/urls.py` · `requirements.txt` · `render.yaml` · `build.sh` · `.env`

No new Python packages. Your events, people, notes and files stay exactly as they are.
The database gets new columns and tables; nothing existing is removed.

---

## What's in the update folder

```
showday-prep-v3-update/
├── check_before_copying.py      ← run first (step 2). Only reads, never changes anything
├── CHANGED-FILES.txt            the full list below, for reference
└── showday-prep/                ← copy the CONTENTS of this folder over your project (step 3)
    ├── planner/  …               (22 replaced files, 19 new files)
    └── docs/, README.md, .env.example
```

**Replaced** (same name, new version):

| File | What changed |
|---|---|
| `planner/models.py` | New tables: budget lines, approvals, templates, "My tasks" links, reminder log. New columns: budget total, wrap-up, "completed on" date, reminder settings |
| `planner/serializers.py` | Saves and loads the new fields |
| `planner/api.py` | New addresses for templates, approvals, "My tasks" links, the Reports AI summary |
| `planner/views.py` | Three new pages opened from emails: My tasks, Mark done, Approve |
| `planner/urls.py` | The addresses for those pages and the new API |
| `planner/ai.py` | The AI now knows the budget and approvals; new status summary across events |
| `planner/checks.py` | Budget checks (over budget, late payments) |
| `planner/admin.py` | The new tables show up in /admin/ |
| `planner/tests.py` | One reminder test updated to the new rules |
| `planner/management/commands/send_reminders.py` | Rewritten: emails each owner, not just the logins |
| `planner/templates/planner/app.html` | Loads the new screen files |
| `planner/static/planner/css/app.css` | Styles for the new screens |
| `planner/static/planner/js/helpers.js`, `templates.js`, `core.js`, `views.js`, `actions.js` | The screens, updated |
| `README.md`, `docs/02…`, `docs/04…`, `docs/05…`, `.env.example` | Guides updated |

**New** (didn't exist before):

| File | What it is |
|---|---|
| `planner/migrations/0002_v3_budget_reminders_approvals.py` | The database change. Django applies it with `migrate` |
| `planner/budget.py`, `reminders.py`, `emails.py` | Budget math, reminder rules, email sending |
| `planner/tests_v3.py` | 13 new automatic tests |
| `planner/templates/planner/email.html`, `public_base.html`, `task_page.html`, `done_page.html`, `approval_page.html` | The email layout and the three pages opened from emails |
| `planner/static/planner/js/store-django.js`, `budget.js`, `approvals.js`, `reminders.js`, `wrapup.js`, `reports.js`, `library.js`, `boot.js` | The new screen files |
| `docs/06-update-to-v3.md` | This guide |

---

## Step 1. Back up (5 minutes)

Do this every time you update. It's your undo button.

1. **The database.**
   - On Render: open your database → **Recovery** (or **Backups**) → make a manual backup / export.
   - On your own server with Postgres: `pg_dump "$DATABASE_URL" > backup-before-v3.sql`
   - With SQLite: copy `db.sqlite3` somewhere safe.
2. **The code.** In your project folder, make sure everything is committed, then make a branch:

   ```bash
   git status                 # should say "nothing to commit"
   git checkout -b v3
   ```

## Step 2. Run the safety check (1 minute)

Unzip `showday-prep-v3-update.zip` **next to** your project folder (not inside it), so you have:

```
Projects/
├── showday-prep/              ← your project
└── showday-prep-v3-update/    ← the update
```

Open a terminal **in your project folder** and run:

```bash
python ../showday-prep-v3-update/check_before_copying.py
```

- **"All clear"** → go to step 3.
- **"STOP. These code files were changed since v2"** → someone edited a file that v3 replaces.
  Don't copy yet. Send those files to Claude with: *"We changed these after v2. Merge our
  changes into the v3 versions."* You'll get merged files back to copy in instead.
- **"STOP. You have database changes of your own"** → see *If you made your own database change* at the bottom.

## Step 3. Copy the files in (2 minutes)

Copy **everything inside** `showday-prep-v3-update/showday-prep/` into your `showday-prep/` folder.
When your computer asks, choose **Replace** for every file.

- **Windows:** open `showday-prep-v3-update\showday-prep`, press Ctrl+A, Ctrl+C, open your
  `showday-prep` folder, press Ctrl+V, then **Replace the files in the destination**.
- **Mac:** use Terminal instead of Finder (Finder can replace whole folders):

  ```bash
  cp -R ../showday-prep-v3-update/showday-prep/. .
  ```

Check it worked: `git status` should list the files from the tables above as modified or new.

## Step 4. Test on your computer (10 minutes)

```bash
source .venv/bin/activate          # Windows: .venv\Scripts\activate
python manage.py migrate
python manage.py test
python manage.py runserver
```

- `migrate` should say `Applying planner.0002_v3_budget_reminders_approvals... OK`.
- `test` should end with **`Ran 24 tests … OK`**. If anything fails, stop and send the output to Claude.
- Open http://127.0.0.1:8000 and click through:
  1. Open an event. You should see new tabs: **Budget**, **Calendar & reminders**, **Wrap-up**.
  2. Budget → type a budget, add a cost with an amount. Refresh the page. It's still there.
  3. People → the **Email reminders** column has "Their tasks" and "Team" boxes.
  4. Calendar & reminders → scroll down to **Reminder emails** (the preview).
  5. Left menu → **Reports** and **Templates** open.
  6. Top of an event → **Save as template**, then Templates shows it.

  If the new tabs don't show up, your browser kept the old files: press Ctrl+Shift+R (Cmd+Shift+R on Mac).

Preview what the reminder emails would say (nothing is sent):

```bash
python manage.py send_reminders --dry-run
python manage.py send_reminders --dry-run --date 2026-11-07     # pretend it's a different day
```

## Step 5. Put it online (5 minutes)

```bash
git add .
git commit -m "Update to v3: budget, reminders, approvals, reports, templates"
git push -u origin v3
```

Then merge `v3` into your main branch the way you normally do (on GitHub: **Compare & pull request** → **Merge**).

- **On Render:** the push to main starts a deploy. `build.sh` already runs `collectstatic` and `migrate`, so there's nothing else to run. Watch the deploy log for `Applying planner.0002… OK`.
- **On your own server:** pull the code, then run:

  ```bash
  python manage.py migrate
  python manage.py collectstatic --no-input
  ```

  and restart the site the way you normally do (for example `sudo systemctl restart showday`).

## Step 6. Add one setting: SITE_URL (2 minutes)

Emails contain links ("Mark done", "Approve"). The site needs to know its own address to build them.
Add this environment variable with **your real address**, no slash at the end:

```
SITE_URL=https://prep.blackmagicmedia.com
```

(Use whatever the subdomain actually is.) On Render: the web service → **Environment** → **Add Environment Variable**.
On your own server: add it wherever `SECRET_KEY` and the other settings live (the `.env` file or the service config), then restart.

While you're there, check:

- `ALLOWED_HOSTS` includes the subdomain (for example `prep.blackmagicmedia.com`).
- The email settings from guide 3, Part F are filled in (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL`). Without them, emails print to the server log instead of sending.
- **Don't change `SECRET_KEY`.** The "Mark done" links are signed with it; a new key makes links in old emails stop working.

Approval emails send right away when someone clicks **Request**. Reminder emails need step 7.

## Step 7. Schedule the daily reminder job (10 minutes)

The reminders go out when this command runs. Run it **once a day**, in the morning:

```bash
python manage.py send_reminders
```

It's safe to run twice: it remembers who it emailed today and won't email them again.

**On Render:** New → **Cron Job** → same GitHub repository.

| Setting | Value |
|---|---|
| Build command | `pip install -r requirements.txt` |
| Command | `python manage.py send_reminders` |
| Schedule | `0 12 * * *` (12:00 UTC = 8 AM in Michigan in summer, 7 AM in winter) |
| Environment | the **same** variables as the web service: `DATABASE_URL`, `SECRET_KEY`, `SITE_URL` and all the `EMAIL_…` ones. Easiest: put them in an **Environment Group** and link it to both |

If you already made a cron job for v2's reminders, just check its environment has `SITE_URL`; the command name didn't change.

**On your own Linux server:** run `crontab -e` and add one line (change the paths to yours):

```
0 8 * * * cd /srv/showday-prep && /srv/showday-prep/.venv/bin/python manage.py send_reminders >> /var/log/showday-reminders.log 2>&1
```

The job needs the same environment variables as the site. If they're in `.env` in the project folder, they're picked up automatically.

## Step 8. Turn reminders on for your people (in the app, 10 minutes)

Reminders go to the person named as **Owner**, and only if the app can find their email:

1. **People tab:** give each person an email. Tick **Team** for the planning team
   (they get payment reminders and the Monday summary). Existing events already have the event lead ticked.
2. **Deadlines and Paperwork:** type owners exactly as they appear in People (the box suggests names).
   A ✉ next to the owner means they'll get reminders; a crossed-out ✉ means they won't, and hovering says why.
3. **Calendar & reminders tab → Reminder emails:** the preview lists who gets what over the next 14 days,
   and who **won't** get reminders and why.

---

## If something goes wrong

**The site won't start, or pages error after the update.** Roll back the code:

```bash
git revert HEAD      # or on Render: Deploys → pick the last v2 deploy → Rollback
```

The new database columns don't bother v2, so you don't need to undo the database.
Then send Claude the error from the deploy log or terminal.

**"No such table" or "no such column" errors.** `migrate` didn't run. Run `python manage.py migrate` on the server (on Render: Shell tab).

**Emails aren't arriving.** Run `python manage.py send_reminders --dry-run` on the server. If it lists emails, the rules are fine and the problem is the email settings (step 6). If it lists none, check step 8: owners need emails in People.

**"Set SITE_URL" error from the cron job.** The cron job's environment is missing `SITE_URL` (step 6).

## If you made your own database change

`check_before_copying.py` stops you if `planner/migrations/` has a file other than `0001_initial.py`
(for example if you practiced the "add a field" example from guide 4). Two Django changes both numbered 0002
need to be joined:

1. Copy the v3 files in as in step 3 (your own migration file stays; v3 doesn't replace it).
2. If your change also edited `models.py`, the check listed `models.py` as changed. Get the merged `models.py` from Claude first.
3. Run:

   ```bash
   python manage.py makemigrations --merge
   python manage.py migrate
   python manage.py test
   ```

   `--merge` makes a small extra file that tells Django both changes belong. Commit it with everything else.
