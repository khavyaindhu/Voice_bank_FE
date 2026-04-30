import { Injectable, signal, inject } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { ApiService, ApiPayee, CreatePayeePayload } from './api.service';

// ─── Public types (re-exported so components import from one place) ────────────

export type TransferType   = 'wire' | 'ach';
export type PayeeCategory  = 'business' | 'personal' | 'family' | 'utility';

/** The shape used throughout the FE — maps 1-to-1 with ApiPayee */
export type Payee = ApiPayee;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class PayeeService {
  private api = inject(ApiService);

  private _payees  = signal<Payee[]>([]);
  private _loading = signal(false);
  private _loaded  = signal(false);

  /** Read-only reactive list — bind in templates with `payeeSvc.payees()` */
  readonly payees  = this._payees.asReadonly();
  readonly loading = this._loading.asReadonly();

  // ── Bootstrap ──────────────────────────────────────────────────────

  /** Call once after login — loads payees from backend into the signal. */
  async load(): Promise<void> {
    if (this._loaded()) return;            // already fetched this session
    this._loading.set(true);
    try {
      const list = await lastValueFrom(this.api.getPayees());
      this._payees.set(list);
      this._loaded.set(true);
    } catch {
      // Non-fatal — the page will show an empty state
    } finally {
      this._loading.set(false);
    }
  }

  /** Force a refresh (e.g. after adding or deleting) */
  async reload(): Promise<void> {
    this._loaded.set(false);
    await this.load();
  }

  // ── Read ───────────────────────────────────────────────────────────

  getById(id: string): Payee | undefined {
    return this._payees().find(p => p.id === id);
  }

  /**
   * Fuzzy name search used by Maya's Quick Pay regex extraction.
   * Priority: exact nickname → nickname contains → query contains nickname → full-name partial.
   */
  findByName(query: string): Payee | undefined {
    const q = query.toLowerCase().trim();
    const all = this._payees();

    return (
      all.find(p => p.nickname.toLowerCase() === q) ??
      all.find(p => p.nickname.toLowerCase().includes(q)) ??
      all.find(p => q.includes(p.nickname.toLowerCase())) ??
      all.find(p => p.fullName.toLowerCase().includes(q))
    );
  }

  // ── Write ──────────────────────────────────────────────────────────

  async add(draft: CreatePayeePayload): Promise<Payee> {
    const res = await lastValueFrom(this.api.createPayee(draft));
    this._payees.update(list => [...list, res.payee]);
    return res.payee;
  }

  async delete(id: string): Promise<void> {
    await lastValueFrom(this.api.deletePayee(id));
    this._payees.update(list => list.filter(p => p.id !== id));
  }

  /** Called after a successful payment execution to keep stats in sync. */
  async recordPayment(id: string, amount: number): Promise<void> {
    try {
      const res = await lastValueFrom(this.api.recordPayeePayment(id, amount));
      this._payees.update(list =>
        list.map(p =>
          p.id === id
            ? {
                ...p,
                lastPaidAmount:  amount,
                lastPaidDate:    new Date().toISOString().split('T')[0],
                totalTransfers:  res.totalTransfers,
              }
            : p
        )
      );
    } catch {
      // stats update is non-fatal — payment already went through
    }
  }

  // ── Static helpers (no API needed) ────────────────────────────────

  /** "4521789012" → "****9012" */
  static masked(accountNumber: string): string {
    return `****${accountNumber.slice(-4)}`;
  }

  /** "ABC Vendors" → "AB"  |  "Mom" → "M" */
  static initials(nickname: string): string {
    return nickname
      .split(/\s+/)
      .slice(0, 2)
      .map(w => w[0] ?? '')
      .join('')
      .toUpperCase();
  }

  static categoryIcon(cat: PayeeCategory): string {
    const map: Record<PayeeCategory, string> = {
      business: 'business',
      personal: 'person',
      family:   'family_restroom',
      utility:  'bolt',
    };
    return map[cat];
  }

  static transferLabel(t: TransferType): string {
    return t === 'wire' ? 'Wire Transfer' : 'ACH Transfer';
  }
}
