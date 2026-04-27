type TokenizerModel = {
  vocab: Record<string, number>;
};

type TokenizerJson = {
  model: TokenizerModel;
};

const tokenizerData = require('@/features/tts/data/kokoro-tokenizer.json') as TokenizerJson;
const tokenizerVocab = tokenizerData.model.vocab;
const startEndTokenId = tokenizerVocab.$ ?? 0;
const tokenizerPattern =
  /[^$;:,.!?\u2014\u2026"()\u201c\u201d \u0303\u02a3\u02a5\u02a6\u02a8\u1d5d\uab67AIOQSTWY\u1d4aabcdefhijklmnopqrstuvwxyz\u0251\u0250\u0252\u00e6\u03b2\u0254\u0255\u00e7\u0256\u00f0\u02a4\u0259\u025a\u025b\u025c\u025f\u0261\u0265\u0268\u026a\u029d\u026f\u0270\u014b\u0273\u0272\u0274\u00f8\u0278\u03b8\u0153\u0279\u027e\u027b\u0281\u027d\u0282\u0283\u0288\u02a7\u028a\u028b\u028c\u0263\u0264\u03c7\u028e\u0292\u0294\u02c8\u02cc\u02d0\u02b0\u02b2\u2193\u2192\u2197\u2198\u1d7b]/g;
const splitPattern = /(\s*[;:,.!?\u00a1\u00bf\u2014\u2026"\u00ab\u00bb\u201c\u201d(){}\[\]]+\s*)+/g;

function splitWithMatches(value: string, pattern: RegExp): { match: boolean; text: string }[] {
  const segments: { match: boolean; text: string }[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(pattern)) {
    const text = match[0] ?? '';
    const index = match.index ?? 0;

    if (lastIndex < index) {
      segments.push({ match: false, text: value.slice(lastIndex, index) });
    }

    if (text.length > 0) {
      segments.push({ match: true, text });
    }

    lastIndex = index + text.length;
  }

  if (lastIndex < value.length) {
    segments.push({ match: false, text: value.slice(lastIndex) });
  }

  return segments;
}

function normalizeYear(input: string): string {
  if (input.includes('.')) {
    return input;
  }

  if (input.includes(':')) {
    const [hours, minutes] = input.split(':').map(Number);
    if (minutes === 0) {
      return `${hours} o'clock`;
    }
    if (minutes < 10) {
      return `${hours} oh ${minutes}`;
    }
    return `${hours} ${minutes}`;
  }

  const year = Number.parseInt(input.slice(0, 4), 10);
  if (year < 1100 || year % 1000 < 10) {
    return input;
  }

  const firstPair = input.slice(0, 2);
  const secondPair = Number.parseInt(input.slice(2, 4), 10);
  const suffix = input.endsWith('s') ? 's' : '';

  if (year % 1000 >= 100 && year % 1000 <= 999) {
    if (secondPair === 0) {
      return `${firstPair} hundred${suffix}`;
    }
    if (secondPair < 10) {
      return `${firstPair} oh ${secondPair}${suffix}`;
    }
  }

  return `${firstPair} ${secondPair}${suffix}`;
}

function normalizeCurrency(input: string): string {
  const currency = input[0] === '$' ? 'dollar' : 'pound';
  const rawValue = input.slice(1);

  if (Number.isNaN(Number(rawValue))) {
    return `${rawValue} ${currency}s`;
  }

  if (!input.includes('.')) {
    const suffix = rawValue === '1' ? '' : 's';
    return `${rawValue} ${currency}${suffix}`;
  }

  const [whole, fractionRaw] = rawValue.split('.');
  const fraction = Number.parseInt(fractionRaw.padEnd(2, '0'), 10);

  if (input[0] === '$') {
    return `${whole} dollar${whole === '1' ? '' : 's'} and ${fraction} ${
      fraction === 1 ? 'cent' : 'cents'
    }`;
  }

  return `${whole} pound${whole === '1' ? '' : 's'} and ${fraction} ${
    fraction === 1 ? 'penny' : 'pence'
  }`;
}

function normalizeDecimal(input: string): string {
  const [whole, fraction] = input.split('.');
  return `${whole} point ${fraction.split('').join(' ')}`;
}

function normalizeInputText(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/«/g, '“')
    .replace(/»/g, '”')
    .replace(/[“”]/g, '"')
    .replace(/\(/g, '«')
    .replace(/\)/g, '»')
    .replace(/、/g, ', ')
    .replace(/。/g, '. ')
    .replace(/！/g, '! ')
    .replace(/，/g, ', ')
    .replace(/：/g, ': ')
    .replace(/；/g, '; ')
    .replace(/？/g, '? ')
    .replace(/[^\S \n]/g, ' ')
    .replace(/  +/g, ' ')
    .replace(/(?<=\n) +(?=\n)/g, '')
    .replace(/\bD[Rr]\.(?= [A-Z])/g, 'Doctor')
    .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, 'Mister')
    .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, 'Miss')
    .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, 'Mrs')
    .replace(/\betc\.(?! [A-Z])/gi, 'etc')
    .replace(/\b(y)eah?\b/gi, "$1e'a")
    .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, normalizeYear)
    .replace(/(?<=\d),(?=\d)/g, '')
    .replace(/[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi, normalizeCurrency)
    .replace(/\d*\.\d+/g, normalizeDecimal)
    .replace(/(?<=\d)-(?=\d)/g, ' to ')
    .replace(/(?<=\d)S/g, ' S')
    .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S")
    .replace(/(?<=X')S\b/g, 's')
    .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, (value) => value.replace(/\./g, '-'))
    .replace(/(?<=[A-Z])\.(?=[A-Z])/gi, '-')
    .trim();
}

function postProcessPhonemes(value: string, language: 'a' | 'b'): string {
  let phonemes = value
    .replace(/kəkˈoːɹoʊ/g, 'kˈoʊkəɹoʊ')
    .replace(/kəkˈɔːɹəʊ/g, 'kˈəʊkəɹəʊ')
    .replace(/ʲ/g, 'j')
    .replace(/r/g, 'ɹ')
    .replace(/x/g, 'k')
    .replace(/ɬ/g, 'l')
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, ' ')
    .replace(/ z(?=[;:,.!?\u00a1\u00bf\u2014\u2026"\u00ab\u00bb\u201c\u201d ]|$)/g, 'z');

  if (language === 'a') {
    phonemes = phonemes.replace(/(?<=nˈaɪn)ti(?!ː)/g, 'di');
  }

  return phonemes.trim();
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeTextFallbackToPhonemeLikeText(
  text: string,
  language: 'a' | 'b',
): string {
  let phonemeLike = text
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/\bthe\b/g, 'thə')
    .replace(/\band\b/g, 'ænd')
    .replace(/\bfor\b/g, 'fɔɹ')
    .replace(/\bwith\b/g, 'wɪð')
    .replace(/\byou\b/g, 'ju')
    .replace(/\byour\b/g, 'jɔɹ')
    .replace(/\bare\b/g, 'ɑɹ')
    .replace(/\bto\b/g, 'tu')
    .replace(/\bof\b/g, 'ʌv')
    .replace(/\bing\b/g, 'ɪŋ')
    .replace(/tion\b/g, 'ʃən')
    .replace(/sion\b/g, 'ʒən')
    .replace(/ph/g, 'f')
    .replace(/qu/g, 'kw')
    .replace(/x/g, 'ks')
    .replace(/ch/g, 'tʃ')
    .replace(/sh/g, 'ʃ')
    .replace(/th/g, language === 'a' ? 'ð' : 'θ')
    .replace(/zh/g, 'ʒ')
    .replace(/ng/g, 'ŋ')
    .replace(/ck/g, 'k')
    .replace(/wh/g, 'w')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/ou/g, 'aʊ')
    .replace(/ow/g, 'oʊ')
    .replace(/oi/g, 'ɔɪ')
    .replace(/ay/g, 'eɪ')
    .replace(/ea/g, 'i')
    .replace(/igh/g, 'aɪ')
    .replace(/a/g, 'a')
    .replace(/e/g, 'e')
    .replace(/i/g, 'i')
    .replace(/o/g, 'o')
    .replace(/u/g, 'u');

  phonemeLike = phonemeLike.replace(tokenizerPattern, ' ');
  return collapseWhitespace(phonemeLike);
}

export async function normalizeTextToPhonemes(
  text: string,
  language: 'a' | 'b' = 'a',
): Promise<string> {
  const normalizedText = normalizeInputText(text);
  const segments = splitWithMatches(normalizedText, splitPattern);
  const phonemeLikeChunks = segments.map(({ match, text: segment }) =>
    match ? segment : normalizeTextFallbackToPhonemeLikeText(segment, language),
  );

  const cleaned = phonemeLikeChunks.join('').replace(tokenizerPattern, '');
  return postProcessPhonemes(cleaned, language);
}

export function tokenizeKokoroPhonemes(phonemes: string, maxLength = 510): number[] {
  const filtered = phonemes.replace(tokenizerPattern, '');
  const tokenIds = Array.from(filtered)
    .map((character) => tokenizerVocab[character])
    .filter((value): value is number => typeof value === 'number')
    .slice(0, maxLength);

  return [startEndTokenId, ...tokenIds, startEndTokenId];
}
