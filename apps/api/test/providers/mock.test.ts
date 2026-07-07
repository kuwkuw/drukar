import { describe, expect, it } from 'vitest';
import { GenOptionsSchema } from '@drukar/shared';
import { MockProvider } from '../../src/providers/mock.js';
import { loadMesh } from '../../src/mesh/io.js';
import { runPrintabilityPipeline } from '../../src/mesh/pipeline.js';
import { testPrintabilityConfig as config } from '../helpers/config.js';

const options = GenOptionsSchema.parse({});

describe('MockProvider', () => {
  it('returns the clean sample by default', async () => {
    const { meshPath } = await new MockProvider().generate('a small vase', options);
    const { report } = runPrintabilityPipeline(await loadMesh(meshPath), options, config);
    expect(report.pass).toBe(true);
  });

  it('returns the repairable holed sample for "hole" prompts', async () => {
    const { meshPath } = await new MockProvider().generate('a cube with a hole in it', options);
    const { report } = runPrintabilityPipeline(await loadMesh(meshPath), options, config);
    expect(report.repairable).toBe(true);
    expect(report.appliedFixes.some((f) => f.kind === 'fill_holes')).toBe(true);
  });

  it('returns the unrepairable broken sample for "broken" prompts', async () => {
    const { meshPath } = await new MockProvider().generate('a broken cylinder', options);
    const { report } = runPrintabilityPipeline(await loadMesh(meshPath), options, config);
    expect(report.pass).toBe(false);
    expect(report.repairable).toBe(false);
  });
});
