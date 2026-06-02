import { describe, expect, it } from 'vitest';
import { buildXml, extractParagraphs, injectTranslations, parseXml } from './paragraphs';

const ROOT = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">';
const END = '</w:document>';

function wrap(body: string): string {
  return `${ROOT}<w:body>${body}${END.replace('<', '</w:body><')}`;
}

describe('extractParagraphs', () => {
  it('returns no paragraphs for an empty document', () => {
    const xml = wrap('');
    const { paragraphs } = extractParagraphs(xml);
    expect(paragraphs).toEqual([]);
  });

  it('extracts a single plain paragraph', () => {
    const xml = wrap('<w:p><w:r><w:t>Hello world</w:t></w:r></w:p>');
    const { paragraphs } = extractParagraphs(xml);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].payload).toBe('<x><w:r><w:t>Hello world</w:t></w:r></x>');
  });

  it('extracts multiple paragraphs in order', () => {
    const xml = wrap(
      '<w:p><w:r><w:t>One</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>Two</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>Three</w:t></w:r></w:p>',
    );
    const { paragraphs } = extractParagraphs(xml);
    expect(paragraphs.map((p) => p.payload)).toEqual([
      '<x><w:r><w:t>One</w:t></w:r></x>',
      '<x><w:r><w:t>Two</w:t></w:r></x>',
      '<x><w:r><w:t>Three</w:t></w:r></x>',
    ]);
  });

  it('skips paragraphs with no text content', () => {
    const xml = wrap(
      '<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr></w:p>' +
        '<w:p><w:r><w:t>Real text</w:t></w:r></w:p>' +
        '<w:p/>',
    );
    const { paragraphs } = extractParagraphs(xml);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].payload).toContain('Real text');
  });

  it('preserves w:pPr (does not include it in payload)', () => {
    const xml = wrap(
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Title</w:t></w:r></w:p>',
    );
    const { paragraphs } = extractParagraphs(xml);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].payload).not.toContain('w:pPr');
    expect(paragraphs[0].payload).not.toContain('Heading1');
    expect(paragraphs[0].payload).toContain('Title');
  });

  it('extracts paragraphs with multiple runs and inline formatting', () => {
    const xml = wrap(
      '<w:p>' +
        '<w:r><w:t xml:space="preserve">Plain </w:t></w:r>' +
        '<w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r>' +
        '<w:r><w:t xml:space="preserve"> end.</w:t></w:r>' +
        '</w:p>',
    );
    const { paragraphs } = extractParagraphs(xml);
    expect(paragraphs).toHaveLength(1);
    const p = paragraphs[0].payload;
    expect(p).toContain('Plain');
    expect(p).toContain('bold');
    expect(p).toContain('end');
    expect(p).toContain('w:rPr');
    expect(p).toContain('w:b');
  });
});

describe('injectTranslations', () => {
  it('replaces translatable runs with translated content', () => {
    const xml = wrap('<w:p><w:r><w:t>Hello</w:t></w:r></w:p>');
    const { ast, paragraphs } = extractParagraphs(xml);
    injectTranslations(paragraphs, ['<x><w:r><w:t>Bonjour</w:t></w:r></x>']);
    const result = buildXml(ast);
    expect(result).toContain('Bonjour');
    expect(result).not.toContain('Hello');
  });

  it('preserves w:pPr through round-trip', () => {
    const xml = wrap(
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Title</w:t></w:r></w:p>',
    );
    const { ast, paragraphs } = extractParagraphs(xml);
    injectTranslations(paragraphs, ['<x><w:r><w:t>Titre</w:t></w:r></x>']);
    const result = buildXml(ast);
    expect(result).toContain('Heading1');
    expect(result).toContain('Titre');
  });

  it('preserves multiple paragraphs and order', () => {
    const xml = wrap(
      '<w:p><w:r><w:t>One</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>Two</w:t></w:r></w:p>',
    );
    const { ast, paragraphs } = extractParagraphs(xml);
    injectTranslations(paragraphs, [
      '<x><w:r><w:t>Un</w:t></w:r></x>',
      '<x><w:r><w:t>Deux</w:t></w:r></x>',
    ]);
    const result = buildXml(ast);
    const oneIdx = result.indexOf('Un');
    const twoIdx = result.indexOf('Deux');
    expect(oneIdx).toBeGreaterThan(-1);
    expect(twoIdx).toBeGreaterThan(oneIdx);
    expect(result).not.toContain('One');
    expect(result).not.toContain('Two');
  });

  it('throws when paragraph and translation counts mismatch', () => {
    const xml = wrap('<w:p><w:r><w:t>Hello</w:t></w:r></w:p>');
    const { paragraphs } = extractParagraphs(xml);
    expect(() => injectTranslations(paragraphs, ['a', 'b'])).toThrow();
  });

  it('parses and re-builds without losing the document structure (identity round-trip)', () => {
    const xml = wrap('<w:p><w:r><w:t>Same</w:t></w:r></w:p>');
    const { ast, paragraphs } = extractParagraphs(xml);
    injectTranslations(
      paragraphs,
      paragraphs.map((p) => p.payload),
    );
    const result = buildXml(ast);
    // Re-parse the result and re-extract — should give the same payloads
    const re = extractParagraphs(result);
    expect(re.paragraphs.map((p) => p.payload)).toEqual(paragraphs.map((p) => p.payload));
  });

  it('handles inline formatting preserved across translation', () => {
    const xml = wrap(
      '<w:p>' +
        '<w:r><w:t xml:space="preserve">Plain </w:t></w:r>' +
        '<w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r>' +
        '<w:r><w:t xml:space="preserve"> end.</w:t></w:r>' +
        '</w:p>',
    );
    const { ast, paragraphs } = extractParagraphs(xml);
    injectTranslations(paragraphs, [
      '<x>' +
        '<w:r><w:t xml:space="preserve">Simple </w:t></w:r>' +
        '<w:r><w:rPr><w:b/></w:rPr><w:t>gras</w:t></w:r>' +
        '<w:r><w:t xml:space="preserve"> fin.</w:t></w:r>' +
        '</x>',
    ]);
    const result = buildXml(ast);
    expect(result).toContain('Simple');
    expect(result).toContain('gras');
    expect(result).toContain('fin');
    expect(result).toContain('w:b');
    // Should NOT contain the original English strings
    expect(result).not.toContain('Plain');
    expect(result).not.toContain('bold');
  });
});

describe('parseXml / buildXml', () => {
  it('round-trips a minimal document', () => {
    const xml = '<a><b>hi</b></a>';
    const ast = parseXml(xml);
    const built = buildXml(ast);
    expect(built).toBe(xml);
  });
});
