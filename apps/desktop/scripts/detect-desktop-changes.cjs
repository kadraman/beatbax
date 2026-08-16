#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {
  NULL_SHA,
  previousDesktopTag,
  resolveDesktopReleaseIdentity,
  shouldPackageDevRelease,
  writeGithubOutput,
} = require('./desktop-release-lib.cjs');

function git(args, options = {}) {
  const { allowFail: _allowFail, ...execOptions } = options;
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...execOptions,
  }).trim();
}

function gitAllowFail(args) {
  try {
    return git(args, { allowFail: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return '';
  }
}

function gitSucceeds(args) {
  try {
    execFileSync('git', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

function listTags(pattern) {
  const output = gitAllowFail(['tag', '-l', pattern]);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function changedFilesBetween(before, sha) {
  if (!before || before === NULL_SHA) {
    const output = gitAllowFail(['diff-tree', '--no-commit-id', '--name-only', '-r', sha]);
    return { files: output ? output.split(/\r?\n/).filter(Boolean) : [], uncertain: false };
  }
  if (!gitSucceeds(['cat-file', '-e', `${before}^{commit}`])) {
    gitAllowFail(['fetch', '--depth', '1', 'origin', before]);
  }
  const resolvedBefore = gitSucceeds(['cat-file', '-e', `${before}^{commit}`]);
  if (!resolvedBefore) {
    return { files: [], uncertain: true };
  }
  const output = gitAllowFail(['diff', '--name-only', before, sha]);
  return { files: output ? output.split(/\r?\n/).filter(Boolean) : [], uncertain: false };
}

function main() {
  const env = process.env;
  const eventName = env.GITHUB_EVENT_NAME || '';
  const ref = env.GITHUB_REF || '';
  const sha = env.GITHUB_SHA || gitAllowFail(['rev-parse', 'HEAD']);
  const desktopPkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const allDesktopTags = listTags('desktop-v*');
  const previousTag = previousDesktopTag(allDesktopTags);
  const identity = resolveDesktopReleaseIdentity({
    pkg: desktopPkg,
    env: { ...env, BEATBAX_DEV_RELEASE: '1' },
    sha,
  });

  const isMainPush = eventName === 'push' && ref === 'refs/heads/main';
  let packageDev = false;

  if (isMainPush) {
    const tagsAtHead = gitAllowFail(['tag', '--points-at', sha])
      .split(/\r?\n/)
      .filter(Boolean);
    const { files, uncertain } = changedFilesBetween(env.GITHUB_EVENT_BEFORE || '', sha);
    packageDev = shouldPackageDevRelease({ changedFiles: files, tagsAtHead });
    if (uncertain && !tagsAtHead.some((tag) => /^desktop-v\d/.test(tag))) {
      // Force-push whose previous SHA is gone: prefer publishing over skipping.
      packageDev = true;
    }
    console.log(
      `detect: package_dev=${packageDev} files=${files.length} uncertain=${uncertain} tagsAtHead=${tagsAtHead.join(',') || '(none)'}`,
    );
  } else {
    console.log(`detect: skipping path filter for ${eventName} ${ref}`);
  }

  const outputs = {
    package_dev: packageDev ? 'true' : 'false',
    previous_tag: previousTag,
    desktop_version: packageDev ? identity.version : '',
  };
  writeGithubOutput(env.GITHUB_OUTPUT, outputs);
  for (const [key, value] of Object.entries(outputs)) {
    console.log(`${key}=${value}`);
  }
}

main();
