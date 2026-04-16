import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ApiService, Account } from '../../../core/services/api.service';
import { ScreenContextService } from '../../../core/services/screen-context.service';
import { FormFillService } from '../../../core/services/form-fill.service';

@Component({
  selector: 'app-wire',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wire.component.html',
  styleUrl: '../payments-shared.scss',
})
export class WireComponent implements OnInit, OnDestroy {
  accounts = signal<Account[]>([]);
  isInternational = signal(false);
  form = { fromAccount: '', recipientName: '', recipientBank: '', routingNumber: '', swiftCode: '', amount: '', memo: '' };
  loading = signal(false);
  success = signal('');
  error = signal('');
  highlightedField = signal('');

  private fillSub!: Subscription;

  constructor(
    private api: ApiService,
    private ctx: ScreenContextService,
    private formFill: FormFillService,
  ) {}

  ngOnInit(): void {
    this.api.getAccounts().subscribe(a => this.accounts.set(a.filter(acc => acc.type !== 'rd')));

    // Subscribe to chatbot form-fill events
    this.fillSub = this.formFill.fill$.subscribe(event => {
      if (event.screen !== 'payments/wire') return;
      this.applyFill(event.field, event.value);
    });
  }

  ngOnDestroy(): void {
    this.fillSub?.unsubscribe();
  }

  private applyFill(field: string, value: string | boolean): void {
    if (field === 'isInternational') {
      this.isInternational.set(value as boolean);
    } else if (field in this.form) {
      (this.form as Record<string, string>)[field] = String(value);
    }

    // Flash highlight the filled field
    this.highlightedField.set(field);
    setTimeout(() => this.highlightedField.set(''), 1500);
    this.onFormChange();
  }

  onFormChange(): void {
    this.ctx.updateFormState({ ...this.form, isInternational: this.isInternational() });
  }

  submit(): void {
    this.loading.set(true); this.error.set(''); this.success.set('');
    this.api.initiateWire({ ...this.form, amount: +this.form.amount, isInternational: this.isInternational() }).subscribe({
      next: r => {
        this.loading.set(false);
        this.success.set(`Wire Transfer initiated! Ref: ${r.transaction.referenceNumber}`);
        this.form = { fromAccount: '', recipientName: '', recipientBank: '', routingNumber: '', swiftCode: '', amount: '', memo: '' };
      },
      error: e => { this.loading.set(false); this.error.set(e.error?.message || 'Wire transfer failed.'); },
    });
  }
}
