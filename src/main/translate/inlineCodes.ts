import { XMLValidator } from 'fast-xml-parser';
import { builder, childrenOf, parser, tagOf, type Node } from './xml';

/*
 * Paragraph content goes to DeepL as text plus a few inline codes instead of raw
 * WordprocessingML (the same idea as XLIFF's <g>/<x/>):
 *   <g id="n">…</g>  text whose formatting differs from the paragraph's base formatting,
 *                    or an inline container such as a hyperlink
 *   <ph id="n"/>     anything that isn't text: tabs, footnote refs, fields, drawings…
 * Each id maps back to the original WordprocessingML, so DeepL never sees w:rPr noise.
 */
export type InlineCode =
  | { kind: 'format'; rPr?: Node }
  | { kind: 'container'; tag: string; attrs?: Record<string, string>; head: Node[] }
  | { kind: 'opaque'; nodes: Node[] };

export interface EncodedParagraph {
  /** `<x>…</x>`, ready for DeepL. */
  payload: string;
  codes: Map<string, InlineCode>;
  /** Formatting of most of the paragraph's text; bare text in the translation gets this. */
  baseRPr?: Node;
}

// Inline elements whose runs are translated in place.
const CONTAINERS = new Set([
  'w:hyperlink',
  'w:smartTag',
  'w:customXml',
  'w:sdt',
  'w:sdtContent',
  'w:fldSimple',
  'w:ins',
  'w:moveTo',
  'w:dir',
  'w:bdo',
]);

// Spell-check and layout caches Word regenerates; dropping them lets fragmented runs merge.
const DROPPED = new Set(['w:proofErr', 'w:lastRenderedPageBreak']);

type Item =
  | { type: 'text'; text: string; rPr?: Node; key: string }
  | { type: 'opaque'; nodes: Node[] }
  | { type: 'container'; tag: string; attrs?: Record<string, string>; head: Node[]; items: Item[] };

/** Encodes a paragraph's content (the children after w:pPr). Undefined when there is no text. */
export function encodeParagraph(children: Node[]): EncodedParagraph | undefined {
  const items = toItems(children);
  if (!hasText(items)) return undefined;
  const base = baseFormat(items);
  const codes = new Map<string, InlineCode>();
  return { payload: `<x>${emit(items, base.key, codes)}</x>`, codes, baseRPr: base.rPr };
}

function toItems(nodes: Node[]): Item[] {
  const items: Item[] = [];
  for (const node of nodes) {
    const tag = tagOf(node);
    if (!tag || DROPPED.has(tag)) continue;
    if (tag === 'w:r') items.push(...runItems(node));
    else if (CONTAINERS.has(tag)) items.push(containerItem(node, tag));
    else items.push({ type: 'opaque', nodes: [node] });
  }
  return merge(items);
}

function runItems(run: Node): Item[] {
  const children = childrenOf(run);
  const rPr = children.find((c) => tagOf(c) === 'w:rPr');
  const key = rPr ? builder.build([rPr]) : '';
  const items: Item[] = [];
  for (const child of children) {
    const tag = tagOf(child);
    if (!tag || tag === 'w:rPr' || DROPPED.has(tag)) continue;
    if (tag !== 'w:t') {
      items.push({ type: 'opaque', nodes: [{ 'w:r': rPr ? [rPr, child] : [child] }] });
      continue;
    }
    const text = childrenOf(child)
      .map((c) => String(c['#text'] ?? ''))
      .join('');
    if (text !== '') items.push({ type: 'text', text, rPr, key });
  }
  return items;
}

function containerItem(node: Node, tag: string): Item {
  const children = childrenOf(node);
  // Leading properties (e.g. w:sdtPr) stay fixed at the start of the container.
  const firstContent = children.findIndex((c) => {
    const t = tagOf(c);
    return t === 'w:r' || (t !== undefined && CONTAINERS.has(t));
  });
  if (firstContent < 0) return { type: 'opaque', nodes: [node] };
  const items = toItems(children.slice(firstContent));
  if (!hasText(items)) return { type: 'opaque', nodes: [node] };
  return { type: 'container', tag, attrs: node[':@'], head: children.slice(0, firstContent), items };
}

/** Joins neighbouring text with identical formatting, and neighbouring non-text elements. */
function merge(items: Item[]): Item[] {
  const out: Item[] = [];
  for (const item of items) {
    const prev = out[out.length - 1];
    if (prev?.type === 'text' && item.type === 'text' && prev.key === item.key) {
      out[out.length - 1] = { ...prev, text: prev.text + item.text };
    } else if (prev?.type === 'opaque' && item.type === 'opaque') {
      out[out.length - 1] = { type: 'opaque', nodes: [...prev.nodes, ...item.nodes] };
    } else {
      out.push(item);
    }
  }
  return out;
}

function hasText(items: Item[]): boolean {
  return items.some(
    (i) => (i.type === 'text' && i.text.trim() !== '') || (i.type === 'container' && hasText(i.items)),
  );
}

function textItems(items: Item[]): Array<Extract<Item, { type: 'text' }>> {
  return items.flatMap((i) =>
    i.type === 'text' ? [i] : i.type === 'container' ? textItems(i.items) : [],
  );
}

/** The formatting carrying the most characters; text with it is sent untagged. */
function baseFormat(items: Item[]): { key: string; rPr?: Node } {
  const chars = new Map<string, number>();
  for (const t of textItems(items)) chars.set(t.key, (chars.get(t.key) ?? 0) + t.text.length);
  const key = [...chars].reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];
  return { key, rPr: textItems(items).find((t) => t.key === key)?.rPr };
}

