require("dotenv").config();

const express = require("express");
const fetch = require("node-fetch");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;

const FMP_KEY = process.env.FMP_KEY;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

const WATCHLIST = ["AAPL", "MSFT", "AMZN", "NVDA", "TSLA", "UNH", "AMAT", "AMD", "META"];

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

function insiderScore(t) {
  let score = 0;

  const value = Number(t.securitiesTransacted || 0) * Number(t.price || 0);
  const role = String(t.reportingName || "").toLowerCase();
  const type = String(t.transactionType || "").toLowerCase();

  if (type.includes("purchase") || type.includes("p-purchase")) score += 35;
  if (value >= 100000) score += 25;
  if (value >= 500000) score += 15;
  if (role.includes("ceo") || role.includes("chief executive")) score += 20;
  if (role.includes("cfo") || role.includes("chief financial")) score += 15;

  return Math.min(score, 100);
}

function technicalScore(quote) {
  let score = 50;

  const change = Number(quote.changesPercentage || 0);
  const volume = Number(quote.volume || 0);
  const avgVolume = Number(quote.avgVolume || 1);

  if (change < -3) score += 10;
  if (change < -7) score += 15;
  if (volume > avgVolume * 1.5) score += 15;

  return Math.max(0, Math.min(score, 100));
}

function finalScore(insider, technical) {
  return Math.round(insider * 0.7 + technical * 0.3);
}

function verdict(score) {
  if (score >= 80) return "HIGH CONVICTION";
  if (score >= 70) return "CONVICTION";
  if (score >= 60) return "WATCH";
  return "NOISE";
}

async function getInsiders(symbol) {
  const url = `https://financialmodelingprep.com/api/v4/insider-trading?symbol=${symbol}&apikey=${FMP_KEY}`;
  const res = await fetch(url);
  return await res.json();
}

async function getQuote(symbol) {
  const url = `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${FMP_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data[0] || {};
}

async function analyzeSymbol(symbol) {
  const insiders = await getInsiders(symbol);
  const quote = await getQuote(symbol);

  const recent = Array.isArray(insiders) ? insiders.slice(0, 10) : [];

  const buys = recent.filter(t => {
    const type = String(t.transactionType || "").toLowerCase();
    const value = Number(t.securitiesTransacted || 0) * Number(t.price || 0);
    return type.includes("purchase") && value >= 100000;
  });

  if (buys.length === 0) return null;

  const bestTrade = buys[0];

  const iScore = insiderScore(bestTrade);
  const tScore = technicalScore(quote);
  const total = finalScore(iScore, tScore);

  return {
    company: quote.name || symbol,
    ticker: symbol,
    price: quote.price || null,
    insider: bestTrade.reportingName || "Unknown",
    transactionType: bestTrade.transactionType || "Unknown",
    value: Math.round(Number(bestTrade.securitiesTransacted || 0) * Number(bestTrade.price || 0)),
    insiderScore: iScore,
    technicalScore: tScore,
    score: total,
    verdict: verdict(total),
    date: bestTrade.transactionDate || bestTrade.filingDate || null,
  };
}

async function scan() {
  const results = [];

  for (const symbol of WATCHLIST) {
    try {
      const result = await analyzeSymbol(symbol);
      if (result && result.score >= 45) results.push(result);
    } catch (err) {
      console.log("Errore su", symbol, err.message);
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

async function sendAlerts(results) {
  const top = results.filter(r => r.score >= 70);
  if (top.length === 0) return;

  const body = top.map(r => `
${r.ticker} - ${r.verdict}
Score: ${r.score}
Insider: ${r.insider}
Value: $${r.value}
Date: ${r.date}
`).join("\n");

  await transporter.sendMail({
    from: EMAIL_USER,
    to: EMAIL_USER,
    subject: "🚨 Insider Elite - nuovi segnali",
    text: body,
  });
}

app.get("/", async (req, res) => {
  const results = await scan();

  const cards = results.map(r => `
    <div class="card">
      <h2>${r.company} (${r.ticker})</h2>
      <h1>Score: ${r.score}</h1>
      <p><b>Verdict:</b> ${r.verdict}</p>
      <p><b>Insider:</b> ${r.insider}</p>
      <p><b>Type:</b> ${r.transactionType}</p>
      <p><b>Value:</b> $${r.value}</p>
      <p><b>Date:</b> ${r.date}</p>
      <p><b>Price:</b> $${r.price}</p>
      <p><b>Insider Score:</b> ${r.insiderScore}</p>
      <p><b>Technical Score:</b> ${r.technicalScore}</p>
    </div>
  `).join("");

  res.send(`
    <html>
      <head>
        <title>Insider Elite</title>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <style>
          body { font-family: Arial; background:#f3f1ed; padding:24px; }
          h1 { font-size:34px; }
          .card {
            background:white;
            padding:24px;
            margin:18px 0;
            border-radius:18px;
            box-shadow:0 8px 24px rgba(0,0,0,.08);
          }
          .card h1 { color:#1f7a3f; }
        </style>
      </head>
      <body>
        <h1>Insider Elite</h1>
        ${cards || "<p>Nessun segnale forte al momento.</p>"}
      </body>
    </html>
  `);
});

app.get("/signals", async (req, res) => {
  res.json(await scan());
});

setInterval(async () => {
  const results = await scan();
  await sendAlerts(results);
}, 30 * 60 * 1000);

app.listen(PORT, () => console.log("RUNNING"));