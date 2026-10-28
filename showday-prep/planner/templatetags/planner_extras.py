"""planner/templatetags/planner_extras.py — [beta] small helpers for the page templates."""
from django import template

from ..schedule import due_date, fmt_date

register = template.Library()


@register.filter
def stepdate(offset, event):
    """A checklist step's offset (days from show day) → its date, e.g. "Fri Jul 10"."""
    try:
        return fmt_date(due_date(event, int(offset)), True)
    except (TypeError, ValueError):
        return ""
