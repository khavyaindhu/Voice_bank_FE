import { Injectable, signal } from '@angular/core';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { filter, map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class ScreenContextService {
  currentScreen = signal<string>('dashboard');
  formState = signal<Record<string, unknown>>({});

  constructor(private router: Router, private activatedRoute: ActivatedRoute) {
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => {
        let route = this.activatedRoute;
        while (route.firstChild) route = route.firstChild;
        return route.snapshot.data['screen'] as string ?? 'dashboard';
      })
    ).subscribe(screen => this.currentScreen.set(screen));
  }

  updateFormState(state: Record<string, unknown>): void {
    this.formState.set(state);
  }

  clearFormState(): void {
    this.formState.set({});
  }

  getContext() {
    return {
      screen: this.currentScreen(),
      formState: this.formState(),
    };
  }
}
