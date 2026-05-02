import { Component, signal, OnInit, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ApiService,
  MonthSummaryApi,
  TopCustomerApi,
  LedgerEntryApi,
  DeptRowApi,
} from '../../../core/services/api.service';
import { StaffContextService } from '../../../core/services/staff-context.service';

type SectionTab = 'overview' | 'transactions' | 'departments' | 'exports';
type Preset = 'currentmonth' | 'lastmonth' | 'lastweek' | 'last3months' | 'ytd' | 'custom';

const DEPT_LABELS: Record<string, { name: string; color: string }> = {
  payroll:           { name: 'Salary & Wages',       color: '#818CF8' },
  deposit:           { name: 'Customer Deposits',    color: '#34D399' },
  withdrawal:        { name: 'Withdrawals / ATM',    color: '#F87171' },
  ach_transfer:      { name: 'ACH Transfers',        color: '#38BDF8' },
  wire_transfer:     { name: 'Wire Transfers',       color: '#60A5FA' },
  zelle:             { name: 'Zelle Payments',       color: '#A78BFA' },
  loan_payment:      { name: 'Loan Payments',        color: '#FBBF24' },
  interest_credit:   { name: 'Interest Income',      color: '#34D399' },
  card_payment:      { name: 'Card Payments',        color: '#F472B6' },
  vendor_payment:    { name: 'Vendor Payments',      color: '#FB923C' },
  utility_payment:   { name: 'Utility Payments',     color: '#94A3B8' },
  fee:               { name: 'Fees & Charges',       color: '#DC2626' },
  month_end_accrual: { name: 'Month-End Accruals',   color: '#6B7280' },
};

interface ReportExport {
  title:  string;
  desc:   string;
  icon:   string;
  format: 'CSV' | 'PDF';
  preset: Preset;
}

@Component({
  selector: 'app-staff-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './staff-reports.component.html',
  styleUrl: './staff-reports.component.scss',
})
export class StaffReportsComponent implements OnInit {
  private api      = inject(ApiService);
  private staffCtx = inject(StaffContextService);

  // ── UI state ──────────────────────────────────────────────────────
  activeSection = signal<SectionTab>('overview');
  preset        = signal<Preset>('ytd');
  customFrom    = signal('2026-01-01');
  customTo      = signal('2026-04-30');

  // ── Loading flags ─────────────────────────────────────────────────
  summaryLoading = signal(true);
  txLoading      = signal(false);
  deptLoading    = signal(false);
  generating     = signal<string | null>(null);

  // ── Data ──────────────────────────────────────────────────────────
  monthlySummary = signal<MonthSummaryApi[]>([]);
  topCustomers   = signal<TopCustomerApi[]>([]);
  totals         = signal({ totalCredits: 0, totalDebits: 0, txCount: 0 });
  dateRangeLabel = signal('');

  // Transactions
  txEntries    = signal<LedgerEntryApi[]>([]);
  txTotal      = signal(0);
  txPage       = signal(1);
  txPages      = signal(1);
  txCustFilter = signal('all');
  txTypeFilter = signal('');
  customers    = signal<{ displayId: string; name: string }[]>([]);

  // Departments
  deptRows = signal<DeptRowApi[]>([]);

  // ── Preset options ────────────────────────────────────────────────
  readonly presets: { key: Preset; label: string }[] = [
    { key: 'currentmonth', label: 'Current Month' },
    { key: 'lastmonth',    label: 'Last Month' },
    { key: 'lastweek',     label: 'Last 7 Days' },
    { key: 'last3months',  label: 'Last 3 Months' },
    { key: 'ytd',          label: 'Year to Date' },
    { key: 'custom',       label: 'Custom Range' },
  ];

  readonly exportReports: ReportExport[] = [
    { title: 'April 2026 – Transaction Export',     desc: 'All ledger entries for April',               icon: 'table_chart',    format: 'CSV', preset: 'currentmonth' },
    { title: 'March 2026 – Transaction Export',     desc: 'All ledger entries for March',               icon: 'table_chart',    format: 'CSV', preset: 'lastmonth'    },
    { title: 'Q1 2026 – Summary Report',            desc: 'Quarterly rollup: Jan–Mar 2026',              icon: 'summarize',      format: 'PDF', preset: 'last3months'  },
    { title: 'YTD 2026 – Department Budget Report', desc: 'Budget vs actuals by category, YTD',          icon: 'pie_chart',      format: 'PDF', preset: 'ytd'          },
    { title: 'April 2026 – Salary & Wages',         desc: 'Payroll disbursements for current month',     icon: 'payments',       format: 'PDF', preset: 'currentmonth' },
    { title: 'April 2026 – Loan Payment Report',    desc: 'All loan repayments received in April',       icon: 'account_balance',format: 'CSV', preset: 'currentmonth' },
    { title: 'FY 2025 – Annual Report',             desc: 'Full year consolidated financials (mock)',    icon: 'library_books',  format: 'PDF', preset: 'ytd'          },
  ];

