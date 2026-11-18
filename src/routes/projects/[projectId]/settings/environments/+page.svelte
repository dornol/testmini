<script lang="ts">
	import SettingsCatalog from '../SettingsCatalog.svelte';

	let { data } = $props();
</script>

<SettingsCatalog
	kind="environment"
	items={data.environments}
	canEdit={data.userRole !== 'VIEWER'}
/>
