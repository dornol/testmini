<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';

	interface Attachment {
		id: number;
		fileName: string;
		contentType: string | null;
		fileSize: number | null;
		uploadedAt: string;
	}

	interface Props {
		referenceType: 'TESTCASE' | 'EXECUTION' | 'FAILURE';
		referenceId: number;
		editable?: boolean;
	}

	let { referenceType, referenceId, editable = true }: Props = $props();

	let attachments = $state<Attachment[]>([]);
	let uploading = $state(false);
	let deleteTarget = $state<Attachment | null>(null);
	let deleteOpen = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	async function loadAttachments() {
		const res = await fetch(
			`/api/attachments?referenceType=${referenceType}&referenceId=${referenceId}`
		);
		if (res.ok) {
			attachments = await res.json();
		}
	}

	$effect(() => {
		if (referenceId > 0) {
			loadAttachments();
		}
	});

	async function handleUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		uploading = true;
		const formData = new FormData();
		formData.append('file', file);
		formData.append('referenceType', referenceType);
		formData.append('referenceId', String(referenceId));

		const res = await fetch('/api/attachments', {
			method: 'POST',
			body: formData
		});

		if (res.ok) {
			await loadAttachments();
		}

		uploading = false;
		input.value = '';
	}

	async function handleDelete() {
		if (!deleteTarget) return;

		const res = await fetch(`/api/attachments/${deleteTarget.id}`, {
			method: 'DELETE'
		});

		if (res.ok) {
			attachments = attachments.filter((a) => a.id !== deleteTarget!.id);
		}

		deleteTarget = null;
		deleteOpen = false;
	}

	function formatSize(bytes: number | null): string {
		if (!bytes) return '-';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<div class="space-y-2">
	<div class="flex items-center justify-between">
		<h4 class="text-sm font-medium">Attachments ({attachments.length})</h4>
		{#if editable}
			<input
				bind:this={fileInput}
				type="file"
				class="hidden"
				onchange={handleUpload}
			/>
			<Button
				variant="outline"
				size="sm"
				disabled={uploading}
				onclick={() => fileInput?.click()}
			>
				{uploading ? 'Uploading...' : 'Upload'}
			</Button>
		{/if}
	</div>

	{#if attachments.length === 0}
		<p class="text-muted-foreground text-xs">No attachments</p>
	{:else}
		<ul class="divide-y rounded-md border text-sm">
			{#each attachments as att (att.id)}
				<li class="flex items-center justify-between px-3 py-2">
					<a
						href="/api/attachments/{att.id}"
						class="text-primary hover:underline truncate max-w-[60%]"
						download
					>
						{att.fileName}
					</a>
					<div class="flex items-center gap-2">
						<span class="text-muted-foreground text-xs">{formatSize(att.fileSize)}</span>
						{#if editable}
							<Button
								variant="ghost"
								size="sm"
								class="text-destructive h-7 px-2 text-xs"
								onclick={() => {
									deleteTarget = att;
									deleteOpen = true;
								}}
							>
								Delete
							</Button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<AlertDialog.Root bind:open={deleteOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete Attachment</AlertDialog.Title>
			<AlertDialog.Description>
				Are you sure you want to delete "{deleteTarget?.fileName}"? This cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={handleDelete}>Delete</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
