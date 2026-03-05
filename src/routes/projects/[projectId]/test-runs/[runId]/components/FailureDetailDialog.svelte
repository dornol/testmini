<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as m from '$lib/paraglide/messages.js';

	interface FailureRecord {
		id: number;
		testExecutionId: number;
		failureEnvironment: string | null;
		testMethod: string | null;
		errorMessage: string | null;
		stackTrace: string | null;
		comment: string | null;
		createdBy: string | null;
		createdAt: Date;
	}

	interface Props {
		// Add failure dialog
		failDialogOpen: boolean;
		failExecutionId: number | null;
		failExecutionKey: string;
		// Edit failure dialog
		editFailureDialogOpen: boolean;
		editFailureRecord: FailureRecord | null;
		// Delete failure dialog
		deleteDialogOpen: boolean;
		deleteFailureId: number | null;
		// Callbacks
		onfailDialogOpenChange: (open: boolean) => void;
		oneditFailureDialogOpenChange: (open: boolean) => void;
		ondeleteDialogOpenChange: (open: boolean) => void;
		onsuccess: () => void;
	}

	let {
		failDialogOpen,
		failExecutionId,
		failExecutionKey,
		editFailureDialogOpen,
		editFailureRecord,
		deleteDialogOpen,
		deleteFailureId,
		onfailDialogOpenChange,
		oneditFailureDialogOpenChange,
		ondeleteDialogOpenChange,
		onsuccess
	}: Props = $props();

	// Add failure form fields — fresh each time the dialog key changes via failExecutionId
	let addErrorMessage = $state('');
	let addFailureEnvironment = $state('');
	let addTestMethod = $state('');
	let addStackTrace = $state('');
	let addComment = $state('');

	// Edit form fields tracked from the record prop
	let editErrorMessage = $derived(editFailureRecord?.errorMessage ?? '');
	let editFailureEnvironment = $derived(editFailureRecord?.failureEnvironment ?? '');
	let editTestMethod = $derived(editFailureRecord?.testMethod ?? '');
	let editStackTrace = $derived(editFailureRecord?.stackTrace ?? '');
	let editComment = $derived(editFailureRecord?.comment ?? '');

	function handleFailResult() {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'success') {
				onfailDialogOpenChange(false);
				addErrorMessage = '';
				addFailureEnvironment = '';
				addTestMethod = '';
				addStackTrace = '';
				addComment = '';
				toast.success(m.fail_marked());
				onsuccess();
			} else if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? 'Failed to save');
				await update();
			}
		};
	}

	function handleEditFailResult() {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'success') {
				oneditFailureDialogOpenChange(false);
				toast.success(m.fail_updated());
				onsuccess();
			} else if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? 'Failed to update');
				await update();
			}
		};
	}

	function handleDeleteFailResult() {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: () => Promise<void>;
		}) => {
			if (result.type === 'success') {
				ondeleteDialogOpenChange(false);
				toast.success(m.fail_deleted());
				onsuccess();
			} else if (result.type === 'failure') {
				toast.error((result.data?.error as string) ?? 'Failed to delete');
				await update();
			}
		};
	}
</script>

