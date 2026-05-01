import { Injectable, signal } from '@angular/core';

/**
 * Shared signal bus between Maya chatbot and the staff pages.
 * When Maya detects a staff intent, it writes here.
 * Staff components read from here on init / change.
 */
@Injectable({ providedIn: 'root' })
export class StaffContextService {
  /** Pre-fill the Customer Search box */
  customerQuery = signal('');

  /** Pre-fill the FMS Account search box */
  fmsQuery = signal('');

  /** Auto-trigger transaction load after FMS navigation (optional date preset) */
  fmsAutoLoad = signal<'current' | 'previous' | 'ytd' | ''>('');

  setCustomerSearch(q: string): void {
    this.customerQuery.set(q);
  }

  setFmsSearch(q: string, autoLoad: 'current' | 'previous' | 'ytd' | '' = ''): void {
    this.fmsQuery.set(q);
    this.fmsAutoLoad.set(autoLoad);
  }

  clear(): void {
    this.customerQuery.set('');
    this.fmsQuery.set('');
    this.fmsAutoLoad.set('');
  }
}
