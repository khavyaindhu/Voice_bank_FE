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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  htmlContent?: string;
  timestamp: Date;
  screenContext?: string;
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

  private shouldScrollToBottom = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognition: any = null;
  private synth = window.speechSynthesis;

  quickActions: QuickAction[] = [
    { label: '💳 How to make a Wire Transfer?', prompt: 'How do I make a wire transfer?' },
    { label: '⚡ Send money via Zelle', prompt: 'How do I send money with Zelle?' },
    { label: '🏠 Apply for a Home Loan', prompt: 'How do I apply for a home loan? What are the steps?' },
    { label: '💰 Check my balance', prompt: 'What are my current account balances?' },
    { label: '🔄 What is ACH Transfer?', prompt: 'Explain ACH transfer and how to initiate one.' },
    { label: '💳 Card details & rewards', prompt: 'Tell me about my credit card details and reward points.' },
    { label: '📋 RD account details', prompt: 'Tell me about my Recurring Deposit account details.' },
    { label: '📊 Loan EMI information', prompt: 'What are my current loan details and EMI amount?' },
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
    private guidedFlow: GuidedFlowService,
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
    this.askNextFlowStep();
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

    const screen = this.screenCtx.currentScreen();
    const result = this.guidedFlow.getActiveStep(this.flowSteps, this.flowStepIndex, this.flowFilledFields);
    if (!result) return false;

    const parsed = result.step.parse(msg, this.accounts(), this.flowFilledFields);
    if (!parsed) {
      this.addAssistantMessage(`⚠️ I didn't quite catch that. Please try again.\n\n${result.step.question(this.accounts(), this.flowFilledFields)}`);
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

    // ── If guided flow is active, handle locally without calling BE ──
    if (this.handleFlowAnswer(msg)) return;

    // ── Check for "fill form" trigger keywords ────────────────────
    const fillTrigger = /fill\s*form|guide\s*me|start\s*form|help.*fill|fill.*for\s*me|let'?s\s*go|assist.*form/i.test(msg);
    if (fillTrigger && this.guidedFlow.hasFlow(screen)) {
      this.startGuidedFlow();
      return;
    }

    this.isLoading.set(true);

    const accountSummary = {
      checkingBalance: this.accounts().find(a => a.type === 'checking')?.availableBalance,
      savingsBalance: this.accounts().find(a => a.type === 'savings')?.balance,
      creditBalance: this.accounts().find(a => a.type === 'credit')?.balance,
    };

    this.api.sendChatMessage({
      message: msg,
      screenContext: screen,
      accountSummary,
      sessionId: this.sessionId() ?? undefined,
    }).subscribe({
      next: r => {
        this.sessionId.set(r.sessionId);
        this.addAssistantMessage(r.response);
        this.isLoading.set(false);
        // Auto-navigate if bot detected a navigation intent
        if (r.navigateTo) {
          setTimeout(() => this.router.navigate([r.navigateTo]), 1000);
        }
      },
      error: () => {
        this.addAssistantMessage('Sorry, I\'m having trouble connecting right now. Please try again in a moment.');
        this.isLoading.set(false);
      },
    });
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
