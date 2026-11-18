<script lang="ts">
	import SettingsCatalog from '../SettingsCatalog.svelte';

	let { data } = $props();
</script>

<SettingsCatalog kind="tag" items={data.tags} canEdit={data.userRole !== 'VIEWER'} />
