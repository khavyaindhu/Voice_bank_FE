import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';

interface StaffUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  lastLogin: string;
}

interface SystemConfig {
  voiceEnabled: boolean;
  translationEnabled: boolean;
  ttsEnabled: boolean;
  supportedLanguages: string[];
  staffPortalVersion: string;
  environment: string;
}

@Component({
  selector: 'app-super-admin-settings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './super-admin-settings.component.html',
  styleUrl: './super-admin-settings.component.scss',
})
export class SuperAdminSettingsComponent implements OnInit {
  private http   = inject(HttpClient);
  auth           = inject(AuthService);

  staffUsers: StaffUser[]   = [];
  systemConfig: SystemConfig | null = null;
  loading = true;
  error   = '';

  ngOnInit(): void {
    this.http.get<{ staffUsers: StaffUser[]; systemConfig: SystemConfig }>(
      `${environment.apiUrl}/staff/admin-settings`
    ).subscribe({
      next: data => {
        this.staffUsers   = data.staffUsers;
        this.systemConfig = data.systemConfig;
        this.loading      = false;
      },
      error: () => {
        this.error   = 'Failed to load admin settings.';
        this.loading = false;
      },
    });
  }

  roleLabel(role: string): string {
    return role === 'super_admin' ? 'Super Admin' : 'Admin';
  }

  roleBadgeClass(role: string): string {
    return role === 'super_admin' ? 'badge-super' : 'badge-admin';
  }
}
