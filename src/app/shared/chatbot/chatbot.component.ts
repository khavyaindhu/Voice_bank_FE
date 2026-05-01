import { Component, OnInit, OnDestroy, signal, ViewChild, ElementRef, AfterViewChecked, computed, Input } from '@angular/core';
import type { AppRole } from '../../layout/layout.component';
import { lastValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { marked } from 'marked';
import { ApiService, Account } from '../../core/services/api.service';
import { ScreenContextService } from '../../core/services/screen-context.service';
import { AuthService } from '../../core/services/auth.service';
import { FormFillService } from '../../core/services/form-fill.service';
import { GuidedFlowService, FlowStep } from '../../core/services/guided-flow.service';
import { LocalChatService } from '../../core/services/local-chat.service';
import { EmergencyCardService } from '../../core/services/emergency-card.service';
import { PayeeService, Payee } from '../../core/services/payee.service';
import { StaffContextService } from '../../core/services/staff-context.service';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  htmlContent?: string;
  timestamp: Date;
  screenContext?: string;
  /** Special bubble types for interactive widgets */
  type?: 'normal' | 'emergency-options' | 'quick-pay-confirm';
  /** Attached quick-pay payload for the confirm widget */
  quickPay?: { payee: Payee; amount: number; fromAccountId: string };
}

/** One of the three emergency card actions */
export interface EmergencyAction {
  id:          'freeze' | 'dispute' | 'replacement';
  number:      number;
  icon:        string;
  title:       string;
  subtitle:    string;
  selected:    boolean;
  status:      'idle' | 'processing' | 'done';
  resultDetail: string;
}

interface QuickAction {
  label: string;
  prompt: string;
}

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chatbot.component.html',
  styleUrl: './chatbot.component.scss',
})
export class ChatbotComponent implements OnInit, OnDestroy, AfterViewChecked {
  @Input() role: AppRole = 'customer';

  @ViewChild('messagesContainer') messagesContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('inputField') inputField!: ElementRef<HTMLInputElement>;

  isOpen = signal(false);
  isMinimized = signal(false);
  messages = signal<ChatMessage[]>([]);
  inputText = signal('');
  isLoading = signal(false);
  sessionId = signal<string | null>(null);
  isListening = signal(false);
  isSpeaking = signal(false);
  autoSpeak = signal(false);
  accounts = signal<Account[]>([]);

  // Guided form-fill flow state
  guidedFlowActive = signal(false);
  guidedFlowChips = signal<string[]>([]);
  private flowSteps: FlowStep[] = [];
  private flowStepIndex = 0;
  private flowFilledFields: Record<string, string | boolean> = {};

  // ── Emergency Card Response flow state ──────────────────────────
  emergencyFlowActive  = signal(false);
  emergencyExecuting   = signal(false);
  emergencyActions     = signal<EmergencyAction[]>([]);

  // ── Quick Pay flow state ─────────────────────────────────────────
  /** Set while waiting for user to confirm a quick-pay from Maya */
  quickPayPending = signal<{ payee: Payee; amount: number } | null>(null);
  quickPayExecuting = signal(false);

  /** True when no action card is selected — used to disable the "Execute Selected" button. */
  get noActionsSelected(): boolean {
    return this.emergencyActions().every(a => !a.selected);
  }

  private shouldScrollToBottom = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognition: any = null;
  private synth = window.speechSynthesis;

  readonly customerQuickActions: QuickAction[] = [
    { label: '⚡ Send $500 to Father',             prompt: 'Maya, send $500 to Father' },
    { label: '💸 Pay Vijaya $10,000',              prompt: 'Maya, send $10000 to Vijaya' },
    { label: '🚨 Lost / Stolen Card',              prompt: 'Maya, I lost my card' },
    { label: '💳 How to make a Wire Transfer?',    prompt: 'How do I make a wire transfer?' },
    { label: '⚡ Send money via Zelle',             prompt: 'How do I send money with Zelle?' },
    { label: '🏠 Apply for a Home Loan',            prompt: 'How do I apply for a home loan? What are the steps?' },
    { label: '💰 Check my balance',                prompt: 'What are my current account balances?' },
    { label: '📊 Loan EMI information',             prompt: 'What are my current loan details and EMI amount?' },
  ];

  readonly staffQuickActions: QuickAction[] = [
    { label: '🔍 Search customer Ramesh',          prompt: 'Search customer Ramesh' },
    { label: '🔍 Find customer Vijaya',             prompt: 'Find customer Vijaya' },
    { label: '📊 Show Agni test transactions',      prompt: 'Show Agni test transactions' },
    { label: '📊 FMS Currency & Coin account',      prompt: 'Open Currency & Coin transactions' },
    { label: '📊 Salary & Wages this month',        prompt: 'Show Salary & Wages transactions current month' },
    { label: '🏠 Go to Staff Dashboard',            prompt: 'Go to staff dashboard' },
    { label: '💳 Open Card Services',               prompt: 'Open card services' },
    { label: '📈 Open Reports',                     prompt: 'Open reports' },
  ];

  get quickActions(): QuickAction[] {
    return this.role === 'staff' ? this.staffQuickActions : this.customerQuickActions;
  }

