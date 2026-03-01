export type RunEvent =
	| { type: 'execution:updated'; executionId: number; status: string; executedBy: string }
	| { type: 'executions:bulk_updated'; executionIds: number[]; status: string }
	| { type: 'run:status_changed'; runId: number; status: string }
	| { type: 'failure:added'; executionId: number };
