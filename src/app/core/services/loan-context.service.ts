import { Injectable, signal } from '@angular/core';

/** Shared between Maya and loan analysis page. */
@Injectable({ providedIn: 'root' })
export class LoanContextService {
  /** When set, analysis page auto-selects this loan type (auto | home). */
  viewLoanType = signal<'auto' | 'home' | ''>('');

  openAnalysis(loanType: 'auto' | 'home'): void {
    this.viewLoanType.set(loanType);
  }

  clear(): void {
    this.viewLoanType.set('');
  }
}
