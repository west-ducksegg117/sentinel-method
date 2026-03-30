
      export function processData(input: string): string {
        const trimmed = input.trim();
        const lower = trimmed.toLowerCase();
        const result = lower.replace(/[^a-z0-9]/g, '-');
        return result;
      }
    