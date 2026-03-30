import { sum } from "./utils";
test("handles null and undefined", () => {
  expect(sum(null as any, 1)).toBeNaN();
  expect(sum(undefined as any, 1)).toBeNaN();
});
test("edge case with zero", () => {
  expect(sum(0, 0)).toBe(0);
});
test("handles overflow", () => {
  expect(sum(Number.MAX_SAFE_INTEGER, 1)).toBeGreaterThan(0);
});