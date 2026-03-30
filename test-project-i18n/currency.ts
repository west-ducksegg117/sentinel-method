
      export function formatPrice(value: number): string {
        return '$' + value.toFixed(2);
      }

      export function calculateTotal(items: any[]) {
        const total = items.reduce((sum, item) => sum + item.price, 0);
        return '€ ' + total;
      }
    