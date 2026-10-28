# 5. What's next

## Done in this version

Everything from the version 2 prototype, plus what the prototype couldn't do:
real logins, a real database, private share links, live calendar subscriptions,
server-side file storage, AI summaries through your own API key, reminder emails,
an admin back office, deployment files for Render, and automatic tests.

## Done in version 3

Budget tab with invoices, reminder emails with "Mark done", My tasks links, per-person
downloads, approvals by email, Reports (current and past events), Wrap-up, and your own
templates (save, copy, rename, delete, start empty and pick pieces).

## Done in version 4

One login across several client workspaces, three consulting templates (event coverage,
interview story, camera training), deadlines after show day, and the Hours page with the
monthly retainer.

## Done in the beta

The 13 ranked changes from Mia's session and JR's call: dated checklist steps, the feedback inbox
and error capture, plain-language help, your own groups, list import and group email,
festival layout pieces, organizations with join requests and invite links, series, contact tags,
the usage log and Testing report, "attendance not counted", ticketing and vendor fees, and
custom tabs. Details in docs/10.

## Next up (from the brainstorm)

| Idea | Notes |
|---|---|
| Google / Microsoft calendar and email connection | Deferred on purpose. The live calendar feeds already work with both. A real connection needs Google and Microsoft app approval, which takes weeks |
| Invoice Ninja | Create quotes and invoices from a budget line; show paid status automatically |
| Show-day text messages | Twilio, for people who don't read email |
| Import past events | Enter 2–3 past shows with their wrap-ups so Reports has history from day one |

## Known limits (worth knowing before real events)

| Limit | What it means | When to fix |
|---|---|---|
| Reminder emails need a daily job | Nothing sends until the daily command is scheduled (docs/06, step 6) |
| Approvals shown on screen refresh on reload | If someone approves by email while you have the page open, refresh to see it |
| Last save wins | If two people edit the **same event** at the same moment, the later save overwrites the earlier one. Different events are fine | Before more than 2–3 people edit at once. Fix: have the server reject a save when the event changed since it was loaded, and ask the person to refresh |
| No live updates | If JR changes something, you see it after refreshing | Same time as above |
| Sign-up is free and open | Anyone can create an account at /signup/, and nothing charges them yet. Until payments are connected, set `SIGNUP_CODE` so only people you give the code to can sign up, or `ALLOW_SIGNUP=False` to close it (docs/08) | Before advertising the address. Next step: Stripe subscriptions tied to each workspace's plan |
| New accounts aren't asked to confirm their email | A mistyped email still makes an account; that person just can't reset their password | With payments |
| Seats aren't limited or charged | Owners can now invite as many members as they like (Team page). Nothing counts seats against a plan yet | With payments |
| Group lists import up to 2,000 rows at a time | Larger files are cut at 2,000 with a message. Excel files are read with a library loaded from the internet (cdnjs), like the PDF maker | Only if a list is bigger |
| Itinerary emails go out one by one while you wait | One press sends to at most 500 people (press again for the rest with “Only people who haven’t had it”). Thousands would need a background job | If a group passes about 500 |
| Word files are .doc, not .docx | They open fine in Word and Google Docs | Only if a client asks |
| Floor-plan uploads are images only | PDFs of floor plans need converting to PNG/JPG first | Low priority |
| The PDF maker loads from the internet (cdnjs) | Download PDF fails if that site is blocked | Low priority: copy the file into `static/` |

## Recommended order from here

1. **Run it on your computer** (guide 1) and click through everything with Ep. 4.
2. **Put it online** (guide 3, parts A–D) before Mystic Music Ep. 4, and use it for the show.
   Send the Vendors and Performers private links instead of PDFs.
3. **Keep using the Notes button.** Notes now save to the real database, and you can read them in /admin/ → Notes.
4. **Decide the name and buy the domain** (guide 3, part C).
5. **After Ep. 4:** review the notes, then pick the next build. Strong candidates:
   - Save conflict protection (see "Last save wins" above)
   - Vendors and artists checking off their own items through their share link
   - Invoice Ninja: create quotes/invoices from the People tab through its API, and show signed/paid status
   - A Venue organization type with its own home screen (the Bell's idea)
   - Sign-up, Stripe subscriptions and the marketing page, when you're ready to sell

## Keeping it healthy

- Update packages every few months: `pip install -r requirements.txt --upgrade`, run the tests, then commit.
- Django 5.2 is a long-term support release, supported with security fixes into 2028.
- Render keeps daily database backups on paid Postgres plans. Check that they're turned on.
- Download a copy of your data now and then from /admin/, or ask your AI helper for an "export all events to JSON" command modeled on `import_prototype`.