  constructor() {
    // Reactively respond to Maya setting a report preset —
    // works even when the component is already mounted
    effect(() => {
      const preset = this.staffCtx.reportPreset();
      if (!preset) return;

      // Apply preset
      this.preset.set(preset as Preset);

      // Apply section
      const section = (this.staffCtx.reportSection() || 'overview') as SectionTab;
      this.activeSection.set(section);

      // Apply customer filter for transactions
      // Match by name OR by customer ID (with normalisation so speech-spelled
      // IDs like "c u s t 003" collapse to "cust003" matching "CUST-003").
      const customerName = this.staffCtx.reportCustomer();
      if (customerName && section === 'transactions') {
        const norm = (s: string) => s.replace(/[\s\-_]/g, '').toLowerCase();
        const qn   = norm(customerName);
        const match = this.customers().find(c =>
          c.name.toLowerCase().includes(customerName.toLowerCase()) ||
          norm(c.displayId).includes(qn) ||
          qn.includes(norm(c.displayId))
        );
        this.txCustFilter.set(match ? match.displayId : 'all');
        this.txPage.set(1);
      }

      // Load data
      this.loadSummary();
      if (section === 'transactions') this.loadTransactions();
      if (section === 'departments')  this.loadDepartments();

      this.staffCtx.setReport('', '', ''); // clear after consuming
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.api.getReportCustomers().subscribe(c => this.customers.set(c));
    this.loadSummary();
  }

  // ── Loaders ───────────────────────────────────────────────────────

  private buildParams() {
    const p = this.preset();
    if (p === 'custom') {
      return { from: this.customFrom(), to: this.customTo() };
    }
    return { preset: p };
  }

  loadSummary(): void {
    this.summaryLoading.set(true);
    this.api.getReportSummary(this.buildParams()).subscribe({
      next: data => {
        this.monthlySummary.set(data.monthlySummary);
        this.topCustomers.set(data.topCustomers);
        this.totals.set(data.totals);
        const from = new Date(data.dateRange.from).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const to   = new Date(data.dateRange.to).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        this.dateRangeLabel.set(`${from} – ${to}`);
        this.summaryLoading.set(false);
      },
      error: () => this.summaryLoading.set(false),
    });
  }

  loadTransactions(): void {
    this.txLoading.set(true);
    const params = {
      ...this.buildParams(),
      customerId: this.txCustFilter() !== 'all' ? this.txCustFilter() : undefined,
      entryType:  this.txTypeFilter() || undefined,
      page:       String(this.txPage()),
      limit:      '50',
    };
    this.api.getReportTransactions(params).subscribe({
      next: data => {
        this.txEntries.set(data.entries);
        this.txTotal.set(data.total);
        this.txPage.set(data.page);
        this.txPages.set(data.pages);
        this.txLoading.set(false);
      },
      error: () => this.txLoading.set(false),
    });
  }

  loadDepartments(): void {
    this.deptLoading.set(true);
    this.api.getReportDepartments(this.buildParams()).subscribe({
      next: data => { this.deptRows.set(data.departments); this.deptLoading.set(false); },
      error: () => this.deptLoading.set(false),
    });
  }

  applyFilter(): void {
    this.loadSummary();
    const section = this.activeSection();
    if (section === 'transactions') this.loadTransactions();
    if (section === 'departments')  this.loadDepartments();
  }

  switchSection(s: SectionTab): void {
    this.activeSection.set(s);
    if (s === 'transactions' && this.txEntries().length === 0) this.loadTransactions();
    if (s === 'departments'  && this.deptRows().length === 0)  this.loadDepartments();
  }

  txPageChange(p: number): void {
    this.txPage.set(p);
    this.loadTransactions();
  }

  simulateDownload(r: ReportExport): void {
    this.generating.set(r.title);
    setTimeout(() => this.generating.set(null), 1800);
  }

  // ── Helpers ───────────────────────────────────────────────────────

  deptLabel(category: string): string {
    return DEPT_LABELS[category]?.name ?? category;
  }

  deptColor(category: string): string {
    return DEPT_LABELS[category]?.color ?? '#9CA3AF';
  }

  creditRatio(row: DeptRowApi): number {
    const total = row.credits + row.debits;
    return total === 0 ? 0 : Math.round(row.credits / total * 100);
  }

  barWidth(val: number): number {
    const rows = this.monthlySummary();
    const max = Math.max(...rows.map(m => Math.max(m.credits, m.debits)), 1);
    return Math.round(val / max * 100);
  }

  fmt(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  }

  fmtK(n: number): string {
    if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000)     return '$' + (n / 1_000).toFixed(0) + 'K';
    return '$' + n;
  }

  fmtDate(d: string): string {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}
