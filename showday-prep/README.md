# MagicShow

*(Formerly Showday Prep. The folder and code names, like `showday-prep/` and `showday/`, keep the old name on purpose: renaming them would break the live site's setup, and nobody using the site ever sees them.)*

The pre-event planning website for Blackmagic Media: everything that happens before the show.
Deadlines, run of show, equipment, people, paperwork, venue layout, share pages and calendars,
all built from one record per event.

This folder is a complete, working Django website: the prototype you tested, running on its
own server with its own database, logins, private share links, live calendar feeds and
(new in version 3) budgets, reminder emails, approvals, reports and your own templates.

## New in version 3

| Feature | Where |
|---|---|
| **Budget**: costs, income, paid vs owed, invoices on each line, break-even, "where you can save" | Budget tab |
| **Email reminders**: owners hear 7 days and 1 day before each deadline, weekly (not daily) when overdue, with a "Mark done" button that needs no login. Show-day itineraries a week and a day out. A Monday summary for the team | Calendar & reminders tab (preview), daily command |
| **My tasks** links and **Download by person** (PDF or Word, one file each or all in one) | People → Send page; Deadlines tab |
| **Approvals**: request, approve or decline by email link, with a record kept | Overview, Budget and Paperwork tabs |
| **Reports**: every upcoming event's status on one page, plus lessons from past events | Reports (left menu) |
| **Wrap-up**: attendance, final numbers, ratings, what to change. Deadlines now record the day they were done | Wrap-up tab |
| **Your templates**: save any event as a template, copy a built-in one, or start empty and pick pieces | Templates (left menu), "Save as template", "Add from templates" |

## New in version 4

| Feature | Where |
|---|---|
| **Client workspaces**: one login works across your own workspace and one per client. Each client's events, people, templates and hours stay separate; your own templates follow you into each | Left menu → Workspace |
| **Hours**: log time per client, against a monthly retainer, by kind of work and by event, with a spreadsheet export | Left menu → Hours, or "Log time" on any event |
| **Consulting templates**: Event coverage, Interview story (1–3 minute video), Camera training series | New event |
| **Deadlines after show day** for editing, review and delivery (T+3). Reminders keep going until they're done | Deadlines tab |

Updating a running v2 site? Follow **[docs/06-update-to-v3.md](docs/06-update-to-v3.md)**, then **[docs/07-update-to-v4.md](docs/07-update-to-v4.md)**. Already on v3? Just docs/07.

## New in the final version

| Feature | Where |
|---|---|
| **You stay where you are.** Clicking, ticking or editing no longer snaps a wide table back to its left edge or a side panel back to the top. Tab moves to the next box, and a click right after typing works the first time | Every screen |
| **Run of show: add anywhere, drag to reorder.** Point between two rows for "+ Add here". Drag the ⠿ handle (mouse or finger), or use the arrow keys. People and budget lines can be dragged too | Run of show → Edit; People; Budget |
| **Budget to Excel or CSV**: Summary, Costs and Income sheets with working totals | Budget tab → Download Excel / CSV |
| **Layout as a PDF**: the room drawn to scale, and the floor plan with numbered pins. Also in the full master plan, right after the Overview | Layout tab → Download layout PDF |
| **Create your own account** with an email and password; log in with your email; reset a forgotten password by email | /signup/, the log-in page |
| **Support access for retainer clients**: a client lets the Blackmagic team into their workspace (a tick box at sign-up, or a switch under Account). The team then sees it in their workspace list | Account (left menu) |
| **Account pop-up**: your name, email, password, the workspace's name | Left menu → Account |
| *Removed:* the per-event AI meeting summary. Every part of the plan downloads instead | |

## Start here

Read these in order. Each one assumes nothing beyond the one before it.

| Guide | What it covers | Time |
|---|---|---|
| [docs/01-run-it-on-your-computer.md](docs/01-run-it-on-your-computer.md) | Install the tools, start the site on your own computer, load your events | About 45 minutes the first time |
| [docs/02-how-it-works.md](docs/02-how-it-works.md) | A tour of every file: what it does and how the pieces talk to each other | Read at your own pace |
| [docs/03-put-it-online.md](docs/03-put-it-online.md) | GitHub, Render, your domain, file storage, the Claude API key, reminder emails | About 2 hours |
| [docs/04-making-changes.md](docs/04-making-changes.md) | How to change things safely, with or without an AI helper, and how to test before going live | Keep it open while you work |
| [docs/05-whats-next.md](docs/05-whats-next.md) | What's done, what's not, and the recommended order for what comes next | 10 minutes |
| [docs/06-update-to-v3.md](docs/06-update-to-v3.md) | Updating a running v2 site to v3: which files to copy, and the 3 settings to add | About 30 minutes |
| [docs/07-update-to-v4.md](docs/07-update-to-v4.md) | Updating v3 to v4: client workspaces, Hours, consulting templates | About 20 minutes |
| [docs/08-update-to-final.md](docs/08-update-to-final.md) | Updating to the final version: accounts and sign-up, support access, the new downloads | About 30 minutes |
| [docs/09-run-on-your-own-server.md](docs/09-run-on-your-own-server.md) | Putting the site on a virtual private server (Ubuntu, Postgres, Nginx, https) instead of Render | About 2 hours |

## The short version (for someone who's done this before)

```bash
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                 # Windows: copy .env.example .env
python manage.py migrate
python manage.py createsuperuser
python manage.py setup_org "Blackmagic Media" --user YOUR_USERNAME
python manage.py import_prototype data/prototype-export.json --org "Blackmagic Media"
python manage.py runserver
```

Then open http://127.0.0.1:8000 and log in.

## What's in the box

```
showday-prep/
├── manage.py                  run every command through this
├── requirements.txt           the Python packages the site needs
├── .env.example               settings template (copy to .env)
├── build.sh / render.yaml     instructions Render follows to put the site online
├── showday/                   project settings and the site's address list
├── planner/                   THE APP: database tables, API, pages, screens
│   ├── models.py              the database tables
│   ├── serializers.py         translates between the database and the screens
│   ├── api.py                 the JSON addresses the screens call to load and save
│   ├── views.py               pages: the app, private share pages, calendar feeds, files
│   ├── schedule.py            show-day time math
│   ├── checks.py              the "Checks" list, for emails and AI
│   ├── ics.py                 calendar files
│   ├── ai.py                  the Reports page's optional AI status summary (Claude API)
│   ├── accounts.py            sign up, change or reset a password (final)
│   ├── auth.py                log in with an email address (final)
│   ├── budget.py              budget totals (v3)
│   ├── reminders.py           who gets which reminder email, and "Mark done" (v3)
│   ├── emails.py              building and sending emails (v3)
│   ├── admin.py               the /admin/ back office
│   ├── tests*.py              automatic checks (python manage.py test)
│   ├── management/commands/   setup_org, import_prototype, send_reminders
│   ├── templates/             the HTML pages (app shell, share page, login, sign-up, email, My tasks, approvals)
│   └── static/planner/        the screens: CSS and JavaScript
├── data/prototype-export.json your events and notes from the prototype
└── docs/                      the guides above
```

## Built so far

- Logins, with every organization's data kept separate
- Events from 11 templates (plus blank and clone), with deadlines counted back from show day
- Deadline board with cards, checklists and drag and drop
- Run sheet, timeline and edit views for show day, with Now and next
- Equipment check with a five-step status and a gear catalog
- Contacts directory shared across events, with "Send page" messages
- Paperwork with real file uploads
- Layout: build a room to scale, or pin a floor plan
- **Private share links** for performers, vendors, venue and security (no login needed to view)
- **Live calendar feeds** that Google, Outlook and Apple Calendar subscribe to
- PDF and Word downloads of any page, the event summary, or the full master plan
- Optional AI status summary on the Reports page (turns on when you add a Claude API key)
- Reminder emails to each owner, with "Mark done" buttons (a command you schedule daily)
- Budget, approvals, wrap-up, reports, your own templates, per-person downloads (v3)
- Automatic checks that catch overdue items, name mismatches, gear not secured and more
- Client workspaces, Hours and consulting templates (v4)
- Sign-up, email log-in, password reset, and support access for retainer clients (final)
- Budget to Excel/CSV, layout PDFs, drag-to-reorder and add-anywhere on the run of show (final)
- 41 automatic tests
