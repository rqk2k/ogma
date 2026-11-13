import { describe, expect, it } from 'vitest';
import { buildXml, extractParagraphs, injectTranslations, parseXml } from './paragraphs';

const ROOT = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">';

function wrap(body: string): string {
  return `${ROOT}<w:body>${body}</w:body></w:document>`;
}

/** Same XML as the builder would emit, so results can be compared exactly. */
function normalized(body: string): string {
  return buildXml(parseXml(wrap(body)));
}

const FONT = '<w:rPr><w:rFonts w:ascii="Times New Roman"/><w:sz w:val="22"/></w:rPr>';
const BOLD = '<w:rPr><w:rFonts w:ascii="Times New Roman"/><w:b/><w:sz w:val="22"/></w:rPr>';
const LINK = '<w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr>';
const FOOTNOTE =
  '<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="2"/></w:r>';
const BOOKMARK = '<w:bookmarkStart w:id="0" w:name="ref"/><w:bookmarkEnd w:id="0"/>';
const FIELD_START =
  '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
  '<w:r><w:instrText xml:space="preserve"> REF _Ref1 \\h </w:instrText></w:r>' +
  '<w:r><w:fldChar w:fldCharType="separate"/></w:r>';
const FIELD_END = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';

function run(text: string, rPr = ''): string {
  return `<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r>`;
}

function hyperlink(inner: string): string {
  return `<w:hyperlink r:id="rId5">${inner}</w:hyperlink>`;
}

function textBox(inner: string): string {
  return `<w:r><w:drawing><wps:txbx><w:txbxContent>${inner}</w:txbxContent></wps:txbx></w:drawing></w:r>`;
}

function payloads(xml: string): string[] {
  return extractParagraphs(xml).paragraphs.map((p) => p.payload);
}

function translate(xml: string, translations: string[]): string {
  const { ast, paragraphs } = extractParagraphs(xml);
  injectTranslations(paragraphs, translations);
  return buildXml(ast);
}

