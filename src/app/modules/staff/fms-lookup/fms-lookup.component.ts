import { Component, signal, computed, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StaffContextService } from '../../../core/services/staff-context.service';

interface FmsAccount {
  accountNo: string;
  deptNo: string;
  description: string;
  status: 'active' | 'inactive';
  balance: number;
}

interface FmsTransaction {
  date: string;
  type: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number;
  ref: string;
}

@Component({
  selector: 'app-fms-lookup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fms-lookup.component.html',
  styleUrl: './fms-lookup.component.scss',
})
export class FmsLookupComponent implements OnInit {
  private staffCtx = inject(StaffContextService);

  searchQ       = signal('');
  selected      = signal<FmsAccount | null>(null);
  dateFrom      = signal('2026-01-01');
  dateTo        = signal('2026-04-30');
  txLoading     = signal(false);
  showTx        = signal(false);

  constructor() {
    // Reactively respond to Maya setting a new FMS query —
    // works even when the component is already mounted (same-route navigation)
    effect(() => {
      const q = this.staffCtx.fmsQuery();
      if (!q) return;
      this.searchQ.set(q);
      const match = this.accounts.find(a => {
        const desc = a.description.toLowerCase();
        const ql   = q.toLowerCase().trim();
        // Description match
        if (desc.includes(ql)) return true;
        // Exact account number substring match
        if (a.accountNo.includes(q)) return true;
        // Fuzzy numeric match: speech recognition sometimes drops a zero when
        // user says "double zero" → e.g. "9100038" heard instead of "91000038".
        // Accept if first 5 digits match AND last 2 digits match.
        if (/^\d{5,7}$/.test(q) && a.accountNo.startsWith(q.slice(0, 5)) && a.accountNo.endsWith(q.slice(-2))) return true;
        return false;
      });
      if (match) {
        this.selected.set(match);
        this.showTx.set(false);
        const preset = this.staffCtx.fmsAutoLoad();
        if (preset) { this.applyPreset(preset); }
      }
      this.staffCtx.setFmsSearch(''); // clear after consuming
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {}

  applyPreset(preset: 'current' | 'previous' | 'ytd' | ''): void {
    if (preset === 'current')  { this.dateFrom.set('2026-04-01'); this.dateTo.set('2026-04-30'); }
    if (preset === 'previous') { this.dateFrom.set('2026-03-01'); this.dateTo.set('2026-03-31'); }
    if (preset === 'ytd')      { this.dateFrom.set('2026-01-01'); this.dateTo.set('2026-04-30'); }
    if (preset) { this.loadTransactions(); }
  }

  readonly accounts: FmsAccount[] = [
    { accountNo: '91000013', deptNo: '6',        description: 'Swarangi Test',              status: 'active',   balance: 0 },
    { accountNo: '91000016', deptNo: '1',        description: 'NAY TEST FMS REGRESSION',    status: 'active',   balance: 1500 },
    { accountNo: '91000017', deptNo: '500',      description: 'Custom Test Description',    status: 'active',   balance: 3200 },
    { accountNo: '91000023', deptNo: '4',        description: 'NKR Test',                   status: 'active',   balance: 800 },
    { accountNo: '91000038', deptNo: '3',        description: 'Agni Test',                  status: 'active',   balance: 45000 },
    { accountNo: '91000066', deptNo: '4',        description: 'Nayana Green Reg',           status: 'active',   balance: 12000 },
    { accountNo: '91000081', deptNo: '3',        description: 'NAYANA FMS REGRESSION',      status: 'active',   balance: 6700 },
    { accountNo: '91000085', deptNo: '1',        description: 'NR Test',                    status: 'active',   balance: 920 },
    { accountNo: '91000200', deptNo: '100',      description: 'CURRENCY & COIN',            status: 'active',   balance: 250000 },
    { accountNo: '91000300', deptNo: '100',      description: 'CURRENCY & COIN TELLER',     status: 'active',   balance: 85000 },
    { accountNo: '91001000', deptNo: '0',        description: 'General Ledger Control',     status: 'active',   balance: 1200000 },
    { accountNo: '91001100', deptNo: '1',        description: 'Salary & Wages',             status: 'active',   balance: 340000 },
    { accountNo: '91001200', deptNo: '2',        description: 'Rent & Utilities',           status: 'inactive', balance: 0 },
    { accountNo: '91002000', deptNo: '0',        description: 'Loan Interest Income',       status: 'active',   balance: 890000 },
    { accountNo: '91002100', deptNo: '5',        description: 'Fee Income - Transactions',  status: 'active',   balance: 42000 },
  ];

  readonly txMap: Record<string, FmsTransaction[]> = {
    '91000038-3': [
      { date: '2026-04-28', type: 'Credit', description: 'ACH Batch Deposit',         debit: null,  credit: 12000, balance: 45000, ref: 'ACH-2604281' },
      { date: '2026-04-20', type: 'Debit',  description: 'Vendor Payment - Supplies', debit: 3500,  credit: null,  balance: 33000, ref: 'CHK-0042011' },
      { date: '2026-04-15', type: 'Debit',  description: 'Payroll Disbursement',      debit: 18000, credit: null,  balance: 36500, ref: 'PAY-2604151' },
      { date: '2026-04-05', type: 'Credit', description: 'Interest Income',           debit: null,  credit: 250,   balance: 54500, ref: 'INT-2604051' },
      { date: '2026-03-31', type: 'Debit',  description: 'Month-End Accrual',         debit: 7800,  credit: null,  balance: 54250, ref: 'ACR-2603311' },
      { date: '2026-03-15', type: 'Credit', description: 'Customer Deposit',          debit: null,  credit: 25000, balance: 62050, ref: 'DEP-2603151' },
    ],
    '91000200-100': [
      { date: '2026-04-29', type: 'Credit', description: 'Teller Cash Replenishment', debit: null,   credit: 50000, balance: 250000, ref: 'CSH-2604291' },
      { date: '2026-04-28', type: 'Debit',  description: 'ATM Cassette Fill',         debit: 20000,  credit: null,  balance: 200000, ref: 'ATM-2604281' },
      { date: '2026-04-25', type: 'Debit',  description: 'Vault Transfer Out',        debit: 100000, credit: null,  balance: 220000, ref: 'VLT-2604251' },
    ],
  };

  filtered = computed(() => {
    const q = this.searchQ().toLowerCase().trim();
    if (!q) return this.accounts;
    return this.accounts.filter(a => {
      if (a.accountNo.includes(q))                       return true;
      if (a.description.toLowerCase().includes(q))       return true;
      if (a.deptNo.includes(q))                          return true;
      // Fuzzy numeric: handles one dropped zero from speech recognition
      if (/^\d{5,7}$/.test(q) && a.accountNo.startsWith(q.slice(0, 5)) && a.accountNo.endsWith(q.slice(-2))) return true;
      return false;
    });
  });

  get transactions(): FmsTransaction[] {
    const s = this.selected();
    if (!s) return [];
    const key = `${s.accountNo}-${s.deptNo}`;
    return this.txMap[key] ?? this.generateMockTx(s);
  }

  selectAccount(acc: FmsAccount): void {
    this.selected.set(acc);
    this.showTx.set(false);
  }

  loadTransactions(): void {
    this.txLoading.set(true);
    // Simulate API delay
    setTimeout(() => {
      this.txLoading.set(false);
      this.showTx.set(true);
    }, 600);
  }

  get txSummary() {
    const tx = this.transactions;
    return {
      totalDebit:  tx.reduce((s, t) => s + (t.debit  ?? 0), 0),
      totalCredit: tx.reduce((s, t) => s + (t.credit ?? 0), 0),
      count: tx.length,
    };
  }

  private generateMockTx(acc: FmsAccount): FmsTransaction[] {
    return [
      { date: '2026-04-15', type: 'Credit', description: 'Regular Deposit',    debit: null, credit: acc.balance * 0.3,  balance: acc.balance,               ref: `TXN-${acc.accountNo}-1` },
      { date: '2026-04-08', type: 'Debit',  description: 'Operational Charge', debit: acc.balance * 0.1, credit: null, balance: acc.balance * 0.7, ref: `TXN-${acc.accountNo}-2` },
      { date: '2026-03-31', type: 'Credit', description: 'Month-End Credit',   debit: null, credit: acc.balance * 0.4,  balance: acc.balance * 0.8, ref: `TXN-${acc.accountNo}-3` },
    ];
  }

  formatCurrency(n: number | null): string {
    if (n === null || n === 0) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }
}
