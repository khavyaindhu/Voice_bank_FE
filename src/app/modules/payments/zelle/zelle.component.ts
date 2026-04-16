import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ApiService, Account } from '../../../core/services/api.service';
import { ScreenContextService } from '../../../core/services/screen-context.service';
import { FormFillService } from '../../../core/services/form-fill.service';

@Component({
  selector: 'app-zelle',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './zelle.component.html',
  styleUrl: '../payments-shared.scss',
})
export class ZelleComponent implements OnInit, OnDestroy {
  accounts = signal<Account[]>([]);
  form = { fromAccount: '', recipientContact: '', amount: '', memo: '' };
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
    this.api.getAccounts().subscribe(a => this.accounts.set(a.filter(acc => acc.type === 'checking' || acc.type === 'savings')));

    this.fillSub = this.formFill.fill$.subscribe(event => {
      if (event.screen !== 'payments/zelle') return;
      this.applyFill(event.field, event.value);
    });
  }

  ngOnDestroy(): void { this.fillSub?.unsubscribe(); }

  private applyFill(field: string, value: string | boolean): void {
    if (field in this.form) {
      (this.form as Record<string, string>)[field] = String(value);
    }
    this.highlightedField.set(field);
    setTimeout(() => this.highlightedField.set(''), 1500);
    this.onFormChange();
  }

  onFormChange(): void { this.ctx.updateFormState({ ...this.form }); }

  submit(): void {
    this.loading.set(true); this.error.set(''); this.success.set('');
    this.api.initiateZelle({ ...this.form, amount: +this.form.amount }).subscribe({
      next: r => {
        this.loading.set(false);
        this.success.set(`Zelle payment sent! Ref: ${r.transaction.referenceNumber}`);
        this.form = { fromAccount: '', recipientContact: '', amount: '', memo: '' };
      },
      error: e => { this.loading.set(false); this.error.set(e.error?.message || 'Zelle failed.'); },
    });
  }
}
