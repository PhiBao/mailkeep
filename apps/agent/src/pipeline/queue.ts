import type { PipelineDeps } from './run.js';
import { runLetter } from './run.js';

export class PipelineQueue {
  private active = 0;
  private waiting: Array<{
    letterId: string;
    resolve: () => void;
    reject: (error: unknown) => void;
  }> = [];
  private pending = new Map<string, Promise<void>>();

  constructor(private readonly deps: PipelineDeps) {}

  enqueue(letterId: string): Promise<void> {
    const existing = this.pending.get(letterId);
    if (existing) return existing;
    const promise = new Promise<void>((resolve, reject) => {
      this.waiting.push({ letterId, resolve, reject });
    });
    this.pending.set(letterId, promise);
    void this.pump();
    return promise;
  }

  private async pump(): Promise<void> {
    while (this.active < 2 && this.waiting.length > 0) {
      const item = this.waiting.shift();
      if (!item) return;
      this.active += 1;
      try {
        await runLetter(this.deps, item.letterId);
        item.resolve();
      } catch (error) {
        item.reject(error);
      } finally {
        this.active -= 1;
        this.pending.delete(item.letterId);
      }
    }
    if (this.waiting.length > 0) void this.pump();
  }
}

export async function resumePending(deps: PipelineDeps): Promise<void> {
  const rows = deps.db
    .prepare(
      "SELECT id FROM letters WHERE status IN ('queued','reading','recalling','deciding','acting') ORDER BY created_at",
    )
    .all() as Array<{ id: string }>;
  if (rows.length === 0) return;
  const queue = new PipelineQueue(deps);
  await Promise.all(rows.map((row) => queue.enqueue(row.id)));
}
