import { XMLBuilder, XMLParser } from 'fast-xml-parser';

export const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  // Decodes numeric references (&#8217;) too; otherwise the builder writes them back as &amp;#8217;.
  htmlEntities: true,
});

export const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true,
  format: false,
  suppressEmptyNode: false,
});

/** A preserveOrder node: `{ [tag]: children, ':@'?: attributes }` or `{ '#text': string }`. */
export type Node = Record<string, unknown> & { ':@'?: Record<string, string> };

/** The element name of a node, or undefined for text nodes. */
export function tagOf(node: Node): string | undefined {
  return Object.keys(node).find((k) => k !== ':@' && k !== '#text');
}

export function childrenOf(node: Node): Node[] {
  const tag = tagOf(node);
  const children = tag ? node[tag] : undefined;
  return Array.isArray(children) ? (children as Node[]) : [];
}
