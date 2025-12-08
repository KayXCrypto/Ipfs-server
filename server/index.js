import express from "express";
import sharp from "sharp";
import fs from "fs";
import fsp from "fs/promises";
import FormData from "form-data";
import fetch from "node-fetch";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const JWT = process.env.PINATA_JWT;
const PORT = process.env.PORT || 5000;

const app = express();
app.use(express.json());

// ---------------------------
// Safe SVG text
// ---------------------------
function escapeSvgText(s) {
    return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

// ---------------------------
// Generate Card
// ---------------------------
async function generateCard(userName, templatePath, outputPath) {
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
                .name { font-family: "Arial", sans-serif; font-size: ${fontSize}px; font-weight:700; transform-origin:${xPos}px ${yPos}px; transform: rotate(-24deg);}
                .shadow { fill:black; opacity:0.45; }
                .metal { fill:#C0C0C0; }
            </style>
            <text class="name shadow" x="${xPos}" y="${yPos + 4}">${safeName}</text>
            <text class="name metal" x="${xPos}" y="${yPos}">${safeName}</text>
        </svg>
    `;

    await sharp(templatePath)
        .composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
        .toFile(outputPath);
}

// ---------------------------
// Upload Image to Pinata
// ---------------------------
async function uploadImage(imagePath) {
    const formData = new FormData();
    formData.append("file", fs.createReadStream(imagePath));
    formData.append("network", "public");

    const res = await fetch("https://uploads.pinata.cloud/v3/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${JWT}`, ...formData.getHeaders() },
        body: formData,
    });
    const data = await res.json();
    return data.data.cid;
}

// ---------------------------
// Upload Metadata
// ---------------------------
async function uploadMetadata(imageCid, userName) {
    const metadata = {
        name: `Arc USDC Premium Card`,
        description: "Premium NFT Card On Arc Chain.",
        image: `ipfs://${imageCid}`,
        attributes: [{ trait_type: "Level", value: "1" }, { trait_type: "User", value: userName }]
    };

    const metadataPath = "./img/metadata.json";
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    const formData = new FormData();
    formData.append("file", fs.createReadStream(metadataPath));
    formData.append("network", "public");

    const res = await fetch("https://uploads.pinata.cloud/v3/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${JWT}`, ...formData.getHeaders() },
        body: formData,
    });

    const data = await res.json();
    return data.data.cid;
}

// ---------------------------
// API Endpoint
// ---------------------------
app.post("/api/mint-card", async (req, res) => {
    try {
        const { userName } = req.body;
        if (!userName) return res.status(400).json({ error: "Missing userName" });

        const imgDir = path.join(process.cwd(), "img");
        await fsp.mkdir(imgDir, { recursive: true });
        const outputPath = path.join(imgDir, `card_${userName}.png`);
        const templatePath = path.join(process.cwd(), "templates/premiumcard.png");

        console.log("⏳ Generating card...");
        await generateCard(userName, templatePath, outputPath);

        console.log("⏳ Uploading image...");
        const imageCid = await uploadImage(outputPath);

        console.log("⏳ Uploading metadata...");
        const metadataCid = await uploadMetadata(imageCid, userName);

        res.json({ imageCid, metadataCid, metadataUrl: `ipfs://${metadataCid}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error", details: err.message });
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
