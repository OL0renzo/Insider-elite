require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());

const PORT = process.env.PORT || 3000;
const FMP_KEY = process.env.FMP_KEY;

let latestSignals = [];
let lastScanTime = null;

function verdict(score) {
  if (score >= 80) return "HIGH CONVICTION";
  if (score >= 70) return "CONVICTION";
  if (score >= 55) return "WATCH";
  return "SPECULATIVE";
}

async function getLatestInsiderTrades() {

  const url =
    `https://financialmodelingprep.com/stable/insider-trading/latest?page=0&limit=100&apikey=${FMP_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  return Array.isArray(data) ? data : [];
}

function buildSignal(t) {

  const shares =
    Number(t.securitiesTransacted) || 0;

  const price =
    Number(t.price) || 0;

  const value = shares * price;

  let score = 50;

  if (value > 5000000) score += 25;
  else if (value > 1000000) score += 15;
  else if (value > 250000) score += 10;

  const owner =
    (t.typeOfOwner || "").toLowerCase();

  const txType =
    (t.transactionType || "").toLowerCase();

  if (owner.includes("ceo")) score += 20;
  if (owner.includes("director")) score += 10;

  if (
    txType.includes("purchase") ||
    txType.includes("buy") ||
    txType.includes("award")
  ) {
    score += 15;
  }

  if (score > 100) score = 100;

  return {
    company: t.symbol,
    ticker: t.symbol,
    insider: t.reportingName || "Unknown",
    role: t.typeOfOwner || "Insider",
    value: Math.round(value),
    shares,
    price,
    score,
    verdict: verdict(score),
    filingDate: t.filingDate
  };
}

async function scan() {

  try {

    const raw = await getLatestInsiderTrades();

    latestSignals = raw
      .map(buildSignal)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    lastScanTime = new Date();

    console.log(
      `Loaded ${latestSignals.length} insider signals`
    );

  } catch (err) {

    console.error(err);
  }
}

app.get("/", (req, res) => {

  res.json({
    updatedAt: lastScanTime,
    count: latestSignals.length,
    results: latestSignals
  });
});

app.get("/refresh", async (req, res) => {

  await scan();

  res.json({
    updatedAt: lastScanTime,
    count: latestSignals.length,
    results: latestSignals
  });
});

app.get("/debug", async (req, res) => {

  const raw = await getLatestInsiderTrades();

  res.json({
    count: raw.length,
    sample: raw.slice(0, 3)
  });
});

scan();

setInterval(scan, 1000 * 60 * 15);

app.listen(PORT, () => {

  console.log(`Server running on port ${PORT}`);
});