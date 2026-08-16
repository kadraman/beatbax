/** @jest-environment node */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const loadCjs = createRequire(__filename);
const {
  buildElectronBuilderOverlay,
  changelogHasVersion,
  compareDesktopTags,
  fetchGitHubReleaseNotes,
  isDesktopRelatedPath,
  needsBuilderOverlay,
  prependChangelogSection,
  previousDesktopTag,
  resolveDesktopReleaseIdentity,
  shouldPackageDevRelease,
  yamlString,
} = loadCjs('../scripts/desktop-release-lib.cjs') as {
  buildElectronBuilderOverlay: (input: Record<string, unknown>) => string;
  changelogHasVersion: (existing: string, version: string) => boolean;
  compareDesktopTags: (left: string, right: string) => number;
  fetchGitHubReleaseNotes: (input: Record<string, unknown>) => Promise<string>;
  isDesktopRelatedPath: (filePath: string) => boolean;
  needsBuilderOverlay: (input: Record<string, unknown>) => boolean;
  prependChangelogSection: (
    existing: string,
    input: { version: string; date: string; body: string },
  ) => { content: string; changed: boolean };
  previousDesktopTag: (tags: string[], currentTag?: string) => string;
  resolveDesktopReleaseIdentity: (input: Record<string, unknown>) => {
    version: string;
    tag: string;
    dev: boolean;
    shortSha: string;
  };
  shouldPackageDevRelease: (input: {
    changedFiles?: string[];
    tagsAtHead?: string[];
  }) => boolean;
  yamlString: (value: string) => string;
};

describe('isDesktopRelatedPath', () => {
  it('matches desktop app, engine, plugins, songs, and workflow files', () => {
    expect(isDesktopRelatedPath('apps/desktop/src/main/index.ts')).toBe(true);
    expect(isDesktopRelatedPath('packages/app-core/src/index.ts')).toBe(true);
    expect(isDesktopRelatedPath('packages/engine/src/index.ts')).toBe(true);
    expect(isDesktopRelatedPath('packages/ui-tokens/tokens.css')).toBe(true);
    expect(isDesktopRelatedPath('packages/plugins/chip-sms/src/index.ts')).toBe(true);
    expect(isDesktopRelatedPath('songs/examples/demo.bax')).toBe(true);
    expect(isDesktopRelatedPath('apps/web-ui/public/favicon.ico')).toBe(true);
    expect(isDesktopRelatedPath('apps/web-ui/src/utils/browser-path.ts')).toBe(true);
    expect(isDesktopRelatedPath('scripts/link-local-engine.cjs')).toBe(true);
    expect(isDesktopRelatedPath('package.json')).toBe(true);
    expect(isDesktopRelatedPath('package-lock.json')).toBe(true);
    expect(isDesktopRelatedPath('.github/workflows/desktop-build.yaml')).toBe(true);
  });

  it('ignores changelog-only and unrelated paths', () => {
    expect(isDesktopRelatedPath('apps/desktop/CHANGELOG.md')).toBe(false);
    expect(isDesktopRelatedPath('apps/web-ui/src/main.ts')).toBe(false);
    expect(isDesktopRelatedPath('docs/releasing.md')).toBe(false);
    expect(isDesktopRelatedPath('packages/cli/src/index.ts')).toBe(false);
    expect(isDesktopRelatedPath('packages/foo/package.json')).toBe(false);
  });
});

describe('shouldPackageDevRelease', () => {
  it('packages when desktop-related files change', () => {
    expect(
      shouldPackageDevRelease({
        changedFiles: ['docs/releasing.md', 'apps/desktop/src/main/index.ts'],
        tagsAtHead: [],
      }),
    ).toBe(true);
  });

  it('skips when the commit is already a stable desktop tag', () => {
    expect(
      shouldPackageDevRelease({
        changedFiles: ['apps/desktop/src/main/index.ts'],
        tagsAtHead: ['desktop-v0.2.0'],
      }),
    ).toBe(false);
  });

  it('skips changelog-only commits', () => {
    expect(
      shouldPackageDevRelease({
        changedFiles: ['apps/desktop/CHANGELOG.md'],
        tagsAtHead: [],
      }),
    ).toBe(false);
  });
});

describe('previousDesktopTag', () => {
  it('sorts semver rather than lexicographically', () => {
    expect(compareDesktopTags('desktop-v0.10.0', 'desktop-v0.2.0')).toBeGreaterThan(0);
    expect(
      previousDesktopTag(['desktop-v0.2.0', 'desktop-v0.10.0', 'desktop-v0.1.0'], 'desktop-v0.10.0'),
    ).toBe('desktop-v0.2.0');
  });

  it('returns the latest stable tag when the current tag is desktop-dev', () => {
    expect(previousDesktopTag(['desktop-v0.1.0', 'desktop-v0.2.0'], 'desktop-dev')).toBe(
      'desktop-v0.2.0',
    );
  });

  it('returns the previous tag when the current tag is not in the list yet', () => {
    expect(previousDesktopTag(['desktop-v0.1.0', 'desktop-v0.2.0'], 'desktop-v0.3.0')).toBe(
      'desktop-v0.2.0',
    );
  });
});

