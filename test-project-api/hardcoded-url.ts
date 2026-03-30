
      const url = 'https://api.example.com/v1/users';
      async function fetchUsers() {
        const response = await fetch(url);
        return response.json();
      }
    