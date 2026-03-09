<script lang="ts">
	interface Props {
		name: string;
		color: string;
	}

	let { name, color }: Props = $props();
</script>

<span
	class="inline-flex items-center gap-1 text-xs font-medium truncate"
	style="color: {color};"
>
	<span class="h-2 w-2 shrink-0 rounded-full" style="background-color: {color}"></span>
	<span class="truncate">{name}</span>
</span>
