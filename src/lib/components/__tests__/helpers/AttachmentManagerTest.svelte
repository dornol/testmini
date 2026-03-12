<script lang="ts">
	import AttachmentManager from '../../AttachmentManager.svelte';

	interface Props {
		referenceType: 'TESTCASE' | 'EXECUTION' | 'FAILURE';
		referenceId: number;
		editable?: boolean;
	}

	let { referenceType, referenceId, editable = true }: Props = $props();
</script>

<AttachmentManager {referenceType} {referenceId} {editable} />
