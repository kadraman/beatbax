const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseArgs(argv) {
  const scriptName = argv[2];
  if (!scriptName) {
    throw new Error('Usage: node scripts/run-workspaces.cjs <script> [--exclude <workspace-name>]...');
  }

  const excluded = new Set();
  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--exclude') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --exclude');
      }
      excluded.add(value);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { scriptName, excluded };
}

function resolveWorkspacePattern(repoRoot, pattern) {
  const segments = pattern.split('/');
  const wildcardIndex = segments.indexOf('*');

  if (wildcardIndex !== -1) {
    if (wildcardIndex !== segments.length - 1) {
      throw new Error(`Unsupported workspace pattern: ${pattern}`);
    }
    const parentDir = path.join(repoRoot, ...segments.slice(0, -1));
    if (!fs.existsSync(parentDir)) {
      return [];
    }
    const entries = fs.readdirSync(parentDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(parentDir, entry.name));
  }

  // Explicit workspace path (e.g. packages/plugins/chip-sms)
  const dirPath = path.join(repoRoot, pattern);
  return fs.existsSync(dirPath) ? [dirPath] : [];
}

function findWorkspacePackages(repoRoot, rootPkg) {
  const workspaces = Array.isArray(rootPkg.workspaces) ? rootPkg.workspaces : [];
  const packageDirs = [];

  for (const pattern of workspaces) {
    for (const dirPath of resolveWorkspacePattern(repoRoot, pattern)) {
      const pkgPath = path.join(dirPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        packageDirs.push(dirPath);
      }
    }
  }

  return packageDirs;
}

function collectLocalWorkspaceDeps(pkg) {
  const fields = [
    pkg.dependencies,
    pkg.devDependencies,
    pkg.peerDependencies,
    pkg.optionalDependencies,
  ];
  const deps = new Set();

  for (const depField of fields) {
    if (!depField || typeof depField !== 'object') {
      continue;
    }
    for (const name of Object.keys(depField)) {
      deps.add(name);
    }
  }

  return deps;
}

function topologicalWorkspaceOrder(workspaceNames, workspaceMeta, discoveryOrder) {
  const runnableSet = new Set(workspaceNames);
  const adjacency = new Map();
  const indegree = new Map();

  for (const name of workspaceNames) {
    adjacency.set(name, []);
    indegree.set(name, 0);
  }

  for (const name of workspaceNames) {
    const deps = workspaceMeta.get(name).deps;
    for (const depName of deps) {
      if (!runnableSet.has(depName)) {
        continue;
      }
      adjacency.get(depName).push(name);
      indegree.set(name, indegree.get(name) + 1);
    }
  }

  const queue = workspaceNames
    .filter((name) => indegree.get(name) === 0)
    .sort((a, b) => discoveryOrder.get(a) - discoveryOrder.get(b));
  const ordered = [];

  while (queue.length > 0) {
    const current = queue.shift();
    ordered.push(current);

    for (const dependent of adjacency.get(current)) {
      indegree.set(dependent, indegree.get(dependent) - 1);
      if (indegree.get(dependent) === 0) {
        queue.push(dependent);
      }
    }

    queue.sort((a, b) => discoveryOrder.get(a) - discoveryOrder.get(b));
  }

  if (ordered.length !== workspaceNames.length) {
    console.warn('Workspace dependency cycle detected; falling back to discovery order.');
    return workspaceNames;
  }

  return ordered;
}

function main() {
  const { scriptName, excluded } = parseArgs(process.argv);
  const repoRoot = path.resolve(__dirname, '..');
  const npmExecPath = process.env.npm_execpath;
  const rootPkg = readJson(path.join(repoRoot, 'package.json'));
  const packageDirs = findWorkspacePackages(repoRoot, rootPkg);
  const discoveryOrder = new Map();
  const workspaceMeta = new Map();

  for (let i = 0; i < packageDirs.length; i += 1) {
    const dirPath = packageDirs[i];
    const pkg = readJson(path.join(dirPath, 'package.json'));
    if (!pkg.name || workspaceMeta.has(pkg.name) || excluded.has(pkg.name)) {
      continue;
    }

    discoveryOrder.set(pkg.name, i);
    workspaceMeta.set(pkg.name, {
      scripts: pkg.scripts || {},
      deps: collectLocalWorkspaceDeps(pkg),
    });
  }

  const runnable = [];
  for (const [name, meta] of workspaceMeta.entries()) {
    if (meta.scripts[scriptName]) {
      runnable.push(name);
    }
  }

  const orderedRunnable = topologicalWorkspaceOrder(runnable, workspaceMeta, discoveryOrder);

  if (orderedRunnable.length === 0) {
    console.log(`No workspaces have a \"${scriptName}\" script.`);
    return;
  }

  for (const workspaceName of orderedRunnable) {
    console.log(`\n> ${workspaceName}: npm run ${scriptName}`);
    const command = npmExecPath || (process.platform === 'win32' ? 'npm.cmd' : 'npm');
    const args = npmExecPath
      ? [command, '-w', workspaceName, 'run', scriptName]
      : ['-w', workspaceName, 'run', scriptName];

    const result = spawnSync(npmExecPath ? process.execPath : command, args, {
      cwd: repoRoot,
      stdio: 'inherit',
    });

    if (result.error) {
      console.error(`Failed to run npm for ${workspaceName}:`, result.error.message);
      process.exit(1);
    }

    if (result.status !== 0) {
      process.exit(result.status || 1);
    }
  }
}

try {
  main();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}