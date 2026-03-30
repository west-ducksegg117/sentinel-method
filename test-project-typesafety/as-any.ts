
      export function process(value: unknown) {
        const result = value as any;
        return result.method();
      }
    