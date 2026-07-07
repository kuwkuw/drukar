import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GenOptions, Job } from '@drukar/shared';
import { JobSchema } from '@drukar/shared';

export interface CreateJobInput {
  chatId?: string;
  userRequest: string;
  generationPrompt: string;
  options: GenOptions;
  maxAttempts: number;
}

export type JobPatch = Partial<
  Pick<Job, 'status' | 'generationPrompt' | 'options' | 'attempt' | 'report' | 'error' | 'artifacts'>
>;

/** In-memory job map backed by a `<jobId>/job.json` snapshot per job under `dataDir`. */
export class JobStore {
  private readonly jobs = new Map<string, Job>();

  constructor(private readonly dataDir: string) {}

  async dataDirFor(id: string): Promise<string> {
    const dir = join(this.dataDir, id);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  async create(input: CreateJobInput): Promise<Job> {
    const now = new Date().toISOString();
    const job: Job = {
      id: randomUUID(),
      chatId: input.chatId,
      status: 'generating',
      userRequest: input.userRequest,
      generationPrompt: input.generationPrompt,
      options: input.options,
      attempt: 1,
      maxAttempts: input.maxAttempts,
      artifacts: {},
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    await this.persist(job);
    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  async update(id: string, patch: JobPatch): Promise<Job> {
    const existing = this.jobs.get(id);
    if (!existing) throw new Error(`Job not found: ${id}`);
    const updated: Job = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.jobs.set(id, updated);
    await this.persist(updated);
    return updated;
  }

  private async persist(job: Job): Promise<void> {
    const dir = await this.dataDirFor(job.id);
    await writeFile(join(dir, 'job.json'), JSON.stringify(job, null, 2));
  }

  /** Repopulates the in-memory map from disk snapshots; call once at startup. */
  async hydrate(): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(this.dataDir);
    } catch {
      return;
    }
    for (const id of entries) {
      try {
        const raw = await readFile(join(this.dataDir, id, 'job.json'), 'utf8');
        const job = JobSchema.parse(JSON.parse(raw));
        this.jobs.set(job.id, job);
      } catch {
        // not a job directory, or a corrupt snapshot — skip it
      }
    }
  }
}
