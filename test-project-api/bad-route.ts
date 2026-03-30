
      import express from 'express';
      const app = express();

      // Sem validação de input
      app.post('/users', (req, res) => {
        res.json(req.body);
      });
    