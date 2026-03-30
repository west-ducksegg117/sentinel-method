
      export async function processData(data: unknown) {
        try {
          if (!data) {
            throw new Error('Data is required');
          }
          return JSON.parse(String(data));
        } catch (error) {
          if (error instanceof Error) {
            throw new Error(`Failed to process: ${error.message}`);
          }
          throw error;
        }
      }
    