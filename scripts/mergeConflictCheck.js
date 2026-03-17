#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const MARKERS = ['<<<<<<<', '=======', '>>>>>>>'];

function findConflictLines(content) {
  const lines = content.split(/\r?\n/);
  const matches = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trimStart();
    if (MARKERS.some((marker) => line.startsWith(marker))) {
      matches.push(index + 1);
    }
  }

  return matches;
}

function getTrackedFiles(cwd = process.cwd()) {
  const raw = execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8' });
  return raw
    .split('\0')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function scanFilesForConflictMarkers(filePaths, cwd = process.cwd()) {
  const conflicts = [];

  for (const relativePath of filePaths) {
    const fullPath = path.join(cwd, relativePath);

    let content;
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch (error) {
      continue;
    }

    const lines = findConflictLines(content);
    if (lines.length > 0) {
      conflicts.push({ path: relativePath, lines });
    }
  }

  return conflicts;
}

function formatConflictOutput(conflicts) {
  return conflicts
    .map((entry) => `${entry.path}:${entry.lines.join(',')}`)
    .join('\n');
}

function main() {
  const trackedFiles = getTrackedFiles();
  const conflicts = scanFilesForConflictMarkers(trackedFiles);

  if (conflicts.length > 0) {
    console.error('Merge conflict markers detected in tracked files:');
    console.error(formatConflictOutput(conflicts));
    process.exit(1);
  }

  console.log('No merge conflict markers found in tracked files.');
}

if (require.main === module) {
  main();
}

module.exports = {
  findConflictLines,
  scanFilesForConflictMarkers,
  formatConflictOutput,
};
