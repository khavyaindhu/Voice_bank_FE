import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { AuthService, User } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  fullName       = '';
  email          = '';
  username       = '';
  password       = '';
  confirmPassword = '';
  showPassword   = signal(false);
  loading        = signal(false);
  error          = signal('');

  constructor(private http: HttpClient, private auth: AuthService, private router: Router) {}

  toggleShowPassword(): void { this.showPassword.update(v => !v); }

  get valid(): boolean {
    return !!(this.fullName && this.email && this.username &&
      this.password.length >= 6 && this.password === this.confirmPassword);
  }

  onSubmit(): void {
    if (!this.valid) {
      this.error.set('Please fill all fields correctly and ensure passwords match.');
      return;
    }
    this.loading.set(true);
    this.error.set('');

    this.http.post<{ token: string; user: User }>(
      `${environment.apiUrl}/auth/register`,
      { fullName: this.fullName, email: this.email, username: this.username, password: this.password }
    ).pipe(
      tap(({ token, user }) => {
        localStorage.setItem('vb_token', token);
        localStorage.setItem('vb_user', JSON.stringify(user));
        this.auth.currentUser.set(user);
      })
    ).subscribe({
      next: () => this.router.navigate(['/']),
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message || 'Registration failed. Please try again.');
      },
    });
  }
}
