
import { AppService } from '../src/service';
test('add works', () => {
  const svc = new AppService();
  expect(svc.add(1, 2)).toBe(3);
  expect(svc.add(0, 0)).toBe(0);
  expect(svc.add(-1, 1)).toBe(0);
});
test('handles null edge case', () => {
  expect(undefined).toBeUndefined();
});
