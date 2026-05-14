import * as assert from 'assert';
import { createThrottledRefresh } from '../../refresh/throttledRefresh';

suite('Throttled refresh', () => {
	test('coalesces repeated refresh requests', async () => {
		let calls = 0;
		const refresh = createThrottledRefresh(() => {
			calls += 1;
		}, 5);

		refresh.request();
		refresh.request();
		refresh.request();

		await new Promise((resolve) => setTimeout(resolve, 20));
		assert.strictEqual(calls, 1);
	});

	test('flush runs a pending refresh immediately', () => {
		let calls = 0;
		const refresh = createThrottledRefresh(() => {
			calls += 1;
		}, 1000);

		refresh.request();
		refresh.flush();

		assert.strictEqual(calls, 1);
	});
});
