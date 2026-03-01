<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as m from '$lib/paraglide/messages.js';

	let email = $state('');
	let password = $state('');
	let loading = $state(false);

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
		<Card.Title class="text-2xl">{m.auth_login_title()}</Card.Title>
		<Card.Description>{m.auth_login_desc()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form onsubmit={handleSubmit} class="space-y-4">
			<div class="space-y-2">
				<Label for="email">{m.common_email()}</Label>
				<Input id="email" type="email" placeholder={m.auth_email_placeholder()} bind:value={email} required />
			</div>

			<div class="space-y-2">
				<Label for="password">{m.auth_password()}</Label>
				<Input id="password" type="password" bind:value={password} required />
			</div>

			<Button type="submit" class="w-full" disabled={loading}>
				{loading ? m.auth_signing_in() : m.auth_sign_in()}
			</Button>
		</form>
	</Card.Content>
	<Card.Footer class="justify-center">
		<p class="text-sm text-muted-foreground">
			{m.auth_no_account()}
			<a href="/auth/register" class="text-primary underline-offset-4 hover:underline">{m.auth_register()}</a>
		</p>
	</Card.Footer>
</Card.Root>
