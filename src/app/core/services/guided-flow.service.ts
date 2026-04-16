import { Injectable } from '@angular/core';
import { Account } from './api.service';

export interface FlowStep {
  field: string;
  question: (accounts: Account[], state: Record<string, string | boolean>) => string;
  parse: (input: string, accounts: Account[], state: Record<string, string | boolean>) => { value: string | boolean; display: string } | null;
  chips?: (accounts: Account[], state: Record<string, string | boolean>) => string[];
  skipIf?: (state: Record<string, string | boolean>) => boolean;
}

export interface GuidedFlowState {
  screen: string;
  steps: FlowStep[];
  currentStep: number;
  filledFields: Record<string, string | boolean>;
  isActive: boolean;
}

// ── Helper: match account by nickname/masked number/type keyword ──
function matchAccount(input: string, accounts: Account[]): Account | null {
  if (!accounts.length) return null;
  const lower = input.toLowerCase();

  // Explicit type keywords first
  if (lower.includes('check')) return accounts.find(a => a.type === 'checking') ?? accounts[0];
  if (lower.includes('sav'))   return accounts.find(a => a.type === 'savings')  ?? accounts[0];
  if (lower.includes('credit') || lower.includes('card')) return accounts.find(a => a.type === 'credit') ?? accounts[0];

  // Masked number or nickname substring
  const byNumber   = accounts.find(a => a.maskedNumber.includes(lower));
  if (byNumber) return byNumber;
  const byNickname = accounts.find(a => lower.includes(a.nickname.toLowerCase().split(' ')[0].toLowerCase()));
  if (byNickname) return byNickname;

  // Fallback: return first account
  return accounts[0];
}

// ── Wire Transfer Flow ────────────────────────────────────────────
const wireSteps: FlowStep[] = [
  {
    field: 'isInternational',
    question: () =>
      `Let's fill the Wire Transfer form together! 🎯\n\n` +
      `**Step 1 of 7:** What type of wire transfer?\n\n` +
      `- **Domestic** — within the USA\n` +
      `- **International** — outside the USA`,
    parse: (input) => {
      const lower = input.toLowerCase();
      const isIntl = lower.includes('int') || lower.includes('abroad') || lower.includes('overseas') || lower.includes('foreign');
      return { value: isIntl, display: isIntl ? 'International' : 'Domestic' };
    },
    chips: () => ['Domestic', 'International'],
  },
  {
    field: 'fromAccount',
    question: (accounts) => {
      const list = accounts.filter(a => a.type !== 'rd')
        .map(a => `- **${a.nickname}** (${a.maskedNumber}) — $${a.availableBalance.toLocaleString()} available`)
        .join('\n');
      return `**Step 2 of 7:** Which account to send from?\n\n${list}`;
    },
    parse: (input, accounts) => {
      const match = matchAccount(input, accounts.filter(a => a.type !== 'rd'));
      return match ? { value: match.maskedNumber, display: `${match.nickname} (${match.maskedNumber})` } : null;
    },
    chips: (accounts) => accounts.filter(a => a.type !== 'rd').map(a => a.nickname),
  },
  {
    field: 'recipientName',
    question: () => `**Step 3 of 7:** What is the **recipient's full legal name**?`,
    parse: (input) => input.trim().length > 1 ? { value: input.trim(), display: input.trim() } : null,
  },
  {
    field: 'recipientBank',
    question: () => `**Step 4 of 7:** What is the **recipient's bank name**?\n\n*(e.g., Chase, Bank of America, Wells Fargo)*`,
    parse: (input) => input.trim().length > 1 ? { value: input.trim(), display: input.trim() } : null,
  },
  {
    field: 'routingNumber',
    question: () => `**Step 5 of 7:** What is the **ABA routing number**? *(9-digit number)*`,
    parse: (input) => {
      const digits = input.replace(/\D/g, '');
      return digits.length === 9 ? { value: digits, display: digits } : null;
    },
    skipIf: (state) => state['isInternational'] === true,
  },
  {
    field: 'swiftCode',
    question: () => `**Step 5 of 7:** What is the **SWIFT / BIC code** of the recipient's bank?`,
    parse: (input) => {
      const code = input.trim().toUpperCase();
      return code.length >= 8 ? { value: code, display: code } : null;
    },
    skipIf: (state) => state['isInternational'] !== true,
  },
  {
    field: 'amount',
    question: () => `**Step 6 of 7:** How much would you like to transfer? *(Enter amount in USD)*`,
    parse: (input) => {
      const num = parseFloat(input.replace(/[^0-9.]/g, ''));
      return num > 0 ? { value: String(num), display: `$${num.toLocaleString()}` } : null;
    },
    chips: () => ['$500', '$1000', '$2500', '$5000'],
  },
  {
    field: 'memo',
    question: () => `**Step 7 of 7:** Add a memo / wire purpose? *(or say "skip")*`,
    parse: (input) => {
      const lower = input.toLowerCase().trim();
      if (lower === 'skip' || lower === 'no' || lower === 'none') return { value: '', display: 'Skipped' };
      return { value: input.trim(), display: input.trim() };
    },
    chips: () => ['Invoice payment', 'Property purchase', 'Business transfer', 'Skip'],
  },
];

