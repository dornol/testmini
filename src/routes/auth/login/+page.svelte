<script lang="ts">
	import { tick } from 'svelte';
	import { authClient } from '$lib/auth-client';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
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
	let showPassword = $state(false);
	let loading = $state(false);
	// The OIDC callback redirects here with ?error= when SSO fails.
	let error = $state(page.url.searchParams.has('error') ? m.auth_oidc_failed() : '');
	let errorEl = $state<HTMLElement | null>(null);
	let failedIconUrls = new SvelteSet<string>();

	function markIconFailed(url: string) {
		failedIconUrls.add(url);
	}

	async function fail(message: string) {
		error = message;
		await tick();
		errorEl?.focus();
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (loading || !email || !password) return;

		loading = true;
		error = '';
		try {
			const { error: authError } = await authClient.signIn.email({ email, password });
			if (authError) {
				await fail(
					authError.status === 400 || authError.status === 401
						? m.auth_login_failed()
						: m.auth_login_error()
				);
				return;
			}

			toast.success(m.auth_welcome_back());
			await invalidateAll();
			await goto('/projects');
		} catch {
			await fail(m.auth_login_error());
		} finally {
			loading = false;
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title class="text-xl" role="heading" aria-level={1}>{m.auth_login_title()}</Card.Title>
		<Card.Description>{m.auth_login_desc()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" onsubmit={handleSubmit} class="space-y-4">
			{#if error}
				<p
					role="alert"
					tabindex="-1"
					bind:this={errorEl}
					class="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive [overflow-wrap:anywhere]"
				>
					{error}
				</p>
			{/if}

			<div class="space-y-2">
				<Label for="email">{m.common_email()}</Label>
				<Input
					id="email"
					name="email"
					type="email"
					autocomplete="username"
					placeholder={m.auth_email_placeholder()}
					bind:value={email}
					required
				/>
			</div>

			<div class="space-y-2">
				<Label for="password">{m.auth_password()}</Label>
				<div class="relative">
					<Input
						id="password"
						name="password"
						type={showPassword ? 'text' : 'password'}
						autocomplete="current-password"
						class="pe-11"
						bind:value={password}
						required
					/>
					<button
						type="button"
						class="absolute inset-y-0 end-0 flex w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
						aria-label={m.auth_show_password()}
						aria-pressed={showPassword}
						onclick={() => (showPassword = !showPassword)}
					>
						{#if showPassword}<EyeOffIcon class="size-4" aria-hidden="true" />{:else}<EyeIcon
								class="size-4"
								aria-hidden="true"
							/>{/if}
					</button>
				</div>
			</div>

			<Button type="submit" class="min-h-10 w-full" disabled={loading}>
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
						class="h-auto min-h-10 w-full whitespace-normal"
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
						<span class="min-w-0 [overflow-wrap:anywhere]"
							>{m.oidc_login_with({ name: provider.name })}</span
						>
					</Button>
				{/each}
			</div>
		</Card.Content>
	{/if}
</Card.Root>
