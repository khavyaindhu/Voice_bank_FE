import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { ScreenContextService } from '../../../core/services/screen-context.service';

interface LoanType { key: string; label: string; icon: string; rate: string; maxAmount: number; minTenure: number; maxTenure: number; desc: string; }

@Component({
  selector: 'app-loan-apply',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './loan-apply.component.html',
  styleUrl: './loan-apply.component.scss',
})
export class LoanApplyComponent {
  loanTypes: LoanType[] = [
    { key: 'home', label: 'Home Loan', icon: 'home', rate: '6.75%', maxAmount: 1000000, minTenure: 60, maxTenure: 360, desc: 'Finance your dream home with competitive rates and flexible tenure up to 30 years.' },
    { key: 'auto', label: 'Auto Loan', icon: 'directions_car', rate: '8.50%', maxAmount: 100000, minTenure: 24, maxTenure: 84, desc: 'Drive home your new car with instant pre-approval and same-day funding.' },
    { key: 'personal', label: 'Personal Loan', icon: 'person', rate: '12.50%', maxAmount: 50000, minTenure: 12, maxTenure: 60, desc: 'Get funds for any purpose — debt consolidation, medical bills, travel, and more.' },
    { key: 'student', label: 'Student Loan', icon: 'school', rate: '5.00%', maxAmount: 100000, minTenure: 12, maxTenure: 120, desc: 'Invest in your education with low-interest student loans and deferred repayment options.' },
  ];

  selectedType = signal<LoanType | null>(null);
  form = { principalAmount: '', tenureMonths: '' };
  loading = signal(false);
  success = signal('');
  error = signal('');

  estimatedEmi = computed(() => {
    const type = this.selectedType();
    if (!type || !this.form.principalAmount || !this.form.tenureMonths) return 0;
    const rateMap: Record<string,number> = { home:6.75, auto:8.5, personal:12.5, student:5.0 };
    const r = (rateMap[type.key] / 100) / 12;
    const n = +this.form.tenureMonths;
    const p = +this.form.principalAmount;
    if (!r || !n || !p) return 0;
    return Math.round((p * r * Math.pow(1+r,n)) / (Math.pow(1+r,n) - 1) * 100) / 100;
  });

  constructor(private api: ApiService, private ctx: ScreenContextService) {}

  selectType(type: LoanType): void {
    this.selectedType.set(type);
    this.ctx.updateFormState({ loanType: type.key, ...this.form });
  }

  onFormChange(): void { this.ctx.updateFormState({ loanType: this.selectedType()?.key, ...this.form }); }

  submit(): void {
    const type = this.selectedType();
    if (!type) return;
    this.loading.set(true); this.error.set(''); this.success.set('');
    this.api.applyForLoan({ loanType: type.key, principalAmount: +this.form.principalAmount, tenureMonths: +this.form.tenureMonths }).subscribe({
      next: r => { this.loading.set(false); this.success.set(`Loan application submitted! Loan #: ${r.loan.loanNumber}. A loan officer will contact you within 2–3 business days.`); },
      error: e => { this.loading.set(false); this.error.set(e.error?.message || 'Application failed.'); },
    });
  }
}
