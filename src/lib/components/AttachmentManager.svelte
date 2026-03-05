<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { toast } from 'svelte-sonner';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import UploadCloudIcon from '@lucide/svelte/icons/upload-cloud';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';

	interface Attachment {
		id: number;
		fileName: string;
		contentType: string | null;
		fileSize: number | null;
		uploadedAt: string;
	}

	interface UploadingFile {
		id: string;
		name: string;
		done: boolean;
		error: boolean;
	}

	interface Props {
		referenceType: 'TESTCASE' | 'EXECUTION' | 'FAILURE';
		referenceId: number;
		editable?: boolean;
	}

	const ALLOWED_MIME_TYPES = [
		'image/jpeg',
		'image/png',
		'image/gif',
		'image/webp',
		'image/svg+xml',
		'application/pdf',
		'text/plain',
		'text/csv',
		'text/html',
		'application/json',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		'application/zip',
		'video/mp4',
		'video/webm'
	];

	let { referenceType, referenceId, editable = true }: Props = $props();

	let attachments = $state<Attachment[]>([]);
	let uploadingFiles = $state<UploadingFile[]>([]);
	let deleteTarget = $state<Attachment | null>(null);
	let deleteOpen = $state(false);
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let isDragging = $state(false);
	let dragCounter = $state(0);

	let isUploading = $derived(uploadingFiles.some((f) => !f.done && !f.error));

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

	async function uploadFile(file: File) {
		const uploadId = crypto.randomUUID();
		uploadingFiles = [
			...uploadingFiles,
			{ id: uploadId, name: file.name, done: false, error: false }
		];

		const formData = new FormData();
		formData.append('file', file);
		formData.append('referenceType', referenceType);
		formData.append('referenceId', String(referenceId));

		const res = await fetch('/api/attachments', {
			method: 'POST',
			body: formData
		});

		if (res.ok) {
			uploadingFiles = uploadingFiles.map((f) => (f.id === uploadId ? { ...f, done: true } : f));
		} else {
			uploadingFiles = uploadingFiles.map((f) => (f.id === uploadId ? { ...f, error: true } : f));
			toast.error(`Failed to upload "${file.name}"`);
		}

		setTimeout(() => {
			uploadingFiles = uploadingFiles.filter((f) => f.id !== uploadId);
		}, 1500);
	}

	async function handleFiles(files: FileList | File[]) {
		const fileArray = Array.from(files);
		const valid: File[] = [];

		for (const file of fileArray) {
			if (!ALLOWED_MIME_TYPES.includes(file.type)) {
				toast.error(`"${file.name}" has an unsupported file type.`);
			} else {
				valid.push(file);
			}
		}

		if (valid.length === 0) return;

		await Promise.all(valid.map(uploadFile));
		await loadAttachments();
	}

	async function handleUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files?.length) return;
		await handleFiles(input.files);
		input.value = '';
	}

	function handleDragEnter(e: DragEvent) {
		e.preventDefault();
		dragCounter++;
		isDragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		dragCounter--;
		if (dragCounter === 0) {
			isDragging = false;
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragCounter = 0;
		isDragging = false;
		if (!editable) return;
		const files = e.dataTransfer?.files;
		if (!files?.length) return;
		await handleFiles(files);
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
		<h4 class="text-sm font-medium">{m.attachments_title()} ({attachments.length})</h4>
		{#if editable}
			<input
				bind:this={fileInputEl}
				type="file"
				multiple
				class="hidden"
				onchange={handleUpload}
			/>
			<Button
				variant="outline"
				size="sm"
				disabled={isUploading}
				onclick={() => fileInputEl?.click()}
			>
				{#if isUploading}
					<Loader2Icon class="mr-1 size-3 animate-spin" />
					{m.attachments_uploading()}
				{:else}
					<UploadIcon class="mr-1 size-3" />
					{m.attachments_upload()}
				{/if}
			</Button>
		{/if}
	</div>

	{#if editable}
		<!-- Drop zone wrapper -->
		<div
			role="region"
			aria-label="File drop zone"
			class="relative rounded-md border-2 border-dashed transition-colors duration-150 {isDragging
				? 'border-primary bg-primary/5'
				: 'border-border hover:border-muted-foreground/50'}"
			ondragenter={handleDragEnter}
			ondragleave={handleDragLeave}
			ondragover={handleDragOver}
			ondrop={handleDrop}
		>
			{#if isDragging}
				<!-- Drag-active overlay -->
				<div class="flex flex-col items-center justify-center gap-1 py-6">
					<UploadCloudIcon class="text-primary size-8" />
					<p class="text-primary text-sm font-medium">Drop files here</p>
				</div>
			{:else}
				<div class="space-y-1 p-2">
					{#if attachments.length === 0 && uploadingFiles.length === 0}
						<!-- Empty state: click-to-upload prompt -->
						<div
							role="button"
							tabindex="0"
							class="flex cursor-pointer flex-col items-center gap-1 py-4 text-center"
							onclick={() => fileInputEl?.click()}
							onkeydown={(e) => e.key === 'Enter' && fileInputEl?.click()}
						>
							<UploadCloudIcon class="text-muted-foreground size-6" />
							<p class="text-muted-foreground text-xs">{m.attachments_none()}</p>
							<p class="text-muted-foreground/70 text-xs">Click or drag files to upload</p>
						</div>
					{:else}
						<!-- Existing attachments list -->
						<ul class="bg-background divide-y rounded-md border text-sm">
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
										<Button
											variant="ghost"
											size="sm"
											class="text-destructive h-7 px-2 text-xs"
											onclick={() => {
												deleteTarget = att;
												deleteOpen = true;
											}}
										>
											{m.common_delete()}
										</Button>
									</div>
								</li>
							{/each}
						</ul>
					{/if}

					<!-- In-progress uploads -->
					{#if uploadingFiles.length > 0}
						<ul class="mt-1 divide-y rounded-md border text-sm">
							{#each uploadingFiles as f (f.id)}
								<li class="flex items-center gap-2 px-3 py-2">
									{#if f.error}
										<span class="text-destructive flex-1 truncate text-xs"
											>{f.name} — upload failed</span
										>
									{:else if f.done}
										<span class="text-muted-foreground flex-1 truncate text-xs">{f.name}</span>
									{:else}
										<Loader2Icon class="text-muted-foreground size-3 shrink-0 animate-spin" />
										<span class="text-muted-foreground flex-1 truncate text-xs">{f.name}</span>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</div>
	{:else}
		<!-- Read-only view -->
		{#if attachments.length === 0}
			<p class="text-muted-foreground text-xs">{m.attachments_none()}</p>
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
						<span class="text-muted-foreground text-xs">{formatSize(att.fileSize)}</span>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<AlertDialog.Root bind:open={deleteOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.attachments_delete_title()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.attachments_delete_confirm({ name: deleteTarget?.fileName ?? '' })}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action onclick={handleDelete}>{m.common_delete()}</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
