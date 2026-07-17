import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..', '..');
const sampleSongPath = path.resolve(appRoot, '..', '..', 'songs', 'sample.bax');
const trainersJourneyPath = path.resolve(appRoot, '..', '..', 'songs', 'gameboy', 'a_trainers_journey.bax');

async function launchDesktopApp(extraArgs: string[] = []) {
  const consoleErrors: string[] = [];
  const electronApp = await electron.launch({
    args: [appRoot, ...extraArgs],
    cwd: appRoot,
    env: {
      ...process.env,
      BEATBAX_E2E_AI_KEY_STORE: 'memory',
    },
  });

  const page = await electronApp.firstWindow();
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await expect(page.locator('.status-document-name')).toBeVisible({ timeout: 15_000 });
  return { electronApp, page, consoleErrors };
}

async function startMockAIProvider(): Promise<{ server: Server; endpoint: string }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: [] }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Mock AI provider did not bind to a TCP port.');
  return { server, endpoint: `http://127.0.0.1:${address.port}` };
}

function filterBenignConsoleErrors(lines: string[]): string[] {
  return lines.filter((line) =>
    !line.includes('Autofill')
    && !line.includes('DevTools')
    && !line.includes('ERR_FILE_NOT_FOUND'),
  );
}

/** Auto-approve desktop export saves so Playwright does not block on native dialogs. */
async function mockDesktopSaveFileAutoApprove(
  electronApp: Awaited<ReturnType<typeof electron.launch>>,
) {
  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('desktop:save-file');
    ipcMain.handle('desktop:save-file', async (_event, options: { defaultPath?: string }) => {
      return options?.defaultPath?.trim() || 'export.dat';
    });
  });
}

test('loads a .bax file passed on startup', async () => {
  test.setTimeout(60_000);
  const sampleContent = readFileSync(sampleSongPath, 'utf8');
  const { electronApp, page } = await launchDesktopApp([sampleSongPath]);

  await expect(page.locator('.status-document-name')).toHaveText('sample.bax', { timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => {
    const editor = (window as unknown as {
      __beatbax_editor?: { getValue?: () => string };
    }).__beatbax_editor;
    return editor?.getValue?.() ?? '';
  })).toContain('chip gameboy');
  await expect.poll(() => page.evaluate(() => {
    const editor = (window as unknown as {
      __beatbax_editor?: { getValue?: () => string };
    }).__beatbax_editor;
    return editor?.getValue?.() ?? '';
  })).toContain('Sample Song');

  await electronApp.close();
  expect(sampleContent.length).toBeGreaterThan(0);
});

test('exports JSON without runtime errors', async () => {
  test.setTimeout(60_000);
  const { electronApp, page, consoleErrors } = await launchDesktopApp();
  await mockDesktopSaveFileAutoApprove(electronApp);

  await page.locator('[data-format="json"]').click();
  await page.locator('.output-tab[data-tab="output"], button:has-text("Output")').first().click();

  await expect(page.getByText(/(Exported|Successfully exported).*\.json/i).first()).toBeVisible({ timeout: 20_000 });

  expect(filterBenignConsoleErrors(consoleErrors)).toEqual([]);

  await electronApp.close();
});

