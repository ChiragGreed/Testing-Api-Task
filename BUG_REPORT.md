# Bug Report

Found while writing unit and integration tests for the Task Manager API
(see `tests/taskService.test.js` and `tests/tasks.routes.test.js` for the
tests that pin down this behavior — look for test names prefixed `BUG:`).

---

## Bug 1: Pagination returns the wrong page (off-by-one offset)

**Location:** `src/services/taskService.js`, `getPaginated()`

```js
const getPaginated = (page, limit) => {
  const offset = page * limit;
  return tasks.slice(offset, offset + limit);
};
```

**Expected behavior:**
`GET /tasks?page=1&limit=10` should return the *first* 10 tasks (items 1–10),
since page numbering here is 1-based (the route handler defaults an
unspecified page to `1`).

**Actual behavior:**
`page=1` computes `offset = 1 * 10 = 10`, which skips the first 10 tasks and
returns items 11–20 instead. Page 1 never shows the first `limit` items —
every page is effectively shifted forward by one page's worth of results,
and the true first page of data is never reachable through the API.

**How discovered:**
While writing a unit test for `getPaginated`, I seeded 25 tasks and asserted
that `getPaginated(1, 10)` returns the task titled `"Task 1"` first. The
assertion failed — the first item returned was `"Task 11"`.

**Suggested fix:**
Offset should be based on `(page - 1)`, since page 1 means "no items
skipped":

```js
const offset = (page - 1) * limit;
```

---

## Bug 2: Status filter matches on substring instead of exact value

**Location:** `src/services/taskService.js`, `getByStatus()`

```js
const getByStatus = (status) => tasks.filter((t) => t.status.includes(status));
```

**Expected behavior:**
`GET /tasks?status=X` should return only tasks whose status is *exactly*
`X` (one of `todo`, `in_progress`, `done`).

**Actual behavior:**
Because it uses `String.prototype.includes` instead of an equality check,
a partial value can match multiple statuses. For example, querying
`?status=do` returns both `todo` tasks and `done` tasks, because `"done"`
contains the substring `"do"`. Querying `?status=progress` would also
incorrectly match `in_progress`. This doesn't surface with the exact enum
values themselves (`todo` vs `done` don't happen to overlap), which is why
it's easy to miss during manual testing with valid status values — it only
appears with partial/malformed query values.

**How discovered:**
While writing a test for edge cases around `getByStatus`, I tried an
intentionally partial status string (`"do"`) rather than only the three
valid enum values, and got back tasks from two different statuses instead
of zero or a validation error.

**Suggested fix:**
Use strict equality instead of substring matching:

```js
const getByStatus = (status) => tasks.filter((t) => t.status === status);
```

(Optionally, the route could also validate `status` against
`VALID_STATUSES` up front and return `400` for anything else, the same way
`validateCreateTask`/`validateUpdateTask` do — right now an invalid status
silently returns an empty or partially-matched list rather than an error.)

---

## Bug 3: Completing a task silently resets its priority

**Location:** `src/services/taskService.js`, `completeTask()`

```js
const completeTask = (id) => {
  const task = findById(id);
  if (!task) return null;

  const updated = {
    ...task,
    priority: 'medium',
    status: 'done',
    completedAt: new Date().toISOString(),
  };
  ...
};
```

**Expected behavior:**
`PATCH /tasks/:id/complete` should mark a task as done and stamp
`completedAt`, without changing unrelated fields like `priority`.

**Actual behavior:**
Every call to `completeTask` unconditionally overwrites `priority` to
`'medium'`, regardless of what it was before. A `high`-priority task
marked complete silently loses that information.

**How discovered:**
Unit test: created a task with `priority: 'high'`, called `completeTask`,
and asserted the priority was unchanged. The assertion failed — the
returned task had `priority: 'medium'`.

**Suggested fix:**
Drop the `priority` override and only change `status` and `completedAt`:

```js
const updated = {
  ...task,
  status: 'done',
  completedAt: new Date().toISOString(),
};
```

---

## Summary

| # | Bug | Severity | Fixed in this submission? |
|---|-----|----------|----------------------------|
| 1 | Pagination offset is off by one page | High — pagination is unusable as-is | See note below |
| 2 | Status filter substring match | Medium — only triggers on partial/malformed input | No |
| 3 | `completeTask` resets priority | Medium — silent data loss on a common action | No |

I fixed **Bug 1** (pagination) for this submission since it breaks the
feature on its main, documented use case rather than only on malformed
input — see the "Fix" section of the submission notes for details and the
updated tests.
