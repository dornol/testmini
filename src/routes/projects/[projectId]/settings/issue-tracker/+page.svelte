<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { toast } from 'svelte-sonner';
	import { apiPost, apiDelete } from '$lib/api-client';
	import * as m from '$lib/paraglide/messages.js';

	const PROVIDERS = ['JIRA', 'GITHUB', 'GITLAB', 'GITEA', 'CUSTOM'] as const;
	type Provider = (typeof PROVIDERS)[number];

	interface TrackerConfig {
		id: number;
		provider: string;
		baseUrl: string;
		projectKey: string | null;
		customTemplate: Record<string, unknown> | null;
		enabled: boolean;
		hasApiToken: boolean;
		hasWebhookSecret: boolean;
		createdAt: string;
	}

	let { data } = $props();

	const projectId = $derived(data.project.id);

	let config = $state<TrackerConfig | null>(null);

	// Derive UI fields from normalized config
	// JIRA: baseUrl = jira URL, projectKey = project key, apiToken = "email:token"
	// GITHUB: baseUrl = "https://github.com", projectKey = "owner/repo"
	// GITLAB: baseUrl = gitlab URL, projectKey = project ID
	// CUSTOM: baseUrl = endpoint URL, customTemplate = { headers, titleTemplate, bodyTemplate }

	let provider = $state<Provider>('JIRA');
	let baseUrl = $state('');
	let apiToken = $state('');
	let projectKey = $state('');
	// For GitHub
	let repository = $state('');
	// For GitLab
	let gitlabUrl = $state('');
	let gitlabProjectId = $state('');
	// For Gitea
	let giteaUrl = $state('');
	let giteaRepo = $state('');
	// For Custom
	let customEndpoint = $state('');
	let customHeaders = $state('');
	// Webhook secret (shared across providers)
	let webhookSecret = $state('');

	// Track which data snapshot we've synced from, to avoid re-running on the same reference
	let syncedConfigId = $state<number | null>(null);

	// Sync from data (reactive) — only when the server config actually changes
	$effect(() => {
		const c = data.issueTrackerConfig as TrackerConfig | null;
		if (c?.id === syncedConfigId && syncedConfigId !== null) return;
		syncedConfigId = c?.id ?? null;
		config = c;
		provider = (c?.provider as Provider) ?? 'JIRA';
		baseUrl = c?.provider === 'JIRA' || c?.provider === 'GITLAB' ? c.baseUrl : '';
		apiToken = '';
		projectKey = c?.provider === 'JIRA' ? (c.projectKey ?? '') : '';
		repository = c?.provider === 'GITHUB' ? (c.projectKey ?? '') : '';
		gitlabUrl = c?.provider === 'GITLAB' ? c.baseUrl : '';
		gitlabProjectId = c?.provider === 'GITLAB' ? (c.projectKey ?? '') : '';
		giteaUrl = c?.provider === 'GITEA' ? c.baseUrl : '';
		giteaRepo = c?.provider === 'GITEA' ? (c.projectKey ?? '') : '';
		customEndpoint = c?.provider === 'CUSTOM' ? c.baseUrl : '';
		customHeaders = c?.provider === 'CUSTOM' && c.customTemplate
			? JSON.stringify((c.customTemplate as Record<string, unknown>).headers ?? {}, null, 2)
			: '';
		webhookSecret = '';
	});

	let saving = $state(false);
	let testing = $state(false);
	let deleteDialogOpen = $state(false);

	function providerLabel(p: string): string {
		const labels: Record<string, () => string> = {
			JIRA: m.issue_tracker_provider_JIRA,
			GITHUB: m.issue_tracker_provider_GITHUB,
			GITLAB: m.issue_tracker_provider_GITLAB,
			GITEA: m.issue_tracker_provider_GITEA,
			CUSTOM: m.issue_tracker_provider_CUSTOM
		};
		return labels[p]?.() ?? p;
	}

	function buildPayload() {
		const payload: Record<string, unknown> = { provider, enabled: true };

		switch (provider) {
			case 'JIRA':
				payload.baseUrl = baseUrl.trim();
				payload.projectKey = projectKey.trim();
				if (apiToken.trim()) payload.apiToken = apiToken.trim();
				break;
			case 'GITHUB':
				payload.baseUrl = 'https://github.com';
				payload.projectKey = repository.trim();
				if (apiToken.trim()) payload.apiToken = apiToken.trim();
				break;
			case 'GITLAB':
				payload.baseUrl = gitlabUrl.trim();
				payload.projectKey = gitlabProjectId.trim();
				if (apiToken.trim()) payload.apiToken = apiToken.trim();
				break;
			case 'GITEA':
				payload.baseUrl = giteaUrl.trim();
				payload.projectKey = giteaRepo.trim();
				if (apiToken.trim()) payload.apiToken = apiToken.trim();
				break;
			case 'CUSTOM':
				payload.baseUrl = customEndpoint.trim();
				if (apiToken.trim()) payload.apiToken = apiToken.trim();
				try {
					const headers = customHeaders.trim() ? JSON.parse(customHeaders.trim()) : {};
					payload.customTemplate = { headers };
				} catch {
					payload.customTemplate = {};
				}
				break;
		}

		if (webhookSecret.trim()) payload.webhookSecret = webhookSecret.trim();

		return payload;
	}

	async function handleSave() {
		if (saving) return;
		saving = true;
		try {
			const payload = buildPayload();
			const tokenIncluded = 'apiToken' in payload;
			const result = await apiPost<TrackerConfig>(
				`/api/projects/${projectId}/issue-tracker`,
				payload
			);
			config = result;
			syncedConfigId = result.id;
			apiToken = '';
			webhookSecret = '';
			toast.success(
				tokenIncluded
					? m.issue_tracker_saved()
					: `${m.issue_tracker_saved()} (API token unchanged)`
			);
		} catch {
			// handled by api client
		} finally {
			saving = false;
		}
	}

	async function handleTest() {
		if (testing) return;
		testing = true;
		try {
			const result = await apiPost<{ ok: boolean; message: string }>(
				`/api/projects/${projectId}/issue-tracker/test`,
				{}
			);
			if (result.ok) {
				toast.success(`${m.issue_tracker_test_success()}: ${result.message}`);
			} else {
				toast.error(`${m.issue_tracker_test_failed()}: ${result.message}`);
			}
		} catch {
			toast.error(m.issue_tracker_test_failed());
		} finally {
			testing = false;
		}
	}

	async function handleDelete() {
		try {
			await apiDelete(`/api/projects/${projectId}/issue-tracker`);
			config = null;
			provider = 'JIRA';
			baseUrl = '';
			apiToken = '';
			projectKey = '';
			repository = '';
			gitlabUrl = '';
			gitlabProjectId = '';
			giteaUrl = '';
			giteaRepo = '';
			customEndpoint = '';
			customHeaders = '';
			webhookSecret = '';
			toast.success(m.issue_tracker_deleted());
		} catch {
			// handled
		} finally {
			deleteDialogOpen = false;
		}
	}
