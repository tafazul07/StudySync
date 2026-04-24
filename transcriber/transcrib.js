 

import axios from "axios";
import fs from "fs-extra";

const baseUrl = process.env.BASED_URL;

const headers = {
  authorization: process.env.ASSEMBLYAI_API_KEY,
};

if (!headers.authorization) {
  console.error("Error: ASSEMBLYAI_API_KEY is not set. Please provide it as an environment variable.");
  process.exit(1);
}

let audioUrl;
const filePath = process.argv[2];

if (filePath) {
  console.log(`Reading and uploading ${filePath}...`);
  const audioData = await fs.readFile(filePath);
  const uploadResponse = await axios.post(`${baseUrl}/v2/upload`, audioData, {
    headers,
  });
  audioUrl = uploadResponse.data.upload_url;
} else {
  console.log("No file path provided. Using default URL.");
  audioUrl = "https://assembly.ai/wildfires.mp3";
}

const data = {
  audio_url: audioUrl,
  "language_detection": true,
  // Uses universal-3-pro for en, es, de, fr, it, pt. Else uses universal-2 for support across all other languages
  "speech_models": ["universal-3-pro", "universal-2"]
};

try {
  const url = `${baseUrl}/v2/transcript`;
  const response = await axios.post(url, data, { headers: headers });

  const transcriptId = response.data.id;
  const pollingEndpoint = `${baseUrl}/v2/transcript/${transcriptId}`;

  while (true) {
    const pollingResponse = await axios.get(pollingEndpoint, {
      headers: headers,
    });
    const transcriptionResult = pollingResponse.data;

    if (transcriptionResult.status === "completed") {
      console.log(transcriptionResult.text);
      break;
    } else if (transcriptionResult.status === "error") {
      throw new Error(`Transcription failed: ${transcriptionResult.error}`);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
} catch (error) {
  console.error("An error occurred:", error.message);
}
