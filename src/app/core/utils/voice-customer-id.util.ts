/**
 * Converts spoken / phonetically-spelled customer IDs (common when STT writes
 * English letters & numbers in Tamil, Kannada, Hindi, etc.) into canonical
 * "CUST-NNN" form used by the staff portal.
 *
 * Example (Tamil STT):
 *   "சி யு எஸ் டி டபிள் ஜீரோ டூ" → "CUST-002"
 */

/** Single-letter phonetic spellings heard across Indic languages. */
const PHONETIC_LETTER_MAP: Record<string, string> = {
  // Tamil
  'சி': 'c', 'யு': 'u', 'எஸ்': 's', 'எஸ': 's', 'டி': 't', 'ட': 't',
  // Kannada
  'ಸಿ': 'c', 'ಯು': 'u', 'ಎಸ್': 's', 'ಎಸ': 's', 'ಟಿ': 't', 'ಟ': 't',
  // Hindi (Devanagari)
  'सी': 'c', 'यू': 'u', 'यु': 'u', 'एस': 's', 'टी': 't', 'ट': 't',
  // Telugu (common STT variants)
  'సి': 'c', 'యు': 'u', 'ఎస్': 's', 'టి': 't',
};

/** Spoken number / modifier words → Latin tokens or digits. */
const PHONETIC_WORD_MAP: Record<string, string> = {
  // English (mixed speech)
  cust: 'cust', customer: 'cust',
  double: 'double', triple: 'triple',
  zero: '0', oh: '0',
  one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9',
  // Tamil
  'கஸ்ட': 'cust', 'கஸ்டம்': 'cust', 'கஸ்டமர்': 'cust',
  'டபிள்': 'double', 'டபிள': 'double', 'இரட்டி': 'double',
  'ஜீரோ': '0', 'ஜீர': '0', 'பூஜ்ஜியம்': '0', 'பூஜ்ஜ': '0',
  'ஒன்று': '1', 'ஒன': '1', 'இரண்டு': '2', 'மூன்று': '3', 'நான்கு': '4',
  'ஐந்து': '5', 'ஆறு': '6', 'ஏழு': '7', 'எட்டு': '8', 'ஒன்பது': '9',
  'டூ': '2', 'த்ரீ': '3', 'ஃபோர்': '4', 'ஃபைவ்': '5',
  // Kannada
  'ಕಸ್ಟ': 'cust', 'ಕಸ್ಟಮರ್': 'cust', 'ಕಸ್ಟಮ್': 'cust',
  'ಡಬಲ್': 'double', 'ಡಬಲ': 'double',
  'ಜೀರೋ': '0', 'ಝೀರೋ': '0', 'ಶೂನ್ಯ': '0', 'ಸೊನ್ನೆ': '0',
  'ಒಂದು': '1', 'ಎರಡು': '2', 'ಮೂರು': '3', 'ನಾಲ್ಕು': '4', 'ಐದು': '5',
  'ಆರು': '6', 'ಏಳು': '7', 'ಎಂಟು': '8', 'ಒಂಬತ್ತು': '9',
  // Hindi
  'कस्ट': 'cust', 'कस्टमर': 'cust', 'कस्टम': 'cust',
  'डबल': 'double', 'दोहरा': 'double',
  'जीरो': '0', 'शून्य': '0', 'शुन्य': '0',
  'एक': '1', 'दो': '2', 'तीन': '3', 'चार': '4', 'पांच': '5',
  'छह': '6', 'सात': '7', 'आठ': '8', 'नौ': '9',
};

