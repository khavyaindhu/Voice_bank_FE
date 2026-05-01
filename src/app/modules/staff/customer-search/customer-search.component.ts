import { Component, signal, computed, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StaffContextService } from '../../../core/services/staff-context.service';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  type: 'individual' | 'business';
  since: string;
  status: 'active' | 'inactive' | 'frozen';
  accounts: { type: string; masked: string; balance: number }[];
}

@Component({
  selector: 'app-customer-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customer-search.component.html',
  styleUrl: './customer-search.component.scss',
})
export class CustomerSearchComponent implements OnInit {
  private staffCtx = inject(StaffContextService);

  searchQ  = signal('');
  selected = signal<Customer | null>(null);

  constructor() {
    // Reactively respond to Maya setting a new customer query —
    // works even when the component is already mounted (same-route navigation)
    effect(() => {
      const q = this.staffCtx.customerQuery();
      if (!q) return;
      this.searchQ.set(q);
      const match = this.customers.find(c =>
        c.name.toLowerCase().includes(q.toLowerCase()) ||
        c.id.toLowerCase().includes(q.toLowerCase())
      );
      if (match) this.selected.set(match);
      this.staffCtx.setCustomerSearch(''); // clear after consuming
    });
  }

  ngOnInit(): void {}

  readonly customers: Customer[] = [
    {
      id: 'CUST-001', name: 'Vijaya Krishnamurthy', email: 'vijaya.k@example.com',
      phone: '+1-415-555-0101', type: 'individual', since: '2019-03-15', status: 'active',
      accounts: [
        { type: 'Checking', masked: '****1230', balance: 24500 },
        { type: 'Savings',  masked: '****4421', balance: 88000 },
      ],
    },
    {
      id: 'CUST-002', name: 'Ramesh Venkataraman', email: 'ramesh.v@example.com',
      phone: '+1-312-555-0188', type: 'individual', since: '2015-07-22', status: 'active',
      accounts: [
        { type: 'Checking', masked: '****9210', balance: 12400 },
        { type: 'RD',       masked: '****3311', balance: 45000 },
      ],
    },
    {
      id: 'CUST-003', name: 'Green Valley Properties LLC', email: 'accounts@greenvalley.com',
      phone: '+1-800-555-0242', type: 'business', since: '2021-01-10', status: 'active',
      accounts: [
        { type: 'Checking', masked: '****2211', balance: 320000 },
        { type: 'Checking', masked: '****6670', balance: 15000 },
      ],
    },
    {
      id: 'CUST-004', name: 'Kavya Indhu Thiyagarajan', email: 'kavya.t@example.com',
      phone: '+1-214-555-0133', type: 'individual', since: '2022-09-05', status: 'active',
      accounts: [
        { type: 'Checking', masked: '****7712', balance: 8900 },
        { type: 'Savings',  masked: '****8823', balance: 22000 },
      ],
    },
    {
      id: 'CUST-005', name: 'ABC Vendors LLC', email: 'ops@abcvendors.com',
      phone: '+1-212-555-0198', type: 'business', since: '2018-05-30', status: 'frozen',
      accounts: [
        { type: 'Checking', masked: '****9012', balance: 0 },
      ],
    },
    {
      id: 'CUST-006', name: 'Nayana Rajan', email: 'nayana.r@example.com',
      phone: '+1-510-555-0144', type: 'individual', since: '2020-11-18', status: 'active',
      accounts: [
        { type: 'Checking', masked: '****5541', balance: 31000 },
      ],
    },
  ];

  filtered = computed(() => {
    const q = this.searchQ().toLowerCase().trim();
    if (!q) return this.customers;
    return this.customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      c.phone.includes(q)
    );
  });

  select(c: Customer): void { this.selected.set(c); }

  totalBalance(c: Customer): number {
    return c.accounts.reduce((s, a) => s + a.balance, 0);
  }

  fmt(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }

  statusColor(s: string): string {
    return s === 'active' ? 'green' : s === 'frozen' ? 'blue' : 'gray';
  }
}
