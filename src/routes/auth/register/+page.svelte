<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let passwordConfirm = $state('');
	let loading = $state(false);
	let error = $state('');

	const passwordMismatch = $derived(
		passwordConfirm.length > 0 && password !== passwordConfirm
	);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (password !== passwordConfirm) {
			error = 'Passwords do not match';
			return;
		}

		loading = true;
		error = '';

		const result = await authClient.signUp.email({ name, email, password });
		loading = false;

		if (result.error) {
			toast.error(result.error.message ?? 'Registration failed');
			return;
		}

		toast.success('Account created successfully!');
		goto('/projects');
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title class="text-2xl">Register</Card.Title>
		<Card.Description>Create a new account</Card.Description>
	</Card.Header>
	<Card.Content>
		<form onsubmit={handleSubmit} class="space-y-4">
			<div class="space-y-2">
				<Label for="name">Name</Label>
				<Input id="name" type="text" placeholder="Your name" bind:value={name} required />
			</div>

			<div class="space-y-2">
				<Label for="email">Email</Label>
				<Input id="email" type="email" placeholder="you@example.com" bind:value={email} required />
			</div>

			<div class="space-y-2">
				<Label for="password">Password</Label>
				<Input id="password" type="password" bind:value={password} required minlength={8} />
			</div>

			<div class="space-y-2">
				<Label for="passwordConfirm">Confirm Password</Label>
				<Input
					id="passwordConfirm"
					type="password"
					bind:value={passwordConfirm}
					required
					aria-invalid={passwordMismatch ? 'true' : undefined}
				/>
				{#if passwordMismatch}
					<p class="text-sm text-destructive">Passwords do not match</p>
				{/if}
			</div>

			{#if error}
				<p class="text-sm text-destructive">{error}</p>
			{/if}

			<Button type="submit" class="w-full" disabled={loading}>
				{loading ? 'Creating account...' : 'Create account'}
			</Button>
		</form>
	</Card.Content>
	<Card.Footer class="justify-center">
		<p class="text-sm text-muted-foreground">
			Already have an account?
			<a href="/auth/login" class="text-primary underline-offset-4 hover:underline">Sign in</a>
		</p>
	</Card.Footer>
</Card.Root>
