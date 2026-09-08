# Habit agent flow

How an external habit tracker (e.g. habitui) keeps btask in sync. btask never owns streaks, schedules, or goals — it mirrors them.

## Session start: sync

```bash
btask habits sync
```

Pulls the day summary, ensures a per-day `Daily habits YYYY-MM-DD` goal with one linked sub-task per due habit, pushes current counts, and archives prior open daily goals. Idempotent — reruns change nothing. `--date` overrides the day.

## Startup: pull

On session start, read the current state (works offline, no daemon needed):

```bash
btask habits
```

This delegates to habitui's day summary and returns due-and-incomplete habits. `btask habits --local` reads btask's own habit flags instead.

## On completion: push

When a habit is completed in the tracker, push it so open TUIs update instantly over WebSocket:

```bash
btask habits push \
  --external-id "habitui:5" \
  --title "Read" \
  --date 2026-09-08 \
  --count 2 --goal 2 \
  --actor "habit-agent"
```

Rules the push follows:

- First push for an `externalId` creates a linked habit task; later pushes update the same task (titles sync).
- Status only advances (`todo` → `in_progress` → `finished`); a lower count never regresses a finished task.
- Goal met (`count >= goal`) marks the task finished with the push's actor.
- Discovery (`BTASK_URL`, port file, default) and daemon delegation apply as usual; offline pushes fall back to the direct DB.

## Equivalent HTTP

```bash
curl -s -X POST localhost:3000/api/v1/habits/completions \
  -d '{"externalId":"habitui:5","title":"Read","date":"2026-09-08","completionCount":2,"goal":2,"actor":"habit-agent"}'
```

Change events arrive on the `/events` WebSocket with the push's actor attached.
