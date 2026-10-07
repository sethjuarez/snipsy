import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

const pluginDir = resolve("streamdeck-plugin", "com.snipsy.streamdeck.sdPlugin");
const packageDir = resolve("dist", "streamdeck");
const packagePath = join(packageDir, "Snipsy.streamDeckPlugin");
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

await mkdir(packageDir, { recursive: true });

const files = await collectFiles(pluginDir);
const archiveEntries = [];
let offset = 0;
const chunks = [];

for (const file of files) {
  const data = await readFile(file);
  const archivePath = toArchivePath(join(basename(pluginDir), relative(pluginDir, file)));
  const name = Buffer.from(archivePath, "utf8");
  const crc = crc32(data);
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0x0800, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt16LE(0, 10);
  localHeader.writeUInt16LE(0, 12);
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(data.length, 18);
  localHeader.writeUInt32LE(data.length, 22);
  localHeader.writeUInt16LE(name.length, 26);
  localHeader.writeUInt16LE(0, 28);

  chunks.push(localHeader, name, data);
  archiveEntries.push({ name, crc, size: data.length, offset });
  offset += localHeader.length + name.length + data.length;
}

const centralDirectoryOffset = offset;
for (const entry of archiveEntries) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(0, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.size, 20);
  header.writeUInt32LE(entry.size, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.offset, 42);
  chunks.push(header, entry.name);
  offset += header.length + entry.name.length;
}

const centralDirectorySize = offset - centralDirectoryOffset;
const endOfCentralDirectory = Buffer.alloc(22);
endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
endOfCentralDirectory.writeUInt16LE(0, 4);
endOfCentralDirectory.writeUInt16LE(0, 6);
endOfCentralDirectory.writeUInt16LE(archiveEntries.length, 8);
endOfCentralDirectory.writeUInt16LE(archiveEntries.length, 10);
endOfCentralDirectory.writeUInt32LE(centralDirectorySize, 12);
endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);
endOfCentralDirectory.writeUInt16LE(0, 20);
chunks.push(endOfCentralDirectory);

await writeFile(packagePath, Buffer.concat(chunks));
console.log(`Packaged ${archiveEntries.length} files to ${packagePath}`);

async function collectFiles(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries.sort((left, right) => left.localeCompare(right))) {
    const path = join(directory, entry);
    const metadata = await stat(path);
    if (metadata.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else if (metadata.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function toArchivePath(path) {
  return path.split(sep).join("/");
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}
