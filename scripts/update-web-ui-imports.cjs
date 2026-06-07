const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const webUi = path.join(root, 'apps', 'web-ui');

const replacements = [
  [/from '\.\/stores\//g, "from '@beatbax/app-core/stores/"],
  [/from '\.\/playback\//g, "from '@beatbax/app-core/playback/"],
  [/from '\.\/editor'/g, "from '@beatbax/app-core/editor'"],
  [/from '\.\/editor\//g, "from '@beatbax/app-core/editor/"],
  [/from '\.\/export\//g, "from '@beatbax/app-core/export/"],
  [/from '\.\/import\//g, "from '@beatbax/app-core/import/"],
  [/from '\.\/plugins\//g, "from '@beatbax/app-core/plugins/"],
  [/from '\.\/types\//g, "from '@beatbax/app-core/types/"],
  [/from '\.\/utils\/event-bus'/g, "from '@beatbax/app-core/utils/event-bus'"],
  [/from '\.\/utils\/feature-flags'/g, "from '@beatbax/app-core/utils/feature-flags'"],
  [/from '\.\/utils\/local-storage'/g, "from '@beatbax/app-core/utils/local-storage'"],
  [/from '\.\.\/stores\//g, "from '@beatbax/app-core/stores/"],
  [/from '\.\.\/playback\//g, "from '@beatbax/app-core/playback/"],
  [/from '\.\.\/editor'/g, "from '@beatbax/app-core/editor'"],
  [/from '\.\.\/editor\//g, "from '@beatbax/app-core/editor/"],
  [/from '\.\.\/export\//g, "from '@beatbax/app-core/export/"],
  [/from '\.\.\/import\//g, "from '@beatbax/app-core/import/"],
  [/from '\.\.\/plugins\//g, "from '@beatbax/app-core/plugins/"],
  [/from '\.\.\/types\//g, "from '@beatbax/app-core/types/"],
  [/from '\.\.\/utils\/event-bus'/g, "from '@beatbax/app-core/utils/event-bus'"],
  [/from '\.\.\/utils\/feature-flags'/g, "from '@beatbax/app-core/utils/feature-flags'"],
  [/from '\.\.\/utils\/local-storage'/g, "from '@beatbax/app-core/utils/local-storage'"],
  [/from '\.\.\/\.\.\/stores\//g, "from '@beatbax/app-core/stores/"],
  [/from '\.\.\/\.\.\/playback\//g, "from '@beatbax/app-core/playback/"],
  [/from '\.\.\/\.\.\/editor\//g, "from '@beatbax/app-core/editor/"],
  [/from '\.\.\/\.\.\/export\//g, "from '@beatbax/app-core/export/"],
  [/from '\.\.\/\.\.\/import\//g, "from '@beatbax/app-core/import/"],
  [/from '\.\.\/\.\.\/plugins\//g, "from '@beatbax/app-core/plugins/"],
  [/from '\.\.\/\.\.\/types\//g, "from '@beatbax/app-core/types/"],
  [/from '\.\.\/\.\.\/utils\/event-bus'/g, "from '@beatbax/app-core/utils/event-bus'"],
  [/from '\.\.\/\.\.\/utils\/feature-flags'/g, "from '@beatbax/app-core/utils/feature-flags'"],
  [/from '\.\.\/\.\.\/utils\/local-storage'/g, "from '@beatbax/app-core/utils/local-storage'"],
  [/from '\.\.\/\.\.\/input\/midi-step-entry'/g, "from '@beatbax/app-core/input/midi-step-entry'"],
  [/from '\.\.\/src\/playback\//g, "from '@beatbax/app-core/playback/"],
  [/from '\.\.\/src\/editor'/g, "from '@beatbax/app-core/editor'"],
  [/from '\.\.\/src\/editor\//g, "from '@beatbax/app-core/editor/"],
  [/from '\.\.\/src\/export\//g, "from '@beatbax/app-core/export/"],
  [/from '\.\.\/src\/import\//g, "from '@beatbax/app-core/import/"],
  [/from '\.\.\/src\/plugins\//g, "from '@beatbax/app-core/plugins/"],
  [/from '\.\.\/src\/types\//g, "from '@beatbax/app-core/types/"],
  [/from '\.\.\/src\/utils\/event-bus'/g, "from '@beatbax/app-core/utils/event-bus'"],
  [/from '\.\.\/src\/utils\/feature-flags'/g, "from '@beatbax/app-core/utils/feature-flags'"],
  [/from '\.\.\/src\/utils\/local-storage'/g, "from '@beatbax/app-core/utils/local-storage'"],
  [/from '\.\.\/src\/input\/midi-step-entry'/g, "from '@beatbax/app-core/input/midi-step-entry'"],
  [/from '\.\.\/src\/utils\/event-bus';/g, "from '@beatbax/app-core/utils/event-bus';"],
  [/import \{ EventBus \} from '@beatbax\/app-core\/utils\/event-bus'/g, "import { EventBus } from '@beatbax/app-core/utils/event-bus'"],
];

function walk(dir, cb) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, cb);
    else if (/\.(ts|tsx)$/.test(entry.name)) cb(full);
  }
}

walk(path.join(webUi, 'src'), (file) => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const [re, rep] of replacements) {
    if (re.test(content)) {
      content = content.replace(re, rep);
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(file, content);
});

walk(path.join(webUi, 'tests'), (file) => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const [re, rep] of replacements) {
    if (re.test(content)) {
      content = content.replace(re, rep);
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(file, content);
});

console.log('Import paths updated in web-ui');
