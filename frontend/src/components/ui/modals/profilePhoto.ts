const PROFILE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_PROFILE_IMAGE_DATA_LENGTH = 650_000

export const resizeProfilePhoto = (photo: File) =>
  new Promise<string>((resolve, reject) => {
    if (!PROFILE_IMAGE_TYPES.has(photo.type)) {
      reject(new Error('Choose a JPG, PNG, or WEBP image.'))
      return
    }
    if (photo.size > MAX_PROFILE_IMAGE_BYTES) {
      reject(new Error('Profile images must be 5 MB or smaller.'))
      return
    }
    const reader = new FileReader()
    reader.addEventListener('error', () =>
      reject(new Error('The selected image could not be read.')),
    )
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('The selected image could not be read.'))
        return
      }
      const image = new Image()
      image.addEventListener('error', () =>
        reject(new Error('The selected file is not a valid image.')),
      )
      image.addEventListener('load', () => {
        const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('The image could not be prepared for upload.'))
          return
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        const avatarUrl = canvas.toDataURL('image/webp', 0.82)
        if (avatarUrl.length > MAX_PROFILE_IMAGE_DATA_LENGTH) {
          reject(new Error('The processed profile image is still too large.'))
          return
        }
        resolve(avatarUrl)
      })
      image.src = reader.result
    })
    reader.readAsDataURL(photo)
  })
