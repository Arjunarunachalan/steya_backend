// backend/routes/rooms.js
import express from "express";
import multer from "multer";
import { getRoomById, getRooms, uploadRooms } from "../controllers/roomController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Use memory storage for files
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Accept multiple images
router.post("/rooms",authMiddleware,upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'thumbnail', maxCount: 1 }
]), uploadRooms);

router.get("/getrooms", getRooms);

router.get("/singleroom/:id", getRoomById);

export default router;




// // Get all rooms
// router.get('/', getAllRooms);

// // Get a specific room by ID
// router.get('/:id', getRoomById);

// // Update a room by ID
// router.put('/:id', updateRoomById);

// // Delete a room by ID
// router.delete('/:id', deleteRoomById);

// export default router;
