<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
</script>

<div class="flex min-h-dvh flex-col items-center justify-center gap-4">
	<h1 class="text-6xl font-bold text-muted-foreground">{page.status}</h1>
	<p class="text-lg text-muted-foreground">{page.error?.message ?? 'Something went wrong'}</p>
	<Button href="/" variant="outline">Go home</Button>
</div>
