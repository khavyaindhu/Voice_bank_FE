import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadChildren: () => import('./modules/auth/auth.routes').then(m => m.AUTH_ROUTES),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/layout.component').then(m => m.LayoutComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./modules/dashboard/dashboard.component').then(m => m.DashboardComponent),
        data: { screen: 'dashboard' },
      },
      {
        path: 'accounts',
        loadComponent: () => import('./modules/accounts/accounts.component').then(m => m.AccountsComponent),
        data: { screen: 'accounts' },
      },
      {
        path: 'payments',
        children: [
          { path: '', redirectTo: 'ach', pathMatch: 'full' },
          {
            path: 'ach',
            loadComponent: () => import('./modules/payments/ach/ach.component').then(m => m.AchComponent),
            data: { screen: 'payments/ach' },
          },
          {
            path: 'wire',
            loadComponent: () => import('./modules/payments/wire/wire.component').then(m => m.WireComponent),
            data: { screen: 'payments/wire' },
          },
          {
            path: 'zelle',
            loadComponent: () => import('./modules/payments/zelle/zelle.component').then(m => m.ZelleComponent),
            data: { screen: 'payments/zelle' },
          },
          {
            path: 'card',
            loadComponent: () => import('./modules/payments/card-payment/card-payment.component').then(m => m.CardPaymentComponent),
            data: { screen: 'payments/card' },
          },
          {
            path: 'history',
            loadComponent: () => import('./modules/payments/history/history.component').then(m => m.HistoryComponent),
            data: { screen: 'payments/history' },
          },
        ],
      },
      {
        path: 'payees',
        loadComponent: () => import('./modules/payees/payees.component').then(m => m.PayeesComponent),
        data: { screen: 'payees' },
      },
      {
        path: 'cards',
        loadComponent: () => import('./modules/cards/cards.component').then(m => m.CardsComponent),
        data: { screen: 'cards' },
      },
      {
        path: 'loans',
        children: [
          {
            path: '',
            loadComponent: () => import('./modules/loans/loans.component').then(m => m.LoansComponent),
            data: { screen: 'loans' },
          },
          {
            path: 'apply',
            loadComponent: () => import('./modules/loans/apply/loan-apply.component').then(m => m.LoanApplyComponent),
            data: { screen: 'loans/apply' },
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
