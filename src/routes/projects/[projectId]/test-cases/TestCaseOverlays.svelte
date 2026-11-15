<script lang="ts">
	import { tick } from 'svelte';
	import type TestCaseDetailSheet from './TestCaseDetailSheet.svelte';
	import type FailureDetailsSheet from './FailureDetailsSheet.svelte';
	import type FailWithDetailDialog from './FailWithDetailDialog.svelte';

	type ProjectPriority = { name: string; color: string };

	let {
		projectId,
		canEdit,
		canDelete,
		projectPriorities,
		customFieldDefs,
		currentUserId,
		userRole,
		hasIssueTracker,
		onchange
	} = $props<{
		projectId: number;
		canEdit: boolean;
		canDelete: boolean;
		projectPriorities: ProjectPriority[];
		customFieldDefs: unknown[];
		currentUserId: string;
		userRole: string;
		hasIssueTracker: boolean;
		onchange: () => void | Promise<void>;
	}>();

	let DetailComponent = $state<typeof import('./TestCaseDetailSheet.svelte').default | null>(null);
	let FailureComponent = $state<typeof import('./FailureDetailsSheet.svelte').default | null>(null);
	let FailDialogComponent = $state<typeof import('./FailWithDetailDialog.svelte').default | null>(
		null
	);
	let ImportComponent = $state<typeof import('$lib/components/ImportDialog.svelte').default | null>(
		null
	);

	let detailSheet = $state<TestCaseDetailSheet>();
	let failureSheet = $state<FailureDetailsSheet>();
	let failDialog = $state<FailWithDetailDialog>();
	let importOpen = $state(false);

	export async function openDetail(testCaseId: number) {
		DetailComponent ??= (await import('./TestCaseDetailSheet.svelte')).default;
		await tick();
		detailSheet?.open(testCaseId);
	}

	export async function openFailure(runId: number, executionId: number, tcKey: string) {
		FailureComponent ??= (await import('./FailureDetailsSheet.svelte')).default;
		await tick();
		failureSheet?.open(runId, executionId, tcKey);
	}

	export async function openFail(runId: number, executionId: number, tcKey: string) {
		FailDialogComponent ??= (await import('./FailWithDetailDialog.svelte')).default;
		await tick();
		failDialog?.open(runId, executionId, tcKey);
	}

	export async function openImport() {
		ImportComponent ??= (await import('$lib/components/ImportDialog.svelte')).default;
		importOpen = true;
	}
</script>

{#if DetailComponent}
	<DetailComponent
		bind:this={detailSheet}
		{projectId}
		{canEdit}
		{canDelete}
		{projectPriorities}
		{customFieldDefs}
		{currentUserId}
		{userRole}
		{hasIssueTracker}
		{onchange}
	/>
{/if}

{#if FailureComponent}
	<FailureComponent
		bind:this={failureSheet}
		{projectId}
		onaddfailure={(runId, executionId, tcKey) => openFail(runId, executionId, tcKey)}
	/>
{/if}

{#if FailDialogComponent}
	<FailDialogComponent
		bind:this={failDialog}
		{projectId}
		onsubmitted={(runId, executionId) => {
			onchange();
			failureSheet?.refreshIfMatch(runId, executionId);
		}}
	/>
{/if}

{#if ImportComponent}
	<ImportComponent bind:open={importOpen} {projectId} onimported={onchange} />
{/if}
