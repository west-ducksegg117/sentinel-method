
      export class UserService {
        async getUser(id: string) {
          return { id, name: 'John' };
        }

        async updateUser(id: string, data: any) {
          return { id, ...data };
        }
      }
    