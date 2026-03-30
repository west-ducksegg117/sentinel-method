import { main } from "./app";
test("main works", () => {
  expect(main()).toBeDefined();
  expect(main()).not.toBeNull();
});