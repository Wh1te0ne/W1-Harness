// The notification state is independent of DSH's main-view acknowledgement:
// a selected session is still unread while the desktop window is in the background.
export class ReminderState {
  running = new Map();
  pending = new Map();
  unread = new Map();
  failures = new Set();
  baseline(rows) {
    this.running = new Map(rows.map(row => [row.id, row.running]));
    this.pending.clear();
    this.failures.clear();
  }
  status(id, running) {
    const before = this.running.get(id);
    this.running.set(id, running);
    if (running) { this.failures.delete(id); return null; }
    if (before !== true || this.failures.has(id) || this.pending.has(id)) return null;
    return { id, kind: 'complete' };
  }
  error(id) { this.failures.add(id); return { id, kind: 'error' }; }
  interaction(id, item) {
    if (!item) { this.pending.delete(id); return null; }
    const key = item.key;
    if (this.pending.get(id) === key) return null;
    this.pending.set(id, key);
    return { id, key, kind: item.kind === 'approval' ? 'approval' : 'question' };
  }
  add(event) {
    const previous = this.unread.get(event.id);
    this.unread.set(event.id, { ...event, count: (previous?.count ?? 0) + 1, time: Date.now() });
  }
  acknowledge(id) { return this.unread.delete(id); }
  remove(id) {
    this.running.delete(id); this.pending.delete(id); this.failures.delete(id);
    this.unread.delete(id);
  }
  get count() { return [...this.unread.values()].reduce((n, item) => n + item.count, 0); }
}
