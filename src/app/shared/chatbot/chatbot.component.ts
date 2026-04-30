import { Component, OnInit, OnDestroy, signal, ViewChild, ElementRef, AfterViewChecked, computed } from '@angular/core';
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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  htmlContent?: string;
  timestamp: Date;
  screenContext?: string;
  /** 'emergency-options' renders the interactive card action widget */
  type?: 'normal' | 'emergency-options';
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

  /** True when no action card is selected — used to disable the "Execute Selected" button. */
  get noActionsSelected(): boolean {
    return this.emergencyActions().every(a => !a.selected);
  }

  private shouldScrollToBottom = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognition: any = null;
  private synth = window.speechSynthesis;

  quickActions: QuickAction[] = [
    { label: '🚨 Lost / Stolen Card',            prompt: 'Maya, I lost my card' },
    { label: '💳 How to make a Wire Transfer?',   prompt: 'How do I make a wire transfer?' },
    { label: '⚡ Send money via Zelle',            prompt: 'How do I send money with Zelle?' },
    { label: '🏠 Apply for a Home Loan',           prompt: 'How do I apply for a home loan? What are the steps?' },
    { label: '💰 Check my balance',               prompt: 'What are my current account balances?' },
    { label: '🔄 What is ACH Transfer?',           prompt: 'Explain ACH transfer and how to initiate one.' },
    { label: '💳 Card details & rewards',          prompt: 'Tell me about my credit card details and reward points.' },
    { label: '📊 Loan EMI information',            prompt: 'What are my current loan details and EMI amount?' },
  ];

  screenLabel = computed(() => {
    const labels: Record<string, string> = {
      'dashboard': 'Dashboard',
      'payments/ach': 'ACH Transfer',
      'payments/wire': 'Wire Transfer',
      'payments/zelle': 'Zelle',
      'payments/card': 'Card Payment',
      'payments/history': 'Transaction History',
      'accounts': 'Accounts',
      'cards': 'Cards',
      'loans': 'Loans',
      'loans/apply': 'Loan Application',
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
  ) {}

  ngOnInit(): void {
    this.api.getAccounts().subscribe({ next: a => this.accounts.set(a), error: () => {} });
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
    this.addAssistantMessage(
      `Hi ${name}! 👋 I'm **Maya**, your U.S. Bank AI assistant.\n\nI can see you're on the **${this.screenLabel()}** screen. I'm here to help you with:\n- Transfers (ACH, Wire, Zelle)\n- Card payments & balance enquiries\n- Loan applications & EMI details\n- Account & RD information\n\nWhat can I help you with today?`
    );
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
    try {
      const el = this.messagesContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch {}
  }
}
