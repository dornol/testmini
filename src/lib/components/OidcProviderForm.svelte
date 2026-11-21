<script lang="ts">
	import { tick } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { apiPost } from '$lib/api-client';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import FormErrorSummary from '$lib/components/patterns/FormErrorSummary.svelte';
	import * as m from '$lib/paraglide/messages.js';

	type Provider = {
		name: string;
		slug: string;
		providerType: string;
		clientId: string;
		issuerUrl: string | null;
		jwksUri: string | null;
		authorizationUrl: string;
		tokenUrl: string;
		userinfoUrl: string | null;
		scopes: string;
		autoRegister: boolean;
		iconUrl: string | null;
		displayOrder: number;
	};

	// Without `provider` the form creates a new provider; with it, it edits that one.
	let { provider, accountCount = 0 }: { provider?: Provider; accountCount?: number } = $props();
	const editing = $derived(!!provider);

	// Writable $derived: follows the loaded provider, but stays editable while typing.
	let name = $derived(provider?.name ?? '');
	let slugInput = $state<string | null>(null); // null = follow the name (create) or the saved slug (edit)
	let providerType = $derived(provider?.providerType ?? 'OIDC');
	let clientId = $derived(provider?.clientId ?? '');
	let clientSecret = $state('');
	let issuerUrl = $derived(provider?.issuerUrl ?? '');
	let jwksUri = $derived(provider?.jwksUri ?? '');
	let authorizationUrl = $derived(provider?.authorizationUrl ?? '');
	let tokenUrl = $derived(provider?.tokenUrl ?? '');
	let userinfoUrl = $derived(provider?.userinfoUrl ?? '');
	let scopes = $derived(provider?.scopes ?? 'openid profile email');
	let autoRegister = $derived(provider?.autoRegister ?? true);
	let iconUrl = $derived(provider?.iconUrl ?? '');
	let displayOrder = $derived(provider?.displayOrder ?? 0);

	const autoSlug = $derived(
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
	);
	const slug = $derived(slugInput ?? (provider ? provider.slug : autoSlug));
	const redirectUri = $derived(`${page.url.origin}/auth/oidc/${slug || '{slug}'}/callback`);

	let pending = $state(false);
	let error = $state<{ field: string | null; message: string } | null>(null);
	let summaryEl = $state<HTMLDivElement | null>(null);

	let discovering = $state(false);
	let discoverNotice = $state<{ kind: 'status' | 'error'; text: string } | null>(null);

	const URL_FIELDS = [
		'authorizationUrl',
		'tokenUrl',
		'issuerUrl',
		'jwksUri',
		'userinfoUrl',
		'iconUrl'
	];

	// Server messages are English and unspecific; turn them into a message tied to the field.
	function parseError(raw: unknown) {
		const text = typeof raw === 'string' ? raw : '';
		if (text === 'A provider with this slug already exists')
			return { field: 'slug', message: m.oidc_slug_taken() };
		if (text.startsWith('Slug must contain'))
			return { field: 'slug', message: m.oidc_slug_invalid() };
		if (text === 'Missing required fields')
			return { field: null, message: m.oidc_required_fields() };
		if (text === 'Provider not found') return { field: null, message: m.oidc_provider_not_found() };
		const match = /^(\w+): (.*)$/.exec(text);
		if (match && URL_FIELDS.includes(match[1]))
			return { field: match[1], message: m.oidc_url_invalid({ detail: match[2] }) };
		return { field: null, message: m.error_operation_failed() };
	}

	const invalid = (id: string) => (error?.field === id ? true : undefined);
	const describedBy = (id: string, ...extra: string[]) =>
		[...extra, error?.field === id ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;

	async function discover() {
		if (!issuerUrl || discovering) return;
		discovering = true;
		discoverNotice = null;
		try {
			const d = await apiPost<{
				authorizationUrl?: string;
				tokenUrl?: string;
				userinfoUrl?: string;
				jwksUri?: string;
			}>('/api/admin/oidc-providers/discover', { issuerUrl });
			// Keep what is already typed when the provider does not advertise an endpoint.
			authorizationUrl = d.authorizationUrl || authorizationUrl;
			tokenUrl = d.tokenUrl || tokenUrl;
			userinfoUrl = d.userinfoUrl || userinfoUrl;
			jwksUri = d.jwksUri || jwksUri;
			discoverNotice = { kind: 'status', text: m.oidc_discover_success() };
		} catch {
			// apiPost already toasts the server's reason; add the way forward next to the field.
			discoverNotice = {
				kind: 'error',
				text: `${m.oidc_discover_fail()}. ${m.oidc_discover_failed_hint()}`
			};
		} finally {
			discovering = false;
		}
	}

	const submit: SubmitFunction = ({ cancel }) => {
		if (pending) {
			cancel();
			return;
		}
		pending = true;
		error = null;
		return async ({ result }) => {
			try {
				if (result.type === 'redirect') {
					toast.success(m.oidc_provider_created());
					await goto(result.location);
				} else if (result.type === 'success') {
					toast.success(m.oidc_provider_updated());
					clientSecret = '';
					await invalidateAll();
				} else {
					error = parseError(result.type === 'failure' ? result.data?.error : undefined);
					await tick();
					summaryEl?.focus();
				}
			} finally {
				pending = false;
			}
		};
	};

	// ── Delete (edit only) ──
	let deleteOpen = $state(false);
	let deletePending = $state(false);
	let deleteError = $state('');
	let deleteErrorEl = $state<HTMLElement | null>(null);
	// The server disables a provider with linked accounts instead of deleting it.
	const disablesInstead = $derived(accountCount > 0);

	const submitDelete: SubmitFunction = ({ cancel }) => {
		if (deletePending) {
			cancel();
			return;
		}
		deletePending = true;
		deleteError = '';
		return async ({ result }) => {
			try {
				if (result.type === 'redirect') {
					toast.success(m.oidc_provider_deleted());
					await goto(result.location);
				} else if (
					result.type === 'failure' &&
					result.data?.error === 'Provider has linked accounts. It has been disabled instead.'
				) {
					// Not a failure: the server disabled the provider as promised in the dialog.
					deleteOpen = false;
					await invalidateAll();
					toast.success(m.oidc_provider_disabled());
				} else {
					deleteError = parseError(
						result.type === 'failure' ? result.data?.error : undefined
					).message;
					await tick();
					deleteErrorEl?.focus();
				}
			} finally {
				deletePending = false;
			}
		};
	};
</script>

{#snippet required()}<span aria-hidden="true" class="text-destructive"> *</span>{/snippet}

{#snippet fieldError(id: string)}
	{#if error?.field === id}
		<p id="{id}-error" class="text-sm text-destructive [overflow-wrap:anywhere]">
			{error.message}
		</p>
	{/if}
{/snippet}

<div class="space-y-4">
	<Button variant="ghost" size="sm" class="min-h-10 -ms-2" href="/admin/oidc-providers">
		<ArrowLeftIcon class="size-4" aria-hidden="true" />
		{m.common_back_to({ target: m.oidc_providers_title() })}
	</Button>

	<Card.Root>
		<Card.Header>
			<Card.Title role="heading" aria-level={2}
				>{editing ? m.oidc_edit_provider() : m.oidc_add_provider()}</Card.Title
			>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action={editing ? '?/update' : '?/create'}
				use:enhance={submit}
				class="space-y-4"
			>
				<FormErrorSummary
					bind:ref={summaryEl}
					errors={error ? [{ path: error.field ?? 'form', messages: [error.message] }] : []}
					fieldTarget={(path) => (path === 'form' ? undefined : path)}
				/>

				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="name">{m.oidc_provider_name()}{@render required()}</Label>
						<Input
							id="name"
							name="name"
							bind:value={name}
							required
							maxlength={100}
							placeholder="Corporate Keycloak"
						/>
					</div>
					<div class="space-y-2">
						<Label for="slug">{m.oidc_provider_slug()}{@render required()}</Label>
						<Input
							id="slug"
							name="slug"
							value={slug}
							required
							maxlength={80}
							pattern="[a-z0-9\-]+"
							placeholder="corp-keycloak"
							aria-invalid={invalid('slug')}
							aria-describedby={describedBy('slug', 'slug-hint')}
							oninput={(e) => (slugInput = e.currentTarget.value)}
						/>
						{@render fieldError('slug')}
					</div>
				</div>
				<p id="slug-hint" class="-mt-2 text-xs text-muted-foreground">{m.oidc_slug_hint()}</p>

				<div class="space-y-2">
					<Label for="redirectUri">{m.oidc_redirect_uri()}</Label>
					<Input
						id="redirectUri"
						readonly
						value={redirectUri}
						aria-describedby="redirectUri-hint"
						onfocus={(e) => e.currentTarget.select()}
					/>
					<p id="redirectUri-hint" class="text-xs text-muted-foreground">
						{m.oidc_redirect_uri_hint()}
					</p>
				</div>

				<div class="space-y-2">
					<Label for="providerType">{m.oidc_provider_type()}</Label>
					<select
						id="providerType"
						name="providerType"
						bind:value={providerType}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
					>
						<option value="OIDC">OIDC</option>
						<option value="OAUTH2">OAuth2</option>
					</select>
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="clientId">{m.oidc_client_id()}{@render required()}</Label>
						<Input
							id="clientId"
							name="clientId"
							bind:value={clientId}
							required
							maxlength={500}
							autocomplete="off"
						/>
					</div>
					<div class="space-y-2">
						<Label for="clientSecret"
							>{m.oidc_client_secret()}{#if !editing}{@render required()}{/if}</Label
						>
						<!-- new-password keeps password managers from filling the admin's own login here. -->
						<Input
							id="clientSecret"
							name="clientSecret"
							type="password"
							bind:value={clientSecret}
							required={!editing}
							maxlength={4000}
							autocomplete="new-password"
							placeholder={editing ? m.oidc_client_secret_keep() : undefined}
						/>
					</div>
				</div>

				<div class="space-y-2">
					<Label for="issuerUrl">{m.oidc_issuer_url()}</Label>
					<div class="flex flex-col gap-2 sm:flex-row">
						<Input
							id="issuerUrl"
							name="issuerUrl"
							type="url"
							bind:value={issuerUrl}
							aria-invalid={invalid('issuerUrl')}
							aria-describedby={describedBy('issuerUrl', 'discover-notice')}
							placeholder="https://idp.example.com/realms/main"
						/>
						<Button
							type="button"
							variant="outline"
							onclick={discover}
							disabled={discovering || !issuerUrl}
							class="min-h-10 w-full sm:w-auto"
						>
							{discovering ? m.common_loading() : m.oidc_discover()}
						</Button>
					</div>
					{@render fieldError('issuerUrl')}
					<!-- Keep the live region mounted so a result is announced. -->
					<p
						id="discover-notice"
						role={discoverNotice?.kind === 'error' ? 'alert' : 'status'}
						class="text-sm empty:hidden {discoverNotice?.kind === 'error'
							? 'text-destructive'
							: 'text-muted-foreground'}"
					>
						{discoverNotice?.text ?? ''}
					</p>
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="authorizationUrl">{m.oidc_authorization_url()}{@render required()}</Label>
						<Input
							id="authorizationUrl"
							name="authorizationUrl"
							type="url"
							bind:value={authorizationUrl}
							required
							aria-invalid={invalid('authorizationUrl')}
							aria-describedby={describedBy('authorizationUrl')}
						/>
						{@render fieldError('authorizationUrl')}
					</div>
					<div class="space-y-2">
						<Label for="tokenUrl">{m.oidc_token_url()}{@render required()}</Label>
						<Input
							id="tokenUrl"
							name="tokenUrl"
							type="url"
							bind:value={tokenUrl}
							required
							aria-invalid={invalid('tokenUrl')}
							aria-describedby={describedBy('tokenUrl')}
						/>
						{@render fieldError('tokenUrl')}
					</div>
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="userinfoUrl">{m.oidc_userinfo_url()}</Label>
						<Input
							id="userinfoUrl"
							name="userinfoUrl"
							type="url"
							bind:value={userinfoUrl}
							aria-invalid={invalid('userinfoUrl')}
							aria-describedby={describedBy('userinfoUrl')}
						/>
						{@render fieldError('userinfoUrl')}
					</div>
					<div class="space-y-2">
						<Label for="jwksUri">{m.oidc_jwks_uri()}</Label>
						<Input
							id="jwksUri"
							name="jwksUri"
							type="url"
							bind:value={jwksUri}
							aria-invalid={invalid('jwksUri')}
							aria-describedby={describedBy('jwksUri', 'jwksUri-hint')}
						/>
						{@render fieldError('jwksUri')}
					</div>
				</div>
				<p id="jwksUri-hint" class="-mt-2 text-xs text-muted-foreground">
					{m.oidc_jwks_uri_hint()}
				</p>

				<div class="space-y-2">
					<Label for="scopes">{m.oidc_scopes()}</Label>
					<Input id="scopes" name="scopes" bind:value={scopes} maxlength={500} />
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="iconUrl">{m.oidc_icon_url()}</Label>
						<Input
							id="iconUrl"
							name="iconUrl"
							type="url"
							bind:value={iconUrl}
							maxlength={2000}
							aria-invalid={invalid('iconUrl')}
							aria-describedby={describedBy('iconUrl')}
						/>
						{@render fieldError('iconUrl')}
					</div>
					<div class="space-y-2">
						<Label for="displayOrder">{m.oidc_display_order()}</Label>
						<Input
							id="displayOrder"
							name="displayOrder"
							type="number"
							min={0}
							bind:value={displayOrder}
						/>
					</div>
				</div>

				<div class="flex items-center gap-2">
					<input
						id="autoRegister"
						name="autoRegister"
						type="checkbox"
						bind:checked={autoRegister}
						class="size-5 rounded border"
					/>
					<Label for="autoRegister">{m.oidc_auto_register()}</Label>
				</div>

				<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button class="min-h-10 w-full sm:w-auto" variant="outline" href="/admin/oidc-providers">
						{m.common_cancel()}
					</Button>
					<Button class="min-h-10 w-full sm:w-auto" type="submit" disabled={pending}>
						{#if pending}
							{m.common_saving()}
						{:else}
							{editing ? m.common_save_changes() : m.oidc_add_provider()}
						{/if}
					</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	{#if editing}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-destructive" role="heading" aria-level={2}
					>{m.settings_danger_zone()}</Card.Title
				>
			</Card.Header>
			<Card.Content>
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div class="min-w-0">
						<p class="text-sm font-medium">
							{disablesInstead ? m.oidc_disable() : m.common_delete()}
						</p>
						{#if disablesInstead}
							<p class="text-sm text-muted-foreground">{m.oidc_has_accounts_warning()}</p>
						{/if}
					</div>
					<Button
						variant="destructive"
						onclick={() => {
							deleteError = '';
							deleteOpen = true;
						}}
						class="min-h-10 w-full sm:w-auto sm:self-auto"
					>
						{disablesInstead ? m.oidc_disable() : m.common_delete()}
					</Button>
				</div>
			</Card.Content>
		</Card.Root>

		<AlertDialog.Root bind:open={deleteOpen}>
			<AlertDialog.Content escapeKeydownBehavior={deletePending ? 'ignore' : 'close'}>
				<AlertDialog.Header>
					<AlertDialog.Title
						>{disablesInstead
							? m.admin_confirm_toggle_title()
							: m.common_delete()}</AlertDialog.Title
					>
					<AlertDialog.Description class="[overflow-wrap:anywhere]">
						{m.oidc_delete_confirm({ name: provider?.name ?? '' })}
					</AlertDialog.Description>
				</AlertDialog.Header>
				{#if disablesInstead}
					<p class="text-sm text-amber-700 dark:text-amber-400">{m.oidc_has_accounts_warning()}</p>
				{/if}
				{#if deleteError}
					<p role="alert" tabindex="-1" bind:this={deleteErrorEl} class="text-sm text-destructive">
						{deleteError}
					</p>
				{/if}
				<AlertDialog.Footer>
					<AlertDialog.Cancel class="min-h-10 w-full sm:w-auto" disabled={deletePending}
						>{m.common_cancel()}</AlertDialog.Cancel
					>
					<form
						method="POST"
						action="?/deleteProvider"
						use:enhance={submitDelete}
						class="w-full sm:w-auto"
					>
						<Button
							type="submit"
							variant="destructive"
							class="min-h-10 w-full sm:w-auto"
							disabled={deletePending}
						>
							{deletePending
								? m.common_saving()
								: disablesInstead
									? m.oidc_disable()
									: m.common_delete()}
						</Button>
					</form>
				</AlertDialog.Footer>
			</AlertDialog.Content>
		</AlertDialog.Root>
	{/if}
</div>
