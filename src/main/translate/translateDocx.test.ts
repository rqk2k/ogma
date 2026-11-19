import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { translateDocx } from './index';

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:t>Hello world</w:t></w:r></w:p>
<w:p><w:r><w:t>Goodbye world</w:t></w:r></w:p>
</w:body>
</w:document>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults>
</w:styles>`;

async function makeFixtureDocx(filePath: string): Promise<void> {
  const zip = new JSZip();
  zip.file('word/document.xml', DOCUMENT_XML);
  zip.file('word/styles.xml', STYLES_XML);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  await writeFile(filePath, buf);
}

async function readPart(filePath: string, part = 'word/document.xml'): Promise<string> {
  const buf = await readFile(filePath);
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file(part);
  if (!file) throw new Error(`${part} missing`);
  return await file.async('string');
}

describe('translateDocx end-to-end', () => {
  let tmpDir: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'ogma-test-'));
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('translates a synthetic 2-paragraph docx and produces an output file with translated text', async () => {
    const input = path.join(tmpDir, 'sample.docx');
    await makeFixtureDocx(input);

    fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body) as { text: string[] };
      const translations = body.text.map((s) => ({
        text: s.replace('Hello world', 'Bonjour le monde').replace('Goodbye world', 'Au revoir le monde'),
      }));
      return new Response(JSON.stringify({ translations }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await translateDocx({
      inputPath: input,
      targetLang: 'FR',
      formality: 'prefer_more',
      apiKey: 'fake-key:fx',
    });

    expect(result.outputPath).toBe(path.join(tmpDir, 'sample.FR.docx'));
    const outXml = await readPart(result.outputPath);
    expect(outXml).toContain('Bonjour le monde');
    expect(outXml).toContain('Au revoir le monde');
    expect(outXml).not.toContain('Hello world');
    expect(outXml).not.toContain('Goodbye world');
  });

  it('lays out Arabic translations right to left, including default text size', async () => {
    const input = path.join(tmpDir, 'sample.docx');
    await makeFixtureDocx(input);
    fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body) as { text: string[]; target_lang: string };
      expect(body.target_lang).toBe('AR');
      return new Response(
        JSON.stringify({ translations: body.text.map(() => ({ text: '<x>مرحبا بالعالم</x>' })) }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const result = await translateDocx({
      inputPath: input,
      targetLang: 'AR',
      formality: 'prefer_more',
      apiKey: 'fake-key:fx',
    });

    expect(result.outputPath).toBe(path.join(tmpDir, 'sample.AR.docx'));
    const outXml = await readPart(result.outputPath);
    expect(outXml).toContain('مرحبا بالعالم');
    expect(outXml.match(/<w:pPr><w:bidi>/g)).toHaveLength(2);
    expect(await readPart(result.outputPath, 'word/styles.xml')).toContain(
      '<w:sz w:val="24"></w:sz><w:szCs w:val="24"></w:szCs>',
    );
  });

  it('leaves layout alone for left-to-right targets', async () => {
    const input = path.join(tmpDir, 'sample.docx');
    await makeFixtureDocx(input);
    fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body) as { text: string[] };
      return new Response(
        JSON.stringify({ translations: body.text.map((t) => ({ text: t })) }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const result = await translateDocx({
      inputPath: input,
      targetLang: 'FR',
      formality: 'prefer_more',
      apiKey: 'fake-key:fx',
    });

    expect(await readPart(result.outputPath)).not.toContain('w:bidi');
    expect(await readPart(result.outputPath, 'word/styles.xml')).toBe(STYLES_XML);
  });

  it('emits phase progress events', async () => {
    const input = path.join(tmpDir, 'sample.docx');
    await makeFixtureDocx(input);
    fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body) as { text: string[] };
      return new Response(
        JSON.stringify({ translations: body.text.map((t) => ({ text: t })) }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const phases: string[] = [];
    await translateDocx({
      inputPath: input,
      targetLang: 'FR',
      formality: 'prefer_more',
      apiKey: 'fake-key:fx',
      onProgress: (e) => phases.push(e.phase),
    });

    expect(phases[0]).toBe('extracting');
    expect(phases).toContain('translating');
    expect(phases[phases.length - 1]).toBe('rebuilding');
  });
});
