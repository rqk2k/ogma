import type { TargetLang } from '../../shared/types';
import { childrenOf, tagOf, type Node } from './xml';

/*
 * DeepL only translates the text, so an Arabic translation would still be laid out left to
 * right. This flips paragraphs, tables and sections to right-to-left (w:bidi mirrors jc, ind
 * and tabs, so alignment and indents follow), and copies formatting onto the complex-script
 * properties Word uses for Arabic characters: <w:b/> alone does not make Arabic bold.
 */
const RTL_TARGETS: ReadonlySet<TargetLang> = new Set(['AR']);

export function isRtl(lang: TargetLang): boolean {
  return RTL_TARGETS.has(lang);
}

// Siblings that must follow the inserted flag: Word rejects properties out of schema order.
const PPR_AFTER_BIDI = new Set([
  'w:adjustRightInd',
  'w:snapToGrid',
  'w:spacing',
  'w:ind',
  'w:contextualSpacing',
  'w:mirrorIndents',
  'w:suppressOverlap',
  'w:jc',
  'w:textDirection',
  'w:textAlignment',
  'w:textboxTightWrap',
  'w:outlineLvl',
  'w:divId',
  'w:cnfStyle',
  'w:rPr',
  'w:sectPr',
  'w:pPrChange',
]);
const TBLPR_AFTER_BIDIVISUAL = new Set([
  'w:tblStyleRowBandSize',
  'w:tblStyleColBandSize',
  'w:tblW',
  'w:jc',
  'w:tblCellSpacing',
  'w:tblInd',
  'w:tblBorders',
  'w:shd',
  'w:tblLayout',
  'w:tblCellMar',
  'w:tblLook',
  'w:tblCaption',
  'w:tblDescription',
  'w:tblPrChange',
]);
const SECTPR_AFTER_BIDI = new Set(['w:rtlGutter', 'w:docGrid', 'w:printerSettings', 'w:sectPrChange']);

const COMPLEX_SCRIPT_TWINS = new Map([
  ['w:b', 'w:bCs'],
  ['w:i', 'w:iCs'],
  ['w:sz', 'w:szCs'],
]);

const FIXES = new Map<string, (children: Node[]) => Node[]>([
  ['w:p', paragraphRtl],
  ['w:tblPr', (children) => withFlag(children, 'w:bidiVisual', TBLPR_AFTER_BIDIVISUAL)],
  ['w:sectPr', (children) => withFlag(children, 'w:bidi', SECTPR_AFTER_BIDI)],
  ['w:rPr', withComplexScriptTwins],
]);

/** Lays a parsed part (document, header, styles…) out right to left, in place. */
export function applyRtl(ast: unknown): void {
  visit(ast as Node[]);
}

function visit(nodes: Node[]): void {
  for (const node of nodes) {
    const tag = tagOf(node);
    if (!tag) continue;
    visit(childrenOf(node));
    const fix = FIXES.get(tag);
    if (fix) node[tag] = fix(childrenOf(node));
  }
}

// Only a paragraph's own w:pPr: pPr in styles or pPrChange history is left alone.
function paragraphRtl(children: Node[]): Node[] {
  const i = children.findIndex((c) => tagOf(c) === 'w:pPr');
  if (i < 0) return [{ 'w:pPr': [{ 'w:bidi': [] }] }, ...children];
  const pPr = children[i];
  const fixed = { ...pPr, 'w:pPr': withFlag(childrenOf(pPr), 'w:bidi', PPR_AFTER_BIDI) };
  return children.map((c, j) => (j === i ? fixed : c));
}

/** Sets an on/off property like <w:bidi/>, replacing any existing copy (e.g. w:val="0"). */
function withFlag(children: Node[], flag: string, after: ReadonlySet<string>): Node[] {
  const rest = children.filter((c) => tagOf(c) !== flag);
  const i = rest.findIndex((c) => after.has(tagOf(c) ?? ''));
  const at = i < 0 ? rest.length : i;
  return [...rest.slice(0, at), { [flag]: [] }, ...rest.slice(at)];
}

/** Copies b/i/sz onto bCs/iCs/szCs when those are missing; explicit twins are kept. */
function withComplexScriptTwins(children: Node[]): Node[] {
  const present = new Set(children.map(tagOf));
  return children.flatMap((c): Node[] => {
    const twin = COMPLEX_SCRIPT_TWINS.get(tagOf(c) ?? '');
    if (!twin || present.has(twin)) return [c];
    // Each twin sits right after its original in the schema, so inserting there keeps order.
    return [c, c[':@'] ? { [twin]: [], ':@': { ...c[':@'] } } : { [twin]: [] }];
  });
}
