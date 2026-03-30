
      export function displayItems(count: number): string {
        return count === 1 ? 'item' : 'items';
      }

      export function showResults(total: number): string {
        const result = total > 1 ? 'results found' : 'result found';
        return total + ' ' + result;
      }
    