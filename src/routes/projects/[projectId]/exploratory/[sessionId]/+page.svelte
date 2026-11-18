<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import FormErrorSummary from '$lib/components/patterns/FormErrorSummary.svelte';
	import WorkflowField from '$lib/components/patterns/WorkflowField.svelte';
	import { feedbackFor, type FormFeedback } from '$lib/form-feedback';
	import {
		MAX_NOTE_CONTENT_LENGTH,
		MAX_TEXT_LENGTH,
		MAX_SCREENSHOT_SIZE,
		SCREENSHOT_TYPES,
		isSupportedScreenshot
	} from '$lib/exploratory-session-limits';
	import { tick, untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as m from '$lib/paraglide/messages.js';
	import { toast } from 'svelte-sonner';
	import { apiPatch, apiDelete, apiFetch } from '$lib/api-client';

	let { data } = $props();

	const projectId = $derived(data.project.id);
	const canManage = $derived(['PROJECT_ADMIN', 'ADMIN', 'QA', 'DEV'].includes(data.userRole));
	const sessionId = $derived(data.session.id);
	const apiBase = $derived(`/api/projects/${projectId}/exploratory-sessions/${sessionId}`);

	// Session state -- use $state with $effect sync for optimistic updates
	// svelte-ignore state_referenced_locally
	let session: typeof data.session = $state(data.session);
	// svelte-ignore state_referenced_locally
	let notes: typeof data.notes = $state(data.notes);

	// Timer state
	let timerDisplay = $state('00:00');
	let pausedAt: number | null = $state(null);
	let accumulatedPause = $state(0);

	// Non-reactive timer handle (no need to track in $effect)
	let _timerInterval: ReturnType<typeof setInterval> | null = null;

	// Sync from server data when it changes (e.g., invalidateAll + initial load)
	$effect(() => {
		const s = data.session;
		const n = data.notes;
		untrack(() => {
			session = s;
			notes = n;
			accumulatedPause = s.pausedDuration;
		});
	});

	// Note form state
	let noteContent = $state('');
	let noteType = $state('NOTE');
	let screenshotFile: File | null = $state(null);
	let submittingNote = $state(false);
	let noteErrors = $state<FormFeedback[]>([]);
	let noteErrorSummary = $state<HTMLDivElement | null>(null);
	let screenshotInput = $state<HTMLInputElement>();
	const noteFields: Record<string, string> = {
		content: 'note-content',
		screenshot: 'screenshot-input'
	};

	// Complete dialog
	let showCompleteDialog = $state(false);
	let completeSummary = $state('');
	let completing = $state(false);
	let completeErrors = $state<FormFeedback[]>([]);
	let completeErrorSummary = $state<HTMLDivElement | null>(null);
	let completedHeading = $state<HTMLHeadingElement>();

	// Delete dialog
	let showDeleteDialog = $state(false);
	let deleting = $state(false);

	// Pause/resume
	let actionSaving = $state(false);

	function getElapsedSeconds(): number {
		const start = new Date(session.startedAt).getTime();
		const end = pausedAt ?? Date.now();
		return Math.max(0, Math.floor((end - start) / 1000) - accumulatedPause);
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
		if (_timerInterval) clearInterval(_timerInterval);
		updateTimer();
		_timerInterval = setInterval(updateTimer, 1000);
	}

	function stopTimer() {
		if (_timerInterval) {
			clearInterval(_timerInterval);
			_timerInterval = null;
		}
	}

	// Initialize timer based on session status -- only react to status changes
	$effect(() => {
		const status = session.status;

		untrack(() => {
			if (status === 'ACTIVE') {
				pausedAt = null;
				startTimer();
			} else if (status === 'PAUSED') {
				pausedAt ??= Date.now();
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
		});

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
		if (actionSaving) return;
		actionSaving = true;
		pausedAt = Date.now();
		try {
			await apiPatch(apiBase, {
				action: 'pause',
				pausedDuration: accumulatedPause
			});
			session = { ...session, status: 'PAUSED' };
			toast.success(m.exploratory_paused());
		} catch {
			pausedAt = null;
		} finally {
			actionSaving = false;
		}
	}

	async function resumeSession() {
		if (actionSaving) return;
		actionSaving = true;
		const totalPause = totalPausedSeconds();
		try {
			await apiPatch(apiBase, {
				action: 'resume',
				pausedDuration: totalPause
			});
			accumulatedPause = totalPause;
			pausedAt = null;
			session = { ...session, status: 'ACTIVE', pausedDuration: totalPause };
			toast.success(m.exploratory_resumed());
		} catch {
			// revert
		} finally {
			actionSaving = false;
		}
	}

	function totalPausedSeconds() {
		return accumulatedPause + (pausedAt === null ? 0 : Math.floor((Date.now() - pausedAt) / 1000));
	}

	function openComplete() {
		completeErrors = [];
		showCompleteDialog = true;
	}

	async function completeSession(event: SubmitEvent) {
		event.preventDefault();
		if (completing || submittingNote || actionSaving) return;
		const summary = completeSummary.trim();
		if (summary.length > MAX_TEXT_LENGTH) {
			completeErrors = [
				{ path: 'summary', messages: [m.ui_max_characters({ count: MAX_TEXT_LENGTH })] }
			];
			await tick();
			completeErrorSummary?.focus();
			return;
		}
		completeErrors = [];
		completing = true;
		const totalPause = totalPausedSeconds();
		try {
			await apiFetch(apiBase, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'complete',
					summary: summary || undefined,
					pausedDuration: totalPause
				}),
				silent: true
			});
		} catch {
			completeErrors = [{ path: '_form', messages: [m.ui_save_failed()] }];
			completing = false;
			await tick();
			completeErrorSummary?.focus();
			return;
		}
		completing = false;
		session = {
			...session,
			status: 'COMPLETED',
			completedAt: new Date(),
			summary: summary || null,
			pausedDuration: totalPause
		};
		showCompleteDialog = false;
		stopTimer();
		toast.success(m.exploratory_completed());
		await invalidateAll();
	}

	async function addNote(event: SubmitEvent) {
		event.preventDefault();
		if (submittingNote || completing) return;
		const content = noteContent.trim();
		noteErrors = [];
		if (!content)
			noteErrors.push({ path: 'content', messages: [m.ui_exploratory_note_required()] });
		else if (content.length > MAX_NOTE_CONTENT_LENGTH) {
			noteErrors.push({
				path: 'content',
				messages: [m.ui_max_characters({ count: MAX_NOTE_CONTENT_LENGTH })]
			});
		}
		if (screenshotFile && !isSupportedScreenshot(screenshotFile)) {
			noteErrors.push({ path: 'screenshot', messages: [m.ui_exploratory_screenshot_format()] });
		} else if (screenshotFile && screenshotFile.size > MAX_SCREENSHOT_SIZE) {
			noteErrors.push({ path: 'screenshot', messages: [m.ui_exploratory_screenshot_size()] });
		}
		if (noteErrors.length) {
			await tick();
			noteErrorSummary?.focus();
			return;
		}
		submittingNote = true;
		try {
			const formData = new FormData();
			formData.set('content', content);
			formData.set('noteType', noteType);
			formData.set('timestamp', String(getElapsedSeconds()));
			if (screenshotFile) {
				formData.set('screenshot', screenshotFile);
			}

			const created = await apiFetch<{
				id: number;
				sessionId: number;
				content: string;
				noteType: string;
				timestamp: number;
				screenshotPath: string | null;
				createdAt: string;
			}>(`${apiBase}/notes`, { method: 'POST', body: formData, silent: true });

			notes = [...notes, { ...created, createdAt: new Date(created.createdAt) }] as typeof notes;
			noteContent = '';
			clearScreenshot();
			toast.success(m.exploratory_note_added());
		} catch {
			noteErrors = [{ path: '_form', messages: [m.ui_save_failed()] }];
		} finally {
			submittingNote = false;
		}
		await tick();
		if (noteErrors.length) noteErrorSummary?.focus();
		else document.getElementById('note-content')?.focus();
	}

	function clearScreenshot() {
		screenshotFile = null;
		if (screenshotInput) screenshotInput.value = '';
		noteErrors = noteErrors.filter((item) => item.path !== 'screenshot');
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
		noteErrors = noteErrors.filter((item) => item.path !== 'screenshot');
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div class="min-w-0">
			<a
				href="/projects/{projectId}/exploratory"
				class="text-muted-foreground hover:text-foreground text-sm"
				>&larr; {m.common_back_to({ target: m.exploratory_title() })}</a
			>
			<h2
				bind:this={completedHeading}
				tabindex="-1"
				class="mt-1 text-2xl font-semibold [overflow-wrap:anywhere]"
			>
				{session.title}
			</h2>
			<div class="mt-1 flex flex-wrap items-center gap-2">
				<Badge variant={statusVariant(session.status)}>{statusLabel(session.status)}</Badge>
				{#if session.environment}
					<Badge variant="outline" class="max-w-full whitespace-normal [overflow-wrap:anywhere]"
						>{session.environment}</Badge
					>
				{/if}
				{#if session.tags && session.tags.length > 0}
					{#each session.tags as tag}
						<Badge variant="secondary" class="max-w-full whitespace-normal [overflow-wrap:anywhere]"
							>{tag}</Badge
						>
					{/each}
				{/if}
			</div>
			{#if session.charter}
				<p class="text-muted-foreground mt-2 break-words text-sm">{session.charter}</p>
			{/if}
		</div>
		{#if canManage}<div class="flex items-center gap-2 sm:justify-end">
				<Button
					variant="outline"
					size="sm"
					class="w-full sm:w-auto"
					onclick={() => (showDeleteDialog = true)}
				>
					{m.common_delete()}
				</Button>
			</div>{/if}
	</div>

	<!-- Timer -->
	<div
		class="grid gap-3 rounded-lg border p-4 min-[420px]:flex min-[420px]:flex-wrap min-[420px]:items-center"
	>
		<div
			role="timer"
			aria-label={m.exploratory_duration()}
			class="text-3xl font-mono font-bold tracking-wider"
		>
			{timerDisplay}
		</div>
		{#if canManage && session.status === 'ACTIVE'}
			<Button
				class="w-full min-[420px]:w-auto"
				variant="secondary"
				size="sm"
				onclick={pauseSession}
				disabled={actionSaving}>{m.exploratory_pause()}</Button
			>
			<Button
				class="w-full min-[420px]:w-auto"
				variant="default"
				size="sm"
				onclick={openComplete}
				disabled={actionSaving || submittingNote}>{m.exploratory_complete()}</Button
			>
		{:else if canManage && session.status === 'PAUSED'}
			<Button
				class="w-full min-[420px]:w-auto"
				variant="default"
				size="sm"
				onclick={resumeSession}
				disabled={actionSaving}>{m.exploratory_resume()}</Button
			>
			<Button
				class="w-full min-[420px]:w-auto"
				variant="outline"
				size="sm"
				onclick={openComplete}
				disabled={actionSaving || submittingNote}>{m.exploratory_complete()}</Button
			>
		{/if}
	</div>

	<!-- Summary (completed sessions) -->
	{#if session.status === 'COMPLETED' && session.summary}
		<div class="border rounded-lg p-4">
			<h3 class="font-medium mb-1">{m.exploratory_summary()}</h3>
			<p class="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{session.summary}</p>
		</div>
	{/if}

	<!-- Add Note (active/paused sessions) -->
	{#if canManage && session.status !== 'COMPLETED'}
		<form
			novalidate
			class="space-y-4 rounded-lg border bg-card p-4"
			aria-labelledby="add-note-heading"
			aria-busy={submittingNote}
			onsubmit={addNote}
		>
			<h3 id="add-note-heading" class="font-semibold">{m.exploratory_add_note()}</h3>
			<FormErrorSummary
				errors={noteErrors}
				bind:ref={noteErrorSummary}
				fieldTarget={(path) => noteFields[path]}
			/>
			<fieldset disabled={submittingNote} class="min-w-0 space-y-4">
				<WorkflowField
					id="note-content"
					label={m.ui_exploratory_note_content()}
					error={feedbackFor(noteErrors, 'content')}
					required
				>
					{#snippet children(props)}
						<Textarea
							{...props}
							bind:value={noteContent}
							placeholder={m.exploratory_note_placeholder()}
							rows={3}
						/>
					{/snippet}
				</WorkflowField>
				<div
					role="group"
					aria-label={m.ui_exploratory_note_type()}
					class="grid grid-cols-2 gap-2 min-[420px]:flex min-[420px]:flex-wrap"
				>
					{#each ['NOTE', 'BUG', 'QUESTION', 'IDEA'] as type (type)}
						<Button
							type="button"
							aria-pressed={noteType === type}
							variant={noteType === type ? 'default' : 'outline'}
							onclick={() => (noteType = type)}>{noteTypeLabel(type)}</Button
						>
					{/each}
				</div>
				<WorkflowField
					id="screenshot-input"
					label={m.ui_exploratory_screenshot()}
					error={feedbackFor(noteErrors, 'screenshot')}
				>
					{#snippet children(props)}
						<input
							{...props}
							bind:this={screenshotInput}
							type="file"
							accept={SCREENSHOT_TYPES.join(',')}
							onchange={handleFileChange}
							class="block min-h-11 w-full min-w-0 rounded-md border border-input p-1 text-sm file:me-2 file:min-h-9 file:rounded file:bg-muted file:px-2 file:text-foreground"
						/>
					{/snippet}
				</WorkflowField>
				{#if screenshotFile}
					<div class="flex min-w-0 flex-wrap items-center gap-2 text-sm">
						<span class="min-w-0 text-muted-foreground [overflow-wrap:anywhere]"
							>{screenshotFile.name}</span
						>
						<Button
							variant="outline"
							type="button"
							onclick={() => {
								clearScreenshot();
								screenshotInput?.focus();
							}}>{m.ui_exploratory_remove_screenshot()}</Button
						>
					</div>
				{/if}
			</fieldset>
			<Button type="submit" class="w-full sm:w-auto" disabled={submittingNote}>
				{submittingNote ? m.common_saving() : m.exploratory_add_note_btn()}
			</Button>
		</form>
	{/if}

	<!-- Notes Timeline -->
	<div class="space-y-2">
		<h3 class="font-medium">{m.exploratory_notes()} ({notes.length})</h3>
		{#if notes.length === 0}
			<p class="text-muted-foreground text-sm py-4 text-center">{m.exploratory_no_notes()}</p>
		{:else}
			<div class="space-y-2">
				{#each notes as note (note.id)}
					<div class="flex flex-col gap-3 rounded-md border p-3 sm:flex-row">
						<div class="flex-shrink-0 flex flex-col items-center gap-1">
							<Badge variant="outline" class="font-mono text-xs">{formatTime(note.timestamp)}</Badge
							>
							<Badge variant={noteTypeVariant(note.noteType)} class="text-xs"
								>{noteTypeLabel(note.noteType)}</Badge
							>
						</div>
						<div class="flex-1 min-w-0">
							<p class="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{note.content}</p>
							{#if note.screenshotPath}
								<a
									href="/api/uploads/{note.screenshotPath}"
									target="_blank"
									rel="noopener"
									class="mt-2 inline-block max-w-full rounded"
									aria-label={m.aria_open_screenshot_new_tab()}
								>
									<img
										src="/api/uploads/{note.screenshotPath}"
										alt=""
										class="max-w-full rounded border"
										loading="lazy"
									/>
								</a>
							{/if}
						</div>
						{#if canManage && session.status !== 'COMPLETED'}
							<Button
								variant="ghost"
								size="sm"
								class="flex-shrink-0 text-muted-foreground hover:text-destructive"
								aria-label={m.ui_exploratory_delete_note()}
								onclick={() => deleteNote(note.id)}>&times;</Button
							>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Complete Session Dialog -->
<Dialog.Root bind:open={showCompleteDialog}>
	<Dialog.Content
		class="sm:max-w-md"
		showCloseButton={!completing}
		interactOutsideBehavior="ignore"
		escapeKeydownBehavior={completing ? 'ignore' : 'close'}
		onCloseAutoFocus={(event) => {
			if (session.status === 'COMPLETED') {
				event.preventDefault();
				completedHeading?.focus();
			}
		}}
	>
		<Dialog.Header>
			<Dialog.Title>{m.exploratory_complete()}</Dialog.Title>
			<Dialog.Description>{m.exploratory_complete_desc()}</Dialog.Description>
		</Dialog.Header>
		<form novalidate class="space-y-4" aria-busy={completing} onsubmit={completeSession}>
			<FormErrorSummary
				errors={completeErrors}
				bind:ref={completeErrorSummary}
				fieldTarget={(path) => (path === 'summary' ? 'complete-summary' : undefined)}
			/>
			<fieldset disabled={completing} class="min-w-0">
				<WorkflowField
					id="complete-summary"
					label={m.exploratory_summary()}
					error={feedbackFor(completeErrors, 'summary')}
				>
					{#snippet children(props)}
						<Textarea
							{...props}
							bind:value={completeSummary}
							placeholder={m.exploratory_summary_placeholder()}
							rows={4}
						/>
					{/snippet}
				</WorkflowField>
			</fieldset>
			<Dialog.Footer>
				<Button
					type="button"
					variant="outline"
					disabled={completing}
					onclick={() => (showCompleteDialog = false)}>{m.common_cancel()}</Button
				>
				<Button type="submit" disabled={completing}
					>{completing ? m.common_saving() : m.exploratory_complete()}</Button
				>
			</Dialog.Footer>
		</form>
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
			<AlertDialog.Cancel class="w-full sm:w-auto">{m.common_cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action class="w-full sm:w-auto" onclick={deleteSession} disabled={deleting}>
				{m.common_delete()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
