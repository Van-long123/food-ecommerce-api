import { settingsGeneralModel } from "~/models/settingsGeneralModel";
import { CloudinaryProvider } from "~/providers/CloudinaryProvider";

const getSettings = async () => {
  try {
    const settings = await settingsGeneralModel.getSettings();
    if (!settings) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        "Không tìm thấy cài đặt website!",
      );
    }
    return settings;
  } catch (error) {
    throw error;
  }
};

const updateSettings = async (reqBody, file = null) => {
  try {
    const updatePayload = { ...reqBody };

    // If a new logo file was uploaded, stream it to Cloudinary and overwrite
    if (file) {
      const uploadResult = await CloudinaryProvider.streamUpload(
        file.buffer,
        "smartfood-settings",
        file.mimetype,
      );
      updatePayload.logo = uploadResult.secure_url;
    }

    // Kiểm tra tính hợp lệ bằng Joi trước khi lưu trữ (loại bỏ các khóa không xác định, áp dụng các giá trị mặc định)
    const { error, value: validData } =
      settingsGeneralModel.SETTINGS_GENERAL_COLLECTION_SCHEMA.validate(
        updatePayload,
        { abortEarly: false, allowUnknown: false, stripUnknown: true }, //stripUnknown: true → tự động xóa các field không được định nghĩa trong schema
      );
    if (error) throw error;

    const result = await settingsGeneralModel.updateSettings(validData);
    return result;
  } catch (error) {
    throw error;
  }
};

export const settingsGeneralService = {
  getSettings,
  updateSettings,
};
