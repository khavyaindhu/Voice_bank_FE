import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
@Component({ selector: 'app-staff-reports', standalone: true, imports: [CommonModule],
  template: `<div class="page-wrap"><h2 style="color:#0F3460;display:flex;align-items:center;gap:10px">
  <span class="material-icons" style="color:#38BDF8">bar_chart</span>Reports</h2>
  <p style="color:#6B7280;margin-bottom:24px">Budget reporting, EOY summaries and transaction exports.</p>
  <div style="background:white;border-radius:12px;padding:32px;text-align:center;color:#9CA3AF;border:1px solid #E5E7EB">
  <span class="material-icons" style="font-size:48px">bar_chart</span>
  <p style="margin-top:12px">Reports module — coming soon</p>
  <p style="font-size:12px;margin-top:4px">Say "Maya, generate April transaction report" to export data</p></div></div>` })
export class StaffReportsComponent {}
