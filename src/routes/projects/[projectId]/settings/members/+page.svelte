<script lang="ts">
	import MemberSettings from '$lib/components/MemberSettings.svelte';

	let { data } = $props();
</script>

<MemberSettings
	members={data.members}
	canManage={data.userRole === 'ADMIN' || data.userRole === 'PROJECT_ADMIN'}
	searchContext={{ excludeProjectId: data.project.id }}
/>
