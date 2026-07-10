<script lang="ts">
	interface Props {
		name: string;
		color: string;
	}

	let { name, color }: Props = $props();
</script>

<span
	class="inline-flex max-w-full min-w-0 items-center gap-1 truncate text-xs font-medium"
	style="color: {color};"
>
	<span class="h-2 w-2 shrink-0 rounded-full" style="background-color: {color}"></span>
	<span class="min-w-0 truncate">{name}</span>
</span>