  screenLabel = computed(() => {
    const labels: Record<string, string> = {
      // Customer screens
      'dashboard':          'Dashboard',
      'payments/ach':       'ACH Transfer',
      'payments/wire':      'Wire Transfer',
      'payments/zelle':     'Zelle',
      'payments/card':      'Card Payment',
      'payments/history':   'Transaction History',
      'accounts':           'Accounts',
      'payees':             'Quick Pay',
      'cards':              'Cards',
      'loans':              'Loans',
      'loans/apply':        'Loan Application',
      // Staff screens
      'staff/dashboard':    'Staff Dashboard',
      'staff/customers':    'Customer Search',
      'staff/fms':          'FMS Account Lookup',
      'staff/cards':        'Card Services',
      'staff/reports':      'Reports',
    };
    return labels[this.screenCtx.currentScreen()] ?? this.screenCtx.currentScreen();
  });

  constructor(
    private api: ApiService,
    private router: Router,
    public screenCtx: ScreenContextService,
    public auth: AuthService,
    private formFill: FormFillService,
    public guidedFlow: GuidedFlowService,
    private localChat: LocalChatService,
    public emergencyCard: EmergencyCardService,
    public payeeSvc: PayeeService,
    private staffCtx: StaffContextService,
  ) {}

  ngOnInit(): void {
    this.api.getAccounts().subscribe({ next: a => this.accounts.set(a), error: () => {} });
    // Pre-load payees so Maya can do Quick Pay from any screen
    this.payeeSvc.load();
    this.initSpeechRecognition();
  }

