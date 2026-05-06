const express = require('express');

const app = express();

const PORT = 3000;

const signals = [
  {
    company: "IperionX",
    ticker: "IPX",
    insider: "CEO",
    role: "CEO",
    value: 493000,
    drop: 34,
    cluster: true,
    score: 80,
    verdict: "HIGH CONVICTION"
  }
];

app.get('/', (req, res) => {

  let html = `
  <html>
  <head>
    <title>Insider Elite</title>

    <style>
      body{
        font-family: Arial;
        background:#f4f4f4;
        padding:20px;
      }

      .card{
        background:white;
        padding:20px;
        border-radius:14px;
        margin-bottom:20px;
        box-shadow:0 2px 10px rgba(0,0,0,0.1);
      }

      .score{
        color:green;
        font-size:28px;
        font-weight:bold;
      }
    </style>

  </head>

  <body>

    <h1>Insider Elite</h1>
  `;

  signals.forEach(s => {

    html += `
      <div class="card">

        <h2>${s.company} (${s.ticker})</h2>

        <div class="score">
          Score: ${s.score}
        </div>

        <p>
          <b>Verdict:</b> ${s.verdict}
        </p>

        <p>
          <b>Insider:</b> ${s.insider}
        </p>

        <p>
          <b>Value:</b> $${s.value}
        </p>

        <p>
          <b>Drop:</b> -${s.drop}%
        </p>

      </div>
    `;
  });

  html += `
    </body>
    </html>
  `;

  res.send(html);

});

app.get('/signals', (req, res) => {
  res.json(signals);
});

app.listen(PORT, () => {
  console.log("RUNNING");
});