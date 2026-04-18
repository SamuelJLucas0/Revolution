import express from "express";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: "10mb" }));

const upload = multer();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

//
// 🧠 HELPERS
//

function extractSchema(obj) {
  const schema = {};
  for (const key in obj) {
    schema[key] = typeof obj[key];
  }
  return schema;
}

function validateSchema(obj, schema) {
  for (const key in schema) {
    if (!(key in obj)) return false;
    if (typeof obj[key] !== schema[key]) return false;
  }
  return true;
}

// 🔥 SOLUCIÓN DEFINITIVA PARA LA IA
function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No se encontró JSON en la respuesta");
  return match[0];
}

//
// 📸 1. ANALYZE IMAGES
//
app.post(
  "/analyze-images",
  upload.fields([
    { name: "image1", maxCount: 1 },
    { name: "image2", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const file1 = req.files["image1"]?.[0];
      const file2 = req.files["image2"]?.[0];
      const exampleRaw = req.body.example;

      if (!file1 || !file2 || !exampleRaw) {
        return res.status(400).json({
          error: "Debes enviar image1, image2 y example"
        });
      }

      const example = JSON.parse(exampleRaw);
      const schema = extractSchema(example);

      const image1 = file1.buffer.toString("base64");
      const image2 = file2.buffer.toString("base64");

      const result = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `
Devuelve SOLO JSON con EXACTAMENTE esta estructura:

${JSON.stringify(example, null, 2)}

Reglas:
- Mismos campos
- Mismos tipos
- NO agregues ni elimines propiedades
- Puedes estimar valores
                `
              },
              {
                inlineData: {
                  mimeType: file1.mimetype,
                  data: image1,
                },
              },
              {
                inlineData: {
                  mimeType: file2.mimetype,
                  data: image2,
                },
              },
            ],
          },
        ],
      });

      // 🔥 LIMPIEZA SEGURA
      const clean = extractJSON(result.text);
      const parsed = JSON.parse(clean);

      if (!validateSchema(parsed, schema)) {
        throw new Error("La respuesta no coincide con el schema");
      }

      res.json(parsed);

    } catch (err) {
      res.status(500).json({
        error: "Error procesando imágenes",
        detalle: err.message
      });
    }
  }
);

//
// 📊 2. ANALYZE BUS
//
app.post("/analyze-bus", async (req, res) => {
  const { dataset } = req.body;

  if (!Array.isArray(dataset) || dataset.length === 0) {
    return res.status(400).json({
      error: "Dataset inválido"
    });
  }

  const schema = extractSchema(dataset[0]);

  for (const item of dataset) {
    if (!validateSchema(item, schema)) {
      return res.status(400).json({
        error: "Dataset inconsistente"
      });
    }
  }

  try {
    const result = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `
Analiza este dataset de ocupación de autobús.

Regla:
- Más de 45 personas = lleno

Devuelve SOLO JSON:

{
  "promedio": number,
  "maximo": number,
  "lleno": boolean,
  "analisis": string
}

Dataset:
${JSON.stringify(dataset)}
              `
            }
          ],
        },
      ],
    });

    // 🔥 AQUÍ ESTÁ LA MAGIA
    const clean = extractJSON(result.text);
    const parsed = JSON.parse(clean);

    res.json(parsed);

  } catch (err) {
    res.status(500).json({
      error: "Error analizando dataset",
      detalle: err.message
    });
  }
});

//
// 🧪 HEALTH CHECK
//
app.get("/", (req, res) => {
  res.send("API funcionando 🚀");
});

//
// 🌐 SERVER (Cloud Run usa 8080)
//
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});