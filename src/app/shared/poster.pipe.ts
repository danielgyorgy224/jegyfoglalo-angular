import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { API_BASE_URL } from '../core/services/api-config';

/**
 * Plakát URL-je az <img> számára.
 * - az Angular az SVG data URI-t alapból "unsafe"-nek jelölné, pedig <img>-ben (script nélkül) biztonságos;
 * - a "/"-jellel kezdődő útvonalat (admin által feltöltött fájl) az API címéhez fűzi.
 */
@Pipe({ name: 'poster' })
export class PosterPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(url: string | null | undefined): SafeUrl | string {
    if (!url) return '';
    if (url.startsWith('data:image/')) return this.sanitizer.bypassSecurityTrustUrl(url);
    if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
    return url;
  }
}
