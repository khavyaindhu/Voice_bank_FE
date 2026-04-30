import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { ApiService, Account, CreatePayeePayload } from '../../core/services/api.service';
import { PayeeService, Payee, TransferType, PayeeCategory } from '../../core/services/payee.service';

type ActiveView = 'list' | 'add' | 'pay';

interface PayForm {
  fromAccount: string;
  amount: string;
  memo: string;
}

interface AddForm {
  nickname: string;
  fullName: string;
  bankName: string;
  routingNumber: string;
  accountNumber: string;
  confirmAccountNumber: string;
  accountType: 'checking' | 'savings';
  transferType: TransferType;
  category: PayeeCategory;
}

@Component({
  selector: 'app-payees',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payees.component.html',
  styleUrl: './payees.component.scss',
})
export class PayeesComponent implements OnInit {
  private api   = inject(ApiService);
  payeeSvc      = inject(PayeeService);

  // ── State ────────────────────────────────────────────────────────
  accounts  = signal<Account[]>([]);
  searchQ   = signal('');
  view      = signal<ActiveView>('list');
  selected  = signal<Payee | null>(null);

  // Processing / feedback
  paying    = signal(false);
  payResult = signal<{ success: boolean; ref: string } | null>(null);
  saving    = signal(false);
  saveError = signal('');
  deleteId  = signal<string | null>(null);   // id pending delete confirm

  // ── Forms ────────────────────────────────────────────────────────
  payForm: PayForm = { fromAccount: '', amount: '', memo: '' };

  addForm: AddForm = {
    nickname: '', fullName: '', bankName: '',
    routingNumber: '', accountNumber: '', confirmAccountNumber: '',
    accountType: 'checking', transferType: 'ach', category: 'business',
  };

  // ── Computed ─────────────────────────────────────────────────────
  filtered = computed(() => {
    const q = this.searchQ().toLowerCase().trim();
    if (!q) return this.payeeSvc.payees();
    return this.payeeSvc.payees().filter(p =>
      p.nickname.toLowerCase().includes(q) ||
      p.fullName.toLowerCase().includes(q) ||
      p.bankName.toLowerCase().includes(q)
    );
  });

  get checkingAccounts(): Account[] {
    return this.accounts().filter(a => a.type === 'checking' || a.type === 'savings');
  }

  get addFormValid(): boolean {
    const f = this.addForm;
    return !!(f.nickname && f.fullName && f.bankName &&
      f.routingNumber.length === 9 &&
      f.accountNumber.length >= 4 &&
      f.accountNumber === f.confirmAccountNumber);
  }

  get payFormValid(): boolean {
    return !!(this.payForm.fromAccount &&
      parseFloat(this.payForm.amount) > 0);
  }

  // ── Lifecycle ────────────────────────────────────────────────────
  ngOnInit(): void {
    // Load accounts for the pay-from selector
    this.api.getAccounts().subscribe({
      next: a => {
        this.accounts.set(a.filter(acc => acc.type === 'checking' || acc.type === 'savings'));
        if (this.accounts().length) {
          this.payForm.fromAccount = this.accounts()[0]._id;
        }
      },
    });
    // Load payees from backend
    this.payeeSvc.load();
  }

  // ── Navigation ───────────────────────────────────────────────────
  openAddDrawer(): void {
    this.addForm = {
      nickname: '', fullName: '', bankName: '',
      routingNumber: '', accountNumber: '', confirmAccountNumber: '',
      accountType: 'checking', transferType: 'ach', category: 'business',
    };
    this.saveError.set('');
    this.view.set('add');
  }

  openPayModal(payee: Payee): void {
    this.selected.set(payee);
    this.payForm = {
      fromAccount: this.accounts()[0]?._id ?? '',
      amount: '',
      memo: '',
    };
    this.payResult.set(null);
    this.view.set('pay');
  }

  closeOverlay(): void {
    this.view.set('list');
    this.selected.set(null);
    this.paying.set(false);
    this.payResult.set(null);
    this.saveError.set('');
  }

