import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // Accounts
  getAccounts(): Observable<Account[]> {
    return this.http.get<Account[]>(`${this.base}/accounts`);
  }
  getAccount(id: string): Observable<Account> {
    return this.http.get<Account>(`${this.base}/accounts/${id}`);
  }
  getAccountTransactions(id: string, page = 1): Observable<TransactionPage> {
    return this.http.get<TransactionPage>(`${this.base}/accounts/${id}/transactions`, { params: { page } });
  }

  // Payments
  initiateACH(payload: AchPayload): Observable<TxResponse> {
    return this.http.post<TxResponse>(`${this.base}/payments/ach`, payload);
  }
  initiateWire(payload: WirePayload): Observable<TxResponse> {
    return this.http.post<TxResponse>(`${this.base}/payments/wire`, payload);
  }
  initiateZelle(payload: ZellePayload): Observable<TxResponse> {
    return this.http.post<TxResponse>(`${this.base}/payments/zelle`, payload);
  }
  makeCardPayment(payload: CardPaymentPayload): Observable<TxResponse> {
    return this.http.post<TxResponse>(`${this.base}/payments/card`, payload);
  }
  getPaymentHistory(page = 1, type?: string): Observable<TransactionPage> {
    let params = new HttpParams().set('page', page);
    if (type) params = params.set('type', type);
    return this.http.get<TransactionPage>(`${this.base}/payments/history`, { params });
  }

  // Cards
  getCards(): Observable<Card[]> {
    return this.http.get<Card[]>(`${this.base}/cards`);
  }
  getCard(id: string): Observable<Card> {
    return this.http.get<Card>(`${this.base}/cards/${id}`);
  }
  toggleCardFreeze(id: string): Observable<{ card: Card }> {
    return this.http.patch<{ card: Card }>(`${this.base}/cards/${id}/toggle-freeze`, {});
  }

  // Loans
  getLoans(): Observable<Loan[]> {
    return this.http.get<Loan[]>(`${this.base}/loans`);
  }
  getLoan(id: string): Observable<Loan> {
    return this.http.get<Loan>(`${this.base}/loans/${id}`);
  }
  getLoanEmiProgressByType(type: 'home' | 'auto' | 'personal' | 'student'): Observable<LoanEmiProgress> {
    return this.http.get<LoanEmiProgress>(`${this.base}/loans/emi-progress`, {
      params: new HttpParams().set('type', type),
    });
  }
  getLoanEmiProgress(id: string): Observable<LoanEmiProgress> {
    return this.http.get<LoanEmiProgress>(`${this.base}/loans/${id}/emi-progress`);
  }
  applyForLoan(payload: LoanApplicationPayload): Observable<{ loan: Loan }> {
    return this.http.post<{ loan: Loan }>(`${this.base}/loans/apply`, payload);
  }

  // Chat
  sendChatMessage(payload: ChatPayload): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(`${this.base}/chat/message`, payload);
  }

  // Translation
  translateText(text: string, language: string): Observable<TranslateResponse> {
    return this.http.post<TranslateResponse>(`${this.base}/translate`, { text, language });
  }

  translateCommandToEnglish(text: string, sourceLanguage: string): Observable<CommandTranslateResponse> {
    return this.http.post<CommandTranslateResponse>(`${this.base}/translate/to-english`, { text, sourceLanguage });
  }

  // Config / feature flags
  getConfig(): Observable<AppConfigResponse> {
    return this.http.get<AppConfigResponse>(`${this.base}/config`);
  }

  // Text-to-speech (server-side synthesis, returns base64 MP3)
  synthesizeSpeech(text: string, langCode: string): Observable<TtsResponse> {
    return this.http.post<TtsResponse>(`${this.base}/tts`, { text, langCode });
  }

  // ── Staff: Cards ────────────────────────────────────────────────────────
  getStaffCards(filters?: { status?: string; customerId?: string; search?: string }): Observable<StaffCard[]> {
    let params = new HttpParams();
    if (filters?.status)     params = params.set('status',     filters.status);
    if (filters?.customerId) params = params.set('customerId', filters.customerId);
    if (filters?.search)     params = params.set('search',     filters.search);
    return this.http.get<StaffCard[]>(`${this.base}/staff/cards`, { params });
  }
  staffToggleFreeze(id: string): Observable<{ card: StaffCard }> {
    return this.http.patch<{ card: StaffCard }>(`${this.base}/staff/cards/${id}/freeze`, {});
  }

  // ── Staff: Reports ───────────────────────────────────────────────────────
  getReportTransactions(params: ReportParams): Observable<ReportTxPage> {
    let p = new HttpParams();
    if (params.preset)      p = p.set('preset',      params.preset);
    if (params.from)        p = p.set('from',         params.from);
    if (params.to)          p = p.set('to',           params.to);
    if (params.customerId)  p = p.set('customerId',   params.customerId);
    if (params.category)    p = p.set('category',     params.category);
    if (params.entryType)   p = p.set('entryType',    params.entryType);
    if (params.page)        p = p.set('page',         params.page);
    if (params.limit)       p = p.set('limit',        params.limit);
    return this.http.get<ReportTxPage>(`${this.base}/staff/reports/transactions`, { params: p });
  }
  getReportSummary(params: ReportParams): Observable<ReportSummary> {
    let p = new HttpParams();
    if (params.preset) p = p.set('preset', params.preset);
    if (params.from)   p = p.set('from',   params.from);
    if (params.to)     p = p.set('to',     params.to);
    return this.http.get<ReportSummary>(`${this.base}/staff/reports/summary`, { params: p });
  }
  getReportDepartments(params: ReportParams): Observable<ReportDeptPage> {
    let p = new HttpParams();
    if (params.preset) p = p.set('preset', params.preset);
    if (params.from)   p = p.set('from',   params.from);
    if (params.to)     p = p.set('to',     params.to);
    return this.http.get<ReportDeptPage>(`${this.base}/staff/reports/departments`, { params: p });
  }
  getReportCustomers(): Observable<{ displayId: string; name: string }[]> {
    return this.http.get<{ displayId: string; name: string }[]>(`${this.base}/staff/reports/customers`);
  }
  getSpendingSummary(params: ReportParams): Observable<SpendingSummary> {
    let p = new HttpParams();
    if (params.preset)     p = p.set('preset',     params.preset);
    if (params.from)       p = p.set('from',       params.from);
    if (params.to)         p = p.set('to',         params.to);
    if (params.customerId) p = p.set('customerId', params.customerId);
    return this.http.get<SpendingSummary>(`${this.base}/staff/reports/spending-summary`, { params: p });
  }

  // Payees
  getPayees(): Observable<ApiPayee[]> {
    return this.http.get<ApiPayee[]>(`${this.base}/payees`);
  }
  createPayee(payload: CreatePayeePayload): Observable<{ message: string; payee: ApiPayee }> {
    return this.http.post<{ message: string; payee: ApiPayee }>(`${this.base}/payees`, payload);
  }
  deletePayee(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/payees/${id}`);
  }
  recordPayeePayment(id: string, amount: number): Observable<{ message: string; totalTransfers: number }> {
    return this.http.patch<{ message: string; totalTransfers: number }>(
      `${this.base}/payees/${id}/record-payment`, { amount }
    );
  }
  sendPayeePayment(
    id: string,
    payload: { amount: number; fromAccount: string; memo?: string },
  ): Observable<TxResponse & { totalTransfers: number }> {
    return this.http.post<TxResponse & { totalTransfers: number }>(
      `${this.base}/payees/${id}/pay`, payload
    );
  }

  // Recurring payment buckets
  getRecurringBuckets(): Observable<RecurringBucket[]> {
    return this.http.get<RecurringBucket[]>(`${this.base}/recurring-buckets`);
  }
  getRecurringBucket(id: string): Observable<RecurringBucket> {
    return this.http.get<RecurringBucket>(`${this.base}/recurring-buckets/${id}`);
  }
  createRecurringBucket(payload: CreateRecurringBucketPayload): Observable<{ message: string; bucket: RecurringBucket }> {
    return this.http.post<{ message: string; bucket: RecurringBucket }>(`${this.base}/recurring-buckets`, payload);
  }
  updateRecurringBucket(id: string, payload: Partial<CreateRecurringBucketPayload>): Observable<{ message: string; bucket: RecurringBucket }> {
    return this.http.patch<{ message: string; bucket: RecurringBucket }>(`${this.base}/recurring-buckets/${id}`, payload);
  }
  deleteRecurringBucket(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/recurring-buckets/${id}`);
  }
  addRecurringItem(bucketId: string, payload: CreateRecurringItemPayload): Observable<{ message: string; bucket: RecurringBucket }> {
    return this.http.post<{ message: string; bucket: RecurringBucket }>(
      `${this.base}/recurring-buckets/${bucketId}/items`, payload
    );
  }
  updateRecurringItem(
    bucketId: string,
    itemId: string,
    payload: Partial<CreateRecurringItemPayload> & { amountDelta?: number },
  ): Observable<{ message: string; bucket: RecurringBucket }> {
    return this.http.patch<{ message: string; bucket: RecurringBucket }>(
      `${this.base}/recurring-buckets/${bucketId}/items/${itemId}`, payload
    );
  }
  deleteRecurringItem(bucketId: string, itemId: string): Observable<{ message: string; bucket: RecurringBucket }> {
    return this.http.delete<{ message: string; bucket: RecurringBucket }>(
      `${this.base}/recurring-buckets/${bucketId}/items/${itemId}`
    );
  }
  payAllRecurringBucket(
    bucketId: string,
    fromAccount: string,
  ): Observable<RecurringPayAllResponse> {
    return this.http.post<RecurringPayAllResponse>(
      `${this.base}/recurring-buckets/${bucketId}/pay-all`, { fromAccount }
    );
  }
}

