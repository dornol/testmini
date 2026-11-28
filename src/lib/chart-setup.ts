import {
	Chart,
	BarController,
	LineController,
	DoughnutController,
	CategoryScale,
	LinearScale,
	BarElement,
	LineElement,
	PointElement,
	ArcElement,
	Tooltip,
	Legend,
	Filler
} from 'chart.js';

Chart.register(
	BarController,
	LineController,
	DoughnutController,
	CategoryScale,
	LinearScale,
	BarElement,
	LineElement,
	PointElement,
	ArcElement,
	Tooltip,
	Legend,
	Filler
);

export { Chart };
