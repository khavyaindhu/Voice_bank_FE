import { Injectable } from '@angular/core';
import { Account } from './api.service';

export interface LocalChatResult {
  text: string;
  navigateTo?: string;
  /** When true the chatbot should start the Emergency Card Response flow */
  emergencyCardFlow?: boolean;
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
  { patterns: [/quick\s*pay|payees?\s*page|saved.*pay|my\s*payees?|go.*payee/i], route: '/payees', label: 'Quick Pay' },
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
    response: (screen) => `Hello! 👋 I'm **Maya**, your U.S. Bank Voice assistant.\n\nYou're on the **${getScreenLabel(screen)}** screen. I can help with:\n- Transfers (ACH, Wire, Zelle)\n- Card payments & balances\n- Loan guidance\n- Account & RD details\n\nWhat can I help you with today?`,
  },

  // ── Transfer type guidance ────────────────────────────────────────
  {
    patterns: [/which\s*transfer|what\s*type.*transfer|difference.*transfer|compare.*transfer|transfer.*compare|best\s*way.*send|which.*payment.*method|when.*use.*wire|when.*use.*ach|when.*use.*zelle/i],
    response: () =>
      `**Choosing the Right Transfer Method:**\n\n` +
      `⚡ **Zelle** — Best for **small P2P payments**\n` +
      `   · Sending money to friends, family, or individuals\n` +
      `   · Amounts up to **$2,500/day** · Instant · Free · Irreversible\n` +
      `   · Example: splitting a restaurant bill, paying a friend back\n\n` +
      `🔄 **ACH Transfer** — Best for **regular & recurring payments**\n` +
      `   · Payroll, rent, vendor invoices, subscriptions, inter-bank transfers\n` +
      `   · Any amount (up to $25,000/day) · 1–3 business days · Usually free\n` +
      `   · Can be reversed within 2 days if needed\n` +
      `   · Example: paying monthly rent, sending payroll to employees\n\n` +
      `🏦 **Wire Transfer** — Best for **high-value & time-critical payments**\n` +
      `   · Real estate purchases, large business payments, international transfers\n` +
      `   · Typically **$10,000+** · Same-day (before 4 PM CT) · Fee: $25–$55\n` +
      `   · Irreversible — verify all details before sending\n` +
      `   · Example: down payment on a property, large vendor settlement\n\n` +
      `💡 **Quick rule:** Friend/small → **Zelle** · Regular/payroll → **ACH** · Large/urgent → **Wire**`,
  },

  {
    patterns: [/send.*money|transfer.*money|how.*send|make.*payment.*to|pay\s+someone/i],
    response: () => recommendTransfer(null, null),
  },

  // ── Individual transfer how-tos ───────────────────────────────────
  {
    patterns: [/wire\s*transfer|how.*wire|initiate.*wire|make.*wire/i],
    response: (screen) => (screen === 'payments/wire' ? "You're already here! " : '') +
      `**Wire Transfer** — For **high-value** transactions ($10,000+)\n\n` +
      `✅ Use when: real estate, large business payments, international transfers, time-critical urgent sends\n\n` +
      `**Steps:**\n1. Select **Domestic** or **International**\n2. Choose **From Account**\n` +
      `3. Enter **Recipient Full Name**\n4. Enter **Routing Number** (domestic) or **SWIFT code** (international)\n` +
      `5. Enter **Amount** · Fee: $25–$55\n6. Add **Memo/Purpose**\n7. Click **Send Wire Transfer**\n\n` +
      `⚠️ Wires are **irreversible** — verify all details!\n⏰ Before **4:00 PM CT** = same-day delivery.`,
  },
  {
    patterns: [/\bach\b|ach\s*transfer|how.*ach/i],
    response: (screen) => (screen === 'payments/ach' ? "You're here! " : '') +
      `**ACH Transfer** — For **payroll, rent, vendor & recurring** payments\n\n` +
      `✅ Use when: paying employees, sending rent, paying recurring invoices, inter-bank transfers\n` +
      `❌ Not for urgent same-day needs (takes 1–3 days)\n\n` +
      `**Steps:**\n1. Select **From Account**\n2. Enter **Recipient Name**\n` +
      `3. Enter **Routing Number** (9 digits)\n4. Enter **Account Number**\n` +
      `5. Enter **Amount**\n6. Add optional **Memo**\n7. Click **Submit ACH Transfer**\n\n` +
      `📅 Takes **1–3 business days**. Cutoff: **3:00 PM CT**. Reversible within 2 days.`,
  },
  {
    patterns: [/zelle|send.*via\s*zelle|how.*zelle/i],
    response: (screen) => (screen === 'payments/zelle' ? "You're here! " : '') +
      `**Zelle** — For **small person-to-person (P2P)** payments\n\n` +
      `✅ Use when: paying a friend back, splitting bills, family transfers, small personal payments\n` +
      `❌ Not for amounts over $2,500/day or payments to businesses you don't know\n\n` +
      `**Steps:**\n1. Enter recipient **email or mobile number**\n` +
      `2. Enter **Amount** (max $2,500/day)\n3. Add optional **Memo**\n4. Click **Send with Zelle**\n\n` +
      `⚡ Instant & free! ⚠️ **Cannot be reversed** — only send to people you trust.\nLimit: $2,500/day · $20,000/month.`,
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
    patterns: [/quick\s*pay|saved\s*pay|my\s*payees?|send.*to\s+\w|pay.*\w+\s+\$\d/i],
    response: () =>
      `**Quick Pay** lets you send money to saved payees in 2 steps — no form filling! 🚀\n\n` +
      `**Voice commands Maya understands:**\n` +
      `- _"Send $500 to Mom"_\n` +
      `- _"Pay ABC Vendors $10,000"_\n` +
      `- _"Transfer $2,200 to Metro Properties"_\n\n` +
      `**First time?** Go to **Quick Pay** in the sidebar to add a payee with their bank details. After that, one voice command does everything.\n\n` +
      `💡 Say *"Go to Quick Pay"* to manage your saved payees.`,
  },
  {
    patterns: [/help|what\s*can\s*you|features/i],
    response: (screen) =>
      `I'm **Maya** 🤖 Here's what I can do:\n\n` +
      `⚡ **Quick Pay:** *"Send $500 to Mom"* — 11 steps → 2 voice commands\n` +
      `💸 **Payments:** ACH · Wire · Zelle · Card\n` +
      `💰 **Balances:** Checking · Savings · Credit · RD\n` +
      `🏦 **Loans:** Home · Auto · Personal guidance\n` +
      `💳 **Cards:** Details · Rewards · Freeze · Emergency\n` +
      `🧭 **Navigate:** *"Go to Wire Transfer"*\n` +
      `📋 **Fill forms:** *"Fill form for me"*\n\n` +
      `📍 Currently on: **${getScreenLabel(screen)}**`,
  },
];

