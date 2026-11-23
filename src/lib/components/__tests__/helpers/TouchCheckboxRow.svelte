<script lang="ts">
	import TouchCheckbox from '../../TouchCheckbox.svelte';

	let { onrow }: { onrow: () => void } = $props();
</script>

<!-- A clickable row like the test case list, with the checkbox inside it. -->
<div role="presentation" onclick={onrow}>
	<TouchCheckbox aria-label="Select" dense />
</div>
