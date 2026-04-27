import { normalizeTextToPhonemes, tokenizeKokoroPhonemes } from '@/features/tts/services/kokoro-text';

describe('normalizeTextToPhonemes', () => {
  it('uses word-level pronunciations for the Moby Dick sample phrase', async () => {
    const phonemes = await normalizeTextToPhonemes(
      'It is a way I have of driving off the spleen and regulating the circulation.',
    );

    expect(phonemes).toContain('dɹˈaɪvɪŋ');
    expect(phonemes).toContain('ˈɔf');
    expect(phonemes).toContain('ðə');
    expect(phonemes).toContain('splˈiːn');
    expect(phonemes).toContain('sˌɚkjəlˈeɪʃən');
  });

  it('keeps hyphenated prose from merging adjacent words', async () => {
    const phonemes = await normalizeTextToPhonemes('Some years ago-never mind how long precisely.');

    expect(phonemes).toContain('əɡˈoʊ, nˈɛvɚ');
  });

  it('produces tokenizer ids for lexicon phonemes', async () => {
    const phonemes = await normalizeTextToPhonemes('driving off the spleen');
    const tokenIds = tokenizeKokoroPhonemes(phonemes);

    expect(tokenIds.length).toBeGreaterThan(2);
  });
});