test('toolbar open preserves file path for silent save', async () => {
  test.setTimeout(60_000);
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'beatbax-e2e-toolbar-open-'));
  const songPath = path.join(tempDir, 'toolbar-open-save.bax');
  const original = readFileSync(sampleSongPath, 'utf8');

  const { electronApp, page } = await launchDesktopApp();
  await electronApp.evaluate(({ ipcMain }, { filePath, content }) => {
    ipcMain.removeHandler('desktop:open-file');
    ipcMain.removeHandler('desktop:save-file');
    (globalThis as unknown as {
      __beatbaxSaveCalls?: Array<{ defaultPath?: string; showDialog?: boolean; text: string }>;
    }).__beatbaxSaveCalls = [];
    ipcMain.handle('desktop:open-file', async () => ({
      path: filePath,
      name: 'toolbar-open-save.bax',
      data: Buffer.from(content, 'utf8'),
    }));
    ipcMain.handle('desktop:save-file', async (_event, options: { defaultPath?: string; showDialog?: boolean }, data: Uint8Array) => {
      (globalThis as unknown as {
        __beatbaxSaveCalls: Array<{ defaultPath?: string; showDialog?: boolean; text: string }>;
      }).__beatbaxSaveCalls.push({
        defaultPath: options.defaultPath,
        showDialog: options.showDialog,
        text: Buffer.from(data).toString('utf8'),
      });
      return options.defaultPath ?? null;
    });
  }, { filePath: songPath, content: original });

  await page.locator('#tb-open').click();
  await expect(page.locator('.status-document-name')).toHaveText('toolbar-open-save.bax', { timeout: 15_000 });

  const marker = `// toolbar-open-save-${Date.now()}`;
  await page.locator('.monaco-editor').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(marker);
  await page.locator('#tb-save').click();

  await expect.poll(() => electronApp.evaluate(() => {
    return (globalThis as unknown as {
      __beatbaxSaveCalls?: Array<{ defaultPath?: string; showDialog?: boolean; text: string }>;
    }).__beatbaxSaveCalls?.[0] ?? null;
  })).toMatchObject({
    defaultPath: songPath,
    showDialog: false,
    text: expect.stringContaining(marker),
  });

  await electronApp.close();
  rmSync(tempDir, { recursive: true, force: true });
});

test('plays the starter song without console errors', async () => {
  test.setTimeout(60_000);
  const { electronApp, page, consoleErrors } = await launchDesktopApp();

  await page.getByRole('button', { name: /Play current song/i }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /Stop playback/i }).click();

  expect(filterBenignConsoleErrors(consoleErrors)).toEqual([]);

  await electronApp.close();
});

test('transport loop and live controls are wired', async () => {
  test.setTimeout(60_000);
  const { electronApp, page } = await launchDesktopApp();

  const loopButton = page.getByRole('button', { name: /Toggle loop playback/i });
  const liveButton = page.getByRole('button', { name: /Toggle live-play mode/i });
  const rewindButton = page.getByRole('button', { name: /Rewind to start/i });
  const volumeKnob = page.locator('.bb-transport__vol-knob');

  await expect(loopButton).toBeVisible();
  await expect(liveButton).toBeVisible();
  await expect(rewindButton).toBeVisible();
  await expect(volumeKnob).toBeVisible();

  const loopToggled = await loopButton.evaluate((button: HTMLButtonElement) => {
    const wasActive = button.classList.contains('bb-loop-btn--active');
    button.click();
    return button.classList.contains('bb-loop-btn--active') !== wasActive;
  });
  expect(loopToggled).toBe(true);

  const liveTitleBefore = await liveButton.getAttribute('title');
  await liveButton.click();
  await expect(liveButton).not.toHaveAttribute('title', liveTitleBefore ?? '');

  await electronApp.close();
});

test('remote asset allowlist settings gate desktop fetch bridge', async () => {
  test.setTimeout(60_000);
  const { electronApp, page } = await launchDesktopApp();

  await electronApp.evaluate(() => {
    const state = globalThis as unknown as {
      __beatbaxFetchUrls?: string[];
      fetch?: (input: string | URL) => Promise<{
        status: number;
        ok: boolean;
        statusText: string;
        headers: { get: (name: string) => string | null };
        arrayBuffer: () => Promise<ArrayBuffer>;
      }>;
    };
    state.__beatbaxFetchUrls = [];
    state.fetch = async (input: string | URL) => {
      state.__beatbaxFetchUrls?.push(String(input));
      return {
        status: 200,
        ok: true,
        statusText: 'OK',
        headers: { get: () => null },
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      };
    };
  });

  try {
    const result = await page.evaluate(async () => {
      const api = (window as unknown as {
        electronAPI: {
          setRemoteAssetAllowlist: (hosts: string[]) => Promise<string[]>;
          fetchRemoteAsset: (request: { url: string }) => Promise<Uint8Array>;
        };
      }).electronAPI;

      await api.setRemoteAssetAllowlist([]);

      const allowedDefault = Array.from(await api.fetchRemoteAsset({
        url: 'https://raw.githubusercontent.com/kadraman/beatbax/main/songs/nes/samples/ik_snare.dmc',
      }));

      let blockedMessage = '';
      try {
        await api.fetchRemoteAsset({ url: 'https://example.com/sample.dmc' });
      } catch (error) {
        blockedMessage = (error as Error).message || String(error);
      }

      const userAllowlist = await api.setRemoteAssetAllowlist(['example.com']);
      const allowedAfterUserHost = Array.from(await api.fetchRemoteAsset({
        url: 'https://example.com/sample.dmc',
      }));

      return {
        allowedDefault,
        blockedMessage,
        userAllowlist,
        allowedAfterUserHost,
      };
    });

    expect(result.allowedDefault).toEqual([1, 2, 3]);
    expect(result.blockedMessage).toContain("Remote asset host 'example.com' is not in the Desktop allowlist.");
    expect(result.userAllowlist).toContain('example.com');
    expect(result.allowedAfterUserHost).toEqual([1, 2, 3]);

    const fetchUrls = await electronApp.evaluate(() => {
      return ((globalThis as unknown as { __beatbaxFetchUrls?: string[] }).__beatbaxFetchUrls ?? []).slice();
    });
    expect(fetchUrls).toEqual([
      'https://raw.githubusercontent.com/kadraman/beatbax/main/songs/nes/samples/ik_snare.dmc',
      'https://example.com/sample.dmc',
    ]);
  } finally {
    await page.evaluate(async () => {
      const api = (window as unknown as {
        electronAPI: { setRemoteAssetAllowlist: (hosts: string[]) => Promise<string[]> };
      }).electronAPI;
      await api.setRemoteAssetAllowlist([]);
    });
    await electronApp.close();
  }
});

