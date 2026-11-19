import path from 'node:path';
import type { Formality, ProgressEvent, TargetLang } from '../../shared/types';
import { readDocx, writeDocx } from './docx';
import { translate } from './deepl';
import { buildXml, extractParagraphs, injectTranslations, parseXml } from './paragraphs';
import { applyRtl, isRtl } from './rtl';

const STYLES_PART = 'word/styles.xml';

export interface TranslateDocxOptions {
  inputPath: string;
  targetLang: TargetLang;
  formality: Formality;
  apiKey: string;
  signal?: AbortSignal;
  onProgress?: (event: ProgressEvent) => void;
}

export interface TranslateDocxResult {
  outputPath: string;
}

export async function translateDocx(opts: TranslateDocxOptions): Promise<TranslateDocxResult> {
  opts.onProgress?.({ phase: 'extracting' });

  const { parts, zip } = await readDocx(opts.inputPath);

  const extracted = new Map<string, ReturnType<typeof extractParagraphs>>();
  const allPayloads: string[] = [];

  for (const [partName, xml] of parts) {
    const result = extractParagraphs(xml);
    extracted.set(partName, result);
    for (const p of result.paragraphs) {
      allPayloads.push(p.payload);
    }
  }

  opts.onProgress?.({ phase: 'translating', current: 0, total: allPayloads.length });
  let done = 0;
  const translations =
    allPayloads.length === 0
      ? []
      : await translate(opts.apiKey, allPayloads, {
          targetLang: opts.targetLang,
          formality: opts.formality,
          signal: opts.signal,
          onBatchDone: (n) => {
            done += n;
            opts.onProgress?.({
              phase: 'translating',
              current: done,
              total: allPayloads.length,
            });
          },
        });

  opts.onProgress?.({ phase: 'rebuilding' });

  let cursor = 0;
  for (const [, result] of extracted) {
    const len = result.paragraphs.length;
    injectTranslations(result.paragraphs, translations.slice(cursor, cursor + len));
    cursor += len;
  }

  const rtl = isRtl(opts.targetLang);
  const updatedParts = new Map<string, string>();
  for (const [partName, result] of extracted) {
    if (rtl) applyRtl(result.ast);
    updatedParts.set(partName, buildXml(result.ast));
  }
  // Styles carry the formatting of headings and default text, which Arabic needs too.
  const styles = rtl ? await zip.file(STYLES_PART)?.async('string') : undefined;
  if (styles) {
    const ast = parseXml(styles);
    applyRtl(ast);
    updatedParts.set(STYLES_PART, buildXml(ast));
  }

  const outputPath = deriveOutputPath(opts.inputPath, opts.targetLang);
  await writeDocx(outputPath, zip, updatedParts);
  return { outputPath };
}

export function deriveOutputPath(inputPath: string, targetLang: TargetLang): string {
  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  return path.join(dir, `${base}.${targetLang}${ext}`);
}
