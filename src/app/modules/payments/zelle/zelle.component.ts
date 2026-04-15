import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Account } from '../../../core/services/api.service';
import { ScreenContextService } from '../../../core/services/screen-context.service';

@Component({
  selector: 'app-zelle',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './zelle.component.html',
  styleUrl: '../payments-shared.scss',
})
export class ZelleComponent implements OnInit {
  accounts = signal<Account[]>([]);
  form = { fromAccount: '', recipientContact: '', amount: '', memo: '' };
  loading = signal(false);
  success = signal('');
  error = signal('');

  constructor(private api: ApiService, private ctx: ScreenContextService) {}

  ngOnInit(): void {
    this.api.getAccounts().subscribe(a => this.accounts.set(a.filter(acc => acc.type === 'checking' || acc.type === 'savings')));
  }

  onFormChange(): void { this.ctx.updateFormState({ ...this.form }); }

  submit(): void {
    this.loading.set(true); this.error.set(''); this.success.set('');
    this.api.initiateZelle({ ...this.form, amount: +this.form.amount }).subscribe({
      next: r => { this.loading.set(false); this.success.set(`Zelle payment sent! Ref: ${r.transaction.referenceNumber}`); this.form = { fromAccount: '', recipientContact: '', amount: '', memo: '' }; },
      error: e => { this.loading.set(false); this.error.set(e.error?.message || 'Zelle payment failed.'); },
    });
  }
}
