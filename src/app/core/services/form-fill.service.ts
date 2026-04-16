import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface FillEvent {
  field: string;
  value: string | boolean;
  screen: string;
}

/**
 * Shared service that broadcasts form fill events from the chatbot
 * to the active payment form component.
 */
@Injectable({ providedIn: 'root' })
export class FormFillService {
  private fillSubject = new Subject<FillEvent>();
  fill$ = this.fillSubject.asObservable();

  emit(field: string, value: string | boolean, screen: string): void {
    this.fillSubject.next({ field, value, screen });
  }
}
