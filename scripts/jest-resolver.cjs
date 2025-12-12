const path = require('path');
const fs = require('fs');
module.exports = function (request, options) {
  // Use the provided default resolver from Jest options if available
  const dResolver = (options && options.defaultResolver) ? options.defaultResolver : null;
  try {
    // Only handle relative requests that end with .js (our source rewrite)
    if ((request.startsWith('./') || request.startsWith('../')) && request.endsWith('.js')) {
      const basedir = options.basedir || process.cwd();
      const candidateTs = path.resolve(basedir, request.replace(/\.js$/, '.ts'));
      const candidateIndexTs = path.resolve(basedir, request.replace(/\.js$/, ''), 'index.ts');
      if (fs.existsSync(candidateTs) || fs.existsSync(candidateIndexTs)) {
        const newRequest = request.replace(/\.js$/, '.ts');
        if (dResolver) return dResolver(newRequest, options);
      }
    }
  } catch (e) {
    // fallback to default resolver
  }
  if (dResolver) return dResolver(request, options);
  // As a final fallback, try Node resolution
  return require('module')._resolveFilename(request, { id: options.basedir || process.cwd() });
};
