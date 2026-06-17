import { Component, OnInit, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { ApiService, Transaction } from '../../../core/services/api.service';
import { PaymentHistoryService } from '../../../core/services/payment-history.service';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './history.component.html',
  styleUrl: './history.component.scss',
})
export class HistoryComponent implements OnInit, OnDestroy {
  transactions = signal<Transaction[]>([]);
  total = signal(0);
  page = signal(1);
  pages = signal(1);
  filterType = signal('');
  loading = signal(true);

  types = ['', 'ach', 'wire', 'zelle', 'card_payment'];

  private subs = new Subscription();

  constructor(
    private api: ApiService,
    private router: Router,
    private paymentHistory: PaymentHistoryService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.subs.add(
      this.paymentHistory.onPaymentRecorded.subscribe(() => this.load())
    );
    this.subs.add(
      this.router.events
        .pipe(filter(e => e instanceof NavigationEnd))
        .subscribe(() => {
          if (this.router.url.includes('/payments/history') || this.router.url.includes('/transactions')) {
            this.load();
          }
        })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  load(): void {
    this.loading.set(true);
    this.api.getPaymentHistory(this.page(), this.filterType() || undefined).subscribe({
      next: r => {
        this.transactions.set(
          (r.transactions ?? []).map(tx => ({
            ...tx,
            amount: this.coerceAmount(tx.amount),
          }))
        );
        this.total.set(r.total);
        this.pages.set(r.pages);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Parse amount from API (number, string, or legacy BSON decimal shapes). */
  private coerceAmount(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const n = parseFloat(value.replace(/[^0.-]/g, ''));
      return Number.isFinite(n) ? n : 0;
    }
    if (value && typeof value === 'object') {
      const dec = (value as { $numberDecimal?: string }).$numberDecimal;
      if (dec != null) {
        const n = parseFloat(dec);
        return Number.isFinite(n) ? n : 0;
      }
    }
    return 0;
  }

  formatAmount(value: unknown): string {
    const n = typeof value === 'number' ? value : this.coerceAmount(value);
    if (!Number.isFinite(n)) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }

  onFilterChange(): void { this.page.set(1); this.load(); }
  prevPage(): void { if (this.page() > 1) { this.page.update(p => p - 1); this.load(); } }
  nextPage(): void { if (this.page() < this.pages()) { this.page.update(p => p + 1); this.load(); } }

  txIcon(type: string): string {
    const m: Record<string,string> = { ach:'swap_horiz', wire:'send', zelle:'bolt', card_payment:'credit_card' };
    return m[type] ?? 'receipt';
  }
  txColor(type: string): string {
    const m: Record<string,string> = { ach:'#3B82F6', wire:'#7C3AED', zelle:'#D97706', card_payment:'#059669' };
    return m[type] ?? '#6B7280';
  }
}
