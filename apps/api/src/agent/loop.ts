import { join } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import type { AgentEvent, GenOptions, Job, JobStatus } from '@drukar/shared';
import { GenOptionsSchema } from '@drukar/shared';
import type { SessionStore } from '../chat/session-store.js';
import type { PrintabilityConfig } from '../config.js';
import type { JobStore } from '../jobs/store.js';
import { loadMesh, saveGlb, saveStl } from '../mesh/io.js';
import { runPrintabilityPipeline } from '../mesh/pipeline.js';
import type { GenerationProvider } from '../providers/types.js';
import type { LlmClient } from './llm-client.js';
import { SYSTEM_PROMPT } from './system-prompt.js';
import { AGENT_TOOLS } from './tools.js';

/** Defensive cap on tool round-trips within a single user turn. */
const MAX_AGENT_STEPS = 8;

export interface AgentLoopDeps {
  llm: LlmClient;
  provider: GenerationProvider;
  jobStore: JobStore;
  sessionStore: SessionStore;
  config: PrintabilityConfig;
  maxAttempts: number;
}

interface GenerateModelInput {
  prompt: string;
  printerType?: GenOptions['printerType'];
  material?: GenOptions['material'];
  functional?: boolean;
  targetDimensionsMm?: GenOptions['targetDimensionsMm'];
}

interface ToolExecResult {
  ok: boolean;
  job: Job;
  summary: string;
  content: string;
}

async function executeGenerateModel(
  rawInput: unknown,
  deps: AgentLoopDeps,
  ctx: { chatId: string; userRequest: string; jobId: string | undefined; signal?: AbortSignal },
): Promise<ToolExecResult> {
  const input = rawInput as GenerateModelInput;
  const options = GenOptionsSchema.parse({
    printerType: input.printerType,
    material: input.material,
    functional: input.functional,
    targetDimensionsMm: input.targetDimensionsMm,
  });

  let job = ctx.jobId ? deps.jobStore.get(ctx.jobId) : undefined;
  job = job
    ? await deps.jobStore.update(job.id, { attempt: job.attempt + 1, generationPrompt: input.prompt, options })
    : await deps.jobStore.create({
        chatId: ctx.chatId,
        userRequest: ctx.userRequest,
        generationPrompt: input.prompt,
        options,
        maxAttempts: deps.maxAttempts,
      });

  try {
    const generated = await deps.provider.generate(input.prompt, options, ctx.signal);
    const mesh = await loadMesh(generated.meshPath);
    const { mesh: finalMesh, report } = runPrintabilityPipeline(mesh, options, deps.config);

    const jobDir = await deps.jobStore.dataDirFor(job.id);
    await saveStl(join(jobDir, 'model.stl'), finalMesh);
    await saveGlb(join(jobDir, 'preview.glb'), finalMesh);

    const status: JobStatus = report.pass ? 'done' : job.attempt >= job.maxAttempts ? 'failed' : 'generating';
    job = await deps.jobStore.update(job.id, {
      status,
      report,
      artifacts: { stl: 'model.stl', previewGlb: 'preview.glb' },
      error: status === 'failed' ? 'Exceeded max regeneration attempts without a printable result' : undefined,
    });

    const failingChecks = report.checks.filter((c) => !c.pass).map((c) => c.label);
    const summary = report.pass
      ? `Printable on attempt ${job.attempt}/${job.maxAttempts}.`
      : `Attempt ${job.attempt}/${job.maxAttempts} ${report.repairable ? 'has fixable issues' : 'is not repairable'}: ${failingChecks.join(', ')}.` +
        (status === 'failed' ? ' No attempts remain.' : ' Consider adjusting the prompt and calling generate_model again.');

    return {
      ok: report.pass || status !== 'failed',
      job,
      summary,
      content: JSON.stringify({
        pass: report.pass,
        repairable: report.repairable,
        status,
        attempt: job.attempt,
        maxAttempts: job.maxAttempts,
        checks: report.checks.map((c) => ({ id: c.id, pass: c.pass, details: c.details })),
        warnings: report.warnings,
      }),
    };
  } catch (err) {
    const message = ctx.signal?.aborted
      ? 'Cancelled: client disconnected'
      : err instanceof Error
        ? err.message
        : String(err);
    job = await deps.jobStore.update(job.id, { status: 'failed', error: message });
    return { ok: false, job, summary: `Generation failed: ${message}`, content: JSON.stringify({ error: message }) };
  }
}

function isToolUseBlock(block: Anthropic.ContentBlock): block is Anthropic.ToolUseBlock {
  return block.type === 'tool_use';
}

export async function* runAgentLoop(
  input: { chatId: string; message: string },
  deps: AgentLoopDeps,
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent> {
  try {
    const session = deps.sessionStore.get(input.chatId);
    const history: Anthropic.MessageParam[] = [...session.history, { role: 'user', content: input.message }];
    let jobId = session.jobId;

    for (let step = 0; step < MAX_AGENT_STEPS && !signal?.aborted; step++) {
      let text = '';
      let assistantContent: Anthropic.ContentBlock[] = [];

      for await (const event of deps.llm.streamMessage({ system: SYSTEM_PROMPT, messages: history, tools: AGENT_TOOLS, signal })) {
        if (event.type === 'text_delta') {
          text += event.text;
          yield { type: 'text_chunk', text: event.text };
        } else {
          assistantContent = event.content;
        }
      }

      history.push({ role: 'assistant', content: assistantContent });
      const toolCalls = assistantContent.filter(isToolUseBlock);

      if (toolCalls.length === 0) {
        if (text.trim()) yield { type: 'question_for_user', text };
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const call of toolCalls) {
        yield { type: 'tool_started', tool: call.name, toolUseId: call.id, input: call.input };
        const result = await executeGenerateModel(call.input, deps, {
          chatId: input.chatId,
          userRequest: input.message,
          jobId,
          signal,
        });
        jobId = result.job.id;
        yield { type: 'tool_finished', tool: call.name, toolUseId: call.id, ok: result.ok, summary: result.summary };
        yield { type: 'job_update', job: result.job };
        toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: result.content, is_error: !result.ok });
      }
      history.push({ role: 'user', content: toolResults });
    }

    deps.sessionStore.save(input.chatId, { history, jobId });
    yield { type: 'done', jobId };
  } catch (err) {
    yield { type: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
