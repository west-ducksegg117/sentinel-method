import { serve } from "./service";
test("serve", () => expect(serve()).toBe("running"));