# SmartFood — Backend API & AI Service

<p align="center">
	<b>Hệ thống API RESTful và dịch vụ AI Chatbot cho nền tảng thương mại điện tử thực phẩm sạch</b><br/>
	Dự án Tốt nghiệp (DATN)
</p>

<p align="center">
	<img src="https://img.shields.io/badge/Node.js-Express-339933?logo=nodedotjs&logoColor=white" alt="Node.js" />
	<img src="https://img.shields.io/badge/MongoDB-Vector_Search-47A248?logo=mongodb&logoColor=white" alt="MongoDB" />
	<img src="https://img.shields.io/badge/OpenAI-GPT--4o--mini-412991?logo=openai&logoColor=white" alt="OpenAI" />
	<img src="https://img.shields.io/badge/Redis-Caching-DC382D?logo=redis&logoColor=white" alt="Redis" />
	<img src="https://img.shields.io/badge/Socket.IO-Real--time-010101?logo=socket.io&logoColor=white" alt="Socket.io" />
</p>

---

## 📑 Mục lục

- [🎯 Giới thiệu dự án](#-giới-thiệu-dự-án)
- [✨ Tính năng cốt lõi & AI](#-tính-năng-cốt-lõi--ai)
- [🧱 Kiến trúc Backend & Công nghệ](#-kiến-trúc-backend--công-nghệ)
- [⚙️ Hướng dẫn cài đặt](#️-hướng-dẫn-cài-đặt)
- [🗂️ Liên kết các Repository](#️-liên-kết-các-repository)

---

## 🎯 Giới thiệu dự án

Đây là repository chứa mã nguồn **Backend API** của dự án SmartFood. Hệ thống cung cấp các RESTful API phục vụ cho cả ứng dụng khách hàng (Client) và quản trị viên (Admin). Đặc biệt, backend này tích hợp trực tiếp với OpenAI để cung cấp dịch vụ AI Agent Chatbot thông minh dựa trên dữ liệu thực tế của cửa hàng.

---

## ✨ Tính năng cốt lõi & AI

### 🤖 AI Chatbot & Dịch vụ Thông minh (OpenAI + RAG)
- **OpenAI Integration:** Sử dụng model `gpt-4o-mini`.
- **Function Calling:** Bot có khả năng tự động trích xuất thông tin (Mã đơn hàng, voucher, v.v.) và gọi các hàm tương ứng để truy vấn cơ sở dữ liệu theo thời gian thực.
- **RAG Pipeline (Retrieval-Augmented Generation):** Kết hợp MongoDB Atlas Vector Search để tìm kiếm ngữ nghĩa và Redis để cache kết quả, giúp bot trả lời chính xác các câu hỏi về sản phẩm của cửa hàng.
- **AI Content Generator & Moderation:** Sử dụng AI để tự động tạo nội dung (bài viết, mô tả sản phẩm) và tự động kiểm duyệt đánh giá (Review Moderation) của người dùng.
- **SSE (Server-Sent Events):** Stream phản hồi của Chatbot về phía Client theo thời gian thực (real-time streaming) để tối ưu trải nghiệm tương tác.

### 🛍️ Dịch vụ Thương mại điện tử
- **Quản lý Sản phẩm & Danh mục:** Đầy đủ các API CRUD, hỗ trợ phân trang, lọc, tìm kiếm.
- **Thanh toán:** Tích hợp Webhook của cổng thanh toán **PayOS** để xử lý giao dịch chuyển khoản VietQR tự động.
- **Vận chuyển:** Tích hợp API **Giao Hàng Nhanh (GHN)** để tính toán phí ship.
- **Đơn hàng:** Quản lý vòng đời đơn hàng và giỏ hàng.
- **Voucher & Khuyến mãi:** Quản lý mã giảm giá với nhiều điều kiện áp dụng linh hoạt.

### 🔐 Xác thực & Phân quyền (Auth/RBAC)
- Xác thực bằng **JWT** (JSON Web Token).
- Tích hợp **Passport.js** hỗ trợ đăng nhập xã hội qua **Google** và **Facebook**.
- Phân quyền theo Role-Based Access Control (RBAC): Admin, User.

### ⚡ Real-time & Khác
- **Socket.IO (Real-Time Order Tracking):** Cập nhật trạng thái đơn hàng theo thời gian thực cho Khách hàng khi Admin hoặc hệ thống thay đổi trạng thái, không cần tải lại trang.
- **Cloudinary:** Dịch vụ lưu trữ và tối ưu hóa hình ảnh sản phẩm.
- **Nodemailer:** Xử lý gửi email xác thực, quên mật khẩu và biên lai giao hàng.

---

## 🧱 Kiến trúc Backend & Công nghệ

- **Core:** Node.js, Express.js 5
- **Database:** MongoDB (Mongoose ODM)
- **Caching & Data Structure:** Redis
- **Authentication:** JWT, Passport.js (Google/Facebook OAuth2)
- **AI & ML:** OpenAI SDK, MongoDB Vector Search
- **Real-time:** Socket.IO, Server-Sent Events (SSE)
- **Storage:** Cloudinary
- **Validation:** Joi

---

## 🗂️ Liên kết các Repository

Hệ thống được chia làm 3 repository riêng biệt. *(Bạn đang ở repository Backend)*:

- **Frontend (Web):** [https://github.com/Van-long123/fresh-food-web](https://github.com/Van-long123/fresh-food-web)
- **Backend (API):** [https://github.com/Van-long123/food-ecommerce-api](https://github.com/Van-long123/food-ecommerce-api)
- **Recommendation Service:** [https://github.com/Van-long123/food-recommendation-service](https://github.com/Van-long123/food-recommendation-service)

---

## ⚙️ Hướng dẫn cài đặt (Backend)

### 1) Yêu cầu môi trường
- Node.js 20+
- MongoDB (Atlas hoặc Local)
- Redis Server (Local hoặc Cloud)

### 2) Cài đặt project
```bash
git clone https://github.com/Van-long123/food-ecommerce-api.git
cd food-ecommerce-api
npm install
```

### 3) Cấu hình biến môi trường
Tạo file `.env` tại thư mục gốc và cung cấp các giá trị:
```env
PORT=8017
MONGODB_URI=your_mongodb_connection_string
REDIS_URL=your_redis_connection_string
JWT_SECRET=your_jwt_secret
OPENAI_API_KEY=your_openai_api_key

# Thêm các cấu hình PayOS, GHN, Cloudinary, Google, Facebook...
```

### 4) Khởi chạy dự án
```bash
# Chế độ phát triển (Development)
npm run dev

# Chế độ sản phẩm (Production)
npm start
```
API sẽ chạy tại: `http://localhost:8017`

---
