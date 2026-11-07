import { randomUUID } from 'node:crypto';
import { publicError } from './errors.js';
import type { BiliService } from './service.js';

export interface Task {
  id: string;
  operation: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  stage: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  elapsed_ms: number;
  stages: { stage: string; at: string }[];
  error?: ReturnType<typeof publicError>;
}

// Process-local, bounded, and deliberately free of titles, URLs, account IDs and credentials.
export class ActivityLog {
  private tasks: Task[] = [];
  private active?: Task;
  constructor(private capacity = 80) {}
  stage(stage: string) {
    if (!this.active || this.active.stage === stage) return;
    this.active.stage = stage;
    this.active.stages.push({ stage, at: new Date().toISOString() });
    if (this.active.stages.length > 100) this.active.stages.shift();
  }
  recent(): Task[] {
    const now = Date.now();
    return this.tasks.slice().reverse().map(task => ({ ...task, stages: task.stages.map(stage => ({ ...stage })), elapsed_ms: (task.finished_at ? Date.parse(task.finished_at) : now) - Date.parse(task.created_at) }));
  }
  async run<T>(service: BiliService, operation: string, fn: () => Promise<T>): Promise<T> {
    const task: Task = { id: randomUUID(), operation, status: 'queued', stage: 'queued', created_at: new Date().toISOString(), elapsed_ms: 0, stages: [] };
    // Never evict work which is still queued or running.
    while (this.tasks.length >= this.capacity) {
      const index = this.tasks.findIndex(item => ['completed', 'failed'].includes(item.status));
      if (index < 0) break;
      this.tasks.splice(index, 1);
    }
    this.tasks.push(task);
    return service.exclusive(async () => {
      this.active = task;
      task.status = 'running';
      task.started_at = new Date().toISOString();
      this.stage('starting');
      try {
        const result = await fn();
        task.status = 'completed';
        this.stage('completed');
        return result;
      } catch (error) {
        task.error = publicError(error);
        task.status = 'failed';
        this.stage('failed');
        throw error;
      } finally {
        task.finished_at = new Date().toISOString();
        task.elapsed_ms = Date.parse(task.finished_at) - Date.parse(task.created_at);
        this.active = undefined;
      }
    });
  }
}
