export const config = {
  api: {
    bodyParser: true,
  },
};

import sharp from "sharp";
import path from "path";
import FormData from "form-data";
import fetch from "node-fetch";

const JWT = process.env.PINATA_JWT;

function escapeSvgText(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function generateCardBuffer(userName) {
  const templatePath = path.join(process.cwd(), "templates/premiumcard.png");

  const meta = await sharp(templatePath).metadata();
  const W = meta.width;
  const H = meta.height;

  const fontSize = Math.round(W * 0.025);
  const xPos = Math.round(W * 0.05);
  const yPos = Math.round(H - H * 0.35);

  const safeName = escapeSvgText(userName.toUpperCase());

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <style>
          .name { font-family: Arial; font-size: ${fontSize}px; font-weight:700; transform: rotate(-24deg);}
          .shadow { fill:black; opacity:0.45; }
          .main { fill:#C0C0C0; }
      </style>
      <text class="name shadow" x="${xPos}" y="${yPos + 4}">${safeName}</text>
      <text class="name main" x="${xPos}" y="${yPos}">${safeName}</text>
    </svg>
  `;

  return await sharp(templatePath)
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toBuffer();
}

async function uploadImageBuffer(buffer) {
  const formData = new FormData();
  formData.append("file", buffer, { filename: "card.png" });
  formData.append("network", "public");

  const res = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${JWT}`, ...formData.getHeaders() },
    body: formData,
  });

  const data = await res.json();
  console.log("UPLOAD IMAGE RESPONSE:", data);

  if (!data?.data?.cid) {
    throw new Error("Pinata image upload failed: " + JSON.stringify(data));
  }

  return data.data.cid;
}


async function uploadMetadataBuffer(imageCid, userName) {
  const metadata = {
    name: "Arc USDC Premium Card",
    description: "Premium NFT Card On Arc Chain",
    image: `ipfs://${imageCid}`,
    attributes: [
      { trait_type: "Level", value: "1" },
      { trait_type: "User", value: userName }
    ]
  };

  const buf = Buffer.from(JSON.stringify(metadata));

  const formData = new FormData();
  formData.append("file", buf, { filename: "metadata.json" });
  formData.append("network", "public");

  const res = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${JWT}`, ...formData.getHeaders() },
    body: formData,
  });

  const data = await res.json();
  console.log("UPLOAD METADATA RESPONSE:", data);

  if (!data?.data?.cid) {
    throw new Error("Pinata metadata upload failed: " + JSON.stringify(data));
  }

  return data.data.cid;
}


export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Parse JSON body manually for Vercel
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const data = JSON.parse(Buffer.concat(buffers).toString() || "{}");

    const { userName } = data;
    if (!userName) {
      return res.status(400).json({ error: "Missing userName" });
    }

    console.log("Generating card...");
    const imgBuffer = await generateCardBuffer(userName);

    console.log("Uploading image...");
    const imageCid = await uploadImageBuffer(imgBuffer);

    console.log("Uploading metadata...");
    const metadataCid = await uploadMetadataBuffer(imageCid, userName);

    return res.status(200).json({
      success: true,
      imageCid,
      metadataCid,
      metadataUrl: `ipfs://${metadataCid}`,
    });

  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
}

