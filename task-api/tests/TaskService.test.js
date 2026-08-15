const taskService = require('../src/services/taskService');

// Fresh in-memory store before every test so tests don't leak into each other
beforeEach(() => {
  taskService._reset();
});

describe('taskService.create', () => {
  it('creates a task with defaults applied', () => {
    const task = taskService.create({ title: 'Write tests' });

    expect(task.id).toBeDefined();
    expect(task.title).toBe('Write tests');
    expect(task.description).toBe('');
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('medium');
    expect(task.dueDate).toBeNull();
    expect(task.completedAt).toBeNull();
    expect(task.createdAt).toBeDefined();
  });

  it('creates a task with all fields provided', () => {
    const task = taskService.create({
      title: 'Ship feature',
      description: 'Assign endpoint',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2026-12-01T00:00:00.000Z',
    });

    expect(task.description).toBe('Assign endpoint');
    expect(task.status).toBe('in_progress');
    expect(task.priority).toBe('high');
    expect(task.dueDate).toBe('2026-12-01T00:00:00.000Z');
  });

  it('assigns unique ids to each created task', () => {
    const a = taskService.create({ title: 'A' });
    const b = taskService.create({ title: 'B' });

    expect(a.id).not.toBe(b.id);
  });
});

describe('taskService.findById', () => {
  it('returns the matching task', () => {
    const created = taskService.create({ title: 'Findme' });
    const found = taskService.findById(created.id);

    expect(found).toEqual(created);
  });

  it('returns undefined for an id that does not exist', () => {
    expect(taskService.findById('does-not-exist')).toBeUndefined();
  });
});

describe('taskService.getAll', () => {
  it('returns an empty array when there are no tasks', () => {
    expect(taskService.getAll()).toEqual([]);
  });

  it('returns all created tasks', () => {
    taskService.create({ title: 'A' });
    taskService.create({ title: 'B' });

    expect(taskService.getAll()).toHaveLength(2);
  });

  it('returns a copy, not the live internal array', () => {
    taskService.create({ title: 'A' });
    const result = taskService.getAll();
    result.push({ id: 'fake', title: 'Injected' });

    expect(taskService.getAll()).toHaveLength(1);
  });
});

describe('taskService.getByStatus', () => {
  it('returns only tasks with an exact matching status', () => {
    taskService.create({ title: 'Todo task', status: 'todo' });
    taskService.create({ title: 'Done task', status: 'done' });

    const result = taskService.getByStatus('todo');

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Todo task');
  });

  // BUG: getByStatus uses String.includes for matching, which does a
  // substring match instead of an exact match. Filtering by "do" incorrectly
  // matches both "todo" and "done" (since "done".includes("do") is true).
  it('BUG: substring status match incorrectly includes unrelated statuses', () => {
    taskService.create({ title: 'Todo task', status: 'todo' });
    taskService.create({ title: 'Done task', status: 'done' });

    const result = taskService.getByStatus('do');

    // Documents current (buggy) behavior: both tasks are returned even
    // though neither status is literally "do".
    expect(result).toHaveLength(2);
  });

  it('returns an empty array when no task matches', () => {
    taskService.create({ title: 'Todo task', status: 'todo' });

    expect(taskService.getByStatus('in_progress')).toEqual([]);
  });
});

describe('taskService.getPaginated', () => {
  beforeEach(() => {
    for (let i = 1; i <= 25; i++) {
      taskService.create({ title: `Task ${i}` });
    }
  });

  // Fixed: getPaginated now computes offset as `(page - 1) * limit`, so
  // page 1 starts at offset 0 and returns the first `limit` items.
  it('page 1 returns the first "limit" items starting at offset 0', () => {
    const page1 = taskService.getPaginated(1, 10);

    expect(page1[0].title).toBe('Task 1');
    expect(page1).toHaveLength(10);
  });

  it('returns the requested page size', () => {
    const page = taskService.getPaginated(1, 5);
    expect(page).toHaveLength(5);
  });

  it('returns the correct items for page 2', () => {
    const page2 = taskService.getPaginated(2, 10);

    expect(page2[0].title).toBe('Task 11');
    expect(page2).toHaveLength(10);
  });

  it('returns fewer items on the last page when total is not evenly divisible', () => {
    // page=3, limit=10 -> offset 20, leaving 5 of the 25 items.
    const page = taskService.getPaginated(3, 10);
    expect(page).toHaveLength(5);
  });

  it('returns an empty array when offset exceeds the number of tasks', () => {
    const page = taskService.getPaginated(10, 10);
    expect(page).toEqual([]);
  });
});