function emit(items: Item[], baseKey: string, codes: Map<string, InlineCode>): string {
  const add = (code: InlineCode): string => {
    const id = String(codes.size + 1);
    codes.set(id, code);
    return id;
  };
  return items
    .map((item) => {
      if (item.type === 'opaque') return `<ph id="${add({ kind: 'opaque', nodes: item.nodes })}"/>`;
      if (item.type === 'container') {
        const id = add({ kind: 'container', tag: item.tag, attrs: item.attrs, head: item.head });
        return `<g id="${id}">${emit(item.items, baseKey, codes)}</g>`;
      }
      const text = escapeXml(item.text);
      if (item.key === baseKey) return text;
      return `<g id="${add({ kind: 'format', rPr: item.rPr })}">${text}</g>`;
    })
    .join('');
}

/**
 * Rebuilds paragraph content from DeepL's output. If DeepL mangled the codes (bad XML,
 * unknown ids, a placeholder dropped or duplicated), the translation goes in as plain text
 * into the original runs instead, so nothing like a footnote reference is ever lost.
 */
export function decodeParagraph(
  translation: string,
  encoded: EncodedParagraph,
  original: Node[],
): Node[] {
  const inner = stripXWrapper(translation);
  const xml = `<x>${inner}</x>`;
  if (XMLValidator.validate(xml) === true) {
    const nodes = childrenOf((parser.parse(xml) as Node[])[0]);
    if (codesMatch(nodes, encoded.codes)) return decode(nodes, encoded.baseRPr, encoded.codes);
  }
  console.warn('decodeParagraph: DeepL mangled the inline codes, using plain text:', translation);
  return withPlainText(original, plainText(inner));
}

// Halves of a range; swapping them breaks fields and bookmarks.
const RANGE_MARKERS = new Set([
  'w:fldChar',
  'w:bookmarkStart',
  'w:bookmarkEnd',
  'w:commentRangeStart',
  'w:commentRangeEnd',
  'w:permStart',
  'w:permEnd',
]);

function hasRangeMarker(nodes: Node[]): boolean {
  return nodes.some((n) => {
    const tag = tagOf(n);
    return tag !== undefined && (RANGE_MARKERS.has(tag) || (tag === 'w:r' && hasRangeMarker(childrenOf(n))));
  });
}

/**
 * Placeholders and containers must each come back exactly once, and range markers in their
 * original order. Formatting <g> may be dropped or repeated: that only changes formatting.
 */
function codesMatch(nodes: Node[], codes: Map<string, InlineCode>): boolean {
  const seen: string[] = [];
  const visit = (list: Node[]): boolean =>
    list.every((node) => {
      const tag = tagOf(node);
      if (!tag) return true;
      if (tag !== 'g' && tag !== 'ph') return false;
      const id = node[':@']?.['@_id'] ?? '';
      const code = codes.get(id);
      if (!code || (tag === 'ph') !== (code.kind === 'opaque')) return false;
      seen.push(id);
      return visit(childrenOf(node));
    });
  if (!visit(nodes)) return false;
  const once = [...codes].every(
    ([id, code]) => code.kind === 'format' || seen.filter((s) => s === id).length === 1,
  );
  const ranges = seen.filter((id) => {
    const code = codes.get(id);
    return code?.kind === 'opaque' && hasRangeMarker(code.nodes);
  });
  return once && ranges.every((id, i) => i === 0 || Number(id) > Number(ranges[i - 1]));
}

function decode(nodes: Node[], rPr: Node | undefined, codes: Map<string, InlineCode>): Node[] {
  return nodes.flatMap((node): Node[] => {
    const tag = tagOf(node);
    if (!tag) {
      const text = String(node['#text'] ?? '');
      return text === '' ? [] : [textRun(text, rPr)];
    }
    const code = codes.get(node[':@']?.['@_id'] ?? '') as InlineCode;
    if (code.kind === 'opaque') return code.nodes;
    if (code.kind === 'format') return decode(childrenOf(node), code.rPr, codes);
    const children = [...code.head, ...decode(childrenOf(node), rPr, codes)];
    return [code.attrs ? { [code.tag]: children, ':@': code.attrs } : { [code.tag]: children }];
  });
}

function textRun(text: string, rPr: Node | undefined): Node {
  const t: Node = { 'w:t': [{ '#text': text }], ':@': { '@_xml:space': 'preserve' } };
  return { 'w:r': rPr ? [rPr, t] : [t] };
}

// ponytail: formatting inside the paragraph collapses onto the first run; only used for bad DeepL output.
function withPlainText(nodes: Node[], text: string): Node[] {
  let pending: string | undefined = text;
  const visit = (list: Node[]): Node[] =>
    list.map((node) => {
      const tag = tagOf(node);
      if (tag === 'w:t') {
        const t = pending ?? '';
        pending = undefined;
        return { 'w:t': t === '' ? [] : [{ '#text': t }], ':@': { ...node[':@'], '@_xml:space': 'preserve' } };
      }
      // Only the paragraph's own runs: never descend into drawings (text boxes are separate paragraphs).
      if (tag === 'w:r' || (tag !== undefined && CONTAINERS.has(tag))) {
        return { ...node, [tag]: visit(childrenOf(node)) };
      }
      return node;
    });
  return visit(nodes);
}

const XML_ENTITIES: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };

function plainText(xml: string): string {
  return xml
    .replace(/<[^>]*>/g, '')
    .replace(/&(lt|gt|quot|apos|amp);/g, (_, e: string) => XML_ENTITIES[e]);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
