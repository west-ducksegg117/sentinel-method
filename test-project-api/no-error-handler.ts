
      import express from 'express';
      const app = express();

      app.post('/data', (req, res) => {
        const processed = processData(req.body);
        res.json(processed);
      });

      // Sem try/catch ou middleware de erro
    