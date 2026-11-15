<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import { Button } from '$lib/components/ui/button/index.js';
</script>

<div class="mx-auto flex max-w-lg flex-col items-center py-20 text-center" role="alert">
	<h1 class="text-xl font-bold">{m.my_work_error_title()}</h1>
	<p class="text-muted-foreground mt-2 text-sm">{m.my_work_error_description()}</p>
	<Button class="mt-5" onclick={() => invalidateAll()}>{m.my_work_retry()}</Button>
</div>
