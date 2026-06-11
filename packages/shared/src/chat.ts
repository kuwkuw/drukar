import { z } from 'zod';
import { JobSchema } from './job.js';

export const ChatRoleSchema = z.enum(['user', 'assistant']);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

export const ChatMessageSchema = z.object({
  role: ChatRoleSchema,
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatRequestSchema = z.object({
  /** Client-generated conversation id; the server keeps transcript state per chat. */
  chatId: z.string().min(1),
  message: z.string().min(1),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/** Events the agent loop yields; the SSE route pipes them verbatim. */
export const AgentEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text_chunk'), text: z.string() }),
  z.object({
    type: z.literal('tool_started'),
    tool: z.string(),
    toolUseId: z.string(),
    input: z.unknown(),
  }),
  z.object({
    type: z.literal('tool_finished'),
    tool: z.string(),
    toolUseId: z.string(),
    ok: z.boolean(),
    summary: z.string(),
  }),
  z.object({ type: z.literal('question_for_user'), text: z.string() }),
  z.object({ type: z.literal('job_update'), job: JobSchema }),
  z.object({ type: z.literal('done'), jobId: z.string().optional() }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;
