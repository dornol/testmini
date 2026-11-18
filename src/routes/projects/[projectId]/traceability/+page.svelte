<script lang="ts">
	import TraceabilityView from './TraceabilityView.svelte';
	let { data } = $props();
</script>

{#key data.projectId}
	<TraceabilityView {data} />
{/key}
