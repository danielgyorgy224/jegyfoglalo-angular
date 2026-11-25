import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AdminReportTableComponent } from './admin-report-table.component';

@Component({
  selector: 'app-reservations-admin-page',
  imports: [AdminReportTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-admin-report-table kind="reservations" />`,
})
export class ReservationsAdminPageComponent {}
