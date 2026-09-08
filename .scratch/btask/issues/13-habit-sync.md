# 13: Habit sync

**What to build:** A single idempotent command that mirrors habitui's daily state into btask, safe to run at every session start.

**Blocked by:** 12: Archive flag.

**Status:** ready-for-agent

- [ ] `habits sync [--date]` ensures a per-day `Daily habits YYYY-MM-DD` goal matched by machine marker, with one linked sub-task per due-today habit (date-qualified links so days never collide)
- [ ] Current counts pushed through the advance-only rule; removed habits left untouched
- [ ] Prior days' open daily goals archived (no artifact, subs attached); reruns change nothing
