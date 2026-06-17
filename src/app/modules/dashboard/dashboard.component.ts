import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService, Account, Transaction } from '../../core/services/api.service';
import { PaymentHistoryService } from '../../core/services/payment-history.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  accounts = signal<Account[]>([]);
  recentTx = signal<Transaction[]>([]);
  loading = signal(true);

  constructor(
    private api: ApiService,
    private paymentHistory: PaymentHistoryService,
  ) {}

  ngOnInit(): void {
    this.api.getAccounts().subscribe({ next: a => this.accounts.set(a), error: () => {} });
    this.loadRecentTx();
    this.paymentHistory.onPaymentRecorded.subscribe(() => this.loadRecentTx());
  }

  private loadRecentTx(): void {
    this.api.getPaymentHistory(1).subscribe({
      next: r => {
        this.recentTx.set(
          (r.transactions ?? []).slice(0, 5).map(tx => ({
            ...tx,
            amount: this.coerceAmount(tx.amount),
          }))
        );
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private coerceAmount(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const n = parseFloat(value.replace(/[^0.-]/g, ''));
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }

  formatAmount(value: unknown): string {
    const n = typeof value === 'number' ? value : this.coerceAmount(value);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }

  get checking(): Account | undefined { return this.accounts().find(a => a.type === 'checking'); }
  get savings(): Account | undefined { return this.accounts().find(a => a.type === 'savings'); }
  get rd(): Account | undefined { return this.accounts().find(a => a.type === 'rd'); }

  txIcon(type: string): string {
    const map: Record<string, string> = { ach: 'swap_horiz', wire: 'send', zelle: 'bolt', card_payment: 'credit_card' };
    return map[type] ?? 'receipt';
  }
}
