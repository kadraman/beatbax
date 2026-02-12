# Releasing Packages to npm

## Overview

BeatBax uses **Changesets** to manage versioning and publishing of packages to npm. This guide covers the complete workflow for releasing `@beatbax/engine` and `@beatbax/cli` packages.

## Why Changesets?

Changesets solve key problems in monorepo package management:

1. **Version coordination** - Automatically manages semantic versioning across multiple packages
2. **Dependency updates** - When `@beatbax/engine` updates, automatically bumps the dependency in `@beatbax/cli`
3. **Changelog generation** - Creates CHANGELOG.md files automatically from changeset descriptions
4. **Safe publishing** - Validates builds and dependencies before publishing
5. **Human-readable intent** - Developers describe changes in plain language, not version numbers

## Installation

Install changesets CLI (already added to package.json):

```bash
npm install
```

## Release Workflow

### 1. Making Changes

As you develop features or fix bugs, commit your code normally:

```bash
git add .
git commit -m "feat: add vibrato effect support"
```

### 2. Creating a Changeset

After committing changes, create a changeset to document what changed:

```bash
npm run changeset
```

This will prompt you:

```
🦋  Which packages would you like to include?
◯ @beatbax/cli
◉ @beatbax/engine
◯ @beatbax/web-ui

🦋  What kind of change is this for @beatbax/engine?
◯ patch (0.1.0 → 0.1.1)
◯ minor (0.1.0 → 0.2.0)
◉ major (0.1.0 → 1.0.0)

🦋  Please enter a summary for this change
> Added vibrato effect with rate and depth controls
```

**Choose version bump type:**
- **Patch** (0.1.0 → 0.1.1) - Bug fixes, documentation, internal changes
- **Minor** (0.1.0 → 0.2.0) - New features, backward-compatible API additions
- **Major** (0.1.0 → 1.0.0) - Breaking changes, API removals/changes

This creates a file in `.changeset/` directory (e.g., `.changeset/brave-cats-jump.md`):

```markdown
---
"@beatbax/engine": minor
---

Added vibrato effect with rate and depth controls
```

**Commit the changeset:**

```bash
git add .changeset
git commit -m "chore: add changeset for vibrato feature"
git push
```

### 3. Accumulating Changes

You can create multiple changesets before releasing:

```bash
# Week 1: Add feature
npm run changeset  # Creates changeset A
git add . && git commit -m "chore: add changeset for feature X"

# Week 2: Fix bug
npm run changeset  # Creates changeset B
git add . && git commit -m "chore: add changeset for bug fix Y"

# Week 3: Add another feature
npm run changeset  # Creates changeset C
git add . && git commit -m "chore: add changeset for feature Z"
```

All changesets will be combined during the next release.

### 4. Versioning Packages

When ready to release, consume all changesets and update versions:

```bash
npm run version-packages
```

This will:
1. ✅ Read all changesets in `.changeset/` directory
2. ✅ Determine new version numbers based on semver rules
3. ✅ Update `package.json` versions in affected packages
4. ✅ Update `@beatbax/cli` dependency on `@beatbax/engine` if needed
5. ✅ Generate/update `CHANGELOG.md` in each package
6. ✅ Delete consumed changeset files

**Review the changes:**

```bash
git diff
```

You'll see updated versions in `packages/*/package.json` and new CHANGELOG entries.

**Commit the version bump:**

```bash
git add .
git commit -m "chore: version packages"
git push
```

### 5. Publishing to npm

**One-time setup: Login to npm**

```bash
npm login
```

Enter your npm credentials. Your account must have publish access to the `@beatbax` organization.

**Publish packages:**

```bash
npm run release
```

This will:
1. ✅ Build all packages (`npm run build-all`)
2. ✅ Run tests (via prepublishOnly hooks)
3. ✅ Publish `@beatbax/engine` to npm
4. ✅ Publish `@beatbax/cli` to npm
5. ✅ Create git tags for each published version

**Push tags:**

```bash
git push --follow-tags
```

### 6. Verify Publication

Check that packages are live:

```bash
npm view @beatbax/engine
npm view @beatbax/cli
```

Or visit:
- https://www.npmjs.com/package/@beatbax/engine
- https://www.npmjs.com/package/@beatbax/cli

## Using Published Packages

### In web-ui or External Projects

After publishing, update `@beatbax/web-ui` or external projects:

```bash
cd apps/web-ui
npm install @beatbax/engine@latest @beatbax/cli@latest
```

Or specify exact versions in `package.json`:

