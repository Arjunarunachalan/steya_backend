import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

dotenv.config();

export function generateAccessToken(user) {
    return jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });

}
export function generateRefreshToken(user) {
    return jwt.sign(user, process.env.REFRESH_TOKEN_SECRET)
}

export function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, message: "Access token missing" });
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decodedUser) => {
        if (err)   return res.status(403).json({ success: false, message: "Invalid or expired access token" });
        req.user = decodedUser;
        next()
    })
}