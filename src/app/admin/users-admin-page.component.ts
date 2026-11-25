import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { AdminDataService, AdminUser } from '../core/services/admin-data.service';
import { toProblem } from '../core/util/api-error';
import { StatusMessageComponent } from '../shared/status-message.component';

@Component({
  selector: 'app-users-admin-page',
  imports: [ReactiveFormsModule, StatusMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-7">
      <header>
        <p class="text-sm font-bold uppercase tracking-wide text-ink-soft">Adminisztráció</p>
        <h1 class="mt-2 text-3xl">Felhasználók</h1>
      </header>

      @if (loadError()) {
        <app-status-message kind="error" [message]="loadError()" (retry)="load()" />
      } @else if (loading()) {
        <app-status-message kind="loading" />
      } @else {
        @if (notice()) {
          <p class="rounded border border-pine bg-pine-soft p-3" role="status">{{ notice() }}</p>
        }
        @if (error()) {
          <p class="rounded border-2 border-brick bg-alert-soft p-3" role="alert">{{ error() }}</p>
        }

        <section class="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
          <div class="card p-5">
            <h2 class="text-2xl">Felhasználói fiókok</h2>
            @if (users().length === 0) {
              <p class="mt-4 text-ink-soft">Nincs megjeleníthető felhasználó.</p>
            } @else {
              <div class="mt-4 overflow-x-auto">
                <table class="w-full min-w-152 border-collapse text-left">
                  <thead>
                    <tr class="border-b-2 border-line">
                      <th class="p-2">Név</th>
                      <th class="p-2">E-mail</th>
                      <th class="p-2">Szerepkör</th>
                      <th class="p-2">Állapot</th>
                      <th class="p-2">Művelet</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (user of users(); track user.id) {
                      <tr class="border-b border-line">
                        <td class="p-2 font-semibold">{{ user.name }}</td>
                        <td class="p-2">{{ user.email }}</td>
                        <td class="p-2">{{ user.role === 'admin' ? 'Adminisztrátor' : 'Pénztáros' }}</td>
                        <td class="p-2">{{ user.active ? 'Aktív' : 'Inaktív' }}</td>
                        <td class="p-2">
                          <div class="flex flex-wrap gap-2">
                            <button type="button" class="btn btn-outline" (click)="editUser(user)">Szerkesztés</button>
                            <button
                              type="button"
                              class="btn btn-outline"
                              [disabled]="saving()"
                              (click)="setActive(user, !user.active)"
                            >
                              {{ user.active ? 'Inaktiválás' : 'Aktiválás' }}
                            </button>
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>

          <div class="card p-5">
            <h2 class="text-2xl">{{ editingUserId() ? 'Felhasználó szerkesztése' : 'Új felhasználó' }}</h2>
            <form class="mt-4 space-y-3" [formGroup]="userForm" (ngSubmit)="saveUser()">
              <div>
                <label for="user-name" class="mb-1 block font-semibold">Név</label>
                <input id="user-name" class="field" formControlName="name" required maxlength="100" />
                @if (userForm.controls.name.touched && userForm.controls.name.invalid) {
                  <p class="mt-1 text-sm text-brick">A név megadása kötelező.</p>
                }
              </div>
              <div>
                <label for="user-email" class="mb-1 block font-semibold">E-mail-cím</label>
                <input id="user-email" class="field" type="email" formControlName="email" required maxlength="254" />
                @if (userForm.controls.email.touched && userForm.controls.email.invalid) {
                  <p class="mt-1 text-sm text-brick">Adj meg érvényes e-mail-címet.</p>
                }
              </div>
              <div>
                <label for="user-role" class="mb-1 block font-semibold">Szerepkör</label>
                <select id="user-role" class="field" formControlName="role">
                  <option value="cashier">Pénztáros</option>
                  <option value="admin">Adminisztrátor</option>
                </select>
              </div>
              <div>
                <label for="user-password" class="mb-1 block font-semibold">
                  {{ editingUserId() ? 'Új jelszó (hagyd üresen, ha nem változik)' : 'Jelszó' }}
                </label>
                <input
                  id="user-password"
                  class="field"
                  type="password"
                  formControlName="password"
                  [required]="!editingUserId()"
                  autocomplete="new-password"
                />
                <p class="mt-1 text-sm text-ink-soft">Legalább 8 karakter.</p>
              </div>
              @if (!editingUserId()) {
                <label class="flex items-center gap-2">
                  <input type="checkbox" formControlName="active" />
                  Aktív fiók
                </label>
              }
              <div class="flex flex-wrap gap-2">
                <button class="btn btn-primary" type="submit" [disabled]="saving()">
                  {{ saving() ? 'Mentés…' : editingUserId() ? 'Módosítás mentése' : 'Felhasználó létrehozása' }}
                </button>
                @if (editingUserId()) {
                  <button class="btn btn-outline" type="button" (click)="resetForm()">Mégse</button>
                }
              </div>
            </form>
          </div>
        </section>
      }
    </div>
  `,
})
export class UsersAdminPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly admin = inject(AdminDataService);

  protected readonly users = signal<AdminUser[]>([]);
  protected readonly editingUserId = signal<number | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal('');
  protected readonly error = signal('');
  protected readonly notice = signal('');

  protected readonly userForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    role: ['cashier' as 'admin' | 'cashier', Validators.required],
    password: ['', Validators.minLength(8)],
    active: [true],
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.admin.list<AdminUser>('users').pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (users) => this.users.set(users),
      error: (error: unknown) => this.loadError.set(toProblem(error).message),
    });
  }

  protected editUser(user: AdminUser): void {
    this.editingUserId.set(user.id);
    this.userForm.setValue({
      name: user.name,
      email: user.email,
      role: user.role,
      password: '',
      active: user.active,
    });
    this.userForm.controls.password.setValidators(Validators.minLength(8));
    this.userForm.controls.password.updateValueAndValidity();
    this.error.set('');
    this.notice.set('');
  }

  protected resetForm(): void {
    this.editingUserId.set(null);
    this.userForm.reset({ name: '', email: '', role: 'cashier', password: '', active: true });
    this.userForm.controls.password.setValidators(Validators.minLength(8));
    this.userForm.controls.password.updateValueAndValidity();
  }

  protected saveUser(): void {
    this.error.set('');
    this.notice.set('');
    const id = this.editingUserId();
    const password = this.userForm.controls.password.value;
    if (this.userForm.invalid || (!id && password.length < 8)) {
      this.userForm.markAllAsTouched();
      if (!id && password.length < 8) this.error.set('Új felhasználónál legalább 8 karakteres jelszó szükséges.');
      return;
    }
    const { name, email, role, active } = this.userForm.getRawValue();
    const payload: {
      name: string;
      email: string;
      role: 'admin' | 'cashier';
      active?: boolean;
      password?: string;
    } = { name: name.trim(), email: email.trim(), role };
    if (id === null) payload.active = active;
    if (password) payload.password = password;

    const request = id
      ? this.admin.update<AdminUser>('users', id, payload)
      : this.admin.create<AdminUser>('users', payload);
    this.saving.set(true);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (user) => {
        this.users.update((items) => id
          ? items.map((item) => item.id === user.id ? user : item)
          : [...items, user]);
        this.resetForm();
        this.notice.set(id ? 'A felhasználó adatai frissültek.' : 'A felhasználó létrejött.');
      },
      error: (error: unknown) => this.error.set(toProblem(error).message),
    });
  }

  protected setActive(user: AdminUser, active: boolean): void {
    const action = active ? 'aktiválod' : 'inaktiválod';
    if (!window.confirm(`Biztosan ${action} a(z) „${user.name}” fiókot?`)) return;
    this.error.set('');
    this.notice.set('');
    this.saving.set(true);
    this.admin.update<AdminUser>('users', user.id, { active }).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (updated) => {
        this.users.update((items) => items.map((item) => item.id === updated.id ? updated : item));
        if (this.editingUserId() === updated.id) this.userForm.controls.active.setValue(updated.active);
        this.notice.set(updated.active ? 'A fiók aktiválva.' : 'A fiók inaktiválva.');
      },
      error: (error: unknown) => this.error.set(toProblem(error).message),
    });
  }
}
