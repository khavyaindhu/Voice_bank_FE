import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/** Notifies transaction history (and dashboard) to reload after a payment is recorded. */
@Injectable({ providedIn: 'root' })
export class PaymentHistoryService {
  private readonly refresh$ = new Subject<void>();

  /** Subscribe in history/dashboard to reload when payments complete. */
  readonly onPaymentRecorded = this.refresh$.asObservable();

  notifyPaymentRecorded(): void {
    this.refresh$.next();
  }
}
