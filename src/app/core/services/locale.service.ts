import { Injectable, signal } from '@angular/core';

export interface Language {
  code: string;
  label: string;
  flag: string;
  speechCode: string; // BCP-47 tag for Web Speech API
}

@Injectable({ providedIn: 'root' })
export class LocaleService {
  readonly languages: Language[] = [
    { code: 'en', label: 'English', flag: '🇺🇸', speechCode: 'en-US' },
    { code: 'hi', label: 'Hindi',   flag: '🇮🇳', speechCode: 'hi-IN' },
    { code: 'ta', label: 'Tamil',   flag: '🇮🇳', speechCode: 'ta-IN' },
    { code: 'kn', label: 'Kannada', flag: '🇮🇳', speechCode: 'kn-IN' },
    { code: 'es', label: 'Spanish', flag: '🇪🇸', speechCode: 'es-ES' },
    { code: 'fr', label: 'French',  flag: '🇫🇷', speechCode: 'fr-FR' },
  ];

  readonly selected = signal<Language>(this.languages[0]);

  setLanguage(code: string): void {
    const lang = this.languages.find(l => l.code === code);
    if (lang) this.selected.set(lang);
  }

  get isEnglish(): boolean {
    return this.selected().code === 'en';
  }
}
