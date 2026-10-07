# 1. Run it on your computer

By the end of this guide, the site will be running on your own computer with your
Mystic Music events loaded. Nothing here costs money, and nothing is online yet.

You'll type commands into a **terminal**: a window where you type instructions
instead of clicking. Copy each command exactly, press Enter, and wait for it to finish
before the next one.

- **Windows:** open "PowerShell" from the Start menu.
- **Mac:** open "Terminal" (press Cmd + Space, type Terminal).

---

## Step 1: Install the tools (one time only)

You need three free programs.

1. **Python 3.12** from https://www.python.org/downloads/
   - Windows: on the first installer screen, **tick "Add python.exe to PATH"** before clicking Install. This matters.
   - Check it worked: open a new terminal and type `python --version`. You should see `Python 3.12.something`.
     (On a Mac, type `python3 --version`. On a Mac, use `python3` anywhere this guide says `python`.)
2. **Git** from https://git-scm.com/downloads. Keep all the default choices.
3. **VS Code** from https://code.visualstudio.com. This is where you'll read and edit files.
   After installing, open it and install the "Python" extension it suggests.

## Step 2: Put the project folder somewhere sensible

Unzip `showday-prep.zip` into your Documents folder, so you have `Documents/showday-prep`.

In the terminal, move into that folder:

```bash
cd Documents/showday-prep
```

(`cd` means "change directory", or "go into this folder".)

## Step 3: Make a private space for the project's packages

This keeps the site's packages separate from anything else on your computer.

```bash
python -m venv .venv
```

Now switch it on:

- Windows: `.venv\Scripts\activate`
- Mac: `source .venv/bin/activate`

Your terminal line now starts with `(.venv)`. **Every time you open a new terminal to work
on the site, go into the folder and run the switch-on line again.**

> Windows error "running scripts is disabled"? Run this once, then try again:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## Step 4: Install the packages

```bash
pip install -r requirements.txt
```

This downloads Django and the other pieces listed in `requirements.txt`. It takes a minute or two.

## Step 5: Create your settings file

```bash
copy .env.example .env        # Windows
cp .env.example .env          # Mac
```

Open `.env` in VS Code. For now, leave everything as it is. `DEBUG=True` is correct on your computer.

## Step 6: Create the database

```bash
python manage.py migrate
```

This builds every table described in `planner/models.py` inside a new file called `db.sqlite3`.
You'll see a list of "Applying … OK" lines.

## Step 7: Make your admin login

```bash
python manage.py createsuperuser
```

It asks for a username, email and password. (The password doesn't show while you type. That's normal.)

## Step 8: Create Blackmagic Media and connect your login

Replace `hananiah` with the username you just made:

```bash
python manage.py setup_org "Blackmagic Media" --user hananiah
```

## Step 9: Load your events from the prototype

```bash
python manage.py import_prototype data/prototype-export.json --org "Blackmagic Media"
```

You should see: `Imported 3 events, 0 contacts and 11 notes into Blackmagic Media.`
That's Mystic Music Ep. 4 (with its equipment and layout), Cauldron Concerts, your
test event, and all 11 testing notes. Files you uploaded in the prototype don't
come across; upload them again.

## Step 10: Start the site

```bash
python manage.py runserver
```

Open http://127.0.0.1:8000 in your browser and log in. You're looking at the real site.

To stop it, click in the terminal and press **Ctrl + C**.

---

## Things to try

- Change something on an event, then refresh the page. It's still there, because it saved to the database.
- **Share pages** tab → pick Vendors → **Open**. That's the page a vendor sees, with no login.
- **Calendar** tab → copy the live calendar link and add it to your Google Calendar ("Other calendars → From URL").
- Visit http://127.0.0.1:8000/admin/ to see the raw database. Useful for fixing things by hand.
- Run the automatic checks: `python manage.py test`. All 11 should say OK.
- Preview reminder emails: `python manage.py send_reminders --dry-run`

## Adding JR (or anyone else)

1. Go to http://127.0.0.1:8000/admin/ → **Users** → **Add user**.
2. Then run: `python manage.py setup_org "Blackmagic Media" --user THEIR_USERNAME --role member`

(Once the site is online, you'll do the same thing on the live admin page. See guide 3.)

## If something goes wrong

| You see | It means | Fix |
|---|---|---|
| `python is not recognized` | Python isn't on the PATH | Reinstall Python and tick "Add python.exe to PATH" |
| `No module named django` | The private space isn't switched on | Run the switch-on line from step 3 |
| `That port is already in use` | The site is already running in another terminal | Close that terminal, or run `python manage.py runserver 8001` |
| A yellow banner about your login not being connected | Step 8 wasn't run for this user | Run `setup_org` with that username |
| The page loads but says it couldn't load events | Look at the terminal: the error is printed there | Copy the red text into your AI helper (see guide 4) |