/**
 * Smart transfer recommender.
 * Looks at the dollar amount and context keywords in the user's message
 * and recommends the most appropriate transfer type.
 */
function recommendTransfer(amount: number | null, message: string | null): string {
  const msg = (message ?? '').toLowerCase();

  // Context signals
  const isP2P        = /friend|family|personal|person|split|bill|owe|back|dinner|trip/i.test(msg);
  const isRecurring  = /rent|payroll|salary|monthly|recurring|subscription|vendor|invoice|supplier|employee/i.test(msg);
  const isUrgent     = /urgent|today|same.?day|right\s*now|immediately|asap/i.test(msg);
  const isInternational = /international|overseas|abroad|foreign|swift/i.test(msg);
  const isLargeKeyword  = /property|real\s*estate|down\s*payment|settlement|business\s*pay/i.test(msg);

  // Amount-based thresholds
  const isSmall  = amount !== null && amount <= 2500;
  const isMedium = amount !== null && amount > 2500 && amount < 10000;
  const isLarge  = amount !== null && amount >= 10000;

  if (isInternational || isLargeKeyword || isLarge || (isUrgent && !isP2P)) {
    return `For this type of payment I'd recommend **Wire Transfer** 🏦\n\n` +
      `Wire is best for: high-value amounts ($10,000+), real estate, business settlements, international transfers, or urgent same-day needs.\n\n` +
      `Say *"Go to Wire Transfer"* or *"Fill form for me"* to get started!`;
  }
  if (isRecurring || isMedium) {
    return `For this payment I'd recommend **ACH Transfer** 🔄\n\n` +
      `ACH is best for: payroll, rent, recurring vendor payments, or any inter-bank transfer that doesn't need to arrive same-day.\n\n` +
      `Say *"Go to ACH Transfer"* or *"Fill form for me"* to get started!`;
  }
  if (isP2P || isSmall) {
    return `For this payment I'd recommend **Zelle** ⚡\n\n` +
      `Zelle is best for: small person-to-person payments to friends, family, or individuals you know personally. Instant & free!\n\n` +
      `Say *"Go to Zelle"* or *"Fill form for me"* to get started!`;
  }

  // No strong signal — show comparison
  return `Here's a quick guide to pick the right method:\n\n` +
    `⚡ **Zelle** → Small P2P payments (friends/family, up to $2,500/day) · Instant\n` +
    `🔄 **ACH** → Payroll, rent, recurring vendor payments · 1–3 days · Free\n` +
    `🏦 **Wire** → High-value ($10,000+), real estate, international, urgent · Same-day\n\n` +
    `Tell me the **amount** or **who you're paying** and I can make a specific recommendation!`;
}

