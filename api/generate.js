
import sharp from "sharp";
import FormData from "form-data";
import fetch from "node-fetch";

const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiJhODA1ZTA4NS1lM2NlLTQ3YjMtYjgwOS04MTAzMzQwZjYwZGQiLCJlbWFpbCI6Im5ndXllbmR1Y21hbmgyMDk3QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaW5fcG9saWN5Ijp7InJlZ2lvbnMiOlt7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6IkZSQTEifSx7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6Ik5ZQzEifV0sInZlcnNpb24iOjF9LCJtZmFfZW5hYmxlZCI6ZmFsc2UsInN0YXR1cyI6IkFDVElWRSJ9LCJhdXRoZW50aWNhdGlvblR5cGUiOiJzY29wZWRLZXkiLCJzY29wZWRLZXlLZXkiOiJlNThkYzdiOWUxMDZkOTRlNzdiNSIsInNjb3BlZEtleVNlY3JldCI6ImI5N2FjMTZkMTdjZmY1MWY1NGRkYzFjYTkzNDQwOGM1MzAyMjU1YTA4ZTJiM2M4ZDU1MmM4ZjZlNWEyNzkzZDAiLCJleHAiOjE3OTY1NTAxNjJ9.EG68tWq4UBeunCQs-tA0c8AymFMvuVj3Pv4IUnYE\_0s";

function escapeSvgText(s) {
  return String(s)
    .replaceAll('&amp;', '&amp;amp;')
    .replaceAll('&lt;', '&amp;lt;')
    .replaceAll('&gt;', '&amp;gt;')
    .replaceAll('"', '&amp;quot;')
    .replaceAll("'", '&amp;apos;');
}

async function composeCardBuffer(userName, templatePath, opts = {}) {
  const {
    leftRatio = 0.06,
    bottomRatio = 0.18,
    fontScale = 0.06,
    colorHex = '#C0C0C0',
    rotateDeg = 15
  } = opts;

  const meta = await sharp(templatePath).metadata();
  const W = meta.width;
  const H = meta.height;
  const fontSize = Math.round(W * fontScale);
  const xPos = Math.round(W * leftRatio);
  const yPos = Math.round(H - H * bottomRatio);
  const safeName = escapeSvgText(userName.toUpperCase());

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <style>
      .name {
        font-family: "Arial", sans-serif;
        font-size: ${fontSize}px;
        font-weight: 700;
        letter-spacing: 4px;
        transform-origin: ${xPos}px ${yPos}px;
        transform: rotate(${rotateDeg}deg);
      }
      .shadow { fill: black; opacity: 0.45; }
      .metal { fill: ${colorHex}; }
    </style>
    <text class="name shadow" x="${xPos}" y="${yPos + 4}">${safeName}</text>
    <text class="name metal" x="${xPos}" y="${yPos}">${safeName}</text>
  </svg>`;

  const cardBuf = await sharp(templatePath)
    .composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
    .png()
    .toBuffer();

  return cardBuf;
}

async function uploadBufferToPinata(buffer, filename, contentType) {
  const formData = new FormData();
  formData.append("file", buffer, { filename, contentType });
  formData.append("network", "public");

  const req = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${JWT}`,
      ...formData.getHeaders(),
    },
    body: formData,
  });

  const res = await req.json();
  if (!req.ok) {
    throw new Error(`Pinata error: ${req.status} ${JSON.stringify(res)}`);
  }
  return res.data.cid;
}

export default async function handler(req, res) {
  try {
    const method = req.method || 'GET';
    const payload = method === 'POST' ? req.body : req.query;
    const userName = payload?.userName;

    if (!JWT) return res.status(500).json({ error: "Missing JWT env var" });
    if (!userName) return res.status(400).json({ error: "Missing userName" });

    const templatePath = "public/premiumcard.png"; // đặt template ở đây

    const cardBuffer = await composeCardBuffer(userName, templatePath, {
      rotateDeg: -24, leftRatio: 0.05, bottomRatio: 0.35, fontScale: 0.025
    });

    const imageCid = await uploadBufferToPinata(cardBuffer, `card_${userName}.png`, "image/png");

    const metadata = {
      name: `Arc Premium Card — ${userName}`,
      description: "Premium NFT card generated dynamically.",
      image: `ipfs://${imageCid}`,
      attributes: [
        { trait_type: "Level", value: "1" },
        { trait_type: "User", value: userName }
      ]
    };

    const metaBuffer = Buffer.from(JSON.stringify(metadata));
    const metadataCid = await uploadBufferToPinata(metaBuffer, "metadata.json", "application/json");

    res.status(200).json({
      ok: true,
      imageCid,
      metadataCid,
      metadataUrl: `ipfs://${metadataCid}`,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
