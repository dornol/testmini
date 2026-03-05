<script lang="ts">
	interface Props {
		password: string;
	}

	let { password }: Props = $props();

	type StrengthLevel = 0 | 1 | 2 | 3 | 4;

	interface StrengthInfo {
		level: StrengthLevel;
		label: string;
		barClass: string;
		textClass: string;
	}

	const strengthInfo = $derived.by((): StrengthInfo => {
		let score = 0;

		if (password.length >= 8) score++;
		if (password.length >= 12) score++;
		if (/[A-Z]/.test(password)) score++;
		if (/[a-z]/.test(password)) score++;
		if (/[0-9]/.test(password)) score++;
		if (/[^A-Za-z0-9]/.test(password)) score++;

		// Map score 0-6 to level 0-4
		const level = (Math.min(Math.floor((score * 4) / 6), 4)) as StrengthLevel;

		const labels: Record<StrengthLevel, string> = {
			0: 'Very Weak',
			1: 'Weak',
			2: 'Fair',
			3: 'Strong',
			4: 'Very Strong'
		};

		const barClasses: Record<StrengthLevel, string> = {
			0: 'bg-red-500',
			1: 'bg-orange-500',
			2: 'bg-yellow-500',
			3: 'bg-lime-500',
			4: 'bg-green-500'
		};

		const textClasses: Record<StrengthLevel, string> = {
			0: 'text-red-500',
			1: 'text-orange-500',
			2: 'text-yellow-500',
			3: 'text-lime-500',
			4: 'text-green-500'
		};

		return {
			level,
			label: labels[level],
			barClass: barClasses[level],
			textClass: textClasses[level]
		};
	});

	const segments = [0, 1, 2, 3] as const;
</script>

<div class="mt-2 space-y-1">
	<div class="flex gap-1">
		{#each segments as i (i)}
			<div
				class="h-1.5 flex-1 rounded-full transition-colors duration-300 {i < strengthInfo.level
					? strengthInfo.barClass
					: 'bg-muted'}"
			></div>
		{/each}
	</div>
	<p class="text-xs {strengthInfo.textClass}">{strengthInfo.label}</p>
</div>
