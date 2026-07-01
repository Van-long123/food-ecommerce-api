import { StatusCodes } from "http-status-codes";

const checkHealth = async (req, res, next) => {
  try {
    res.status(StatusCodes.OK).json({
      status: 'OK',
      timestamp: Date.now()
    });
  } catch (error) {
    next(error);
  }
};

export const healthController = {
  checkHealth
};
