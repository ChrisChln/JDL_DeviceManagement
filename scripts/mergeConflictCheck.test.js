const test = require('node:test');
const assert = require('node:assert/strict');

const {
  findConflictLines,
  scanFilesForConflictMarkers,
  formatConflictOutput,
} = require('./mergeConflictCheck');

test('findConflictLines returns line numbers for conflict markers', () => {
  const content = ['line 1', '<<<<<<< HEAD', 'middle', '=======', 'other', '>>>>>>> main'].join('\n');
  assert.deepEqual(findConflictLines(content), [2, 4, 6]);
});

test('findConflictLines ignores non-marker text', () => {
  const content = ['normal', '== equals', '>>>> text'].join('\n');
  assert.deepEqual(findConflictLines(content), []);
});

test('scanFilesForConflictMarkers reports only files containing conflict markers', () => {
  const fakeRead = {
    'safe.txt': 'hello world',
    'conflict.txt': 'top\n<<<<<<< branch\nbottom',
  };

  const fs = require('node:fs');
  const originalReadFileSync = fs.readFileSync;
  fs.readFileSync = (targetPath) => {
    const fileName = targetPath.split(/[/\\]/).pop();
    if (!(fileName in fakeRead)) {
      throw new Error('ENOENT');
    }
    return fakeRead[fileName];
  };

  try {
    const result = scanFilesForConflictMarkers(['safe.txt', 'conflict.txt'], '/tmp');
    assert.deepEqual(result, [{ path: 'conflict.txt', lines: [2] }]);
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
});

test('formatConflictOutput formats file and lines', () => {
  const output = formatConflictOutput([
    { path: 'a.txt', lines: [1, 3] },
    { path: 'b.txt', lines: [5] },
  ]);

  assert.equal(output, 'a.txt:1,3\nb.txt:5');
});
