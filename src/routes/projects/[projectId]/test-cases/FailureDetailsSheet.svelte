<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as m from '$lib/paraglide/messages.js';
	import { apiFetch } from '$lib/api-client';
	import { toast } from 'svelte-sonner';

	let { projectId, onaddfailure }: {
		projectId: number;
		onaddfailure: (runId: number, executionId: number, tcKey: string) => void;
	} = $props();

	let sheetOpen = $state(false);
	let sheetData: {
		executionId: number;
		runId: number;
		failures: Array<{
			id: number;
			errorMessage: string | null;
			testMethod: string | null;
			failureEnvironment: string | null;
			stackTrace: string | null;
			comment: string | null;
			createdBy: string;
			createdAt: string;
			createdByName: string | null;
		}>;
		loading: boolean;
	} | null = $state(null);

	export function open(runId: number, executionId: number) {
		sheetData = { executionId, runId, failures: [], loading: true };
		sheetOpen = true;
		fetchFailures(runId, executionId);
	}

	export function refreshIfMatch(runId: number, executionId: number) {
		if (sheetOpen && sheetData && sheetData.executionId === executionId) {
			fetchFailures(runId, executionId);
		}
	}

	async function fetchFailures(runId: number, executionId: number) {
		try {
			const data = await apiFetch<{ failures: Array<{
			id: number;
			errorMessage: string | null;
			testMethod: string | null;
			failureEnvironment: string | null;
			stackTrace: string | null;
			comment: string | null;
			createdBy: string;
			createdAt: string;
			createdByName: string | null;
		}> }>(
				`/api/projects/${projectId}/test-runs/${runId}/executions/${executionId}/failures`,
				{ silent: true }
			);
			if (sheetData && sheetData.executionId === executionId) {
				sheetData.failures = data.failures;
			}
		} catch {
			toast.error('Failed to fetch failure details');
		} finally {
			if (sheetData && sheetData.executionId === executionId) {
				sheetData.loading = false;
			}
		}
	}

	function handleClose(isOpen: boolean) {
		if (!isOpen) {
			sheetData = null;
		}
	}
</script>

<Sheet.Root bind:open={sheetOpen} onOpenChange={handleClose}>
	<Sheet.Content side="right" class="sm:max-w-xl w-full overflow-y-auto p-0">
		<Sheet.Header class="px-6 py-4 border-b flex flex-row items-center justify-between">
			<Sheet.Title>{m.fail_details()}</Sheet.Title>
			{#if sheetData && !sheetData.loading}
				<Button
					variant="outline"
					size="sm"
					onclick={() => {
						if (sheetData) {
							onaddfailure(sheetData.runId, sheetData.executionId, '');
						}
					}}
				>
					{m.fail_add_detail()}
				</Button>
			{/if}
		</Sheet.Header>
		<div class="px-6 py-4">
			{#if sheetData?.loading}
				<div class="text-center text-sm text-muted-foreground py-8">{m.tc_failure_loading()}</div>
			{:else if sheetData && sheetData.failures.length === 0}
				<div class="text-center text-sm text-muted-foreground py-8">{m.fail_no_details()}</div>
			{:else if sheetData}
				<div class="space-y-4">
					{#each sheetData.failures as f (f.id)}
						<div class="border rounded-lg p-4 space-y-2">
							{#if f.errorMessage}
								<div>
									<div class="text-xs font-medium text-muted-foreground mb-1">{m.fail_error()}</div>
									<div class="text-sm text-red-600 dark:text-red-400">{f.errorMessage}</div>
								</div>
							{/if}
							{#if f.testMethod}
								<div>
									<div class="text-xs font-medium text-muted-foreground mb-1">{m.fail_method()}</div>
									<div class="text-sm">{f.testMethod}</div>
								</div>
							{/if}
							{#if f.failureEnvironment}
								<div>
									<div class="text-xs font-medium text-muted-foreground mb-1">{m.common_environment()}</div>
									<div class="text-sm">{f.failureEnvironment}</div>
								</div>
							{/if}
							{#if f.stackTrace}
								<div>
									<div class="text-xs font-medium text-muted-foreground mb-1">{m.fail_stack_trace()}</div>
									<pre class="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-all max-h-60 overflow-y-auto">{f.stackTrace}</pre>
								</div>
							{/if}
							{#if f.comment}
								<div>
									<div class="text-xs font-medium text-muted-foreground mb-1">{m.common_comment()}</div>
									<div class="text-sm">{f.comment}</div>
								</div>
							{/if}
							{#if !f.errorMessage && !f.testMethod && !f.failureEnvironment && !f.stackTrace && !f.comment}
								<div class="text-sm text-muted-foreground italic">{m.fail_no_details()}</div>
							{/if}
							<div class="text-xs text-muted-foreground pt-1 border-t">
								{f.createdByName ?? f.createdBy} &middot; {new Date(f.createdAt).toLocaleString()}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>