  // ── Add payee ────────────────────────────────────────────────────
  async savePayee(): Promise<void> {
    if (!this.addFormValid) return;
    const f = this.addForm;

    if (f.accountNumber !== f.confirmAccountNumber) {
      this.saveError.set('Account numbers do not match.');
      return;
    }

    this.saving.set(true);
    try {
      const payload: CreatePayeePayload = {
        nickname:      f.nickname.trim(),
        fullName:      f.fullName.trim(),
        bankName:      f.bankName.trim(),
        routingNumber: f.routingNumber.trim(),
        accountNumber: f.accountNumber.trim(),
        accountType:   f.accountType,
        transferType:  f.transferType,
        category:      f.category,
      };
      await this.payeeSvc.add(payload);
      this.view.set('list');
    } catch (err: any) {
      this.saveError.set(err?.error?.message ?? 'Failed to save payee. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  // ── Delete payee ─────────────────────────────────────────────────
  confirmDelete(id: string): void { this.deleteId.set(id); }
  cancelDelete(): void            { this.deleteId.set(null); }

  async executeDelete(): Promise<void> {
    const id = this.deleteId();
    if (!id) return;
    try {
      await this.payeeSvc.delete(id);
    } catch { /* non-fatal UI */ }
    this.deleteId.set(null);
  }

  // ── Send payment ─────────────────────────────────────────────────
  async sendPayment(): Promise<void> {
    const payee = this.selected();
    if (!payee || !this.payFormValid) return;

    this.paying.set(true);
    const amount = parseFloat(this.payForm.amount);

    try {
      let ref = '';

      if (payee.transferType === 'wire') {
        const res = await lastValueFrom(this.api.initiateWire({
          fromAccount:   this.payForm.fromAccount,
          recipientName: payee.fullName,
          recipientBank: payee.bankName,
          routingNumber: payee.routingNumber,
          amount,
          memo:          this.payForm.memo || `Quick Pay to ${payee.nickname}`,
        }));
        ref = res?.transaction?.referenceNumber ?? 'WIRE-REF';
      } else {
        const res = await lastValueFrom(this.api.initiateACH({
          fromAccount:   this.payForm.fromAccount,
          toAccount:     payee.accountNumber,
          recipientName: payee.fullName,
          routingNumber: payee.routingNumber,
          amount,
          memo:          this.payForm.memo || `Quick Pay to ${payee.nickname}`,
        }));
        ref = res?.transaction?.referenceNumber ?? 'ACH-REF';
      }

      await this.payeeSvc.recordPayment(payee.id, amount);
      this.payResult.set({ success: true, ref });
    } catch (err: any) {
      this.payResult.set({ success: false, ref: err?.error?.message ?? 'Payment failed.' });
    } finally {
      this.paying.set(false);
    }
  }

  // ── Helpers exposed to template ──────────────────────────────────
  readonly masked    = PayeeService.masked;
  readonly initials  = PayeeService.initials;
  readonly catIcon   = PayeeService.categoryIcon;
  readonly txLabel   = PayeeService.transferLabel;

  categoryOptions: { value: PayeeCategory; label: string }[] = [
    { value: 'business', label: 'Business' },
    { value: 'personal', label: 'Personal' },
    { value: 'family',   label: 'Family' },
    { value: 'utility',  label: 'Utility' },
  ];

  transferTypeOptions: { value: TransferType; label: string; hint: string }[] = [
    { value: 'ach',  label: 'ACH Transfer',  hint: 'Recurring / payroll · 1–3 days · Free' },
    { value: 'wire', label: 'Wire Transfer',  hint: 'High-value / same-day · Fee applies' },
  ];

  formatCurrency(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }

  accountLabel(acc: Account): string {
    return `${acc.nickname} (${acc.maskedNumber}) — $${acc.availableBalance.toLocaleString()} avail.`;
  }
}
