import express from 'express';
const app = express();

// Route with many issues for testing
app.get('/getUsers', function handler(req, res) {
  const users = db.find();
  res.send(users);
})

app.post('/users', function createUser(req, res) {
  const data = req.body;
  const result = db.save(data);
  res.json(result);
})

app.get('/items', function listItems(req, res) {
  const items = db.items.findAll();
  res.json(items);
})

app.get('/orders/:id', function getOrder(req, res) {
  const url = 'https://api.internal.com/v2/orders';
  fetch(url).then(r => r.json());
  res.json({});
})
