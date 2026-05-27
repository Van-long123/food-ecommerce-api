import { GET_DB } from "~/config/mongodb";

/**
 * Tổng quan Dashboard — dùng MongoDB Aggregation để tính toán tất cả số liệu
 * trong một lần gọi DB, giảm overhead network.
 *
 * Trả về:
 *  - stats: { totalProducts, totalOrders, totalRevenue, totalCustomers, growth }
 *  - revenueChart: doanh thu 12 tháng của năm hiện tại
 *  - ordersChart: số đơn hàng 7 ngày gần nhất
 *  - topProducts: top 7 sản phẩm bán chạy nhất (kèm thông tin category, ảnh)
 *  - recentOrders: 5 đơn hàng mới nhất
 */
const getDashboardOverview = async () => {
  const db = GET_DB();
  const now = new Date();

  // Mốc tháng hiện tại và tháng trước (để tính % growth)
  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfPrevMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    0,
    23,
    59,
    59,
    999,
  );

  // Mốc 7 ngày gần nhất (cho biểu đồ đơn hàng)
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  // Mốc đầu năm (cho biểu đồ doanh thu 12 tháng)
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  // ── 1. STATS TỔNG HỢP ─────────────────────────────────────────────────────
  const [statsResult, prevMonthStats] = await Promise.all([
    // Stats tháng hiện tại + tổng
    db
      .collection("orders")
      .aggregate([
        {
          $facet: {
            totalOrders: [{ $count: "count" }],
            currentMonthOrders: [
              { $match: { createdAt: { $gte: startOfCurrentMonth } } },
              { $count: "count" },
            ],
            prevMonthOrders: [
              {
                $match: {
                  createdAt: { $gte: startOfPrevMonth, $lte: endOfPrevMonth },
                },
              },
              { $count: "count" },
            ],
            totalRevenue: [
              {
                $lookup: {
                  from: "payments",
                  localField: "_id",
                  foreignField: "orderId",
                  pipeline: [{ $match: { status: "completed" } }],
                  as: "payment",
                },
              },
              { $unwind: "$payment" },
              { $group: { _id: null, total: { $sum: "$payment.amount" } } },
            ],
            currentMonthRevenue: [
              {
                $lookup: {
                  from: "payments",
                  localField: "_id",
                  foreignField: "orderId",
                  pipeline: [
                    {
                      $match: {
                        status: "completed",
                        createdAt: { $gte: startOfCurrentMonth },
                      },
                    },
                  ],
                  as: "payment",
                },
              },
              { $unwind: "$payment" },
              { $group: { _id: null, total: { $sum: "$payment.amount" } } },
            ],
            prevMonthRevenue: [
              {
                $lookup: {
                  from: "payments",
                  localField: "_id",
                  foreignField: "orderId",
                  pipeline: [
                    {
                      $match: {
                        status: "completed",
                        createdAt: {
                          $gte: startOfPrevMonth,
                          $lte: endOfPrevMonth,
                        },
                      },
                    },
                  ],
                  as: "payment",
                },
              },
              { $unwind: "$payment" },
              { $group: { _id: null, total: { $sum: "$payment.amount" } } },
            ],
          },
        },
      ])
      .toArray(),

    // Thống kê users: tổng + tháng hiện tại + tháng trước
    db
      .collection("users")
      .aggregate([
        {
          $facet: {
            total: [{ $count: "count" }],
            currentMonth: [
              { $match: { createdAt: { $gte: startOfCurrentMonth } } },
              { $count: "count" },
            ],
            prevMonth: [
              {
                $match: {
                  createdAt: { $gte: startOfPrevMonth, $lte: endOfPrevMonth },
                },
              },
              { $count: "count" },
            ],
          },
        },
      ])
      .toArray(),
  ]);

  // Tổng sản phẩm active
  const totalProducts = await db
    .collection("products")
    .countDocuments({ deleted: false });

  // Tổng sản phẩm tháng hiện tại + tháng trước (để tính growth)
  const [currentMonthProducts, prevMonthProducts] = await Promise.all([
    db.collection("products").countDocuments({
      deleted: false,
      createdAt: { $gte: startOfCurrentMonth },
    }),
    db.collection("products").countDocuments({
      deleted: false,
      createdAt: { $gte: startOfPrevMonth, $lte: endOfPrevMonth },
    }),
  ]);

  const facet = statsResult[0] || {};
  const userFacet = prevMonthStats[0] || {};

  const totalOrders = facet.totalOrders?.[0]?.count || 0;
  const currentMonthOrders = facet.currentMonthOrders?.[0]?.count || 0;
  const prevMonthOrdersCount = facet.prevMonthOrders?.[0]?.count || 0;

  const totalRevenue = facet.totalRevenue?.[0]?.total || 0;
  const currentMonthRevenue = facet.currentMonthRevenue?.[0]?.total || 0;
  const prevMonthRevenue = facet.prevMonthRevenue?.[0]?.total || 0;

  const totalCustomers = userFacet.total?.[0]?.count || 0;
  const currentMonthCustomers = userFacet.currentMonth?.[0]?.count || 0;
  const prevMonthCustomers = userFacet.prevMonth?.[0]?.count || 0;

  // Helper tính % tăng trưởng
  const calcGrowth = (current, prev) => {
    if (!prev) return current > 0 ? 100 : 0;
    return Number((((current - prev) / prev) * 100).toFixed(1));
  };

  const stats = {
    totalProducts,
    totalOrders,
    totalRevenue,
    totalCustomers,
    growth: {
      products: calcGrowth(currentMonthProducts, prevMonthProducts),
      orders: calcGrowth(currentMonthOrders, prevMonthOrdersCount),
      revenue: calcGrowth(currentMonthRevenue, prevMonthRevenue),
      customers: calcGrowth(currentMonthCustomers, prevMonthCustomers),
    },
  };

  // ── 2. BIỂU ĐỒ DOANH THU 12 THÁNG
  const revenueByMonth = await db
    .collection("payments")
    .aggregate([
      {
        $match: {
          status: "completed",
          createdAt: { $gte: startOfYear },
        },
      },
      {
        $group: {
          _id: { month: { $month: "$createdAt" } },
          revenue: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.month": 1 } },
    ])
    .toArray();

  // Map về mảng 12 phần tử (triệu VND)
  const revenueChart = Array.from({ length: 12 }, (_, i) => {
    const found = revenueByMonth.find((r) => r._id.month === i + 1);
    return found ? Math.round(found.revenue / 1_000_000) : 0;
  });

  // ── 3. BIỂU ĐỒ ĐƠN HÀNG 7 NGÀY
  const ordersByDay = await db
    .collection("orders")
    .aggregate([
      {
        $match: { createdAt: { $gte: sevenDaysAgo } },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ])
    .toArray();

  // Tạo mảng 7 ngày (từ sevenDaysAgo đến hôm nay)
  const ordersChart = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sevenDaysAgo);
    d.setDate(sevenDaysAgo.getDate() + i);
    const found = ordersByDay.find(
      (o) =>
        o._id.year === d.getFullYear() &&
        o._id.month === d.getMonth() + 1 &&
        o._id.day === d.getDate(),
    );
    return {
      date: d.toISOString().slice(0, 10), // YYYY-MM-DD
      count: found ? found.count : 0,
    };
  });

  // ── 4. TOP 5 SẢN PHẨM BÁN CHẠY NHẤT
  const topProducts = await db
    .collection("products")
    .aggregate([
      { $match: { deleted: false, soldCount: { $gt: 0 } } },
      { $sort: { soldCount: -1 } },
      { $limit: 7 },
      {
        $lookup: {
          from: "categories",
          localField: "primary_category_id",
          foreignField: "_id",
          pipeline: [
            { $match: { deleted: false } },
            { $project: { _id: 1, title: 1 } },
          ],
          as: "category",
        },
      },
      {
        $addFields: {
          category: { $arrayElemAt: ["$category", 0] },
        },
      },
      {
        $project: {
          _id: 1,
          title: 1,
          thumbnail: 1,
          soldCount: 1,
          stock: 1,
          price: 1,
          category: { _id: 1, title: 1 },
        },
      },
    ])
    .toArray();

  // Tính doanh thu ước tính cho từng sản phẩm (soldCount * price)
  const topProductsWithRevenue = topProducts.map((p) => ({
    _id: p._id.toString(),
    title: p.title,
    thumbnail: p.thumbnail || "",
    soldCount: p.soldCount || 0,
    stock: p.stock || 0,
    price: p.price || 0,
    revenue: (p.soldCount || 0) * (p.price || 0),
    category: p.category?.title || "Chưa phân loại",
  }));

  // ── 5. 5 ĐƠN HÀNG MỚI NHẤT
  const recentOrders = await db
    .collection("orders")
    .aggregate([
      { $sort: { createdAt: -1 } },
      { $limit: 5 },
      {
        $project: {
          _id: 1,
          orderCode: 1,
          userInfo: { fullname: 1 },
          totalPrice: 1,
          status: 1,
          createdAt: 1,
        },
      },
    ])
    .toArray();

  const recentOrdersMapped = recentOrders.map((o) => ({
    _id: o._id.toString(),
    orderCode: o.orderCode
      ? `#ORD-${o.orderCode}`
      : `#${o._id.toString().slice(-6).toUpperCase()}`,
    customerName: o.userInfo?.fullname || "Khách hàng",
    totalPrice: o.totalPrice || 0,
    status: o.status || "pending",
    createdAt: o.createdAt,
  }));

  return {
    stats,
    revenueChart,
    ordersChart,
    topProducts: topProductsWithRevenue,
    recentOrders: recentOrdersMapped,
  };
};

