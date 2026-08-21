import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { ArchifyCliAdapter } from '../../src/integrations/archify/archify-cli-adapter.js';
import { managedToolHome } from '../../src/integrations/external-tools/managed-tool.js';
import { OpenSpecCliAdapter } from '../../src/integrations/openspec/openspec-cli-adapter.js';
import { createTempDir } from '../fixtures/helpers.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');

function crc32Of(value: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function requiredHome(): string {
  const value = process.env['FLOWKIT_HOME'];
  assert.ok(value && isAbsolute(value), 'FLOWKIT_HOME exact managed fixture must be an absolute path');
  return value;
}

async function createStoredZip(sourceDir: string, zipPath: string): Promise<readonly string[]> {
  const names = (await readdir(sourceDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  assert.ok(names.length > 0, 'synthetic review ZIP requires at least one file');

  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  for (const name of names) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = await readFile(join(sourceDir, name));
    const checksum = crc32Of(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12); // 1980-01-01, deterministic DOS date
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, nameBytes);

    localOffset += local.length + nameBytes.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);
  await writeFile(zipPath, Buffer.concat([...localParts, centralDirectory, end]));
  return names;
}

async function assertStoredZipIntegrity(zipPath: string, expectedNames: readonly string[]): Promise<void> {
  const bytes = await readFile(zipPath);
  assert.ok(bytes.length >= 22, 'ZIP must contain an end-of-central-directory record');
  const endOffset = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(endOffset), 0x06054b50);
  const entryCount = bytes.readUInt16LE(endOffset + 10);
  const centralSize = bytes.readUInt32LE(endOffset + 12);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  assert.equal(entryCount, expectedNames.length);
  assert.equal(centralOffset + centralSize, endOffset);

  const actualNames: string[] = [];
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50);
    const expectedCrc = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localHeaderOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    actualNames.push(name);
    assert.equal(compressedSize, uncompressedSize);

    assert.equal(bytes.readUInt32LE(localHeaderOffset), 0x04034b50);
    assert.equal(bytes.readUInt16LE(localHeaderOffset + 8), 0, 'synthetic ZIP uses STORE method');
    const localNameLength = bytes.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localHeaderOffset + 28);
    const localName = bytes
      .subarray(localHeaderOffset + 30, localHeaderOffset + 30 + localNameLength)
      .toString('utf8');
    assert.equal(localName, name);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.subarray(dataOffset, dataOffset + uncompressedSize);
    assert.equal(crc32Of(data), expectedCrc, `CRC mismatch for ${name}`);

    cursor += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(cursor, centralOffset + centralSize);
  assert.deepEqual(actualNames, [...expectedNames]);
}

async function fixture() {
  const root = await createTempDir();
  roots.push(root);
  const archifyRoot = join(managedToolHome('archify', { FLOWKIT_HOME: requiredHome() }), 'runtime', 'archify');
  const inputs = join(root, 'inputs');
  const outputs = join(root, 'outputs');
  await mkdir(inputs, { recursive: true });
  await mkdir(outputs, { recursive: true });
  for (const [from, to] of [
    ['web-app.architecture.json', 'architecture.json'],
    ['agent-tool-call.workflow.json', 'workflow.json'],
    ['agent-run.lifecycle.json', 'lifecycle.json'],
    ['checkout-platform.base.architecture.json', 'base.json'],
    ['checkout-platform.head.architecture.json', 'head.json'],
  ] as const) await cp(join(archifyRoot, 'examples', from), join(inputs, to));
  return { root, inputs, outputs };
}

describe('C1 exact managed external tools', () => {
  it('executes managed OpenSpec and Archify doctor/validate/deliver/compare with reproducible generated artifacts', async () => {
    const f = await fixture();
    const env = { FLOWKIT_HOME: requiredHome(), PATH: '/poisoned' };
    const openspec = new OpenSpecCliAdapter({ repoRoot: process.cwd(), env });
    assert.equal(await openspec.getVersion(), '1.7.0');

    const archify = new ArchifyCliAdapter({ repoRoot: f.root, env });
    assert.equal((await archify.doctor()).ready, true);
    for (const type of ['architecture', 'workflow', 'lifecycle'] as const) {
      const input = join(f.inputs, `${type}.json`);
      assert.equal((await archify.validate(type, input))['ok'], true);
      const output = join(f.outputs, `${type}.html`);
      assert.equal((await archify.deliver(type, input, output))['ok'], true);
      const first = sha(await readFile(output));
      await rm(output);
      await archify.deliver(type, input, output);
      assert.equal(sha(await readFile(output)), first);
    }
    const delta = join(f.outputs, 'delta.html');
    const receipt = join(f.outputs, 'delta.receipt.json');
    const compare = await archify.compareArchitecture(join(f.inputs, 'base.json'), join(f.inputs, 'head.json'), delta, receipt);
    assert.equal(compare['ok'], true);
    assert.deepEqual(JSON.parse(await readFile(receipt, 'utf8')), compare);
    assert.ok((await stat(delta)).size > 0);
  });

  it('fails closed on invalid generation and preserves the last-good HTML bytes', async () => {
    const f = await fixture();
    const env = { FLOWKIT_HOME: requiredHome(), PATH: '/poisoned' };
    const archify = new ArchifyCliAdapter({ repoRoot: f.root, env });
    const output = join(f.outputs, 'architecture.html');
    await archify.deliver('architecture', join(f.inputs, 'architecture.json'), output);
    const before = await readFile(output);
    const invalid = join(f.inputs, 'invalid.json');
    await writeFile(invalid, '{"schemaVersion":1,"bad":true}\n');
    await assert.rejects(archify.deliver('architecture', invalid, output), /Archify deliver architecture exited|operation/i);
    assert.equal(Buffer.compare(await readFile(output), before), 0);
  });

  it('physically assembles an ordinary synthetic review ZIP without creating repository architecture authority', async () => {
    const f = await fixture();
    const env = { FLOWKIT_HOME: requiredHome(), PATH: '/poisoned' };
    const archify = new ArchifyCliAdapter({ repoRoot: f.root, env });
    const review = join(f.root, 'review');
    await mkdir(review);
    await writeFile(join(review, 'README.txt'), 'C1 disposable review-transport proof only. Not Current/Planned/Actual Architecture authority.\n');
    for (const type of ['architecture', 'workflow', 'lifecycle'] as const) {
      const input = join(f.inputs, `${type}.json`);
      await cp(input, join(review, `synthetic.${type}.json`));
      await archify.deliver(type, input, join(review, `synthetic.${type}.html`));
      await writeFile(join(review, `synthetic.${type}.receipt.json`), `${JSON.stringify(await archify.validate(type, input))}\n`);
    }
    await archify.compareArchitecture(join(f.inputs, 'base.json'), join(f.inputs, 'head.json'), join(review, 'synthetic.delta.html'), join(review, 'synthetic.delta.receipt.json'));
    const zipPath = join(f.root, 'c1-synthetic-review.zip');
    assert.equal(crc32Of(Buffer.from('123456789')), 0xcbf43926);
    const entries = await createStoredZip(review, zipPath);
    await assertStoredZipIntegrity(zipPath, entries);
    assert.ok((await stat(zipPath)).size > 0);
    await assert.rejects(stat(join(f.root, 'architecture')));
  });
});
