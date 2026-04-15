import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Transaction } from '../../../core/services/api.service';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './history.component.html',
  styleUrl: './history.component.scss',
})
export class HistoryComponent implements OnInit {
  transactions = signal<Transaction[]>([]);
  total = signal(0);
  page = signal(1);
  pages = signal(1);
  filterType = signal('');
  loading = signal(true);

  types = ['', 'ach', 'wire', 'zelle', 'card_payment'];

  constructor(private api: ApiService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.api.getPaymentHistory(this.page(), this.filterType() || undefined).subscribe({
      next: r => { this.transactions.set(r.transactions); this.total.set(r.total); this.pages.set(r.pages); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
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
