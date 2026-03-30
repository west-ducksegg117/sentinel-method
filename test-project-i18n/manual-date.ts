
      export function getCurrentDate(): string {
        const now = new Date();
        return now.toLocaleDateString();
      }

      export function formatDateTime(date: Date): string {
        return date.toLocaleString();
      }
    