"""
planner/budget.py — [v3] budget totals, in Python.

The Budget tab calculates these in the browser (static/planner/js/budget.js).
This is the same math for the server: the AI summaries, the checks and the
reports use it. "Projected" means the actual amount if one is entered,
otherwise the estimate.
"""
from decimal import Decimal

ZERO = Decimal("0")


def _proj(line):
    """Projected amount. [beta] For income, minus the fees a ticket platform kept."""
    v = line.actual if line.actual is not None else (line.est or ZERO)
    return v - (line.fees or ZERO) if line.kind == "income" else v


def budget_summary(event):
    lines = list(event.budget_lines.all())
    costs = [b for b in lines if b.kind == "cost"]
    income = [b for b in lines if b.kind == "income"]
    cap = event.budget_total or ZERO
    proj_cost = sum((_proj(b) for b in costs), ZERO)
    paid = sum((b.paid or ZERO for b in costs), ZERO)
    owed = sum((max(ZERO, _proj(b) - (b.paid or ZERO)) for b in costs if b.status in ("committed", "invoiced")), ZERO)
    ticket_lines = [b for b in income if b.cat == "Tickets" and (b.est is not None or b.actual is not None)]
    projected_tickets = Decimal(event.target or 0) * (event.price_adv or ZERO)
    # [beta] Vendor fees tracked on the group lists replace any "Vendor fees" income lines.
    roster_fees = [c for c in event.contacts.all() if c.roster and c.fee is not None]
    vendor_fees = sum((c.fee for c in roster_fees), ZERO)
    skip = {"Tickets"} | ({"Vendor fees"} if roster_fees else set())
    other_income = sum((_proj(b) for b in income if b.cat not in skip), ZERO) + vendor_fees
    ticket_income = sum((_proj(b) for b in ticket_lines), ZERO) if ticket_lines else projected_tickets
    proj_income = other_income + ticket_income
    return {
        "cap": cap, "proj_cost": proj_cost, "paid": paid, "owed": owed,
        "proj_income": proj_income, "net": proj_income - proj_cost, "left": cap - proj_cost
    }


def usd(v):
    """Decimal('1500.00') → '$1,500'; Decimal('12.5') → '$12.50'."""
    v = v or ZERO
    sign = "−" if v < 0 else ""
    v = abs(v)
    return f"{sign}${v:,.0f}" if v == int(v) else f"{sign}${v:,.2f}"