describe('resolveDesktopReleaseIdentity', () => {
  const pkg = { version: '0.2.0' };

  it('uses package.json for stable builds', () => {
    expect(resolveDesktopReleaseIdentity({ pkg, env: {}, sha: 'abcdef123' })).toEqual({
      version: '0.2.0',
      tag: 'desktop-v0.2.0',
      dev: false,
      shortSha: 'abcdef1',
    });
  });

  it('appends -dev.<sha> for development releases', () => {
    expect(
      resolveDesktopReleaseIdentity({
        pkg,
        env: { BEATBAX_DEV_RELEASE: '1', GITHUB_SHA: '9f8e7d6c5b4a' },
      }),
    ).toMatchObject({
      version: '0.2.0-dev.9f8e7d6',
      tag: 'desktop-dev',
      dev: true,
    });
  });

  it('honors explicit version and tag overrides', () => {
    expect(
      resolveDesktopReleaseIdentity({
        pkg,
        env: {
          BEATBAX_DEV_RELEASE: '1',
          BEATBAX_DESKTOP_VERSION: '0.2.0-dev.custom',
          BEATBAX_DESKTOP_TAG: 'desktop-dev',
        },
      }),
    ).toMatchObject({
      version: '0.2.0-dev.custom',
      tag: 'desktop-dev',
    });
  });
});

describe('electron-builder overlay', () => {
  it('quotes YAML strings and stamps dev artifact names', () => {
    expect(yamlString("O'Reilly")).toBe("'O''Reilly'");
    const yaml = buildElectronBuilderOverlay({
      baseConfigPath: '/repo/apps/desktop/electron-builder.yml',
      version: '0.2.0-dev.abc1234',
      devRelease: true,
      azure: true,
      env: {
        AZURE_TRUSTED_SIGNING_ENDPOINT: 'https://example.codesigning.azure.net',
        AZURE_TRUSTED_SIGNING_ACCOUNT: 'acct',
        AZURE_TRUSTED_SIGNING_PROFILE: 'prof',
        AZURE_TRUSTED_SIGNING_PUBLISHER: 'CN=BeatBax',
      },
    });
    expect(yaml).toContain("extraMetadata:\n  version: '0.2.0-dev.abc1234'");
    expect(yaml).toContain('artifactName: BeatBax-dev-${os}-${arch}.${ext}');
    expect(yaml).toContain('artifactName: BeatBax-dev-setup.${ext}');
    expect(yaml).toContain('artifactName: BeatBax-dev.${ext}');
    expect(yaml).toContain('azureSignOptions:');
  });

  it('needs an overlay for version overrides, dev names, or Azure signing', () => {
    expect(needsBuilderOverlay({ version: '0.2.0', pkgVersion: '0.2.0' })).toBe(false);
    expect(needsBuilderOverlay({ version: '0.2.0-dev.abc', pkgVersion: '0.2.0' })).toBe(true);
    expect(needsBuilderOverlay({ devRelease: true, pkgVersion: '0.2.0' })).toBe(true);
    expect(needsBuilderOverlay({ azure: true, pkgVersion: '0.2.0' })).toBe(true);
  });
});

describe('changelog prepend', () => {
  const header = '# BeatBax Desktop changelog\n\nIntro.\n\n';

  it('inserts a new section after the intro and skips duplicates', () => {
    const first = prependChangelogSection(header, {
      version: '0.3.0',
      date: '2026-08-16',
      body: '## What\'s Changed\n* Fix foo',
    });
    expect(first.changed).toBe(true);
    expect(first.content).toContain('## 0.3.0 — 2026-08-16');
    expect(first.content.indexOf('## 0.3.0')).toBeGreaterThan(first.content.indexOf('# BeatBax'));
    expect(changelogHasVersion(first.content, '0.3.0')).toBe(true);

    const second = prependChangelogSection(first.content, {
      version: '0.3.0',
      date: '2026-08-17',
      body: 'duplicate',
    });
    expect(second.changed).toBe(false);
  });

  it('inserts a new stable section above existing seeded versions', () => {
    const existing = readFileSync(join(__dirname, '../CHANGELOG.md'), 'utf8');
    expect(changelogHasVersion(existing, '0.2.0')).toBe(true);
    const result = prependChangelogSection(existing, {
      version: '0.3.0',
      date: '2026-08-16',
      body: '* Example change',
    });
    expect(result.changed).toBe(true);
    expect(result.content.indexOf('## 0.3.0')).toBeLessThan(result.content.indexOf('## 0.2.0'));
  });
});

describe('fetchGitHubReleaseNotes', () => {
  it('posts tag and previous_tag_name to generate-notes', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({ body: '## What\'s Changed\n* Hello' }),
    }));
    const body = await fetchGitHubReleaseNotes({
      repo: 'kadraman/beatbax',
      token: 'secret',
      tagName: 'desktop-dev',
      previousTagName: 'desktop-v0.2.0',
      targetCommitish: 'abc123',
      fetchImpl,
    });
    expect(body).toContain('Hello');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const firstCall = fetchImpl.mock.calls[0] as unknown as [
      string,
      { body: string; headers: Record<string, string> },
    ];
    const request = firstCall[1];
    expect(JSON.parse(request.body)).toEqual({
      tag_name: 'desktop-dev',
      previous_tag_name: 'desktop-v0.2.0',
      target_commitish: 'abc123',
    });
    expect(request.headers.Authorization).toBe('Bearer secret');
  });
});
