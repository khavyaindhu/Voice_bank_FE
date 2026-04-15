import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService, Loan } from '../../core/services/api.service';

@Component({
  selector: 'app-loans',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './loans.component.html',
  styleUrl: './loans.component.scss',
})
export class LoansComponent implements OnInit {
  loans = signal<Loan[]>([]);
  loading = signal(true);

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.api.getLoans().subscribe({ next: l => { this.loans.set(l); this.loading.set(false); }, error: () => this.loading.set(false) });
  }

  loanIcon(type: string): string {
    const m: Record<string,string> = { home:'home', auto:'directions_car', personal:'person', student:'school' };
    return m[type] ?? 'account_balance';
  }

  paidPct(loan: Loan): number {
    return Math.round(((loan.principalAmount - loan.outstandingBalance) / loan.principalAmount) * 100);
  }
}
