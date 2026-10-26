#!/usr/bin/env node
/**
 * Bump the plugin version and cut a CHANGELOG section.
 *
 * Usage:
 *   node scripts/bump-version.mjs patch|minor|major [--note "release note"]
 *   node scripts/bump-version.mjs 1.4.0 [--note "release note"]
 *
 * What it does:
 *  1. computes the next SemVer version (or accepts an explicit one);
 *  2. renames the `## [Unreleased]` heading in CHANGELOG.md to the new version with
 *     today's date, and creates a fresh empty Unreleased section above it;
 *  3. optionally appends `--note` as a bullet under `### Changed` of the cut section;
 *  4. writes the same version into package.json.
 *
 * The plugin has no build step and no lockfile, so those are the only two files.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = join(root, 'package.json');
const CHANGELOG = join(root, 'CHANGELOG.md');

/** Parse `patch|minor|major|x.y.z`. */
function nextVersion(current, input) {
  if (/^\d+\.\d+\.\d+$/.test(input)) return input;
  const [major, minor, patch] = current.split('.').map((part) => Number(part));
  if (input === 'major') return `${major + 1}.0.0`;
  if (input === 'minor') return `${major}.${minor + 1}.0`;
  if (input === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unsupported version argument: ${input}`);
}

/** Extract `--note` (inline or as the next argv entry). */
function noteOf(argv) {
  const index = argv.indexOf('--note');
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error('--note needs a value');
  return value;
}

/** Today in the machine's local date, YYYY-MM-DD. */
function today() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const argv = process.argv.slice(2);
const bump = argv[0];
if (!bump) {
  console.error('usage: node scripts/bump-version.mjs patch|minor|major|x.y.z [--note "text"]');
  process.exit(1);
}

const manifest = JSON.parse(await readFile(PACKAGE, 'utf8'));
const current = manifest.version;
const version = nextVersion(current, bump);
const note = noteOf(argv);

let changelog = await readFile(CHANGELOG, 'utf8');
const unreleasedHeading = /^## \[Unreleased\][^\n]*$/m;
const match = unreleasedHeading.exec(changelog);
if (!match) throw new Error('CHANGELOG.md has no "## [Unreleased]" heading at the start of a line');
const start = match.index;
const unreleased = match[0];

const heading = `## [${version}] - ${today()}`;
const bodyStart = start + unreleased.length;
const nextSection = changelog.indexOf('\n## [', bodyStart);
const sectionBody = changelog.slice(bodyStart, nextSection === -1 ? undefined : nextSection).replace(/^\n+/, '').trimEnd();

let releasedBody = sectionBody;
if (note) {
  const bullet = `- ${note}`;
  const changed = /### Changed\b\n([\s\S]*?)(?=\n### |$)/.exec(releasedBody);
  releasedBody = changed
    ? releasedBody.replace(changed[0], `### Changed\n${changed[1].replace(/\s+$/, '')}\n${bullet}\n`)
    : `${releasedBody.trim() ? `${releasedBody.replace(/\s+$/, '')}\n\n` : ''}### Changed\n\n${bullet}`;
}
releasedBody = releasedBody.replace(/\n{3,}/g, '\n\n').trim();

const rest = nextSection === -1 ? '' : changelog.slice(nextSection);
const rebuilt = `${unreleased}\n\n${heading}\n\n${releasedBody ? `${releasedBody.replace(/\s+$/, '')}\n\n` : ''}${rest.replace(/^\n+/, '')}`;
changelog = changelog.slice(0, start) + rebuilt;
await writeFile(CHANGELOG, changelog, 'utf8');

manifest.version = version;
await writeFile(PACKAGE, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`${current} → ${version}`);
console.log(`updated ${PACKAGE}`);
console.log(`updated ${CHANGELOG}`);
console.log('\nNext: commit the two files and tag the release:');
console.log(`  git add package.json CHANGELOG.md`);
console.log(`  git commit -m "chore(release): v${version}"`);
console.log(`  git tag v${version} && git push --follow-tags`);
