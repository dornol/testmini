<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as m from '$lib/paraglide/messages.js';
	import { SvelteSet } from 'svelte/reactivity';

	let { data } = $props();

	let email = $state('');
	let password = $state('');
	let loading = $state(false);
	let failedIconUrls = new SvelteSet<string>();

	function markIconFailed(url: string) {
		failedIconUrls.add(url);
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!email || !password) return;

		loading = true;
		const { error } = await authClient.signIn.email({ email, password });
		loading = false;

		if (error) {
			toast.error(error.message ?? 'Login failed');
			return;
		}

		toast.success(m.auth_welcome_back());
		await invalidateAll();
		goto('/projects');
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title class="text-xl">{m.auth_login_title()}</Card.Title>
		<Card.Description>{m.auth_login_desc()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" onsubmit={handleSubmit} class="space-y-4">
			<div class="space-y-2">
				<Label for="email">{m.common_email()}</Label>
				<Input
					id="email"
					name="email"
					type="email"
					placeholder={m.auth_email_placeholder()}
					bind:value={email}
					required
				/>
			</div>

			<div class="space-y-2">
				<Label for="password">{m.auth_password()}</Label>
				<Input id="password" name="password" type="password" bind:value={password} required />
			</div>

			<Button type="submit" class="w-full" disabled={loading}>
				{loading ? m.auth_signing_in() : m.auth_sign_in()}
			</Button>
		</form>
	</Card.Content>
	{#if data.providers && data.providers.length > 0}
		<Card.Content class="pt-0">
			<div class="relative my-2">
				<div class="absolute inset-0 flex items-center">
					<Separator />
				</div>
				<div class="relative flex justify-center text-xs uppercase">
					<span class="bg-card text-muted-foreground px-2">{m.oidc_or_separator()}</span>
				</div>
			</div>
			<div class="mt-4 space-y-2">
				{#each data.providers as provider (provider.slug)}
					<Button
						variant="outline"
						class="w-full"
						href="/auth/oidc/{provider.slug}"
						data-sveltekit-reload
					>
						{#if provider.iconUrl && !failedIconUrls.has(provider.iconUrl)}
							<img
								src={provider.iconUrl}
								alt=""
								class="h-4 w-4 shrink-0"
								onerror={() => markIconFailed(provider.iconUrl!)}
							/>
						{:else}
							<span
								class="bg-muted text-muted-foreground flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold"
								>{provider.name.charAt(0).toUpperCase()}</span
							>
						{/if}
						<span class="min-w-0 truncate">{m.oidc_login_with({ name: provider.name })}</span>
					</Button>
				{/each}
			</div>
		</Card.Content>
	{/if}
</Card.Root>
