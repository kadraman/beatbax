#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {
  fetchGitHubReleaseNotes,
  parseGitHubRepo,
  prependChangelogSection,
  previousDesktopTag,
  versionFromDesktopTag,
  writeGithubOutput,
} = require('./desktop-release-lib.cjs');

function parseArgs(argv) {
  const options = {
    notesOnly: false,
    prepend: false,
    printPrevious: false,
    tag: '',
    previous: '',
    target: '',
    changelog: '',
    out: '',
    date: '',
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--notes-only') {
      options.notesOnly = true;
    } else if (arg === '--prepend') {
      options.prepend = true;
    } else if (arg === '--print-previous') {
      options.printPrevious = true;
    } else if (arg === '--tag') {
      options.tag = argv[(index += 1)] || '';
    } else if (arg === '--previous') {
      options.previous = argv[(index += 1)] || '';
    } else if (arg === '--target') {
      options.target = argv[(index += 1)] || '';
    } else if (arg === '--changelog') {
      options.changelog = argv[(index += 1)] || '';
    } else if (arg === '--out') {
      options.out = argv[(index += 1)] || '';
    } else if (arg === '--date') {
      options.date = argv[(index += 1)] || '';
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.notesOnly && !options.prepend && !options.printPrevious) {
    throw new Error('Pass --notes-only, --prepend, and/or --print-previous');
  }
  return options;
}

function gitAllowFail(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

function listDesktopTags() {
  const output = gitAllowFail(['tag', '-l', 'desktop-v*']);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

async function main() {
  const options = parseArgs(process.argv);
  const env = process.env;
  const desktopRoot = path.resolve(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(desktopRoot, 'package.json'), 'utf8'));
  const repo = parseGitHubRepo(env, pkg.repository?.url);
  const token = env.GITHUB_TOKEN || env.GH_TOKEN || '';
  const tagName = options.tag || env.BEATBAX_DESKTOP_TAG || 'desktop-dev';
  const previous =
    options.previous ||
    env.BEATBAX_PREVIOUS_DESKTOP_TAG ||
    previousDesktopTag(listDesktopTags(), /^desktop-v\d/.test(tagName) ? tagName : '');

  if (options.printPrevious) {
    writeGithubOutput(env.GITHUB_OUTPUT, { tag: previous });
    process.stdout.write(`${previous}\n`);
    if (!options.notesOnly && !options.prepend) {
      return;
    }
  }

  const target = options.target || env.GITHUB_SHA || '';
  const date = options.date || new Date().toISOString().slice(0, 10);

  let body;
  try {
    body = await fetchGitHubReleaseNotes({
      repo,
      token,
      tagName,
      previousTagName: previous,
      targetCommitish: target,
    });
  } catch (error) {
    if (!options.notesOnly || options.prepend) {
      throw error;
    }
    console.warn(`generate-changelog: ${error.message}`);
    body = `Development build from ${target || 'main'}. See GitHub for pull requests since ${previous || 'the last stable desktop tag'}.`;
  }

  if (options.notesOnly) {
    if (options.out) {
      fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
      fs.writeFileSync(options.out, `${body.trimEnd()}\n`);
      console.log(`Wrote ${options.out}`);
    } else {
      process.stdout.write(`${body.trimEnd()}\n`);
    }
  }

  if (options.prepend) {
    const changelogPath =
      options.changelog || path.join(desktopRoot, 'CHANGELOG.md');
    const existing = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '';
    const version = versionFromDesktopTag(tagName);
    const result = prependChangelogSection(existing, { version, date, body });
    if (!result.changed) {
      console.log(`CHANGELOG already has ${version}; skipping`);
      return;
    }
    fs.writeFileSync(changelogPath, result.content.endsWith('\n') ? result.content : `${result.content}\n`);
    console.log(`Updated ${changelogPath} with ${version}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
