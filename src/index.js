const express = require('express');
const path = require('path');

const app = express();

// خلي السيرفر يقرأ فولدر public
app.use(express.static(path.join(__dirname, '../public')));

// لما حد يفتح الموقع
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard/index.html'));
});

app.listen(process.env.PORT || 8080, () => {
  console.log('Server running');
});
