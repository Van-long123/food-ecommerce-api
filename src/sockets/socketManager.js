/**
 * socketManager.js
 * Module quản lý Socket.IO instance duy nhất cho toàn bộ ứng dụng.
 * Cung cấp:
 *  - initSocket(httpServer): Khởi tạo io từ httpServer + gắn CORS tái sử dụng corsOptions
 *  - getIO():                Lấy io instance từ bất kỳ đâu trong app (service, job...)
 *  - emitToUser(userId, event, payload): Emit event đến một userId cụ thể
 */

import { Server } from 'socket.io'
import { corsOptions } from '~/config/cors'

// Các event name — nguồn sự thật duy nhất, FE sẽ dùng cùng tên
export const SOCKET_EVENTS = {
  ORDER_STATUS_UPDATED: 'ORDER_STATUS_UPDATED',
  REFUND_STATUS_UPDATED: 'REFUND_STATUS_UPDATED',
}

/** io instance — private, chỉ truy cập qua getIO() */
let io = null

/**
 * Map lưu trữ ánh xạ userId → Set<socketId>
 * Dùng Set để một user có thể mở nhiều tab cùng lúc */
const userSocketMap = new Map()

/**
 * Khởi tạo Socket.IO server.
 * Phải được gọi một lần duy nhất trong server.js sau khi tạo httpServer. */
const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      // Tái sử dụng hàm origin đã có trong corsOptions — không duplicate logic
      origin: corsOptions.origin,
      credentials: corsOptions.credentials,
    },
    // Chỉ dùng websocket, tắt polling để giảm overhead
    transports: ['websocket', 'polling'],
  })

  io.on('connection', (socket) => {
    // Client phải gửi userId khi kết nối để server nhận biết danh tính
    const userId = socket.handshake.query?.userId
    const role = socket.handshake.query?.role

    if (role === 'admin') {
      socket.join('admins')
      console.log(`[Socket] User ${userId} joined room: admins`)
    }

    if (userId && typeof userId === 'string') {
      // Thêm socket vào map của user
      if (!userSocketMap.has(userId)) {
        userSocketMap.set(userId, new Set())
      }
      userSocketMap.get(userId).add(socket.id)
      console.log(`[Socket] User ${userId} connected | socketId: ${socket.id} | Total sockets for user: ${userSocketMap.get(userId).size}`)
    } else {
      console.log(`[Socket] Anonymous connection | socketId: ${socket.id}`)
    }

    socket.on('disconnect', (reason) => {
      if (userId) {
        const sockets = userSocketMap.get(userId)
        if (sockets) {
          sockets.delete(socket.id)
          // Nếu user không còn socket nào thì xóa khỏi map để tiết kiệm bộ nhớ
          if (sockets.size === 0) {
            userSocketMap.delete(userId)
            console.log(`[Socket] User ${userId} fully disconnected`)
          } else {
            console.log(`[Socket] User ${userId} | socketId ${socket.id} disconnected | Remaining: ${sockets.size}`)
          }
        }
      }
    })
  })

  console.log('[Socket] Socket.IO server initialized.')
  return io
}

/**
 * Lấy io instance. Ném lỗi nếu chưa được khởi tạo (guard clause). */
const getIO = () => {
  if (!io) {
    throw new Error('[Socket] Socket.IO chưa được khởi tạo. Hãy gọi initSocket(httpServer) trước.')
  }
  return io
}

/**
 * Emit event tới tất cả các admin online
 */
const emitToAdmins = (event, payload) => {
  if (!io) return
  io.to('admins').emit(event, payload)
  console.log(`[Socket] Emitted "${event}" to admins | payload:`, payload)
}

/**
 * Emit một sự kiện đến tất cả các socket đang kết nối của một userId.
 * Được gọi từ Service/Job sau khi update DB thành công.
 * @param {string} userId - MongoDB _id string của user
 * @param {string} event  - Tên event (dùng SOCKET_EVENTS constants)
 * @param {object} payload - Dữ liệu đính kèm
 */
const emitToUser = (userId, event, payload) => {
  if (!io) {
    console.warn('[Socket] IO chưa sẵn sàng, bỏ qua emit.')
    return
  }

  const socketIds = userSocketMap.get(String(userId))
  if (!socketIds || socketIds.size === 0) {
    console.log(`[Socket] User ${userId} không online. Bỏ qua emit event "${event}".`)
    return
  }

  socketIds.forEach((socketId) => {
    io.to(socketId).emit(event, payload)
  })

  console.log(`[Socket] Emitted "${event}" to user ${userId} (${socketIds.size} socket(s)) | payload:`, payload)
}

export const socketManager = {
  initSocket,
  getIO,
  emitToUser,
  emitToAdmins,
  SOCKET_EVENTS,
}
