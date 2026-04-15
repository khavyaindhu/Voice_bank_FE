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
  applyForLoan(payload: LoanApplicationPayload): Observable<{ loan: Loan }> {
    return this.http.post<{ loan: Loan }>(`${this.base}/loans/apply`, payload);
  }

  // Chat
  sendChatMessage(payload: ChatPayload): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(`${this.base}/chat/message`, payload);
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
}

export interface AchPayload { fromAccount: string; toAccount: string; recipientName: string; routingNumber: string; amount: number; memo?: string; scheduledDate?: string; }
export interface WirePayload { fromAccount: string; recipientName: string; recipientBank?: string; routingNumber?: string; swiftCode?: string; amount: number; memo?: string; isInternational?: boolean; }
export interface ZellePayload { fromAccount: string; recipientContact: string; amount: number; memo?: string; }
export interface CardPaymentPayload { fromAccount: string; cardId: string; paymentType: string; customAmount?: number; }
export interface LoanApplicationPayload { loanType: string; principalAmount: number; tenureMonths: number; }
export interface ChatPayload { message: string; screenContext: string; accountSummary?: object; sessionId?: string; }
export interface ChatResponse { response: string; sessionId: string; }
export interface TxResponse { message: string; transaction: Transaction; }
