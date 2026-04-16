import { Injectable } from '@angular/core';
import { Account } from './api.service';

export interface LocalChatResult {
  text: string;
  navigateTo?: string;
}

// ── Navigation intents ────────────────────────────────────────────
const NAV_INTENTS: { patterns: RegExp[]; route: string; label: string }[] = [
  { patterns: [/wire/i], route: '/payments/wire', label: 'Wire Transfer' },
  { patterns: [/\bach\b|ach\s*transfer/i], route: '/payments/ach', label: 'ACH Transfer' },
  { patterns: [/zelle/i], route: '/payments/zelle', label: 'Zelle' },
  { patterns: [/card\s*pay/i], route: '/payments/card', label: 'Card Payment' },
  { patterns: [/history|past\s*trans/i], route: '/payments/history', label: 'Payment History' },
  { patterns: [/dashboard|go\s*home|home\s*page/i], route: '/dashboard', label: 'Dashboard' },
  { patterns: [/accounts?\s*page|my\s*account|go.*account/i], route: '/accounts', label: 'Accounts' },
  { patterns: [/cards?\s*page|my\s*card|go.*card(?!.*pay)/i], route: '/cards', label: 'Cards' },
  { patterns: [/loans?\s*page|my\s*loan|go.*loan(?!.*apply)/i], route: '/loans', label: 'Loans' },
  { patterns: [/apply.*loan|loan.*apply/i], route: '/loans/apply', label: 'Loan Application' },
  { patterns: [/payments?\s*page|go.*payment/i], route: '/payments/ach', label: 'Payments' },
];

const GO_PREFIX = /^(go\s*to|open|take\s*me\s*to|navigate\s*to|show\s*me|can\s*you\s*go\s*to|switch\s*to)/i;

// ── Banking knowledge responses ───────────────────────────────────
const INTENTS: { patterns: RegExp[]; response: (ctx: string, accounts?: Account[]) => string }[] = [
  {
    patterns: [/^(hi|hello|hey|good\s*(morning|afternoon|evening))/i],
    response: (screen) => `Hello! 👋 I'm **Maya**, your U.S. Bank AI assistant.\n\nYou're on the **${getScreenLabel(screen)}** screen. I can help with:\n- Transfers (ACH, Wire, Zelle)\n- Card payments & balances\n- Loan guidance\n- Account & RD details\n\nWhat can I help you with today?`,
  },
  {
    patterns: [/wire\s*transfer|how.*wire|initiate.*wire|make.*wire/i],
    response: (screen) => (screen === 'payments/wire' ? "You're already here! " : '') +
      `**Wire Transfer Steps:**\n\n1. Select **Domestic** or **International**\n2. Choose **From Account**\n3. Enter **Recipient Full Name**\n4. Enter **Bank Name** & **Routing Number** (domestic) or **SWIFT code** (international)\n5. Enter **Amount** (fee: $25–$55)\n6. Add **Memo/Purpose**\n7. Click **Send Wire Transfer**\n\n⚠️ Wires are **irreversible** — verify all details!\n⏰ Before **4:00 PM CT** = same-day delivery.`,
  },
  {
    patterns: [/\bach\b|ach\s*transfer|how.*ach/i],
    response: (screen) => (screen === 'payments/ach' ? "You're here! " : '') +
      `**ACH Transfer Steps:**\n\n1. Select **From Account**\n2. Enter **Recipient Name**\n3. Enter **Routing Number** (9 digits)\n4. Enter **Account Number**\n5. Enter **Amount**\n6. Add optional **Memo**\n7. Click **Submit ACH Transfer**\n\n📅 Takes **1–3 business days**. Cutoff: **3:00 PM CT**.`,
  },
  {
    patterns: [/zelle|send.*via\s*zelle|how.*zelle/i],
    response: (screen) => (screen === 'payments/zelle' ? "You're here! " : '') +
      `**Zelle Steps:**\n\n1. Enter recipient **email or phone**\n2. Enter **Amount**\n3. Add optional **Memo**\n4. Click **Send with Zelle**\n\n⚡ Instant & free! ⚠️ **Cannot be reversed.**\nLimit: $2,500/day · $20,000/month.`,
  },
  {
    patterns: [/card\s*pay|pay.*credit\s*card|how.*pay.*card|minimum\s*pay/i],
    response: () =>
      `**Card Payment Steps:**\n\n1. Select your **Credit Card**\n2. Choose: **Minimum**, **Full Balance**, or **Custom Amount**\n3. Select **Source Account**\n4. Click **Make Payment**\n\n📅 Posts in **1–2 business days**.\n💡 Pay full balance to avoid interest.`,
  },
  {
    patterns: [/balance|how\s*much|check.*balance|my\s*balance/i],
    response: (_screen, accounts) => {
      if (accounts?.length) {
        const checking = accounts.find(a => a.type === 'checking');
        const savings = accounts.find(a => a.type === 'savings');
        const credit = accounts.find(a => a.type === 'credit');
        return `**Your Current Balances:**\n\n🏦 **Checking:** $${checking?.availableBalance?.toLocaleString() ?? 'N/A'} available\n💰 **Savings:** $${savings?.balance?.toLocaleString() ?? 'N/A'}\n💳 **Credit Balance:** $${credit?.balance?.toLocaleString() ?? 'N/A'}\n\nVisit **Accounts** for full details.`;
      }
      return `Your balances are on the **Dashboard** and **Accounts** page:\n- Checking (real-time)\n- Savings + interest rate\n- Credit card balance & limit\n- RD account details`;
    },
  },
  {
    patterns: [/\brd\b|recurring\s*deposit|fixed\s*deposit|maturity/i],
    response: () =>
      `**Recurring Deposit (RD) Details:**\n\n- Deposit a **fixed amount monthly**\n- Tenure: **6 months – 10 years**\n- Rate: **4.5%–7.5% p.a.**\n- On maturity → credited to savings\n- Early withdrawal: **1% penalty** on interest\n\n📊 Your RD: **$1,500/month · 24 months · 6.5% p.a.**`,
  },
  {
    patterns: [/home\s*loan|mortgage|housing\s*loan/i],
    response: () =>
      `**Home Loan Process:**\n\n1. Go to **Loans → Apply for New Loan**\n2. Enter property details & loan amount\n3. Submit income documents\n4. Credit check (soft pull first)\n5. Loan officer contacts you in **2–3 days**\n6. Approval → Appraisal → Closing\n\n📊 Rate: **~6.75% APR** · Min. credit score: **620**`,
  },
  {
    patterns: [/auto\s*loan|car\s*loan/i],
    response: () => `**Auto Loan:** ~**8.5% APR** · 24–84 months\nInstant pre-approval available online.\nDocuments: ID, income proof, vehicle details.`,
  },
  {
    patterns: [/personal\s*loan/i],
    response: () => `**Personal Loan:** **10.99%–19.99% APR**\nAmounts: $1,000–$50,000 · Terms: 12–60 months\nFunds in **1–2 business days** after approval.`,
  },
  {
    patterns: [/\bemi\b|monthly\s*pay|loan\s*detail|outstanding.*loan|my\s*loan/i],
    response: () =>
      `**Your Home Loan:**\n\n- 🏠 Outstanding: **$287,500**\n- 💰 Monthly EMI: **$2,270.15**\n- 📊 Rate: **6.75% APR**\n- 🏦 Lender: U.S. Bank\n\nSee full details on the **Loans** page.`,
  },
  {
    patterns: [/card\s*detail|reward\s*point|credit\s*limit|available\s*credit|my\s*card/i],
    response: () =>
      `**Your Credit Card (Visa ****4523):**\n\n- 💳 Limit: **$15,000**\n- 💰 Balance: **$3,245.50**\n- ✅ Available: **$11,754.50**\n- 🎁 Reward Points: **12,450 pts**\n- 📅 Min. Payment: **$65.00**\n\nFreeze/unfreeze on the **Cards** page.`,
  },
  {
    patterns: [/freeze|lock\s*card|unfreeze|block\s*card|lost\s*card|stolen/i],
    response: () =>
      `**To Freeze/Unfreeze Card:**\n\n1. Go to **Cards** page\n2. Click the **Freeze/Unfreeze** toggle\n\n🔒 Frozen cards can't be used.\n✅ Unfreeze anytime instantly.\n📞 Lost/stolen: **1-800-285-8585**`,
  },
  {
    patterns: [/transaction|payment\s*history|transfer\s*history/i],
    response: () => `Your **Transaction History** is under **Payments → History**.\nFilter by type (ACH/Wire/Zelle), date range, and status.`,
  },
  {
    patterns: [/help|what\s*can\s*you|features/i],
    response: (screen) =>
      `I'm **Maya** 🤖 Here's what I can do:\n\n💸 **Payments:** ACH · Wire · Zelle · Card\n💰 **Balances:** Checking · Savings · Credit · RD\n🏦 **Loans:** Home · Auto · Personal guidance\n💳 **Cards:** Details · Rewards · Freeze\n🧭 **Navigate:** *"Go to Wire Transfer"*\n📋 **Fill forms:** *"Fill form for me"*\n\n📍 Currently on: **${getScreenLabel(screen)}**`,
  },
];

