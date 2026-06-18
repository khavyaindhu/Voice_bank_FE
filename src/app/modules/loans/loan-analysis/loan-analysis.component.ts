import {
  Component,
  OnDestroy,
  OnInit,
  ViewChild,
  ElementRef,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { ApiService, LoanEmiProgress } from '../../../core/services/api.service';
import { LoanContextService } from '../../../core/services/loan-context.service';

Chart.register(...registerables);

type LoanTypeParam = 'auto' | 'home';

@Component({
  selector: 'app-loan-analysis',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './loan-analysis.component.html',
  styleUrl: './loan-analysis.component.scss',
})
export class LoanAnalysisComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private loanCtx = inject(LoanContextService);

  @ViewChild('balanceDonut') balanceDonut?: ElementRef<HTMLCanvasElement>;
  @ViewChild('installmentDonut') installmentDonut?: ElementRef<HTMLCanvasElement>;
  @ViewChild('cumulativeLine') cumulativeLine?: ElementRef<HTMLCanvasElement>;

  progress = signal<LoanEmiProgress | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  loanType = signal<LoanTypeParam>('auto');

  /** Used in template — `@if (x as p)` alias is not visible inside `@for`. */
  readonly paymentList = computed(() => this.progress()?.payments ?? []);
  readonly paymentCount = computed(() => this.paymentList().length);
  readonly totalPaidAmount = computed(() => this.progress()?.totalPaid ?? 0);

  private balanceChart?: Chart;
  private installmentChart?: Chart;
  private lineChart?: Chart;

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const type = (params.get('loanType') ?? 'auto').toLowerCase() as LoanTypeParam;
      this.loanType.set(type === 'home' ? 'home' : 'auto');
      this.loadProgress();
    });
  }

  private loadProgress(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getLoanEmiProgressByType(this.loanType()).subscribe({
      next: data => {
        this.progress.set(data);
        this.loading.set(false);
        setTimeout(() => this.renderCharts(), 120);
      },
      error: () => {
        this.error.set(
          'Could not load EMI history. Re-seed the database and log out/in (johndoe / Demo@1234).',
        );
        this.loading.set(false);
      },
    });
  }

  pageTitle(): string {
    return this.loanType() === 'auto' ? 'Car Loan EMI Analysis' : 'Home Loan EMI Analysis';
  }

  pageIcon(): string {
    return this.loanType() === 'auto' ? 'directions_car' : 'home';
  }

  sortedPayments() {
    const p = this.progress()?.payments ?? [];
    return [...p].sort(
      (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
    );
  }

  private renderCharts(): void {
    const data = this.progress();
    if (!data) return;

    const tickColor = '#374151';
    const gridColor = '#E5E7EB';
    const principalRepaid = data.principalRepaid;
    const outstanding = data.loan.outstandingBalance;

    if (this.balanceDonut?.nativeElement) {
      this.balanceChart?.destroy();
      this.balanceChart = new Chart(this.balanceDonut.nativeElement, {
        type: 'doughnut',
        data: {
          labels: ['Principal repaid', 'Outstanding'],
          datasets: [{
            data: [principalRepaid, outstanding],
            backgroundColor: ['#059669', '#E5E7EB'],
            borderColor: '#ffffff',
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 }, color: tickColor } },
            tooltip: {
              callbacks: {
                label: ctx => `${ctx.label}: ${this.fmt(Number(ctx.parsed))}`,
              },
            },
          },
        },
      });
    }

    if (this.installmentDonut?.nativeElement) {
      this.installmentChart?.destroy();
      this.installmentChart = new Chart(this.installmentDonut.nativeElement, {
        type: 'doughnut',
        data: {
          labels: ['Installments paid', 'Remaining'],
          datasets: [{
            data: [data.installmentsPaid, data.installmentsRemaining],
            backgroundColor: ['#002E6D', '#93C5FD'],
            borderColor: '#ffffff',
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 }, color: tickColor } },
            tooltip: {
              callbacks: {
                label: ctx => `${ctx.label}: ${ctx.parsed} months`,
              },
            },
          },
        },
      });
    }

    const sorted = this.sortedPayments();
    if (this.cumulativeLine?.nativeElement && sorted.length > 0) {
      let running = 0;
      const labels: string[] = [];
      const cumulative: number[] = [];
      for (const p of sorted) {
        running += p.amount;
        labels.push(
          new Date(p.completedAt).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        );
        cumulative.push(Math.round(running * 100) / 100);
      }

      this.lineChart?.destroy();
      this.lineChart = new Chart(this.cumulativeLine.nativeElement, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Cumulative EMI paid',
            data: cumulative,
            borderColor: '#002E6D',
            backgroundColor: 'rgba(0, 46, 109, 0.08)',
            fill: true,
            tension: 0.25,
            pointRadius: sorted.length > 36 ? 0 : 3,
            pointHoverRadius: 5,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => `Total paid: ${this.fmt(Number(ctx.parsed.y))}`,
              },
            },
          },
          scales: {
            x: {
              ticks: { maxTicksLimit: 12, font: { size: 10 }, color: tickColor },
              grid: { color: gridColor },
            },
            y: {
              ticks: {
                color: tickColor,
                callback: v => this.fmtK(Number(v)),
              },
              grid: { color: gridColor },
            },
          },
        },
      });
    }
  }

  fmt(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }

  fmtK(n: number): string {
    if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
    return `$${n}`;
  }

  ngOnDestroy(): void {
    this.balanceChart?.destroy();
    this.installmentChart?.destroy();
    this.lineChart?.destroy();
    this.loanCtx.clear();
  }
}
