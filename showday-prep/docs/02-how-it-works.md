# 2. How it works

This is a tour of the code. You don't need to memorize it. Read it once to get the
map in your head, then come back when you need to find something.

## The big picture

The site has two halves that talk to each other:

```
 YOUR BROWSER                                     THE SERVER (Django, Python)
 ────────────                                     ───────────────────────────
 The screens (JavaScript)                         planner/api.py
   draw every tab from the data they hold    ──►    checks the login
   send changes as JSON                       ◄──    reads or saves the database
                                                     sends JSON back
                                                  planner/models.py
                                                     the database tables
```

1. You open the site. Django checks your login and sends back a nearly empty page
   (`planner/templates/planner/app.html`) plus the screen files.
2. The screens ask the server for everything at once: `GET /api/bootstrap/`.
3. You change something. Half a second after you stop typing, the screens send
   the whole event back: `PUT /api/events/<id>/`.
4. The server saves it into the right tables and replies "OK". The bottom-left of the
   screen says "All changes saved".

Share pages and calendar feeds work differently: the **server** builds them directly
from the database (`planner/views.py`), because the people opening them aren't logged in.

## A request, followed all the way through

Say you drag the deadline "Submit venue application" into the **Done** column.

| Step | File | What happens |
|---|---|---|
| 1 | `static/planner/js/actions.js` | The `drop` listener sets that deadline's `status` to `"done"`, then calls `touch(event)` |
| 2 | `static/planner/js/core.js` | `setMsStatus()` also records today as the "completed on" date. `touch()` waits 450 ms (in case you make more changes), then `flush()` calls `store.saveEvent(event)` |
| 2b | `static/planner/js/store-django.js` | `store.saveEvent` sends the whole event: `PUT /api/events/mystic-ep4/` |
| 3 | `planner/urls.py` | The address `api/events/<event_id>/` points to `api.event_detail` |
| 4 | `planner/access.py` | `api_login_required` checks you're logged in and finds your organization |
| 5 | `planner/api.py` | `event_detail` reads the JSON and hands it to `save_event_dict` |
| 6 | `planner/serializers.py` | `save_event_dict` updates the event facts, then `_sync` goes through each list and updates, adds or deletes rows so the database matches |
| 7 | `planner/models.py` | The `Milestone` row for that deadline now has `status = "done"` |
| 8 | back in `core.js` | The reply arrives; the save indicator says "All changes saved" |

## The server side (Python), file by file

| File | What it's for | When you'd touch it |
|---|---|---|
| `showday/settings.py` | Every setting: database, security, email, AI key. Reads values from `.env` | Rarely. Change `.env` instead |
| `showday/urls.py` | Top-level addresses: admin, login, logout | Rarely |
| `planner/models.py` | **The database tables.** One class per table, one line per column | When you add a new kind of information |
| `planner/serializers.py` | Converts database rows to the JSON the screens use, and back | Whenever you add a field to a model |
| `planner/api.py` | The JSON addresses the screens call | When the screens need a new kind of request |
| `planner/access.py` | Login checks; keeps each organization's data separate. *(final)* Also the Blackmagic team's support access to retainer clients | To change who counts as "the team" |
| `planner/views.py` | Real pages: the app, share pages, calendar feeds, file downloads | When changing what share pages show |
| `planner/schedule.py` | Show-day time math (program start times, schedules by audience) | Rarely |
| `planner/checks.py` | The most important checks, used in emails and AI | When adding a check the server should know about |
| `planner/ics.py` | Builds calendar files | Rarely |
| `planner/ai.py` | The Reports page's optional AI status summary | To change what the AI writes |
| `planner/accounts.py` | *(final)* Sign-up, change password, reset password | To change who can sign up or what the form asks |
| `planner/auth.py` | *(final)* Lets people log in with their email | Rarely |
| `planner/teams.py` | *(beta)* Organizations: creating one, search, join requests and owner approval, members and roles, invite links, the `/join/<code>/` page | To change who can join or what owners can do |
| `planner/testing.py` | *(beta)* The usage log (`/api/telemetry/`), the Testing report and the feedback inbox | To change what the report shows |
| `planner/budget.py` | *(v3)* Budget totals in Python, for checks and AI | Rarely |
| `planner/reminders.py` | *(v3)* **Who gets which reminder email, and when.** Same rules as the preview on screen. Also "Mark done" | To change reminder timing |
| `planner/emails.py` | *(v3)* Builds and sends the reminder and approval emails | To change email wording |
| `planner/tests_v3.py`, `tests_v4.py` | Automatic checks for the v3 and v4 features | Add one when you fix a bug |
| `planner/admin.py` | The /admin/ back office | To show more columns there |
| `planner/tests.py` | Automatic checks | Add one whenever you fix a bug |
| `planner/management/commands/` | Commands you run in the terminal | To add a new command |
| `planner/templates/` | HTML: the app shell, the share page, the login page | To change the share page's layout |
| `planner/migrations/` | Django's record of every database change | **Never edit by hand.** Django writes these |

## The screens (JavaScript), file by file

All in `planner/static/planner/`. They load in this order:

