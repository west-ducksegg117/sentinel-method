
      import { t } from 'i18n';

      export function processData(input: any) {
        const result = input.map((item: any) => ({
          id: item.id,
          value: item.value,
        }));
        return result;
      }

      export const API_URL = 'https://api.example.com';
      export const TIMEOUT_MS = 5000;
    