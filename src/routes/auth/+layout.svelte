<script lang="ts">
	let { children } = $props();
</script>

<div class="flex min-h-dvh items-center justify-center bg-background p-4">
	<div class="w-full max-w-sm">
		{@render children()}
	</div>
</div>
