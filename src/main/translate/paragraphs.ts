import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';

const PARSER_OPTS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true as const,
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
};

const BUILDER_OPTS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true as const,
  format: false,
  suppressEmptyNode: false,
};

const parser = new XMLParser(PARSER_OPTS);
const builder = new XMLBuilder(BUILDER_OPTS);

type Node = Record<string, unknown> & { ':@'?: Record<string, string> };
type ParagraphChildren = Node[];

export interface ExtractedParagraph {
  /** The serialized inner XML of the paragraph, wrapped in <x>…</x>, ready for DeepL. */
  payload: string;
  /** Reference to the parent node holding the `w:p` children array. */
  pContainer: { 'w:p': ParagraphChildren };
  /** Index in `pContainer['w:p']` AFTER which the translatable children begin (i.e. position of w:pPr, or -1 if none). */
  pPrIndex: number;
}

export interface ExtractResult {
  ast: unknown;
  paragraphs: ExtractedParagraph[];
}

export function parseXml(xml: string): unknown {
  return parser.parse(xml);
}

export function buildXml(ast: unknown): string {
  return builder.build(ast);
}

export function extractParagraphs(xml: string): ExtractResult {
  const ast = parser.parse(xml);
  const paragraphs: ExtractedParagraph[] = [];
  walk(ast, paragraphs);
  return { ast, paragraphs };
}

function walk(node: unknown, out: ExtractedParagraph[]): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, out);
    return;
  }
  if (typeof node !== 'object' || node === null) return;

  const obj = node as Node;
  for (const tag of Object.keys(obj)) {
    if (tag === ':@' || tag === '#text') continue;
    const children = obj[tag];
    if (tag === 'w:p' && Array.isArray(children)) {
      maybePushParagraph(obj as { 'w:p': ParagraphChildren }, out);
    }
    walk(children, out);
  }
}

function maybePushParagraph(
  pContainer: { 'w:p': ParagraphChildren },
  out: ExtractedParagraph[],
): void {
  const children = pContainer['w:p'];
  let pPrIndex = -1;
  for (let i = 0; i < children.length; i++) {
    if (hasKey(children[i], 'w:pPr')) {
      pPrIndex = i;
      break;
    }
  }

  const translatable = pPrIndex >= 0 ? children.slice(pPrIndex + 1) : children.slice();
  if (translatable.length === 0) return;
  if (!hasAnyText(translatable)) return;

  const innerXml = builder.build(translatable);
  out.push({
    payload: `<x>${innerXml}</x>`,
    pContainer,
    pPrIndex,
  });
}

function hasKey(node: unknown, key: string): boolean {
  return typeof node === 'object' && node !== null && key in (node as Node);
}

function hasAnyText(nodes: ParagraphChildren): boolean {
  for (const node of nodes) {
    if (typeof node !== 'object' || node === null) continue;
    for (const key of Object.keys(node)) {
      if (key === ':@') continue;
      if (key === '#text') {
        if (typeof (node as Record<string, unknown>)[key] === 'string') {
          if (((node as Record<string, string>)[key] ?? '').trim() !== '') return true;
        }
        continue;
      }
      const value = (node as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        if (key === 'w:t' && hasInlineText(value as Node[])) return true;
        if (hasAnyText(value as ParagraphChildren)) return true;
      }
    }
  }
  return false;
}

function hasInlineText(nodes: Node[]): boolean {
  for (const n of nodes) {
    if (typeof n !== 'object' || n === null) continue;
    const text = (n as Record<string, unknown>)['#text'];
    if (typeof text === 'string' && text !== '') return true;
  }
  return false;
}

export function injectTranslations(
  paragraphs: ExtractedParagraph[],
  translations: string[],
): void {
  if (paragraphs.length !== translations.length) {
    throw new Error(
      `injectTranslations: ${paragraphs.length} paragraphs but ${translations.length} translations`,
    );
  }
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const stripped = stripXWrapper(translations[i]);
    // DeepL sometimes returns unbalanced tags; fast-xml-parser doesn't validate and crashes
    // on them ("reading 'addChild'"), so keep the original runs and inject plain text instead.
    if (XMLValidator.validate(`<x>${stripped}</x>`) !== true) {
      console.warn(`injectTranslations: malformed XML from DeepL for paragraph ${i}:`, stripped);
      injectPlainText(p, stripped);
      continue;
    }
    const parsed = parser.parse(stripped) as Node[];
    const keep = p.pPrIndex >= 0 ? p.pContainer['w:p'].slice(0, p.pPrIndex + 1) : [];
    p.pContainer['w:p'] = [...keep, ...parsed];
  }
}

const XML_ENTITIES: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };

// ponytail: formatting inside the paragraph collapses onto the first run; only used for bad DeepL output.
function injectPlainText(p: ExtractedParagraph, translatedXml: string): void {
  const text = [...translatedXml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
    .map((m) => m[1])
    .join('')
    .replace(/&(lt|gt|quot|apos|amp);/g, (_, e: string) => XML_ENTITIES[e]);
  const textNodes: Node[] = [];
  collectTextNodes(p.pContainer['w:p'].slice(p.pPrIndex + 1), textNodes);
  if (textNodes.length === 0) return;
  const [first, ...rest] = textNodes;
  first['w:t'] = [{ '#text': text }];
  first[':@'] = { ...first[':@'], '@_xml:space': 'preserve' };
  for (const n of rest) n['w:t'] = [];
}

function collectTextNodes(nodes: Node[], out: Node[]): void {
  for (const n of nodes) {
    if (typeof n !== 'object' || n === null) continue;
    for (const key of Object.keys(n)) {
      if (key === 'w:t') out.push(n);
      else if (key !== ':@' && Array.isArray(n[key])) collectTextNodes(n[key] as Node[], out);
    }
  }
}

function stripXWrapper(s: string): string {
  const trimmed = s.trim();
  const open = trimmed.match(/^<x\s*>/);
  const close = trimmed.match(/<\/x\s*>$/);
  if (open && close) {
    return trimmed.slice(open[0].length, trimmed.length - close[0].length);
  }
  return trimmed;
}
