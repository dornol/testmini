<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as m from '$lib/paraglide/messages.js';
	import { toast } from 'svelte-sonner';

	let { projectId, onsubmitted }: {
		projectId: number;
		onsubmitted: (runId: number, executionId: number) => void;
	} = $props();

	let dialogOpen = $state(false);
	let runId = $state(0);
	let executionId = $state(0);
	let tcKey = $state('');
	let errorMessage = $state('');
	let environment = $state('');
	let testMethod = $state('');
	let stackTrace = $state('');
	let comment = $state('');
	let submitting = $state(false);

	export function open(rId: number, eId: number, key: string) {
		runId = rId;
		executionId = eId;
		tcKey = key;
		errorMessage = '';
		environment = '';
		testMethod = '';
		stackTrace = '';
		comment = '';
		dialogOpen = true;
	}

	async function submit() {
		submitting = true;
		try {
			const res = await fetch(
				`/api/projects/${projectId}/test-runs/${runId}/executions/${executionId}/failures`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						errorMessage,
						failureEnvironment: environment,
						testMethod,
						stackTrace,
						comment
					})
				}
			);
			if (res.ok) {
				dialogOpen = false;
				toast.success(m.fail_marked());
				onsubmitted(runId, executionId);
			} else {
				let msg = `Error ${res.status}`;
				try {
					const err = await res.json();
					msg = err.error || err.message || msg;
				} catch { /* non-JSON response */ }
				toast.error(msg);
			}
		} catch (e) {
			toast.error('Network error: ' + String(e));
		} finally {
			submitting = false;
		}
	}
</script>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="sm:max-w-lg">
			<Dialog.Header>
				<Dialog.Title>{m.fail_mark_title({ key: tcKey })}</Dialog.Title>
				<Dialog.Description>{m.fail_mark_desc()}</Dialog.Description>
			</Dialog.Header>
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="failErrorMessage">{m.fail_error_message()}</Label>
					<Textarea
						id="failErrorMessage"
						bind:value={errorMessage}
						placeholder={m.fail_error_placeholder()}
						rows={2}
					/>
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="failEnvironment">{m.common_environment()}</Label>
						<Input
							id="failEnvironment"
							bind:value={environment}
							placeholder={m.fail_env_placeholder()}
						/>
					</div>
					<div class="space-y-2">
						<Label for="failTestMethod">{m.fail_method_label()}</Label>
						<Input
							id="failTestMethod"
							bind:value={testMethod}
							placeholder={m.fail_method_placeholder()}
						/>
					</div>
				</div>
				<div class="space-y-2">
					<Label for="failStackTrace">{m.fail_stack_trace()}</Label>
					<Textarea
						id="failStackTrace"
						bind:value={stackTrace}
						placeholder={m.fail_stack_placeholder()}
						rows={4}
						class="font-mono text-xs"
					/>
				</div>
				<div class="space-y-2">
					<Label for="failCommentInput">{m.common_comment()}</Label>
					<Textarea
						id="failCommentInput"
						bind:value={comment}
						placeholder={m.fail_comment_placeholder()}
						rows={2}
					/>
				</div>
			</div>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (dialogOpen = false)}>
					{m.common_cancel()}
				</Button>
				<Button variant="destructive" disabled={submitting} onclick={submit}>
					{submitting ? m.common_saving() : m.fail_mark_submit()}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
