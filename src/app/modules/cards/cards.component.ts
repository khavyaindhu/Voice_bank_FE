import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService, Card } from '../../core/services/api.service';

@Component({
  selector: 'app-cards',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './cards.component.html',
  styleUrl: './cards.component.scss',
})
export class CardsComponent implements OnInit {
  cards = signal<Card[]>([]);
  loading = signal(true);
  togglingId = signal<string | null>(null);

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.api.getCards().subscribe({ next: c => { this.cards.set(c); this.loading.set(false); }, error: () => this.loading.set(false) });
  }

  toggleFreeze(card: Card): void {
    this.togglingId.set(card._id);
    this.api.toggleCardFreeze(card._id).subscribe({
      next: r => { this.cards.update(cards => cards.map(c => c._id === card._id ? r.card : c)); this.togglingId.set(null); },
      error: () => this.togglingId.set(null),
    });
  }

  utilizationPct(card: Card): number {
    if (!card.creditLimit) return 0;
    return Math.round((card.currentBalance / card.creditLimit) * 100);
  }
}
