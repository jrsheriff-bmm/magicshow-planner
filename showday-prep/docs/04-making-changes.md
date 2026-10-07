# 4. Making changes

You don't have to write code from scratch to change this site. Most changes follow a
pattern that's already in the code, and an AI helper (Claude, or Claude Code inside
VS Code) can make the edit while you read, check and test it.

## The safe routine (every change, every time)

1. **Start from a clean save.** In the terminal: `git status`. It should say "nothing to commit".
   If not, commit what's there first (`git add .` then `git commit -m "..."`).
2. **Make the change** (yourself or with an AI helper).
3. **Run the site** (`python manage.py runserver`) and try the thing you changed, plus one or two things you didn't.
4. **Run the tests**: `python manage.py test`. Everything should say OK.
5. **Save and send**: `git add .`, `git commit -m "What you changed"`, `git push`. Render redeploys.

**Made a mess?** Before committing, this throws away every change since your last commit:

```bash
git restore .
```

(Careful: it can't be undone. That's why step 1 matters.)

## Working with an AI helper

Good results come from giving the helper the right files and asking for the smallest change.
Copy these and fill in the blanks.

**To make a change:**

> I'm working on a Django project called MagicShow. I can read code but not write it,
> so please explain each change in plain words. Here's how the project is organized:
> [paste the table from docs/02-how-it-works.md]. I want to: [describe the change].
> Here are the files I think are involved: [paste the files]. Make the smallest change
> that works, tell me exactly which lines to replace in which file, and tell me how to test it.

**To fix an error:**

> My Django site shows this error: [paste the full red text from the terminal or the browser].
> It happened when I [what you clicked]. Here's the file the error mentions: [paste it].
> What's wrong, in plain words, and what's the exact fix?

**To understand something:**

> Explain what this function does, line by line, like I'm new to Python: [paste it]

**Claude Code** (installed in VS Code or a terminal) can read the whole project itself, run
the tests, and make the edits. Point it at this folder and give it the same kind of request.
Always read what it changed (in VS Code's Source Control panel) before committing.

---

## Worked example 1: add a "Cost" column to the equipment check

This shows the pattern for adding **any** new piece of information. The same five steps
work for a new field on deadlines, contacts, paperwork, anything.

**Step 1. Add the column to the database table** in `planner/models.py`, inside `class EquipmentItem`,
under the `notes` line:

```python
    cost = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
```

**Step 2. Tell the database.** In the terminal:

```bash
python manage.py makemigrations
python manage.py migrate
```

Django writes a new file in `planner/migrations/` describing the change. Commit it with your code.

**Step 3. Send it to the screens.** In `planner/serializers.py`, find the `"equipment": [` block
inside `event_to_dict` and add `"cost"` to the dictionary:

```python
            {"id": q.id, "item": q.item, "cat": q.cat, "qty": q.qty, "source": q.source,
             "owner": q.owner, "status": q.status, "notes": q.notes, "cost": num_out(q.cost)}
```

**Step 4. Accept it back from the screens.** Still in `serializers.py`, find `def fill_equipment`
and add one line:

```python
        o.cost = num(r.get("cost"))
```

**Step 5. Show it on screen.** In `planner/static/planner/js/views.js`, find `function equipmentHTML`
and make three small edits inside it:

1. In the table header, change `<th>Qty</th>` to `<th>Qty</th><th>Cost ($)</th>`.
2. In the row, find this piece (it sits right after the quantity box):

   ```javascript
   +'</td><td>'+sel('equipment',e.id,'source'
   ```

   and change it to:

   ```javascript
   +'</td><td>'+inp('equipment',e.id,'cost',e.cost==null?'':e.cost,'number',' min="0" step="0.01"')+'</td><td>'+sel('equipment',e.id,'source'
   ```

3. Change both `colspan="8"` to `colspan="9"` in that function (so the category and empty rows still span the whole table).

You don't need to touch `actions.js`: the `data-edit="equipment|id|cost"` that `inp()` creates is
handled automatically.

Test: add a cost, refresh the page, and check it's still there.

## Worked example 2: add an event template

Templates live only in `planner/static/planner/js/templates.js`. Copy a whole block inside
`const TEMPLATES = [ ... ]` (from `{key:` to its closing `},`), paste it below, then change:

- `key`: a short unique word, like `'poetryfest'`
- `label`, `scale`, `desc`: what people see
- `ms`: deadlines as `['Title', -days before, phase 1–4, true if hard]`
- `setup`, `prog`, `cp`, `eq`: follow the format explained at the top of the file

Refresh the browser. The new template shows on the home page and in "New event".

## Worked example 3: change the accent color

In `planner/static/planner/css/app.css`, find `--accent:#5A3BC2` near the top. Change the color
code in all three places it appears (light mode, and the two dark-mode blocks, where it's a
lighter shade). Keep enough contrast: white text must stay readable on it.

## Worked example 4: change what the Reports AI summary includes

Open `planner/ai.py`. `PORTFOLIO_INSTRUCTIONS` is the request Claude gets; edit its sentences
like normal writing. `draft_portfolio` builds one line of facts per upcoming event; add to that
line to give it more to work with. (The per-event AI meeting summary was removed in the final
version.)

## Where to look for common requests

| "I want to…" | Look in |
|---|---|
| Change wording on a screen | `static/planner/js/views.js` (search for the words) |
| Change a button's behavior | `views.js` for its `data-act` name, then that name in `actions.js` |
| Add or rename a tab | `TABS` in `helpers.js`, plus a new `...HTML` function in `views.js` |
| Change statuses (like equipment steps) | `EQ_STATUS` etc. in `helpers.js` and the matching lists in `planner/models.py` and `serializers.py` |
| Add a new automatic check | `runChecks` in `core.js` (screens), and `planner/checks.py` if emails/AI should know |
| Change the vendor/performer share page | `planner/templates/planner/share.html` and `share_page` in `planner/views.py` |
| Change reminder email wording | `planner/emails.py` (and `templates/planner/email.html` for the look) |
| Change reminder timing (who, when) | `planner/reminders.py` **and** `static/planner/js/reminders.js`, so the preview still matches |
| Add a budget category | `COST_CATS` or `INCOME_CATS` in `js/helpers.js` |
| Change starter budget lines for a template | `BUD` in `js/templates.js` |
| Change PDF/Word layouts | `exportDoc`, `toPDF`, `toWord` in `core.js` |

## Rules that save you pain

- Never edit files in `planner/migrations/` by hand, and never delete them once pushed.
- Never put passwords or API keys in code files. They go in `.env` (your computer) or Render's Environment tab.
- One change per commit, with a message that says what and why.
- When you fix a bug, ask your AI helper to add a test for it in `planner/tests.py`, so it can't quietly come back.
