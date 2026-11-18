<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import PageHeader from '$lib/components/patterns/PageHeader.svelte';
	import ProjectDetailsForm from '$lib/components/ProjectDetailsForm.svelte';
	let { data, form } = $props();
</script>

<div class="mx-auto max-w-lg space-y-4">
	<a
		href="/projects"
		class="inline-flex min-h-8 items-center rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
	>
		&larr; {m.common_back_to({ target: m.nav_projects() })}
	</a>
	<PageHeader title={m.project_new_title()} description={m.project_new_desc()} level={1} />

	<ProjectDetailsForm initial={form?.form ?? data.form} />
</div>
