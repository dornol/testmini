<script lang="ts">
	import SettingsCatalog from '../SettingsCatalog.svelte';

	let { data } = $props();
</script>

<SettingsCatalog kind="priority" items={data.priorities} canEdit={data.userRole !== 'VIEWER'} />
