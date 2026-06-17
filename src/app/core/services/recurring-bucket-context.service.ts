import { Injectable, signal } from '@angular/core';
import { CreateRecurringItemPayload } from './api.service';

/** Signals shared between Maya and the Recurring Bills page. */
@Injectable({ providedIn: 'root' })
export class RecurringBucketContextService {
  /** Bucket nickname to open, e.g. "A" */
  viewBucketNickname = signal('');
  /** Bucket nickname — open pay-all review panel on Recurring Bills page */
  payAllReviewNickname = signal('');
  /** @deprecated use payAllReviewNickname */
  payAllBucketNickname = this.payAllReviewNickname;
  /** Flash highlight on an item id after voice update/remove */
  flashItemId = signal('');
  /** Open add-item form with optional prefill from Maya */
  addItemRequest = signal<{ nickname: string; draft?: Partial<CreateRecurringItemPayload> } | null>(null);

  openBucket(nickname: string): void {
    this.viewBucketNickname.set(nickname.trim());
  }

  /** Opens pay-all review on the Recurring Bills page (does not pay immediately). */
  requestPayAllReview(nickname: string): void {
    this.payAllReviewNickname.set(nickname.trim());
  }

  requestPayAll(nickname: string): void {
    this.requestPayAllReview(nickname);
  }

  flashItem(itemId: string): void {
    this.flashItemId.set(itemId);
    setTimeout(() => this.flashItemId.set(''), 2500);
  }

  /** Navigate to bucket and open add-bill form (optional voice prefill). */
  requestAddItem(nickname: string, draft?: Partial<CreateRecurringItemPayload>): void {
    this.addItemRequest.set({ nickname: nickname.trim(), draft });
  }

  clear(): void {
    this.viewBucketNickname.set('');
    this.payAllReviewNickname.set('');
    this.flashItemId.set('');
    this.addItemRequest.set(null);
  }
}
