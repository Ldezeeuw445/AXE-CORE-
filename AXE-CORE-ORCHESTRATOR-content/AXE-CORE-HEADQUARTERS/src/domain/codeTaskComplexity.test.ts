import { describe, it, expect } from 'vitest';
import { classifyCodeTaskComplexity } from './codeTaskComplexity';

describe('codeTaskComplexity: bij twijfel altijd het abonnement', () => {
  it('een zwaar trefwoord wint altijd, ook kort', () => {
    expect(classifyCodeTaskComplexity('refactor this')).toBe('heavy');
    expect(classifyCodeTaskComplexity('migreer de auth module')).toBe('heavy');
  });

  it('een expliciet simpel signaal, kort genoeg, is simpel', () => {
    expect(classifyCodeTaskComplexity('fix deze typo in de titel')).toBe('simple');
    expect(classifyCodeTaskComplexity('hernoem deze variabele naar iets duidelijkers')).toBe('simple');
  });

  it('een heel korte instructie zonder signaal is ook simpel', () => {
    expect(classifyCodeTaskComplexity('voeg een console.log toe hier')).toBe('simple');
  });

  it('een middellange instructie zonder duidelijk signaal is heavy -- bij twijfel het abonnement', () => {
    const middel = 'kun je kijken waarom de gebruiker soms wordt uitgelogd na een refresh op de dashboard pagina en dat oplossen';
    expect(classifyCodeTaskComplexity(middel)).toBe('heavy');
  });

  it('leeg is heavy, niet simpel', () => {
    expect(classifyCodeTaskComplexity('   ')).toBe('heavy');
  });

  it('een simpel signaal redt een te lange instructie niet', () => {
    const lang = Array(35).fill('typo').join(' ');
    expect(classifyCodeTaskComplexity(lang)).toBe('heavy');
  });
});
