<script lang="ts">
	import { tick } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import * as m from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import FormErrorSummary from '$lib/components/patterns/FormErrorSummary.svelte';
	import logo from '$lib/assets/logo.svg';

	let { data } = $props();

	type Kind = 'logo' | 'favicon';
	const kinds: Kind[] = ['logo', 'favicon'];

	// Mirrors the server's rules (SVG is not accepted there), so a bad file is caught before uploading.
	const MAX_BYTES = 2 * 1024 * 1024;
	const config = {
		logo: {
			label: () => m.admin_branding_logo(),
			desc: () => m.admin_branding_logo_desc(),
			formats: () => m.admin_branding_logo_formats(),
			formatList: 'PNG, JPEG, WebP',
			types: ['image/png', 'image/jpeg', 'image/webp'],
			tile: 'h-10 w-10'
		},
		favicon: {
			label: () => m.admin_branding_favicon(),
			desc: () => m.admin_branding_favicon_desc(),
			formats: () => m.admin_branding_favicon_formats(),
			formatList: 'PNG, ICO',
			types: ['image/png', 'image/x-icon', 'image/vnd.microsoft.icon'],
			tile: 'h-8 w-8'
		}
	} as const;

	// Follows the saved name, but stays editable while typing.
	let appName = $derived(data.config?.appName || 'testmini');
	let preview = $state<Record<Kind, string | null>>({ logo: null, favicon: null });
	let removed = $state<Record<Kind, boolean>>({ logo: false, favicon: false });
	let picked = $state<Record<Kind, string>>({ logo: '', favicon: '' });
	let fileError = $state<Record<Kind, string>>({ logo: '', favicon: '' });
	let inputs = $state<Record<Kind, HTMLInputElement | null>>({ logo: null, favicon: null });

	let saving = $state(false);
	let error = $state<{ path: string; message: string } | null>(null);
	let summaryEl = $state<HTMLDivElement | null>(null);

	const current = (kind: Kind) =>
		kind === 'logo' ? data.config?.logoUrl : data.config?.faviconUrl;
	const hasImage = (kind: Kind) => !!preview[kind] || (!!current(kind) && !removed[kind]);

	function formatBytes(bytes: number) {
		return bytes < 1024 * 1024
			? `${Math.max(1, Math.round(bytes / 1024))} KB`
			: `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function pick(kind: Kind, event: Event & { currentTarget: HTMLInputElement }) {
		const input = event.currentTarget;
		const file = input.files?.[0];
		fileError[kind] = '';
		picked[kind] = '';
		preview[kind] = null;
		if (!file) return;

		const c = config[kind];
		if (!(c.types as readonly string[]).includes(file.type)) {
			fileError[kind] = m.admin_branding_file_type({ formats: c.formatList });
		} else if (file.size > MAX_BYTES) {
			fileError[kind] =
				`${m.admin_branding_file_too_large()} (${file.name}, ${formatBytes(file.size)})`;
		}
		if (fileError[kind]) {
			input.value = '';
			return;
		}

		removed[kind] = false;
		picked[kind] = m.admin_branding_selected({ name: file.name, size: formatBytes(file.size) });
		const reader = new FileReader();
		reader.onload = () => (preview[kind] = reader.result as string);
		reader.readAsDataURL(file);
	}

	function remove(kind: Kind) {
		// Also drop a file that was picked but not saved, or it would be uploaded with the removal.
		const input = inputs[kind];
		if (input) input.value = '';
		removed[kind] = true;
		preview[kind] = null;
		picked[kind] = '';
		fileError[kind] = '';
	}

	function resetPicked() {
		for (const kind of kinds) {
			const input = inputs[kind];
			if (input) input.value = '';
			preview[kind] = null;
			picked[kind] = '';
			removed[kind] = false;
		}
	}

	// Server messages are English; tie them to the field they are about.
	function parseError(raw: unknown) {
		const text = typeof raw === 'string' ? raw : '';
		if (text.startsWith('App name is required'))
			return { path: 'appName', message: m.admin_branding_app_name_required() };
		for (const kind of kinds) {
			const name = kind === 'logo' ? 'Logo' : 'Favicon';
			if (text.startsWith(`${name} file too large`))
				return { path: kind, message: m.admin_branding_file_too_large() };
			if (text.startsWith(`Invalid ${kind} file type`))
				return {
					path: kind,
					message: m.admin_branding_file_type({ formats: config[kind].formatList })
				};
		}
		return { path: 'form', message: m.error_operation_failed() };
	}

	const submit: SubmitFunction = ({ cancel }) => {
		if (saving) {
			cancel();
			return;
		}
		saving = true;
		error = null;
		return async ({ result }) => {
			try {
				if (result.type === 'success') {
					resetPicked();
					toast.success(m.admin_branding_saved());
					await invalidateAll();
				} else {
					error = parseError(result.type === 'failure' ? result.data?.error : undefined);
					await tick();
					summaryEl?.focus();
				}
			} finally {
				saving = false;
			}
		};
	};

	const targetFor = (path: string) =>
		path === 'appName' ? 'appName' : path === 'form' ? undefined : `${path}-upload`;
</script>

{#snippet imageField(kind: Kind)}
	{@const c = config[kind]}
	{@const target = c.label()}
	<fieldset class="space-y-2">
		<legend class="text-sm font-medium">{target}</legend>
		<p id="{kind}-desc" class="text-xs text-muted-foreground">{c.desc()} {c.formats()}</p>
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
			<div class="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border bg-muted">
				{#if preview[kind]}
					<img
						src={preview[kind]}
						alt={m.admin_branding_alt_preview({ target })}
						class="{c.tile} object-contain"
					/>
				{:else if !removed[kind] && current(kind)}
					<img
						src={current(kind)}
						alt={m.admin_branding_alt_current({ target })}
						class="{c.tile} object-contain"
					/>
				{:else}
					<img
						src={logo}
						alt={m.admin_branding_alt_default({ target })}
						class="{c.tile} object-contain opacity-40"
					/>
				{/if}
			</div>
			<div class="grid w-full grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:w-auto">
				<input
					bind:this={inputs[kind]}
					type="file"
					name={kind}
					accept={c.types.join(',')}
					class="hidden"
					tabindex="-1"
					onchange={(e) => pick(kind, e)}
				/>
				<Button
					id="{kind}-upload"
					variant="outline"
					size="sm"
					type="button"
					class="min-h-10 w-full sm:w-auto"
					aria-label={m.admin_branding_action_label({
						target,
						action: m.admin_branding_upload()
					})}
					aria-describedby="{kind}-desc {kind}-status"
					onclick={() => inputs[kind]?.click()}
				>
					{m.admin_branding_upload()}
				</Button>
				{#if hasImage(kind)}
					<Button
						variant="ghost"
						size="sm"
						type="button"
						class="min-h-10 w-full sm:w-auto"
						aria-label={m.admin_branding_action_label({
							target,
							action: m.admin_branding_remove()
						})}
						onclick={() => remove(kind)}
					>
						{m.admin_branding_remove()}
					</Button>
				{:else if removed[kind]}
					<Button
						variant="ghost"
						size="sm"
						type="button"
						class="min-h-10 w-full sm:w-auto"
						onclick={() => (removed[kind] = false)}
					>
						{m.admin_branding_undo_remove()}
					</Button>
				{/if}
			</div>
		</div>
		<!-- Keep the status region mounted so a change is announced. -->
		<p id="{kind}-status" role="status" class="text-xs text-muted-foreground empty:hidden">
			{removed[kind]
				? m.admin_branding_pending_remove({ target: target.toLocaleLowerCase() })
				: picked[kind]}
		</p>
		{#if fileError[kind]}
			<p role="alert" class="text-sm text-destructive [overflow-wrap:anywhere]">
				{fileError[kind]}
			</p>
		{/if}
	</fieldset>
{/snippet}

<Card.Root>
	<Card.Header>
		<Card.Title role="heading" aria-level={2}>{m.admin_branding_title()}</Card.Title>
		<Card.Description>{m.admin_branding_desc()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			method="POST"
			action="?/save"
			enctype="multipart/form-data"
			use:enhance={submit}
			class="space-y-6"
		>
			<FormErrorSummary
				bind:ref={summaryEl}
				errors={error ? [{ path: error.path, messages: [error.message] }] : []}
				fieldTarget={targetFor}
			/>

			<div class="space-y-2">
				<Label for="appName">{m.admin_branding_app_name()}</Label>
				<Input
					id="appName"
					name="appName"
					bind:value={appName}
					required
					maxlength={100}
					placeholder={m.admin_branding_app_name_placeholder()}
					class="w-full sm:max-w-sm"
					aria-invalid={error?.path === 'appName' ? true : undefined}
					aria-describedby={error?.path === 'appName' ? 'appName-error' : undefined}
				/>
				{#if error?.path === 'appName'}
					<p id="appName-error" class="text-sm text-destructive">{error.message}</p>
				{/if}
			</div>

			{@render imageField('logo')}
			{@render imageField('favicon')}

			<input type="hidden" name="removeLogo" value={removed.logo.toString()} />
			<input type="hidden" name="removeFavicon" value={removed.favicon.toString()} />

			<Button type="submit" class="min-h-10 w-full sm:w-auto" disabled={saving}>
				{saving ? m.common_saving() : m.common_save_changes()}
			</Button>
		</form>
	</Card.Content>
</Card.Root>
