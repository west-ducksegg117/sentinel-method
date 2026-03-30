
      interface User {
        name: string;
      }

      export function getName(user: User | null) {
        return user!.name;
      }
    