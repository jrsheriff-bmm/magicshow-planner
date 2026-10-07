"""
planner/ai.py — the Reports page's optional AI status summary, using the Claude API.

[final] The per-event "AI meeting summary" was removed: every part of the plan can be
downloaded instead. What's left is the one summary across all upcoming events on the
Reports page. It stays switched off unless ANTHROPIC_API_KEY is set, and each draft
costs a small amount on your Anthropic account (console.anthropic.com).

Settings used (see .env.example): ANTHROPIC_API_KEY and CLAUDE_MODEL.
"""
from django.conf import settings

from datetime import date

from .budget import budget_summary, usd
from .checks import run_checks
from .schedule import fmt_long

PORTFOLIO_INSTRUCTIONS = (
    "You are writing a short status update for a supervisor who oversees several events. "
    "Using ONLY the facts below, write plain text with no markdown symbols. Headings on their own lines: "
    "Overall, Needs attention, On track, Money, Decisions needed. Under each heading use short lines starting with \"- \". "
    "Under 300 words. Do not invent anything."
)


def draft_portfolio(org):
    """[v3] One summary across every upcoming event (the Reports page's AI button)."""
    import anthropic
    from .serializers import event_queryset

    today = date.today()
    lines = []
    for event in event_queryset(org).filter(date__gte=today):
        checks = run_checks(event)
        urgent = [c["text"] for c in checks if c["level"] == "critical"]
        review = [c["text"] for c in checks if c["level"] == "warning"]
        status = "Behind" if urgent else "At risk" if review else "On track"
        ms = list(event.milestones.all())
        done = sum(1 for m in ms if m.status == "done")
        b = budget_summary(event)
        pending = sum(1 for a in event.approvals.all() if a.status == "pending")
        lines.append(f"- {event.name} on {fmt_long(event.date)} ({(event.date - today).days} days away): {status}; "
                     f"deadlines {done}/{len(ms)} done; budget {usd(b['cap']) if b['cap'] else 'not set'}, projected cost {usd(b['proj_cost'])}, "
                     f"projected net {usd(b['net'])}; approvals waiting: {pending}"
                     + (f". Issues: {' | '.join((urgent + review)[:6])}" if urgent or review else ""))
    prompt = PORTFOLIO_INSTRUCTIONS + f"\n\nToday is {fmt_long(today)}.\nEvents:\n" + ("\n".join(lines) or "- No upcoming events.")
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = client.messages.create(model=settings.CLAUDE_MODEL, max_tokens=900, messages=[{"role": "user", "content": prompt}])
    return "".join(block.text for block in message.content if getattr(block, "type", "") == "text").strip()
