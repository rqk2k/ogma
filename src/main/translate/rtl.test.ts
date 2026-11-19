import { describe, expect, it } from 'vitest';
import { buildXml, parseXml } from './paragraphs';
import { applyRtl, isRtl } from './rtl';

function rtl(xml: string): string {
  const ast = parseXml(xml);
  applyRtl(ast);
  return buildXml(ast);
}

/** Same XML as the builder would emit, so results can be compared exactly. */
function normalized(xml: string): string {
  return buildXml(parseXml(xml));
}

describe('isRtl', () => {
  it('is true only for right-to-left targets', () => {
    expect(isRtl('AR')).toBe(true);
    expect(isRtl('FR')).toBe(false);
  });
});

describe('applyRtl', () => {
  it('gives a paragraph without properties a pPr with bidi', () => {
    expect(rtl('<w:p><w:r><w:t>نص</w:t></w:r></w:p>')).toBe(
      normalized('<w:p><w:pPr><w:bidi/></w:pPr><w:r><w:t>نص</w:t></w:r></w:p>'),
    );
  });

  it('puts bidi in schema order, replacing an explicit bidi off', () => {
    expect(
      rtl(
        '<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:after="120"/>' +
          '<w:jc w:val="both"/><w:bidi w:val="0"/></w:pPr></w:p>',
      ),
    ).toBe(
      normalized(
        '<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:bidi/><w:spacing w:after="120"/>' +
          '<w:jc w:val="both"/></w:pPr></w:p>',
      ),
    );
  });

  it('mirrors tables and sections', () => {
    expect(
      rtl(
        '<w:body><w:tbl><w:tblPr><w:tblStyle w:val="Grid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr></w:tbl>' +
          '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:docGrid w:linePitch="360"/></w:sectPr></w:body>',
      ),
    ).toBe(
      normalized(
        '<w:body><w:tbl><w:tblPr><w:tblStyle w:val="Grid"/><w:bidiVisual/><w:tblW w:w="0" w:type="auto"/></w:tblPr></w:tbl>' +
          '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:bidi/><w:docGrid w:linePitch="360"/></w:sectPr></w:body>',
      ),
    );
  });

  it('copies bold, italic and size to the complex-script properties Arabic uses, keeping explicit ones', () => {
    expect(rtl('<w:rPr><w:b/><w:i w:val="0"/><w:sz w:val="28"/><w:szCs w:val="20"/></w:rPr>')).toBe(
      normalized(
        '<w:rPr><w:b/><w:bCs/><w:i w:val="0"/><w:iCs w:val="0"/><w:sz w:val="28"/><w:szCs w:val="20"/></w:rPr>',
      ),
    );
  });

  it('leaves pPr outside paragraphs alone', () => {
    const style = '<w:style w:type="paragraph"><w:pPr><w:jc w:val="left"/></w:pPr></w:style>';
    expect(rtl(style)).toBe(normalized(style));
  });
});
