import cloudinary from 'cloudinary'
import streamifier from 'streamifier'
import { env } from '~/config/environment'

// Bước cấu hình cloudinary, sử dụng v2 -version 2
const cloudinaryV2 = cloudinary.v2
cloudinaryV2.config({
  cloud_name: env.CLOUD_NAME,
  api_key: env.CLOUD_KEY,
  api_secret: env.CLOUD_SECRET
})

// Khởi tạo function để thực hiện upload file lên cloudinary
const streamUpload = (buffer, folderName, mimetype = 'image') => {
  return new Promise((resolve, reject) => {
    let resourceType = 'raw' // mặc định
    if (mimetype.startsWith('image/')) resourceType = 'image'
    else if (mimetype.startsWith('video/') || mimetype.startsWith('audio/')) resourceType = 'video'
    // Tạo 1 cái luồng stream upload lên cloudinary
    let stream = cloudinaryV2.uploader.upload_stream(
      // Khi mà khai báo folder này thì nó sẽ cho ảnh đúng folder ta cần
      {
        folder: folderName,
        resource_type: resourceType
      },
      (error, result) => {
        if (result) {
          resolve(result)
        } else {
          reject(error)
        }
      }
    )
    // Thực hiện upload luồng trên bằng lib streamifier
    streamifier.createReadStream(buffer).pipe(stream)
  })
}

export const CloudinaryProvider = { streamUpload }
