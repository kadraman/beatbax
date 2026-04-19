import { ExporterRegistry, exporterRegistry } from '../src/export/index.js';
import type { ExporterPlugin } from '../src/export/types.js';
import { ChipRegistry } from '../src/chips/registry.js';
import type { ChipPlugin } from '../src/chips/types.js';

describe('ExporterRegistry', () => {
  test('built-in exporters are registered by default', () => {
    const reg = new ExporterRegistry();
    const ids = reg.all().map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['json', 'midi', 'uge', 'wav']));
  });

  test('list(chipName) filters by supported chips', () => {
    const reg = new ExporterRegistry();
    const gb = reg.list('gameboy').map((p) => p.id);
    const nes = reg.list('nes').map((p) => p.id);
    expect(gb).toContain('uge');
    expect(nes).not.toContain('uge');
  });
});

describe('ChipRegistry exporter forwarding', () => {
  test('registering a chip with exporterPlugins auto-registers those exporters', () => {
    const exporterId = `test-exporter-${Date.now()}`;
    const testExporter: ExporterPlugin = {
      id: exporterId,
      label: 'Test Exporter',
      version: '1.0.0',
      extension: 'bin',
      mimeType: 'application/octet-stream',
      supportedChips: ['testchip'],
      export: () => new Uint8Array([1, 2, 3]),
    };

    const testChip: ChipPlugin = {
      name: `testchip-${Date.now()}`,
      version: '1.0.0',
      channels: 1,
      exporterPlugins: [testExporter],
      validateInstrument: () => [],
      createChannel: () => ({
        reset: () => {},
        noteOn: () => {},
        noteOff: () => {},
        applyEnvelope: () => {},
        render: () => {},
      }),
    };

    const chipReg = new ChipRegistry();
    chipReg.register(testChip);

    expect(exporterRegistry.has(exporterId)).toBe(true);
    expect(exporterRegistry.get(exporterId)).toBeDefined();
  });
});
