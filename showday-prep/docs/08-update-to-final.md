# 8. Updating the live site to MagicShow final

**Who this is for:** JR. It works from any earlier version (v2, v3, v4, Magic Maker or MagicShow).
**Time:** about 30 minutes. No new packages. Two optional settings.

Same approach as before: **replace whole files, add new ones, run `migrate`.** These are not touched:
`showday/settings.py` · `showday/urls.py` · `requirements.txt` · `render.yaml` · `build.sh` · `.env`

## What's new

| Change | What it means for you |
|---|---|
| **You stay where you are** after a click or an edit | Nothing to set up |
| **Run of show:** add a line anywhere, drag rows to reorder | Nothing to set up |
| **Budget → Excel or CSV** | Nothing to set up. The Excel file is built in the browser |
| **Layout → PDF**, and the layout inside the full master plan | Nothing to set up |
| **AI meeting summary removed** from events | The Reports page's AI summary is still there, off unless `ANTHROPIC_API_KEY` is set |
| **Sign-up** at `/signup/`, **log in with email**, **forgot password** | Decide who may sign up (below). Password reset needs the email settings |
| **Support access** for retainer clients | Tick **Staff status** for each Blackmagic team login (below) |

## Steps

1. **Back up** the database, then `git checkout -b magicshow-final`.
2. **Check:** unzip the update next to your project, then from inside your project run
   `python ../magicshow-final-update/check_before_copying.py`. Continue only on "All clear".
3. **Copy** everything inside `magicshow-final-update/showday-prep/` into your project, replacing files.
   Mac or Linux: `cp -R ../magicshow-final-update/showday-prep/. .`
4. **Test on your computer:**

   ```bash
   python manage.py migrate      # ... Applying planner.0004_final_signup_support... OK
   python manage.py test         # Ran 41 tests ... OK
   python manage.py runserver
   ```

5. **Put it online:** commit, push, merge to main. Render runs `migrate` itself. On your own server run
   `python manage.py migrate` and `python manage.py collectstatic --no-input`, then restart the site.
6. **Hard-refresh** the browser (Ctrl+Shift+R) so it loads the new screens.

## Decide who can sign up

Anyone who finds `/signup/` can create an account, and nothing charges them yet. Pick one, in the
same place as your other settings (`.env`, or the host's environment variables), then restart:

| You want | Setting |
|---|---|
| Only people you give a code to (**recommended until payments are connected**) | `SIGNUP_CODE=pick-a-word` |
| Nobody: accounts are made in /admin/ like before | `ALLOW_SIGNUP=False` |
| Anyone | Leave both out |

Each new account gets its own private workspace. The person who signs up is its owner. They can't
see anyone else's workspace, and they don't get "+ New client workspace" (that's a Blackmagic tool).

Every Staff login with an email gets a short "New MagicShow account" email when someone signs up.

## Set up the Blackmagic team (for retainer clients)

"The team" = every active login with **Staff status** ticked.

1. Go to `/admin/` → **Users**. Open Hananiah's login (and yours, and anyone else who helps clients).
2. Tick **Staff status**. Fill in **Email address** if it's empty. Save.

How a retainer client gets connected:

1. The client creates their own account at `/signup/` and ticks
   **"I'm working with Blackmagic Media on a retainer"**.
2. Their workspace appears in each team member's **Workspace** list the next time the team member
   opens the app. Inside it the menu shows a "Client workspace" tag.
3. The team can build events there and set the retainer on the Hours page. The client keeps their
   own login the whole time.

Already signed up without ticking the box? The client opens **Account** (left menu) and switches on
"Let the Blackmagic Media team into this workspace". Or you tick **Blackmagic team can open this
workspace** on that organization in `/admin/` → **Organizations**.

The client can switch it off at any time. The team's access ends right away and nothing is deleted.
Un-ticking Staff status on a login removes that person from every client workspace.

> Staff status also lets a login open `/admin/`. A staff login that isn't a superuser sees an empty
> admin, so this is safe, but only tick it for people on the team.

## Logging in

- New accounts log in with their **email**.
- Older logins: the username still works, and so does that login's email (if it has one and no other
  login shares it).
- **Forgot your password?** on the log-in page emails a reset link. It needs `EMAIL_HOST` and friends
  to be set (docs/06). Without them the "email" only prints in the server log.
- **Account** in the left menu: change name, email, password and the workspace's name.

## Good to know

- **Plans.** Each organization has a plan in /admin/: Internal (Blackmagic's own), Subscription, or
  Retainer client. Today it's a label, plus it decides who gets "+ New client workspace". It's the
  hook for billing later.
- **Reordering.** Program segments, people and budget lines can be dragged. Setup items sort by start
  time, so they aren't dragged; "+ Add an item here" gives the new one the right time.
- **The Excel file** has formulas: change a number in it and the totals and the Summary sheet update.
- **The layout drawing is in PDFs only.** Word files list the pieces and pins and say the drawing is
  in the PDF.

## If something goes wrong

Roll back with `git revert HEAD` or a Render rollback. The new database columns don't bother older code.

| Problem | Fix |
|---|---|
| "no such column: planner_organization.plan" | `migrate` didn't run. Run `python manage.py migrate` |
| The screens look unchanged, or buttons do nothing | The browser has old files. Hard-refresh. On your own server, run `collectstatic` and restart |
| A team member doesn't see a client's workspace | Is **Staff status** ticked on their login? Is the switch on in the client's Account? Then reload the app |
| The reset email never arrives | Check the email settings; look in the server log for the printed email |
| "Too many accounts were just created from this connection" | Sign-up allows 8 new accounts an hour from one internet address. Wait, or make the account in /admin/ |
