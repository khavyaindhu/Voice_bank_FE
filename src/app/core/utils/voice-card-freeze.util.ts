/**
 * Detects staff card freeze/unfreeze voice commands in English and native
 * scripts (Tamil SOV: "விஜயா கார்டை முடக்கு", Hindi: "विजया का कार्ड फ्रीज करो", etc.).
 */

export type CardFreezeAction = 'freeze' | 'unfreeze';

export interface CardFreezeIntent {
  target: string;
  action: CardFreezeAction;
}

const FREEZE_TERMS: Record<string, string[]> = {
  en: ['freeze', 'block', 'lock', 'stop'],
  ta: ['முடக்க', 'block', 'freeze', 'lock', 'பிளாக்', 'லாக்', 'நிறுத்த'],
  kn: ['ಮುಚ್ಚ', 'freeze', 'block', 'lock', 'ನಿಲ್ಲಿಸ', 'ಬ್ಲಾಕ್'],
  hi: ['फ्रीज', 'ब्लॉक', 'block', 'freeze', 'lock', 'रोक', 'बंद'],
  es: ['congelar', 'bloquear', 'block', 'freeze'],
};

const UNFREEZE_TERMS: Record<string, string[]> = {
  en: ['unfreeze', 'unlock', 'unblock'],
  ta: ['unfreeze', 'unlock', 'திற', 'மீண்டும்', 'உரிக்க'],
  kn: ['unfreeze', 'unlock', 'ತೆರ', 'ಬಿಡು'],
  hi: ['unfreeze', 'unlock', 'अनफ्रीज', 'खोल'],
  es: ['descongelar', 'desbloquear', 'unfreeze', 'unlock'],
};

const CARD_TERMS: Record<string, string[]> = {
  en: ['card', 'cards'],
  ta: ['கார்ட', 'card', 'அட்டை'],
  kn: ['ಕಾರ್ಡ', 'card', 'ಕಾರ್'],
  hi: ['कार्ड', 'card'],
  es: ['tarjeta', 'card'],
};

/** Demo customers — keys are English names used by staff card lookup. */
const CUSTOMER_NAMES: Record<string, string[]> = {
  vijaya: ['ವಿಜಯಾ', 'ವಿಜಯ', 'विजया', 'विजय', 'விஜயா', 'விஜய', 'vijaya'],
  ramesh: ['ರಮೇಶ್', 'ರಮೇಶ', 'रमेश', 'ரமேஷ்', 'ramesh'],
  kavya:  ['ಕಾವ್ಯ', 'काव्य', 'காவ்ய', 'kavya'],
  nayana: ['ನಾಯನ', 'नायना', 'நாயனா', 'nayana'],
  james:  ['ಜೇಮ್ಸ್', 'जेम्स', 'ஜேம்ஸ்', 'james'],
  emily:  ['ಎಮಿಲಿ', 'एमिली', 'எமிலி', 'emily'],
  agni:   ['ಅಗ್ನಿ', 'अग्नि', 'அக்னி', 'agni'],
  sarah:  ['ಸಾರಾ', 'सारा', 'சாரா', 'sarah'],
  robert: ['ರಾಬರ್ಟ್', 'रॉबर्ट', 'ராபர்ட்', 'robert'],
};

function includesTerm(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some(term => lower.includes(term.toLowerCase()));
}

function mergedTerms(map: Record<string, string[]>, langCode: string): string[] {
  return [...(map['en'] ?? []), ...(map[langCode] ?? [])];
}

function detectCustomerName(text: string): string | null {
  for (const [name, variants] of Object.entries(CUSTOMER_NAMES)) {
    if (includesTerm(text, variants)) return name;
  }
  return null;
}

function resolveAction(text: string, langCode: string): CardFreezeAction | null {
  const unfreezeTerms = mergedTerms(UNFREEZE_TERMS, langCode);
  const freezeTerms = mergedTerms(FREEZE_TERMS, langCode);
  const isUnfreeze = includesTerm(text, unfreezeTerms);
  if (isUnfreeze) return 'unfreeze';
  if (includesTerm(text, freezeTerms)) return 'freeze';
  return null;
}

/** Detect freeze intent from Tamil/Kannada/Hindi/English mixed utterances. */
export function detectNativeCardFreezeIntent(text: string, langCode: string): CardFreezeIntent | null {
  if (!text?.trim()) return null;

  const cardTerms = mergedTerms(CARD_TERMS, langCode);
  if (!includesTerm(text, cardTerms)) return null;

  const action = resolveAction(text, langCode);
  if (!action) return null;

  const target = detectCustomerName(text);
  if (!target) return null;

  return { target, action };
}

/** Parse English (or post-translation) freeze phrasings — both SVO and SOV. */
export function parseEnglishCardFreezeIntent(msg: string): CardFreezeIntent | null {
  if (!msg?.trim()) return null;

  const lower = msg.toLowerCase();
  const actionFromText = (): CardFreezeAction =>
    /unfreeze|unlock|unblock/i.test(lower) ? 'unfreeze' : 'freeze';

  // freeze Vijaya's card / block Ramesh card
  let m = msg.match(/(?:freeze|block|lock|unfreeze|unlock|unblock)\s+(?:the\s+)?(.+?)'?s?\s+cards?\b/i);
  if (m?.[1]) {
    return { target: m[1].trim(), action: actionFromText() };
  }

  // Vijaya's card freeze / Vijaya card block (SOV)
  m = msg.match(/(.+?)'?s?\s+cards?\s+(?:to\s+)?(?:freeze|block|lock|unfreeze|unlock|unblock)\b/i);
  if (m?.[1]) {
    const target = m[1].trim().replace(/\s+(?:please|now|for me)$/i, '');
    if (target.length >= 2) {
      return { target, action: actionFromText() };
    }
  }

  // Hindi-style: Vijaya ka card freeze karo
  m = msg.match(/(.+?)(?:'s|s|\s+ka|\s+ki|\s+ke|\s+의)\s+cards?\s+(?:ko\s+)?(?:freeze|block|lock|unfreeze|unlock)/i);
  if (m?.[1]) {
    return { target: m[1].trim(), action: actionFromText() };
  }

  return null;
}

export function parseCardFreezeIntent(msg: string, langCode = 'en'): CardFreezeIntent | null {
  return (
    parseEnglishCardFreezeIntent(msg) ??
    detectNativeCardFreezeIntent(msg, langCode)
  );
}

export function cardFreezeToEnglishCommand(intent: CardFreezeIntent): string {
  return `${intent.action} ${intent.target} card`;
}
