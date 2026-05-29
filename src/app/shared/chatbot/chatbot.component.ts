import { Component, OnInit, OnDestroy, signal, ViewChild, ElementRef, AfterViewChecked, computed, Input, HostListener, NgZone } from '@angular/core';
import type { AppRole } from '../../layout/layout.component';
import { lastValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { marked } from 'marked';
import { ApiService, Account, TtsResponse } from '../../core/services/api.service';
import { ScreenContextService } from '../../core/services/screen-context.service';
import { AuthService } from '../../core/services/auth.service';
import { FormFillService } from '../../core/services/form-fill.service';
import { GuidedFlowService, FlowStep } from '../../core/services/guided-flow.service';
import { LocalChatService } from '../../core/services/local-chat.service';
import { EmergencyCardService } from '../../core/services/emergency-card.service';
import { PayeeService, Payee } from '../../core/services/payee.service';
import { StaffContextService } from '../../core/services/staff-context.service';
import { LocaleService } from '../../core/services/locale.service';

export interface ChatMessage {
  /** Unique ID used to update this message in-place after async translation */
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  /** English/source text used when retranslating after language changes */
  sourceContent?: string;
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
  showLangMenu = signal(false);
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
  private finalSpeechTranscript = '';
  private synth = window.speechSynthesis;
  /** Cached voice list — loaded async (Chrome fires onvoiceschanged after init) */
  private ttsVoices: SpeechSynthesisVoice[] = [];
  /**
   * Whether Google Cloud TTS is configured on the backend.
   * null = not yet checked, true/false = result cached after first /api/config call.
   * When false, speakMessage skips the network call entirely and uses browser directly.
   */
  private googleTtsAvailable: boolean | null = null;

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

  voiceInputLabel(): string {
    return this.locale.selected().label;
  }

  private voiceInputLang(): string {
    return this.locale.selected().speechCode;
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
    public locale: LocaleService,
    private ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    this.api.getAccounts().subscribe({ next: a => this.accounts.set(a), error: () => {} });
    // Pre-load payees so Maya can do Quick Pay from any screen
    this.payeeSvc.load();
    this.initSpeechRecognition();
    this.initVoices();
    // Check once whether Google Cloud TTS is configured on the backend.
    // Result is cached so speakMessage never makes a wasted network call.
    this.api.getConfig().subscribe({
      next:  cfg => { this.googleTtsAvailable = cfg.features?.googleTts ?? false; },
      error: ()  => { this.googleTtsAvailable = false; },
    });
  }

  ngOnDestroy(): void {
    this.recognition?.abort();
    this.synth.cancel();
    this.currentAudio?.pause();
    this.currentAudio = null;
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
      : `Hi ${name}! 👋 I'm **Maya**, your U.S. Bank Voice assistant.\n\nI can see you're on the **${this.screenLabel()}** screen. I'm here to help you with:\n- Transfers (ACH, Wire, Zelle)\n- Card payments & balance enquiries\n- Loan applications & EMI details\n- Account & RD information\n\nWhat can I help you with today?`;
    // addAssistantMessage handles translation internally
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

  async sendMessage(text?: string): Promise<void> {
    const msg = (text ?? this.inputText()).trim();
    if (!msg || this.isLoading()) return;

    this.inputText.set('');
    const screen = this.screenCtx.currentScreen();

    this.messages.update(msgs => [...msgs, {
      role: 'user', content: msg, timestamp: new Date(), screenContext: screen,
    }]);
    this.shouldScrollToBottom = true;
    const commandMsg = await this.translateUserCommandForProcessing(msg);

    // ── Emergency card flow: intercept active-flow replies ───────────
    if (this.handleEmergencyCardResponse(commandMsg)) return;

    // ── Emergency card flow: detect trigger phrases ───────────────────
    // Checked here (before localChat.process) so it can never be shadowed
    // by a pattern in the INTENTS array (e.g. "my card" or "freeze").
    const isCardEmergency =
      /lost.*(?:my\s+)?card|(?:my\s+)?card.*(?:is\s+)?lost/i.test(commandMsg)   ||
      /stolen.*(?:my\s+)?card|(?:my\s+)?card.*(?:was\s+|is\s+)?stolen/i.test(commandMsg) ||
      /missing.*(?:my\s+)?card|(?:my\s+)?card.*(?:is\s+)?missing/i.test(commandMsg) ||
      /freeze\s+my\s+card|block\s+my\s+card|lock\s+my\s+card/i.test(commandMsg)  ||
      /unauthorized.*charg|someone.*used.*my\s+card|card.*compromised/i.test(commandMsg);
    if (isCardEmergency) {
      this.startEmergencyCardFlow();
      return;
    }

    // ── Staff intents: navigate + pre-fill staff screens ────────────
    if (this.role === 'staff' && this.handleStaffIntent(commandMsg)) return;

    // ── Quick Pay: intercept active-flow replies ─────────────────────
    if (this.handleQuickPayResponse(commandMsg)) return;

    // ── Quick Pay: detect "send $X to [payee]" trigger ───────────────
    // Pattern: send/pay/transfer + dollar amount + to + payee name
    const qpMatch = commandMsg.match(
      /(?:send|pay|transfer|wire)\s+\$?([\d,]+(?:\.\d+)?)\s+(?:to|for)\s+(.+)/i
    ) ?? commandMsg.match(
      /(?:send|pay|transfer|wire)\s+(?:to\s+)?(.+?)\s+\$?([\d,]+(?:\.\d+)?)/i
    );
    if (qpMatch) {
      // First pattern: amount is group 1, name is group 2
      // Second pattern: name is group 1, amount is group 2
      const isFirstPattern = /(?:send|pay|transfer|wire)\s+\$?[\d]/i.test(commandMsg);
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
    if (this.handleFlowAnswer(commandMsg)) return;

    // ── Check for "fill form" trigger keywords ────────────────────
    const fillTrigger = /fill\s*form|guide\s*me|start\s*form|help.*fill|fill.*for\s*me|let'?s\s*go|assist.*form/i.test(commandMsg);
    if (fillTrigger && this.guidedFlow.hasFlow(screen)) {
      this.startGuidedFlow();
      return;
    }

    // ── Process locally — no backend call needed ──────────────────
    const result = this.localChat.process(commandMsg, screen, this.accounts());
    // addAssistantMessage handles translation internally (fire-and-forget)
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

    /**
     * Navigate to a staff route and then run `after()` to set a signal.
     * If already on the page the component is already mounted — set the signal
     * directly so the registered effect fires immediately.
     * If on a different page — navigate first (so the new component mounts),
     * then set the signal once the navigation promise resolves.
     */
    const goto = (route: string, after: () => void) => {
      if (this.router.url.startsWith(route)) {
        // Component already mounted — set signal directly
        after();
      } else {
        // Navigate to page, wait for component to mount, then set signal
        Promise.resolve(this.router.navigate([route])).then(() => after());
      }
    };

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
      // 1. "transactions for [name/id]..."   2. "show [name/id] transactions..."
      // Allow digits so speech-spelled IDs like "c u s t 003" are captured fully.
      const custForMatch =
        lower.match(/transactions?\s+for\s+([a-z][a-z0-9 ]{1,30}?)(?:\s+(?:current|last|this|ytd|year|month|week|summary)|$)/i) ??
        lower.match(/show\s+([a-z][a-z0-9 ]{2,30}?)\s+transactions?/i);
      const reportCustomer = custForMatch?.[1]?.trim() ?? '';

      // Detect section
      const reportSection = /transaction/i.test(lower) ? 'transactions' : 'overview';

      const presetLabel: Record<string, string> = {
        currentmonth: 'current month', lastmonth: 'last month',
        lastweek: 'last 7 days', last3months: 'last 3 months', ytd: 'year to date',
      };

      this.addAssistantMessage(
        `📈 Opening **Reports** — ${presetLabel[reportPreset]}` +
        (reportCustomer ? ` for **${reportCustomer}**` : '') +
        `...\n\nLoading ${reportSection === 'transactions' ? 'transaction detail' : 'summary'} now.`
      );
      // Use goto: if already on reports page, set signal directly;
      // otherwise navigate first so the component mounts before the signal is set
      goto('/staff/reports', () => this.staffCtx.setReport(reportPreset, reportCustomer, reportSection));
      return true;
    }

    // ── FMS Account / Transactions ───────────────────────────────────
    // Patterns: "show Agni test transactions", "open FMS account 91000038",
    //           "show current month transactions for Currency", "load Agni transactions for March"
    const fmsRx = /(?:show|open|find|get|load|pull\s*up)\s+(?:fms\s+(?:account\s+)?)?(.+?)\s+(?:transactions?|account|ledger|entries)/i;
    const fmsMatch = msg.match(fmsRx);
    if ((fmsMatch || /fms|ledger|account\s+\d{5,8}/i.test(lower)) &&
        !/customer|client/i.test(lower) &&
        !/summary|report|\bfor\s+[a-z]/i.test(lower) &&
        !/last\s+(?:week|month)|current\s+month|ytd/i.test(lower)) {
      let searchTerm = '';
      if (fmsMatch) {
        searchTerm = fmsMatch[1].trim();
        // Guard: "open FMS account 910038" falsely captures "FMS" because the
        // word "account" in the pattern matches the suffix keyword.
        // Detect this and fall through to number/keyword extraction below.
        if (/^fms$/i.test(searchTerm)) searchTerm = '';
      }
      if (!searchTerm) {
        // Extract account number — allow 6-8 digits (speech recognition often
        // drops a zero when user says "double zero", e.g. "910038" → "91000038")
        const numMatch = lower.match(/\b(91\d{4,6})\b/);
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
      this.addAssistantMessage(
        `🔒 ${action === 'freeze' ? 'Freezing' : 'Unfreezing'} card for **"${target}"**...\n\nNavigating to Card Services and executing now.`
      );
      goto('/staff/cards', () => this.staffCtx.setCardFreeze(target));
      return true;
    }

    // ── Card: Filter by status ────────────────────────────────────────
    // "show frozen cards", "show disputed cards", "show expiring soon", "show active cards"
    // "cards" at end is optional — e.g. "show expiring soon" also matches
    const cardFilterRx = /show\s+(?:all\s+)?(?:the\s+)?(frozen|disputed|expiring(?:\s+soon)?|active)(?:\s+cards?)?$/i;
    const cardFilterMatch = lower.match(cardFilterRx);
    if (cardFilterMatch) {
      let tab = cardFilterMatch[1].toLowerCase();
      if (tab.startsWith('expiring')) tab = 'expiring';
      const tabLabel = tab === 'expiring' ? 'expiring soon' : tab;
      this.addAssistantMessage(`💳 Filtering Card Services to show **${tabLabel}** cards...`);
      goto('/staff/cards', () => this.staffCtx.setCardFilter(tab));
      return true;
    }

    // ── Card: Generic navigation ──────────────────────────────────────
    if (/(?:go\s+to|open|show|switch(?:\s+to)?|change(?:\s+to)?|navigate(?:\s+to)?|take\s+me\s+to|move\s+to|jump\s+to|load|visit)\s+(?:the\s+)?card\s+services?(?:\s+(?:tab|page|screen|section))?/i.test(lower) ||
        /card\s+(?:management|admin|lookup)/i.test(lower) ||
        /show\s+(?:all\s+)?cards?$/i.test(lower)) {
      this.addAssistantMessage(`💳 Navigating to **Card Services**...`);
      goto('/staff/cards', () => this.staffCtx.setCardFilter('all'));
      return true;
    }

    // ── Staff Dashboard ──────────────────────────────────────────────
    if (/(?:go\s+to|open|show|switch(?:\s+to)?|change(?:\s+to)?|navigate(?:\s+to)?|take\s+me\s+to|move\s+to|jump\s+to|load|visit)\s+(?:the\s+)?(?:staff\s+)?dashboard(?:\s+(?:tab|page|screen|section))?/i.test(lower) ||
        /staff\s+(?:home|main|overview)/i.test(lower)) {
      this.addAssistantMessage(`🏠 Navigating to **Staff Dashboard**...`);
      setTimeout(() => this.router.navigate(['/staff/dashboard']), 500);
      return true;
    }

    // ── Reports ──────────────────────────────────────────────────────
    if (/(?:go\s+to|open|show|switch(?:\s+to)?|change(?:\s+to)?|navigate(?:\s+to)?|take\s+me\s+to|move\s+to|jump\s+to|load|visit)\s+(?:the\s+)?(?:staff\s+)?reports?(?:\s+(?:tab|page|screen|section))?/i.test(lower) ||
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

  private async translateUserCommandForProcessing(content: string): Promise<string> {
    const lang = this.locale.selected();
    if (lang.code === 'en') return content;

    const localCommand = this.translateKnownCommandLocally(content, lang.code);
    if (localCommand) {
      console.log('[Maya command] local multilingual command matched', {
        source: lang.code,
        original: content,
        englishText: localCommand,
      });
      return localCommand;
    }

    console.log('[Maya command] translating user command to English', {
      source: lang.code,
      label: lang.label,
      contentPreview: content.substring(0, 80),
    });

    this.isLoading.set(true);
    try {
      const result = await lastValueFrom(this.api.translateCommandToEnglish(content, lang.code));
      const englishText = result.englishText?.trim() || content;
      console.log('[Maya command] English command', {
        source: lang.code,
        englishText,
      });
      return englishText;
    } catch (err) {
      console.error('[Maya command] command translation failed; using original text', {
        source: lang.code,
        error: err,
      });
      return content;
    } finally {
      this.isLoading.set(false);
    }
  }

  private translateKnownCommandLocally(content: string, langCode: string): string | null {
    const lower = content
      .toLocaleLowerCase()
      .normalize('NFC')
      .replace(/[.,!?;:"'()[\]{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const latinFolded = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const hasAny = (terms: string[]) => terms.some(term => lower.includes(term) || latinFolded.includes(term));

    const termsByCommand: Record<string, Record<string, string[]>> = {
      'open reports': {
        hi: ['रिपोर्ट', 'रिपोर्ट्स', 'रिपोर्टिंग', 'विश्लेषण'],
        ta: ['ரிப்போர்ட்', 'ரிப்போர்ட்ஸ்', 'அறிக்கை', 'அறிக்கைகள்', 'பகுப்பாய்வு'],
        kn: ['ರಿಪೋರ್ಟ್', 'ರಿಪೋರ್ಟ್ಸ್', 'ವರದಿ', 'ವರದಿಗಳು', 'ವಿಶ್ಲೇಷಣೆ'],
        es: ['reporte', 'reportes', 'informes', 'informe', 'analitica', 'analítica'],
      },
      'open customer search': {
        hi: ['कस्टमर', 'ग्राहक', 'ग्राहक खोज', 'कस्टमर सर्च'],
        ta: ['கஸ்டமர்', 'வாடிக்கையாளர்', 'வாடிக்கையாளர் தேடல்', 'கஸ்டமர் தேடல்'],
        kn: ['ಕಸ್ಟಮರ್', 'ಗ್ರಾಹಕ', 'ಗ್ರಾಹಕ ಹುಡುಕಾಟ', 'ಕಸ್ಟಮರ್ ಹುಡುಕಾಟ'],
        es: ['cliente', 'clientes', 'busqueda de cliente', 'búsqueda de cliente'],
      },
      'open fms account lookup': {
        hi: ['एफएमएस', 'fms', 'लेजर'],
        ta: ['எஃப்எம்எஸ்', 'எப் எம் எஸ்', 'fms', 'லெட்ஜர்'],
        kn: ['ಎಫ್ಎಂಎಸ್', 'ಎಫ್ ಎಂ ಎಸ್', 'fms', 'ಲೆಡ್ಜರ್'],
        es: ['fms', 'libro mayor', 'ledger'],
      },
      'open card services': {
        hi: ['कार्ड सर्विस', 'कार्ड सर्विसेज', 'कार्ड सेवा', 'कार्ड'],
        ta: ['கார்டு சர்வீஸ்', 'கார்டு சேவை', 'கார்டு', 'அட்டை'],
        kn: ['ಕಾರ್ಡ್ ಸರ್ವಿಸ್', 'ಕಾರ್ಡ್ ಸೇವೆ', 'ಕಾರ್ಡ್'],
        es: ['servicio de tarjeta', 'servicios de tarjeta', 'tarjeta', 'tarjetas'],
      },
      'go to staff dashboard': {
        hi: ['डैशबोर्ड', 'स्टाफ डैशबोर्ड', 'होम', 'मुख्य पेज'],
        ta: ['டாஷ்போர்ட்', 'ஸ்டாஃப் டாஷ்போர்ட்', 'ஹோம்', 'முகப்பு'],
        kn: ['ಡ್ಯಾಶ್ಬೋರ್ಡ್', 'ಸ್ಟಾಫ್ ಡ್ಯಾಶ್ಬೋರ್ಡ್', 'ಹೋಮ್', 'ಮುಖ್ಯ ಪುಟ'],
        es: ['dashboard', 'panel', 'inicio', 'pagina principal', 'página principal'],
      },
    };

    for (const [command, termsByLanguage] of Object.entries(termsByCommand)) {
      const terms = termsByLanguage[langCode];
      if (terms && hasAny(terms)) return command;
    }

    return null;
  }

  private addAssistantMessage(content: string): void {
    // Every message gets a unique ID so we can update it in-place after translation
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const lang = this.locale.selected();
    const htmlContent = marked.parse(content) as string;
    this.messages.update(msgs => [...msgs, {
      id,
      role: 'assistant',
      content,
      sourceContent: content,
      htmlContent,
      timestamp: new Date(),
    }]);
    this.shouldScrollToBottom = true;

    if (lang.code === 'en') {
      // English — no translation needed, speak immediately
      if (this.autoSpeak()) setTimeout(() => this.speakMessage(content), 300);
      return;
    }

    console.log('[Maya translate] queue assistant message for translation', {
      id,
      target: lang.code,
      label: lang.label,
      sourcePreview: content.substring(0, 80),
    });
    const pending = `Translating to ${lang.label}...`;
    this.messages.update(msgs =>
      msgs.map(m => m.id === id
        ? { ...m, content: pending, htmlContent: marked.parse(pending) as string }
        : m
      )
    );

    // Non-English: translate in the background, then patch message content in place
    this.doTranslate(content)
      .then(translated => {
        if (translated.trim() === content.trim()) {
          // Translation returned same text; keep it visible but log loudly.
          console.warn('[Maya translate] translation returned unchanged text', {
            id,
            target: lang.code,
            sourcePreview: content.substring(0, 80),
          });
        }
        const translatedHtml = marked.parse(translated) as string;
        this.messages.update(msgs =>
          msgs.map(m => m.id === id
            ? { ...m, content: translated, sourceContent: content, htmlContent: translatedHtml }
            : m
          )
        );
        this.shouldScrollToBottom = true;
        if (this.autoSpeak()) setTimeout(() => this.speakMessage(translated), 300);
      })
      .catch(err => {
        // Translation failed; do not speak the English source for non-English mode.
        console.error('[Maya translate] assistant message translation failed', {
          id,
          target: lang.code,
          error: err,
        });
        const failure = `Translation failed for ${lang.label}. Check the browser console and backend logs.`;
        this.messages.update(msgs =>
          msgs.map(m => m.id === id
            ? { ...m, content: failure, htmlContent: marked.parse(failure) as string }
            : m
          )
        );
        this.shouldScrollToBottom = true;
      });
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
    if (!SpeechRecognition) {
      console.warn('[Maya voice] SpeechRecognition is not supported in this browser.');
      return;
    }
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;
    this.recognition.lang = this.voiceInputLang();

    this.recognition.onstart = () => this.ngZone.run(() => {
      console.debug('[Maya voice] recognition started', { lang: this.recognition?.lang });
      this.isListening.set(true);
    });

    this.recognition.onspeechstart = () => {
      console.debug('[Maya voice] speech detected');
    };

    this.recognition.onspeechend = () => {
      console.debug('[Maya voice] speech ended');
    };

    this.recognition.onaudiostart = () => {
      console.debug('[Maya voice] audio capture started');
    };

    this.recognition.onaudioend = () => {
      console.debug('[Maya voice] audio capture ended');
    };

    this.recognition.onnomatch = (event: any) => {
      console.warn('[Maya voice] no speech match', event);
    };

    this.recognition.onresult = (event: any) => {
      this.ngZone.run(() => {
        console.debug('[Maya voice] recognition result received', {
          resultIndex: event.resultIndex,
          resultCount: event.results?.length,
        });

        let interimTranscript = '';

        for (let i = event.resultIndex ?? 0; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result?.[0]?.transcript ?? '';
          if (result?.isFinal) {
            this.finalSpeechTranscript = `${this.finalSpeechTranscript} ${text}`.trim();
          } else {
            interimTranscript += text;
          }
        }

        const transcript = `${this.finalSpeechTranscript} ${interimTranscript}`.trim();
        console.debug('[Maya voice] transcript update', {
          finalTranscript: this.finalSpeechTranscript,
          interimTranscript,
          transcript,
        });
        // Update signal (for Angular state) AND set DOM value directly
        // (signal-based [value] binding can lag in production builds)
        this.inputText.set(transcript);
        if (this.inputField?.nativeElement) {
          this.inputField.nativeElement.value = transcript;
        }
      });
    };

    this.recognition.onerror = (event: any) => this.ngZone.run(() => {
      console.error('[Maya voice] recognition error', {
        error: event?.error,
        message: event?.message,
      });
      this.isListening.set(false);
    });
    this.recognition.onend = () => this.ngZone.run(() => {
      console.debug('[Maya voice] recognition ended', {
        finalTranscript: this.finalSpeechTranscript,
        inputText: this.inputText(),
      });
      this.isListening.set(false);
    });
  }

  toggleVoiceInput(): void {
    if (!this.recognition) {
      console.warn('[Maya voice] Mic clicked, but recognition is unavailable.');
      return;
    }
    if (this.isLoading()) {
      console.debug('[Maya voice] Mic click ignored while assistant is loading.');
      return;
    }
    if (this.isListening()) {
      console.debug('[Maya voice] stopping recognition manually');
      this.recognition.stop();
      this.isListening.set(false);
    } else {
      const lang = this.voiceInputLang();
      console.debug('[Maya voice] starting recognition', { lang });
      this.finalSpeechTranscript = '';
      this.inputText.set('');
      if (this.inputField?.nativeElement) {
        this.inputField.nativeElement.value = '';
        this.inputField.nativeElement.focus();
      }
      this.recognition.lang = lang;
      try {
        this.recognition.start();
      } catch (error) {
        console.error('[Maya voice] recognition start failed', error);
        this.isListening.set(false);
      }
    }
  }

  get speechSupported(): boolean {
    return !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
  }

  // ── Voice Output (Text-to-Speech) ────────────────────────────

  /**
   * Pre-load the browser's voice list into `ttsVoices`.
   * Chrome loads voices asynchronously and fires `onvoiceschanged`
   * once they are ready — we hook that event so we always have the
   * full list before the user clicks the speaker button.
   */
  private initVoices(): void {
    const load = () => { this.ttsVoices = this.synth.getVoices(); };
    load(); // synchronous in Firefox / Safari; empty array in Chrome until event fires
    if ('onvoiceschanged' in this.synth) {
      this.synth.onvoiceschanged = load;
    }
  }

  /**
   * Choose the best available voice for a BCP-47 speech code.
   *
   * Priority (highest → lowest):
   *  1. Google Neural voice with exact language match   — best native quality in Chrome
   *  2. Any Google voice with exact language match
   *  3. Microsoft Neural voice with exact language match — good on Windows/Edge
   *  4. Any Microsoft voice with exact language match
   *  5. Any voice with exact language match
   *  6. Google/Microsoft voices with matching language prefix (e.g. 'ta' for 'ta-LK')
   *  7. Any remaining voice with matching prefix
   */
  private pickVoice(speechCode: string): SpeechSynthesisVoice | null {
    const voices = this.ttsVoices.length ? this.ttsVoices : this.synth.getVoices();
    if (!voices.length) return null;

    const langPrefix = speechCode.split('-')[0]; // 'ta', 'hi', 'kn', 'es', 'en'

    const exact  = voices.filter(v => v.lang === speechCode);
    const prefix = voices.filter(v => v.lang !== speechCode &&
                                      v.lang.toLowerCase().startsWith(langPrefix));

    return (
      exact.find(v => /google/i.test(v.name) && /neural|natural|enhanced/i.test(v.name)) ??
      exact.find(v => /google/i.test(v.name))  ??
      exact.find(v => /microsoft/i.test(v.name) && /neural|natural/i.test(v.name)) ??
      exact.find(v => /microsoft/i.test(v.name)) ??
      exact[0]  ??
      prefix.find(v => /google/i.test(v.name))  ??
      prefix.find(v => /microsoft/i.test(v.name)) ??
      prefix[0] ??
      null
    );
  }

  speakMessage(content: string): void {
    if (this.isSpeaking()) {
      this.synth.cancel();
      this.currentAudio?.pause();
      this.currentAudio = null;
      this.isSpeaking.set(false);
      return;
    }

    // Strip markdown so TTS reads clean text
    const plain = content
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/[_~\[\]()]/g, '')
      .replace(/^\s*[-•]\s/gm, '')
      .trim();

    const lang = this.locale.selected();
    this.isSpeaking.set(true);

    // ── If Google Cloud TTS is NOT configured (or not yet checked), go straight
    //    to the browser voice — no network call, no Render cold-start delay ──
    if (!this.googleTtsAvailable) {
      console.debug('[Maya TTS] using browser voice (Google TTS not configured)');
      this.speakWithBrowser(plain, lang.speechCode);
      return;
    }

    // ── Google Cloud TTS is configured — use it for best native quality ──
    this.api.synthesizeSpeech(plain, lang.code).subscribe({
      next: (res: TtsResponse) => {
        if (res.fallback || !res.audioContent) {
          this.googleTtsAvailable = false; // update cache
          this.speakWithBrowser(plain, lang.speechCode);
          return;
        }
        console.debug('[Maya TTS] Google Cloud TTS voice:', res.voiceName);
        const audio = new Audio(`data:audio/mp3;base64,${res.audioContent}`);
        this.currentAudio = audio;
        audio.playbackRate = lang.code === 'en' ? 1.0 : 0.9;
        audio.onended  = () => { this.isSpeaking.set(false); this.currentAudio = null; };
        audio.onerror  = () => { this.isSpeaking.set(false); this.currentAudio = null; };
        audio.play().catch(() => { this.speakWithBrowser(plain, lang.speechCode); });
      },
      error: () => {
        this.googleTtsAvailable = false; // update cache so next click is instant
        this.speakWithBrowser(plain, lang.speechCode);
      },
    });
  }

  /** HTML5 Audio element used for Google Cloud TTS playback */
  private currentAudio: HTMLAudioElement | null = null;

  /** Fallback: use the browser's Web Speech API with the best available voice */
  private speakWithBrowser(plain: string, speechCode: string): void {
    const utterance = new SpeechSynthesisUtterance(plain);
    utterance.lang  = speechCode;
    const voice = this.pickVoice(speechCode);
    if (voice) {
      utterance.voice = voice;
      console.debug('[Maya TTS] browser voice:', voice.name);
    }
    utterance.rate  = speechCode.startsWith('en') ? 0.95 : 0.82;
    utterance.pitch = 1.0;
    utterance.onstart = () => this.isSpeaking.set(true);
    utterance.onend   = () => this.isSpeaking.set(false);
    utterance.onerror = () => this.isSpeaking.set(false);
    this.synth.speak(utterance);
  }

  // ── Language Selector ────────────────────────────────────────
  toggleLangMenu(): void {
    this.showLangMenu.update(v => !v);
  }

  selectLanguage(code: string): void {
    this.locale.setLanguage(code);
    console.log('[Maya locale] Language set to:', code, '→', this.locale.selected().label);
    this.showLangMenu.set(false);
    this.retranslateAssistantMessages();
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.showLangMenu.set(false);
  }

  private async doTranslate(text: string): Promise<string> {
    // Read language at the START — before any async gap
    const lang = this.locale.selected();
    console.log('[Maya translate] doTranslate called', {
      code: lang.code, label: lang.label, isEnglish: lang.code === 'en',
    });
    if (lang.code === 'en') return text;
    try {
      console.log('[Maya translate] → calling API for', lang.label);
      const result = await lastValueFrom(this.api.translateText(text, lang.code));
      console.log('[Maya translate] ✓ success, preview:', result.translatedText?.substring(0, 60));
      return result.translatedText ?? text;
    } catch (err) {
      console.error(`[Maya translate] ✗ failed for ${lang.label} (${lang.code}):`, err);
      throw err;
    }
  }

  private retranslateAssistantMessages(): void {
    const lang = this.locale.selected();
    const assistantMessages = this.messages().filter(m =>
      m.role === 'assistant' && !m.type && (m.sourceContent || m.content)
    );

    console.log('[Maya translate] retranslate visible assistant messages', {
      target: lang.code,
      label: lang.label,
      count: assistantMessages.length,
    });

    if (lang.code === 'en') {
      this.messages.update(msgs => msgs.map(m => {
        if (m.role !== 'assistant' || !m.sourceContent) return m;
        return {
          ...m,
          content: m.sourceContent,
          htmlContent: marked.parse(m.sourceContent) as string,
        };
      }));
      return;
    }

    for (const msg of assistantMessages) {
      const id = msg.id;
      const source = msg.sourceContent ?? msg.content;
      if (!id || !source.trim()) continue;

      const pending = `Translating to ${lang.label}...`;
      this.messages.update(msgs =>
        msgs.map(m => m.id === id
          ? { ...m, sourceContent: source, content: pending, htmlContent: marked.parse(pending) as string }
          : m
        )
      );

      lastValueFrom(this.api.translateText(source, lang.code))
        .then(result => {
          const translated = result.translatedText ?? source;
          this.messages.update(msgs =>
            msgs.map(m => m.id === id
              ? { ...m, sourceContent: source, content: translated, htmlContent: marked.parse(translated) as string }
              : m
            )
          );
        })
        .catch(err => {
          console.error('[Maya translate] retranslate failed', {
            id,
            target: lang.code,
            error: err,
          });
          const failure = `Translation failed for ${lang.label}. Check the browser console and backend logs.`;
          this.messages.update(msgs =>
            msgs.map(m => m.id === id
              ? { ...m, sourceContent: source, content: failure, htmlContent: marked.parse(failure) as string }
              : m
            )
          );
        });
    }
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
