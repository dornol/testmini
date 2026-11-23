<script lang="ts">
	import { tick } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import LinkedAccounts from '$lib/components/LinkedAccounts.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { setLocale } from '$lib/paraglide/runtime';
	import { setMode } from 'mode-watcher';
	import { apiPut } from '$lib/api-client';

	const NOTIFICATION_TYPES = [
		'TEST_RUN_COMPLETED',
		'TEST_FAILED',
		'COMMENT_ADDED',
		'MENTION',
		'MEMBER_ADDED',
		'ASSIGNED',
		'USER_PENDING'
	] as const;

	const notifTypeLabels: Record<string, () => string> = {
		TEST_RUN_COMPLETED: m.notification_type_TEST_RUN_COMPLETED,
		TEST_FAILED: m.notification_type_TEST_FAILED,
		COMMENT_ADDED: m.notification_type_COMMENT_ADDED,
		MENTION: m.notification_type_MENTION,
		MEMBER_ADDED: m.notification_type_MEMBER_ADDED,
		ASSIGNED: m.notification_type_ASSIGNED,
		USER_PENDING: m.notification_type_USER_PENDING
	};

	const MIN_PASSWORD = 8;
	const MAX_PASSWORD = 1024;

	let { data } = $props();

	// Writable $derived: follows the loaded data, but stays editable while typing.
	let displayName = $derived(data.userData.name);
	let prefLocale = $derived(data.preferences.locale ?? '');
	let prefTheme = $derived(data.preferences.theme ?? 'system');
	let notifEnabled = $derived(data.preferences.notificationSettings?.enableInApp !== false);
	let muted = $derived([...(data.preferences.notificationSettings?.mutedTypes ?? [])]);

	const selectClass =
		'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring';

	// ── Name ──
	let nameSaving = $state(false);
	let nameError = $state('');

	const submitName: SubmitFunction = ({ cancel }) => {
		if (nameSaving) {
			cancel();
			return;
		}
		nameSaving = true;
		nameError = '';
		return async ({ result }) => {
			try {
				if (result.type === 'success') {
					toast.success(m.profile_name_updated());
					await invalidateAll();
				} else {
					const raw = result.type === 'failure' ? result.data?.error : undefined;
					nameError =
						typeof raw === 'string' && raw.startsWith('Name is required')
							? m.profile_name_required()
							: m.error_operation_failed();
					await tick();
					document.getElementById('displayName')?.focus();
				}
			} finally {
				nameSaving = false;
			}
		};
	};

	// ── Password ──
	type PasswordField = 'currentPassword' | 'newPassword' | 'confirmPassword';
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let showPasswords = $state(false);
	let pwSaving = $state(false);
	let pwError = $state<{ field: PasswordField | null; message: string } | null>(null);
	let pwGeneralEl = $state<HTMLElement | null>(null);

	async function failPassword(field: PasswordField | null, message: string) {
		pwError = { field, message };
		await tick();
		if (field) document.getElementById(field)?.focus();
		else pwGeneralEl?.focus();
	}

	// Server messages are English; tie them to the field they are about.
	function passwordFailure(raw: unknown): [PasswordField | null, string] {
		const text = typeof raw === 'string' ? raw : '';
		if (text === 'password_mismatch') return ['confirmPassword', m.profile_password_mismatch()];
		if (text === 'password_wrong') return ['currentPassword', m.profile_password_wrong()];
		if (text.startsWith('Password must be at least'))
			return ['newPassword', m.profile_password_too_short()];
		if (text.startsWith('Password must be')) return ['newPassword', m.profile_password_too_long()];
		return [null, m.error_operation_failed()];
	}

	const submitPassword: SubmitFunction = ({ cancel }) => {
		if (pwSaving) {
			cancel();
			return;
		}
		pwError = null;
		// Catch the common mistakes before a round trip.
		if (newPassword.length < MIN_PASSWORD) {
			cancel();
			void failPassword('newPassword', m.profile_password_too_short());
			return;
		}
		if (newPassword !== confirmPassword) {
			cancel();
			void failPassword('confirmPassword', m.profile_password_mismatch());
			return;
		}
		pwSaving = true;
		return async ({ result }) => {
			try {
				if (result.type === 'success') {
					toast.success(m.profile_password_updated());
					currentPassword = newPassword = confirmPassword = '';
					await invalidateAll();
				} else {
					const [field, message] = passwordFailure(
						result.type === 'failure' ? result.data?.passwordError : undefined
					);
					await failPassword(field, message);
				}
			} finally {
				pwSaving = false;
			}
		};
	};

	const pwInvalid = (field: PasswordField) => (pwError?.field === field ? true : undefined);
	const pwDescribedBy = (field: PasswordField, ...extra: string[]) =>
		[...extra, pwError?.field === field ? `${field}-error` : ''].filter(Boolean).join(' ') ||
		undefined;

	// ── Preferences ──
	let prefSaving = $state(false);
	let notifSaving = $state(false);

	async function savePreferences() {
		if (prefSaving) return;
		prefSaving = true;
		try {
			await apiPut('/api/users/me/preferences', {
				locale: prefLocale || null,
				theme: prefTheme || null
			});
			if (prefLocale) setLocale(prefLocale as 'ko' | 'en');
			if (prefTheme) setMode(prefTheme as 'light' | 'dark' | 'system');
			toast.success(m.profile_preferences_saved());
			await invalidateAll();
		} catch {
			// error toast handled by apiPut
		} finally {
			prefSaving = false;
		}
	}

	async function saveNotificationPreferences() {
		if (notifSaving) return;
		notifSaving = true;
		try {
			await apiPut('/api/users/me/preferences', {
				notificationSettings: { enableInApp: notifEnabled, mutedTypes: muted }
			});
			toast.success(m.notification_preferences_saved());
		} catch {
			// error toast handled by apiPut
		} finally {
			notifSaving = false;
		}
	}

	function toggleMutedType(type: string) {
		muted = muted.includes(type) ? muted.filter((t) => t !== type) : [...muted, type];
	}
