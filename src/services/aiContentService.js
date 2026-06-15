import OpenAI from "openai";
import { env } from "~/config/environment";
import { GPT_MODEL } from "~/constants/aiConfig";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// System Prompts

const PRODUCT_SYSTEM_PROMPT = `Bạn là một chuyên gia viết nội dung sản phẩm cho ứng dụng giao đồ ăn SmartFood.

Nhiệm vụ:
Dựa vào tên món ăn được cung cấp, tạo mô tả sản phẩm hấp dẫn, tự nhiên và phù hợp SEO.

YÊU CẦU BẮT BUỘC:

1. Trả về HTML hợp lệ, chỉ được sử dụng các thẻ:

<p>, <b>, <i>, <ul>, <li>, <br>

2. Độ dài khoảng 80–120 từ.

3. Tên món ăn phải xuất hiện trong câu đầu tiên.

4. Mô tả:

* Hương vị đặc trưng.
* Thành phần nổi bật phù hợp với tên món.
* Kết cấu món ăn (mềm, giòn, đậm đà, thanh mát...).
* Cảm giác khi thưởng thức.

5. Không bịa đặt nguyên liệu hoặc công dụng không liên quan đến tên món.

6. Không sử dụng các cụm từ sáo rỗng như:
   "tuyệt vời", "đẳng cấp", "không thể bỏ qua",
   "ngon khó cưỡng", "hài lòng tuyệt đối".

7. Không sử dụng Markdown.
   Không sử dụng code block.
   Không sử dụng các thẻ ngoài danh sách cho phép.

8. Sau phần HTML, ở dòng cuối cùng sinh chính xác:
TAGS_JSON:["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8"]

YÊU CẦU TAG BẮT BUỘC:

* Gồm  8-10 tags.
* Viết bằng tiếng Việt có dấu đầy đủ.
* Viết thường, không viết hoa.
* Mỗi tag là một cụm từ ngắn từ 1–4 từ.
* Không sử dụng dấu câu trong tag.
* Không có ký tự nào khác trước hoặc sau dòng TAGS_JSON.

CẤU TRÚC TAG:

1. Tag 1–3:
   Mô tả tên sản phẩm, nguyên liệu chính hoặc đặc điểm nổi bật của món.

2. Tag 4–5:
   Mô tả nhóm thực phẩm hoặc loại món ăn.

3. Tag 6–10:
   Mô tả giá trị dinh dưỡng, chất lượng hoặc đặc điểm sức khỏe có thể suy luận hợp lý từ món ăn.

Ví dụ các tag phù hợp:

- giàu protein
- giàu chất xơ
- giàu vitamin c
- ít calo
- tốt cho sức khỏe
- thuần chay
- hải sản
- thịt bò
- trái cây
- rau củ
- nhập khẩu
- cao cấp
- hữu cơ
- chuẩn vietgap
- tươi sống
..... (có thể thêm các tag khác miễn hợp lý)

KHÔNG:
- Tạo công dụng chữa bệnh.
- Tạo lợi ích sức khỏe không hợp lý với món ăn.
- Tạo tag chung chung như:
  "ngon", "hấp dẫn", "chất lượng", "món ngon".`;