test('pattern grid renders desktop React UI and navigates to patterns', async () => {
  test.setTimeout(60_000);
  const { electronApp, page, consoleErrors } = await launchDesktopApp([sampleSongPath]);

  await page.evaluate(() => {
    localStorage.setItem('beatbax:feature.patternGrid', 'true');
    localStorage.setItem('beatbax:panel.pattern-grid', 'true');
  });
  await page.reload();
  await expect(page.locator('.status-document-name')).toHaveText('sample.bax', { timeout: 15_000 });

  await expect(page.locator('.bb-pgrid')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.bb-pgrid__row')).toHaveCount(4);
  await expect(page.locator('.bb-pgrid__block[title="lead_seq › melody_pat"]').first()).toBeVisible();
  // sample.bax channel 2: bass_seq → four bass_pat + three bass_var blocks
  await expect(page.locator('.bb-pgrid__row').nth(1).locator('.bb-pgrid__block[data-label="bass_pat"]')).toHaveCount(4);
  await expect(page.locator('.bb-pgrid__row').nth(1).locator('.bb-pgrid__block[data-label="bass_var"]')).toHaveCount(3);
  // channel 3: wave_seq = arp_pat*5
  await expect(page.locator('.bb-pgrid__row').nth(2).locator('.bb-pgrid__block[data-label="arp_pat"]')).toHaveCount(5);

  const muteButton = page.getByRole('button', { name: 'Mute channel 1' });
  await muteButton.click();
  await expect(muteButton).toHaveAttribute('aria-pressed', 'true');

  await page.locator('.bb-pgrid__block[title="lead_seq › melody_pat"]').first().click();
  await expect.poll(() => page.evaluate(() => {
    const editor = (window as unknown as {
      __beatbax_editor?: {
        getValue?: () => string;
        editor?: { getPosition?: () => { lineNumber: number; column: number } | null };
      };
    }).__beatbax_editor;
    const lineNumber = editor?.editor?.getPosition?.()?.lineNumber ?? 0;
    return editor?.getValue?.().split('\n')[lineNumber - 1]?.trim() ?? '';
  })).toContain('pat melody_pat');

  expect(filterBenignConsoleErrors(consoleErrors)).toEqual([]);
  await page.evaluate(() => {
    localStorage.setItem('beatbax:feature.patternGrid', 'false');
    localStorage.setItem('beatbax:panel.pattern-grid', 'false');
    localStorage.removeItem('beatbax-channel-state');
  });
  await electronApp.close();
});

test('pattern grid sizes blocks by musical duration', async () => {
  test.setTimeout(60_000);
  const { electronApp, page, consoleErrors } = await launchDesktopApp([trainersJourneyPath]);

  await page.evaluate(() => {
    localStorage.setItem('beatbax:feature.patternGrid', 'true');
    localStorage.setItem('beatbax:panel.pattern-grid', 'true');
  });
  await page.reload();
  await expect(page.locator('.status-document-name')).toHaveText('a_trainers_journey.bax', { timeout: 15_000 });
  await expect(page.locator('.bb-pgrid')).toBeVisible({ timeout: 15_000 });

  const flexValues = await page.locator('.bb-pgrid__row').first().locator('.bb-pgrid__block').evaluateAll((blocks) => {
    const wanted = new Set(['open_a', 'riff_a']);
    return blocks
      .filter((block) => wanted.has(block.getAttribute('data-label') ?? ''))
      .map((block) => ({
        label: block.getAttribute('data-label'),
        flexBasis: getComputedStyle(block).flexBasis,
      }));
  });

  const openABasis = flexValues.find((item) => item.label === 'open_a')?.flexBasis;
  expect(openABasis).toBeTruthy();
  expect(flexValues.find((item) => item.label === 'riff_a')?.flexBasis).toBe(openABasis);

  const harmFanfareBasis = await page
    .locator('.bb-pgrid__row')
    .nth(1)
    .locator('.bb-pgrid__block[data-label="harm_fanfare"]')
    .first()
    .evaluate((block) => getComputedStyle(block).flexBasis);
  expect(harmFanfareBasis).toBe(openABasis);
  await expect.poll(() => page.locator('.bb-pgrid__track').first().evaluate((track) => getComputedStyle(track).columnGap)).toBe('0px');

  expect(filterBenignConsoleErrors(consoleErrors)).toEqual([]);
  await electronApp.close();
});

test('help tab and shortcuts modal render desktop React help', async () => {
  test.setTimeout(60_000);
  const { electronApp, page, consoleErrors } = await launchDesktopApp();

  await page.locator('button.bb-right-tab[title="Help"]').click();
  await expect(page.locator('.bb-help__search')).toBeVisible();
  await expect(page.getByText('Language Syntax')).toBeVisible();

  await page.locator('.bb-help__search').fill('top-level');
  await expect(page.getByText('Top-level directives')).toBeVisible();

  const beforeInsert = await page.evaluate(() => {
    const editor = (window as unknown as {
      __beatbax_editor?: { getValue?: () => string };
    }).__beatbax_editor;
    return editor?.getValue?.() ?? '';
  });
  await page.getByRole('button', { name: 'Insert' }).first().click();
  await expect.poll(() => page.evaluate(() => {
    const editor = (window as unknown as {
      __beatbax_editor?: { getValue?: () => string };
    }).__beatbax_editor;
    return editor?.getValue?.() ?? '';
  })).not.toBe(beforeInsert);
  await expect.poll(() => page.evaluate(() => {
    const editor = (window as unknown as {
      __beatbax_editor?: { getValue?: () => string };
    }).__beatbax_editor;
    return editor?.getValue?.() ?? '';
  })).toContain('stepsPerBar 4');

  await page.keyboard.press('Alt+Shift+K');
  await expect(page.locator('.bb-shortcuts-modal-backdrop.bb-shortcuts-modal--open')).toBeVisible();
  await expect(page.locator('.bb-shortcuts-modal-body')).toContainText('Apply & re-play');

  expect(filterBenignConsoleErrors(consoleErrors)).toEqual([]);
  await electronApp.close();
});

test('settings modal and copilot panel render desktop React UI', async () => {
  test.setTimeout(60_000);
  const mockProvider = await startMockAIProvider();
  const { electronApp, page, consoleErrors } = await launchDesktopApp();

  await page.evaluate(() => {
    localStorage.setItem('beatbax:feature.aiAssistant', 'false');
    localStorage.setItem('beatbax:ui.toolbarStyle', 'icons+labels');
  });
  await page.reload();
  await expect(page.locator('.status-document-name')).toBeVisible({ timeout: 15_000 });

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,');
  await expect(page.locator('.bb-settings-backdrop.bb-settings-backdrop--open')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('tab', { name: /General/i })).toBeVisible();
  await page.locator('.bb-settings-fieldset').filter({ hasText: 'Toolbar style' }).locator('input[value="icons"]').check();
  await expect(page.locator('.bb-toolbar')).toHaveAttribute('data-style', 'icons');

  await page.getByRole('tab', { name: /Features/i }).click();
  const aiFeatureRow = page.locator('.bb-settings-feature-row').filter({ hasText: 'AI Copilot' });
  await expect(aiFeatureRow).toBeVisible();
  await aiFeatureRow.locator('input[type="checkbox"]').check();
  await page.locator('.bb-settings-modal-footer').getByRole('button', { name: 'Close', exact: true }).click();

  await expect(page.locator('.bb-chat-panel')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('BeatBax Copilot')).toBeVisible();
  await page.locator('button.bb-right-tab[title="Copilot"] .bb-right-tab__close').evaluate((element: Element) => {
    (element as HTMLElement).click();
  });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('beatbax:feature.aiAssistant'))).toBe('true');
  await page.keyboard.press('Alt+Shift+I');
  await expect(page.locator('.bb-chat-panel')).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Alt+Shift+I');
  await expect(page.locator('[data-item-id="ai-assistant"]')).toHaveAttribute('aria-checked', 'false');
  await page.locator('[data-menu-id="view"] .bb-menu__trigger').click();
  await page.locator('[data-item-id="ai-assistant"]').click();
  await expect(page.locator('.bb-chat-panel')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-item-id="ai-assistant"]')).toHaveAttribute('aria-checked', 'true');

  await page.getByTitle('Open AI settings').click();
  await expect(page.locator('.bb-settings-backdrop.bb-settings-backdrop--open')).toBeVisible();
  await expect(page.locator('#bb-ai-endpoint')).toBeVisible();
  await expect(page.locator('.bb-settings-warning')).not.toContainText('localStorage');

  try {
    const fakeApiKey = `sk-test-secure-${Date.now()}`;
    await page.locator('#bb-ai-endpoint').fill(mockProvider.endpoint);
    await page.locator('#bb-ai-apikey').fill(fakeApiKey);
    await page.locator('.bb-settings-backdrop').getByRole('button', { name: 'Validate', exact: true }).click();
    await expect.poll(() => page.evaluate(() => {
      return (window as unknown as { electronAPI: { getAIAPIKey: () => Promise<string> } }).electronAPI.getAIAPIKey();
    })).toBe(fakeApiKey);
    await expect(page.locator('.bb-ai-key-wrap')).toContainText('API key validated.');
    await expect(page.locator('.bb-chat-status')).toBeHidden();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('beatbax:ai.settings') ?? '')).not.toContain(fakeApiKey);
    await page.getByRole('button', { name: 'Clear key' }).click();
    await expect(page.locator('#bb-ai-apikey')).toHaveValue('');
    await expect(page.locator('.bb-ai-key-wrap')).toContainText('API key cleared.');
    await expect.poll(() => page.evaluate(() => {
      return (window as unknown as { electronAPI: { getAIAPIKey: () => Promise<string> } }).electronAPI.getAIAPIKey();
    })).toBe('');
  } finally {
    await new Promise<void>((resolve) => mockProvider.server.close(() => resolve()));
  }

  expect(filterBenignConsoleErrors(consoleErrors)).toEqual([]);
  await page.evaluate(() => {
    localStorage.setItem('beatbax:feature.aiAssistant', 'false');
    localStorage.setItem('beatbax:ui.toolbarStyle', 'icons+labels');
  });
  await electronApp.close();
});

