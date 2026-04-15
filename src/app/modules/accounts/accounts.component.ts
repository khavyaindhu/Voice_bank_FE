import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, Account } from '../../core/services/api.service';

@Component({
  selector: 'app-accounts',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './accounts.component.html',
  styleUrl: './accounts.component.scss',
})
export class AccountsComponent implements OnInit {
  accounts = signal<Account[]>([]);
  loading = signal(true);

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.api.getAccounts().subscribe({
      next: a => { this.accounts.set(a); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  typeLabel(type: string): string {
    const m: Record<string,string> = { checking:'Checking', savings:'Savings', credit:'Credit', rd:'Recurring Deposit' };
    return m[type] ?? type;
  }
  typeIcon(type: string): string {
    const m: Record<string,string> = { checking:'account_balance', savings:'savings', credit:'credit_card', rd:'autorenew' };
    return m[type] ?? 'account_balance';
  }
}
