import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';

/**
 * Where generated files (reports, exports) live. Keys are chosen by the
 * server, never by users, and always start with the organization id.
 */
export interface FileStore {
  write(key: string, content: string | Buffer): Promise<{ bytes: number }>;
  /** Null when the file doesn't exist (deleted after its retention period). */
  open(key: string): Promise<Readable | null>;
  delete(key: string): Promise<void>;
}

export const FILE_STORE = Symbol('FILE_STORE');

const KEY = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9._-]*)+$/;

/** Local disk, for development and a single-host deployment. */
export class LocalFileStore implements FileStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async write(key: string, content: string | Buffer) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    // Write then rename, so a reader never sees half a file.
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, content, { mode: 0o600 });
    await rename(temporary, path);
    return { bytes: Buffer.byteLength(content) };
  }

  async open(key: string) {
    const path = this.path(key);
    try {
      await stat(path);
    } catch {
      return null;
    }
    return createReadStream(path);
  }

  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }

  private path(key: string) {
    if (!KEY.test(key) || key.includes('..')) throw new Error(`Invalid file key: ${key}`);
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new Error(`Invalid file key: ${key}`);
    return path;
  }
}
