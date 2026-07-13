import { describe, expect, it } from 'vitest';
import { GenOptionsSchema } from '@drukar/shared';
import { makeBrokenSample, makeCube, makeHoledSample } from '../src/mesh/samples.js';
import { scaleMesh } from '../src/mesh/raw.js';
import { runPrintabilityPipeline } from '../src/mesh/pipeline.js';
import type { PrintabilityConfig } from '../src/config.js';

const config: PrintabilityConfig = {
  minWallMmByPrinterType: { fdm: 1.2, resin: 0.8 },
  overhangDeg: 50,
  overhangMaxRatio: 0.3,
  buildVolumeMm: [220, 220, 250],
};

const defaultOptions = GenOptionsSchema.parse({});

describe('runPrintabilityPipeline', () => {
  it('passes a clean, trivially printable cube', () => {
    const { report } = runPrintabilityPipeline(makeCube(30), defaultOptions, config);
    expect(report.pass).toBe(true);
    expect(report.repairable).toBe(true);
    for (const check of report.checks) expect(check.pass).toBe(true);
  });

  it('repairs a small hole and still passes', () => {
    const { report } = runPrintabilityPipeline(makeHoledSample(30), defaultOptions, config);
    expect(report.repairable).toBe(true);
    expect(report.appliedFixes.some((f) => f.kind === 'fill_holes')).toBe(true);
    expect(report.checks.find((c) => c.id === 'manifold')?.pass).toBe(true);
    expect(report.pass).toBe(true);
  });

  it('flags a mesh with oversized holes as unrepairable', () => {
    const { report } = runPrintabilityPipeline(makeBrokenSample(), defaultOptions, config);
    expect(report.repairable).toBe(false);
    expect(report.pass).toBe(false);
    expect(report.checks.find((c) => c.id === 'manifold')?.pass).toBe(false);
  });

  it('rescales to match requested target dimensions', () => {
    const options = GenOptionsSchema.parse({ targetDimensionsMm: { xMm: 60 } });
    const { report } = runPrintabilityPipeline(makeCube(10), options, config);
    expect(report.appliedFixes.some((f) => f.kind === 'rescale')).toBe(true);
    expect(report.stats.bboxMm.max[0] - report.stats.bboxMm.min[0]).toBeCloseTo(60, 0);
  });

  it('fails the build volume check when the model is too large', () => {
    const { report } = runPrintabilityPipeline(makeCube(300), defaultOptions, config);
    expect(report.checks.find((c) => c.id === 'build_volume')?.pass).toBe(false);
    expect(report.pass).toBe(false);
    expect(report.repairable).toBe(true);
  });

  it('fails the wall thickness check on a thin slab', () => {
    const slab = scaleMesh(makeCube(30), [1, 1, 0.5 / 30]);
    const { report } = runPrintabilityPipeline(slab, defaultOptions, config);
    const wallCheck = report.checks.find((c) => c.id === 'wall_thickness');
    expect(wallCheck?.pass).toBe(false);
    expect(wallCheck?.metrics['minThicknessMm'] as number).toBeLessThan(1.2);
    expect(report.checks.find((c) => c.id === 'overhangs')?.pass).toBe(true);
  });
});