// ── ACH Transfer Flow ─────────────────────────────────────────────
const achSteps: FlowStep[] = [
  {
    field: 'fromAccount',
    question: (accounts) => {
      const list = accounts.filter(a => a.type !== 'rd')
        .map(a => `- **${a.nickname}** (${a.maskedNumber}) — $${a.availableBalance.toLocaleString()} available`)
        .join('\n');
      return `Let's fill the ACH Transfer form! 🎯\n\n**Step 1 of 6:** Which account to send from?\n\n${list}`;
    },
    parse: (input, accounts) => {
      const match = matchAccount(input, accounts.filter(a => a.type !== 'rd'));
      return match ? { value: match.maskedNumber, display: `${match.nickname} (${match.maskedNumber})` } : null;
    },
    chips: (accounts) => accounts.filter(a => a.type !== 'rd').map(a => a.nickname),
  },
  {
    field: 'recipientName',
    question: () => `**Step 2 of 6:** What is the **recipient's full name**?`,
    parse: (input) => input.trim().length > 1 ? { value: input.trim(), display: input.trim() } : null,
  },
  {
    field: 'routingNumber',
    question: () => `**Step 3 of 6:** What is the **bank routing number**? *(9 digits — found at bottom-left of a check)*`,
    parse: (input) => {
      const digits = input.replace(/\D/g, '');
      return digits.length === 9 ? { value: digits, display: digits } : null;
    },
  },
  {
    field: 'toAccount',
    question: () => `**Step 4 of 6:** What is the **recipient's account number**?`,
    parse: (input) => {
      const digits = input.replace(/\D/g, '');
      return digits.length >= 4 ? { value: digits, display: `****${digits.slice(-4)}` } : null;
    },
  },
  {
    field: 'amount',
    question: () => `**Step 5 of 6:** How much would you like to transfer?`,
    parse: (input) => {
      const num = parseFloat(input.replace(/[^0-9.]/g, ''));
      return num > 0 ? { value: String(num), display: `$${num.toLocaleString()}` } : null;
    },
    chips: () => ['$500', '$1000', '$2000', '$5000'],
  },
  {
    field: 'memo',
    question: () => `**Step 6 of 6:** Any memo? *(or say "skip")*`,
    parse: (input) => {
      const lower = input.toLowerCase().trim();
      if (lower === 'skip' || lower === 'no' || lower === 'none') return { value: '', display: 'Skipped' };
      return { value: input.trim(), display: input.trim() };
    },
    chips: () => ['Rent payment', 'Utility bill', 'Family transfer', 'Skip'],
  },
];

// ── Zelle Flow ────────────────────────────────────────────────────
const zelleSteps: FlowStep[] = [
  {
    field: 'fromAccount',
    question: (accounts) => {
      const list = accounts.filter(a => a.type === 'checking' || a.type === 'savings')
        .map(a => `- **${a.nickname}** (${a.maskedNumber}) — $${a.availableBalance.toLocaleString()} available`)
        .join('\n');
      return `Let's send money via Zelle! ⚡\n\n**Step 1 of 4:** Which account to send from?\n\n${list}`;
    },
    parse: (input, accounts) => {
      const match = matchAccount(input, accounts.filter(a => a.type === 'checking' || a.type === 'savings'));
      return match ? { value: match.maskedNumber, display: `${match.nickname} (${match.maskedNumber})` } : null;
    },
    chips: (accounts) => accounts.filter(a => a.type === 'checking' || a.type === 'savings').map(a => a.nickname),
  },
  {
    field: 'recipientContact',
    question: () => `**Step 2 of 4:** What is the recipient's **email address** or **mobile phone number**?`,
    parse: (input) => input.trim().length > 4 ? { value: input.trim(), display: input.trim() } : null,
  },
  {
    field: 'amount',
    question: () => `**Step 3 of 4:** How much would you like to send?\n\n*(Daily limit: $2,500)*`,
    parse: (input) => {
      const num = parseFloat(input.replace(/[^0-9.]/g, ''));
      return num > 0 && num <= 2500 ? { value: String(num), display: `$${num.toLocaleString()}` } : null;
    },
    chips: () => ['$50', '$100', '$250', '$500'],
  },
  {
    field: 'memo',
    question: () => `**Step 4 of 4:** Add a note? *(or say "skip")*`,
    parse: (input) => {
      const lower = input.toLowerCase().trim();
      if (lower === 'skip' || lower === 'no' || lower === 'none') return { value: '', display: 'Skipped' };
      return { value: input.trim(), display: input.trim() };
    },
    chips: () => ['Dinner split', 'Rent', 'Gift', 'Skip'],
  },
];

