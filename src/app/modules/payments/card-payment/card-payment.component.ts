import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Account, Card } from '../../../core/services/api.service';
import { ScreenContextService } from '../../../core/services/screen-context.service';

@Component({
  selector: 'app-card-payment',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './card-payment.component.html',
  styleUrl: '../payments-shared.scss',
})
export class CardPaymentComponent implements OnInit {
  accounts = signal<Account[]>([]);
  cards = signal<Card[]>([]);
  selectedCard = signal<Card | null>(null);
  paymentType = signal<'minimum' | 'full' | 'custom'>('minimum');
  form = { fromAccount: '', cardId: '', customAmount: '' };
  loading = signal(false);
  success = signal('');
  error = signal('');

  constructor(private api: ApiService, private ctx: ScreenContextService) {}

  ngOnInit(): void {
    this.api.getAccounts().subscribe(a => this.accounts.set(a.filter(acc => acc.type === 'checking' || acc.type === 'savings')));
    this.api.getCards().subscribe(c => this.cards.set(c.filter(card => card.cardType === 'credit')));
  }

  onCardChange(): void {
    const card = this.cards().find(c => c._id === this.form.cardId) ?? null;
    this.selectedCard.set(card);
    this.ctx.updateFormState({ ...this.form, paymentType: this.paymentType() });
  }

  paymentAmount(): number {
    const card = this.selectedCard();
    if (!card) return 0;
    if (this.paymentType() === 'minimum') return card.minimumPayment ?? 0;
    if (this.paymentType() === 'full') return card.currentBalance;
    return +this.form.customAmount || 0;
  }

  submit(): void {
    this.loading.set(true); this.error.set(''); this.success.set('');
    this.api.makeCardPayment({ fromAccount: this.form.fromAccount, cardId: this.form.cardId, paymentType: this.paymentType(), customAmount: this.paymentAmount() }).subscribe({
      next: r => { this.loading.set(false); this.success.set(`Payment of ${this.paymentAmount().toLocaleString('en-US', { style: 'currency', currency: 'USD' })} submitted! Ref: ${r.transaction.referenceNumber}`); this.form = { fromAccount: '', cardId: '', customAmount: '' }; this.selectedCard.set(null); },
      error: e => { this.loading.set(false); this.error.set(e.error?.message || 'Payment failed.'); },
    });
  }
}
