# Submission Notes

## What I'd test next with more time

- **Input sanitization beyond type/emptiness.** Right now `title`,
  `description`, and `assignee` accept any non-empty string — no length
  caps, no handling for things like HTML/script content if this were ever
  rendered in a UI.
- **`getStats` under load** — with a large number of tasks, `overdue`
  calculation walks the full array on every call. Not a correctness
  issue at this scale, but I'd want a benchmark test if this were meant
  to run against thousands of tasks.

I also noticed `GET /tasks` originally treated `status` and
`page`/`limit` as mutually exclusive — there was no way to filter by
status *and* paginate at the same time. Since I had extra time, I went
ahead and added a `getFiltered` helper plus route logic to support both
together (e.g. `GET /tasks?status=todo&page=2&limit=5`), with its own
tests. It uses an exact status match rather than the substring match
`getByStatus` currently uses, so it doesn't carry that bug forward.

## What surprised me in the codebase

- The **pagination offset bug** was the biggest one — `page=1` silently
  skipped the first page's worth of results, which means pagination was
  effectively unusable through the documented API as shipped. It only
  surfaces once you actually assert on *which* items come back, not just
  the count, which is probably why it went unnoticed.
- The **status filter using `.includes()` instead of `===`** was subtle —
  it works correctly for the three real status values (they don't happen
  to be substrings of each other), so manual testing with valid inputs
  never catches it. It only shows up with a malformed/partial query
  value.
- `completeTask` resetting `priority` back to `'medium'` looked like a
  copy-paste leftover rather than intentional behavior — nothing in the
  spec suggests completing a task should touch priority at all.

## Questions I'd ask before shipping this to production

1. Is the in-memory store intentional for this stage, or is a real
   database planned? That changes how much effort is worth putting into
   things like concurrency handling.
2. For `PATCH /tasks/:id/assign` — should there be a fixed list of valid
   assignees (e.g. team members), or is any free-text name acceptable
   long-term? Right now it accepts anything non-empty.
3. Is there a plan for auth/authorization? Right now any client can
   create, update, delete, or assign any task with no ownership or
   permission checks.

## A feature idea I had while working on this

While building the `assign` endpoint, I kept thinking this API is a
natural fit for an **AI-assisted task planner** — something that looks at
all open tasks (with their `priority`, `dueDate`, and `assignee`) and
suggests a completion schedule to hit deadlines, factoring in priority
and current workload per assignee. It wouldn't need much new
infrastructure since the data model already has everything a scheduler
would need (`priority`, `dueDate`, `status`, now `assignee`) — it'd
mostly be a new read-only endpoint that reasons over the existing task
list rather than a structural change. Happy to sketch this out further
if it's something the team would find useful.