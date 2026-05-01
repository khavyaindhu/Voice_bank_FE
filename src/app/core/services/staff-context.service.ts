import { Injectable, signal } from '@angular/core';

/**
 * Shared signal bus between Maya chatbot and the staff pages.
 * When Maya detects a staff intent, it writes here.
 * Staff components read from here via effect() and react.
 */
@Injectable({ providedIn: 'root' })
export class StaffContextService {
  /** Pre-fill the Customer Search box */
  customerQuery = signal('');

  /** Pre-fill the FMS Account search box */
  fmsQuery    = signal('');
  fmsAutoLoad = signal<'current' | 'previous' | 'ytd' | ''>('');

  /** Card Services — filter tab ('all' | 'frozen' | 'disputed' | 'expiring' | 'active') */
  cardTabFilter = signal('');

  /** Card Services — customer name/id to freeze (Maya sets this, card component executes) */
  cardFreezeTarget = signal('');

  // ── Setters ──────────────────────────────────────────────────────────────

  setCustomerSearch(q: string): void {
    this.customerQuery.set(q);
  }

  setFmsSearch(q: string, autoLoad: 'current' | 'previous' | 'ytd' | '' = ''): void {
    this.fmsQuery.set(q);
    this.fmsAutoLoad.set(autoLoad);
  }

  setCardFilter(tab: string): void {
    this.cardTabFilter.set(tab);
  }

  setCardFreeze(target: string): void {
    this.cardFreezeTarget.set(target);
  }

  /** Reports — preset + optional customer filter + section to open */
  reportPreset   = signal('');
  reportCustomer = signal('');
  reportSection  = signal('');

  setReport(preset: string, customer = '', section = ''): void {
    this.reportPreset.set(preset);
    this.reportCustomer.set(customer);
    this.reportSection.set(section);
  }

  clear(): void {
    this.customerQuery.set('');
    this.fmsQuery.set('');
    this.fmsAutoLoad.set('');
    this.cardTabFilter.set('');
    this.cardFreezeTarget.set('');
    this.reportPreset.set('');
    this.reportCustomer.set('');
    this.reportSection.set('');
  }
}
