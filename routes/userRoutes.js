// routes/userRoutes.js

import express from 'express';

const router = express.Router();

// POST route to register a new user
router.post('/register', (req,res)=>{
    res.status(200).json({mesaa:"its working"})
});

export default router;