describe('extractParagraphs', () => {
  it('returns no paragraphs for an empty document', () => {
    expect(payloads(wrap(''))).toEqual([]);
  });

  it('sends a plain paragraph as bare text', () => {
    expect(payloads(wrap(`<w:p>${run('Hello world')}</w:p>`))).toEqual(['<x>Hello world</x>']);
  });

  it('extracts multiple paragraphs in order', () => {
    const xml = wrap(`<w:p>${run('One')}</w:p><w:p>${run('Two')}</w:p><w:p>${run('Three')}</w:p>`);
    expect(payloads(xml)).toEqual(['<x>One</x>', '<x>Two</x>', '<x>Three</x>']);
  });

  it('skips paragraphs with no text content', () => {
    const xml = wrap(
      '<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr></w:p>' +
        `<w:p>${run('Real text')}</w:p>` +
        '<w:p/>' +
        `<w:p>${run('   ')}</w:p>`,
    );
    expect(payloads(xml)).toEqual(['<x>Real text</x>']);
  });

  it('leaves w:pPr out of the payload', () => {
    const xml = wrap(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${run('Title')}</w:p>`);
    expect(payloads(xml)).toEqual(['<x>Title</x>']);
  });

  it('merges runs Word fragmented with identical formatting, dropping rsids and proofErr', () => {
    const xml = wrap(
      '<w:p w:rsidR="00A1">' +
        `<w:r w:rsidRPr="00C3">${FONT}<w:t xml:space="preserve">The Conference of the </w:t></w:r>` +
        '<w:proofErr w:type="spellStart"/>' +
        `<w:r w:rsidR="00D4">${FONT}<w:t>Parties</w:t></w:r>` +
        '<w:proofErr w:type="spellEnd"/>' +
        run(' welcomes the report.', FONT) +
        '</w:p>',
    );
    expect(payloads(xml)).toEqual(['<x>The Conference of the Parties welcomes the report.</x>']);
  });

  it('wraps text whose formatting differs from the paragraph base in <g>', () => {
    const xml = wrap(`<w:p>${run('Plain ', FONT)}${run('bold', BOLD)}${run(' end.', FONT)}</w:p>`);
    expect(payloads(xml)).toEqual(['<x>Plain <g id="1">bold</g> end.</x>']);
  });

  it('escapes XML special characters in text', () => {
    expect(payloads(wrap(`<w:p>${run('A &amp; B &lt; C')}</w:p>`))).toEqual([
      '<x>A &amp; B &lt; C</x>',
    ]);
  });

  it('decodes numeric character references instead of double-escaping them', () => {
    const xml = wrap(`<w:p>${run('Don&#8217;t')}</w:p>`);
    expect(payloads(xml)).toEqual(['<x>Don’t</x>']);
    expect(buildXml(extractParagraphs(xml).ast)).not.toContain('&amp;#');
  });

  it('turns adjacent non-text elements into a single <ph/>', () => {
    const xml = wrap(`<w:p>${run('Text')}${FOOTNOTE}${BOOKMARK}${run(' more')}</w:p>`);
    expect(payloads(xml)).toEqual(['<x>Text<ph id="1"/> more</x>']);
  });

  it('wraps hyperlinks in <g> so their text is translated in place', () => {
    const xml = wrap(
      `<w:p>${run('Please see ')}${hyperlink(run('the report', LINK))}${run(' for all the details.')}</w:p>`,
    );
    expect(payloads(xml)).toEqual([
      '<x>Please see <g id="1"><g id="2">the report</g></g> for all the details.</x>',
    ]);
  });

  it('sends text box content as its own paragraph, not inside the outer one', () => {
    const xml = wrap(`<w:p>${run('Outer text.')}${textBox(`<w:p>${run('Inside text box')}</w:p>`)}</w:p>`);
    expect(payloads(xml)).toEqual(['<x>Outer text.<ph id="1"/></x>', '<x>Inside text box</x>']);
  });

  it('does not send a paragraph whose only content is a text box', () => {
    const xml = wrap(`<w:p>${textBox(`<w:p>${run('Inside')}</w:p>`)}</w:p>`);
    expect(payloads(xml)).toEqual(['<x>Inside</x>']);
  });
});

describe('injectTranslations', () => {
  it('replaces the paragraph text', () => {
    const result = translate(wrap(`<w:p>${run('Hello')}</w:p>`), ['<x>Bonjour</x>']);
    expect(result).toBe(normalized(`<w:p>${run('Bonjour')}</w:p>`));
  });

  it('preserves w:pPr', () => {
    const pPr = '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>';
    const result = translate(wrap(`<w:p>${pPr}${run('Title')}</w:p>`), ['<x>Titre</x>']);
    expect(result).toBe(normalized(`<w:p>${pPr}${run('Titre')}</w:p>`));
  });

  it('preserves multiple paragraphs and order', () => {
    const xml = wrap(`<w:p>${run('One')}</w:p><w:p>${run('Two')}</w:p>`);
    const result = translate(xml, ['<x>Un</x>', '<x>Deux</x>']);
    expect(result).toBe(normalized(`<w:p>${run('Un')}</w:p><w:p>${run('Deux')}</w:p>`));
  });

  it('applies base formatting to bare text and <g> formatting to wrapped text', () => {
    const xml = wrap(`<w:p>${run('Plain ', FONT)}${run('bold', BOLD)}${run(' end.', FONT)}</w:p>`);
    const result = translate(xml, ['<x>Simple <g id="1">gras</g> fin.</x>']);
    expect(result).toBe(
      normalized(`<w:p>${run('Simple ', FONT)}${run('gras', BOLD)}${run(' fin.', FONT)}</w:p>`),
    );
  });

  it('puts the original elements back where <ph/> lands', () => {
    const xml = wrap(`<w:p>${run('Text')}${FOOTNOTE}${BOOKMARK}${run(' more')}</w:p>`);
    const result = translate(xml, ['<x>Plus<ph id="1"/> de texte</x>']);
    expect(result).toBe(
      normalized(`<w:p>${run('Plus')}${FOOTNOTE}${BOOKMARK}${run(' de texte')}</w:p>`),
    );
  });

  it('rebuilds hyperlinks around their translated text', () => {
    const xml = wrap(
      `<w:p>${run('Please see ')}${hyperlink(run('the report', LINK))}${run(' for all the details.')}</w:p>`,
    );
    const result = translate(xml, [
      '<x>Voir <g id="1"><g id="2">le rapport</g></g> pour tous les détails.</x>',
    ]);
    expect(result).toBe(
      normalized(
        `<w:p>${run('Voir ')}${hyperlink(run('le rapport', LINK))}${run(' pour tous les détails.')}</w:p>`,
      ),
    );
  });

  it('keeps the translated text box inside the translated outer paragraph', () => {
    const xml = wrap(`<w:p>${run('Outer text.')}${textBox(`<w:p>${run('Inside text box')}</w:p>`)}</w:p>`);
    const result = translate(xml, [
      '<x>Texte extérieur.<ph id="1"/></x>',
      '<x>Dans la zone de texte</x>',
    ]);
    expect(result).toBe(
      normalized(
        `<w:p>${run('Texte extérieur.')}${textBox(`<w:p>${run('Dans la zone de texte')}</w:p>`)}</w:p>`,
      ),
    );
  });

  it('falls back to plain text in the original runs when DeepL returns unbalanced XML', () => {
    const xml = wrap(`<w:p>${run('Plain ', FONT)}${run('bold', BOLD)}</w:p>`);
    const result = translate(xml, ['<x>Simple </g><g id="1">gras &amp; co</g></x>']);
    expect(result).toBe(normalized(`<w:p>${run('Simple gras &amp; co', FONT)}${run('', BOLD)}</w:p>`));
  });

  it('falls back to plain text when DeepL drops a placeholder, keeping the original element', () => {
    const xml = wrap(`<w:p>${run('Text')}${FOOTNOTE}${run(' more')}</w:p>`);
    const result = translate(xml, ['<x>Plus de texte</x>']);
    expect(result).toBe(normalized(`<w:p>${run('Plus de texte')}${FOOTNOTE}${run('')}</w:p>`));
  });

  it('falls back to plain text when DeepL duplicates a placeholder', () => {
    const xml = wrap(`<w:p>${run('Text')}${FOOTNOTE}${run(' more')}</w:p>`);
    const result = translate(xml, ['<x>Plus<ph id="1"/> de<ph id="1"/> texte</x>']);
    expect(result).toBe(normalized(`<w:p>${run('Plus de texte')}${FOOTNOTE}${run('')}</w:p>`));
  });

  it('falls back to plain text when DeepL reorders field markers', () => {
    const xml = wrap(`<w:p>${run('See ')}${FIELD_START}${run('Result')}${FIELD_END}${run(' end')}</w:p>`);
    expect(payloads(xml)).toEqual(['<x>See <ph id="1"/>Result<ph id="2"/> end</x>']);
    const result = translate(xml, ['<x><ph id="2"/>Siehe <ph id="1"/>Ergebnis Ende</x>']);
    expect(result).toBe(
      normalized(`<w:p>${run('Siehe Ergebnis Ende')}${FIELD_START}${run('')}${FIELD_END}${run('')}</w:p>`),
    );
  });

  it('lets DeepL reorder placeholders that are not range markers', () => {
    const fn3 = FOOTNOTE.replace('w:id="2"', 'w:id="3"');
    const xml = wrap(`<w:p>${run('A')}${FOOTNOTE}${run(' B')}${fn3}</w:p>`);
    const result = translate(xml, ['<x>B<ph id="2"/> A<ph id="1"/></x>']);
    expect(result).toBe(normalized(`<w:p>${run('B')}${fn3}${run(' A')}${FOOTNOTE}</w:p>`));
  });

  it.each([
    ['duplicates', '<x>Voir <g id="1"><g id="2">le rapport</g></g> et <g id="1"><g id="2">le rapport</g></g> encore.</x>'],
    ['drops', '<x>Voir <g id="2">le rapport</g> pour tous les détails.</x>'],
  ])('falls back to plain text when DeepL %s a hyperlink', (_, translation) => {
    const xml = wrap(
      `<w:p>${run('Please see ')}${hyperlink(run('the report', LINK))}${run(' for all the details.')}</w:p>`,
    );
    const result = translate(xml, [translation]);
    expect(result.match(/<w:hyperlink /g)).toHaveLength(1);
    expect(result).not.toContain('the report');
  });

  it('does not put fallback text inside a text box', () => {
    const xml = wrap(`<w:p>${textBox(`<w:p>${run('Inside')}</w:p>`)}${run('Outer')}</w:p>`);
    const { ast, paragraphs } = extractParagraphs(xml);
    // Unknown placeholder id forces the fallback for the outer paragraph.
    injectTranslations(paragraphs, ['<x><ph id="9"/>Dehors</x>', '<x>Dedans</x>']);
    expect(buildXml(ast)).toBe(
      normalized(`<w:p>${textBox(`<w:p>${run('Dedans')}</w:p>`)}${run('Dehors')}</w:p>`),
    );
  });

  it('throws when paragraph and translation counts mismatch', () => {
    const { paragraphs } = extractParagraphs(wrap(`<w:p>${run('Hello')}</w:p>`));
    expect(() => injectTranslations(paragraphs, ['a', 'b'])).toThrow();
  });

  it('round-trips unchanged payloads without losing structure', () => {
    const xml = wrap(
      `<w:p>${run('Please see ', FONT)}${hyperlink(run('the report', LINK))}${run(' bold', BOLD)}` +
        `${FOOTNOTE}${run(' for all the details.', FONT)}` +
        `${textBox(`<w:p>${run('Inside text box')}</w:p>`)}</w:p>`,
    );
    const { ast, paragraphs } = extractParagraphs(xml);
    const before = paragraphs.map((p) => p.payload);
    injectTranslations(paragraphs, before);
    expect(payloads(buildXml(ast))).toEqual(before);
  });
});

describe('parseXml / buildXml', () => {
  it('round-trips a minimal document', () => {
    const xml = '<a><b>hi</b></a>';
    expect(buildXml(parseXml(xml))).toBe(xml);
  });
});
