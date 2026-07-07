import { basename, dirname, join } from 'node:path';
import { GenOptionsSchema, type PrintabilityReport } from '@drukar/shared';
import { loadMesh, saveGlb, saveStl } from '../mesh/io.js';
import { runPrintabilityPipeline } from '../mesh/pipeline.js';
import { loadPrintabilityConfig } from '../config.js';

function printReport(inputPath: string, report: PrintabilityReport): void {
  console.log(`Printability report for ${basename(inputPath)}`);
  console.log(`${report.pass ? 'PASS' : 'FAIL'} (repairable: ${report.repairable})\n`);

  for (const check of report.checks) {
    console.log(`[${check.pass ? 'PASS' : 'FAIL'}] ${check.label}${check.details ? ` — ${check.details}` : ''}`);
    for (const warning of check.warnings) console.log(`  ! ${warning}`);
  }

  if (report.appliedFixes.length > 0) {
    console.log('\nApplied fixes:');
    for (const fix of report.appliedFixes) console.log(`  - ${fix.description}`);
  }

  if (report.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const warning of report.warnings) console.log(`  - ${warning}`);
  }

  if (report.orientation) {
    const [rx, ry, rz] = report.orientation.rotationDeg;
    console.log(
      `\nOrientation: rotated (${rx}°, ${ry}°, ${rz}°), ` +
        `overhang ${(report.orientation.overhangRatio * 100).toFixed(1)}%, ` +
        `bed contact ${report.orientation.bedContactAreaMm2.toFixed(1)}mm²`,
    );
  }

  console.log(
    `\nStats: ${report.stats.triangles} triangles, ${report.stats.vertices} vertices, ` +
      `volume ${report.stats.volumeMm3?.toFixed(1)}mm³`,
  );
}

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: pnpm pipeline:run <path/to/mesh.(stl|glb|obj)>');
    process.exitCode = 1;
    return;
  }

  const mesh = await loadMesh(inputPath);
  const options = GenOptionsSchema.parse({});
  const config = loadPrintabilityConfig();
  const { mesh: finalMesh, report } = runPrintabilityPipeline(mesh, options, config);

  printReport(inputPath, report);

  const dir = dirname(inputPath);
  const stlPath = join(dir, 'model.stl');
  const glbPath = join(dir, 'preview.glb');
  await saveStl(stlPath, finalMesh);
  await saveGlb(glbPath, finalMesh);
  console.log(`\nWrote ${stlPath} and ${glbPath}`);

  process.exitCode = report.pass ? 0 : 1;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
