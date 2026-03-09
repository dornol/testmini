<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as m from '$lib/paraglide/messages.js';
	import { setLocale } from '$lib/paraglide/runtime';
	import { setMode } from 'mode-watcher';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { apiPut } from '$lib/api-client';
	import { SvelteSet } from 'svelte/reactivity';

	const NOTIFICATION_TYPES = [
		'TEST_RUN_COMPLETED',
		'TEST_FAILED',
		'COMMENT_ADDED',
		'MENTION',
		'MEMBER_ADDED',
		'ASSIGNED',
		'USER_PENDING'
	] as const;

	let { data } = $props();

	let displayName = $state('');
	let prefLocale = $state('');
	let prefTheme = $state('system');
	let prefSaving = $state(false);

	// Notification preferences
	let notifEnabled = $state(true);
	let mutedTypes = new SvelteSet<string>();

	// Sync from data (reactive)
	$effect(() => {
		displayName = data.userData.name;
		prefLocale = data.preferences.locale ?? '';
		prefTheme = data.preferences.theme ?? 'system';
		notifEnabled = data.preferences.notificationSettings?.enableInApp !== false;
		mutedTypes.clear();
		for (const t of data.preferences.notificationSettings?.mutedTypes ?? []) {
			mutedTypes.add(t);
		}
	});
	let notifSaving = $state(false);

	async function savePreferences() {
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
		notifSaving = true;
		try {
			await apiPut('/api/users/me/preferences', {
				notificationSettings: {
					enableInApp: notifEnabled,
					mutedTypes: [...mutedTypes]
				}
			});
			toast.success(m.notification_preferences_saved());
		} catch {
			// error toast handled by apiPut
		} finally {
			notifSaving = false;
		}
	}

	function toggleMutedType(type: string) {
		if (mutedTypes.has(type)) {
			mutedTypes.delete(type);
		} else {
			mutedTypes.add(type);
		}
	}

	const notifTypeLabels: Record<string, () => string> = {
		TEST_RUN_COMPLETED: m.notification_type_TEST_RUN_COMPLETED,
		TEST_FAILED: m.notification_type_TEST_FAILED,
		COMMENT_ADDED: m.notification_type_COMMENT_ADDED,
		MENTION: m.notification_type_MENTION,
		MEMBER_ADDED: m.notification_type_MEMBER_ADDED,
		ASSIGNED: m.notification_type_ASSIGNED,
		USER_PENDING: m.notification_type_USER_PENDING
	};
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let pwSaving = $state(false);

	function handleNameResult() {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'success') {
				toast.success(m.profile_name_updated());
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? 'Failed to update');
				await update();
			}
		};
	}

	function handlePasswordResult() {
		pwSaving = true;
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			pwSaving = false;
			if (result.type === 'success') {
				toast.success(m.profile_password_updated());
				currentPassword = '';
				newPassword = '';
				confirmPassword = '';
				await invalidateAll();
			} else if (result.type === 'failure') {
				const err = result.data?.passwordError as string;
				if (err === 'password_mismatch') {
					toast.error(m.profile_password_mismatch());
				} else if (err === 'password_wrong') {
					toast.error(m.profile_password_wrong());
				} else {
					toast.error(err ?? 'Failed to change password');
				}
				await update();
			}
		};
	}

	function handleUnlinkResult() {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'success') {
				toast.success(m.oidc_account_unlinked());
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? m.error_operation_failed());
				await update();
			}
		};
	}
</script>

