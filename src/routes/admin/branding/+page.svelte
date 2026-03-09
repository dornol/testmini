<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import logo from '$lib/assets/logo.svg';

	let { data } = $props();

	let appName = $state('testmini');
	let logoPreview = $state<string | null>(null);
	let faviconPreview = $state<string | null>(null);
	let removeLogo = $state(false);
	let removeFavicon = $state(false);
	let saving = $state(false);

	$effect(() => {
		appName = data.config?.appName || 'testmini';
		logoPreview = null;
		faviconPreview = null;
		removeLogo = false;
		removeFavicon = false;
	});

	function handleLogoChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			removeLogo = false;
			const reader = new FileReader();
			reader.onload = () => { logoPreview = reader.result as string; };
			reader.readAsDataURL(file);
		}
	}

	function handleFaviconChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			removeFavicon = false;
			const reader = new FileReader();
			reader.onload = () => { faviconPreview = reader.result as string; };
			reader.readAsDataURL(file);
		}
	}

	function clearLogo() {
		removeLogo = true;
		logoPreview = null;
	}

	function clearFavicon() {
		removeFavicon = true;
		faviconPreview = null;
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.admin_branding_title()}</Card.Title>
		<Card.Description>{m.admin_branding_desc()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			method="POST"
			action="?/save"
			enctype="multipart/form-data"
			use:enhance={() => {
				saving = true;
				return async ({ result, update }) => {
					saving = false;
					if (result.type === 'success') {
						toast.success(m.admin_branding_saved());
						await invalidateAll();
					} else if (result.type === 'failure') {
						toast.error((result.data?.error as string) ?? m.error_operation_failed());
						await update();
					}
				};
			}}
			class="space-y-6"
		>
			<!-- App Name -->
			<div class="space-y-2">
				<Label for="appName">{m.admin_branding_app_name()}</Label>
				<Input
					id="appName"
					name="appName"
					bind:value={appName}
					placeholder={m.admin_branding_app_name_placeholder()}
					class="max-w-sm"
				/>
			</div>

			<!-- Logo -->
			<div class="space-y-2">
				<Label>{m.admin_branding_logo()}</Label>
				<p class="text-muted-foreground text-xs">{m.admin_branding_logo_desc()}</p>
				<div class="flex items-center gap-4">
					<div class="bg-muted flex h-16 w-16 items-center justify-center rounded-lg border">
						{#if logoPreview}
							<img src={logoPreview} alt="Logo preview" class="h-10 w-10 object-contain" />
						{:else if !removeLogo && data.config?.logoUrl}
							<img src={data.config.logoUrl} alt="Current logo" class="h-10 w-10 object-contain" />
						{:else}
							<img src={logo} alt="Default logo" class="h-10 w-10 object-contain opacity-40" />
						{/if}
					</div>
					<div class="flex gap-2">
						<label class="cursor-pointer">
							<input
								type="file"
								name="logo"
								accept="image/png,image/jpeg,image/svg+xml,image/webp"
								class="hidden"
								onchange={handleLogoChange}
							/>
							<Button variant="outline" size="sm" type="button" onclick={(e) => {
								const input = (e.currentTarget as HTMLElement).parentElement?.querySelector('input');
								input?.click();
							}}>
								{m.admin_branding_upload()}
							</Button>
						</label>
						{#if (data.config?.logoUrl && !removeLogo) || logoPreview}
							<Button variant="ghost" size="sm" type="button" onclick={clearLogo}>
								{m.admin_branding_remove()}
							</Button>
						{/if}
					</div>
				</div>
			</div>

			<!-- Favicon -->
			<div class="space-y-2">
				<Label>{m.admin_branding_favicon()}</Label>
				<p class="text-muted-foreground text-xs">{m.admin_branding_favicon_desc()}</p>
				<div class="flex items-center gap-4">
					<div class="bg-muted flex h-16 w-16 items-center justify-center rounded-lg border">
						{#if faviconPreview}
							<img src={faviconPreview} alt="Favicon preview" class="h-8 w-8 object-contain" />
						{:else if !removeFavicon && data.config?.faviconUrl}
							<img src={data.config.faviconUrl} alt="Current favicon" class="h-8 w-8 object-contain" />
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" class="text-muted-foreground/40 h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
								<rect x="3" y="3" width="18" height="18" rx="3" />
								<path d="M3 9h18" />
								<circle cx="7" cy="6" r="1" fill="currentColor" />
								<circle cx="10" cy="6" r="1" fill="currentColor" />
							</svg>
						{/if}
					</div>
					<div class="flex gap-2">
						<label class="cursor-pointer">
							<input
								type="file"
								name="favicon"
								accept="image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
								class="hidden"
								onchange={handleFaviconChange}
							/>
							<Button variant="outline" size="sm" type="button" onclick={(e) => {
								const input = (e.currentTarget as HTMLElement).parentElement?.querySelector('input');
								input?.click();
							}}>
								{m.admin_branding_upload()}
							</Button>
						</label>
						{#if (data.config?.faviconUrl && !removeFavicon) || faviconPreview}
							<Button variant="ghost" size="sm" type="button" onclick={clearFavicon}>
								{m.admin_branding_remove()}
							</Button>
						{/if}
					</div>
				</div>
			</div>

			<input type="hidden" name="removeLogo" value={removeLogo.toString()} />
			<input type="hidden" name="removeFavicon" value={removeFavicon.toString()} />

			<Button type="submit" disabled={saving}>
				{saving ? m.common_saving() : m.common_save_changes()}
			</Button>
		</form>
	</Card.Content>
</Card.Root>
