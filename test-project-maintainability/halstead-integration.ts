
        /** Processa dados */
        export function process(items: string[]): string[] {
          return items.filter(i => i.length > 0).map(i => i.trim());
        }
      