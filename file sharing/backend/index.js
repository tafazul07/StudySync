const express = require('express');
const routes = require('./routes/routes');
const cors = require('cors');
const db = require('./database/db');

const app = express();


app.use(cors({
    origin: 'http://localhost:5181',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));
app.use(express.json());


db.connect()

app.use(routes);



app.get('/', (req, res) => {
    res.send('Hello World!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

  