# 7. Updating the live site from v3 to v4

**Who this is for:** JR, once v3 is running (docs/06).
**Time:** about 20 minutes. No new settings, no new packages, no new scheduled jobs.

v4 adds what Blackmagic Solutions needs to run client work in MagicShow:

| Feature | What changes for you |
|---|---|
| **Client workspaces** | One login can work in several workspaces: yours, plus one per client. The switcher is in the left menu |
| **Hours** | A page to log time per client against a monthly retainer |
| **Consulting templates** | Event coverage, Interview story, Camera training series |
| **Deadlines after show day** | Editing and delivery deadlines (T+3). Reminders continue until they're done |

Same approach as v3: **replace whole files, add new ones, run `migrate`.** These are not touched:
`showday/settings.py` · `showday/urls.py` · `requirements.txt` · `render.yaml` · `build.sh` · `.env`

---

## What's in the update folder

```
showday-prep-v4-update/
├── check_before_copying.py     ← run first. Only reads, never changes anything
├── CHANGED-FILES.txt           the full list
└── showday-prep/               ← copy the CONTENTS of this folder over your project
```

**Replaced:** `planner/access.py`, `admin.py`, `api.py`, `models.py`, `reminders.py`, `serializers.py`,
`urls.py`, `views.py`, `management/commands/send_reminders.py`, `templates/planner/app.html`, eight files in
`static/planner/js/` (actions, core, library, reminders, reports, store-django, templates, views), and the guides.

**New:** `planner/migrations/0003_v4_workspaces_hours.py`, `planner/static/planner/js/hours.js`,
`planner/tests_v4.py`, and this guide.

## Steps

The same steps as docs/06, shorter:

1. **Back up** the database, then `git checkout -b v4`.
2. **Check:** unzip the update next to your project, then from inside your project run
   `python ../showday-prep-v4-update/check_before_copying.py`. Continue only on "All clear".
   (It checks against the v3 files, so v3 must be in first.)
3. **Copy** everything inside `showday-prep-v4-update/showday-prep/` into your project, replacing files.
   Mac: `cp -R ../showday-prep-v4-update/showday-prep/. .`
4. **Test on your computer:**

   ```bash
   python manage.py migrate      # Applying planner.0003_v4_workspaces_hours... OK
   python manage.py test         # Ran 32 tests ... OK
   python manage.py runserver
   ```

   Click through: left menu shows **Hours** and **Workspace**. **+ New client workspace** creates one and
   switches to it (empty). The switcher takes you back to your events. **New event** lists the three
   consulting templates. On any deadline, **When** has "days after show".
5. **Put it online:** commit, push, merge to main. Render runs `migrate` itself. On your own server run
   `python manage.py migrate` and `python manage.py collectstatic --no-input`, then restart.

That's it: no new environment variables, and the daily reminder job stays the same.

---

## Giving a client their own login

A client's staff should see only their workspace. They're added by an admin, the same way as before:

1. **/admin/ → Users → Add user.** Create their username and password. Put their email in.
2. In a terminal on the server (Render: **Shell** tab):

   ```bash
   python manage.py setup_org "Eastside Youth Arts" --user theirusername --role member
   ```

   Use the workspace name **exactly** as it appears in the switcher.

What they get as a **member**: that workspace only, full planning, and logging hours. What they can't do:
change the retainer, or see your other clients. The consultant who created the workspace is its **owner**.
Your own saved templates show up in every workspace you own, but never for the client's staff.

## Good to know

- Each workspace keeps its own events, people, contacts, templates, notes, files and hours.
- Switching workspaces is remembered per login session. Logging out and back in opens the first one.
- Hours are visible to everyone in that workspace, including the client's staff. That's intended: it shows them how the retainer is being used.

## If something goes wrong

Same as docs/06: roll back with `git revert HEAD` or a Render rollback. The new columns don't bother v3.
"No such table: planner_timeentry" means `migrate` didn't run.
