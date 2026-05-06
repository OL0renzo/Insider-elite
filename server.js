require("dotenv").config();

const express = require("express");
const fetch = require("node-fetch");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;

const FMP_KEY = process.env.FMP_KEY;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

let cachedResults = [];
let lastScanTime = null;

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

function money(n) {
  return Math.round(Number(n || 0));
}

function getTradeValue(t) {
  const shares =
    Number(t.securitiesTransacted) ||
    Number(t.transactionShares) ||
    Number(t.securitiesOwned) ||
    0;

  const price =
    Number(t.price) ||
    Number(t.transactionPrice) ||
    0;

  return shares * price;
}

function isPurchase(t) {
  const type = String(
    t.transactionType ||
    t.transactionTypeCode ||
    t.acquistionOrDisposition ||
    ""
  ).toLowerCase();

  return (
    type.includes("purchase") ||
    type === "p" ||
    type.includes("p-purchase")
  );
}

function insiderScore(t) {
  let score = 0;

  const value = getTradeValue(t);
  const role = String(
    t.typeOfOwner ||
    t.reportingName ||
    t.officerTitle ||
    ""
  ).toLowerCase();

  if (isPurchase(t)) score += 35;

  if (value >= 50000) score += 10;
  if (value >= 100000) score += 15;
  if (value >= 500000) score += 20;
  if (value >= 1000000) score += 10;

  if (role.includes("ceo")) score += 20;
  if (role.includes("chief executive")) score += 20;
  if (role.includes("cfo")) score += 15;
  if (role.includes("chief financial")) score += 15;
  if (role.includes("director")) score += 10;
  if (role.includes("10%")) score += 8;

  return Math.min(score, 100);
}

function verdict(score) {
  if (score >= 80) return "HIGH CONVICTION";
  if (score >= 70) return "CONVICTION";
  if (score >= 55) return "WATCH";
  return "NOISE";
}

async function getLatestInsiderTrades() {
  const url =
    `https://financialmodelingprep.com/api/v4/insider-trading?limit=100&apikey=${FMP_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  return Array.isArray(data) ? data : [];
}
  const urls = [
    `https://financialmodelingprep.com/stable/insider-trading/search?page=0&limit=200&apikey=${FMP_KEY}`,
    `https://financialmodelingprep.com/stable/insider-trading/latest?apikey=${FMP_KEY}

  for (const url of urls) {
    try {
      const res = await fetch(url);
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    } catch (err) {
      console.log("Errore FMP:", err.message);
    }
  }

  return [];
}

async function getQuote(symbol) {
  if (!symbol) return {};

  try {
    const url = `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${FMP_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    return Array.isArray(data) ? data[0] || {} : {};
  } catch {
    return {};
  }
}

function technicalScore(quote) {
  let score = 50;

  const change = Number(quote.changesPercentage || 0);
  const volume = Number(quote.volume || 0);
  const avgVolume = Number(quote.avgVolume || 1);

  if (change < -3) score += 10;
  if (change < -7) score += 10;
  if (change > 3) score += 5;
  if (volume > avgVolume * 1.5) score += 15;

  return Math.max(0, Math.min(score, 100));
}

async function enrichTrade(t) {
  const ticker =
    t.symbol ||
    t.ticker ||
    t.companySymbol ||
    t.reportingSymbol ||
    null;

  const quote = await getQuote(ticker);

  const iScore = insiderScore(t);
  const tScore = technicalScore(quote);

  const finalScore = Math.round(iScore * 0.75 + tScore * 0.25);
  const value = money(getTradeValue(t));

  return {
    company: t.companyName || quote.name || ticker || "Unknown",
    ticker,
    price: quote.price || null,
    insider: t.reportingName || t.insiderName || "Unknown",
    role: t.typeOfOwner || t.officerTitle || "Unknown",
    transactionType: t.transactionType || t.transactionTypeCode || "Unknown",
    value,
    date: t.transactionDate || t.filingDate || t.acceptanceTime || null,
    insiderScore: iScore,
    technicalScore: tScore,
    score: finalScore,
    verdict: verdict(finalScore),
  };
}

