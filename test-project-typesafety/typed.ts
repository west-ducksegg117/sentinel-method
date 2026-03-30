
      interface User {
        id: number;
        name: string;
      }

      export function getUser(id: number): User | null {
        if (id < 0) return null;
        return { id, name: 'John' };
      }

      export const users: User[] = [];
    