</script>

<div class="space-y-4">
	<div>
		<h3 class="text-lg font-semibold">{m.issue_tracker_title()}</h3>
		<p class="text-muted-foreground text-sm">{m.issue_tracker_desc()}</p>
	</div>

	<Card.Root>
		<Card.Content class="pt-6">
			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleSave();
				}}
				class="space-y-4"
			>
				<div class="space-y-2">
					<Label>{m.issue_tracker_provider()}</Label>
					<Select.Root
						type="single"
						value={provider}
						onValueChange={(v: string) => {
							provider = v as Provider;
						}}
					>
						<Select.Trigger class="w-full">
							{providerLabel(provider)}
						</Select.Trigger>
						<Select.Content>
							{#each PROVIDERS as p (p)}
								<Select.Item value={p} label={providerLabel(p)} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				{#if provider === 'JIRA'}
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="it-base-url">{m.issue_tracker_base_url()}</Label>
							<Input
								id="it-base-url"
								type="url"
								placeholder="https://company.atlassian.net"
								bind:value={baseUrl}
								required
							/>
						</div>
						<div class="space-y-2">
							<Label for="it-project-key">{m.issue_tracker_project_key()}</Label>
							<Input id="it-project-key" placeholder="PROJ" bind:value={projectKey} required />
						</div>
					</div>
					<div class="space-y-2">
						<Label for="it-token">{m.issue_tracker_api_token()}</Label>
						<Input
							id="it-token"
							type="password"
							placeholder={config?.hasApiToken ? '********' : 'email@company.com:your-api-token'}
							bind:value={apiToken}
							required={!config}
						/>
						<p class="text-muted-foreground text-xs">
							Format: email:api_token (e.g. user@company.com:AbCdEf123456)
						</p>
					</div>
				{:else if provider === 'GITHUB'}
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="it-repo">{m.issue_tracker_repo()}</Label>
							<Input
								id="it-repo"
								placeholder={m.issue_tracker_repo_placeholder()}
								bind:value={repository}
								required
							/>
						</div>
						<div class="space-y-2">
							<Label for="it-token">{m.issue_tracker_api_token()}</Label>
							<Input
								id="it-token"
								type="password"
								placeholder={config?.hasApiToken ? '********' : 'ghp_...'}
								bind:value={apiToken}
								required={!config}
							/>
						</div>
					</div>
				{:else if provider === 'GITLAB'}
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="it-gitlab-url">{m.issue_tracker_gitlab_url()}</Label>
							<Input
								id="it-gitlab-url"
								type="url"
								placeholder="https://gitlab.com"
								bind:value={gitlabUrl}
								required
							/>
						</div>
						<div class="space-y-2">
							<Label for="it-gitlab-pid">{m.issue_tracker_gitlab_project_id()}</Label>
							<Input
								id="it-gitlab-pid"
								placeholder="12345"
								bind:value={gitlabProjectId}
								required
							/>
						</div>
					</div>
					<div class="space-y-2">
						<Label for="it-token">{m.issue_tracker_api_token()}</Label>
						<Input
							id="it-token"
							type="password"
							placeholder={config?.hasApiToken ? '********' : 'glpat-...'}
							bind:value={apiToken}
							required={!config}
						/>
					</div>
				{:else if provider === 'GITEA'}
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="it-gitea-url">{m.issue_tracker_gitea_url()}</Label>
							<Input
								id="it-gitea-url"
								type="url"
								placeholder="https://gitea.example.com"
								bind:value={giteaUrl}
								required
							/>
						</div>
						<div class="space-y-2">
							<Label for="it-gitea-repo">{m.issue_tracker_repo()}</Label>
							<Input
								id="it-gitea-repo"
								placeholder={m.issue_tracker_repo_placeholder()}
								bind:value={giteaRepo}
								required
							/>
						</div>
					</div>
					<div class="space-y-2">
						<Label for="it-token">{m.issue_tracker_api_token()}</Label>
						<Input
							id="it-token"
							type="password"
							placeholder={config?.hasApiToken ? '********' : ''}
							bind:value={apiToken}
							required={!config}
						/>
					</div>
				{:else if provider === 'CUSTOM'}
					<div class="space-y-2">
						<Label for="it-endpoint">{m.issue_tracker_custom_endpoint()}</Label>
						<Input
							id="it-endpoint"
							type="url"
							placeholder="https://api.example.com/issues"
							bind:value={customEndpoint}
							required
						/>
					</div>
					<div class="space-y-2">
						<Label for="it-token">{m.issue_tracker_api_token()}</Label>
						<Input
							id="it-token"
							type="password"
							placeholder={config?.hasApiToken ? '********' : ''}
							bind:value={apiToken}
						/>
					</div>
					<div class="space-y-2">
						<Label for="it-headers">{m.issue_tracker_custom_headers()}</Label>
						<Textarea
							id="it-headers"
							placeholder={'{"X-Custom-Header": "value"}'}
							bind:value={customHeaders}
							rows={3}
						/>
					</div>
				{/if}

				{#if provider !== 'CUSTOM'}
					<div class="border-t pt-4 mt-2 space-y-3">
						<div>
							<h4 class="text-sm font-medium">{m.issue_tracker_webhook_title()}</h4>
							<p class="text-muted-foreground text-xs">{m.issue_tracker_webhook_desc()}</p>
						</div>
						<div class="grid gap-4 sm:grid-cols-2">
							<div class="space-y-2">
								<Label for="it-webhook-url">{m.issue_tracker_webhook_url()}</Label>
								<Input
									id="it-webhook-url"
									readonly
									value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/issues`}
									onclick={(e) => {
										const input = e.currentTarget as HTMLInputElement;
										input.select();
										navigator.clipboard.writeText(input.value);
										toast.success(m.common_copied());
									}}
								/>
							</div>
							<div class="space-y-2">
								<Label for="it-webhook-secret">{m.issue_tracker_webhook_secret()}</Label>
								<Input
									id="it-webhook-secret"
									type="password"
									placeholder={config?.hasWebhookSecret ? '********' : m.issue_tracker_webhook_secret_placeholder()}
									bind:value={webhookSecret}
								/>
							</div>
						</div>
						<p class="text-muted-foreground text-xs">{m.issue_tracker_webhook_hint()}</p>
					</div>
				{/if}

				<div class="flex gap-2">
					<Button type="submit" disabled={saving}>
						{saving ? m.common_saving() : m.issue_tracker_save()}
					</Button>
					{#if config}
						<Button type="button" variant="outline" disabled={testing} onclick={handleTest}>
							{testing ? m.common_loading() : m.issue_tracker_test()}
						</Button>
						<Button
							type="button"
							variant="destructive"
							onclick={() => (deleteDialogOpen = true)}
						>
							{m.common_delete()}
						</Button>
					{/if}
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	<AlertDialog.Root
		open={deleteDialogOpen}
		onOpenChange={(open) => {
			if (!open) deleteDialogOpen = false;
		}}
	>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.issue_tracker_delete_title()}</AlertDialog.Title>
				<AlertDialog.Description>
					{m.issue_tracker_delete_confirm()}
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
				<Button variant="destructive" onclick={handleDelete}>{m.common_delete()}</Button>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>
</div>