</script>

{#snippet passwordField(
	field: PasswordField,
	label: string,
	autocomplete: 'current-password' | 'new-password',
	value: string,
	set: (v: string) => void,
	hintId?: string
)}
	<div class="space-y-2">
		<Label for={field}>{label}</Label>
		<Input
			id={field}
			name={field}
			type={showPasswords ? 'text' : 'password'}
			{autocomplete}
			required
			maxlength={MAX_PASSWORD}
			{value}
			oninput={(e) => set(e.currentTarget.value)}
			aria-invalid={pwInvalid(field)}
			aria-describedby={pwDescribedBy(field, hintId ?? '')}
		/>
		{#if pwError?.field === field}
			<p id="{field}-error" class="text-sm text-destructive">{pwError.message}</p>
		{/if}
	</div>
{/snippet}

<div class="mx-auto max-w-2xl space-y-4">
	<h1 class="text-xl font-bold">{m.profile_title()}</h1>

	<!-- Account Information -->
	<Card.Root>
		<Card.Header>
			<Card.Title id="profile-info-title" role="heading" aria-level={2}
				>{m.profile_account_info()}</Card.Title
			>
		</Card.Header>
		<Card.Content class="space-y-4">
			<form method="POST" action="?/updateName" use:enhance={submitName} class="space-y-2">
				<Label for="displayName">{m.profile_display_name()}</Label>
				<div class="flex flex-col gap-2 sm:flex-row">
					<Input
						id="displayName"
						name="name"
						bind:value={displayName}
						required
						maxlength={100}
						autocomplete="name"
						class="flex-1"
						aria-invalid={nameError ? true : undefined}
						aria-describedby={nameError ? 'displayName-error' : undefined}
					/>
					<Button
						type="submit"
						class="min-h-10 w-full sm:w-auto"
						disabled={nameSaving}
						aria-describedby="profile-info-title"
					>
						{nameSaving ? m.common_saving() : m.common_save_changes()}
					</Button>
				</div>
				{#if nameError}
					<p id="displayName-error" class="text-sm text-destructive">{nameError}</p>
				{/if}
			</form>

			<dl class="space-y-3 text-sm">
				<div>
					<dt class="font-medium">{m.profile_email()}</dt>
					<dd class="text-muted-foreground [overflow-wrap:anywhere]">{data.userData.email}</dd>
				</div>
				<div>
					<dt class="font-medium">{m.profile_member_since()}</dt>
					<dd class="text-muted-foreground">
						{new Date(data.userData.createdAt).toLocaleDateString()}
					</dd>
				</div>
			</dl>
		</Card.Content>
	</Card.Root>

	<!-- Change Password -->
	{#if data.hasPassword}
		<Card.Root>
			<Card.Header>
				<Card.Title id="profile-password-title" role="heading" aria-level={2}
					>{m.profile_change_password()}</Card.Title
				>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/changePassword"
					use:enhance={submitPassword}
					class="space-y-4"
				>
					{@render passwordField(
						'currentPassword',
						m.profile_current_password(),
						'current-password',
						currentPassword,
						(v) => (currentPassword = v)
					)}
					{@render passwordField(
						'newPassword',
						m.profile_new_password(),
						'new-password',
						newPassword,
						(v) => (newPassword = v),
						'newPassword-hint'
					)}
					<p id="newPassword-hint" class="-mt-2 text-xs text-muted-foreground">
						{m.profile_password_hint()}
					</p>
					{@render passwordField(
						'confirmPassword',
						m.profile_confirm_password(),
						'new-password',
						confirmPassword,
						(v) => (confirmPassword = v)
					)}

					<div class="flex items-center gap-2">
						<input
							id="show-passwords"
							type="checkbox"
							bind:checked={showPasswords}
							class="size-5 rounded border border-muted-foreground"
						/>
						<Label for="show-passwords">{m.auth_show_password()}</Label>
					</div>

					{#if pwError && !pwError.field}
						<p role="alert" tabindex="-1" bind:this={pwGeneralEl} class="text-sm text-destructive">
							{pwError.message}
						</p>
					{/if}

					<Button
						type="submit"
						class="min-h-10 w-full sm:w-auto"
						disabled={pwSaving}
						aria-describedby="profile-password-title"
					>
						{pwSaving ? m.common_saving() : m.profile_change_password()}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Preferences -->
	<Card.Root>
		<Card.Header>
			<Card.Title id="profile-pref-title" role="heading" aria-level={2}
				>{m.profile_preferences()}</Card.Title
			>
			<Card.Description>{m.profile_preferences_desc()}</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="space-y-2">
				<Label for="pref-locale">{m.profile_language()}</Label>
				<select id="pref-locale" bind:value={prefLocale} class={selectClass}>
					<option value="">{m.profile_theme_system()}</option>
					<option value="en">English</option>
					<option value="ko">한국어</option>
				</select>
			</div>
			<div class="space-y-2">
				<Label for="pref-theme">{m.profile_theme()}</Label>
				<select id="pref-theme" bind:value={prefTheme} class={selectClass}>
					<option value="system">{m.profile_theme_system()}</option>
					<option value="light">{m.profile_theme_light()}</option>
					<option value="dark">{m.profile_theme_dark()}</option>
				</select>
			</div>
			<Button
				onclick={savePreferences}
				class="min-h-10 w-full sm:w-auto"
				disabled={prefSaving}
				aria-describedby="profile-pref-title"
			>
				{prefSaving ? m.common_saving() : m.common_save_changes()}
			</Button>
		</Card.Content>
	</Card.Root>

	<!-- Notification Preferences -->
	<Card.Root>
		<Card.Header>
			<Card.Title id="profile-notif-title" role="heading" aria-level={2}
				>{m.notification_preferences()}</Card.Title
			>
			<Card.Description>{m.notification_preferences_desc()}</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="flex items-center gap-2">
				<Checkbox
					id="notif-enabled"
					checked={notifEnabled}
					onCheckedChange={(v) => {
						notifEnabled = !!v;
					}}
				/>
				<Label for="notif-enabled">{m.notification_enable_in_app()}</Label>
			</div>

			{#if notifEnabled}
				<fieldset class="space-y-2">
					<legend class="mb-2 text-sm font-medium">{m.notification_muted_types()}</legend>
					{#each NOTIFICATION_TYPES as type (type)}
						<div class="flex items-center gap-2">
							<Checkbox
								id="notif-type-{type}"
								checked={!muted.includes(type)}
								onCheckedChange={() => toggleMutedType(type)}
							/>
							<Label for="notif-type-{type}">{notifTypeLabels[type]()}</Label>
						</div>
					{/each}
				</fieldset>
			{/if}

			<Button
				onclick={saveNotificationPreferences}
				class="min-h-10 w-full sm:w-auto"
				disabled={notifSaving}
				aria-describedby="profile-notif-title"
			>
				{notifSaving ? m.common_saving() : m.common_save_changes()}
			</Button>
		</Card.Content>
	</Card.Root>

	<!-- Connected Accounts -->
	<LinkedAccounts
		linkedAccounts={data.linkedAccounts}
		availableProviders={data.availableProviders}
		hasPassword={data.hasPassword}
		title={m.profile_connected_accounts()}
	/>
</div>
