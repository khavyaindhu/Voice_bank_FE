import { Component, OnInit, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import { StaffContextService } from '../../../core/services/staff-context.service';

interface AchBatch {
  ref: string;
  date: string;
  amount: number;
  entries: number;
  company: string;
  status: 'pending' | 'approved' | 'rejected';
  highlight?: boolean;
}

interface AddressChange {
  id: string;
  customer: string;
  custId: string;
  oldAddress: string;
  newAddress: string;
  requested: string;
  status: 'pending' | 'approved' | 'rejected';
  highlight?: boolean;
}

interface StaffUser {
  id: string; username: string; fullName: string;
  email: string; role: string; lastLogin: string;
}

interface SystemConfig {
  voiceEnabled: boolean; translationEnabled: boolean; ttsEnabled: boolean;
  supportedLanguages: string[]; staffPortalVersion: string; environment: string;
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
  private staffCtx = inject(StaffContextService);

  staffUsers: StaffUser[]        = [];
  systemConfig: SystemConfig | null = null;
  apiLoading = true;
  toastMsg   = '';

  batches: AchBatch[] = [
    { ref: 'ACH-2026-001', date: '2026-06-20', amount: 142350, entries: 48, company: 'Metro Payroll Group',   status: 'pending' },
    { ref: 'ACH-2026-002', date: '2026-06-21', amount:  89200, entries: 31, company: 'City Utilities Inc',    status: 'pending' },
    { ref: 'ACH-2026-003', date: '2026-06-22', amount: 215750, entries: 67, company: 'TechServe Corp',        status: 'pending' },
    { ref: 'ACH-2026-004', date: '2026-06-23', amount:  52100, entries: 19, company: 'Sunrise Vendors LLC',   status: 'pending' },
  ];

  addressChanges: AddressChange[] = [
    { id: 'ADR-001', customer: 'Vijaya Krishnamurthy', custId: 'CUST-001',
      oldAddress: '123 Oak Street, Chicago, IL 60601',
      newAddress:  '456 Maple Avenue, Austin, TX 78701',
      requested: '2026-06-22', status: 'pending' },
    { id: 'ADR-002', customer: 'James Smith', custId: 'CUST-007',
      oldAddress: '789 Pine Road, Houston, TX 77001',
      newAddress:  '321 Cedar Lane, Denver, CO 80201',
      requested: '2026-06-23', status: 'pending' },
    { id: 'ADR-003', customer: 'Emily Johnson', custId: 'CUST-008',
      oldAddress: '555 Elm Street, Portland, OR 97201',
      newAddress:  '888 Birch Drive, Seattle, WA 98101',
      requested: '2026-06-24', status: 'pending' },
  ];

  constructor() {
    // Watch for voice-triggered admin actions from the chatbot
    effect(() => {
      const action = this.staffCtx.adminAction();
      const ref    = this.staffCtx.adminRef();
      if (!action) return;

      if (action === 'approve_batch' || action === 'reject_batch') {
        const batch = ref
          ? this.batches.find(b => b.ref.replace(/-/g, '').toLowerCase() === ref.replace(/-/g, '').toLowerCase())
          : this.batches.find(b => b.status === 'pending');
        if (batch) {
          batch.status    = action === 'approve_batch' ? 'approved' : 'rejected';
          batch.highlight = true;
          this.showToast(action === 'approve_batch'
            ? `ACH batch ${batch.ref} approved successfully.`
            : `ACH batch ${batch.ref} rejected.`);
          setTimeout(() => { batch.highlight = false; }, 3000);
        }
      }

      if (action === 'approve_address' || action === 'reject_address') {
        const change = ref
          ? this.addressChanges.find(c => c.customer.toLowerCase().includes(ref.toLowerCase()))
          : this.addressChanges.find(c => c.status === 'pending');
        if (change) {
          change.status    = action === 'approve_address' ? 'approved' : 'rejected';
          change.highlight = true;
          this.showToast(action === 'approve_address'
            ? `Address change for ${change.customer} approved.`
            : `Address change for ${change.customer} rejected.`);
          setTimeout(() => { change.highlight = false; }, 3000);
        }
      }

      // Clear signal after processing
      setTimeout(() => this.staffCtx.setAdminAction(''), 100);
    });
  }

  ngOnInit(): void {
    this.http.get<{ staffUsers: StaffUser[]; systemConfig: SystemConfig }>(
      `${environment.apiUrl}/staff/admin-settings`
    ).subscribe({
      next: data => { this.staffUsers = data.staffUsers; this.systemConfig = data.systemConfig; this.apiLoading = false; },
      error: ()   => { this.apiLoading = false; },
    });
  }

  approveBatch(batch: AchBatch): void {
    batch.status = 'approved';
    batch.highlight = true;
    this.showToast(`ACH batch ${batch.ref} approved.`);
    setTimeout(() => { batch.highlight = false; }, 3000);
  }

  rejectBatch(batch: AchBatch): void {
    batch.status = 'rejected';
    batch.highlight = true;
    this.showToast(`ACH batch ${batch.ref} rejected.`);
    setTimeout(() => { batch.highlight = false; }, 3000);
  }

  approveAddress(c: AddressChange): void {
    c.status = 'approved';
    c.highlight = true;
    this.showToast(`Address change for ${c.customer} approved.`);
    setTimeout(() => { c.highlight = false; }, 3000);
  }

  rejectAddress(c: AddressChange): void {
    c.status = 'rejected';
    c.highlight = true;
    this.showToast(`Address change for ${c.customer} rejected.`);
    setTimeout(() => { c.highlight = false; }, 3000);
  }

  private showToast(msg: string): void {
    this.toastMsg = msg;
    setTimeout(() => { this.toastMsg = ''; }, 4000);
  }

  roleLabel(role: string):      string { return role === 'super_admin' ? 'Super Admin' : 'Admin'; }
  roleBadgeClass(role: string): string { return role === 'super_admin' ? 'badge-super' : 'badge-admin'; }
  get pendingBatches():  number { return this.batches.filter(b => b.status === 'pending').length; }
  get pendingAddress():  number { return this.addressChanges.filter(c => c.status === 'pending').length; }
}
