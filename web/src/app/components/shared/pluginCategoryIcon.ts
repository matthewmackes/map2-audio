export type PluginCategorySpriteId =
  | 'i-eq'
  | 'i-comp'
  | 'i-drive'
  | 'i-amp'
  | 'i-cab'
  | 'i-delay'
  | 'i-reverb'
  | 'i-mod'
  | 'i-pitch'
  | 'i-filter'
  | 'i-plus';

const CATEGORY_ICON_PATTERNS: Array<[RegExp, PluginCategorySpriteId]> = [
  [/(equalizer|\beq\b|tone|filter\/parametric)/i, 'i-eq'],
  [/(compressor|limiter|dynamics|gate|expander)/i, 'i-comp'],
  [/(distortion|overdrive|drive|fuzz|saturation)/i, 'i-drive'],
  [/(amplifier|\bamp\b|preamp|cabinet simulator)/i, 'i-amp'],
  [/(cabinet|\bcab\b|speaker|convolver|impulse response|\bir\b)/i, 'i-cab'],
  [/(delay|echo|looper)/i, 'i-delay'],
  [/(reverb|room|plate|hall)/i, 'i-reverb'],
  [/(modulation|chorus|flanger|phaser|tremolo|vibrato|rotary)/i, 'i-mod'],
  [/(pitch|shifter|harmonizer|octave|whammy)/i, 'i-pitch'],
  [/(filter|wah|lowpass|highpass|bandpass)/i, 'i-filter'],
];

export function pluginCategoryIcon(lv2Class: string | null | undefined): PluginCategorySpriteId {
  const normalized = String(lv2Class ?? '').trim();
  if (!normalized) {
    return 'i-plus';
  }

  const match = CATEGORY_ICON_PATTERNS.find(([pattern]) => pattern.test(normalized));
  return match?.[1] ?? 'i-plus';
}
