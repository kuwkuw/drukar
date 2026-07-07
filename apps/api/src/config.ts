import type { PrinterType } from '@drukar/shared';

export interface PrintabilityConfig {
  minWallMmByPrinterType: Record<PrinterType, number>;
  /** Faces tilted more than this many degrees from vertical count as overhangs. */
  overhangDeg: number;
  /** Maximum share of overhang surface area before the overhang check fails (0..1). */
  overhangMaxRatio: number;
  /** Printer build volume in millimetres, [width, depth, height]. */
  buildVolumeMm: [number, number, number];
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid number for ${name}: ${raw}`);
  return n;
}

function parseBuildVolume(raw: string | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!raw) return fallback;
  const parts = raw.split('x').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n <= 0)) {
    throw new Error(`Invalid DRUKAR_BUILD_VOLUME: ${raw} — expected WxDxH, e.g. 220x220x250`);
  }
  return [parts[0]!, parts[1]!, parts[2]!];
}

export function loadPrintabilityConfig(): PrintabilityConfig {
  return {
    minWallMmByPrinterType: {
      fdm: envNumber('DRUKAR_MIN_WALL_MM_FDM', 1.2),
      resin: envNumber('DRUKAR_MIN_WALL_MM_RESIN', 0.8),
    },
    overhangDeg: envNumber('DRUKAR_OVERHANG_DEG', 50),
    overhangMaxRatio: envNumber('DRUKAR_OVERHANG_MAX_RATIO', 0.3),
    buildVolumeMm: parseBuildVolume(process.env.DRUKAR_BUILD_VOLUME, [220, 220, 250]),
  };
}

export interface AgentConfig {
  model: string;
  /** Regeneration attempts allowed after the first, i.e. job.maxAttempts = 1 + maxRegenerations. */
  maxRegenerations: number;
}

export function loadAgentConfig(): AgentConfig {
  return {
    model: process.env.DRUKAR_MODEL || 'claude-fable-5',
    maxRegenerations: envNumber('DRUKAR_MAX_REGENERATIONS', 2),
  };
}
