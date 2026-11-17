<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';

	let {
		errors,
		ref = $bindable(null),
		fieldTarget = (path: string) => path
	}: {
		errors: { path: string; messages: string[] }[];
		ref?: HTMLDivElement | null;
		fieldTarget?: (path: string) => string | undefined;
	} = $props();
	const headingId = $props.id();

	function focusField(event: MouseEvent, id: string) {
		const field = document.getElementById(id);
		if (field) {
			event.preventDefault();
			field.focus();
			field.scrollIntoView({ block: 'center', behavior: 'instant' });
		}
	}
</script>

{#if errors.length > 0}
	<div
		bind:this={ref}
		role="alert"
		tabindex="-1"
		aria-labelledby={headingId}
		data-slot="form-error-summary"
		class="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"
	>
		<h2 id={headingId} class="font-semibold text-destructive">{m.ui_form_errors_title()}</h2>
		<ul class="mt-2 list-disc space-y-1 pl-5">
			{#each errors as error (error.path)}
				{@const target = fieldTarget(error.path)}
				{#each error.messages as message}
					<li>
						{#if target}
							<a
								href={`#${target}`}
								onclick={(event) => focusField(event, target)}
								class="underline underline-offset-4">{message}</a
							>
						{:else}
							{message}
						{/if}
					</li>
				{/each}
			{/each}
		</ul>
	</div>
{/if}
