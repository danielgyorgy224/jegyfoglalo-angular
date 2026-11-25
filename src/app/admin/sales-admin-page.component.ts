import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AdminReportTableComponent } from './admin-report-table.component';

@Component({
  selector: 'app-sales-admin-page',
  imports: [AdminReportTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-admin-report-table kind="sales" />`,
})
export class SalesAdminPageComponent {}
