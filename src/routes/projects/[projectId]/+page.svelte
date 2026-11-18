<script lang="ts">
	import ProjectDashboard from './ProjectDashboard.svelte';
	let { data } = $props();
</script>

{#key data.project.id}
	<ProjectDashboard {data} />
{/key}
