import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Account } from '../../../core/services/api.service';
import { ScreenContextService } from '../../../core/services/screen-context.service';

@Component({
  selector: 'app-wire',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wire.component.html',
  styleUrl: '../payments-shared.scss',
})
export class WireComponent implements OnInit {
  accounts = signal<Account[]>([]);
  isInternational = signal(false);
  form = { fromAccount: '', recipientName: '', recipientBank: '', routingNumber: '', swiftCode: '', amount: '', memo: '' };
  loading = signal(false);
  success = signal('');
  error = signal('');

  constructor(private api: ApiService, private ctx: ScreenContextService) {}

  ngOnInit(): void {
    this.api.getAccounts().subscribe(a => this.accounts.set(a.filter(acc => acc.type !== 'rd')));
  }

  onFormChange(): void { this.ctx.updateFormState({ ...this.form, isInternational: this.isInternational() }); }

  submit(): void {
    this.loading.set(true); this.error.set(''); this.success.set('');
    this.api.initiateWire({ ...this.form, amount: +this.form.amount, isInternational: this.isInternational() }).subscribe({
      next: r => { this.loading.set(false); this.success.set(`Wire Transfer initiated! Ref: ${r.transaction.referenceNumber}`); this.form = { fromAccount: '', recipientName: '', recipientBank: '', routingNumber: '', swiftCode: '', amount: '', memo: '' }; },
      error: e => { this.loading.set(false); this.error.set(e.error?.message || 'Wire transfer failed.'); },
    });
  }
}
