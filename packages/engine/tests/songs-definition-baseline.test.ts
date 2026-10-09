/**
 * Spec 092 (SC-002, SC-003): bundled songs keep the same definition maps and ISM
 * across the redefinition-warning change and the SMS song cleanup.
 *
 * Regenerate the fixture only for an intentional change to song meaning:
 *   BEATBAX_UPDATE_SONG_BASELINE=1 npx jest songs-definition-baseline
 */
import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { parse } from '../src/parser';
import { resolveSong } from '../src/song/resolver';
import { isRemoteImport } from '../src/import/urlUtils';

const repoRoot = join(__dirname, '../../..');
const songsRoot = join(repoRoot, 'songs');
const fixturePath = join(__dirname, 'fixtures/songs-definition-baseline.json');
const updating = process.env.BEATBAX_UPDATE_SONG_BASELINE === '1';

type SongBaseline = { defs: string; ism: string };

function listSongs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    // `songs/covers` is operator-local content and is not part of the bundled set.
    if (dir === songsRoot && entry === 'covers') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listSongs(full));
    else if (entry.endsWith('.bax')) out.push(full);
  }
  return out;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (key, v) => {
    if (key === 'loc') return undefined;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v).sort().reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = (v as Record<string, unknown>)[k];
        return acc;
      }, {});
    }
    return v;
  });
}

function hash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, 16);
}

function snapshotSong(file: string): SongBaseline {
  const src = readFileSync(file, 'utf8');
  const ast = parse(src);
  const defs = hash({ pats: ast.pats, seqs: ast.seqs, insts: ast.insts, effects: ast.effects });
  if (ast.imports?.some((imp) => isRemoteImport(imp.source))) {
    return { defs, ism: 'remote-imports' };
  }
  try {
    return { defs, ism: hash(resolveSong(ast, { filename: file, searchPaths: [repoRoot] })) };
  } catch (err) {
    const message = (err as Error).message.split(repoRoot).join('<repo>').split('\\').join('/');
    return { defs, ism: `error: ${message}` };
  }
}

const songs = listSongs(songsRoot);
const keyOf = (file: string) => relative(repoRoot, file).split('\\').join('/');

describe('bundled songs definition baseline (spec 092)', () => {
  if (updating) {
    test('writes the baseline fixture', () => {
      const baseline: Record<string, SongBaseline> = {};
      for (const file of songs) baseline[keyOf(file)] = snapshotSong(file);
      writeFileSync(fixturePath, `${JSON.stringify(baseline, null, 2)}\n`);
    });
    return;
  }

  const baseline: Record<string, SongBaseline> = existsSync(fixturePath)
    ? JSON.parse(readFileSync(fixturePath, 'utf8'))
    : {};

  test('fixture covers every bundled song', () => {
    expect(Object.keys(baseline).sort()).toEqual(songs.map(keyOf).sort());
  });

  test.each(songs.map((file) => [keyOf(file), file]))('%s matches the baseline', (key, file) => {
    expect(snapshotSong(file)).toEqual(baseline[key]);
  });

  test('no bundled song redefines a pat, seq, inst or effect', () => {
    const offenders = songs.flatMap((file) =>
      (parse(readFileSync(file, 'utf8')).diagnostics ?? [])
        .filter((d) => /redefined; using the later definition\.$/.test(d.message))
        .map((d) => `${keyOf(file)}:${d.loc?.start.line}: ${d.message}`),
    );
    expect(offenders).toEqual([]);
  });
});
