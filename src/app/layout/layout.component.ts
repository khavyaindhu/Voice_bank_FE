import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../core/services/auth.service';
import { ChatbotComponent } from '../shared/chatbot/chatbot.component';

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
  sidebarOpen = signal(true);
  paymentsExpanded = signal(false);

  navItems: NavItem[] = [
    { label: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
    { label: 'Accounts', icon: 'account_balance', route: '/accounts' },
    {
      label: 'Payments', icon: 'payments', route: '/payments',
      children: [
        { label: 'ACH Transfer', route: '/payments/ach' },
        { label: 'Wire Transfer', route: '/payments/wire' },
        { label: 'Zelle', route: '/payments/zelle' },
        { label: 'Card Payment', route: '/payments/card' },
        { label: 'History', route: '/payments/history' },
      ],
    },
    { label: 'Quick Pay', icon: 'contacts', route: '/payees' },
    { label: 'Cards', icon: 'credit_card', route: '/cards' },
    { label: 'Loans', icon: 'home', route: '/loans' },
  ];

  constructor(public auth: AuthService) {}

  toggleSidebar(): void {
    this.sidebarOpen.update(v => !v);
  }

  togglePayments(): void {
    this.paymentsExpanded.update(v => !v);
  }

  logout(): void {
    this.auth.logout();
  }
}
