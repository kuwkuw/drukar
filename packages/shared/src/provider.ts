import { z } from 'zod';

export const PrinterTypeSchema = z.enum(['fdm', 'resin']);
export type PrinterType = z.infer<typeof PrinterTypeSchema>;

export const MaterialSchema = z.enum(['pla', 'petg', 'resin']);
export type Material = z.infer<typeof MaterialSchema>;

export const MeshFormatSchema = z.enum(['glb', 'stl', 'obj']);
export type MeshFormat = z.infer<typeof MeshFormatSchema>;

/** Target dimensions extracted from the conversation. Partial: the user may
 * constrain only one axis ("must fit a 25mm pipe"). Unset axes keep the
 * generator's proportions. */
export const TargetDimensionsSchema = z
  .object({
    xMm: z.number().positive(),
    yMm: z.number().positive(),
    zMm: z.number().positive(),
  })
  .partial();
export type TargetDimensions = z.infer<typeof TargetDimensionsSchema>;

export const GenOptionsSchema = z.object({
  printerType: PrinterTypeSchema.default('fdm'),
  material: MaterialSchema.default('pla'),
  targetDimensionsMm: TargetDimensionsSchema.optional(),
  /** Functional parts must never get invented dimensions — the agent asks instead. */
  functional: z.boolean().default(false),
});
export type GenOptions = z.infer<typeof GenOptionsSchema>;

export const GenerationProviderIdSchema = z.enum(['mock', 'tripo', 'hf']);
export type GenerationProviderId = z.infer<typeof GenerationProviderIdSchema>;
