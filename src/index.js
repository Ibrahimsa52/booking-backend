const express = require('express');

const app = express();
const path = require('path');

// يخلي السيرفر يشوف فولدر public
app.use(express.static(path.join(__dirname, '../public')));


// لما حد يفتح الموقع
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard/index.html'));
});

app.listen(process.env.PORT || 8080, () => {
  console.log('Server running');
});
