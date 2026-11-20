<script lang="ts">
	import MemberSettings from '$lib/components/MemberSettings.svelte';

	let { data } = $props();
</script>

<MemberSettings
	members={data.members}
	canManage={data.userTeamRole === 'OWNER' || data.userTeamRole === 'ADMIN'}
	searchContext={{ teamId: data.team.id }}
/>