<!-- FAIL with Detail Dialog -->
<Dialog.Root open={failDialogOpen} onOpenChange={onfailDialogOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-lg">
			<Dialog.Header>
				<Dialog.Title>{m.fail_mark_title({ key: failExecutionKey })}</Dialog.Title>
				<Dialog.Description>{m.fail_mark_desc()}</Dialog.Description>
			</Dialog.Header>
			<form method="POST" action="?/failWithDetail" use:enhance={handleFailResult}>
				<input type="hidden" name="executionId" value={failExecutionId} />
				<div class="space-y-4 py-4">
					<div class="space-y-2">
						<Label for="addErrorMessage">{m.fail_error_message()}</Label>
						<Textarea
							id="addErrorMessage"
							name="errorMessage"
							bind:value={addErrorMessage}
							placeholder={m.fail_error_placeholder()}
							rows={2}
						/>
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="addFailureEnvironment">{m.common_environment()}</Label>
							<Input
								id="addFailureEnvironment"
								name="failureEnvironment"
								bind:value={addFailureEnvironment}
								placeholder={m.fail_env_placeholder()}
							/>
						</div>
						<div class="space-y-2">
							<Label for="addTestMethod">{m.fail_method_label()}</Label>
							<Input
								id="addTestMethod"
								name="testMethod"
								bind:value={addTestMethod}
								placeholder={m.fail_method_placeholder()}
							/>
						</div>
					</div>
					<div class="space-y-2">
						<Label for="addStackTrace">{m.fail_stack_trace()}</Label>
						<Textarea
							id="addStackTrace"
							name="stackTrace"
							bind:value={addStackTrace}
							placeholder={m.fail_stack_placeholder()}
							rows={4}
							class="font-mono text-xs"
						/>
					</div>
					<div class="space-y-2">
						<Label for="addComment">{m.common_comment()}</Label>
						<Textarea
							id="addComment"
							name="comment"
							bind:value={addComment}
							placeholder={m.fail_comment_placeholder()}
							rows={2}
						/>
					</div>
				</div>
				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={() => onfailDialogOpenChange(false)}>
						{m.common_cancel()}
					</Button>
					<Button type="submit" variant="destructive">{m.fail_mark_submit()}</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Edit Failure Dialog -->
<Dialog.Root open={editFailureDialogOpen} onOpenChange={oneditFailureDialogOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-lg">
			<Dialog.Header>
				<Dialog.Title>{m.fail_edit_title()}</Dialog.Title>
			</Dialog.Header>
			<form method="POST" action="?/updateFailure" use:enhance={handleEditFailResult}>
				<input type="hidden" name="failureId" value={editFailureRecord?.id} />
				<div class="space-y-4 py-4">
					<div class="space-y-2">
						<Label for="editErrorMessage">{m.fail_error_message()}</Label>
						<Textarea
							id="editErrorMessage"
							name="errorMessage"
							value={editErrorMessage}
							rows={2}
						/>
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="editFailureEnvironment">{m.common_environment()}</Label>
							<Input
								id="editFailureEnvironment"
								name="failureEnvironment"
								value={editFailureEnvironment}
							/>
						</div>
						<div class="space-y-2">
							<Label for="editTestMethod">{m.fail_method_label()}</Label>
							<Input id="editTestMethod" name="testMethod" value={editTestMethod} />
						</div>
					</div>
					<div class="space-y-2">
						<Label for="editStackTrace">{m.fail_stack_trace()}</Label>
						<Textarea
							id="editStackTrace"
							name="stackTrace"
							value={editStackTrace}
							rows={4}
							class="font-mono text-xs"
						/>
					</div>
					<div class="space-y-2">
						<Label for="editComment">{m.common_comment()}</Label>
						<Textarea id="editComment" name="comment" value={editComment} rows={2} />
					</div>
				</div>
				<Dialog.Footer>
					<Button
						type="button"
						variant="outline"
						onclick={() => oneditFailureDialogOpenChange(false)}
					>
						{m.common_cancel()}
					</Button>
					<Button type="submit">{m.common_save_changes()}</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Delete Failure Dialog -->
<AlertDialog.Root open={deleteDialogOpen} onOpenChange={ondeleteDialogOpenChange}>
	<AlertDialog.Portal>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.fail_delete_title()}</AlertDialog.Title>
				<AlertDialog.Description>
					{m.fail_delete_confirm()}
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
				<form method="POST" action="?/deleteFailure" use:enhance={handleDeleteFailResult}>
					<input type="hidden" name="failureId" value={deleteFailureId} />
					<Button type="submit" variant="destructive">{m.common_delete()}</Button>
				</form>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
