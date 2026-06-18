import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService, Loan, LoanEmiProgress } from '../../core/services/api.service';

@Component({
  selector: 'app-loans',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './loans.component.html',
  styleUrl: './loans.component.scss',
})
export class LoansComponent implements OnInit {
  loans = signal<Loan[]>([]);
  progressByLoanId = signal<Record<string, LoanEmiProgress>>({});
  loading = signal(true);

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.api.getLoans().subscribe({
      next: loans => {
        this.loans.set(loans);
        if (loans.length === 0) {
          this.loading.set(false);
          return;
        }
        forkJoin(
          loans.map(l =>
            this.api.getLoanEmiProgress(l._id).pipe(catchError(() => of(null)))
          )
        ).subscribe(results => {
          const map: Record<string, LoanEmiProgress> = {};
          loans.forEach((l, i) => {
            if (results[i]) map[l._id] = results[i]!;
          });
          this.progressByLoanId.set(map);
          this.loading.set(false);
        });
      },
      error: () => this.loading.set(false),
    });
  }

  progress(loanId: string): LoanEmiProgress | undefined {
    return this.progressByLoanId()[loanId];
  }

  loanIcon(type: string): string {
    const m: Record<string,string> = { home:'home', auto:'directions_car', personal:'person', student:'school' };
    return m[type] ?? 'account_balance';
  }

  paidPct(loan: Loan): number {
    return Math.round(((loan.principalAmount - loan.outstandingBalance) / loan.principalAmount) * 100);
  }
}
