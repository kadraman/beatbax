'use strict';

const DESKTOP_RELATED_PREFIXES = [
  'apps/desktop/',
  'packages/app-core/',
  'packages/engine/',
  'packages/ui-tokens/',
  'packages/plugins/',
  'songs/',
  'apps/web-ui/public/',
];

const DESKTOP_RELATED_FILES = new Set([
  'apps/web-ui/src/utils/browser-path.ts',
  'scripts/link-local-engine.cjs',
  'scripts/link-local-plugins.cjs',
  'package.json',
  'package-lock.json',
  '.github/workflows/desktop-build.yaml',
]);

const DESKTOP_RELATED_EXCLUDES = new Set(['apps/desktop/CHANGELOG.md']);

const NULL_SHA = '0000000000000000000000000000000000000000';

function normalizeRepoPath(filePath) {
  return String(filePath || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

function isDesktopRelatedPath(filePath) {
  const normalized = normalizeRepoPath(filePath);
  if (!normalized || DESKTOP_RELATED_EXCLUDES.has(normalized)) {
    return false;
  }
  if (DESKTOP_RELATED_FILES.has(normalized)) {
    return true;
  }
  return DESKTOP_RELATED_PREFIXES.some(
    (prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix),
  );
}

function isStableDesktopTag(tag) {
  return /^desktop-v\d/.test(String(tag || ''));
}

function shouldPackageDevRelease({ changedFiles = [], tagsAtHead = [] } = {}) {
  if (tagsAtHead.some(isStableDesktopTag)) {
    return false;
  }
  return changedFiles.some(isDesktopRelatedPath);
}

function parseDesktopSemver(tag) {
  const match = /^desktop-v(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(String(tag || ''));
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] || '',
  };
}

function compareDesktopTags(left, right) {
  const parsedLeft = parseDesktopSemver(left);
  const parsedRight = parseDesktopSemver(right);
  if (!parsedLeft && !parsedRight) {
    return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
  }
  if (!parsedLeft) {
    return 1;
  }
  if (!parsedRight) {
    return -1;
  }
  if (parsedLeft.major !== parsedRight.major) {
    return parsedLeft.major - parsedRight.major;
  }
  if (parsedLeft.minor !== parsedRight.minor) {
    return parsedLeft.minor - parsedRight.minor;
  }
  if (parsedLeft.patch !== parsedRight.patch) {
    return parsedLeft.patch - parsedRight.patch;
  }
  if (parsedLeft.pre === parsedRight.pre) {
    return 0;
  }
  if (!parsedLeft.pre) {
    return 1;
  }
  if (!parsedRight.pre) {
    return -1;
  }
  return parsedLeft.pre < parsedRight.pre ? -1 : 1;
}

function sortDesktopTagsDesc(tags) {
  return [...tags].filter(isStableDesktopTag).sort((left, right) => compareDesktopTags(right, left));
}

function previousDesktopTag(tags, currentTag) {
  const sorted = sortDesktopTagsDesc(tags);
  if (!currentTag || !isStableDesktopTag(currentTag)) {
    return sorted[0] || '';
  }
  const index = sorted.indexOf(currentTag);
  if (index >= 0) {
    return sorted[index + 1] || '';
  }
  return sorted.find((tag) => compareDesktopTags(tag, currentTag) < 0) || '';
}

function versionFromDesktopTag(tag) {
  const match = /^desktop-v(.+)$/.exec(String(tag || ''));
  return match ? match[1] : String(tag || '');
}

function shortSha(sha, length = 7) {
  const value = String(sha || '').trim();
  return value.slice(0, length);
}

function isTruthyEnv(value) {
  return value === '1' || value === 'true';
}

function resolveDesktopReleaseIdentity({ pkg, env = {}, sha = '' } = {}) {
  const packageVersion = pkg?.version || '0.0.0';
  const dev = isTruthyEnv(env.BEATBAX_DEV_RELEASE);
  const resolvedSha = shortSha(env.BEATBAX_DESKTOP_SHA || env.GITHUB_SHA || sha);
  const version =
    env.BEATBAX_DESKTOP_VERSION ||
    (dev && resolvedSha ? `${packageVersion}-dev.${resolvedSha}` : packageVersion);
  const defaultTagVersion = env.BEATBAX_DESKTOP_VERSION || packageVersion;
  const tag = env.BEATBAX_DESKTOP_TAG || (dev ? 'desktop-dev' : `desktop-v${defaultTagVersion}`);
  return { version, tag, dev, shortSha: resolvedSha };
}

function yamlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function azureSigningConfigured(env = {}) {
  return Boolean(
    env.AZURE_TENANT_ID &&
      env.AZURE_CLIENT_ID &&
      env.AZURE_CLIENT_SECRET &&
      env.AZURE_TRUSTED_SIGNING_ENDPOINT &&
      env.AZURE_TRUSTED_SIGNING_ACCOUNT &&
      env.AZURE_TRUSTED_SIGNING_PROFILE &&
      env.AZURE_TRUSTED_SIGNING_PUBLISHER,
  );
}

function buildElectronBuilderOverlay({
  baseConfigPath,
  version,
  devRelease = false,
  azure = false,
  env = {},
} = {}) {
  const lines = [`extends: ${yamlString(baseConfigPath)}`];
  if (version) {
    lines.push('extraMetadata:', `  version: ${yamlString(version)}`);
  }
  if (devRelease) {
    lines.push('artifactName: BeatBax-dev-${os}-${arch}.${ext}');
    lines.push('nsis:', '  artifactName: BeatBax-dev-setup.${ext}');
    lines.push('dmg:', '  artifactName: BeatBax-dev.${ext}');
    lines.push('appImage:', '  artifactName: BeatBax-dev.${ext}');
  }
  if (azure) {
    lines.push(
      'win:',
      '  azureSignOptions:',
      `    endpoint: ${yamlString(env.AZURE_TRUSTED_SIGNING_ENDPOINT)}`,
      `    codeSigningAccountName: ${yamlString(env.AZURE_TRUSTED_SIGNING_ACCOUNT)}`,
      `    certificateProfileName: ${yamlString(env.AZURE_TRUSTED_SIGNING_PROFILE)}`,
      `    publisherName: ${yamlString(env.AZURE_TRUSTED_SIGNING_PUBLISHER)}`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function needsBuilderOverlay({ version, pkgVersion, devRelease, azure } = {}) {
  return Boolean(devRelease || azure || (version && version !== pkgVersion));
}

function mergeReleaseNotes(curated, generated) {
  const curatedText = String(curated || '').trim();
  const generatedText = String(generated || '').trim();
  if (curatedText && generatedText) {
    return `${curatedText}\n\n${generatedText}\n`;
  }
  if (curatedText) {
    return `${curatedText}\n`;
  }
  if (generatedText) {
    return `${generatedText}\n`;
  }
  return '';
}

function formatChangelogSection({ version, date, body }) {
  return `## ${version} — ${date}\n\n${String(body || '').trim()}\n`;
}

function changelogHasVersion(existing, version) {
  const escaped = String(version).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^## ${escaped}(?:\\s|$)`, 'm').test(String(existing || ''));
}

function prependChangelogSection(existing, { version, date, body }) {
  const source = String(existing || '').replace(/^\uFEFF/, '');
  if (changelogHasVersion(source, version)) {
    return { content: source, changed: false };
  }
  const section = formatChangelogSection({ version, date, body });
  const headingIndex = source.search(/^## /m);
  if (headingIndex === -1) {
    const prefix = source.endsWith('\n') || source.length === 0 ? source : `${source}\n`;
    const spacer = prefix.endsWith('\n\n') || prefix.length === 0 ? '' : '\n';
    return { content: `${prefix}${spacer}${section}\n`, changed: true };
  }
  const before = source.slice(0, headingIndex);
  const after = source.slice(headingIndex);
  const spacer = before.endsWith('\n\n') || before.length === 0 ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  return { content: `${before}${spacer}${section}\n${after}`, changed: true };
}

function parseGitHubRepo(env = {}, repositoryUrl = '') {
  if (env.GITHUB_REPOSITORY) {
    return env.GITHUB_REPOSITORY;
  }
  const match = String(repositoryUrl).match(/github\.com[:/](.+?)(?:\.git)?$/);
  return match ? match[1] : 'kadraman/beatbax';
}

async function fetchGitHubReleaseNotes({
  repo,
  token,
  tagName,
  previousTagName,
  targetCommitish,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available to generate GitHub release notes');
  }
  const payload = { tag_name: tagName };
  if (previousTagName) {
    payload.previous_tag_name = previousTagName;
  }
  if (targetCommitish) {
    payload.target_commitish = targetCommitish;
  }
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetchImpl(`https://api.github.com/repos/${repo}/releases/generate-notes`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub generate-notes failed (${response.status}): ${detail}`);
  }
  const data = await response.json();
  return String(data.body || '').trim();
}

function writeGithubOutput(filePath, values) {
  if (!filePath) {
    return;
  }
  const fs = require('node:fs');
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value ?? ''}`);
  fs.appendFileSync(filePath, `${lines.join('\n')}\n`);
}

module.exports = {
  DESKTOP_RELATED_EXCLUDES,
  DESKTOP_RELATED_FILES,
  DESKTOP_RELATED_PREFIXES,
  NULL_SHA,
  azureSigningConfigured,
  buildElectronBuilderOverlay,
  changelogHasVersion,
  compareDesktopTags,
  fetchGitHubReleaseNotes,
  formatChangelogSection,
  isDesktopRelatedPath,
  isStableDesktopTag,
  isTruthyEnv,
  mergeReleaseNotes,
  needsBuilderOverlay,
  normalizeRepoPath,
  parseGitHubRepo,
  prependChangelogSection,
  previousDesktopTag,
  resolveDesktopReleaseIdentity,
  shortSha,
  shouldPackageDevRelease,
  sortDesktopTagsDesc,
  versionFromDesktopTag,
  writeGithubOutput,
  yamlString,
};
