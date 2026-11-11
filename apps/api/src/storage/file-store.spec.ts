import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
import { LocalFileStore } from './file-store.js';

describe('LocalFileStore', () => {
  let root: string;
  let store: LocalFileStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'farmos-files-'));
    store = new LocalFileStore(root);
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  it('writes, reads and deletes a file', async () => {
    const key = '0b6c1a52-3f1e-4a55-9a51-6a4f6f2c1d10/reports/job.csv';
    expect(await store.write(key, 'a,b\n1,2\n')).toEqual({ bytes: 8 });
    const stream = await store.open(key);
    expect(await text(stream!)).toBe('a,b\n1,2\n');
    await store.delete(key);
    expect(await store.open(key)).toBeNull();
  });

  it('leaves no temporary file behind', async () => {
    await store.write('org/reports/one.csv', 'x');
    expect(await readdir(join(root, 'org', 'reports'))).toEqual(['one.csv']);
  });

  it('returns null for a missing file and ignores deleting one', async () => {
    expect(await store.open('org/reports/missing.csv')).toBeNull();
    await expect(store.delete('org/reports/missing.csv')).resolves.toBeUndefined();
  });

  it.each(['../etc/passwd', 'org/../../x.csv', '/abs/path.csv', 'org', 'Org/x.csv', 'org//x.csv'])(
    'rejects the key %s',
    async (key) => {
      await expect(store.write(key, 'x')).rejects.toThrow(/Invalid file key/);
    },
  );
});
