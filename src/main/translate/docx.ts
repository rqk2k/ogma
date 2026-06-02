import JSZip from 'jszip';
import { readFile, writeFile } from 'node:fs/promises';

export interface DocxParts {
  /** Map from part name (e.g., "word/document.xml") to its XML content. */
  parts: Map<string, string>;
  /** Loaded JSZip instance; rebuild via `writeDocx`. */
  zip: JSZip;
}

const TRANSLATABLE_PATTERNS = [
  /^word\/document\.xml$/,
  /^word\/header\d*\.xml$/,
  /^word\/footer\d*\.xml$/,
  /^word\/footnotes\.xml$/,
  /^word\/endnotes\.xml$/,
];

function isTranslatable(name: string): boolean {
  return TRANSLATABLE_PATTERNS.some((pat) => pat.test(name));
}

export async function readDocx(filePath: string): Promise<DocxParts> {
  const buf = await readFile(filePath);
  return await readDocxFromBuffer(buf);
}

export async function readDocxFromBuffer(buf: Buffer | Uint8Array): Promise<DocxParts> {
  const zip = await JSZip.loadAsync(buf);
  const parts = new Map<string, string>();
  for (const name of Object.keys(zip.files)) {
    if (isTranslatable(name)) {
      const file = zip.file(name);
      if (file) {
        parts.set(name, await file.async('string'));
      }
    }
  }
  return { parts, zip };
}

export async function writeDocx(
  outPath: string,
  zip: JSZip,
  updatedParts: Map<string, string>,
): Promise<void> {
  const buf = await buildDocxBuffer(zip, updatedParts);
  await writeFile(outPath, buf);
}

export async function buildDocxBuffer(
  zip: JSZip,
  updatedParts: Map<string, string>,
): Promise<Buffer> {
  for (const [name, xml] of updatedParts) {
    zip.file(name, xml);
  }
  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
