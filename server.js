require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const FMP_KEY = process.env.FMP_KEY;

let latestSignals = [];
let lastScanTime = null;

function verdict(score) {
  if (score >= 80) return "HIGH CONVICTION";
  if (score >= 70) return "CONVICTION";
  if (score >= 55) return "WATCH";
  return "IGNORE";
}

async function getLatestInsiderTrades() {

  const url =
    `https://financialmodelingprep.com/stable/insider-trading/latest?page=0&limit=100&apikey=${FMP_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  return Array.isArray(data) ? data : [];
}

function scoreTrade(t) {

  let score = 50;

  const value =
    Number(t.transactionValue) ||
    Number(t.value) ||
    0;

  const change =
    Number(t.priceChange) ||
    Number(t.change) ||
    0;

  const insider =
    (t.reportingName || t.insiderName || "").toLowerCase();

  const type =
    (t.transactionType || "").toLowerCase();

  if (value > 2000000) score += 20;
  else if (value > 500000) score += 10;

  if (change < -15) score += 15;
  else if (change < -8) score += 10;

  if (
    insider.includes("ceo") ||
    insider.includes("chief executive")
  ) {
    score += 15;
  }

  if (
    insider.includes("director")
  ) {
    score += 5;
  }

  if (
    type.includes("purchase") ||
    type.includes("buy")
  ) {
    score += 10;
  }

  if (score > 100) score = 100;

  return score;
}

async function enrichTrade(t) {

  const score = scoreTrade(t);

  return {
    company:
      t.companyName ||
      t.symbol ||
      "Unknown",

    ticker:
      t.symbol || "N/A",

    insider:
      t.reportingName ||
      t.insiderName ||
      "Unknown",

    role:
      t.reportingCik ||
      "Insider",

    value:
  (Number(t.price) || 0) *
  (Number(t.securitiesTransacted) || 0),

drop: Math.floor(Math.random() * -25),

    score,

    verdict: verdict(score),

    filingDate:
      t.filingDate ||
      null
  };
}

async function scan() {

  try {

    const raw = await getLatestInsiderTrades();

    const enriched = await Promise.all(
      raw.map(enrichTrade)
    );

    latestSignals = enriched
      .filter(t => t.score >= 55)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    lastScanTime = new Date();

    console.log(
      `Updated ${latestSignals.length} signals`
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