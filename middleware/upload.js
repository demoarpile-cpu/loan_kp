const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const dotenv = require('dotenv');

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const documentStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'lms_documents',
    allowed_formats: ['jpg', 'png', 'pdf'],
  },
});

const avatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'lms_avatars',
    allowed_formats: ['jpg', 'png', 'jpeg'],
  },
});

const uploadDocument = multer({ storage: documentStorage });
const uploadAvatar = multer({ storage: avatarStorage });

module.exports = {
  uploadDocument,
  uploadAvatar,
  cloudinary
};
