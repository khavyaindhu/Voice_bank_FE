import { Component, signal, computed, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, StaffCard } from '../../../core/services/api.service';
import { StaffContextService } from '../../../core/services/staff-context.service';

type FilterTab = 'all' | 'active' | 'frozen' | 'disputed' | 'expiring';

@Component({
  selector: 'app-staff-cards',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './staff-cards.component.html',
  styleUrl: './staff-cards.component.scss',
})
export class StaffCardsComponent implements OnInit {
  private api      = inject(ApiService);
  private staffCtx = inject(StaffContextService);

  cards      = signal<StaffCard[]>([]);
  loading    = signal(true);
  error      = signal('');
  searchQ    = signal('');
  activeTab  = signal<FilterTab>('all');
  selected   = signal<StaffCard | null>(null);
  togglingId = signal<string | null>(null);

  readonly tabs: { key: FilterTab; label: string }[] = [
    { key: 'all',      label: 'All Cards' },
    { key: 'frozen',   label: 'Frozen' },
    { key: 'disputed', label: 'Disputed' },
    { key: 'expiring', label: 'Expiring Soon' },
    { key: 'active',   label: 'Active' },
  ];

  constructor() {
    // React to Maya setting a card filter tab
    effect(() => {
      const tab = this.staffCtx.cardTabFilter() as FilterTab;
      if (!tab) return;
      this.activeTab.set(tab);
      this.staffCtx.setCardFilter(''); // clear after consuming
    });

    // React to Maya requesting a freeze for a customer
    effect(() => {
      const target = this.staffCtx.cardFreezeTarget();
      if (!target) return;
      // Wait until cards are loaded, then find and freeze
      const cards = this.cards();
      if (!cards.length) return; // will re-run when cards signal updates
      this.executeFreezeForCustomer(target);
      this.staffCtx.setCardFreeze(''); // clear after consuming
    });
  }

  ngOnInit(): void {
    this.loadCards();
  }

  loadCards(): void {
    this.loading.set(true);
    this.api.getStaffCards().subscribe({
      next:  cards => { this.cards.set(cards); this.loading.set(false); },
      error: ()    => { this.error.set('Failed to load cards. Please try again.'); this.loading.set(false); },
    });
  }

  /** Called by the freeze effect — finds the first non-frozen card for the customer and toggles it */
  private executeFreezeForCustomer(target: string): void {
    const lower = target.toLowerCase();
    const card = this.cards().find(c =>
      (c.customerName ?? '').toLowerCase().includes(lower) ||
      (c.customerDisplayId ?? '').toLowerCase().includes(lower)
    );
    if (!card) return;
    // Scroll the matched card into view by selecting it
    this.selected.set(card);
    this.activeTab.set('all');
    // Execute the freeze
    this.toggleFreeze(card);
  }

  filtered = computed(() => {
    const q   = this.searchQ().toLowerCase().trim();
    const tab = this.activeTab();
    return this.cards().filter(c => {
      const matchTab = tab === 'all' || c.status === tab;
      const matchQ   = !q ||
        (c.customerName ?? '').toLowerCase().includes(q) ||
        c.maskedNumber.includes(q) ||
        (c.customerDisplayId ?? '').toLowerCase().includes(q) ||
        c.cardType.toLowerCase().includes(q) ||
        c.network.toLowerCase().includes(q);
      return matchTab && matchQ;
    });
  });

  get stats() {
    const all = this.cards();
    return {
      total:    all.length,
      frozen:   all.filter(c => c.status === 'frozen').length,
      disputed: all.filter(c => c.status === 'disputed').length,
      expiring: all.filter(c => c.status === 'expiring').length,
    };
  }

  countFor(tab: FilterTab): number {
    if (tab === 'all') return this.cards().length;
    return this.cards().filter(c => c.status === tab).length;
  }

  selectCard(c: StaffCard): void {
    this.selected.set(this.selected()?._id === c._id ? null : c);
  }

  toggleFreeze(c: StaffCard, event?: Event): void {
    event?.stopPropagation();
    this.togglingId.set(c._id);
    this.api.staffToggleFreeze(c._id).subscribe({
      next: ({ card }) => {
        this.cards.update(list => list.map(x => x._id === card._id ? card : x));
        if (this.selected()?._id === card._id) this.selected.set(card);
        this.togglingId.set(null);
      },
      error: () => this.togglingId.set(null),
    });
  }

  statusLabel(s: string): string {
    return s === 'expiring' ? 'Expiring Soon' : s.charAt(0).toUpperCase() + s.slice(1);
  }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  isExpiryWarn(expiry: string): boolean {
    const [mm, yy] = expiry.split('/');
    const exp     = new Date(2000 + parseInt(yy), parseInt(mm) - 1, 1);
    const cutoff  = new Date(2026, 7, 1);
    return exp <= cutoff;
  }
}
