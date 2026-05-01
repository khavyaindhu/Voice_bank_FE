import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type CardStatus = 'active' | 'frozen' | 'disputed' | 'expiring';
type CardType   = 'Debit' | 'Credit';
type FilterTab  = 'all' | CardStatus;

interface CardRecord {
  id:         string;
  customer:   string;
  customerId: string;
  type:       CardType;
  network:    'Visa' | 'Mastercard';
  masked:     string;
  status:     CardStatus;
  expiry:     string;
  issuedDate: string;
  disputes:   number;
  lastUsed:   string;
}

@Component({
  selector: 'app-staff-cards',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './staff-cards.component.html',
  styleUrl: './staff-cards.component.scss',
})
export class StaffCardsComponent {

  searchQ   = signal('');
  activeTab = signal<FilterTab>('all');
  selected  = signal<CardRecord | null>(null);

  readonly cards: CardRecord[] = [
    {
      id: 'CRD-001', customer: 'Vijaya Krishnamurthy', customerId: 'CUST-001',
      type: 'Debit',  network: 'Visa',       masked: '****1230',
      status: 'active',   expiry: '2027-08', issuedDate: '2021-08-01',
      disputes: 0, lastUsed: '2026-04-29',
    },
    {
      id: 'CRD-002', customer: 'Vijaya Krishnamurthy', customerId: 'CUST-001',
      type: 'Credit', network: 'Visa',       masked: '****4421',
      status: 'disputed', expiry: '2026-06', issuedDate: '2020-06-15',
      disputes: 2, lastUsed: '2026-04-18',
    },
    {
      id: 'CRD-003', customer: 'Ramesh Venkataraman', customerId: 'CUST-002',
      type: 'Debit',  network: 'Mastercard', masked: '****9210',
      status: 'active',   expiry: '2028-03', issuedDate: '2022-03-10',
      disputes: 0, lastUsed: '2026-04-28',
    },
    {
      id: 'CRD-004', customer: 'Green Valley Properties LLC', customerId: 'CUST-003',
      type: 'Debit',  network: 'Visa',       masked: '****2211',
      status: 'active',   expiry: '2026-06', issuedDate: '2021-06-01',
      disputes: 0, lastUsed: '2026-04-27',
    },
    {
      id: 'CRD-005', customer: 'Green Valley Properties LLC', customerId: 'CUST-003',
      type: 'Credit', network: 'Mastercard', masked: '****6670',
      status: 'expiring',  expiry: '2026-06', issuedDate: '2021-06-01',
      disputes: 0, lastUsed: '2026-04-10',
    },
    {
      id: 'CRD-006', customer: 'Kavya Indhu Thiyagarajan', customerId: 'CUST-004',
      type: 'Debit',  network: 'Visa',       masked: '****7712',
      status: 'active',   expiry: '2028-11', issuedDate: '2022-11-20',
      disputes: 0, lastUsed: '2026-04-30',
    },
    {
      id: 'CRD-007', customer: 'ABC Vendors LLC', customerId: 'CUST-005',
      type: 'Debit',  network: 'Mastercard', masked: '****9012',
      status: 'frozen',   expiry: '2027-05', issuedDate: '2020-05-30',
      disputes: 1, lastUsed: '2026-02-14',
    },
    {
      id: 'CRD-008', customer: 'Nayana Rajan', customerId: 'CUST-006',
      type: 'Debit',  network: 'Visa',       masked: '****5541',
      status: 'active',   expiry: '2027-11', issuedDate: '2021-11-18',
      disputes: 0, lastUsed: '2026-04-29',
    },
    {
      id: 'CRD-009', customer: 'Nayana Rajan', customerId: 'CUST-006',
      type: 'Credit', network: 'Mastercard', masked: '****8834',
      status: 'expiring',  expiry: '2026-05', issuedDate: '2020-05-01',
      disputes: 0, lastUsed: '2026-04-20',
    },
  ];

  readonly tabs: { key: FilterTab; label: string }[] = [
    { key: 'all',      label: 'All Cards' },
    { key: 'frozen',   label: 'Frozen' },
    { key: 'disputed', label: 'Disputed' },
    { key: 'expiring', label: 'Expiring Soon' },
    { key: 'active',   label: 'Active' },
  ];

  filtered = computed(() => {
    const q   = this.searchQ().toLowerCase().trim();
    const tab = this.activeTab();
    return this.cards.filter(c => {
      const matchTab = tab === 'all' || c.status === tab;
      const matchQ   = !q ||
        c.customer.toLowerCase().includes(q) ||
        c.masked.includes(q) ||
        c.customerId.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q);
      return matchTab && matchQ;
    });
  });

  get stats() {
    return {
      total:    this.cards.length,
      frozen:   this.cards.filter(c => c.status === 'frozen').length,
      disputed: this.cards.filter(c => c.status === 'disputed').length,
      expiring: this.cards.filter(c => c.status === 'expiring').length,
    };
  }

  countFor(tab: FilterTab): number {
    if (tab === 'all') return this.cards.length;
    return this.cards.filter(c => c.status === tab).length;
  }

  selectCard(c: CardRecord): void {
    this.selected.set(this.selected()?.id === c.id ? null : c);
  }

  toggleFreeze(c: CardRecord, event: Event): void {
    event.stopPropagation();
    c.status = c.status === 'frozen' ? 'active' : 'frozen';
  }

  statusLabel(s: CardStatus): string {
    return s === 'expiring' ? 'Expiring Soon' : s.charAt(0).toUpperCase() + s.slice(1);
  }

  networkIcon(n: 'Visa' | 'Mastercard'): string {
    return n === 'Visa' ? '💳' : '🔵';
  }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}
