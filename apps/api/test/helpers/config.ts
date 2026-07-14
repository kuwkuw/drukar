import type { PrintabilityConfig } from '../../src/config.js';

export const testPrintabilityConfig: PrintabilityConfig = {
  minWallMmByPrinterType: { fdm: 1.2, resin: 0.8 },
  thinWallMaxRatio: 0.05,
  overhangDeg: 50,
  overhangMaxRatio: 0.3,
  buildVolumeMm: [220, 220, 250],
};
