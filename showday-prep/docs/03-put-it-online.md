# 3. Put it online

By the end of this guide, the site will be live at an address like
`https://app.yourdomain.com`, updating itself every time you push new code to GitHub.

Three services, three jobs:

| Service | Job | Cost (check current pricing when you sign up) |
|---|---|---|
| **GitHub** | Stores the code and its history | Free |
| **Render** | Runs the site and its Postgres database | Roughly $15–25/month for a small paid web service plus database |
| **A domain registrar** (Cloudflare, Porkbun or Namecheap) | Your address | About $10–15/year |

Optional add-ons, covered at the end: Cloudflare R2 for uploaded files (free at small
sizes), a Claude API key for AI summaries (pay per use), and an email service for reminders.

---

## Part A: Put the code on GitHub

1. Make a free account at https://github.com if you don't have one.
2. Create an organization for the business: your profile picture → **Your organizations** → **New organization** → Free plan. Name it something like `blackmagic-media`.
3. In the organization, click **New repository**. Name it `showday-prep`. Choose **Private**. Don't add a README (you already have one). Click **Create**.
4. GitHub shows a box of commands under "…or push an existing repository from the command line". In your terminal, inside the `showday-prep` folder, first run:

   ```bash
   git init
   git add .
   git commit -m "MagicShow: first version"
   ```

   Then copy and run the three lines GitHub shows you (they start with `git remote add origin`, `git branch -M main` and `git push`).

5. Refresh the GitHub page. Your files are there. Check that **`.env` and `db.sqlite3` are NOT** in the list. (`.gitignore` keeps them out. If you see them, stop and remove them before going further.)

**From now on, saving your work to GitHub is three commands:**

```bash
git add .
git commit -m "Describe what you changed"
git push
```

> Prefer clicking to typing? GitHub Desktop (https://desktop.github.com) does the same thing with buttons.

## Part B: Put the site on Render

1. Make an account at https://render.com and connect your GitHub account when it asks.
2. Click **New** → **Blueprint**. Pick the `showday-prep` repository.
3. Render reads `render.yaml` and shows what it will create: a web service called `showday-prep` and a database called `showday-db`. Click **Apply**.
4. It asks for `ANTHROPIC_API_KEY`. Leave it blank for now (the AI button stays hidden) or paste your key (see Part E).
5. Wait for the build (about 3–5 minutes). The log ends with "Your service is live".
6. Render gives you an address like `https://showday-prep.onrender.com`. Before it works, go to the web service → **Environment** and set `ALLOWED_HOSTS` to that address without `https://` (for example `showday-prep.onrender.com`). Save; it redeploys.

**Create your login on the live site.** In Render, open the web service → **Shell** tab, then run:

```bash
python manage.py createsuperuser
python manage.py setup_org "Blackmagic Media" --user YOUR_USERNAME
python manage.py import_prototype data/prototype-export.json --org "Blackmagic Media"
```

Open the Render address, log in, and your events are there.

> If the Shell tab isn't available on your plan, run the same commands on your own computer
> with `DATABASE_URL` in `.env` set to the database's **External Database URL** (Render →
> showday-db → Connect). Put `DATABASE_URL` back to blank afterwards.

**Every push to GitHub now redeploys automatically.** Render runs `build.sh`, which installs
packages, gathers the CSS/JS, and applies database changes.

## Part C: Your domain

1. Decide the product name first (it's an open question in the brief). Then buy the `.com` at
   Cloudflare (https://www.cloudflare.com/products/registrar/), Porkbun or Namecheap.
2. In Render → web service → **Settings** → **Custom Domains** → **Add**. Type `app.yourdomain.com`.
3. Render shows a **CNAME** record to create. At your registrar, open **DNS** and add:
   - Type: `CNAME`
   - Name: `app`
   - Target: the address Render shows (like `showday-prep.onrender.com`)
4. Back in Render, click **Verify**. It turns on https by itself within a few minutes to an hour.
5. In Render → **Environment**, change `ALLOWED_HOSTS` to include the new address, separated by a comma:
   `app.yourdomain.com,showday-prep.onrender.com`

The plain `yourdomain.com` stays free for a marketing page later (what it does, pricing, sign-up).

## Part D: Keep uploaded files safe (Cloudflare R2)

Render's own disk is wiped every time the site redeploys, so **uploads stored there disappear**.
Before you rely on uploads, move them to Cloudflare R2 (free for the first 10 GB at the time
of writing; check current terms):

1. In Cloudflare: **R2** → **Create bucket** → name it `showday-files`.
2. **R2** → **Manage API tokens** → **Create API token** with "Object Read & Write" for that bucket.
   Copy the **Access Key ID**, **Secret Access Key**, and the **S3 endpoint** (looks like
   `https://<account-id>.r2.cloudflarestorage.com`).
3. In Render → **Environment**, set:
   - `USE_S3` = `True`
   - `AWS_ACCESS_KEY_ID` = the access key
   - `AWS_SECRET_ACCESS_KEY` = the secret
   - `AWS_STORAGE_BUCKET_NAME` = `showday-files`
   - `AWS_S3_ENDPOINT_URL` = the endpoint
4. Save. New uploads now go to R2 and survive redeploys.

## Part E: Turn on the Reports page's AI status summary (optional)

The per-event AI meeting summary was removed in the final version. This key now only powers
the "AI status summary" button on the Reports page. Leave it blank to keep AI off.


1. Make an account at https://console.anthropic.com, add a payment method, and create an **API key**.
2. In Render → **Environment**, set `ANTHROPIC_API_KEY` to that key.
3. Leave `CLAUDE_MODEL` as is, or change it to a current model name from https://docs.claude.com.

Each summary costs a few cents. Set a monthly spending limit in the Anthropic console.

## Part F: Reminder emails

1. Sign up for an email sending service such as Resend or Postmark, and verify your domain with it (they walk you through adding DNS records).
2. In Render → **Environment**, set `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` and `DEFAULT_FROM_EMAIL` using the SMTP details the service gives you.
3. Make sure every user has an email address (in /admin/ → Users).
4. In Render: **New** → **Cron Job** → same repository.
   - Command: `python manage.py send_reminders`
   - Schedule: `0 12 * * *` (every day at 12:00 UTC, which is 8 AM in Kalamazoo during daylight time)
   - Copy the same Environment values from the web service.

Test it first from the Shell: `python manage.py send_reminders --dry-run`

## Before you share the live site with anyone

- [ ] `DEBUG` is `False` on Render (it is, from `render.yaml`)
- [ ] `.env` is not on GitHub
- [ ] You can log in at `https://app.yourdomain.com` and the padlock shows in the browser
- [ ] Uploaded files survive a redeploy (Part D done)
- [ ] `python manage.py test` passes on your computer
- [ ] Every team member has their own login (no shared passwords)
