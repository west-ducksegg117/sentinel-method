
      import express from 'express';
      const app = express();

      app.get('/products/:id', (req, res) => {
        res.json({ id: req.params.id });
      });
    