import multer from 'multer';
import { join } from 'path';
import { randomUUID as uuidv4 } from 'crypto';

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, join(process.cwd(), 'assets'));
    },
    filename: (req, file, cb) => {
        // Use a UUID to prevent filename collisions
        const ext = file.originalname.split('.').pop();
        cb(null, `${uuidv4()}.${ext}`);
    }
});

export const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});