  ngOnDestroy(): void {
    this.recognition?.abort();
    this.synth.cancel();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  toggleChat(): void {
    this.isOpen.update(v => !v);
    if (this.isOpen() && this.messages().length === 0) {
      this.addWelcome();
    }
  }

  private addWelcome(): void {
    const name = this.auth.currentUser()?.fullName?.split(' ')[0] ?? 'there';
    const isStaff = this.role === 'staff';
    const greeting = isStaff
      ? `Hi ${name}! 👋 I'm **Maya**, your U.S. Bank Staff Assistant.\n\nYou're on the **${this.screenLabel()}** screen. I can help you with:\n- FMS account & transaction lookup\n- Customer search by name or ID\n- Card freeze / dispute queries\n- ACH batch status & reports\n\nTry: _"Show Agni Test transactions for April"_ or _"Search customer Vijaya"_`
      : `Hi ${name}! 👋 I'm **Maya**, your U.S. Bank AI assistant.\n\nI can see you're on the **${this.screenLabel()}** screen. I'm here to help you with:\n- Transfers (ACH, Wire, Zelle)\n- Card payments & balance enquiries\n- Loan applications & EMI details\n- Account & RD information\n\nWhat can I help you with today?`;
    this.addAssistantMessage(greeting);
  }

  // ── Guided Flow Methods ──────────────────────────────────────────

  startGuidedFlow(): void {
    const screen = this.screenCtx.currentScreen();
    if (!this.guidedFlow.hasFlow(screen)) return;
    this.flowSteps = this.guidedFlow.getSteps(screen);
    this.flowStepIndex = 0;
    this.flowFilledFields = {};
    this.guidedFlowActive.set(true);

    // Ensure accounts are loaded before asking the first step
    if (this.accounts().length === 0) {
      this.addAssistantMessage('⏳ Loading your account details...');
      this.api.getAccounts().subscribe({
        next: a => { this.accounts.set(a); this.askNextFlowStep(); },
        error: () => this.askNextFlowStep(),
      });
    } else {
      this.askNextFlowStep();
    }
  }

  private askNextFlowStep(): void {
    const screen = this.screenCtx.currentScreen();
    const result = this.guidedFlow.getActiveStep(this.flowSteps, this.flowStepIndex, this.flowFilledFields);
    if (!result) {
      // All steps done
      this.guidedFlowActive.set(false);
      this.guidedFlowChips.set([]);
      const summary = this.guidedFlow.buildSummary(screen, this.flowFilledFields);
      this.addAssistantMessage(summary);
      return;
    }
    this.flowStepIndex = result.index;
    const chips = result.step.chips ? result.step.chips(this.accounts(), this.flowFilledFields) : [];
    this.guidedFlowChips.set(chips);
    const question = result.step.question(this.accounts(), this.flowFilledFields);
    this.addAssistantMessage(question);
  }

  private handleFlowAnswer(msg: string): boolean {
    if (!this.guidedFlowActive()) return false;

    const lower = msg.toLowerCase().trim();
    const screen = this.screenCtx.currentScreen();
    const result = this.guidedFlow.getActiveStep(this.flowSteps, this.flowStepIndex, this.flowFilledFields);
    if (!result) return false;

    // ── Skip / abort commands ─────────────────────────────────────
    if (/^(skip|next|pass|move on|skip this|continue|go next)$/i.test(lower)) {
      this.flowStepIndex = result.index + 1;
      this.guidedFlowChips.set([]);
      this.askNextFlowStep();
      return true;
    }

    if (/^(stop|cancel|abort|exit|quit|end)$/i.test(lower)) {
      this.guidedFlowActive.set(false);
      this.guidedFlowChips.set([]);
      this.addAssistantMessage(`Form fill cancelled. Feel free to ask me anything! 😊`);
      return true;
    }

    // ── Step-jump: "step 3", "go to step 4", "switch to step 2" ──
    const stepJump = lower.match(/(?:step|switch.*step|go.*step|jump.*step)\s*(\d)/);
    if (stepJump) {
      const target = parseInt(stepJump[1], 10) - 1; // 0-based
      if (target >= 0 && target < this.flowSteps.length) {
        this.flowStepIndex = target;
        this.guidedFlowChips.set([]);
        this.askNextFlowStep();
        return true;
      }
    }

    // ── Field-name jump: "fill recipient name", "recipient name please" ──
    const fieldJump = this.guidedFlow.findStepByLabel(this.flowSteps, lower);
    if (fieldJump !== -1) {
      this.flowStepIndex = fieldJump;
      this.guidedFlowChips.set([]);
      this.askNextFlowStep();
      return true;
    }

    // ── Normal answer: parse the response ────────────────────────
    const parsed = result.step.parse(msg, this.accounts(), this.flowFilledFields);
    if (!parsed) {
      const chips = result.step.chips ? result.step.chips(this.accounts(), this.flowFilledFields) : [];
      this.guidedFlowChips.set(chips);
      const hint = chips.length
        ? `\n\nChoose one of the options above, or type your answer directly.`
        : `\n\n💡 Type **skip** to skip this field, or **cancel** to stop.`;
      this.addAssistantMessage(
        `⚠️ I didn't catch that. Please answer the current question:\n\n` +
        result.step.question(this.accounts(), this.flowFilledFields) + hint
      );
      return true;
    }

    // Store and emit fill event
    this.flowFilledFields[result.step.field] = parsed.value;
    this.formFill.emit(result.step.field, parsed.value, screen);

    // Advance to next step
    this.flowStepIndex = result.index + 1;
    this.guidedFlowChips.set([]);
    this.askNextFlowStep();
    return true;
  }

  sendMessage(text?: string): void {
    const msg = (text ?? this.inputText()).trim();
    if (!msg || this.isLoading()) return;

    this.inputText.set('');
    const screen = this.screenCtx.currentScreen();

    this.messages.update(msgs => [...msgs, {
      role: 'user', content: msg, timestamp: new Date(), screenContext: screen,
    }]);
    this.shouldScrollToBottom = true;

    // ── Emergency card flow: intercept active-flow replies ───────────
    if (this.handleEmergencyCardResponse(msg)) return;

    // ── Emergency card flow: detect trigger phrases ───────────────────
    // Checked here (before localChat.process) so it can never be shadowed
    // by a pattern in the INTENTS array (e.g. "my card" or "freeze").
    const isCardEmergency =
      /lost.*(?:my\s+)?card|(?:my\s+)?card.*(?:is\s+)?lost/i.test(msg)   ||
      /stolen.*(?:my\s+)?card|(?:my\s+)?card.*(?:was\s+|is\s+)?stolen/i.test(msg) ||
      /missing.*(?:my\s+)?card|(?:my\s+)?card.*(?:is\s+)?missing/i.test(msg) ||
      /freeze\s+my\s+card|block\s+my\s+card|lock\s+my\s+card/i.test(msg)  ||
      /unauthorized.*charg|someone.*used.*my\s+card|card.*compromised/i.test(msg);
    if (isCardEmergency) {
      this.startEmergencyCardFlow();
      return;
    }

    // ── Staff intents: navigate + pre-fill staff screens ────────────
    if (this.role === 'staff' && this.handleStaffIntent(msg)) return;

    // ── Quick Pay: intercept active-flow replies ─────────────────────
    if (this.handleQuickPayResponse(msg)) return;

    // ── Quick Pay: detect "send $X to [payee]" trigger ───────────────
    // Pattern: send/pay/transfer + dollar amount + to + payee name
    const qpMatch = msg.match(
      /(?:send|pay|transfer|wire)\s+\$?([\d,]+(?:\.\d+)?)\s+(?:to|for)\s+(.+)/i
    ) ?? msg.match(
      /(?:send|pay|transfer|wire)\s+(?:to\s+)?(.+?)\s+\$?([\d,]+(?:\.\d+)?)/i
    );
    if (qpMatch) {
      // First pattern: amount is group 1, name is group 2
      // Second pattern: name is group 1, amount is group 2
      const isFirstPattern = /(?:send|pay|transfer|wire)\s+\$?[\d]/i.test(msg);
      const amountStr = (isFirstPattern ? qpMatch[1] : qpMatch[2]).replace(/,/g, '');
      const nameStr   = (isFirstPattern ? qpMatch[2] : qpMatch[1]).trim();
      const amount    = parseFloat(amountStr);
      if (amount > 0 && nameStr) {
        const payee = this.payeeSvc.findByName(nameStr);
        if (payee) {
          this.startQuickPayFlow(payee, amount);
          return;
        }
        // Payee not found — helpful suggestion
        this.addAssistantMessage(
          `I couldn't find a saved payee matching **"${nameStr}"**.\n\n` +
          `Your saved payees are:\n` +
          this.payeeSvc.payees().map(p => `- **${p.nickname}** (${p.bankName})`).join('\n') +
          `\n\nOr go to **Quick Pay** to add a new payee, then send instantly!`
        );
        return;
      }
    }

    // ── If guided flow is active, handle locally without calling BE ──
    if (this.handleFlowAnswer(msg)) return;

    // ── Check for "fill form" trigger keywords ────────────────────
    const fillTrigger = /fill\s*form|guide\s*me|start\s*form|help.*fill|fill.*for\s*me|let'?s\s*go|assist.*form/i.test(msg);
    if (fillTrigger && this.guidedFlow.hasFlow(screen)) {
      this.startGuidedFlow();
      return;
    }

    // ── Process locally — no backend call needed ──────────────────
    const result = this.localChat.process(msg, screen, this.accounts());
    this.addAssistantMessage(result.text);
    if (result.navigateTo) {
      setTimeout(() => this.router.navigate([result.navigateTo!]), 1000);
    }
  }

  // ── Emergency Card Response ──────────────────────────────────────────────

  /** Kick off the emergency card response flow. */
  startEmergencyCardFlow(): void {
    const card = this.emergencyCard.card;
    this.emergencyFlowActive.set(true);
    this.emergencyExecuting.set(false);

    this.emergencyActions.set([
      {
        id:           'freeze',
        number:       1,
        icon:         '🔒',
        title:        `Freeze your ${card.type} ****${card.last4} right now`,
        subtitle:     'Block all new transactions instantly — reversible anytime',
        selected:     true,
        status:       'idle',
        resultDetail: '',
      },
      {
        id:           'dispute',
        number:       2,
        icon:         '📋',
        title:        'File a dispute for recent unrecognized charges',
        subtitle:     'Investigate & refund unauthorized transactions (7–10 days)',
        selected:     true,
        status:       'idle',
        resultDetail: '',
      },
      {
        id:           'replacement',
        number:       3,
        icon:         '📦',
        title:        'Request a replacement card',
        subtitle:     `New card mailed to your address on file — arrives in 3–5 business days`,
        selected:     true,
        status:       'idle',
        resultDetail: '',
      },
    ]);

    // Maya's initial acknowledgement
    this.addAssistantMessage(
      `🚨 **I'll take care of this immediately!**\n\n` +
      `Your **${card.type} ****${card.last4}** may be compromised. Should I:`
    );

    // Append the interactive card options widget
    this.messages.update(msgs => [...msgs, {
      role:        'assistant' as const,
      content:     '',
      htmlContent: '',
      timestamp:   new Date(),
      type:        'emergency-options' as const,
    }]);
    this.shouldScrollToBottom = true;
  }

  // ── Staff Intent Detection ───────────────────────────────────────────────

  /**
   * Handles staff-mode voice/text commands that navigate to staff pages
   * and pre-fill the search context via StaffContextService.
   * Returns true if the message was handled (caller should return early).
   */
  private handleStaffIntent(msg: string): boolean {
    const lower = msg.toLowerCase().trim();

    // ── Customer Search ──────────────────────────────────────────────
    // Patterns: "search customer Ramesh", "find customer Vijaya", "look up Kavya", "show me customer CUST-001"
    const custRx = /(?:search|find|look\s*up|open|show(?:\s+me)?)\s+(?:customer\s+)?([a-z0-9 .'-]+?)(?:\s+(?:customer|account|profile|details?))?$/i;
    const custMatch = lower.match(custRx);
    if (custMatch && (
      /customer|client|cust/i.test(lower) ||
      /^(?:search|find|look\s*up)\s+[a-z]/i.test(lower)
    )) {
      const name = custMatch[1].trim();
      this.staffCtx.setCustomerSearch(name);
      this.addAssistantMessage(
        `🔍 Searching for customer **"${name}"**...\n\nNavigating to Customer Search and pre-filling the query.`
      );
      setTimeout(() => this.router.navigate(['/staff/customers']), 800);
      return true;
    }

    // ── Reports: summary / transactions by date range ────────────────
    // Must be checked BEFORE FMS so "show last week transactions" doesn't go to FMS
    // Patterns: "show current month summary", "show last month summary",
    //           "show transactions for Vijaya current month", "show last week transactions",
    //           "show last 3 months summary", "show YTD report"
    const isReportCmd =
      /(?:summary|report|overview)/i.test(lower) ||
      /transactions?\s+for\s+/i.test(lower) ||
      // "[name] transactions [period]" e.g. "show Ramesh transactions last month"
      /\b\w+\s+transactions?\s+(?:last|current|this|ytd|year|month|week)/i.test(lower) ||
      // "show last/current/ytd..." not targeting an FMS account number
      (/show\s+(?:last|current|this|ytd|year)/i.test(lower) && !/fms|ledger|\b91\d{6}\b/i.test(lower));

    if (isReportCmd) {
      // Detect date preset
      let reportPreset = 'ytd';
      if      (/current\s*month|this\s*month|april/i.test(lower))        reportPreset = 'currentmonth';
      else if (/last\s*month|previous\s*month|march/i.test(lower))       reportPreset = 'lastmonth';
      else if (/last\s*week|past\s*7\s*days?/i.test(lower))              reportPreset = 'lastweek';
      else if (/last\s*3\s*months?|last\s*three\s*months?/i.test(lower)) reportPreset = 'last3months';
      else if (/ytd|year\s*to\s*date|this\s*year/i.test(lower))          reportPreset = 'ytd';

      // Detect customer — two patterns:
      // 1. "transactions for [name]..."   2. "show [name] transactions..."
      const custForMatch =
        lower.match(/transactions?\s+for\s+([a-z][a-z ]{1,30}?)(?:\s+(?:current|last|this|ytd|year|month|week|summary)|$)/i) ??
        lower.match(/show\s+([a-z][a-z ]{2,30}?)\s+transactions?/i);
      const reportCustomer = custForMatch?.[1]?.trim() ?? '';

      // Detect section
      const reportSection = /transaction/i.test(lower) ? 'transactions' : 'overview';

      const presetLabel: Record<string, string> = {
        currentmonth: 'current month', lastmonth: 'last month',
        lastweek: 'last 7 days', last3months: 'last 3 months', ytd: 'year to date',
      };

      this.staffCtx.setReport(reportPreset, reportCustomer, reportSection);
      this.addAssistantMessage(
        `📈 Opening **Reports** — ${presetLabel[reportPreset]}` +
        (reportCustomer ? ` for **${reportCustomer}**` : '') +
        `...\n\nLoading ${reportSection === 'transactions' ? 'transaction detail' : 'summary'} now.`
      );
      setTimeout(() => this.router.navigate(['/staff/reports']), 600);
      return true;
    }

    // ── FMS Account / Transactions ───────────────────────────────────
    // Patterns: "show Agni test transactions", "open FMS account 91000038",
    //           "show current month transactions for Currency", "load Agni transactions for March"
    const fmsRx = /(?:show|open|find|get|load|pull\s*up)\s+(?:fms\s+(?:account\s+)?)?(.+?)\s+(?:transactions?|account|ledger|entries)/i;
    const fmsMatch = msg.match(fmsRx);
    if ((fmsMatch || /fms|ledger|account\s+\d{8}/i.test(lower)) &&
        !/customer|client/i.test(lower) &&
        !/summary|report|\bfor\s+[a-z]/i.test(lower) &&
        !/last\s+(?:week|month)|current\s+month|ytd/i.test(lower)) {
      let searchTerm = '';
      if (fmsMatch) {
        searchTerm = fmsMatch[1].trim();
      } else {
        // "open FMS account 91000038" — extract account number or keyword
        const numMatch = lower.match(/\b(91\d{6})\b/);
        const keyMatch = lower.match(/(?:fms\s+(?:account\s+)?|account\s+)([a-z0-9 &]+)/i);
        searchTerm = numMatch?.[1] ?? keyMatch?.[1]?.trim() ?? '';
      }

      // Detect date preset from the message
      let preset: 'current' | 'previous' | 'ytd' | '' = '';
      if (/current\s*month|this\s*month|april/i.test(lower))  preset = 'current';
      else if (/last\s*month|previous\s*month|march/i.test(lower)) preset = 'previous';
      else if (/ytd|year\s*to\s*date|this\s*year/i.test(lower))   preset = 'ytd';
      else if (/transact|history|ledger/i.test(lower))             preset = 'current'; // default to current month

      this.staffCtx.setFmsSearch(searchTerm, preset);

      const presetLabel = preset === 'current' ? ' (current month)' :
                          preset === 'previous' ? ' (previous month)' :
                          preset === 'ytd'     ? ' (year-to-date)'   : '';

      this.addAssistantMessage(
        `📊 Opening FMS Account Lookup for **"${searchTerm}"**${presetLabel}...\n\nNavigating and loading transactions.`
      );
      setTimeout(() => this.router.navigate(['/staff/fms']), 800);
      return true;
    }

    // ── Card: Freeze / Unfreeze a specific customer's card ───────────
    // "freeze Vijaya's card", "freeze ABC vendors card", "unfreeze Ramesh card"
    const freezeRx = /(?:freeze|block|lock|unfreeze|unlock)\s+(.+?)'?s?\s+card/i;
    const freezeMatch = msg.match(freezeRx);
    if (freezeMatch) {
      const target = freezeMatch[1].trim();
      const action = /unfreeze|unlock/i.test(lower) ? 'unfreeze' : 'freeze';
      this.staffCtx.setCardFreeze(target);
      this.addAssistantMessage(
        `🔒 ${action === 'freeze' ? 'Freezing' : 'Unfreezing'} card for **"${target}"**...\n\nNavigating to Card Services and executing now.`
      );
      setTimeout(() => this.router.navigate(['/staff/cards']), 600);
      return true;
    }

    // ── Card: Filter by status ────────────────────────────────────────
    // "show frozen cards", "show disputed cards", "show cards expiring soon", "show active cards"
    const cardFilterRx = /show\s+(?:all\s+)?(?:the\s+)?(frozen|disputed|expiring(?:\s+soon)?|active)\s+cards?/i;
    const cardFilterMatch = lower.match(cardFilterRx);
    if (cardFilterMatch) {
      let tab = cardFilterMatch[1].toLowerCase();
      if (tab.startsWith('expiring')) tab = 'expiring';
      this.staffCtx.setCardFilter(tab);
      this.addAssistantMessage(
        `💳 Filtering Card Services to show **${tab}** cards...`
      );
      setTimeout(() => this.router.navigate(['/staff/cards']), 500);
      return true;
    }

    // ── Card: Generic navigation ──────────────────────────────────────
    if (/(?:go\s+to|open|show)\s+card\s+services?/i.test(lower) ||
        /card\s+(?:management|admin|lookup)/i.test(lower) ||
        /show\s+(?:all\s+)?cards?$/i.test(lower)) {
      this.staffCtx.setCardFilter('all');
      this.addAssistantMessage(`💳 Navigating to **Card Services**...`);
      setTimeout(() => this.router.navigate(['/staff/cards']), 500);
      return true;
    }

    // ── Staff Dashboard ──────────────────────────────────────────────
    if (/(?:go\s+to|open|show)\s+(?:staff\s+)?dashboard/i.test(lower) ||
        /staff\s+(?:home|main|overview)/i.test(lower)) {
      this.addAssistantMessage(`🏠 Navigating to **Staff Dashboard**...`);
      setTimeout(() => this.router.navigate(['/staff/dashboard']), 500);
      return true;
    }

    // ── Reports ──────────────────────────────────────────────────────
    if (/(?:go\s+to|open|show)\s+reports?/i.test(lower) ||
        /staff\s+reports?/i.test(lower)) {
      this.addAssistantMessage(`📈 Navigating to **Reports**...`);
      setTimeout(() => this.router.navigate(['/staff/reports']), 500);
      return true;
    }

    return false;
  }

  /** Toggle an individual action card on/off. */
  toggleEmergencyAction(id: 'freeze' | 'dispute' | 'replacement'): void {
    if (this.emergencyExecuting()) return;
    this.emergencyActions.update(actions =>
      actions.map(a => a.id === id ? { ...a, selected: !a.selected } : a)
    );
  }

  /** Select all three and execute immediately. */
  selectAllAndExecute(): void {
    this.emergencyActions.update(actions => actions.map(a => ({ ...a, selected: true })));
    this.executeSelected();
  }

  /** Execute whichever actions are currently selected. */
  async executeSelected(): Promise<void> {
    const selected = this.emergencyActions().filter(a => a.selected);
    if (!selected.length) return;

    this.emergencyExecuting.set(true);

    // Mark all selected as processing simultaneously
    this.emergencyActions.update(actions =>
      actions.map(a => a.selected ? { ...a, status: 'processing' as const } : a)
    );

    // Run all actions in parallel — each resolves and updates independently
    const resultLines: (string | null)[] = await Promise.all(
      selected.map(async action => {
        try {
          switch (action.id) {
            case 'freeze': {
              await this.emergencyCard.freezeCard();
              this.emergencyActions.update(acts =>
                acts.map(a => a.id === 'freeze'
                  ? { ...a, status: 'done' as const, resultDetail: 'Blocked instantly' }
                  : a)
              );
              return `🔒 **Card frozen** — Visa ****${this.emergencyCard.card.last4} is now blocked`;
            }
            case 'dispute': {
              const ref = await this.emergencyCard.fileDispute();
              this.emergencyActions.update(acts =>
                acts.map(a => a.id === 'dispute'
                  ? { ...a, status: 'done' as const, resultDetail: `Ref: ${ref}` }
                  : a)
              );
              return `📋 **Dispute filed** — Reference **${ref}** (resolved in 7–10 business days)`;
            }
            case 'replacement': {
              const eta = await this.emergencyCard.requestReplacement();
              this.emergencyActions.update(acts =>
                acts.map(a => a.id === 'replacement'
                  ? { ...a, status: 'done' as const, resultDetail: `Arrives in ${eta}` }
                  : a)
              );
              return `📦 **Replacement requested** — New card arrives in **${eta}**`;
            }
            default: return null;
          }
        } catch {
          this.emergencyActions.update(acts =>
            acts.map(a => a.id === action.id ? { ...a, status: 'idle' as const } : a)
          );
          return null;
        }
      })
    );

    this.emergencyFlowActive.set(false);
    this.emergencyExecuting.set(false);

    const lines  = resultLines.filter(Boolean) as string[];
    const header = lines.length === 3
      ? `✅ **Done. All three actions completed!**`
      : `✅ **Done! ${lines.length} action${lines.length > 1 ? 's' : ''} completed.**`;

    this.addAssistantMessage(
      `${header}\n\n` +
      lines.join('\n') +
      `\n\n📱 You'll receive an **SMS & email confirmation** shortly.\n` +
      `📞 Need immediate help? **1-800-285-8585**\n\n` +
      `_Stay safe — we've got you covered. 🛡️_`
    );
  }

  /**
   * Intercept user messages while emergency flow is active.
   * Parses "yes all three", "just freeze", "cancel", etc.
   * Returns true if the message was consumed by the emergency flow.
   */
  private handleEmergencyCardResponse(msg: string): boolean {
    if (!this.emergencyFlowActive() || this.emergencyExecuting()) return false;

    const lower = msg.toLowerCase().trim();

    // Cancel
    if (/^(cancel|stop|abort|never\s*mind|exit|no|nope)$/.test(lower)) {
      this.emergencyFlowActive.set(false);
      this.addAssistantMessage(
        `No problem — your card has **not** been changed.\n\n` +
        `If you need help later, just say **"I lost my card"**.\n` +
        `📞 Urgent? Call **1-800-285-8585** anytime.`
      );
      return true;
    }

    // All three
    if (/\b(yes|all|all\s*three|everything|do\s*(it\s*)?all|go\s*ahead|confirm|proceed|execute|run\s*all|sure|yep|yeah|absolutely)\b/.test(lower)) {
      this.selectAllAndExecute();
      return true;
    }

    // Specific selection by keyword
    const wantsFreeze      = /freeze|lock|block|stop.*card|option\s*1|\b1\b/.test(lower);
    const wantsDispute     = /dispute|charg|unauthorized|unrecognized|fraudul|option\s*2|\b2\b/.test(lower);
    const wantsReplacement = /replace|new\s*card|replacement|deliver|ship|option\s*3|\b3\b/.test(lower);

    if (wantsFreeze || wantsDispute || wantsReplacement) {
      this.emergencyActions.update(actions => actions.map(a => ({
        ...a,
        selected: (a.id === 'freeze'       && wantsFreeze)      ||
                  (a.id === 'dispute'      && wantsDispute)     ||
                  (a.id === 'replacement'  && wantsReplacement),
      })));
      this.executeSelected();
      return true;
    }

    // Unrecognised response
    this.addAssistantMessage(
      `I didn't quite catch that. You can:\n\n` +
      `- Say **"Yes, all three"** to execute all actions at once\n` +
      `- Say **"Just freeze"** / **"Freeze and replacement"** for specific actions\n` +
      `- Click the action cards above to select/deselect, then press **Execute**\n` +
      `- Say **"Cancel"** to leave the card as-is`
    );
    return true;
  }

  // ── Quick Pay Flow ───────────────────────────────────────────────────────────

  /** Show the quick-pay confirm widget in the chat. */
  startQuickPayFlow(payee: Payee, amount: number): void {
    this.quickPayPending.set({ payee, amount });

    // If accounts haven't loaded yet, fetch them first then show widget
    if (this.accounts().length === 0) {
      this.addAssistantMessage('⏳ Loading your account details…');
      this.api.getAccounts().subscribe({
        next: a => {
          this.accounts.set(a);
          this._showQuickPayWidget(payee, amount);
        },
        error: () => {
          this.quickPayPending.set(null);
          this.addAssistantMessage('❌ Unable to load your accounts. Please try again.');
        },
      });
    } else {
      this._showQuickPayWidget(payee, amount);
    }
  }

  /** Pick the best debit account: prefer checking → savings → rd → any */
  private pickDebitAccount(): string {
    const all = this.accounts();
    return (
      all.find(a => a.type === 'checking')?._id ??
      all.find(a => a.type === 'savings')?._id ??
      all.find(a => a.type === 'rd')?._id ??
      all.find(a => a.type !== 'credit')?._id ??
      all[0]?._id ??
      ''
    );
  }

  /** Internal — renders the confirm widget once accounts are guaranteed loaded. */
  private _showQuickPayWidget(payee: Payee, amount: number): void {
    const fromAccountId = this.pickDebitAccount();

    // Maya's acknowledgement text
    this.addAssistantMessage(
      `Got it! Here's a summary of your payment. Review and confirm below 👇`
    );

    // Append the confirm widget message
    this.messages.update(msgs => [...msgs, {
      role:        'assistant' as const,
      content:     '',
      htmlContent: '',
      timestamp:   new Date(),
      type:        'quick-pay-confirm' as const,
      quickPay:    { payee, amount, fromAccountId },
    }]);
    this.shouldScrollToBottom = true;
  }

  /**
   * Confirm button clicked inside the quick-pay widget.
   * Executes the actual API call.
   */
  async executeQuickPay(msg: ChatMessage): Promise<void> {
    const qp = msg.quickPay;
    if (!qp || this.quickPayExecuting()) return;
    this.quickPayExecuting.set(true);

    const { payee, amount } = qp;

    // Ensure we always have a valid fromAccountId — re-fetch if needed
    let fromAccountId = qp.fromAccountId;
    if (!fromAccountId) {
      try {
        const accs = await lastValueFrom(this.api.getAccounts());
        this.accounts.set(accs);
        fromAccountId = this.pickDebitAccount();
      } catch { /* will fail below with clear error */ }
    }

    if (!fromAccountId) {
      this.quickPayExecuting.set(false);
      this.addAssistantMessage('❌ No debit account found. Please run the seed script on the backend (`npx ts-node src/seed.ts`) to set up demo accounts.');
      return;
    }

    try {
      let ref = '';
      if (payee.transferType === 'wire') {
        const res = await lastValueFrom(this.api.initiateWire({
          fromAccount:   fromAccountId,
          recipientName: payee.fullName,
          recipientBank: payee.bankName,
          routingNumber: payee.routingNumber,
          amount,
          memo: `Quick Pay via Maya to ${payee.nickname}`,
        }));
        ref = res?.transaction?.referenceNumber ?? 'WIRE-REF';
      } else {
        const res = await lastValueFrom(this.api.initiateACH({
          fromAccount:   fromAccountId,
          toAccount:     payee.accountNumber,
          recipientName: payee.fullName,
          routingNumber: payee.routingNumber,
          amount,
          memo: `Quick Pay via Maya to ${payee.nickname}`,
        }));
        ref = res?.transaction?.referenceNumber ?? 'ACH-REF';
      }

      this.payeeSvc.recordPayment(payee.id, amount);
      this.quickPayPending.set(null);
      this.quickPayExecuting.set(false);

      const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
      const eta = payee.transferType === 'wire' ? 'same-day (before 4PM CT)' : '1–3 business days';
      this.addAssistantMessage(
        `✅ **Payment Confirmed!**\n\n` +
        `💸 **${fmt}** sent to **${payee.nickname}**\n` +
        `🏦 ${payee.bankName} · ${PayeeService.masked(payee.accountNumber)}\n` +
        `📋 Reference: **${ref}**\n` +
        `⏱ Expected: ${eta}\n\n` +
        `_You'll receive an email confirmation shortly. 🛡️_`
      );
    } catch (err: any) {
      this.quickPayExecuting.set(false);
      this.addAssistantMessage(
        `⚠️ Payment failed: ${err?.error?.message ?? 'Please try again or use the Quick Pay page.'}`
      );
    }
  }

  /** Cancel the pending quick-pay from the confirm widget. */
  cancelQuickPay(): void {
    this.quickPayPending.set(null);
    this.quickPayExecuting.set(false);
    this.addAssistantMessage(
      `Payment cancelled. Your account has not been charged.\n\n` +
      `Say _"send $X to [payee name]"_ anytime to try again!`
    );
  }

  /** Intercepts user text replies while quick-pay confirm is on screen. */
  private handleQuickPayResponse(msg: string): boolean {
    if (!this.quickPayPending() || this.quickPayExecuting()) return false;
    const lower = msg.toLowerCase().trim();

    if (/^(cancel|stop|no|nope|abort|never\s*mind)$/.test(lower)) {
      this.cancelQuickPay();
      return true;
    }
    if (/\b(yes|confirm|ok|sure|go\s*ahead|proceed|yep|yeah|do\s*it|send\s*it|execute)\b/.test(lower)) {
      // Find the confirm widget message and trigger execute
      const confirmMsg = this.messages().find(m => m.type === 'quick-pay-confirm' && m.quickPay);
      if (confirmMsg) this.executeQuickPay(confirmMsg);
      return true;
    }
    return false;
  }

  /** Template helper — format currency */
  formatCurrency(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }

  /** Template helper — masked account number */
  maskedAccount(num: string): string {
    return PayeeService.masked(num);
  }

  /** Template helper — payee initials */
  payeeInitials(nickname: string): string {
    return PayeeService.initials(nickname);
  }

  /** Template helper — transfer type label */
  transferLabel(t: 'wire' | 'ach'): string {
    return PayeeService.transferLabel(t);
  }

  private addAssistantMessage(content: string): void {
    const htmlContent = marked.parse(content) as string;
    this.messages.update(msgs => [...msgs, { role: 'assistant', content, htmlContent, timestamp: new Date() }]);
    this.shouldScrollToBottom = true;
    // Auto-speak if enabled
    if (this.autoSpeak()) {
      setTimeout(() => this.speakMessage(content), 300);
    }
  }

  toggleAutoSpeak(): void {
    this.autoSpeak.update(v => !v);
    // If turning off, stop any current speech
    if (!this.autoSpeak()) {
      this.synth.cancel();
      this.isSpeaking.set(false);
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  toggleMinimize(): void {
    this.isMinimized.update(v => !v);
  }

  clearChat(): void {
    this.messages.set([]);
    this.sessionId.set(null);
    this.addWelcome();
  }

  // ── Voice Input (Web Speech API) ──────────────────────────────
  private initSpeechRecognition(): void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as any[])
        .map((r: any) => r[0].transcript)
        .join('');
      this.inputText.set(transcript);
      if (event.results[event.results.length - 1].isFinal) {
        this.isListening.set(false);
      }
    };

    this.recognition.onerror = () => this.isListening.set(false);
    this.recognition.onend = () => this.isListening.set(false);
  }

  toggleVoiceInput(): void {
    if (!this.recognition) return;
    if (this.isListening()) {
      this.recognition.stop();
      this.isListening.set(false);
    } else {
      this.recognition.start();
      this.isListening.set(true);
      this.inputText.set('');
    }
  }

  get speechSupported(): boolean {
    return !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
  }

  // ── Voice Output (Text-to-Speech) ────────────────────────────
  speakMessage(content: string): void {
    if (this.isSpeaking()) { this.synth.cancel(); this.isSpeaking.set(false); return; }
    const plain = content.replace(/[#*`_~\[\]()]/g, '').trim();
    const utterance = new SpeechSynthesisUtterance(plain);
    utterance.lang = 'en-US';
    utterance.rate = 0.95;
    utterance.onstart = () => this.isSpeaking.set(true);
    utterance.onend = () => this.isSpeaking.set(false);
    utterance.onerror = () => this.isSpeaking.set(false);
    this.synth.speak(utterance);
  }

  private scrollToBottom(): void {
    // rAF waits for the browser layout pass to complete so scrollHeight is
    // the true value (important for tall widgets like the emergency card).
    requestAnimationFrame(() => {
      try {
        const el = this.messagesContainer?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      } catch {}
    });
  }
}
