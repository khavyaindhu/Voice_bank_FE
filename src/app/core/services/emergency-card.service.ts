import { Injectable } from '@angular/core';

export interface EmergencyCard {
  last4: string;
  type:  string;
}

@Injectable({ providedIn: 'root' })
export class EmergencyCardService {

  readonly card: EmergencyCard = { last4: '4523', type: 'Visa' };

  /**
   * Simulate freezing the card.
   * Production: POST /api/cards/{id}/freeze
   */
  freezeCard(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 900));
  }

  /**
   * Simulate filing a dispute.
   * Production: POST /api/disputes  →  returns reference number
   */
  fileDispute(): Promise<string> {
    const year = new Date().getFullYear();
    const ref  = `DIS-${year}-${Math.floor(10000 + Math.random() * 89999)}`;
    return new Promise(resolve => setTimeout(() => resolve(ref), 1300));
  }

  /**
   * Simulate requesting a replacement card.
   * Production: POST /api/cards/{id}/replace  →  returns ETA string
   */
  requestReplacement(): Promise<string> {
    return new Promise(resolve => setTimeout(() => resolve('3–5 business days'), 1100));
  }
}
