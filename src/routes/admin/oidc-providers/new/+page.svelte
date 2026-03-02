<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let name = $state('');
	let slugOverride = $state('');
	let slugManual = $state(false);
	let providerType = $state('OIDC');
	let clientId = $state('');
	let clientSecret = $state('');
	let issuerUrl = $state('');
	let authorizationUrl = $state('');
	let tokenUrl = $state('');
	let userinfoUrl = $state('');
	let scopes = $state('openid profile email');
	let autoRegister = $state(true);
	let iconUrl = $state('');
	let displayOrder = $state(0);
	let discovering = $state(false);

	const autoSlug = $derived(
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
	);
	const slug = $derived(slugManual ? slugOverride : autoSlug);

	async function discover() {
		if (!issuerUrl) return;
		discovering = true;
		try {
			const res = await fetch('/api/admin/oidc-providers/discover', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ issuerUrl })
			});
			if (!res.ok) {
				toast.error(m.oidc_discover_fail());
				return;
			}
			const data = await res.json();
			authorizationUrl = data.authorizationUrl || '';
			tokenUrl = data.tokenUrl || '';
			userinfoUrl = data.userinfoUrl || '';
			toast.success(m.oidc_discover_success());
		} catch {
			toast.error(m.oidc_discover_fail());
		} finally {
			discovering = false;
		}
	}

	function handleResult() {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'redirect') {
				toast.success(m.oidc_provider_created());
				return;
			}
			if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? 'Creation failed');
				await update();
			}
		};
	}
</script>

<div class="space-y-4">
	<div class="flex items-center gap-2">
		<Button variant="ghost" size="sm" href="/admin/oidc-providers">
			{m.common_back_to({ target: m.oidc_providers_title() })}
		</Button>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.oidc_add_provider()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/create" use:enhance={handleResult} class="space-y-4">
				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-2">
						<Label for="name">{m.oidc_provider_name()}</Label>
						<Input id="name" name="name" bind:value={name} required placeholder="Corporate Keycloak" />
					</div>
					<div class="space-y-2">
						<Label for="slug">{m.oidc_provider_slug()}</Label>
						<Input
							id="slug"
							name="slug"
							value={slug}
							required
							placeholder="corp-keycloak"
							oninput={(e) => { slugManual = true; slugOverride = (e.target as HTMLInputElement).value; }}
						/>
					</div>
				</div>

				<div class="space-y-2">
					<Label for="providerType">{m.oidc_provider_type()}</Label>
					<select id="providerType" name="providerType" bind:value={providerType} class="border-input bg-background ring-offset-background flex h-10 w-full rounded-md border px-3 py-2 text-sm">
						<option value="OIDC">OIDC</option>
						<option value="OAUTH2">OAuth2</option>
					</select>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-2">
						<Label for="clientId">{m.oidc_client_id()}</Label>
						<Input id="clientId" name="clientId" bind:value={clientId} required />
					</div>
					<div class="space-y-2">
						<Label for="clientSecret">{m.oidc_client_secret()}</Label>
						<Input id="clientSecret" name="clientSecret" type="password" bind:value={clientSecret} required />
					</div>
				</div>

				<div class="space-y-2">
					<Label for="issuerUrl">{m.oidc_issuer_url()}</Label>
					<div class="flex gap-2">
						<Input id="issuerUrl" name="issuerUrl" bind:value={issuerUrl} placeholder="https://idp.example.com/realms/main" />
						<Button type="button" variant="outline" onclick={discover} disabled={discovering || !issuerUrl}>
							{m.oidc_discover()}
						</Button>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-2">
						<Label for="authorizationUrl">{m.oidc_authorization_url()}</Label>
						<Input id="authorizationUrl" name="authorizationUrl" bind:value={authorizationUrl} required />
					</div>
					<div class="space-y-2">
						<Label for="tokenUrl">{m.oidc_token_url()}</Label>
						<Input id="tokenUrl" name="tokenUrl" bind:value={tokenUrl} required />
					</div>
				</div>

				<div class="space-y-2">
					<Label for="userinfoUrl">{m.oidc_userinfo_url()}</Label>
					<Input id="userinfoUrl" name="userinfoUrl" bind:value={userinfoUrl} />
				</div>

				<div class="space-y-2">
					<Label for="scopes">{m.oidc_scopes()}</Label>
					<Input id="scopes" name="scopes" bind:value={scopes} />
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-2">
						<Label for="iconUrl">{m.oidc_icon_url()}</Label>
						<Input id="iconUrl" name="iconUrl" bind:value={iconUrl} />
					</div>
					<div class="space-y-2">
						<Label for="displayOrder">{m.oidc_display_order()}</Label>
						<Input id="displayOrder" name="displayOrder" type="number" bind:value={displayOrder} />
					</div>
				</div>

				<div class="flex items-center gap-2">
					<input id="autoRegister" name="autoRegister" type="checkbox" bind:checked={autoRegister} class="h-4 w-4 rounded border" />
					<Label for="autoRegister">{m.oidc_auto_register()}</Label>
				</div>

				<div class="flex justify-end gap-2">
					<Button variant="outline" href="/admin/oidc-providers">{m.common_cancel()}</Button>
					<Button type="submit">{m.oidc_add_provider()}</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
