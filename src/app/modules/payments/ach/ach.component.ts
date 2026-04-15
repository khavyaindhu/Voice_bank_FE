import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Account } from '../../../core/services/api.service';
import { ScreenContextService } from '../../../core/services/screen-context.service';

@Component({
  selector: 'app-ach',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ach.component.html',
  styleUrl: '../payments-shared.scss',
})
export class AchComponent implements OnInit {
  accounts = signal<Account[]>([]);
  form = { fromAccount: '', toAccount: '', recipientName: '', routingNumber: '', amount: '', memo: '', scheduledDate: '' };
  loading = signal(false);
  success = signal('');
  error = signal('');

  constructor(private api: ApiService, private ctx: ScreenContextService) {}

  ngOnInit(): void {
    this.api.getAccounts().subscribe(a => this.accounts.set(a.filter(acc => acc.type !== 'rd')));
  }

  onFormChange(): void {
    this.ctx.updateFormState({ ...this.form });
  }

  submit(): void {
    this.loading.set(true); this.error.set(''); this.success.set('');
    this.api.initiateACH({ ...this.form, amount: +this.form.amount }).subscribe({
      next: r => { this.loading.set(false); this.success.set(`ACH Transfer initiated! Ref: ${r.transaction.referenceNumber}`); this.form = { fromAccount: '', toAccount: '', recipientName: '', routingNumber: '', amount: '', memo: '', scheduledDate: '' }; },
      error: e => { this.loading.set(false); this.error.set(e.error?.message || 'Transfer failed. Please try again.'); },
    });
  }
}
