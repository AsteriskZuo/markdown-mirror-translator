export type ThrottledRefresh = {
	request(): void;
	flush(): void;
	dispose(): void;
};

export function createThrottledRefresh(refresh: () => void, delayMs: number): ThrottledRefresh {
	let timer: NodeJS.Timeout | undefined;

	function run(): void {
		if (timer) {
			clearTimeout(timer);
			timer = undefined;
		}

		refresh();
	}

	return {
		request(): void {
			if (timer) {
				return;
			}

			timer = setTimeout(run, delayMs);
		},
		flush(): void {
			if (!timer) {
				return;
			}

			run();
		},
		dispose(): void {
			if (timer) {
				clearTimeout(timer);
				timer = undefined;
			}
		},
	};
}
