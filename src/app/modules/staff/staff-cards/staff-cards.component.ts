import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
@Component({ selector: 'app-staff-cards', standalone: true, imports: [CommonModule],
  template: `<div class="page-wrap"><h2 style="color:#0F3460;display:flex;align-items:center;gap:10px">
  <span class="material-icons" style="color:#38BDF8">credit_card</span>Card Services</h2>
  <p style="color:#6B7280;margin-bottom:24px">View flagged, frozen and disputed cards across all customers.</p>
  <div style="background:white;border-radius:12px;padding:32px;text-align:center;color:#9CA3AF;border:1px solid #E5E7EB">
  <span class="material-icons" style="font-size:48px">credit_card</span>
  <p style="margin-top:12px">Card Services module — coming soon</p>
  <p style="font-size:12px;margin-top:4px">Say "Maya, show frozen cards" to get a summary</p></div></div>` })
export class StaffCardsComponent {}
