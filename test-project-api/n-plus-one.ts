
      async function getUsersWithOrders(users: any[]) {
        users.forEach(async (u) => {
          const orders = await db.query('SELECT * FROM orders WHERE userId=' + u.id);
          u.orders = orders;
        });
      }
    