// ── Flow registry ─────────────────────────────────────────────────
const FLOWS: Record<string, FlowStep[]> = {
  'payments/wire': wireSteps,
  'payments/ach': achSteps,
  'payments/zelle': zelleSteps,
};

@Injectable({ providedIn: 'root' })
export class GuidedFlowService {

  hasFlow(screen: string): boolean {
    return screen in FLOWS;
  }

  getSteps(screen: string): FlowStep[] {
    return FLOWS[screen] ?? [];
  }

  /**
   * Finds a step index by matching field name keywords in the user's input.
   * e.g. "fill recipient name" → finds the step with field 'recipientName'
   * Returns -1 if not found.
   */
  findStepByLabel(steps: FlowStep[], input: string): number {
    const lower = input.toLowerCase();
    const keywordMap: Record<string, string[]> = {
      fromAccount:      ['from account', 'source account', 'sending account', 'which account'],
      recipientName:    ['recipient name', 'full name', 'beneficiary name', 'receiver name'],
      recipientBank:    ['bank name', 'recipient bank', 'beneficiary bank'],
      routingNumber:    ['routing', 'aba', 'routing number'],
      swiftCode:        ['swift', 'bic', 'swift code'],
      toAccount:        ['account number', 'recipient account', 'to account'],
      recipientContact: ['email', 'phone', 'mobile', 'contact', 'recipient contact'],
      amount:           ['amount', 'how much', 'transfer amount'],
      memo:             ['memo', 'note', 'purpose', 'reference'],
      isInternational:  ['transfer type', 'domestic', 'international', 'type of wire'],
    };
    for (let i = 0; i < steps.length; i++) {
      const keywords = keywordMap[steps[i].field] ?? [];
      if (keywords.some(kw => lower.includes(kw))) return i;
    }
    return -1;
  }

  /** Returns the active steps (respecting skipIf) */
  getActiveStep(steps: FlowStep[], currentIndex: number, state: Record<string, string | boolean>): { step: FlowStep; index: number } | null {
    for (let i = currentIndex; i < steps.length; i++) {
      const step = steps[i];
      if (!step.skipIf || !step.skipIf(state)) {
        return { step, index: i };
      }
    }
    return null;
  }

  buildSummary(screen: string, filledFields: Record<string, string | boolean>): string {
    const labels: Record<string, string> = {
      isInternational: 'Transfer Type',
      fromAccount: 'From Account',
      recipientName: 'Recipient Name',
      recipientBank: 'Recipient Bank',
      routingNumber: 'Routing Number',
      swiftCode: 'SWIFT Code',
      toAccount: 'Account Number',
      recipientContact: 'Recipient',
      amount: 'Amount',
      memo: 'Memo',
    };
    const screenNames: Record<string, string> = {
      'payments/wire': 'Wire Transfer',
      'payments/ach': 'ACH Transfer',
      'payments/zelle': 'Zelle',
    };
    const lines = Object.entries(filledFields)
      .filter(([, v]) => v !== '' && v !== undefined)
      .map(([k, v]) => {
        let display = String(v);
        if (k === 'isInternational') display = v ? 'International' : 'Domestic';
        if (k === 'amount') display = `$${parseFloat(String(v)).toLocaleString()}`;
        return `- **${labels[k] ?? k}:** ${display}`;
      }).join('\n');

    return `✅ **${screenNames[screen] ?? screen} form filled!**\n\n${lines}\n\n` +
      `Please **review the form** and click the **Submit button** when ready. 🚀`;
  }
}
