import { decodeParagraph, encodeParagraph, type EncodedParagraph } from './inlineCodes';
import { builder, parser, tagOf, type Node } from './xml';

export interface ExtractedParagraph extends EncodedParagraph {
  /** Reference to the parent node holding the `w:p` children array. */
  pContainer: { 'w:p': Node[] };
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

// Finds every w:p, including ones nested in text boxes; those are encoded as their own
// paragraphs, while the outer paragraph carries the text box as an opaque placeholder.
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
      maybePushParagraph(obj as { 'w:p': Node[] }, out);
    }
    walk(children, out);
  }
}

function maybePushParagraph(pContainer: { 'w:p': Node[] }, out: ExtractedParagraph[]): void {
  const pPrIndex = pContainer['w:p'].findIndex((c) => tagOf(c) === 'w:pPr');
  const encoded = encodeParagraph(pContainer['w:p'].slice(pPrIndex + 1));
  if (encoded) out.push({ ...encoded, pContainer, pPrIndex });
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
    const children = p.pContainer['w:p'];
    const content = decodeParagraph(translations[i], p, children.slice(p.pPrIndex + 1));
    // Placeholders reuse the original nodes, so text boxes nested in this paragraph stay
    // reachable for their own injection.
    p.pContainer['w:p'] = [...children.slice(0, p.pPrIndex + 1), ...content];
  }
}