| File | What it's for |
|---|---|
| `css/app.css` | Every color, font and layout rule. Colors are defined once at the top as "tokens" |
| `js/helpers.js` | Lists (tabs, statuses, audiences) and date/time math |
| `js/templates.js` | The 11 event templates and the equipment catalog |
| `js/store-django.js` | *(v3)* **The only file that talks to the server.** Every other file calls `store.saveEvent(...)`, `store.uploadFile(...)` and so on. (The Claude prototype uses a different store file; everything else is identical, so a change tested in the prototype drops straight in here.) |
| `js/core.js` | The app's memory (`S`), saving, owners and reminders reach, checks, calendar files, PDF/Word export |
| `js/views.js` | Draws the original tabs. One function per tab: `overviewHTML`, `milestonesHTML`, `equipmentHTML`… |
| `js/actions.js` | What happens on click, type, drag and upload |
| `js/budget.js` | *(v3)* The Budget tab: costs, income, invoices, break-even, "where you can save" |
| `js/approvals.js` | *(v3)* Requesting and recording approvals |
| `js/reminders.js` | *(v3)* The reminder email preview (same rules as `planner/reminders.py`) |
| `js/wrapup.js` | *(v3)* The Wrap-up tab |
| `js/reports.js` | *(v3)* The Reports page (current and past events) |
| `js/library.js` | *(v3)* Your templates, "Add from templates", and "Download by person" |
| `js/hours.js` | *(v4)* The Hours page and the client workspace switcher |
| `js/exports.js` | *(final)* Budget to Excel and CSV, and the layout drawn into PDFs |
| `js/account.js` | *(final)* The Account pop-up and support access |
| `js/help.js` | *(beta)* The small **?** help buttons (`help('phase')`), the Help guide, and "Getting started" on the home page |
| `js/groups.js` | *(beta)* An event's own groups, Group lists, "Import a list" (CSV and Excel), "Email the group", step progress bars, booth labels |
| `js/series.js` | *(beta)* The series strip and Series page; hiding tabs and an event's own notes tabs |
| `js/team.js` | *(beta)* The Team page, asking to join, invite links, "+ New organization", "Assigned to you" |
| `js/testing.js` | *(beta)* The usage log sent to `/api/telemetry/`, "How easy was that?", and the Testing report |
| `js/boot.js` | *(v3)* Starts the app. Must load last |

**Two patterns to recognize** (they're everywhere):

1. **Buttons name their action.** In `views.js` you'll see `data-act="addEq"`. In `actions.js`,
   `actions.addEq` is what runs. To find what a button does, search for its `data-act` name.
2. **Inputs name what they change.** `data-edit="equipment|q12|qty"` means "in the equipment
   list, the row with id q12, the qty field". The `change` listener in `actions.js` uses that
   to update the right value, then saves.
3. *(v3)* **New features plug themselves in.** A feature file adds its tab with
   `TAB_VIEWS.budget = budgetHTML`, its pop-ups with `MODALS.approval = ...`, and its buttons with
   `Object.assign(actions, {...})`. So a new feature is a new file plus one `<script>` line in `app.html`.

## The database, in one picture

```
Organization ──┬── Membership ── User (logins)
               ├── Person (contacts directory)
               ├── Note (testing notes)
               ├── EventFile (uploads)
               └── Event ──┬── Milestone (deadlines)
                           ├── SetupItem (load-in, sound check…)
                           ├── ProgramItem (the show, in order)
                           ├── EventContact (who's working it) ──► may link to a Person
                           ├── ComplianceItem (paperwork) ◄── EventFile attaches here
                           ├── EquipmentItem
                           ├── LayoutPiece / LayoutPin
                           ├── BudgetLine (costs, income) ◄── EventFile (invoices) attaches here   v3
                           ├── Approval (sign-offs, with a private link for the approver)            v3
                           ├── ShareLink (private links + calendar feeds)
                           └── TaskLink (each person's private "My tasks" page)                     v3
Organization ──┬── OrgTemplate ("Your templates")                                                   v3
               ├── ReminderLog (who was emailed which day, so nobody gets two)                      v3
               └── TimeEntry (the Hours page)                                                       v4
```

**Why deadlines store "offset" instead of a date:** `offset = -30` means "30 days before
show day". Change the show date and every deadline moves. It's also why cloning an event
for next month just works.

**Why ids are text:** the screens make an id (like `k3j9x2ab`) the moment you add something,
so they don't have to wait for the server. The database uses the same id, which is how
`_sync` in `serializers.py` knows which row is which.

## Addresses the site answers

| Address | Who can open it | What it is |
|---|---|---|
| `/` | Logged-in team | The app |
| `/login/`, `/logout/` | Anyone | Logging in and out |
| `/admin/` | Superusers | Back office |
| `/s/<token>/` | Anyone with the link | A private share page for one group |
| `/s/<token>/calendar.ics` | Anyone with the link | A live calendar feed |
| `/files/<id>/` | Logged-in team (same organization) | Download an uploaded file |
| `/api/...` | Logged-in team | The JSON the screens use |
| `/healthz` | Anyone | Says "ok". Render uses it to check the site is up |
| `/t/<token>/` | Anyone with the link *(v3)* | One person's "My tasks" page. They can mark their own items done |
| `/done/<code>/` | Anyone with the link *(v3)* | The "Mark done" button in a reminder email. Asks once, then marks it |
| `/a/<token>/` | Anyone with the link *(v3)* | The approver's Approve / Decline page |

## Security, in plain words

- Every API call checks the login and only touches **your organization's** rows.
  A test in `tests.py` proves another organization can't see or overwrite your events.
- Share links use long random tokens that can't be guessed. Treat them like a password:
  anyone with the link can see that page. Phone numbers only show when "Phone visible" is on.
- Uploaded files are only downloadable by logged-in people in the same organization,
  and only safe types (PDF, images, text) are accepted, up to 20 MB.
- *(v3)* Email links: "Mark done" codes are signed with the secret key, so they can't be forged
  or edited to mark something else, and they expire after 120 days. Opening a link never changes
  anything by itself (email scanners open links); a button press does. Approvals can only change
  through the approver's link or the Approvals buttons, never by editing the event.
- Secrets (the Django secret key, the Claude API key, email passwords) live in `.env`
  on your computer and in Render's Environment settings online. **Never** in the code.
