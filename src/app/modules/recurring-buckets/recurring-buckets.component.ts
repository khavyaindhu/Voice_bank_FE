import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Account, CreateRecurringItemPayload, RecurringBucket, RecurringCategory, RecurringItem } from '../../core/services/api.service';
import { RecurringBucketService } from '../../core/services/recurring-bucket.service';
import { RecurringBucketContextService } from '../../core/services/recurring-bucket-context.service';
import { PaymentHistoryService } from '../../core/services/payment-history.service';
import { PayeeService } from '../../core/services/payee.service';

@Component({
  selector: 'app-recurring-buckets',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './recurring-buckets.component.html',
  styleUrl: './recurring-buckets.component.scss',
})
export class RecurringBucketsComponent implements OnInit {
  private api = inject(ApiService);
  bucketSvc = inject(RecurringBucketService);
  private bucketCtx = inject(RecurringBucketContextService);
  private paymentHistory = inject(PaymentHistoryService);
  payeeSvc = inject(PayeeService);

  accounts = signal<Account[]>([]);
  selectedId = signal<string | null>(null);
  payingAll = signal(false);
  payResult = signal<string | null>(null);
  showPayAllReview = signal(false);

  showAddItem = signal(false);
  editItemId = signal<string | null>(null);

  itemForm: CreateRecurringItemPayload = this.emptyItemForm();

  readonly categories: { value: RecurringCategory; label: string }[] = [
    { value: 'rent', label: 'Rent' },
    { value: 'emi', label: 'EMI / Loan' },
    { value: 'subscription', label: 'Subscription' },
    { value: 'utility', label: 'Utility' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'other', label: 'Other' },
  ];

  constructor() {
    effect(() => {
      const nick = this.bucketCtx.viewBucketNickname();
      if (!nick) return;
      const bucket = this.bucketSvc.findByNickname(nick);
      if (bucket) this.selectedId.set(bucket.id);
    });

    effect(() => {
      const nick = this.bucketCtx.payAllReviewNickname();
      if (!nick) return;
      const bucket = this.bucketSvc.findByNickname(nick);
      if (bucket) {
        this.selectedId.set(bucket.id);
        this.openPayAllReview();
      }
      this.bucketCtx.payAllReviewNickname.set('');
    });
  }

  ngOnInit(): void {
    this.api.getAccounts().subscribe({ next: a => this.accounts.set(a), error: () => {} });
    this.payeeSvc.load();
    this.bucketSvc.load();
  }

  get selected(): RecurringBucket | undefined {
    const id = this.selectedId();
    return this.bucketSvc.buckets().find(b => b.id === id);
  }

  selectBucket(id: string): void {
    this.selectedId.set(id);
    this.payResult.set(null);
    this.showPayAllReview.set(false);
    this.cancelItemForm();
  }

  formatAmount(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }

  catLabel(cat: string): string {
    const m: Record<string, string> = {
      rent: 'Rent', emi: 'EMI', subscription: 'Subscription',
      utility: 'Utility', maintenance: 'Maintenance', other: 'Other',
    };
    return m[cat] ?? cat;
  }

  catIcon(cat: string): string {
    const m: Record<string, string> = {
      rent: 'home', emi: 'directions_car', subscription: 'movie',
      utility: 'bolt', maintenance: 'build', other: 'receipt',
    };
    return m[cat] ?? 'receipt';
  }

  pickDebitAccount(): string {
    const all = this.accounts();
    return (
      all.find(a => a.type === 'checking')?._id ??
      all.find(a => a.type === 'savings')?._id ??
      all[0]?._id ??
      ''
    );
  }

  openPayAllReview(): void {
    const bucket = this.selected;
    if (!bucket || bucket.items.length === 0) return;
    this.payResult.set(null);
    this.showPayAllReview.set(true);
  }

  cancelPayAllReview(): void {
    this.showPayAllReview.set(false);
  }

  async confirmPayAll(): Promise<void> {
    const bucket = this.selected;
    if (!bucket || this.payingAll()) return;

    const fromAccount = this.pickDebitAccount();
    if (!fromAccount) {
      this.payResult.set('No debit account available.');
      return;
    }

    this.payingAll.set(true);
    this.payResult.set(null);
    try {
      const res = await this.bucketSvc.payAll(bucket.id, fromAccount);
      this.paymentHistory.notifyPaymentRecorded();
      const fmt = this.formatAmount(res.totalPaid);
      this.payResult.set(
        `✅ Paid ${res.transactions.length} bills — ${fmt} total.` +
        (res.errors.length ? ` (${res.errors.length} skipped)` : '')
      );
      this.showPayAllReview.set(false);
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message ?? 'Pay-all failed.';
      this.payResult.set(msg);
    } finally {
      this.payingAll.set(false);
    }
  }

  startAddItem(): void {
    this.itemForm = this.emptyItemForm();
    this.editItemId.set(null);
    this.showAddItem.set(true);
  }

  startEditItem(item: RecurringItem): void {
    this.itemForm = {
      name: item.name,
      category: item.category,
      amount: item.amount,
      payeeId: item.payeeId,
      dayOfMonth: item.dayOfMonth,
      aliases: [...(item.aliases ?? [])],
      notes: item.notes,
    };
    this.editItemId.set(item.id);
    this.showAddItem.set(true);
  }

  cancelItemForm(): void {
    this.showAddItem.set(false);
    this.editItemId.set(null);
    this.itemForm = this.emptyItemForm();
  }

  async saveItem(): Promise<void> {
    const bucket = this.selected;
    if (!bucket || !this.itemForm.name.trim() || !this.itemForm.amount) return;

    try {
      if (this.editItemId()) {
        await this.bucketSvc.updateItem(bucket.id, this.editItemId()!, this.itemForm);
      } else {
        await this.bucketSvc.addItem(bucket.id, this.itemForm);
      }
      this.cancelItemForm();
    } catch {
      /* keep form open */
    }
  }

  async removeItem(item: RecurringItem): Promise<void> {
    const bucket = this.selected;
    if (!bucket) return;
    await this.bucketSvc.deleteItem(bucket.id, item.id);
  }

  isFlashing(itemId: string): boolean {
    return this.bucketCtx.flashItemId() === itemId;
  }

  debitAccountLabel(): string {
    const id = this.pickDebitAccount();
    const acc = this.accounts().find(a => a._id === id);
    return acc ? `${acc.nickname} (${acc.maskedNumber})` : 'Checking account';
  }

  private emptyItemForm(): CreateRecurringItemPayload {
    return {
      name: '',
      category: 'other',
      amount: 0,
      dayOfMonth: 1,
      aliases: [],
      notes: '',
    };
  }
}
