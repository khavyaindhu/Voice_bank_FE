import { Injectable, inject, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import {
  ApiService,
  CreateRecurringItemPayload,
  RecurringBucket,
  RecurringItem,
  RecurringPayAllResponse,
} from './api.service';

@Injectable({ providedIn: 'root' })
export class RecurringBucketService {
  private api = inject(ApiService);

  private _buckets = signal<RecurringBucket[]>([]);
  private _loading = signal(false);
  private _loaded = signal(false);
  private _loadError = signal<string | null>(null);

  readonly buckets = this._buckets.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly loadError = this._loadError.asReadonly();

  /** Drop cached list — call on logout or after DB re-seed + new login. */
  clearCache(): void {
    this._buckets.set([]);
    this._loaded.set(false);
    this._loadError.set(null);
  }

  async load(): Promise<void> {
    if (this._loaded() && !this._loading()) return;
    this._loading.set(true);
    this._loadError.set(null);
    try {
      const list = await lastValueFrom(this.api.getRecurringBuckets());
      this._buckets.set(list);
      this._loaded.set(true);
    } catch (err: unknown) {
      this._loadError.set(
        (err as { error?: { message?: string }; status?: number })?.error?.message ??
        (err as { status?: number })?.status === 404
          ? 'Recurring buckets API not found — deploy the latest backend.'
          : 'Could not load recurring buckets. Try logging out and back in.',
      );
      this._loaded.set(false);
    } finally {
      this._loading.set(false);
    }
  }

  async reload(): Promise<void> {
    this._loaded.set(false);
    await this.load();
  }

  async ensureLoaded(): Promise<void> {
    if (this._loaded()) return;
    await this.load();
  }

  findByNickname(nickname: string): RecurringBucket | undefined {
    const q = nickname.toLowerCase().trim();
    return this._buckets().find(b =>
      b.nickname.toLowerCase() === q ||
      b.name.toLowerCase().includes(q) ||
      q.includes(b.nickname.toLowerCase())
    );
  }

  /** Match a recurring line item by spoken phrase (name or alias). */
  findItemByPhrase(phrase: string): { bucket: RecurringBucket; item: RecurringItem } | undefined {
    const q = phrase.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!q) return undefined;

    for (const bucket of this._buckets()) {
      for (const item of bucket.items) {
        const name = item.name.toLowerCase();
        if (q.includes(name) || name.includes(q)) return { bucket, item };
        if (item.aliases?.some(a => q.includes(a.toLowerCase()) || a.toLowerCase().includes(q))) {
          return { bucket, item };
        }
      }
    }
    return undefined;
  }

  async addItem(bucketId: string, payload: CreateRecurringItemPayload): Promise<RecurringBucket> {
    const res = await lastValueFrom(this.api.addRecurringItem(bucketId, payload));
    this._upsertBucket(res.bucket);
    return res.bucket;
  }

  async updateItem(
    bucketId: string,
    itemId: string,
    payload: Partial<CreateRecurringItemPayload> & { amountDelta?: number },
  ): Promise<RecurringBucket> {
    const res = await lastValueFrom(this.api.updateRecurringItem(bucketId, itemId, payload));
    this._upsertBucket(res.bucket);
    return res.bucket;
  }

  async deleteItem(bucketId: string, itemId: string): Promise<RecurringBucket> {
    const res = await lastValueFrom(this.api.deleteRecurringItem(bucketId, itemId));
    this._upsertBucket(res.bucket);
    return res.bucket;
  }

  async payAll(bucketId: string, fromAccount: string): Promise<RecurringPayAllResponse> {
    const res = await lastValueFrom(this.api.payAllRecurringBucket(bucketId, fromAccount));
    this._upsertBucket(res.bucket);
    return res;
  }

  private _upsertBucket(bucket: RecurringBucket): void {
    this._buckets.update(list => {
      const idx = list.findIndex(b => b.id === bucket.id);
      if (idx === -1) return [...list, bucket];
      const next = [...list];
      next[idx] = bucket;
      return next;
    });
  }
}
