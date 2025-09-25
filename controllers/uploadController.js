import { generateSignedUrls } from "../services/uploadService.js";

export const getSignedUrls = async (req, res) => {
  try {
    const { files } = req.body; // expecting array of { name, type }

    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "Files must be an array" });
    }

    const urls = await generateSignedUrls(files);

    res.json({ urls });
  } catch (err) {
    console.error("Error in getSignedUrls:", err);
    res.status(500).json({ error: "Failed to generate signed URLs" });
  }
};
