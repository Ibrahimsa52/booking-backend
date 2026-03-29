const express = require('express');
const path = require('path');

const app = express();

// يخلي السيرفر يشوف فولدر public
app.use(express.static(path.join(__dirname, '../public')));

// الصفحة الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard/index.html'));
});

// أي route تاني يرجع نفس الداشبورد (مهم جداً)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard/index.html'));
});

app.listen(process.env.PORT || 8080, () => {
  console.log('Server running');
});
