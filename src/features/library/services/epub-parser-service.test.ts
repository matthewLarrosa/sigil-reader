import { resolveRelativePath } from '@/features/library/services/epub-parser-service';

describe('resolveRelativePath', () => {
  it('resolves path segments relative to OPF', () => {
    expect(resolveRelativePath('OPS/content.opf', './text/chapter1.xhtml')).toBe(
      'OPS/text/chapter1.xhtml',
    );
    expect(resolveRelativePath('OPS/content.opf', '../images/cover.jpg')).toBe('images/cover.jpg');
  });

  it('removes fragments and query params from href values', () => {
    expect(resolveRelativePath('OPS/content.opf', 'text/chapter1.xhtml#section2')).toBe(
      'OPS/text/chapter1.xhtml',
    );
    expect(resolveRelativePath('OPS/content.opf', 'text/chapter2.xhtml?foo=bar')).toBe(
      'OPS/text/chapter2.xhtml',
    );
  });
});
