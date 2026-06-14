const fs = require('fs');
const path = require('path');

const desktopRoot = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(desktopRoot, 'package.json'), 'utf8'));
const buildDir = path.join(desktopRoot, 'build');

const repositoryUrl = (pkg.repository?.url || 'https://github.com/kadraman/beatbax.git').replace(
  /\.git$/,
  '',
);

const sharedReplacements = {
  '{{VERSION}}': pkg.version,
  '{{DESKTOP_TAG}}': `desktop-v${pkg.version}`,
  '{{BUILD_DATE}}': new Date().toISOString().slice(0, 10),
  '{{COPYRIGHT_YEAR}}': String(new Date().getFullYear()),
  '{{HOMEPAGE}}': pkg.homepage || repositoryUrl,
  '{{REPOSITORY}}': repositoryUrl,
  '{{RELEASES_URL}}': `${repositoryUrl}/releases`,
};

function renderTemplate(templateName, outputName, extraReplacements = {}) {
  const templatePath = path.join(buildDir, templateName);
  const outputPath = path.join(buildDir, outputName);
  const replacements = { ...sharedReplacements, ...extraReplacements };

  let content = fs.readFileSync(templatePath, 'utf8');
  for (const [token, value] of Object.entries(replacements)) {
    content = content.replaceAll(token, value);
  }

  fs.writeFileSync(outputPath, content, 'utf8');
  console.log(`Wrote ${outputPath}`);
}

const releaseNotesBodyPath = path.join(buildDir, 'release-notes.body.txt');
const releaseNotesBody = fs.existsSync(releaseNotesBodyPath)
  ? fs.readFileSync(releaseNotesBodyPath, 'utf8').trimEnd()
  : '  (No release notes provided for this build.)';

renderTemplate('README.template.txt', 'README.txt');
renderTemplate('RELEASE-NOTES.template.txt', 'RELEASE-NOTES.txt', {
  '{{RELEASE_NOTES_BODY}}': releaseNotesBody,
});

console.log(`Generated install docs for BeatBax Desktop v${pkg.version}`);
