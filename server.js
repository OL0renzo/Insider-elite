const express = require('express');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// EMAIL CONFIG
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'TUA_EMAIL@gmail.com',
    pass: 'APP_PASSWORD'
  }
});

// SCORING
function score(t) {
  let s = 0;
  if (t.value > 100000) s += 25;
  if (t.role === "CEO") s += 25;
  if (t.cluster) s += 20;
  if (t.drop > 20) s += 10;
  return s;
}

// DATI (per ora funzionanti)
async function getData() {
  return [
    {
      company: "IperionX",
      insider: "CEO",
      role: "CEO",
      value: 493000,
      drop: 34,
      cluster: true
    }
  ];
}

// CORE
async function run(sendEmail = false) {
  const data = await getData();

  for (const t of data) {
    t.score = score(t);

    if (sendEmail && t.score >= 70) {
      await transporter.sendMail({
        from: 'insider@app.com',
        to: 'TUA_EMAIL@gmail.com',
        subject: '🚨 INSIDER ALERT',
        text: `${t.company} - Score ${t.score}`
      });
    }
  }

  return data;
}

// API
app.get('/signals', async (req, res) => {
  res.json(await run(false));
});

// AUTO
setInterval(() => run(true), 10 * 60 * 1000);

app.listen(PORT, () => console.log("RUNNING"));