function tokenizeForIdParsing(text: string): string[] {
  return text
    .toLocaleLowerCase()
    .normalize('NFC')
    .replace(/[.,!?;:"'()[\]{}]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function tokensToLatin(tokens: string[]): string[] {
  return tokens.map(t => PHONETIC_LETTER_MAP[t] ?? PHONETIC_WORD_MAP[t] ?? t);
}

/** Expand "double 0" → "00", "double 3" → "33", "triple 0" → "000". */
function expandDoubleTriple(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];

    if (t === 'double' && next !== undefined) {
      if (/^\d$/.test(next)) {
        out.push(next + next);
        i++;
        continue;
      }
      if (next === '0' || next === 'zero') {
        out.push('00');
        i++;
        continue;
      }
    }

    if (t === 'triple' && next !== undefined) {
      if (next === '0' || next === 'zero') {
        out.push('000');
        i++;
        continue;
      }
      if (/^\d$/.test(next)) {
        out.push(next.repeat(3));
        i++;
        continue;
      }
    }

    out.push(t);
  }
  return out;
}

function formatCustId(digits: string): string {
  const n = parseInt(digits.replace(/\D/g, ''), 10);
  if (Number.isNaN(n)) return '';
  return `CUST-${String(n).padStart(3, '0')}`;
}

function collectDigitsAfterCust(tokens: string[], startIdx: number): string {
  const digits: string[] = [];
  for (let i = startIdx; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^\d+$/.test(t)) {
      digits.push(...t.split(''));
      continue;
    }
    if (/^\d$/.test(t)) {
      digits.push(t);
      continue;
    }
    // Stop at non-digit tokens once we've started collecting digits
    if (digits.length) break;
  }
  return digits.join('');
}

/**
 * Extract a canonical customer display ID from free-form voice/STT text.
 * Returns null when no CUST-style ID is detected.
 */
export function extractSpokenCustomerId(text: string): string | null {
  if (!text?.trim()) return null;

  const tokens = expandDoubleTriple(tokensToLatin(tokenizeForIdParsing(text)));
  const spaced = tokens.join(' ');
  const compact = tokens.join('');

  // Already Latin: "CUST-002", "cust 2", "cust002"
  const direct =
    spaced.match(/\bcust(?:omer)?[\s\-]*(\d{1,4})\b/) ??
    compact.match(/cust(?:omer)?(\d{1,4})/);
  if (direct?.[1]) return formatCustId(direct[1]);

  // Letter-by-letter: c u s t 0 0 2
  for (let i = 0; i <= tokens.length - 4; i++) {
    if (tokens[i] === 'c' && tokens[i + 1] === 'u' && tokens[i + 2] === 's' && tokens[i + 3] === 't') {
      const digits = collectDigitsAfterCust(tokens, i + 4);
      if (digits) return formatCustId(digits);
    }
  }

  return null;
}

/** True when text already contains a normalised CUST-NNN token. */
export function hasCanonicalCustomerId(text: string): boolean {
  return /\bcust[\s\-]*\d{1,4}\b/i.test(text);
}

/**
 * When a report/search command was translated without the customer filter,
 * inject the spoken ID so staff intent regexes can match it.
 */
export function injectCustomerIdIntoReportCommand(command: string, custId: string): string {
  if (!custId || hasCanonicalCustomerId(command)) return command;

  const trimmed = command.trim();
  const lower = trimmed.toLowerCase();

  const periodMatch = lower.match(/^open transactions report for (.+)$/);
  if (periodMatch) {
    return `show transactions for ${custId} ${periodMatch[1]}`;
  }

  if (/^spending summary\b/i.test(trimmed)) {
    const rest = trimmed.replace(/^spending summary/i, '').trim();
    return rest
      ? `spending summary for ${custId} ${rest}`
      : `spending summary for ${custId}`;
  }

  if (/transaction|report|summary|spending/i.test(lower)) {
    return `show transactions for ${custId} ${trimmed}`;
  }

  if (/^(search|find|look up|show)\b/i.test(lower)) {
    return `${trimmed} ${custId}`;
  }

  return `${custId} ${trimmed}`;
}

/**
 * Replace phonetic ID tokens in the original utterance with the canonical ID
 * (helps UI messages and downstream regex capture).
 */
export function normalizeSpokenCustomerIds(text: string): string {
  const custId = extractSpokenCustomerId(text);
  if (!custId) return text;
  if (hasCanonicalCustomerId(text)) return text;

  // Append canonical ID so intent handlers can pick it up even if the rest
  // of the phrase stays in the native script.
  return `${text} ${custId}`;
}