<div class="mx-auto max-w-2xl space-y-4">
	<h1 class="text-xl font-bold">{m.profile_title()}</h1>

	<!-- Account Information -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.profile_account_info()}</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-4">
			<form method="POST" action="?/updateName" use:enhance={handleNameResult} class="space-y-4">
				<div class="space-y-2">
					<Label for="displayName">{m.profile_display_name()}</Label>
					<div class="flex gap-2">
						<Input id="displayName" name="name" bind:value={displayName} class="flex-1" />
						<Button type="submit" size="sm">{m.common_save_changes()}</Button>
					</div>
				</div>
			</form>

			<div class="space-y-2">
				<Label>{m.profile_email()}</Label>
				<p class="text-muted-foreground text-sm">{data.userData.email}</p>
			</div>

			<div class="space-y-2">
				<Label>{m.profile_member_since()}</Label>
				<p class="text-muted-foreground text-sm">{new Date(data.userData.createdAt).toLocaleDateString()}</p>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Change Password -->
	{#if data.hasPassword}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.profile_change_password()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<form method="POST" action="?/changePassword" use:enhance={handlePasswordResult} class="space-y-4">
					<div class="space-y-2">
						<Label for="currentPassword">{m.profile_current_password()}</Label>
						<Input id="currentPassword" name="currentPassword" type="password" bind:value={currentPassword} />
					</div>
					<div class="space-y-2">
						<Label for="newPassword">{m.profile_new_password()}</Label>
						<Input id="newPassword" name="newPassword" type="password" bind:value={newPassword} />
					</div>
					<div class="space-y-2">
						<Label for="confirmPassword">{m.profile_confirm_password()}</Label>
						<Input id="confirmPassword" name="confirmPassword" type="password" bind:value={confirmPassword} />
					</div>
					<Button type="submit" disabled={!currentPassword || !newPassword || !confirmPassword || pwSaving}>
						{pwSaving ? m.common_saving() : m.profile_change_password()}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Preferences -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.profile_preferences()}</Card.Title>
			<Card.Description>{m.profile_preferences_desc()}</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="space-y-2">
				<Label>{m.profile_language()}</Label>
				<Select.Root
					type="single"
					value={prefLocale}
					onValueChange={(v: string) => { prefLocale = v; }}
				>
					<Select.Trigger class="w-full">
						{prefLocale === 'ko' ? '한국어' : prefLocale === 'en' ? 'English' : m.profile_theme_system()}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="en" label="English" />
						<Select.Item value="ko" label="한국어" />
					</Select.Content>
				</Select.Root>
			</div>
			<div class="space-y-2">
				<Label>{m.profile_theme()}</Label>
				<Select.Root
					type="single"
					value={prefTheme}
					onValueChange={(v: string) => { prefTheme = v; }}
				>
					<Select.Trigger class="w-full">
						{prefTheme === 'light' ? m.profile_theme_light() : prefTheme === 'dark' ? m.profile_theme_dark() : m.profile_theme_system()}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="system" label={m.profile_theme_system()} />
						<Select.Item value="light" label={m.profile_theme_light()} />
						<Select.Item value="dark" label={m.profile_theme_dark()} />
					</Select.Content>
				</Select.Root>
			</div>
			<Button onclick={savePreferences} disabled={prefSaving}>
				{prefSaving ? m.common_saving() : m.common_save_changes()}
			</Button>
		</Card.Content>
	</Card.Root>

	<!-- Notification Preferences -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.notification_preferences()}</Card.Title>
			<Card.Description>{m.notification_preferences_desc()}</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="flex items-center gap-2">
				<Checkbox
					id="notif-enabled"
					checked={notifEnabled}
					onCheckedChange={(v) => { notifEnabled = !!v; }}
				/>
				<Label for="notif-enabled">{m.notification_enable_in_app()}</Label>
			</div>

			{#if notifEnabled}
				<div class="space-y-2">
					<Label>{m.notification_muted_types()}</Label>
					{#each NOTIFICATION_TYPES as type (type)}
						<div class="flex items-center gap-2">
							<Checkbox
								id="notif-type-{type}"
								checked={!mutedTypes.has(type)}
								onCheckedChange={() => toggleMutedType(type)}
							/>
							<Label for="notif-type-{type}">{notifTypeLabels[type]()}</Label>
						</div>
					{/each}
				</div>
			{/if}

			<Button onclick={saveNotificationPreferences} disabled={notifSaving}>
				{notifSaving ? m.common_saving() : m.common_save_changes()}
			</Button>
		</Card.Content>
	</Card.Root>

	<!-- Connected Accounts -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.profile_connected_accounts()}</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if data.linkedAccounts.length > 0}
				<div class="space-y-3">
					{#each data.linkedAccounts as acct (acct.id)}
						<div class="flex items-center justify-between rounded-lg border p-3">
							<div class="flex items-center gap-3">
								{#if acct.providerIconUrl}
									<img src={acct.providerIconUrl} alt="" class="h-6 w-6" />
								{:else}
									<div class="bg-muted flex h-6 w-6 items-center justify-center rounded text-xs font-bold">
										{acct.providerName.charAt(0).toUpperCase()}
									</div>
								{/if}
								<div>
									<p class="text-sm font-medium">{acct.providerName}</p>
									<p class="text-muted-foreground text-xs">{acct.email || acct.externalId}</p>
								</div>
							</div>
							<form method="POST" action="?/unlink" use:enhance={handleUnlinkResult}>
								<input type="hidden" name="accountId" value={acct.id} />
								<Button type="submit" variant="outline" size="sm">
									{m.oidc_unlink_account()}
								</Button>
							</form>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-muted-foreground text-sm">{m.oidc_no_providers()}</p>
			{/if}

			{#if data.availableProviders.length > 0}
				<div class="space-y-2 pt-2">
					<p class="text-sm font-medium">{m.oidc_link_account()}</p>
					{#each data.availableProviders as provider (provider.slug)}
						<Button variant="outline" class="w-full" href="/auth/oidc/{provider.slug}?link=true" data-sveltekit-reload>
							{#if provider.iconUrl}
								<img src={provider.iconUrl} alt="" class="mr-2 h-4 w-4" />
							{/if}
							{m.oidc_login_with({ name: provider.name })}
						</Button>
					{/each}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
