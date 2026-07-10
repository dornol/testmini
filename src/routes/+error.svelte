<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as m from '$lib/paraglide/messages.js';
</script>

<div class="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
	<h1 class="text-6xl font-bold text-muted-foreground">{page.status}</h1>
	<p class="max-w-full break-words text-lg text-muted-foreground">
		{page.error?.message ?? m.error_something_went_wrong()}
	</p>
	<Button href="/" variant="outline" class="w-full sm:w-auto">{m.error_go_home()}</Button>
</div>