const ARTICLE_SYSTEM_PROMPT = `Bạn là một Blogger ẩm thực và sức khỏe chuyên nghiệp viết cho SmartFood.

Nhiệm vụ:
Dựa vào tiêu đề bài viết được cung cấp, tạo một bài blog hoàn chỉnh bằng HTML.

YÊU CẦU BẮT BUỘC:

1. Chỉ sử dụng các thẻ:

<h1>, <p>, <ul>, <li>, <b>, <i>, <br>

2. Bài viết phải được chia thành nhiều phần.
   Mỗi phần bắt đầu bằng một thẻ <h1> rồi đến nội dung tương ứng.

Ví dụ cấu trúc:

<h1>...</h1>
<p>...</p>

<h1>...</h1>
<ul>
<li>...</li>
</ul>

<h1>...</h1>
<p>...</p>

3. Số lượng tiêu đề và bố cục:
   BẮT BUỘC bài viết phải có ít nhất 4-6 thẻ <h1> làm tiêu đề cho các phần.
   Mỗi thẻ <h1> phải được theo sau bởi nhiều đoạn văn <p> phân tích chuyên sâu, giải thích cặn kẽ chi tiết (Why & How).
   Không được viết hời hợt vài dòng rồi chuyển ý.

4. Bắt buộc chèn chính xác đoạn HTML sau tại một vị trí phù hợp trong bài viết (ví dụ sau phần mở đầu):

<p style="text-align: center; color: #888; border: 1px dashed #ccc; padding: 10px;"><i>[Gợi ý: Admin click vào đây để upload và chèn hình ảnh minh họa]</i></p>

5. Nội dung YÊU CẦU ĐỘ SÂU VÀ CHI TIẾT CAO:

* Đây là một bài Blog chuẩn SEO cực kỳ chuyên sâu để mang lại giá trị cho người đọc. KHÔNG ĐƯỢC VIẾT NGẮN.
* Triển khai chi tiết từng luận điểm. Có mở bài dẫn dắt, thân bài (chia nhiều mục nhỏ phân tích kỹ), và kết luận đúc kết.
* Văn phong cuốn hút, mang tính chuyên gia. Cần giải thích rõ lý do khoa học, mẹo vặt thực tế hoặc kinh nghiệm thực tiễn.
* TUYỆT ĐỐI KHÔNG viết theo kiểu chỉ gạch đầu dòng ngắn ngủn. Mỗi ý phải có đoạn văn (thẻ <p>) dài diễn giải chi tiết ít nhất 3-4 câu.

6. ĐỘ DÀI: Tối thiểu 800 - 1200 chữ. Phải viết thật dài, chi tiết và tâm huyết!

7. Không sử dụng Markdown.
   Không sử dụng code block.
   Không sử dụng các thẻ HTML ngoài danh sách cho phép.

8. TRẢ VỀ CHÍNH XÁC THEO ĐỊNH DẠNG SAU BẮT BUỘC (GỒM 3 PHẦN RIÊNG BIỆT):

SHORT_DESC:
[Viết tóm tắt ngắn / mở đầu bài viết, khoảng 30-50 từ, viết bằng chữ thuần (plain text), tuyệt đối KHÔNG có thẻ HTML]

CONTENT:
[Toàn bộ nội dung bài viết chi tiết được định dạng bằng HTML như yêu cầu trên]

TAGS_JSON:
["tag1","tag2","tag3"]

YÊU CẦU TAG BẮT BUỘC:
* Gồm từ 2 đến 3 từ khóa.
* Viết bằng tiếng Việt CÓ DẤU đầy đủ (VD: "ẩm thực", "sức khỏe", "dinh dưỡng").
* Mỗi tag là một cụm từ ngắn (1–3 từ), CÓ KHOẢNG CÁCH giữa các từ, KHÔNG viết liền (KHÔNG viết: "amthuc", "suckhoe").
* Viết thường, không viết hoa.
* Phù hợp SEO, liên quan trực tiếp đến chủ đề bài viết.
* Không có ký tự nào khác trước hoặc sau dòng TAGS_JSON.`;

const CATEGORY_SYSTEM_PROMPT = `Bạn là chuyên gia quản lý danh mục sản phẩm cho ứng dụng gọi món SmartFood.
Nhiệm vụ: Dựa vào tên danh mục, sinh ra 2 thứ riêng biệt:

1. BADGE_TEXT: Một nhãn hiển thị rất ngắn gọn (2–4 từ), bắt mắt, mang tính mời gọi. VD: "Siêu hot", "Mới về", "Bán chạy".
2. DESCRIPTION: Một đến hai câu mô tả thuần text (không có thẻ HTML), tối đa 30 chữ, giải thích nhanh danh mục bán gì hoặc mang lại trải nghiệm gì.

Trả về ĐÚNG định dạng JSON sau, không thêm gì khác:
{"badge": "...", "description": "..."}`;

/**
 * "Tại sao ta không bắt AI của Product và Article trả về JSON chứa các thuộc tính giống hệt như Category (ví dụ: {"description": "...", "tags": [...]}), rồi dùng JSON.parse một phát là xong, việc gì phải khổ sở viết Regex?"
 * Lý do cực kỳ thực tế là: AI sẽ viết sai cú pháp JSON khi giá trị bên trong chứa đoạn mã HTML dài.
 */
