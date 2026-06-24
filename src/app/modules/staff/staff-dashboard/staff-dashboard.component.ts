import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-staff-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './staff-dashboard.component.html',
  styleUrl: './staff-dashboard.component.scss',
})
export class StaffDashboardComponent {
  auth = inject(AuthService);

  tiles = [
    { label: 'Customer Search',   icon: 'manage_search',   route: '/staff/customers',       value: '',    color: 'navy',    desc: 'Find & view customer accounts',      superAdminOnly: false },
    { label: 'FMS Accounts',      icon: 'account_tree',    route: '/staff/fms',             value: '247', color: 'navy',    desc: 'Financial management accounts',      superAdminOnly: false },
    { label: 'Pending ACH',       icon: 'sync_alt',        route: '/staff/reports',         value: '12',  color: 'amber',   desc: 'ACH items awaiting processing',      superAdminOnly: false },
    { label: 'Card Services',     icon: 'credit_card',     route: '/staff/cards',           value: '3',   color: 'red',     desc: 'Flagged / frozen cards',             superAdminOnly: false },
    { label: 'Open Appointments', icon: 'event',           route: '/staff/dashboard',       value: '0/0', color: 'navy',    desc: 'Scheduled customer meetings',        superAdminOnly: false },
    { label: 'Reports',           icon: 'bar_chart',       route: '/staff/reports',         value: '',    color: 'navy',    desc: 'Budget, transactions & EOY',         superAdminOnly: false },
    { label: 'Super Admin',       icon: 'admin_panel_settings', route: '/staff/admin-settings', value: '', color: 'purple', desc: 'System config & user management',    superAdminOnly: true  },
  ];

  get visibleTiles() {
    return this.tiles.filter(t => !t.superAdminOnly || this.auth.isSuperAdmin);
  }

  recentActivity = [
    { time: '08:42 AM', user: 'A. Das',     action: 'Looked up FMS account 91000038 — Agni Test' },
    { time: '08:35 AM', user: 'N. Rajan',   action: 'Customer search: Vijaya Krishnamurthy' },
    { time: '08:21 AM', user: 'A. Das',     action: 'Viewed DDA transactions for ACC-001 (Jan 2026)' },
    { time: '07:58 AM', user: 'System',     action: 'ACH batch processed — 48 items, $142,350' },
    { time: '07:15 AM', user: 'N. Rajan',   action: 'Card frozen: ****4521 (customer request)' },
  ];
}
