// Drafts survive gallery re-renders and refreshes. Only acknowledged saves clear them.
export class PortfolioDraft {
  constructor() { this.base = new Map(); this.edits = new Map(); this.order = []; this.savedOrder = []; }
  merge(rows) {
    const pendingOrder = this.orderDirty;
    const server = new Map(rows.map(row => [row.id, row]));
    for (const [id, row] of this.base) if (this.edits.has(id)) server.set(id, row);
    this.base = server;
    this.savedOrder = rows.map(row => row.id);
    this.order = pendingOrder
      ? [...this.order.filter(id => server.has(id)), ...rows.map(row => row.id).filter(id => !this.order.includes(id))]
      : [...this.savedOrder, ...[...this.edits.keys()].filter(id => !rows.some(row => row.id === id) && this.base.has(id))];
  }
  row(id) { return { ...this.base.get(id), ...this.edits.get(id) }; }
  get rows() { return this.order.map(id => this.row(id)); }
  get orderDirty() { return this.order.join(',') !== this.savedOrder.join(','); }
  get dirty() { return this.edits.size > 0 || this.orderDirty; }
  edit(id, patch) {
    const next = { ...this.edits.get(id), ...patch };
    for (const key of Object.keys(next)) if (next[key] === this.base.get(id)[key]) delete next[key];
    if (Object.keys(next).length) this.edits.set(id, next); else this.edits.delete(id);
  }
  move(id, target) {
    const from = this.order.indexOf(id), to = this.order.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    this.order.splice(from, 1); this.order.splice(to, 0, id);
  }
  accept(row) { this.base.set(row.id, row); this.edits.delete(row.id); }
  acceptOrder(rows) { this.merge(rows); this.order = rows.map(row => row.id); this.savedOrder = [...this.order]; }
  remove(id) {
    this.base.delete(id); this.edits.delete(id);
    this.order = this.order.filter(value => value !== id);
    this.savedOrder = this.savedOrder.filter(value => value !== id);
  }
}
