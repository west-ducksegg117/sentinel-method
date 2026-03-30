
      import express from 'express';
      const app = express();

      // Nomes com verbos violam REST
      app.get('/getUsers', (req, res) => {
        res.json([]);
      });

      app.post('/createProduct', (req, res) => {
        res.json({ id: 1 });
      });
    