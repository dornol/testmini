<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as m from '$lib/paraglide/messages.js';

	interface CustomFieldDef {
		id: number;
		name: string;
		fieldType: string;
		options: string[] | null;
	}

	let {
		customFieldDefs,
		customFieldValues
	}: {
		customFieldDefs: CustomFieldDef[];
		customFieldValues: Record<string, unknown>;
	} = $props();

	const hasAnyValue = $derived(
		customFieldDefs.some((cf) => {
			const v = customFieldValues[String(cf.id)];
			return v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
		})
	);
</script>

{#if customFieldDefs.length > 0}
	{#if hasAnyValue}
		<div class="space-y-3">
			<h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{m.custom_field_title()}</h4>
			{#each customFieldDefs as cf (cf.id)}
				{@const val = customFieldValues[String(cf.id)]}
				{#if val != null && val !== '' && !(Array.isArray(val) && val.length === 0)}
					<div>
						<span class="text-muted-foreground text-xs">{cf.name}</span>
						{#if cf.fieldType === 'URL' && typeof val === 'string'}
							<p class="text-sm mt-0.5">
								<a href={val} target="_blank" rel="noopener noreferrer" class="text-primary underline">{val}</a>
							</p>
						{:else if cf.fieldType === 'CHECKBOX'}
							<p class="text-sm mt-0.5">{val ? 'Yes' : 'No'}</p>
						{:else if cf.fieldType === 'MULTISELECT' && Array.isArray(val)}
							<div class="flex flex-wrap gap-1 mt-0.5">
								{#each val as v (v)}
									<Badge variant="secondary" class="text-xs">{v}</Badge>
								{/each}
							</div>
						{:else}
							<p class="text-muted-foreground mt-0.5 text-sm">{String(val)}</p>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	{:else}
		<div class="text-center py-8">
			<p class="text-muted-foreground text-sm">{m.common_no_results()}</p>
		</div>
	{/if}
{:else}
	<div class="text-center py-8">
		<p class="text-muted-foreground text-sm">{m.common_no_results()}</p>
	</div>
{/if}
