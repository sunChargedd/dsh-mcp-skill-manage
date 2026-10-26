#!/usr/bin/env node
/**
 * Extract one released version's section from CHANGELOG.md.
 *
 * Used by the Release workflow, and handy locally to preview notes:
 *   node scripts/release-notes.mjs v0.2.2 release-notes.md
 *   node scripts/release-notes.mjs 0.2.2            # prints to stdout
 *
 * Exits non-zero when the tag is not a SemVer version or the section is missing.
 */
import { readFile, writeFile } from 'node:fs/promises';

const [, , rawTag, outputPath] = process.argv;
if (!rawTag) {
  console.error('usage: node scripts/release-notes.mjs <tag|version> [output-file]');
  process.exit(1);
}

const version = rawTag.replace(/^v/, '');
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`release-notes: "${rawTag}" is not a SemVer tag`);
  process.exit(1);
}

// Optional curated (e.g. bilingual) notes win over the generated CHANGELOG section.
const overrideUrl = new URL(`../docs/release-notes/${version}.md`, import.meta.url);
try {
  const curated = await readFile(overrideUrl, 'utf8');
  if (outputPath) {
    await writeFile(outputPath, curated, 'utf8');
    console.log(`release-notes: wrote curated notes to ${outputPath} for ${version}`);
  } else {
    process.stdout.write(curated);
  }
  process.exit(0);
} catch {
  /* fall back to CHANGELOG */
}

const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const lines = changelog.split(/\r?\n/);
const start = lines.findIndex((line) => line.trim() === `## [${version}]` || line.startsWith(`## [${version}] `));
if (start === -1) {
  console.error(`release-notes: CHANGELOG.md has no "## [${version}]" section`);
  process.exit(1);
}
let end = lines.findIndex((line, index) => index > start && /^## \[/.test(line));
if (end === -1) end = lines.length;

const body = `${lines
  .slice(start + 1, end)
  .join('\n')
  .replace(/^\n+/, '')
  .replace(/\s+$/, '')}\n`;

if (outputPath) {
  await writeFile(outputPath, body, 'utf8');
  console.log(`release-notes: wrote ${outputPath} for ${version}`);
} else {
  process.stdout.write(body);
}
