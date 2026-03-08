<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as m from '$lib/paraglide/messages.js';
	import { toast } from 'svelte-sonner';
	import { apiPatch, apiDelete, apiFetch } from '$lib/api-client';

	let { data } = $props();

	const projectId = $derived(data.project.id);
	const sessionId = $derived(data.session.id);
	const apiBase = $derived(`/api/projects/${projectId}/exploratory-sessions/${sessionId}`);

	// Session state
	let session = $state(data.session);
	let notes = $state(data.notes);

	// Timer state
	let timerDisplay = $state('00:00');
	let timerInterval: ReturnType<typeof setInterval> | null = $state(null);
	let pausedAt: number | null = $state(null);
	let accumulatedPause = $state(session.pausedDuration);

	// Note form state
	let noteContent = $state('');
	let noteType = $state('NOTE');
	let screenshotFile: File | null = $state(null);
	let submittingNote = $state(false);

	// Complete dialog
	let showCompleteDialog = $state(false);
	let completeSummary = $state('');
	let completing = $state(false);

	// Delete dialog
	let showDeleteDialog = $state(false);
	let deleting = $state(false);

	function getElapsedSeconds(): number {
		const start = new Date(session.startedAt).getTime();
		const now = Date.now();
		let totalPause = accumulatedPause;
		if (pausedAt !== null) {
			totalPause += Math.floor((now - pausedAt) / 1000);
		}
		return Math.max(0, Math.floor((now - start) / 1000) - totalPause);
	}

	function formatTime(secs: number): string {
		const h = Math.floor(secs / 3600);
		const min = Math.floor((secs % 3600) / 60);
		const s = secs % 60;
		const pad = (n: number) => n.toString().padStart(2, '0');
		if (h > 0) return `${pad(h)}:${pad(min)}:${pad(s)}`;
		return `${pad(min)}:${pad(s)}`;
	}

	function updateTimer() {
		timerDisplay = formatTime(getElapsedSeconds());
	}

	function startTimer() {
		if (timerInterval) clearInterval(timerInterval);
		updateTimer();
		timerInterval = setInterval(updateTimer, 1000);
	}

	function stopTimer() {
		if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = null;
		}
	}

	// Initialize timer based on session status
	$effect(() => {
		if (session.status === 'ACTIVE') {
			pausedAt = null;
			startTimer();
		} else if (session.status === 'PAUSED') {
			// Estimate when it was paused (now, since we just loaded)
			pausedAt = Date.now();
			startTimer();
		} else {
			// COMPLETED -- show final time
			stopTimer();
			if (session.completedAt) {
				const start = new Date(session.startedAt).getTime();
				const end = new Date(session.completedAt).getTime();
				const elapsed = Math.max(0, Math.floor((end - start) / 1000) - session.pausedDuration);
				timerDisplay = formatTime(elapsed);
			}
		}

		return () => stopTimer();
	});

	function statusVariant(status: string): 'default' | 'secondary' | 'outline' {
		if (status === 'ACTIVE') return 'default';
		if (status === 'PAUSED') return 'secondary';
		return 'outline';
	}

	function statusLabel(status: string): string {
		if (status === 'ACTIVE') return m.exploratory_status_active();
		if (status === 'PAUSED') return m.exploratory_status_paused();
		return m.exploratory_status_completed();
	}

	function noteTypeLabel(type: string): string {
		if (type === 'BUG') return m.exploratory_note_bug();
		if (type === 'QUESTION') return m.exploratory_note_question();
		if (type === 'IDEA') return m.exploratory_note_idea();
		return m.exploratory_note_note();
	}

	function noteTypeVariant(type: string): 'default' | 'secondary' | 'outline' | 'destructive' {
		if (type === 'BUG') return 'destructive';
		if (type === 'QUESTION') return 'secondary';
		if (type === 'IDEA') return 'outline';
		return 'default';
	}

	async function pauseSession() {
		const currentElapsed = getElapsedSeconds();
		pausedAt = Date.now();
		try {
			const updated = await apiPatch(apiBase, {
				action: 'pause',
				pausedDuration: Math.floor(new Date(session.startedAt).getTime() / 1000 + accumulatedPause + currentElapsed - Date.now() / 1000 + currentElapsed)
			});
			// Simpler: just send current accumulatedPause
			session = { ...session, status: 'PAUSED' };
			toast.success(m.exploratory_paused());
		} catch {
			pausedAt = null;
		}
	}

	async function resumeSession() {
		if (pausedAt !== null) {
			accumulatedPause += Math.floor((Date.now() - pausedAt) / 1000);
			pausedAt = null;
		}
		try {
			const updated = await apiPatch(apiBase, {
				action: 'resume',
				pausedDuration: accumulatedPause
			});
			session = { ...session, status: 'ACTIVE', pausedDuration: accumulatedPause };
			toast.success(m.exploratory_resumed());
		} catch {
			// revert
		}
	}

	async function completeSession() {
		completing = true;
		try {
			const totalPause = pausedAt !== null
				? accumulatedPause + Math.floor((Date.now() - pausedAt) / 1000)
				: accumulatedPause;
			await apiPatch(apiBase, {
				action: 'complete',
				summary: completeSummary.trim() || undefined,
				pausedDuration: totalPause
			});
			session = { ...session, status: 'COMPLETED', completedAt: new Date(), summary: completeSummary.trim() || null, pausedDuration: totalPause };
			showCompleteDialog = false;
			stopTimer();
			toast.success(m.exploratory_completed());
			await invalidateAll();
		} catch {
			// error handled
		} finally {
			completing = false;
		}
	}

	async function addNote() {
		if (!noteContent.trim()) return;
		submittingNote = true;
		try {
			const formData = new FormData();
			formData.set('content', noteContent.trim());
			formData.set('noteType', noteType);
			formData.set('timestamp', String(getElapsedSeconds()));
			if (screenshotFile) {
				formData.set('screenshot', screenshotFile);
			}

			const created = await apiFetch<{ id: number; sessionId: number; content: string; noteType: string; timestamp: number; screenshotPath: string | null; createdAt: string }>(
				`${apiBase}/notes`,
				{ method: 'POST', body: formData }
			);

			notes = [...notes, { ...created, createdAt: new Date(created.createdAt) }] as typeof notes;
			noteContent = '';
			screenshotFile = null;
			// Reset file input
			const fileInput = document.getElementById('screenshot-input') as HTMLInputElement;
			if (fileInput) fileInput.value = '';
			toast.success(m.exploratory_note_added());
		} catch {
			// error handled
		} finally {
			submittingNote = false;
		}
	}

	async function deleteNote(noteId: number) {
		try {
			await apiDelete(`${apiBase}/notes/${noteId}`);
			notes = notes.filter((n: { id: number }) => n.id !== noteId);
			toast.success(m.common_delete());
		} catch {
			// error handled
		}
	}

	async function deleteSession() {
		deleting = true;
		try {
			await apiDelete(apiBase);
			toast.success(m.exploratory_deleted());
			goto(`/projects/${projectId}/exploratory`);
		} catch {
			// error handled
		} finally {
			deleting = false;
		}
	}

	function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		screenshotFile = input.files?.[0] ?? null;
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-start justify-between">
		<div>
			<a
				href="/projects/{projectId}/exploratory"
				class="text-muted-foreground hover:text-foreground text-sm"
			>&larr; {m.common_back_to({ target: m.exploratory_title() })}</a>
			<h2 class="mt-1 text-lg font-semibold">{session.title}</h2>
			<div class="mt-1 flex items-center gap-2">
				<Badge variant={statusVariant(session.status)}>{statusLabel(session.status)}</Badge>
				{#if session.environment}
					<Badge variant="outline">{session.environment}</Badge>
				{/if}
				{#if session.tags && session.tags.length > 0}
					{#each session.tags as tag}
						<Badge variant="secondary">{tag}</Badge>
					{/each}
				{/if}
			</div>
			{#if session.charter}
				<p class="text-muted-foreground mt-2 text-sm">{session.charter}</p>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="sm" onclick={() => (showDeleteDialog = true)}>
				{m.common_delete()}
			</Button>
		</div>
	</div>

	<!-- Timer -->
	<div class="flex items-center gap-4 border rounded-lg p-4">
		<div class="text-3xl font-mono font-bold tracking-wider">{timerDisplay}</div>
		{#if session.status === 'ACTIVE'}
			<Button variant="secondary" size="sm" onclick={pauseSession}>{m.exploratory_pause()}</Button>
			<Button variant="default" size="sm" onclick={() => (showCompleteDialog = true)}>{m.exploratory_complete()}</Button>
		{:else if session.status === 'PAUSED'}
			<Button variant="default" size="sm" onclick={resumeSession}>{m.exploratory_resume()}</Button>
			<Button variant="outline" size="sm" onclick={() => (showCompleteDialog = true)}>{m.exploratory_complete()}</Button>
		{/if}
	</div>

	<!-- Summary (completed sessions) -->
	{#if session.status === 'COMPLETED' && session.summary}
		<div class="border rounded-lg p-4">
			<h3 class="font-medium mb-1">{m.exploratory_summary()}</h3>
			<p class="text-sm whitespace-pre-wrap">{session.summary}</p>
		</div>
	{/if}

	<!-- Add Note (active/paused sessions) -->
	{#if session.status !== 'COMPLETED'}
		<div class="border rounded-lg p-4 space-y-3">
			<h3 class="font-medium">{m.exploratory_add_note()}</h3>
			<Textarea
				bind:value={noteContent}
				placeholder={m.exploratory_note_placeholder()}
				rows={2}
			/>
			<div class="flex items-center gap-3 flex-wrap">
				<div class="flex gap-1">
					{#each ['NOTE', 'BUG', 'QUESTION', 'IDEA'] as type}
						<Button
							variant={noteType === type ? 'default' : 'outline'}
							size="sm"
							onclick={() => (noteType = type)}
						>{noteTypeLabel(type)}</Button>
					{/each}
				</div>
				<input
					id="screenshot-input"
					type="file"
					accept="image/*"
					onchange={handleFileChange}
					class="text-sm"
				/>
				<Button
					size="sm"
					onclick={addNote}
					disabled={submittingNote || !noteContent.trim()}
				>{submittingNote ? m.common_saving() : m.exploratory_add_note_btn()}</Button>
			</div>
		</div>
	{/if}

	<!-- Notes Timeline -->
	<div class="space-y-2">
		<h3 class="font-medium">{m.exploratory_notes()} ({notes.length})</h3>
		{#if notes.length === 0}
			<p class="text-muted-foreground text-sm py-4 text-center">{m.exploratory_no_notes()}</p>
		{:else}
			<div class="space-y-2">
				{#each notes as note (note.id)}
					<div class="border rounded-md p-3 flex gap-3">
						<div class="flex-shrink-0 flex flex-col items-center gap-1">
							<Badge variant="outline" class="font-mono text-xs">{formatTime(note.timestamp)}</Badge>
							<Badge variant={noteTypeVariant(note.noteType)} class="text-xs">{noteTypeLabel(note.noteType)}</Badge>
						</div>
						<div class="flex-1 min-w-0">
							<p class="text-sm whitespace-pre-wrap">{note.content}</p>
							{#if note.screenshotPath}
								<img
									src="/api/uploads/{note.screenshotPath}"
									alt="Screenshot"
									class="mt-2 max-w-xs rounded border cursor-pointer"
									onclick={() => window.open(`/api/uploads/${note.screenshotPath}`, '_blank')}
								/>
							{/if}
						</div>
						{#if session.status !== 'COMPLETED'}
							<Button
								variant="ghost"
								size="sm"
								class="flex-shrink-0 text-muted-foreground hover:text-destructive"
								onclick={() => deleteNote(note.id)}
							>&times;</Button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Complete Session Dialog -->
<Dialog.Root bind:open={showCompleteDialog}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{m.exploratory_complete()}</Dialog.Title>
			<Dialog.Description>{m.exploratory_complete_desc()}</Dialog.Description>
		</Dialog.Header>
		<div>
			<Label>{m.exploratory_summary()}</Label>
			<Textarea bind:value={completeSummary} placeholder={m.exploratory_summary_placeholder()} rows={4} />
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (showCompleteDialog = false)}>{m.common_cancel()}</Button>
			<Button onclick={completeSession} disabled={completing}>
				{completing ? m.common_saving() : m.exploratory_complete()}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Session Dialog -->
<AlertDialog.Root bind:open={showDeleteDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.exploratory_delete_title()}</AlertDialog.Title>
			<AlertDialog.Description>{m.exploratory_delete_confirm()}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action onclick={deleteSession} disabled={deleting}>
				{m.common_delete()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
