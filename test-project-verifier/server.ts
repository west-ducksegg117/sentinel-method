
import express from 'express';
const app = express();
app.post('/users', async (req, res) => {
  const name = req.body.name;
  await db.execute('INSERT INTO users (name) VALUES (' + name + ')');
  res.send({ ok: true });
});
    