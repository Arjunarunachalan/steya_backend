// backend/routes/rooms.js
import express from "express";
import multer from "multer";
import { addFavorite, checkFavorite, getFavoriteCount, getMyFavorites, getRoomById, getRooms, removeFavorite, toggleFavorite, updateRoom, uploadRooms } from "../controllers/roomController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { incrementRoomView } from "../controllers/roomController.js";
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
router.post("/:roomId/view", incrementRoomView);

router.post('/add', authMiddleware, addFavorite);

// ✅ REMOVE FROM FAVORITES
router.delete('/remove', authMiddleware, removeFavorite);

router.put('/update/:roomId', authMiddleware,upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'thumbnail', maxCount: 1 }
]), updateRoom);


// ✅ TOGGLE FAVORITE (Add/Remove in one endpoint)
router.post('/toggle', authMiddleware, toggleFavorite);

// ✅ GET USER'S FAVORITES
router.get('/my-favorites', authMiddleware, getMyFavorites);

// ✅ CHECK IF ROOM IS FAVORITED
router.get('/check/:roomId', authMiddleware, checkFavorite);

// ✅ GET FAVORITE COUNT FOR A ROOM
router.get('/count/:roomId', getFavoriteCount);



export default router;