function getScreenLabel(screen: string): string {
  const map: Record<string, string> = {
    'dashboard': 'Dashboard', 'payments/ach': 'ACH Transfer',
    'payments/wire': 'Wire Transfer', 'payments/zelle': 'Zelle',
    'payments/card': 'Card Payment', 'payments/history': 'Transaction History',
    'accounts': 'Accounts', 'payees': 'Quick Pay', 'cards': 'Cards',
    'loans': 'Loans', 'loans/apply': 'Loan Application',
    'staff/dashboard': 'Staff Dashboard', 'staff/customers': 'Customer Search',
    'staff/fms': 'FMS Account Lookup', 'staff/cards': 'Card Services', 'staff/reports': 'Reports',
  };
  return map[screen] ?? screen;
}

@Injectable({ providedIn: 'root' })
export class LocalChatService {

  process(message: string, screen: string, accounts: Account[] = []): LocalChatResult {
    const lower = message.toLowerCase().trim();

    // Note: lost/stolen/freeze-my-card intents are intercepted directly in
    // ChatbotComponent.sendMessage() before this service is called, so they
    // will never reach this method.

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

    // 2. Smart amount-based transfer recommender
    // Catches: "I want to send $500 to my friend", "need to transfer $50000 for property"
    const amountMatch = lower.match(/\$\s*([\d,]+(?:\.\d+)?)|(\d[\d,]+(?:\.\d+)?)\s*(?:dollar|usd|buck)/);
    const hasTransferContext = /send|transfer|pay(?:ment)?|move.*money/i.test(lower);
    if (amountMatch && hasTransferContext) {
      const amount = parseFloat((amountMatch[1] || amountMatch[2]).replace(/,/g, ''));
      return { text: recommendTransfer(amount, lower) };
    }

    // 3. Knowledge base intents
    for (const intent of INTENTS) {
      if (intent.patterns.some(p => p.test(lower))) {
        return { text: intent.response(screen, accounts) };
      }
    }

    // 4. Fallback
    const label = getScreenLabel(screen);
    return {
      text: `I'm here to help on the **${label}** screen! 😊\n\nTry asking:\n- *"Which transfer should I use?"*\n- *"I need to send $500 to a friend"*\n- *"Go to Wire Transfer"*\n- *"Fill form for me"*\n\nOr type **help** to see everything I can do.`,
    };
  }
}