export const dashboardService = {
  getDashboardOverview,
  getExportData,
};

// ── Export Data (dùng cho xuất Excel)
/**
 * Lấy toàn bộ dữ liệu cần thiết cho báo cáo Excel 4 sheet:
 *  1. Doanh thu theo tháng (12 tháng năm hiện tại)
 *  2. Toàn bộ đơn hàng
 *  3. Toàn bộ sản phẩm active
 *  4. Toàn bộ yêu cầu hoàn tiền
 */
async function getExportData() {
  const db = GET_DB();
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const [revenueByMonth, orders, products, refunds] = await Promise.all([
    // ── Sheet 1: Doanh thu theo tháng
    db
      .collection("payments")
      .aggregate([
        { $match: { status: "completed", createdAt: { $gte: startOfYear } } },
        {
          $group: {
            _id: { month: { $month: "$createdAt" } },
            revenue: { $sum: "$amount" },
          },
        },
        {
          $lookup: {
            from: "orders",
            let: { m: "$_id.month" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $gte: ["$createdAt", startOfYear] },
                      { $eq: [{ $month: "$createdAt" }, "$$m"] },
                    ],
                  },
                },
              },
              { $count: "total" },
            ],
            as: "orderStats",
          },
        },
        {
          $project: {
            _id: 0,
            month: "$_id.month",
            revenue: 1,
            orderCount: {
              $ifNull: [{ $arrayElemAt: ["$orderStats.total", 0] }, 0],
            },
          },
        },
        { $sort: { month: 1 } },
      ])
      .toArray(),

    // ── Sheet 2: Đơn hàng (tối đa 2000 bản ghi)
    db
      .collection("orders")
      .aggregate([
        { $sort: { createdAt: -1 } },
        { $limit: 2000 },
        {
          $project: {
            _id: 1,
            orderCode: 1,
            userInfo: { fullname: 1 },
            totalPrice: 1,
            status: 1,
            createdAt: 1,
          },
        },
      ])
      .toArray(),

    // ── Sheet 3: Sản phẩm active
    db
      .collection("products")
      .aggregate([
        { $match: { deleted: false } },
        { $sort: { soldCount: -1 } },
        {
          $lookup: {
            from: "categories",
            localField: "primary_category_id",
            foreignField: "_id",
            pipeline: [{ $project: { _id: 0, title: 1 } }],
            as: "category",
          },
        },
        {
          $project: {
            _id: 0,
            title: 1,
            price: 1,
            soldCount: { $ifNull: ["$soldCount", 0] },
            stock: { $ifNull: ["$stock", 0] },
            category: {
              $ifNull: [
                { $arrayElemAt: ["$category.title", 0] },
                "Chưa phân loại",
              ],
            },
          },
        },
      ])
      .toArray(),

    // ── Sheet 4: Hoàn tiền
    db
      .collection("refund_requests")
      .aggregate([
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: "orders",
            localField: "orderId",
            foreignField: "_id",
            pipeline: [{ $project: { _id: 0, orderCode: 1 } }],
            as: "order",
          },
        },
        {
          $project: {
            _id: 0,
            orderCode: {
              $ifNull: [{ $arrayElemAt: ["$order.orderCode", 0] }, ""],
            },
            amount: 1,
            status: 1,
            refundMethod: 1,
            reason: 1,
            createdAt: 1,
          },
        },
      ])
      .toArray(),
  ]);

  // Map month numbers → full 12 tháng (fill 0 cho tháng chưa có dữ liệu)
  const MONTH_LABELS = [
    "T1",
    "T2",
    "T3",
    "T4",
    "T5",
    "T6",
    "T7",
    "T8",
    "T9",
    "T10",
    "T11",
    "T12",
  ];
  const revenueSheet = MONTH_LABELS.map((label, i) => {
    const found = revenueByMonth.find((r) => r.month === i + 1);
    return {
      Tháng: label,
      "Doanh thu (VND)": found?.revenue || 0,
      "Số đơn hàng": found?.orderCount || 0,
    };
  });

  const STATUS_MAP = {
    pending: "Chờ xác nhận",
    confirmed: "Đã xác nhận",
    processing: "Đang xử lý",
    shipping: "Đang giao",
    delivered: "Thành công",
    cancelled: "Đã hủy",
    returned: "Trả hàng",
  };

  const REFUND_STATUS_MAP = {
    pending: "Chờ xử lý",
    approved_waiting_pickup: "Chờ lấy hàng",
    processing_refund: "Đang hoàn tiền",
    completed: "Hoàn thành",
    rejected: "Từ chối",
  };

  const ordersSheet = orders.map((o) => ({
    "Mã đơn": o.orderCode
      ? `#ORD-${o.orderCode}`
      : `#${o._id.toString().slice(-6).toUpperCase()}`,
    "Khách hàng": o.userInfo?.fullname || "Khách hàng",
    "Tổng tiền (VND)": o.totalPrice || 0,
    "Trạng thái": STATUS_MAP[o.status] || o.status,
    "Ngày tạo": o.createdAt
      ? new Date(o.createdAt).toLocaleDateString("vi-VN")
      : "",
  }));

  const productsSheet = products.map((p) => ({
    "Tên sản phẩm": p.title,
    "Danh mục": p.category,
    "Giá (VND)": p.price || 0,
    "Đã bán": p.soldCount,
    "Tồn kho": p.stock,
  }));

  const refundsSheet = refunds.map((r) => ({
    "Mã đơn": r.orderCode ? `#ORD-${r.orderCode}` : "N/A",
    "Số tiền hoàn (VND)": r.amount || 0,
    "Trạng thái": REFUND_STATUS_MAP[r.status] || r.status,
    "Phương thức":
      r.refundMethod === "bank_transfer" ? "Chuyển khoản" : "Nhận tiền mặt",
    "Lý do": r.reason || "",
    "Ngày tạo": r.createdAt
      ? new Date(r.createdAt).toLocaleDateString("vi-VN")
      : "",
  }));

  return { revenueSheet, ordersSheet, productsSheet, refundsSheet };
}
