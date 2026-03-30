import { add } from "./math";
test("basic", () => {
  expect(add(1, 2)).toBe(3);
  expect(add(0, 0)).toBe(0);
});
test("edge cases", () => {
  expect(add(-1, 1)).toBe(0);
  expect(add(null as any, 1)).toBeDefined();
  expect(add(undefined as any, 1)).toBeDefined();
});