function getScreenLabel(screen: string): string {
  const map: Record<string, string> = {
    'dashboard': 'Dashboard', 'payments/ach': 'ACH Transfer',
    'payments/wire': 'Wire Transfer', 'payments/zelle': 'Zelle',
    'payments/card': 'Card Payment', 'payments/history': 'Transaction History',
    'accounts': 'Accounts', 'cards': 'Cards', 'loans': 'Loans', 'loans/apply': 'Loan Application',
  };
  return map[screen] ?? screen;
}

@Injectable({ providedIn: 'root' })
export class LocalChatService {

  process(message: string, screen: string, accounts: Account[] = []): LocalChatResult {
    const lower = message.toLowerCase().trim();

    // 1. Navigation intent — "go to X" or just the page name after go-prefix
    const hasGoPrefix = GO_PREFIX.test(lower);
    if (hasGoPrefix) {
      for (const nav of NAV_INTENTS) {
        if (nav.patterns.some(p => p.test(lower))) {
          return {
            text: `Sure! Taking you to **${nav.label}** now. 🚀\n\nFeel free to ask me anything once you're there!`,
            navigateTo: nav.route,
          };
        }
      }
    }

    // 2. Knowledge base intents
    for (const intent of INTENTS) {
      if (intent.patterns.some(p => p.test(lower))) {
        return { text: intent.response(screen, accounts) };
      }
    }

    // 3. Fallback
    const label = getScreenLabel(screen);
    return {
      text: `I'm here to help on the **${label}** screen! 😊\n\nTry asking:\n- *"How do I make a wire transfer?"*\n- *"Go to Wire Transfer"*\n- *"Fill form for me"*\n- *"What is my balance?"*\n\nOr type **help** to see everything I can do.`,
    };
  }
}
