<script lang="ts">
	interface Props {
		name: string;
		color: string;
	}

	let { name, color }: Props = $props();
</script>

<span
	class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
	style="border-color: {color}; color: {color};"
>
	<span class="h-1.5 w-1.5 rounded-full" style="background-color: {color}"></span>
	{name}
</span>
