<script lang="ts">
	import OidcProviderForm from '$lib/components/OidcProviderForm.svelte';

	let { data } = $props();
</script>

<OidcProviderForm provider={data.provider} accountCount={data.accountCount} />
