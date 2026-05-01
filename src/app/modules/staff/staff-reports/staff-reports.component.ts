import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface MonthSummary {
  month:   string;
  credits: number;
  debits:  number;
  txCount: number;
  net:     number;
}

interface DeptSummary {
  dept:    string;
  deptNo:  string;
  credits: number;
  debits:  number;
  balance: number;
  color:   string;
}

interface ReportItem {
  title:    string;
  desc:     string;
  icon:     string;
  type:     string;
  period:   string;
  status:   'ready' | 'generating';
}

@Component({
  selector: 'app-staff-reports',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './staff-reports.component.html',
  styleUrl: './staff-reports.component.scss',
})
export class StaffReportsComponent {

  activeSection = signal<'overview' | 'monthly' | 'dept' | 'exports'>('overview');
  generating = signal<string | null>(null);

  readonly monthlySummary: MonthSummary[] = [
    { month: 'January 2026',  credits: 1240000, debits: 980000,  txCount: 3412, net:  260000 },
    { month: 'February 2026', credits: 1180000, debits: 1050000, txCount: 3108, net:  130000 },
    { month: 'March 2026',    credits: 1390000, debits: 1120000, txCount: 3756, net:  270000 },
    { month: 'April 2026',    credits: 1520000, debits: 1210000, txCount: 4021, net:  310000 },
  ];

  readonly deptSummary: DeptSummary[] = [
    { dept: 'General Operations',    deptNo: '0',   credits: 2800000, debits: 2100000, balance: 1200000, color: '#38BDF8' },
    { dept: 'Branch – Teller',        deptNo: '1',   credits: 890000,  debits: 720000,  balance:  340920, color: '#818CF8' },
    { dept: 'Facilities & Admin',     deptNo: '2',   credits: 340000,  debits: 410000,  balance:       0, color: '#FB923C' },
    { dept: 'Finance & Compliance',   deptNo: '3',   credits: 1100000, debits: 860000,  balance:   51700, color: '#34D399' },
    { dept: 'Loan Operations',        deptNo: '4',   credits: 760000,  debits: 590000,  balance:   12800, color: '#F472B6' },
    { dept: 'Digital & IT',           deptNo: '5',   credits: 420000,  debits: 380000,  balance:   42000, color: '#FBBF24' },
    { dept: 'Vault & Cash Mgmt',      deptNo: '100', credits: 3200000, debits: 2950000, balance:  335000, color: '#60A5FA' },
  ];

  readonly reportItems: ReportItem[] = [
    { title: 'April 2026 – Transaction Export',      desc: 'Full ledger export for April with all debit/credit entries',   icon: 'table_chart',   type: 'CSV',  period: 'Apr 2026', status: 'ready' },
    { title: 'Q1 2026 – Summary Report',             desc: 'Quarterly rollup: Jan–Mar 2026 across all departments',         icon: 'summarize',     type: 'PDF',  period: 'Q1 2026',  status: 'ready' },
    { title: 'YTD 2026 – Department Budget Report',  desc: 'Budget vs actuals by department, year-to-date',                 icon: 'pie_chart',     type: 'PDF',  period: 'YTD 2026', status: 'ready' },
    { title: 'April 2026 – Salary & Wages Report',   desc: 'Payroll disbursements breakdown for current month',             icon: 'payments',      type: 'PDF',  period: 'Apr 2026', status: 'ready' },
    { title: 'April 2026 – Loan Interest Income',    desc: 'Interest income accruals and collections for the month',        icon: 'account_balance',type: 'CSV', period: 'Apr 2026', status: 'ready' },
    { title: 'April 2026 – Fee Income Report',       desc: 'Transaction fee income breakdown by product and channel',       icon: 'receipt_long',  type: 'CSV',  period: 'Apr 2026', status: 'ready' },
    { title: 'FY 2025 – Annual Report',              desc: 'Full year consolidated financials — requires compliance sign-off', icon: 'library_books', type: 'PDF', period: 'FY 2025',  status: 'ready' },
  ];

  get ytdTotals() {
    return {
      credits:  this.monthlySummary.reduce((s, m) => s + m.credits, 0),
      debits:   this.monthlySummary.reduce((s, m) => s + m.debits,  0),
      txCount:  this.monthlySummary.reduce((s, m) => s + m.txCount, 0),
      net:      this.monthlySummary.reduce((s, m) => s + m.net,     0),
    };
  }

  /** Width % for bar chart (relative to max month credits) */
  barWidth(val: number, _type: 'credit' | 'debit'): number {
    const max = Math.max(...this.monthlySummary.map(m => Math.max(m.credits, m.debits)));
    return Math.round((val / max) * 100);
  }

  creditRatio(d: DeptSummary): number {
    return Math.round(d.credits / (d.credits + d.debits) * 100);
  }

  simulateDownload(item: ReportItem): void {
    this.generating.set(item.title);
    setTimeout(() => this.generating.set(null), 1800);
  }

  fmt(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  }

  fmtK(n: number): string {
    return n >= 1000000
      ? '$' + (n / 1000000).toFixed(2) + 'M'
      : '$' + (n / 1000).toFixed(0) + 'K';
  }
}
