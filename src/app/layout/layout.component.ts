import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../core/services/auth.service';
import { ChatbotComponent } from '../shared/chatbot/chatbot.component';

export type AppRole = 'customer' | 'staff';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  children?: { label: string; route: string }[];
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, ChatbotComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
})
export class LayoutComponent {
  sidebarOpen      = signal(true);
  paymentsExpanded = signal(false);
  role             = signal<AppRole>('customer');

  readonly customerNav: NavItem[] = [
    { label: 'Dashboard',  icon: 'dashboard',       route: '/dashboard' },
    { label: 'Accounts',   icon: 'account_balance',  route: '/accounts' },
    {
      label: 'Payments', icon: 'payments', route: '/payments',
      children: [
        { label: 'ACH Transfer', route: '/payments/ach' },
        { label: 'Wire Transfer', route: '/payments/wire' },
        { label: 'Zelle',         route: '/payments/zelle' },
        { label: 'Card Payment',  route: '/payments/card' },
        { label: 'History',       route: '/payments/history' },
      ],
    },
    { label: 'Quick Pay', icon: 'contacts',     route: '/payees' },
    { label: 'Cards',     icon: 'credit_card',  route: '/cards' },
    { label: 'Loans',     icon: 'home',         route: '/loans' },
  ];

  readonly staffNav: NavItem[] = [
    { label: 'Staff Dashboard',   icon: 'space_dashboard',  route: '/staff/dashboard' },
    { label: 'Customer Search',   icon: 'manage_search',    route: '/staff/customers' },
    { label: 'FMS Accounts',      icon: 'account_tree',     route: '/staff/fms' },
    { label: 'Card Services',     icon: 'credit_card',      route: '/staff/cards' },
    { label: 'Reports',           icon: 'bar_chart',        route: '/staff/reports' },
  ];

  get navItems(): NavItem[] {
    return this.role() === 'staff' ? this.staffNav : this.customerNav;
  }

  constructor(public auth: AuthService, private router: Router) {}

  toggleSidebar(): void  { this.sidebarOpen.update(v => !v); }
  togglePayments(): void { this.paymentsExpanded.update(v => !v); }
  logout(): void         { this.auth.logout(); }

  switchRole(r: AppRole): void {
    this.role.set(r);
    this.paymentsExpanded.set(false);
    this.router.navigate([r === 'staff' ? '/staff/dashboard' : '/dashboard']);
  }
}