// ---- Type definitions ----
export interface Account {
  _id: string;
  type: 'checking' | 'savings' | 'credit' | 'rd';
  maskedNumber: string;
  balance: number;
  availableBalance: number;
  nickname: string;
  currency: string;
  interestRate?: number;
  maturityDate?: string;
  rdMonthlyDeposit?: number;
  rdTenureMonths?: number;
}

export interface Transaction {
  _id: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  fromAccount?: string;
  recipientName?: string;
  memo?: string;
  referenceNumber: string;
  createdAt: string;
  completedAt?: string;
}

export interface TransactionPage {
  transactions: Transaction[];
  total: number;
  page: number;
  pages: number;
}

export interface Card {
  _id: string;
  cardType: 'credit' | 'debit';
  network: 'Visa' | 'Mastercard';
  maskedNumber: string;
  cardholderName: string;
  expiryDate: string;
  creditLimit?: number;
  currentBalance: number;
  availableCredit?: number;
  minimumPayment?: number;
  dueDate?: string;
  status: 'active' | 'frozen' | 'blocked';
  rewardPoints?: number;
}

export interface Loan {
  _id: string;
  loanType: 'home' | 'auto' | 'personal' | 'student';
  principalAmount: number;
  outstandingBalance: number;
  interestRate: number;
  tenureMonths: number;
  emiAmount: number;
  nextDueDate: string;
  startDate: string;
  endDate: string;
  status: string;
  loanNumber: string;
  lenderName?: string;
  linkedPayeeId?: string;
}