async function scan() {
  const raw = await getLatestInsiderTrades();

  const purchases = raw
    .filter(isPurchase)
    .map((t) => ({
      trade: t,
      value: getTradeValue(t),
    }))
    .filter((x) => x.value >= 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 40);

  const results = [];

  for (const item of purchases) {
    try {
      const enriched = await enrichTrade(item.trade);
      results.push( enriched);
    } catch (err) {
      console.log("Errore enrich:", err.message);
    }
  }

  cachedResults = results.sort((a, b) => b.score - a.score);
  lastScanTime = new Date();

  return cachedResults;
}

async function sendAlerts(results) {
  const top = results.filter((r) => r.score >= 70);
  if (top.length === 0) return;

  const body = top
    .slice(0, 10)
    .map(
      (r) => `
${r.ticker || "N/A"} - ${r.verdict}
Company: ${r.company}
Score: ${r.score}
Insider: ${r.insider}
Role: ${r.role}
Type: ${r.transactionType}
Value: $${r.value}
Date: ${r.date}
`
    )
    .join("\n");

  await transporter.sendMail({
    from: EMAIL_USER,
    to: EMAIL_USER,
    subject: "🚨 Insider Elite - nuovi segnali",
    text: body,
  });
}

function renderDashboard(results) {
  const cards = results
    .map(
      (r) => `
      <div class="card">
        <div class="top">
          <div>
            <h2>${r.company}</h2>
            <p class="ticker">${r.ticker || "N/A"}</p>
          </div>
          <div class="badge">${r.verdict}</div>
        </div>

        <div class="score">${r.score}</div>

        <p><b>Insider:</b> ${r.insider}</p>
        <p><b>Role:</b> ${r.role}</p>
        <p><b>Type:</b> ${r.transactionType}</p>
        <p><b>Value:</b> $${r.value.toLocaleString()}</p>
        <p><b>Date:</b> ${r.date || "N/A"}</p>
        <p><b>Price:</b> ${r.price ? "$" + r.price : "N/A"}</p>

        <div class="grid">
          <div>Insider Score<br/><b>${r.insiderScore}</b></div>
          <div>Technical Score<br/><b>${r.technicalScore}</b></div>
        </div>
      </div>
    `
    )
    .join("");

  return `
  <html>
    <head>
      <title>Insider Elite</title>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <style>
        body {
          margin: 0;
          font-family: Arial, sans-serif;
          background: #f3f1ed;
          color: #1f2933;
          padding: 20px;
        }
        h1 {
          font-size: 34px;
          margin-bottom: 6px;
        }
        .subtitle {
          color: #6b7280;
          margin-bottom: 22px;
        }
        .card {
          background: white;
          padding: 22px;
          margin: 16px 0;
          border-radius: 18px;
          box-shadow: 0 8px 24px rgba(0,0,0,.08);
        }
        .top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
        }
        h2 {
          margin: 0;
          font-size: 22px;
        }
        .ticker {
          color: #6b7280;
          margin-top: 4px;
        }
        .badge {
          background: #e8f5ec;
          color: #137333;
          padding: 8px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: bold;
          white-space: nowrap;
        }
        .score {
          font-size: 52px;
          font-weight: bold;
          color: #137333;
          margin: 14px 0;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 16px;
        }
        .grid div {
          background: #f6f7f9;
          padding: 12px;
          border-radius: 12px;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <h1>Insider Elite</h1>
      <div class="subtitle">
        Ultimo aggiornamento: ${lastScanTime ? lastScanTime.toLocaleString("it-IT") : "in corso"}
      </div>
      ${cards || "<p>Nessun segnale disponibile al momento.</p>"}
    </body>
  </html>
  `;
}

app.get("/", async (req, res) => {
  if (cachedResults.length === 0) {
    await scan();
  }

  res.send(renderDashboard(cachedResults));
});
app.get("/debug", async (req, res) => {
  const raw = await getLatestInsiderTrades();

  res.json({
    count: Array.isArray(raw) ? raw.length : 0,
    sample: Array.isArray(raw) ? raw.slice(0, 5) : raw
  });
});
app.get("/signals", async (req, res) => {
  if (cachedResults.length === 0) {
    await scan();
  }

  res.json(cachedResults);
});

app.get("/refresh", async (req, res) => {
  const results = await scan();
  await sendAlerts(results);
  res.json({
    updatedAt: lastScanTime,
    count: results.length,
    results,
  });
});

setInterval(async () => {
  console.log("Auto refresh insider trades...");
  const results = await scan();
  await sendAlerts(results);
}, 30 * 60 * 1000);

app.listen(PORT, async () => {
  console.log("RUNNING");
  await scan();
});