test('copilot renders when restored enabled on startup', async () => {
  test.setTimeout(60_000);
  const { electronApp, page, consoleErrors } = await launchDesktopApp();

  await page.evaluate(() => {
    localStorage.setItem('beatbax:feature.aiAssistant', 'true');
    localStorage.setItem('beatbax:ui.activeRightTab', 'ai');
  });
  await page.reload();
  await expect(page.locator('.status-document-name')).toBeVisible({ timeout: 15_000 });

  await expect(page.locator('button.bb-right-tab[title="Copilot"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.bb-chat-panel')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('BeatBax Copilot')).toBeVisible();
  await expect(page.locator('[data-item-id="ai-assistant"]')).toHaveAttribute('aria-checked', 'true');

  await page.evaluate(() => {
    localStorage.setItem('beatbax:feature.aiAssistant', 'true');
    localStorage.setItem('beatbax:ui.activeRightTab', 'help');
  });
  await page.reload();
  await expect(page.locator('.status-document-name')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('button.bb-right-tab[title="Help"]')).toHaveClass(/bb-right-tab--active/);
  await expect(page.locator('button.bb-right-tab[title="Copilot"]')).not.toHaveClass(/bb-right-tab--active/);
  await expect(page.locator('button.bb-right-tab[title="Copilot"]')).toBeVisible();
  await expect(page.locator('.bb-help__search')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.bb-chat-panel')).toBeHidden();

  expect(filterBenignConsoleErrors(consoleErrors)).toEqual([]);
  await page.evaluate(() => {
    localStorage.setItem('beatbax:feature.aiAssistant', 'false');
    localStorage.setItem('beatbax:ui.activeRightTab', 'channels');
  });
  await electronApp.close();
});

test('view menu reflects open visualizer tab on startup', async () => {
  test.setTimeout(60_000);
  const { electronApp, page } = await launchDesktopApp();

  await page.evaluate(() => {
    localStorage.setItem('beatbax:feature.songVisualizer', 'true');
    localStorage.setItem('beatbax:ui.activeRightTab', 'help');
  });
  await page.reload();
  await expect(page.locator('.status-document-name')).toBeVisible({ timeout: 15_000 });

  const visualizerState = await page.evaluate(() => {
    const visualizerTab = Array.from(document.querySelectorAll('button.bb-right-tab'))
      .find((element) => element.textContent?.includes('Visualizer'));
    const helpTab = Array.from(document.querySelectorAll('button.bb-right-tab'))
      .find((element) => element.textContent?.includes('Help'));
    const menuItem = document.querySelector('[data-item-id="song-visualizer-toggle"]');

    return {
      tabShown: visualizerTab !== undefined && !visualizerTab.classList.contains('bb-right-tab--hidden'),
      helpActive: helpTab?.classList.contains('bb-right-tab--active') ?? false,
      menuChecked: menuItem?.getAttribute('aria-checked') === 'true',
    };
  });

  expect(visualizerState).toEqual({ tabShown: true, helpActive: true, menuChecked: true });

  await page.locator('button.bb-right-tab[title="Visualizer"]').click();
  await expect(page.locator('#bb-viz-root')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.bb-viz__card')).toHaveCount(4);
  await expect(page.locator('#bb-viz-unmute-all')).toBeVisible();
  await expect(page.locator('#bb-viz-clear-solo')).toBeVisible();
  await page.locator('#bb-viz-mute-1').click();
  await expect(page.locator('#bb-viz-mute-1')).toHaveClass(/bb-cp__btn--active/);
  await expect(page.locator('#bb-viz-unmute-all')).toBeEnabled();
  await page.locator('#bb-viz-unmute-all svg').click();
  await expect(page.locator('#bb-viz-mute-1')).not.toHaveClass(/bb-cp__btn--active/);
  await expect(page.locator('#bb-viz-unmute-all')).toBeDisabled();

  await page.locator('#bb-viz-solo-2').click();
  await expect(page.locator('#bb-viz-solo-2')).toHaveClass(/bb-cp__btn--active/);
  await expect(page.locator('#bb-viz-clear-solo')).toBeEnabled();
  await page.locator('#bb-viz-clear-solo svg').click();
  await expect(page.locator('#bb-viz-solo-2')).not.toHaveClass(/bb-cp__btn--active/);
  await expect(page.locator('#bb-viz-clear-solo')).toBeDisabled();

  await page.locator('#bb-viz-fullscreen svg').click();
  await expect(page.locator('#bb-viz-root')).toHaveClass(/bb-viz--fullscreen/);
  await page.locator('#bb-viz-exit svg').click();
  await expect(page.locator('#bb-viz-root')).not.toHaveClass(/bb-viz--fullscreen/);

  await electronApp.close();
});

test('channel mixer renders desktop React UI and toggles channel state', async () => {
  test.setTimeout(60_000);
  const { electronApp, page } = await launchDesktopApp();

  await page.evaluate(() => {
    localStorage.setItem('beatbax:feature.channelMixer', 'true');
    localStorage.setItem('beatbax:panel.channel-mixer', 'true');
    localStorage.setItem('beatbax:ui.channelMixerDockMode', 'docked');
    localStorage.setItem('beatbax:transport.masterVolume', '100');
  });
  await page.reload();
  await expect(page.locator('.status-document-name')).toBeVisible({ timeout: 15_000 });

  await expect(page.locator('#bb-channel-mixer')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.bb-channel-mixer__strip')).toHaveCount(5);
  await expect(page.locator('#bb-channel-mixer-master-strip')).toBeVisible();
  await expect(page.locator('#bb-channel-mixer-master-volume-readout')).toContainText('100%');
  await expect(page.locator('#bb-channel-mixer-unmute-all')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#bb-channel-mixer-clear-solo')).toHaveAttribute('aria-disabled', 'true');

  await page.locator('#bb-channel-mixer-mute-1').click();
  await expect(page.locator('#bb-channel-mixer-mute-1')).toHaveClass(/bb-cp__btn--active/);
  await expect(page.locator('#bb-channel-mixer-unmute-all')).not.toHaveAttribute('aria-disabled', 'true');
  await page.locator('#bb-channel-mixer-unmute-all svg').click();
  await expect(page.locator('#bb-channel-mixer-mute-1')).not.toHaveClass(/bb-cp__btn--active/);
  await expect(page.locator('#bb-channel-mixer-unmute-all')).toHaveAttribute('aria-disabled', 'true');

  await page.locator('#bb-channel-mixer-solo-2').click();
  await expect(page.locator('#bb-channel-mixer-solo-2')).toHaveClass(/bb-cp__btn--active/);
  await expect(page.locator('#bb-channel-mixer-clear-solo')).not.toHaveAttribute('aria-disabled', 'true');
  await page.locator('#bb-channel-mixer-clear-solo svg').click();
  await expect(page.locator('#bb-channel-mixer-solo-2')).not.toHaveClass(/bb-cp__btn--active/);
  await expect(page.locator('#bb-channel-mixer-clear-solo')).toHaveAttribute('aria-disabled', 'true');

  const masterShaft = page.locator('#bb-channel-mixer-master-fader-shaft');
  const masterBox = await masterShaft.boundingBox();
  expect(masterBox).not.toBeNull();
  await masterShaft.click({ position: { x: Math.floor((masterBox?.width ?? 20) / 2), y: Math.floor((masterBox?.height ?? 100) * 0.75) } });
  await expect(page.locator('#bb-channel-mixer-master-volume-readout')).toContainText('25%');
  await expect(page.locator('[data-lcd="vol"]')).toContainText('25%');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('beatbax:transport.masterVolume'))).toBe('25');

  await page.locator('#bb-channel-mixer-dock-mode svg').click();
  await expect(page.locator('#bb-channel-mixer')).toHaveClass(/bb-channel-mixer--inline/);

  await page.evaluate(() => {
    localStorage.setItem('beatbax:panel.channel-mixer', 'false');
    localStorage.setItem('beatbax:ui.channelMixerDockMode', 'docked');
  });
  await electronApp.close();
});

test('saves edits back to an opened .bax file', async () => {
  test.setTimeout(60_000);
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'beatbax-e2e-save-'));
  const songPath = path.join(tempDir, 'save-test.bax');
  const original = readFileSync(sampleSongPath, 'utf8');
  writeFileSync(songPath, original, 'utf8');

  const { electronApp, page } = await launchDesktopApp([songPath]);
  await expect(page.locator('.status-document-name')).toHaveText('save-test.bax', { timeout: 15_000 });

  const marker = `// save-marker-${Date.now()}`;
  await page.locator('.monaco-editor').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(marker);

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+S' : 'Control+S');
  await expect(page.locator('#tb-status')).toContainText('Saved save-test.bax', { timeout: 15_000 });
  await expect(page.locator('#output-pane').getByText('Saved save-test.bax')).toBeVisible({ timeout: 15_000 });

  expect(readFileSync(songPath, 'utf8')).toContain(marker);

  await electronApp.close();
  rmSync(tempDir, { recursive: true, force: true });
});

test('uses platform-appropriate menu chrome', async () => {
  const { electronApp, page } = await launchDesktopApp();
  const platform = await page.evaluate(() => (window as unknown as { electronAPI: { getPlatform(): string } }).electronAPI.getPlatform());
  const inWindowMenuCount = await page.locator('.desktop-title-bar__menu-host .bb-menu-bar').count();

  if (platform === 'darwin') {
    expect(inWindowMenuCount).toBe(0);
  } else {
    expect(inWindowMenuCount).toBe(1);
    await page.locator('[data-menu-id="file"] .bb-menu__trigger').click();
    await expect(page.locator('#bb-menu-file .bb-menu__item-label')).toContainText(['Exit']);
  }

  await electronApp.close();
});