/**
 * Tách phần HTML và TAGS_JSON từ response của product
 */
const parseHtmlAndTags = (raw) => {
  // Tìm chuỗi JSON mảng tags ở cuối văn bản
  // (...) (Ngoặc tròn) Là nhóm bắt dữ liệu (Capturing Group 1). Những gì nằm trong ngoặc này sẽ được trích xuất riêng ra để chúng ta lấy sử dụng (chính là mảng tagsMatch[1]).
  const tagsMatch = raw.match(/TAGS_JSON:\s*(\[.*?\])/s);
  // Chuyển chuỗi tags thành mảng JS thực tế
  const tags = tagsMatch ? JSON.parse(tagsMatch[1]) : [];
  // Cắt bỏ phần tags, giữ lại mô tả HTML
  const html = raw.replace(/TAGS_JSON:\s*\[.*?\]/s, "").trim();
  // Loại bỏ các ký tự code block ``` nếu AI tự ý bọc Markdown
  const cleanHtml = html
    .replace(/^```(?:html)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
  return { html: cleanHtml, tags };
};

/**
 * Tách SHORT_DESC, CONTENT, và TAGS_JSON từ response của article
 */
const parseArticleResponse = (raw) => {
  // Trích xuất mảng JSON tags ở cuối văn bản
  const tagsMatch = raw.match(/TAGS_JSON:\s*(\[.*?\])/s);
  const tags = tagsMatch ? JSON.parse(tagsMatch[1]) : [];

  let shortDescription = "";
  let content = "";

  // Bóc tách mô tả ngắn nằm giữa SHORT_DESC: và CONTENT:
  const shortDescMatch = raw.match(/SHORT_DESC:\s*([\s\S]*?)CONTENT:/s);
  if (shortDescMatch) {
    shortDescription = shortDescMatch[1].trim();
  }

  // Bóc tách nội dung HTML bài viết nằm giữa CONTENT: và TAGS_JSON:
  const contentMatch = raw.match(/CONTENT:\s*([\s\S]*?)TAGS_JSON:/s);
  if (contentMatch) {
    content = contentMatch[1].trim();
  } else {
    // Fallback: Nếu AI viết sai định dạng, tự cắt bỏ phần mở đầu và tags
    content = raw
      .replace(/SHORT_DESC:[\s\S]*?CONTENT:/s, "")
      .replace(/TAGS_JSON:\s*\[.*?\]/s, "")
      .trim();
  }

  // Loại bỏ các ký tự code block ``` nếu AI tự ý bọc Markdown
  const cleanContent = content
    .replace(/^```(?:html)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  return { shortDescription, content: cleanContent, tags };
};

//  Core Generator

/**
 * Sinh nội dung tự động bằng AI dựa trên title và type
 * @param {string} title - Tiêu đề / Tên món / Tên danh mục
 * @param {'product' | 'article' | 'category'} type
 * @returns {Promise<{ description?: string, content?: string, tags?: string[], badge?: string }>}
 */
const generateContent = async (title, type) => {
  const promptMap = {
    product: PRODUCT_SYSTEM_PROMPT,
    article: ARTICLE_SYSTEM_PROMPT,
    category: CATEGORY_SYSTEM_PROMPT,
  };

  const systemPrompt = promptMap[type];
  if (!systemPrompt) {
    throw new Error(
      `Loại nội dung không hợp lệ: "${type}". Chỉ chấp nhận: product, article, category.`,
    );
  }

  const response = await openai.chat.completions.create({
    model: GPT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Tiêu đề: ${title}` },
    ],
    temperature: 0.7,
  });

  const raw = response.choices[0].message.content.trim();

  if (type === "category") {
    // Category trả về JSON thuần
    const parsed = JSON.parse(raw);
    return {
      badge: parsed.badge ?? "",
      description: parsed.description ?? "",
    };
  }

  if (type === "product") {
    const { html, tags } = parseHtmlAndTags(raw);
    return { description: html, tags };
  }

  // Article: trả về shortDescription, content (HTML) + tags
  const parsedArticle = parseArticleResponse(raw);
  return parsedArticle;
};

export const aiContentService = {
  generateContent,
};
