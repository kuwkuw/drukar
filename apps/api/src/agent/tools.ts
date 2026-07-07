import type Anthropic from '@anthropic-ai/sdk';

export const GENERATE_MODEL_TOOL: Anthropic.Tool = {
  name: 'generate_model',
  description:
    'Generate a 3D model mesh from a text prompt, then automatically validate and lightly ' +
    'repair it for printability. Returns whether the result is printable, and if not, whether ' +
    "it's worth adjusting the prompt and calling this tool again (regeneration is cheaper than " +
    'trying to manually describe a fix). Each call is one generation attempt against the job\'s ' +
    'attempt budget.',
  input_schema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'The generation prompt to send to the 3D model provider. Self-contained and descriptive.',
      },
      printerType: { type: 'string', enum: ['fdm', 'resin'], description: 'Defaults to fdm.' },
      material: { type: 'string', enum: ['pla', 'petg', 'resin'], description: 'Defaults to pla.' },
      functional: {
        type: 'boolean',
        description: 'True for parts that must fit/mate with something real (never invent dimensions for these).',
      },
      targetDimensionsMm: {
        type: 'object',
        description: 'Constrain one or more axes in millimetres; unset axes keep the generated proportions.',
        properties: {
          xMm: { type: 'number' },
          yMm: { type: 'number' },
          zMm: { type: 'number' },
        },
      },
    },
    required: ['prompt'],
  },
};

export const AGENT_TOOLS: Anthropic.Tool[] = [GENERATE_MODEL_TOOL];