describe('taskService.getStats', () => {
  it('returns zeroed counts when there are no tasks', () => {
    expect(taskService.getStats()).toEqual({
      todo: 0,
      in_progress: 0,
      done: 0,
      overdue: 0,
    });
  });

  it('counts tasks per status', () => {
    taskService.create({ title: 'A', status: 'todo' });
    taskService.create({ title: 'B', status: 'todo' });
    taskService.create({ title: 'C', status: 'in_progress' });
    taskService.create({ title: 'D', status: 'done' });

    const stats = taskService.getStats();

    expect(stats.todo).toBe(2);
    expect(stats.in_progress).toBe(1);
    expect(stats.done).toBe(1);
  });

  it('counts a task with a past dueDate that is not done as overdue', () => {
    taskService.create({
      title: 'Overdue',
      status: 'todo',
      dueDate: '2000-01-01T00:00:00.000Z',
    });

    expect(taskService.getStats().overdue).toBe(1);
  });

  it('does not count a done task with a past dueDate as overdue', () => {
    taskService.create({
      title: 'Done but past due',
      status: 'done',
      dueDate: '2000-01-01T00:00:00.000Z',
    });

    expect(taskService.getStats().overdue).toBe(0);
  });

  it('does not count a task with a future dueDate as overdue', () => {
    taskService.create({
      title: 'Future',
      status: 'todo',
      dueDate: '2099-01-01T00:00:00.000Z',
    });

    expect(taskService.getStats().overdue).toBe(0);
  });

  it('does not count a task with no dueDate as overdue', () => {
    taskService.create({ title: 'No due date', status: 'todo' });

    expect(taskService.getStats().overdue).toBe(0);
  });
});

describe('taskService.update', () => {
  it('updates only the provided fields', () => {
    const created = taskService.create({ title: 'Original', priority: 'low' });

    const updated = taskService.update(created.id, { title: 'Updated' });

    expect(updated.title).toBe('Updated');
    expect(updated.priority).toBe('low');
  });

  it('returns null when the id does not exist', () => {
    expect(taskService.update('missing-id', { title: 'X' })).toBeNull();
  });
});

describe('taskService.remove', () => {
  it('removes an existing task and returns true', () => {
    const created = taskService.create({ title: 'Delete me' });

    expect(taskService.remove(created.id)).toBe(true);
    expect(taskService.findById(created.id)).toBeUndefined();
  });

  it('returns false when the id does not exist', () => {
    expect(taskService.remove('missing-id')).toBe(false);
  });
});

describe('taskService.assignTask', () => {
  it('sets the assignee on an existing task', () => {
    const created = taskService.create({ title: 'Assign me' });

    const assigned = taskService.assignTask(created.id, 'Priya');
    expect(assigned.assignee).toBe('Priya');
  });

  it('returns null when the id does not exist', () => {
    expect(taskService.assignTask('missing-id', 'Priya')).toBeNull();
  });

  it('allows re-assigning a task that already has an assignee', () => {
    const created = taskService.create({ title: 'Reassign me' });
    taskService.assignTask(created.id, 'Priya');

    const reassigned = taskService.assignTask(created.id, 'Rohit');

    expect(reassigned.assignee).toBe('Rohit');
  });
});

describe('taskService.completeTask', () => {
  it('sets status to done and stamps completedAt', () => {
    const created = taskService.create({ title: 'Finish me', priority: 'high' });

    const completed = taskService.completeTask(created.id);

    expect(completed.status).toBe('done');
    expect(completed.completedAt).not.toBeNull();
  });

  it('returns null when the id does not exist', () => {
    expect(taskService.completeTask('missing-id')).toBeNull();
  });

  // BUG: completeTask unconditionally resets priority to 'medium'. Marking
  // a high-priority task complete silently downgrades its priority, which
  // isn't part of the documented behavior ("mark as complete").
  it('BUG: completing a task silently resets its priority to medium', () => {
    const created = taskService.create({ title: 'High priority', priority: 'high' });

    const completed = taskService.completeTask(created.id);

    // Documents current (buggy) behavior.
    expect(completed.priority).toBe('medium');
  });
});