export interface LoanEmiPayment {
  id: string;
  amount: number;
  completedAt: string;
  referenceNumber: string;
  memo?: string;
  recipientName?: string;
}

export interface LoanEmiProgress {
  loan: {
    id: string;
    loanType: string;
    loanNumber: string;
    principalAmount: number;
    outstandingBalance: number;
    interestRate: number;
    tenureMonths: number;
    emiAmount: number;
    startDate: string;
    endDate: string;
    nextDueDate: string;
    status: string;
    lenderName?: string;
  };
  installmentsPaid: number;
  installmentsRemaining: number;
  totalPaid: number;
  principalRepaid: number;
  monthsSinceStart: number;
  firstPaymentAt?: string | null;
  lastPaymentAt?: string | null;
  payments: LoanEmiPayment[];
}

export interface AchPayload { fromAccount: string; toAccount: string; recipientName: string; routingNumber: string; amount: number; memo?: string; scheduledDate?: string; }
export interface WirePayload { fromAccount: string; recipientName: string; recipientBank?: string; routingNumber?: string; swiftCode?: string; amount: number; memo?: string; isInternational?: boolean; }
export interface ZellePayload { fromAccount: string; recipientContact: string; amount: number; memo?: string; }
export interface CardPaymentPayload { fromAccount: string; cardId: string; paymentType: string; customAmount?: number; }
export interface LoanApplicationPayload { loanType: string; principalAmount: number; tenureMonths: number; }
export interface ChatPayload { message: string; screenContext: string; accountSummary?: object; sessionId?: string; }
export interface ChatResponse { response: string; sessionId: string; navigateTo?: string | null; }
export interface TranslateResponse { translatedText: string; language: string; }
export interface CommandTranslateResponse { englishText: string; sourceLanguage: string; }
export interface AppConfigResponse { features?: { googleTts?: boolean; serverTts?: boolean }; }
export interface TtsResponse { audioContent?: string; voiceName?: string; fallback?: boolean; message?: string; }
export interface TxResponse { message: string; transaction: Transaction; }

