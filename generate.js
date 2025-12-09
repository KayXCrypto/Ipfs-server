// -------------------------------
// IMPORTS
// -------------------------------
import express from "express";
import sharp from "sharp";
import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// -------------------------------
// PINATA JWT FROM .env
// -------------------------------
const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiJhODA1ZTA4NS1lM2NlLTQ3YjMtYjgwOS04MTAzMzQwZjYwZGQiLCJlbWFpbCI6Im5ndXllbmR1Y21hbmgyMDk3QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaW5fcG9saWN5Ijp7InJlZ2lvbnMiOlt7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6IkZSQTEifSx7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6Ik5ZQzEifV0sInZlcnNpb24iOjF9LCJtZmFfZW5hYmxlZCI6ZmFsc2UsInN0YXR1cyI6IkFDVElWRSJ9LCJhdXRoZW50aWNhdGlvblR5cGUiOiJzY29wZWRLZXkiLCJzY29wZWRLZXlLZXkiOiJlNThkYzdiOWUxMDZkOTRlNzdiNSIsInNjb3BlZEtleVNlY3JldCI6ImI5N2FjMTZkMTdjZmY1MWY1NGRkYzFjYTkzNDQwOGM1MzAyMjU1YTA4ZTJiM2M4ZDU1MmM4ZjZlNWEyNzkzZDAiLCJleHAiOjE3OTY1NTAxNjJ9.EG68tWq4UBeunCQs-tA0c8AymFMvuVj3Pv4IUnYE\_0s";   // 🔥 để trong .env


// -------------------------------
// SAFE TEXT FOR SVG
// -------------------------------
function escapeSvgText(s) {
    return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}


// =====================================================
// STEP 1 — Generate personalized card (Sharp)
// =====================================================
async function generateCard(userName, templatePath, outputPath, options = {}) {
    const {
        leftRatio = 0.06,
        bottomRatio = 0.18,
        fontScale = 0.06,
        colorHex = '#C0C0C0',
        rotateDeg = 15
    } = options;

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
        </svg>
    `;

    await sharp(templatePath)
        .composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
        .toFile(outputPath);

    return outputPath;
}


// =====================================================
// STEP 2 — Upload image to Pinata
// =====================================================
async function uploadImage(imagePath) {
    const formData = new FormData();
    formData.append("file", fs.createReadStream(imagePath));
    formData.append("network", "public");

    const request = await fetch("https://uploads.pinata.cloud/v3/files", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${JWT}`,
            ...formData.getHeaders(),
        },
        body: formData,
    });

    const res = await request.json();
    return res.data.cid;
}


// =====================================================
// STEP 3 — Upload metadata JSON
// =====================================================
async function uploadMetadata(imageCid, userName) {
    const metadata = {
        name: `Arc Premium Card — ${userName}`,
        description: "Premium NFT card generated dynamically.",
        image: `ipfs://${imageCid}`,
        attributes: [
            { trait_type: "Level", value: "1" },
            { trait_type: "User", value: userName }
        ]
    };

    const metadataJson = JSON.stringify(metadata, null, 2);
    fs.writeFileSync("metadata.json", metadataJson);

    const formData = new FormData();
    formData.append("file", fs.createReadStream("./metadata.json"));
    formData.append("network", "public");

    const request = await fetch("https://uploads.pinata.cloud/v3/files", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${JWT}`,
            ...formData.getHeaders(),
        },
        body: formData,
    });

    const res = await request.json();
    return res.data.cid;
}



// =====================================================
// 📌 API ENDPOINT
// =====================================================
app.post("/api/generate", async (req, res) => {
    try {
        const { userName } = req.body;
        if (!userName) return res.status(400).json({ error: "Missing userName" });

        const output = `card_${Date.now()}.png`;
        const template = "template1.png";

        console.log("Generating card...");
        await generateCard(userName, template, output, {
            rotateDeg: -24,
            leftRatio: 0.05,
            bottomRatio: 0.35,
            fontScale: 0.025
        });

        console.log("Uploading image...");
        const imageCid = await uploadImage(output);

        console.log("Uploading metadata...");
        const metadataCid = await uploadMetadata(imageCid, userName);

        res.json({
            success: true,
            user: userName,
            imageCid,
            metadataCid,
            metadataUrl: `ipfs://${metadataCid}`
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error", detail: err.message });
    }
});



// =====================================================
// START SERVER
// =====================================================
app.listen(PORT, () => {
    console.log(`🚀 API running on PORT ${PORT}`);
});
