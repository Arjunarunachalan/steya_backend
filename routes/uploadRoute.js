import { Router } from "express";
import { getSignedUrl } from "../controllers/uploadController.js";


const router = Router();


router.get("/get-signed-url", getSignedUrl);

export default router;
