import type { RunEvent } from '$lib/types/events';

export function createRunEventSource(projectId: number, runId: number) {
	let eventSource: EventSource | null = null;
	let connected = $state(false);
	let lastEvent = $state<RunEvent | null>(null);

	function connect() {
		if (eventSource) return;

		eventSource = new EventSource(
			`/api/projects/${projectId}/test-runs/${runId}/events`
		);

		eventSource.onopen = () => {
			connected = true;
		};

		eventSource.onmessage = (e) => {
			try {
				const data = JSON.parse(e.data);
				if (data.type === 'connected') {
					connected = true;
					return;
				}
				lastEvent = data as RunEvent;
			} catch {
				// Ignore malformed messages
			}
		};

		eventSource.onerror = () => {
			connected = false;
		};
	}

	function disconnect() {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
			connected = false;
		}
	}

	return {
		get connected() {
			return connected;
		},
		get lastEvent() {
			return lastEvent;
		},
		connect,
		disconnect
	};
}