export interface ApiPayee {
  id: string;
  nickname: string;
  fullName: string;
  bankName: string;
  routingNumber: string;
  accountNumber: string;
  accountType: 'checking' | 'savings';
  transferType: 'wire' | 'ach';
  category: 'business' | 'personal' | 'family' | 'utility';
  avatarColor: string;
  lastPaidAmount?: number;
  lastPaidDate?: string;
  totalTransfers: number;
}

export interface CreatePayeePayload {
  nickname: string;
  fullName: string;
  bankName: string;
  routingNumber: string;
  accountNumber: string;
  accountType: 'checking' | 'savings';
  transferType: 'wire' | 'ach';
  category: 'business' | 'personal' | 'family' | 'utility';
}

export type RecurringCategory = 'rent' | 'emi' | 'subscription' | 'utility' | 'maintenance' | 'other';

export interface RecurringItem {
  id: string;
  name: string;
  category: RecurringCategory;
  amount: number;
  payeeId?: string;
  dayOfMonth?: number;
  aliases: string[];
  notes?: string;
}

export interface RecurringBucket {
  id: string;
  name: string;
  nickname: string;
  description?: string;
  avatarColor: string;
  items: RecurringItem[];
  totalMonthly: number;
}

export interface CreateRecurringBucketPayload {
  name: string;
  nickname: string;
  description?: string;
}

export interface CreateRecurringItemPayload {
  name: string;
  category: RecurringCategory;
  amount: number;
  payeeId?: string;
  dayOfMonth?: number;
  aliases?: string[];
  notes?: string;
}

export interface RecurringPayAllResponse {
  message: string;
  bucket: RecurringBucket;
  transactions: Transaction[];
  errors: string[];
  totalPaid: number;
}

// ── Staff types ──────────────────────────────────────────────────────────────

export interface StaffCard {
  _id:               string;
  customerDisplayId?: string;
  customerName?:      string;
  cardType:          'credit' | 'debit';
  network:           'Visa' | 'Mastercard';
  maskedNumber:      string;
  cardholderName:    string;
  expiryDate:        string;
  creditLimit?:      number;
  currentBalance:    number;
  status:            'active' | 'frozen' | 'blocked' | 'disputed' | 'expiring';
  disputes:          number;
  rewardPoints?:     number;
}

export interface LedgerEntryApi {
  _id:               string;
  customerDisplayId: string;
  customerName:      string;
  accountNo:         string;
  accountType:       string;
  date:              string;
  entryType:         'credit' | 'debit';
  category:          string;
  description:       string;
  amount:            number;
  runningBalance:    number;
  ref:               string;
}

export interface ReportParams {
  preset?:     string;
  from?:       string;
  to?:         string;
  customerId?: string;
  category?:   string;
  entryType?:  string;
  page?:       string;
  limit?:      string;
}

export interface ReportTxPage {
  entries:   LedgerEntryApi[];
  total:     number;
  page:      number;
  pages:     number;
  dateRange: { from: string; to: string };
}

export interface MonthSummaryApi {
  month:   string;
  credits: number;
  debits:  number;
  net:     number;
  txCount: number;
}

export interface TopCustomerApi {
  _id:          string;
  customerName: string;
  totalVolume:  number;
  txCount:      number;
  credits:      number;
  debits:       number;
}

export interface ReportSummary {
  monthlySummary: MonthSummaryApi[];
  totals:         { totalCredits: number; totalDebits: number; txCount: number };
  topCustomers:   TopCustomerApi[];
  dateRange:      { from: string; to: string };
}

export interface DeptRowApi {
  _id:    string;
  credits: number;
  debits:  number;
  count:   number;
}

export interface ReportDeptPage {
  departments: DeptRowApi[];
  dateRange:   { from: string; to: string };
}

export interface SpendingCategoryRow {
  category: string;
  credits:  number;
  debits:   number;
  total:    number;
  count:    number;
}

export interface SpendingSummary {
  categories: SpendingCategoryRow[];
  totals:     { credits: number; debits: number; net: number; txCount: number };
  customer:   { displayId: string; name: string } | null;
  dateRange:  { from: string; to: string };
}
