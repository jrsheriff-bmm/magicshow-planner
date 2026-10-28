# 10. Updating the live site to the MagicShow beta

**Who this is for:** JR, and the programmer joining the project. It works from any earlier version
(v2, v3, v4, Magic Maker, MagicShow or MagicShow final).
**Time:** about 30 minutes. No new packages and no new required settings.

Same approach as every update: **replace whole files, add new ones, run `migrate`.** These are not touched:
`showday/settings.py` · `showday/urls.py` · `requirements.txt` · `render.yaml` · `build.sh` · `.env`

This update holds the 13 changes from Mia's beta session and JR's call, in the order they were ranked.

## What's new

| # | Change | Where | Set-up needed |
|---|---|---|---|
| 1 | **Checklist steps with their own dates.** Each step can have a due date and gets its own reminder (7 days and 1 day before, then weekly if overdue) with a "Mark step done" button. Cards show a progress bar and the next step | Deadlines → open a card | None |
| 2 | **Feedback inbox and error capture.** Testers tick "Send to the MagicShow team" on a note. The page also records errors it runs into | Notes button; Testing report | None |
| 3 | **Plain-language help.** A small **?** beside Phase, Hard deadline, Checklist, Groups and other labels. A Help guide in the menu, and a "Getting started" list on the home page | Everywhere | None |
| 4 | **Your own groups** instead of the fixed four. Food vendors, Retail, Info booths, Artisans, or anything you name. The festival template starts with them | Share pages → Edit groups | None |
| 5 | **Import a list** from Jotform, Google Forms or Excel, and **email a group its itinerary** in one go. Vendors live on "Group lists", so People stays the planning team | People → Group lists; Share pages | Email settings (below) |
| 6 | **Layout:** food, retail, info, food-truck, kids, bounce and tent pieces, a custom piece you name and size, booths colored by group, who's in each booth, and a warning when one group's booths are bunched together | Layout | None |
| 7 | **Organizations:** everyone gets a personal workspace; create an organization, find one and ask to join (owners approve), or join with an invite link. Members show up in every Owner box | Team (left menu) | None (see below) |
| 8 | **Series:** a strip linking the events before and after, "Add next in series", and a Series page | Under each event's title | None |
| 9 | **Contact tags** and a filter | Contacts | None |
| 10 | **Usage log and Testing report** for the Blackmagic team: who's testing, what they use, where they give up, errors, ratings, and a "Copy weekly summary" button | Testing report (left menu, team only) | Staff status (below) |
| 11 | **"We don't count attendance"** for open events | Overview | None |
| 12 | **Fees kept by ticketing sites** (Eventbrite and the like) and **vendor fees paid or not** | Budget; People → Group lists | None |
| 13 | **Your own tabs**: hide tabs an event doesn't use, add notes tabs (Parking, Vendor FAQ) | "Tabs" button on each event | None |

## Steps

1. **Back up** the database, then `git checkout -b magicshow-beta`.
2. **Check:** unzip the update next to your project, then from inside your project run
   `python ../magicshow-beta-update/check_before_copying.py`. Continue only on "All clear".
3. **Copy** everything inside `magicshow-beta-update/showday-prep/` into your project, replacing files.
   Mac or Linux: `cp -R ../magicshow-beta-update/showday-prep/. .`
4. **Test on your computer:**

   ```bash
   python manage.py migrate      # ... Applying planner.0005_beta_update... OK
   python manage.py test         # Ran 51 tests ... OK
   python manage.py runserver
   ```

5. **Put it online:** commit, push, merge to main. Render runs `migrate` itself. On your own server run
   `python manage.py migrate` and `python manage.py collectstatic --no-input`, then restart the site.
6. **Hard-refresh** the browser (Ctrl+Shift+R) so it loads the new screens.

## Settings

**Email (needed for "Email the group" and join requests).** These are the same settings reminder
emails already use: `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`,
`DEFAULT_FROM_EMAIL`. If they aren't set on the live site, the "Email the group" button answers
"Email isn't set up on this site yet. Copy the link instead." and nothing is sent. Each itinerary
email's "reply to" is the person who pressed Send, so vendors' answers go to them.

**Staff status (who sees the Testing report).** The same tick box as support access: `/admin/` →
Users → tick **Staff status**. Only staff logins see "Testing report" in the menu and can open
`/api/testing/report/`.

## Organizations after the update

- Organizations that already exist are **hidden from search** (the migration does this), so nobody
  can ask to join a client's workspace by accident. An owner can switch it on under
  **Team → Let people find us and ask to join**.
- New sign-ups get a personal workspace called "First-name's events". If they type an organization
  name at sign-up, that organization is created with them as owner. If one with that name already
  exists and can be found, they're offered "Ask to join" on their home page instead.
- Owners get an email when someone asks to join, approve or decline on the Team page, and the
  person is emailed the answer.
- Invite links (Team → New member link) work for 14 days. Someone who opens one and signs up skips
  the sign-up code.
- "Client workspace" (for retainer clients) is still a Blackmagic team option, now inside
  **+ New organization**.

## Running a testing week

1. Make sure each tester has an account, and that your own login has Staff status.
2. Tell testers: "When something is confusing or missing, press **✎ Notes**, write one line, and
   leave **Send to the MagicShow team** ticked."
3. Each Monday open **Testing report**, pick 7 days, press **Copy weekly summary** and paste it into
   an email or the team chat. Tick **Handled** on feedback once it's dealt with.
4. Errors list the message, the screen and the place in the code. Give those three things to the
   programmer.

What is recorded: the name of each button pressed, each screen opened, pop-ups started, finished
or closed early, errors, and 1–5 ratings. Nothing anyone types is ever recorded. To clear old
records (for example monthly): `python manage.py prune_usage --days 180`.

## If something looks wrong

| You see | Do this |
|---|---|
| Old screens, or a blank page after the update | Hard-refresh (Ctrl+Shift+R). On your own server, `collectstatic` was skipped |
| "Email isn't set up on this site yet" | Add the email settings above and restart |
| On your own computer, a save sometimes fails with "database is locked" | That's the small SQLite database used for testing when two saves land at once. The page now tries again by itself. The live site uses Postgres, which doesn't do this |
| Import shows the wrong columns | Change the drop-downs under "Which column is which". The first row of the file must be the column names |
| Someone can't find an organization | Its owner needs to switch on "Let people find us" on the Team page, or send an invite link |