```json
{
  "dependencies": {
    "@beatbax/engine": "^0.2.0",
    "@beatbax/cli": "^0.2.0"
  }
}
```

Then run:

```bash
npm install
```

## Common Scenarios

### Scenario 1: Bug Fix in Engine

```bash
# Fix bug in packages/engine/src/chips/gameboy/noise.ts
git add packages/engine
git commit -m "fix: correct noise LFSR seed initialization"

# Create changeset
npm run changeset
# Select: @beatbax/engine
# Choose: patch
# Summary: "Fixed noise channel LFSR seed initialization"

git add .changeset
git commit -m "chore: add changeset for noise fix"
git push

# When ready to release
npm run version-packages  # → 0.1.0 → 0.1.1
git add . && git commit -m "chore: version packages" && git push
npm run release
git push --follow-tags
```

### Scenario 2: New Feature in Engine, Used by CLI

```bash
# Add feature in engine
git add packages/engine
git commit -m "feat: add arpeggio effect"

# Update CLI to use feature
git add packages/cli
git commit -m "feat: add arpeggio export to CLI"

# Create changeset for both
npm run changeset
# Select: @beatbax/engine AND @beatbax/cli
# Choose: minor for both
# Summary: "Added arpeggio effect support"

git add .changeset
git commit -m "chore: add changeset for arpeggio feature"
git push

# When ready to release
npm run version-packages  # → engine: 0.1.0 → 0.2.0, cli: 0.1.0 → 0.2.0
git add . && git commit -m "chore: version packages" && git push
npm run release
git push --follow-tags
```

### Scenario 3: Breaking Change in Engine

```bash
# Refactor with breaking API change
git add packages/engine
git commit -m "refactor!: change instrument definition format"

# Create changeset
npm run changeset
# Select: @beatbax/engine
# Choose: major
# Summary: "BREAKING: Changed instrument definition format from object to class-based"

git add .changeset
git commit -m "chore: add changeset for breaking change"
git push

# When ready to release
npm run version-packages  # → 0.1.0 → 1.0.0
git add . && git commit -m "chore: version packages" && git push
npm run release
git push --follow-tags
```

## CI/CD Integration (Future)

For automated releases, use GitHub Actions:

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    branches:
      - main

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          registry-url: 'https://registry.npmjs.org'

      - run: npm install
      - run: npm run build-all
      - run: npm test

      - name: Create Release Pull Request or Publish
        uses: changesets/action@v1
        with:
          publish: npm run release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

This will:
1. Automatically create a PR when changesets are pushed
2. Update PR with accumulated changelogs
3. Publish to npm when PR is merged

## Troubleshooting

### "You must be logged in to publish packages"

```bash
npm login
```

### "You do not have permission to publish @beatbax/engine"

Your npm account needs to be added to the `@beatbax` organization. Contact the org owner.

### "Package version already exists"

You're trying to publish a version that's already on npm. Run:

```bash
npm run version-packages
```

This will bump the version number.

### "Cannot find module './dist/index.js'"

Build hasn't run. The publish script includes build:

```bash
npm run build-all
```

Or use the release script which builds automatically:

```bash
npm run release
```

### CLI not working after install

Ensure [dist/cli.js](../packages/cli/dist/cli.js) has a shebang:

```javascript
#!/usr/bin/env node
```

And the bin field in [packages/cli/package.json](../packages/cli/package.json) is correct:

```json
{
  "bin": {
    "beatbax": "dist/cli.js"
  }
}
```

## Best Practices

1. **Create changesets immediately** after committing features/fixes
2. **Write clear summaries** - they become your CHANGELOG entries
3. **Choose correct bump type:**
   - Patch: Internal changes, bug fixes
   - Minor: New features, additions
   - Major: Breaking changes
4. **Batch releases** - accumulate multiple changesets before versioning
5. **Test locally** before publishing:
   ```bash
   npm run build-all
   npm test
   ```
6. **Use npm link for local testing:**
   ```bash
   cd packages/engine
   npm link
   cd ../../../some-other-project
   npm link @beatbax/engine
   ```

## Resources

- [Changesets Documentation](https://github.com/changesets/changesets)
- [Semantic Versioning](https://semver.org/)
- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Scoped Packages (@beatbax/*)](https://docs.npmjs.com/cli/v10/using-npm/scope)

## Support

For issues with releases:
1. Check [this guide](./releasing-to-npm.md)
2. Review [CONTRIBUTING.md](../CONTRIBUTING.md)
3. Open an issue with the `release` label
